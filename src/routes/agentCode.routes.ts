import express from 'express';
import { z } from 'zod';

import agentCodeController, {
  ICreateAgentCodesReq,
} from '@src/controllers/agentCode.controller';
import { authenticate } from '@src/middleware/auth';
import { validate } from '@src/middleware/validate';
import { IBaseReq } from '@src/models/interfaces/base.interface';

/******************************************************************************
                            Zod Schemas
******************************************************************************/

export const createAgentCodesSchema = z
  .object({
    agentCodes: z.array(z.string().min(1)).min(1).max(500),
  })
  .strict();

export const updateAgentCodeSchema = z
  .object({
    agentCode: z.string().min(1),
  })
  .strict();

/******************************************************************************
                            Router
******************************************************************************/

const router = express.Router();

router.get('/', authenticate, (req, res, next) =>
  agentCodeController.list(req as unknown as IBaseReq, res, next),
);

router.patch(
  '/:agentCode',
  authenticate,
  validate(updateAgentCodeSchema),
  (req, res, next) =>
    agentCodeController.update(req as unknown as IBaseReq, res, next),
);

router.post(
  '/',
  authenticate,
  validate(createAgentCodesSchema),
  (req, res, next) =>
    agentCodeController.createMany(
      req as unknown as ICreateAgentCodesReq,
      res,
      next,
    ),
);

export default router;
