import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';

import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Validate Middleware
******************************************************************************/

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req.body);
      req.body = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res
          .status(HttpStatusCodes.BAD_REQUEST)
          .json({ message: 'Validation failed', errors: error.issues });
        return;
      }
      next(error);
    }
  };
}
