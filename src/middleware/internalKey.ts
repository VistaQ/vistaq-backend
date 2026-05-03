import { NextFunction, Request, Response } from 'express';

import EnvVars from '@src/utils/env';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Internal-Key Middleware

  Authenticates internal service-to-service requests (e.g. the ETL service
  calling back into the backend). Verifies the Authorization header is
  `Bearer <ETL_API_KEY>`. Returns 401 on any mismatch.
******************************************************************************/

export function internalKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers['authorization'];
  const expected = `Bearer ${EnvVars.InternalApiKey}`;

  if (!header || header !== expected) {
    res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }

  next();
}
