import express from 'express';
import { z } from 'zod';

import type {
  ICreateAgentCodesReq,
} from '@src/controllers/agentCode.controller';
import agentCodeController from '@src/controllers/agentCode.controller';
import { authenticate } from '@src/middleware/auth';
import { validate } from '@src/middleware/validate';
import type { IBaseReq } from '@src/models/interfaces/base.interface';

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

router.delete('/:agentCode', authenticate, (req, res, next) =>
  agentCodeController.remove(req as unknown as IBaseReq, res, next),
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
