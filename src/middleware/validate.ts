import { NextFunction, Request, Response } from 'express';
import { z, ZodError, ZodSchema } from 'zod';

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
        const flat = z.flattenError(error);
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          message: 'Validation failed',
          formErrors: flat.formErrors,
          fieldErrors: flat.fieldErrors,
        });
        return;
      }
      next(error);
    }
  };
}
