import { NextFunction, Request, Response } from 'express';

import { HealthControllerError } from '@src/models/errors/health.error';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';
import loggingService from '@src/services/logging.service';
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
      loggingService.info('HealthController.check called');

      const result = healthService.check();

      res.status(HttpStatusCodes.OK).json(result);
    } catch (error) {
      loggingService.error('HealthController.check failed', error);
      return next(new HealthControllerError('Health check failed in controller layer', error));
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const healthController = new HealthController();
export default healthController;
