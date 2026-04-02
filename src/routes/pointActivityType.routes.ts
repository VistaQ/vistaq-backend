import express from 'express';

import pointActivityTypeController from '@src/controllers/pointActivityType.controller';
import { authenticate } from '@src/middleware/auth';
import { IBaseReq } from '@src/models/interfaces/base.interface';

const router = express.Router();

router.get(
  '/',
  authenticate,
  (req, res, next) =>
    pointActivityTypeController.getAll(req as unknown as IBaseReq, res, next),
);

export default router;
