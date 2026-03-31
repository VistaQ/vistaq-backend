import express from 'express';

import agentPointsController from '@src/controllers/agentPoints.controller';
import { authenticate } from '@src/middleware/auth';
import { IBaseReq } from '@src/models/interfaces/base.interface';

const router = express.Router();

router.get(
  '/',
  authenticate,
  (req, res, next) => agentPointsController.getAgentPoints(req as unknown as IBaseReq, res, next),
);

export default router;
