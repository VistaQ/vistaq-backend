import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import { join } from 'path';

interface IRoute {
  httpApi: { method: string; path: string; authorizer?: { name: string } };
}

interface ITable {
  Properties: {
    KeySchema: { AttributeName: string; KeyType: string }[];
    GlobalSecondaryIndexes?: {
      IndexName: string;
      KeySchema: { AttributeName: string; KeyType: string }[];
    }[];
  };
}

interface IServerlessConfig {
  provider: { environment: Record<string, unknown> };
  functions: { api: { events: IRoute[] } };
  resources: {
    Resources: {
      UserPool: { Properties: Record<string, unknown> };
      UserPoolClient: { Properties: Record<string, unknown> };
      UsersTable: ITable;
      AgentCodesTable: ITable;
      GroupTrainersTable: ITable;
      PointTransactionsTable: {
        Properties: {
          GlobalSecondaryIndexes: {
            IndexName: string;
            KeySchema: { AttributeName: string; KeyType: string }[];
          }[];
        };
      };
    };
  };
}

const config = load(
  readFileSync(join(__dirname, '../../serverless.yml'), 'utf8'),
) as IServerlessConfig;

const routes = config.functions.api.events;
const label = (route: IRoute): string =>
  `${route.httpApi.method} ${route.httpApi.path}`;

describe('serverless.yml function environment', () => {
  it('runs every deployed stage as production so helmet and the CORS allow-list apply', () => {
    expect(config.provider.environment.NODE_ENV).toBe('production');
  });

  it('requires ALLOWED_ORIGINS with no default so a missing value fails at deploy', () => {
    expect(config.provider.environment.ALLOWED_ORIGINS).toBe(
      '${env:ALLOWED_ORIGINS}',
    );
  });
});

describe('serverless.yml gateway routes', () => {
  it('leaves only the intended routes without an authorizer', () => {
    const unauthenticated = routes
      .filter((route) => !route.httpApi.authorizer)
      .map(label)
      .sort();

    expect(unauthenticated).toEqual(
      [
        'GET /health',
        'GET /openapi.yaml',
        'POST /api/auth/register',
        'POST /api/auth/login',
        'POST /api/auth/login/verify',
        'ANY /api/public/{proxy+}',
        'ANY /api/internal/{proxy+}',
        'OPTIONS /{proxy+}',
      ].sort(),
    );
  });

  it('protects the catch-all route with the Cognito authorizer', () => {
    const catchAll = routes.find((r) => label(r) === 'ANY /{proxy+}');

    expect(catchAll?.httpApi.authorizer?.name).toBe('cognito');
  });
});

describe('serverless.yml data tables', () => {
  const { UsersTable, AgentCodesTable, GroupTrainersTable } =
    config.resources.Resources;
  const indexNames = (table: ITable): string[] =>
    (table.Properties.GlobalSecondaryIndexes ?? []).map((i) => i.IndexName);

  it('gives Users a byGroup, byRoleStatus and byAgentCode index keyed by id', () => {
    expect(UsersTable.Properties.KeySchema).toEqual([
      { AttributeName: 'id', KeyType: 'HASH' },
    ]);
    expect(indexNames(UsersTable).sort()).toEqual([
      'byAgentCode',
      'byGroup',
      'byRoleStatus',
    ]);
  });

  it('keys Users.byGroup on group with status, role and name as the sort key', () => {
    const byGroup = UsersTable.Properties.GlobalSecondaryIndexes!.find(
      (i) => i.IndexName === 'byGroup',
    );

    expect(byGroup?.KeySchema.map((k) => `${k.AttributeName}:${k.KeyType}`)).toEqual([
      'group_id:HASH',
      'status:RANGE',
      'role:RANGE',
      'name:RANGE',
    ]);
  });

  it('keys AgentCodes on the code with a byUsed index', () => {
    expect(AgentCodesTable.Properties.KeySchema).toEqual([
      { AttributeName: 'agent_code', KeyType: 'HASH' },
    ]);
    expect(indexNames(AgentCodesTable)).toEqual(['byUsed']);
  });

  it('keys GroupTrainers on group and trainer with a byTrainer index', () => {
    expect(GroupTrainersTable.Properties.KeySchema).toEqual([
      { AttributeName: 'group_id', KeyType: 'HASH' },
      { AttributeName: 'trainer_id', KeyType: 'RANGE' },
    ]);
    expect(indexNames(GroupTrainersTable)).toEqual(['byTrainer']);
  });

  it('passes every table name to the function', () => {
    for (const variable of ['USERS_TABLE', 'AGENT_CODES_TABLE', 'GROUP_TRAINERS_TABLE']) {
      expect(config.provider.environment).toHaveProperty(variable);
    }
  });
});

describe('serverless.yml multi-attribute index spike', () => {
  it('declares bySubject with a two-attribute partition key and two-attribute sort key', () => {
    const [index] =
      config.resources.Resources.PointTransactionsTable.Properties
        .GlobalSecondaryIndexes;

    expect(index.IndexName).toBe('bySubject');
    expect(index.KeySchema).toEqual([
      { AttributeName: 'subject_type', KeyType: 'HASH' },
      { AttributeName: 'subject_id', KeyType: 'HASH' },
      { AttributeName: 'activity', KeyType: 'RANGE' },
      { AttributeName: 'user_id', KeyType: 'RANGE' },
    ]);
  });
});

describe('serverless.yml Cognito resources', () => {
  const { UserPool, UserPoolClient } = config.resources.Resources;

  it('offers email one-time codes on a paid-feature tier, with the PASSWORD factor Cognito requires', () => {
    expect(UserPool.Properties.UserPoolTier).toBe('ESSENTIALS');
    expect(UserPool.Properties.Policies).toEqual({
      SignInPolicy: { AllowedFirstAuthFactors: ['PASSWORD', 'EMAIL_OTP'] },
    });
  });

  it('disables self sign-up so only the backend creates users', () => {
    expect(UserPool.Properties.AdminCreateUserConfig).toEqual({
      AllowAdminCreateUserOnly: true,
    });
  });

  it('enables only the USER_AUTH and refresh flows and hides unknown users', () => {
    expect(UserPoolClient.Properties.ExplicitAuthFlows).toEqual([
      'ALLOW_USER_AUTH',
      'ALLOW_REFRESH_TOKEN_AUTH',
    ]);
    expect(UserPoolClient.Properties.PreventUserExistenceErrors).toBe(
      'ENABLED',
    );
    expect(UserPoolClient.Properties.GenerateSecret).toBe(false);
  });
});
