const env: Record<string, string> = {
  TABLE_PREFIX: 'test_vistaq_',
  COGNITO_USER_POOL_ID: 'pool-id',
  COGNITO_CLIENT_ID: 'client-id',
  ETL_SERVICE_URL: 'http://etl.test',
  ETL_API_KEY: 'key',
  BACKEND_BASE_URL: 'http://backend.test',
};

for (const [name, value] of Object.entries(env)) {
  process.env[name] ??= value;
}
