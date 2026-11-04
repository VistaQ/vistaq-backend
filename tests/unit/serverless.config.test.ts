import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import { join } from 'path';

interface IRoute {
  httpApi: { method: string; path: string; authorizer?: { name: string } };
}

interface IServerlessConfig {
  provider: { environment: Record<string, unknown> };
  functions: { api: { events: IRoute[] } };
  resources: {
    Resources: {
      UserPool: { Properties: Record<string, unknown> };
      UserPoolClient: { Properties: Record<string, unknown> };
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
