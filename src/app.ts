import type { CorsOptions } from 'cors';
import cors from 'cors';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import helmet from 'helmet';
import path from 'path';

import healthController from '@src/controllers/health.controller';
import { RouteError } from '@src/models/errors/route.error';
import router from '@src/routes/router';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

import EnvVars, { NodeEnvs } from './utils/env';

/******************************************************************************
                                Setup
******************************************************************************/

const app = express();

/******************************************************************************
                                Middleware
******************************************************************************/

// CORS — restrict to allowed origins in production, permissive elsewhere
const corsOptions: CorsOptions = {
  origin:
    EnvVars.NodeEnv === NodeEnvs.PRODUCTION ? EnvVars.AllowedOrigins : true,
  credentials: true,
};
app.use(cors(corsOptions));

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
  res.sendFile(path.join(process.cwd(), 'openapi.yaml'));
});

/******************************************************************************
                            Error Handler
******************************************************************************/

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof RouteError) {
    res.status(err.status).json({ message: err.message });
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
