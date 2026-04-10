import './instrument';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import path from 'path';
import * as Sentry from '@sentry/node';

import HttpStatusCodes from '@src/utils/HttpStatusCodes';
import { RouteError } from '@src/models/errors/route.error';
import router from '@src/routes/router';
import healthController from '@src/controllers/health.controller';
import { asyncLocalStorage, loggingService } from '@src/services/logging.service';
import { emitHttpMetrics, emitActiveUser } from '@src/utils/sentry.metrics';

import EnvVars, { NodeEnvs } from './utils/env';

/******************************************************************************
                                Setup
******************************************************************************/

const app = express();

/******************************************************************************
                                Middleware
******************************************************************************/

// CORS — allow all origins (tighten before production go-live)
app.use(cors());

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Maintenance mode — returns 503 for all routes except /health
if (EnvVars.MaintenanceMode) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') return next();
    res.status(503).json({ message: 'System under maintenance' });
  });
}

// Pino request-logging middleware
// Generates a correlation ID per request, stores it in AsyncLocalStorage,
// and logs both incoming requests and outgoing responses including headers and body.
app.use((req: Request, res: Response, next: NextFunction) => {
  try {
    const correlationId: string = randomUUID();

    asyncLocalStorage.run({ correlationId }, () => {
      try {
        // Tag every Sentry event in this request with the correlation ID
        Sentry.setTag('correlationId', correlationId);
        // Redact sensitive fields from request body before logging
        const SENSITIVE_BODY_FIELDS = [
          'password', 'newPassword', 'confirmPassword',
          'token', 'refreshToken', 'accessToken',
        ];
        let requestBody: unknown = req.body as unknown;
        if (requestBody && typeof requestBody === 'object') {
          const redacted: Record<string, unknown> = { ...(requestBody as Record<string, unknown>) };
          for (const field of SENSITIVE_BODY_FIELDS) {
            if (field in redacted) {
              redacted[field] = '[REDACTED]';
            }
          }
          requestBody = redacted;
        }

        loggingService.info('Incoming request', {
          method: req.method,
          url: req.originalUrl,
          headers: req.headers,
          body: requestBody,
        });

        const startTime = Date.now();

        // Capture the response body by overriding res.json within the AsyncLocalStorage context.
        // Note: responses sent via res.send, res.end, or res.sendFile bypass this override
        // and will log undefined as the body.
        let capturedResponseBody: unknown;
        const originalJson = res.json.bind(res);
        res.json = (body: unknown): Response => {
          capturedResponseBody = body;
          return originalJson(body);
        };

        // The 'finish' listener is registered within the asyncLocalStorage.run() context.
        // Node.js AsyncLocalStorage propagates the store into listeners registered within
        // the run() callback via async resource tracking (Node 18+). capturedResponseBody
        // is captured by closure. If correlationId appears undefined in future Node
        // versions, wrap this listener in asyncLocalStorage.run({ correlationId }, ...).
        res.on('finish', () => {
          try {
            const durationMs = Date.now() - startTime;

            // Derive a stable route pattern (e.g. "GET /api/users/:userId").
            // req.route is populated only after the route handler runs, making
            // the finish listener the correct place to read it.
            const routePattern = req.route?.path
              ? `${req.method} ${req.baseUrl}${req.route.path}`
              : `${req.method} ${req.originalUrl.split('?')[0]}`;

            Sentry.setTag('route_pattern', routePattern);
            Sentry.setTag('http.status_code', String(res.statusCode));
            if (req.user?.role) {
              Sentry.setTag('user_role', req.user.role);
            }

            emitHttpMetrics(req.method, routePattern, res.statusCode, durationMs);

            if (req.user) {
              emitActiveUser(req.user.tenant_id);
            }

            loggingService.info('Outgoing response', {
              method: req.method,
              url: req.originalUrl,
              statusCode: res.statusCode,
              durationMs,
              headers: res.getHeaders(),
              body: capturedResponseBody,
            });
          } catch (err) {
            console.error('Failed to log outgoing response', err);
          }
        });

        next();
      } catch (innerErr) {
        next(innerErr);
      }
    });
  } catch (err) {
    next(err);
  }
});

// Security headers (production only)
if (EnvVars.NodeEnv === NodeEnvs.PRODUCTION) {
  if (!EnvVars.DisableHelmet) {
    app.use(helmet());
  }
}

/******************************************************************************
                                Routes
******************************************************************************/

// API routes
app.use('/api', router);

// Health check endpoint
app.get('/health', healthController.check.bind(healthController));

// OpenAPI spec
app.get('/openapi.yaml', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
  res.sendFile(path.join(__dirname, 'openapi.yaml'));
});

/******************************************************************************
                            Error Handler
******************************************************************************/

// Sentry error handler — must be registered before custom error handler.
// shouldHandleError: () => true captures both 4xx and 5xx errors.
Sentry.setupExpressErrorHandler(app, { shouldHandleError: () => true });

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (EnvVars.NodeEnv !== NodeEnvs.TEST.valueOf()) {
    loggingService.error('Unhandled error', err);
  }
  let status: HttpStatusCodes = HttpStatusCodes.BAD_REQUEST;
  if (err instanceof RouteError) {
    status = err.status;
    res.status(status).json({ message: err.message });
  } else {
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Server Error',
    });
  }
});

/******************************************************************************
                                Export
******************************************************************************/

export default app;
