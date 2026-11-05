const required: Record<string, string> = {
  SUPABASE_URL: 'http://supabase.test',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  USERS_TABLE: 'users-table',
  AGENT_CODES_TABLE: 'agent-codes-table',
  GROUP_TRAINERS_TABLE: 'group-trainers-table',
  COGNITO_USER_POOL_ID: 'ap-southeast-1_test',
  COGNITO_CLIENT_ID: 'test-client',
  ETL_SERVICE_URL: 'http://etl.test',
  ETL_API_KEY: 'key',
  BACKEND_BASE_URL: 'http://backend.test',
};

describe('env module', () => {
  const original = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...original, ...required, NODE_ENV: 'test' };
  });

  afterAll(() => {
    process.env = original;
  });

  it.each(Object.keys(required))(
    'throws naming %s when it is missing',
    (name) => {
      delete process.env[name];

      expect(() => require('@src/utils/env')).toThrow(
        `Missing required environment variable: ${name}`,
      );
    },
  );

  it('loads when every required variable is set', () => {
    expect(() => require('@src/utils/env')).not.toThrow();
  });
});
