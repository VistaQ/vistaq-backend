import express from 'express';

import dashboardController from '@src/controllers/dashboard.controller';
import { IBaseReq } from '@src/models/interfaces/base.interface';
import { authenticate } from '@src/middleware/auth';

const router = express.Router();

/******************************************************************************
                        Dashboard Routes (/api/dashboard/*)
******************************************************************************/

router.get(
  '/stats',
  authenticate,
  (req, res, next) => dashboardController.getStats(req as unknown as IBaseReq, res, next),
);

export default router;
