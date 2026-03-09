import express from 'express';
import { z } from 'zod';

import groupController, {
  ICreateGroupReq,
} from '@src/controllers/group.controller';
import { authenticate } from '@src/middleware/auth';
import { validate } from '@src/middleware/validate';

/******************************************************************************
                            Zod Schema
******************************************************************************/

export const createGroupSchema = z.object({
  name: z.string().min(1),
  leader_id: z.string().uuid().optional(),
  trainer_id: z.string().uuid().optional(),
}).strict();

/******************************************************************************
                            Router
******************************************************************************/

const router = express.Router();

router.post(
  '/',
  authenticate,
  validate(createGroupSchema),
  (req, res, next) =>
    groupController.create(req as unknown as ICreateGroupReq, res, next),
);

export default router;
