import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import { join } from 'path';

import { TABLE_NAMES } from '@src/constants/tables';

interface IRoute {
  httpApi?: { method: string; path: string; authorizer?: { name: string } };
  stream?: {
    type: string;
    arn: { 'Fn::GetAtt': [string, string] };
    startingPosition: string;
    functionResponseType: string;
    bisectBatchOnFunctionError: boolean;
    destinations?: { onFailure?: unknown };
  };
  sqs?: { arn: unknown; functionResponseType: string };
}

interface IIndex {
  IndexName: string;
  KeySchema: { AttributeName: string; KeyType: string }[];
}

interface IResource {
  Type: string;
  Condition?: string;
  Properties: Record<string, any> & {
    TableName?: string;
    KeySchema?: { AttributeName: string; KeyType: string }[];
    GlobalSecondaryIndexes?: IIndex[];
  };
}

interface IServerlessConfig {
  params: Record<string, Record<string, unknown>>;
  provider: {
    environment: Record<string, unknown>;
    httpApi: {
      cors: Record<string, unknown>;
      authorizers: Record<string, unknown>;
    };
    iam: { role: { statements: { Action: string[]; Resource: unknown }[] } };
  };
  functions: Record<string, { handler: string; events?: IRoute[] }>;
  resources: {
    Conditions: Record<string, unknown>;
    Resources: Record<string, IResource>;
  };
}

const config = load(
  readFileSync(join(__dirname, '../../serverless.yml'), 'utf8'),
) as IServerlessConfig;

const { Resources } = config.resources;
const routes = (config.functions.api.events ?? []).filter((e) => e.httpApi);
const label = (route: IRoute): string =>
  `${route.httpApi!.method} ${route.httpApi!.path}`;
const indexNames = (table: IResource): string[] =>
  (table.Properties.GlobalSecondaryIndexes ?? []).map((i) => i.IndexName);
const tables = Object.values(Resources).filter(
  (r) => r.Type === 'AWS::DynamoDB::Table',
);

describe('serverless.yml stage configuration', () => {
  it('passes the function only the stage-scoped values the code reads', () => {
    expect(Object.keys(config.provider.environment).sort()).toEqual([
      'COGNITO_CLIENT_ID',
      'COGNITO_USER_POOL_ID',
      'REPORTS_BUCKET',
      'STATS_QUEUE_URL',
      'TABLE_PREFIX',
    ]);
    expect(config.provider.environment.TABLE_PREFIX).toBe(
      '${param:tablePrefix}',
    );
  });

  it('prefixes tables per stage', () => {
    expect(config.params.default.tablePrefix).toBe('${sls:stage}_vistaq_');
    expect(config.params.staging.tablePrefix).toBe('stg_vistaq_');
    expect(config.params.production.tablePrefix).toBe('prod_vistaq_');
  });

  it('gives only staging a custom API domain', () => {
    expect(config.params.staging.apiDomainName).toBe('stg-api.vistaq.co');
    expect(config.params.staging.apiCertificateArn).toMatch(
      /^arn:aws:acm:ap-southeast-5:\d+:certificate\//,
    );
    expect(config.params.dev.apiDomainName).toBeUndefined();
    expect(config.params.production.apiDomainName).toBeUndefined();
    expect(Resources.ApiDomainName.Condition).toBe('HasApiDomain');
    expect(Resources.ApiDomainMapping.Condition).toBe('HasApiDomain');
  });
});

