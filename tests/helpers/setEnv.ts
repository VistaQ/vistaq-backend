const env: Record<string, string> = {
  SUPABASE_URL: 'http://supabase.test',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  USERS_TABLE: 'users-table',
  AGENT_CODES_TABLE: 'agent-codes-table',
  GROUP_TRAINERS_TABLE: 'group-trainers-table',
  COGNITO_USER_POOL_ID: 'pool-id',
  COGNITO_CLIENT_ID: 'client-id',
  ETL_SERVICE_URL: 'http://etl.test',
  ETL_API_KEY: 'key',
  BACKEND_BASE_URL: 'http://backend.test',
};

for (const [name, value] of Object.entries(env)) {
  process.env[name] ??= value;
}
