import { NextFunction, Response } from 'express';
import { z } from 'zod';

import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import leaderboardService from '@src/services/leaderboard.service';
import { ILeaderboardEntry, ILeaderboardStats } from '@src/types/leaderboard.types';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface IGetLeaderboardRes extends IBaseRes {
  success: boolean;
  data: ILeaderboardEntry[];
}

export interface IGetLeaderboardStatsRes extends IBaseRes {
  success: boolean;
  data: ILeaderboardStats;
}

export const periodSchema = z.enum(['mtd', 'ytd']);
export type Period = z.infer<typeof periodSchema>;

/******************************************************************************
                            LeaderboardController
******************************************************************************/

class LeaderboardController {
  async getLeaderboard(
    req: IBaseReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const tenantId = req.user!.tenant_id;
      const data = await leaderboardService.getLeaderboard(tenantId);

      const responseBody: IGetLeaderboardRes = {
        success: true,
        data,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError(
        'LeaderboardController.getLeaderboard',
        error,
        next,
      );
    }
  }

  async getStats(req: IBaseReq, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = periodSchema.safeParse(req.query.period);
      if (!parsed.success) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          message: 'Validation failed',
          errors: parsed.error.issues,
        });
        return;
      }

      const tenantId = req.user!.tenant_id;
      const data = await leaderboardService.getStats(tenantId, parsed.data);

      const responseBody: IGetLeaderboardStatsRes = {
        success: true,
        data,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('LeaderboardController.getStats', error, next);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export default new LeaderboardController();
