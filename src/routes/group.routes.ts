import express from 'express';
import { z } from 'zod';

import groupController, {
  ICreateGroupReq,
  IGetGroupByIdReq,
  IUpdateGroupReq,
} from '@src/controllers/group.controller';
import { IBaseReq } from '@src/models/interfaces/base.interface';
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

export const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  leader_id: z.string().uuid().optional(),
  trainer_id: z.string().uuid().optional(),
  member_ids: z.array(z.string().uuid()).min(1).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

/******************************************************************************
                            Router
******************************************************************************/

const router = express.Router();

router.get(
  '/',
  authenticate,
  (req, res, next) =>
    groupController.getAll(req as unknown as IBaseReq, res, next),
);

router.get(
  '/:groupId',
  authenticate,
  (req, res, next) =>
    groupController.getById(req as unknown as IGetGroupByIdReq, res, next),
);

router.post(
  '/',
  authenticate,
  validate(createGroupSchema),
  (req, res, next) =>
    groupController.create(req as unknown as ICreateGroupReq, res, next),
);

router.put(
  '/:groupId',
  authenticate,
  validate(updateGroupSchema),
  (req, res, next) =>
    groupController.update(req as unknown as IUpdateGroupReq, res, next),
);

export default router;
