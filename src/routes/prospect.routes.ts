import express from 'express';
import { z } from 'zod';

import prospectController, {
  ICreateProspectReq,
} from '@src/controllers/prospect.controller';
import { authenticate } from '@src/middleware/auth';
import { validate } from '@src/middleware/validate';

/******************************************************************************
                            Zod Schema
******************************************************************************/

export const createProspectSchema = z.object({
  fullName: z.string().min(1),
  phoneNum: z.string().optional(),
  email: z.string().email().optional(),
}).strict();

/******************************************************************************
                            Router
******************************************************************************/

const router = express.Router();

router.post(
  '/',
  authenticate,
  validate(createProspectSchema),
  (req, res, next) =>
    prospectController.create(req as unknown as ICreateProspectReq, res, next),
);

export default router;
