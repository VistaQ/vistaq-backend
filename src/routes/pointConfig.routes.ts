import express from 'express';
import { z } from 'zod';

import pointConfigController, {
  ICreatePointConfigReq,
  IUpdatePointConfigReq,
} from '@src/controllers/pointConfig.controller';
import { authenticate } from '@src/middleware/auth';
import { validate } from '@src/middleware/validate';
import { IBaseReq } from '@src/models/interfaces/base.interface';

/******************************************************************************
                            Zod Schemas
******************************************************************************/

export const createPointConfigSchema = z
  .object({
    activity: z.string().min(1),
    points: z.number().int().gt(0),
  })
  .strict();

export const updatePointConfigSchema = z
  .object({
    points: z.number().int().gt(0),
  })
  .strict();

/******************************************************************************
                            Router
******************************************************************************/

const router = express.Router();

router.post(
  '/',
  authenticate,
  validate(createPointConfigSchema),
  (req, res, next) =>
    pointConfigController.create(req as unknown as ICreatePointConfigReq, res, next),
);

router.get(
  '/',
  authenticate,
  (req, res, next) =>
    pointConfigController.getAll(req as unknown as IBaseReq, res, next),
);

router.put(
  '/:activity',
  authenticate,
  validate(updatePointConfigSchema),
  (req, res, next) =>
    pointConfigController.update(req as unknown as IUpdatePointConfigReq, res, next),
);

export default router;
