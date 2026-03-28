import { NextFunction, Response } from 'express';

import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import leaderboardService from '@src/services/leaderboard.service';
import { ILeaderboardEntry } from '@src/types/leaderboard.types';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface IGetLeaderboardRes extends IBaseRes {
  success: boolean;
  data: ILeaderboardEntry[];
}

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
}

/******************************************************************************
                                Export
******************************************************************************/

export default new LeaderboardController();
