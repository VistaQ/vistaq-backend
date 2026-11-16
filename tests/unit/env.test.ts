import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

const required: Record<string, string> = {
  TABLE_PREFIX: 'test_vistaq_',
  COGNITO_USER_POOL_ID: 'ap-southeast-5_test',
  COGNITO_CLIENT_ID: 'test-client',
};

const optional = [
  'ETL_SERVICE_URL',
  'ETL_API_KEY',
  'STATS_QUEUE_URL',
  'REPORTS_BUCKET',
  'MAINTENANCE_MODE',
  'REPORT_FILE_MAX_BYTES',
  'PORT',
];

const loadEnv = async () => (await import('@src/utils/env')).default;

describe('env module', () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...original, ...required };
    for (const name of optional) delete process.env[name];
  });

  afterAll(() => {
    process.env = original;
  });

  it.each(Object.keys(required))(
    'throws naming %s when it is missing',
    async (name) => {
      delete process.env[name];

      await expect(loadEnv()).rejects.toThrow(
        `Missing required environment variable: ${name}`,
      );
    },
  );

  it.each(Object.keys(required))(
    'treats a blank %s as missing',
    async (name) => {
      process.env[name] = '   ';

      await expect(loadEnv()).rejects.toThrow(
        `Missing required environment variable: ${name}`,
      );
    },
  );

  it('loads with only the required variables and defaults the optional ones', async () => {
    const env = await loadEnv();

    expect(env).toMatchObject({
      TablePrefix: 'test_vistaq_',
      CognitoUserPoolId: 'ap-southeast-5_test',
      CognitoClientId: 'test-client',
      EtlServiceUrl: '',
      InternalApiKey: '',
      StatsQueueUrl: '',
      ReportsBucket: '',
      MaintenanceMode: false,
      ReportFileMaxBytes: 10 * 1024 * 1024,
      Port: 3000,
    });
  });

  it('reads the optional variables when they are set', async () => {
    process.env.ETL_API_KEY = 'key';
    process.env.MAINTENANCE_MODE = 'true';
    process.env.REPORT_FILE_MAX_BYTES = '1024';

    expect(await loadEnv()).toMatchObject({
      InternalApiKey: 'key',
      MaintenanceMode: true,
      ReportFileMaxBytes: 1024,
    });
  });
});
