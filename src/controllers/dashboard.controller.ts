import type { NextFunction, Response } from 'express';

import type { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import dashboardService from '@src/services/dashboard.service';
import type { IDashboardPeriodStats } from '@src/types/dashboard.types';
import { callerOf } from '@src/utils/caller';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface IGetDashboardStatsRes extends IBaseRes {
  success: boolean;
  data: {
    ytd: IDashboardPeriodStats;
    mtd: IDashboardPeriodStats;
  };
}

/******************************************************************************
                            DashboardController
******************************************************************************/

class DashboardController {
  async getStats(
    req: IBaseReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const data = await dashboardService.getStats(callerOf(req));

      const responseBody: IGetDashboardStatsRes = {
        success: true,
        data,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('DashboardController.getStats', error, next);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export default new DashboardController();
