import express from 'express';
import { z } from 'zod';

import agentCodeController, {
  ICreateAgentCodesReq,
} from '@src/controllers/agentCode.controller';
import { authenticate } from '@src/middleware/auth';
import { validate } from '@src/middleware/validate';

/******************************************************************************
                            Zod Schemas
******************************************************************************/

export const createAgentCodesSchema = z
  .object({
    agentCodes: z.array(z.string().min(1)).min(1).max(500),
  })
  .strict();

/******************************************************************************
                            Router
******************************************************************************/

const router = express.Router();

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
