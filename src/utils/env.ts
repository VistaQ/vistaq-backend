/******************************************************************************
                                Setup
******************************************************************************/

const EnvVars = {
  Port: Number(process.env.PORT || 3000),
  TablePrefix: process.env.TABLE_PREFIX || '',
  StatsQueueUrl: process.env.STATS_QUEUE_URL || '',
  ReportsBucket: process.env.REPORTS_BUCKET || '',
  CognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || '',
  CognitoClientId: process.env.COGNITO_CLIENT_ID || '',
  MaintenanceMode: (process.env.MAINTENANCE_MODE || 'false') === 'true',
  EtlServiceUrl: process.env.ETL_SERVICE_URL || '',
  InternalApiKey: process.env.ETL_API_KEY || '',
  ReportFileMaxBytes: Number(
    process.env.REPORT_FILE_MAX_BYTES || 10 * 1024 * 1024,
  ),
};

if (!EnvVars.TablePrefix.trim()) {
  throw new Error('Missing required environment variable: TABLE_PREFIX');
}

if (!EnvVars.CognitoUserPoolId.trim()) {
  throw new Error('Missing required environment variable: COGNITO_USER_POOL_ID');
}

if (!EnvVars.CognitoClientId.trim()) {
  throw new Error('Missing required environment variable: COGNITO_CLIENT_ID');
}

/******************************************************************************
                           Export default
******************************************************************************/

export default EnvVars;
