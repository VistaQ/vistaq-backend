import express from 'express';

import leaderboardController from '@src/controllers/leaderboard.controller';
import { authenticate } from '@src/middleware/auth';
import { IBaseReq } from '@src/models/interfaces/base.interface';

const router = express.Router();

/******************************************************************************
                    Leaderboard Routes (/api/leaderboard/*)
******************************************************************************/

router.get(
  '/stats',
  authenticate,
  (req, res, next) =>
    leaderboardController.getStats(req as unknown as IBaseReq, res, next),
);

router.get(
  '/',
  authenticate,
  (req, res, next) =>
    leaderboardController.getLeaderboard(req as unknown as IBaseReq, res, next),
);

export default router;
