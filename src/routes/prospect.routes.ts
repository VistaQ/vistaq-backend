import express from 'express';
import { z } from 'zod';

import prospectController, {
  ICreateProspectReq,
  IGetProspectByIdReq,
  IUpdateProspectReq,
} from '@src/controllers/prospect.controller';
import { authenticate } from '@src/middleware/auth';
import { validate } from '@src/middleware/validate';
import { IBaseReq } from '@src/models/interfaces/base.interface';

/******************************************************************************
                            Zod Schemas
******************************************************************************/

export const createProspectSchema = z.object({
  fullName: z.string().min(1),
  phoneNum: z.string().optional(),
  email: z.string().email().optional(),
}).strict();

export const updateProspectSchema = z
  .object({
    currentStage: z.enum(['prospect', 'appointment', 'sales']).optional(),
    appointmentDate: z.string().optional(),
    appointmentStartTime: z.string().optional(),
    appointmentEndTime: z.string().optional(),
    appointmentLocation: z.string().optional(),
    appointmentStatus: z
      .enum(['not_done', 'scheduled', 'rescheduled', 'kiv', 'done', 'declined'])
      .optional(),
    salesMeetingStages: z
      .array(z.enum(['social', 'factFind', 'presentation']))
      .optional(),
    products: z
      .array(z.object({ productName: z.string(), amount: z.number() }))
      .optional(),
    salesOutcome: z.enum(['kiv', 'successful', 'unsuccessful']).optional(),
    unsuccessfulReason: z.string().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })
  .refine(
    (data) => data.salesOutcome !== 'unsuccessful' || !!data.unsuccessfulReason,
    {
      message: 'unsuccessfulReason is required when salesOutcome is unsuccessful',
      path: ['unsuccessfulReason'],
    },
  );

/******************************************************************************
                            Router
******************************************************************************/

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

router.put(
  '/:prospectId',
  authenticate,
  validate(updateProspectSchema),
  (req, res, next) =>
    prospectController.update(req as unknown as IUpdateProspectReq, res, next),
);

export default router;
