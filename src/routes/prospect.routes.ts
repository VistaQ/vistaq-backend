import express from 'express';
import { z } from 'zod';

import prospectController, {
  ICreateProspectReq,
  IGetProspectByIdReq,
} from '@src/controllers/prospect.controller';
import { authenticate } from '@src/middleware/auth';
import { validate } from '@src/middleware/validate';
import { IBaseReq } from '@src/models/interfaces/base.interface';

export const createProspectSchema = z.object({
  fullName: z.string().min(1),
  phoneNum: z.string().optional(),
  email: z.string().email().optional(),
}).strict();

const router = express.Router();

router.get(
  '/',
  authenticate,
  (req, res, next) =>
    prospectController.getAll(req as unknown as IBaseReq, res, next),
);

router.get(
  '/:prospectId',
  authenticate,
  (req, res, next) =>
    prospectController.getById(req as unknown as IGetProspectByIdReq, res, next),
);

router.post(
  '/',
  authenticate,
  validate(createProspectSchema),
  (req, res, next) =>
    prospectController.create(req as unknown as ICreateProspectReq, res, next),
);

export default router;
