import * as Sentry from '@sentry/node';

import { RouteError } from '@src/models/errors/route.error';
import EnvVars from '@src/utils/env';
import { getRootCause } from '@src/utils/sentry.utils';

Sentry.init({
  dsn: EnvVars.SentryDsn,
  environment: EnvVars.VercelEnv || EnvVars.NodeEnv || 'development',
  tracesSampleRate: 1.0,
  integrations: [Sentry.expressIntegration()],
  _experiments: { enableLogs: true },
  beforeSend(event, hint) {
    const error = hint?.originalException;
    const rootCause = error instanceof Error ? getRootCause(error) : error;
    if (rootCause instanceof RouteError && rootCause.status < 500) {
      event.level = 'warning';
    } else {
      event.level = 'error';
    }

    return event;
  },
});
