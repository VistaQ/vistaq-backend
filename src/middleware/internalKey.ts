import type { NextFunction, Request, Response } from 'express';

import EnvVars from '@src/utils/env';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Internal-Key Middleware

  Authenticates internal service-to-service requests (e.g. the ETL service
  calling back into the backend). Verifies the Authorization header is
  `Bearer <ETL_API_KEY>`. Returns 401 on any mismatch, and for every request
  while ETL_API_KEY is unset, so an empty key never matches `Bearer `.
******************************************************************************/

export function internalKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers['authorization'];
  const key = EnvVars.InternalApiKey.trim();

  if (!key || !header || header !== `Bearer ${key}`) {
    res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }

  next();
}
