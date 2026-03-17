import { NextFunction, Request, Response } from 'express';

import HttpStatusCodes from '@src/utils/HttpStatusCodes';
import { handleControllerError } from '@src/utils/errorHandlers';
import healthService from '@src/services/health.service';

/******************************************************************************
                            HealthController
******************************************************************************/

class HealthController {
  /**
   * GET /health
   * Returns HTTP 200 with { status: "ok", timestamp: "<ISO string>" }.
   * No authentication required.
   */
  check(_req: Request, res: Response, next: NextFunction): void {
    try {
      const result = healthService.check();

      res.status(HttpStatusCodes.OK).json(result);
    } catch (error) {
      return handleControllerError('HealthController.check', error, next);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const healthController = new HealthController();
export default healthController;
