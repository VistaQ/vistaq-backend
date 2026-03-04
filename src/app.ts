import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';

import HttpStatusCodes from '@src/utils/HttpStatusCodes';
import { RouteError } from '@src/models/errors/route.error';
import router from '@src/routes/router';

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

// HTTP request logger (development only)
if (EnvVars.NodeEnv === NodeEnvs.DEV) {
  app.use(morgan('dev'));
}

// Security headers (production only)
if (EnvVars.NodeEnv === NodeEnvs.PRODUCTION) {
  // eslint-disable-next-line no-process-env
  if (!process.env.DISABLE_HELMET) {
    app.use(helmet());
  }
}

/******************************************************************************
                                Routes
******************************************************************************/

// API routes
app.use('/api', router);

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(HttpStatusCodes.OK).json({ status: 'ok' });
});

// OpenAPI spec
app.get('/openapi.yaml', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
  res.sendFile(path.join(__dirname, 'openapi.yaml'));
});

/******************************************************************************
                            Error Handler
******************************************************************************/

app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (EnvVars.NodeEnv !== NodeEnvs.TEST.valueOf()) {
    console.error(err);
  }
  let status: HttpStatusCodes = HttpStatusCodes.BAD_REQUEST;
  if (err instanceof RouteError) {
    status = err.status;
    res.status(status).json({ error: err.message });
  } else {
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Internal server error',
    });
  }
  return next(err);
});

/******************************************************************************
                                Export
******************************************************************************/

export default app;