describe('serverless.yml functions', () => {
  it('serves HTTP from one API function and runs the rest from streams and the queue', () => {
    expect(Object.keys(config.functions).sort()).toEqual([
      'api',
      'awardPoints',
      'statsRecompute',
      'statsStream',
    ]);
    for (const name of ['awardPoints', 'statsStream', 'statsRecompute']) {
      expect(
        (config.functions[name].events ?? []).some((e) => e.httpApi),
      ).toBe(false);
    }
  });

  it('reads the streams from the start, reports failed records and keeps what still fails', () => {
    const streams = [
      ...(config.functions.awardPoints.events ?? []),
      ...(config.functions.statsStream.events ?? []),
    ].map((e) => e.stream!);

    expect(streams.map((s) => s.arn['Fn::GetAtt'][0]).sort()).toEqual([
      'CoachingAttendanceTable',
      'ProspectsTable',
      'ProspectsTable',
    ]);
    for (const stream of streams) {
      expect(stream.startingPosition).toBe('TRIM_HORIZON');
      expect(stream.functionResponseType).toBe('ReportBatchItemFailures');
      expect(stream.bisectBatchOnFunctionError).toBe(true);
      expect(stream.destinations?.onFailure).toBeDefined();
    }
    expect(config.functions.statsRecompute.events?.[0].sqs?.functionResponseType).toBe(
      'ReportBatchItemFailures',
    );
  });

  it('scopes every IAM statement to named resources', () => {
    const statements = config.provider.iam.role.statements;

    for (const statement of statements) {
      expect(JSON.stringify(statement.Resource)).not.toBe('"*"');
    }
    const tableAccess = statements.filter((s) =>
      s.Action.includes('dynamodb:GetItem'),
    );
    expect(tableAccess).toHaveLength(1);
    expect(tableAccess[0].Resource).toEqual([
      'arn:aws:dynamodb:${aws:region}:${aws:accountId}:table/${param:tablePrefix}*',
    ]);
  });
});

describe('serverless.yml gateway routes', () => {
  it('leaves only the intended routes without an authorizer', () => {
    const unauthenticated = routes
      .filter((route) => !route.httpApi!.authorizer)
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

    expect(catchAll?.httpApi!.authorizer?.name).toBe('cognito');
    expect(Object.keys(config.provider.httpApi.authorizers)).toEqual([
      'cognito',
    ]);
  });

  it('answers CORS at the HTTP API from each deployable stage origins', () => {
    expect(config.provider.httpApi.cors).toMatchObject({
      allowedOrigins: '${param:allowedOrigins}',
      allowedHeaders: ['Authorization', 'Content-Type'],
      allowCredentials: true,
    });
    expect(config.params.dev.allowedOrigins).toEqual(['http://localhost:5173']);
    expect(config.params.staging.allowedOrigins).toContain(
      'https://stg-app.vistaq.co',
    );
  });
});

describe('serverless.yml data tables', () => {
  const { UsersTable, AgentCodesTable, GroupTrainersTable } = Resources;

  it('declares one table per base name, named from the stage prefix', () => {
    expect(tables.map((t) => t.Properties.TableName).sort()).toEqual(
      TABLE_NAMES.map((name) => `\${param:tablePrefix}${name}`).sort(),
    );
  });

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

  it('keys AgentCodes on the code with byUser and byUsed indexes', () => {
    expect(AgentCodesTable.Properties.KeySchema).toEqual([
      { AttributeName: 'agent_code', KeyType: 'HASH' },
    ]);
    expect(indexNames(AgentCodesTable).sort()).toEqual(['byUsed', 'byUser']);
  });

  it('keys GroupTrainers on group and trainer with a byTrainer index', () => {
    expect(GroupTrainersTable.Properties.KeySchema).toEqual([
      { AttributeName: 'group_id', KeyType: 'HASH' },
      { AttributeName: 'trainer_id', KeyType: 'RANGE' },
    ]);
    expect(indexNames(GroupTrainersTable)).toEqual(['byTrainer']);
  });

  it('declares PointTransactions.bySubject with a two-attribute partition and sort key', () => {
    const bySubject = Resources.PointTransactionsTable.Properties.GlobalSecondaryIndexes!.find(
      (i) => i.IndexName === 'bySubject',
    );

    expect(bySubject?.KeySchema).toEqual([
      { AttributeName: 'subject_type', KeyType: 'HASH' },
      { AttributeName: 'subject_id', KeyType: 'HASH' },
      { AttributeName: 'activity', KeyType: 'RANGE' },
      { AttributeName: 'user_id', KeyType: 'RANGE' },
    ]);
  });
});

describe('serverless.yml Cognito resources', () => {
  const { UserPool, UserPoolClient } = Resources;

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
