import { NextFunction, Response } from 'express';

import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import dashboardService from '@src/services/dashboard.service';
import { IDashboardPeriodStats } from '@src/types/dashboard.types';
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
      const token = req.headers['authorization']!.slice(7);
      const data = await dashboardService.getStats(token);

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
