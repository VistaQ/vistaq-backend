const env: Record<string, string> = {
  TABLE_PREFIX: 'test_vistaq_',
  COGNITO_USER_POOL_ID: 'pool-id',
  COGNITO_CLIENT_ID: 'client-id',
  ETL_SERVICE_URL: 'http://etl.test',
  ETL_API_KEY: 'key',
  AWS_REGION: 'ap-southeast-5',
  AWS_ACCESS_KEY_ID: 'test',
  AWS_SECRET_ACCESS_KEY: 'test',
};

for (const [name, value] of Object.entries(env)) {
  process.env[name] = value;
}
