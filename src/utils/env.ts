/******************************************************************************
                                Constants
******************************************************************************/

// NOTE: These need to match the names of your ".env" files
export const NodeEnvs = {
  DEV: 'development',
  TEST: 'test',
  PRODUCTION: 'production',
} as const;

/******************************************************************************
                                Setup
******************************************************************************/

const EnvVars = {
  NodeEnv: (process.env.NODE_ENV ||
    NodeEnvs.DEV) as (typeof NodeEnvs)[keyof typeof NodeEnvs],
  Port: Number(process.env.PORT || 3000),
  SupabaseUrl: process.env.SUPABASE_URL || '',
  SupabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  SupabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  FrontendResetPasswordUrl: process.env.FRONTEND_RESET_PASSWORD_URL || '',
  SentryDsn: process.env.SENTRY_DSN || '',
  VercelEnv: process.env.VERCEL_ENV || '',
  DisableHelmet: process.env.DISABLE_HELMET === 'true',
};

if (!EnvVars.SupabaseUrl.trim()) {
  throw new Error('Missing required environment variable: SUPABASE_URL');
}

if (!EnvVars.SupabaseAnonKey.trim()) {
  throw new Error('Missing required environment variable: SUPABASE_ANON_KEY');
}

if (!EnvVars.SupabaseServiceRoleKey.trim()) {
  throw new Error(
    'Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY',
  );
}

if (!EnvVars.FrontendResetPasswordUrl.trim()) {
  throw new Error(
    'Missing required environment variable: FRONTEND_RESET_PASSWORD_URL',
  );
}

/******************************************************************************
                           Export default
******************************************************************************/

export default EnvVars;
