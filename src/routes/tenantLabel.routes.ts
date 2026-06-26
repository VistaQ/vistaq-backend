import express from 'express';

import tenantLabelController from '@src/controllers/tenantLabel.controller';
import { authenticate } from '@src/middleware/auth';
import { IBaseReq } from '@src/models/interfaces/base.interface';

/******************************************************************************
                            Router
******************************************************************************/

const router = express.Router();

router.get(
  '/',
  authenticate,
  (req, res, next) =>
    tenantLabelController.getAll(req as unknown as IBaseReq, res, next),
);

export default router;
