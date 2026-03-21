import express from 'express';
import { z } from 'zod';

import eventController, {
  ICreateEventReq,
  IGetEventByIdReq,
  IUpdateEventReq,
} from '@src/controllers/event.controller';
import { authenticate } from '@src/middleware/auth';
import { validate } from '@src/middleware/validate';
import { IBaseReq } from '@src/models/interfaces/base.interface';

/******************************************************************************
                            Zod Schemas
******************************************************************************/

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function isNotPastDate(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const inputDate = new Date(dateStr);
  return inputDate >= today;
}

export const createEventSchema = z
  .object({
    title: z.string().min(1),
    date: z
      .string()
      .regex(DATE_REGEX, 'Date must be in YYYY-MM-DD format')
      .refine(isNotPastDate, { message: 'Date cannot be in the past' }),
    startTime: z.string().regex(TIME_REGEX, 'Time must be in HH:MM 24-hour format'),
    endTime: z.string().regex(TIME_REGEX, 'Time must be in HH:MM 24-hour format'),
    status: z.enum(['upcoming', 'completed', 'cancelled']).optional(),
    type: z.enum(['Face to Face', 'Online']),
    link: z.string().url('Link must be a valid URL').optional(),
    venue: z.string().optional(),
    description: z.string().min(1),
    groupIds: z
      .array(z.string().uuid())
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'groupIds must not contain duplicates' })
      .optional(),
    agentIds: z
      .array(z.string().uuid())
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'agentIds must not contain duplicates' })
      .optional(),
  })
  .strict()
  .refine(
    (data) => data.groupIds !== undefined || data.agentIds !== undefined,
    { message: 'At least one of groupIds or agentIds must be provided' },
  );

export const updateEventSchema = z
  .object({
    title: z.string().min(1).optional(),
    date: z
      .string()
      .regex(DATE_REGEX, 'Date must be in YYYY-MM-DD format')
      .refine(isNotPastDate, { message: 'Date cannot be in the past' })
      .optional(),
    startTime: z.string().regex(TIME_REGEX, 'Time must be in HH:MM 24-hour format').optional(),
    endTime: z.string().regex(TIME_REGEX, 'Time must be in HH:MM 24-hour format').optional(),
    status: z.enum(['upcoming', 'completed', 'cancelled']).optional(),
    type: z.enum(['Face to Face', 'Online']).optional(),
    link: z.string().url('Link must be a valid URL').optional(),
    venue: z.string().optional(),
    description: z.string().min(1).optional(),
    groupIds: z
      .array(z.string().uuid())
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'groupIds must not contain duplicates' })
      .optional(),
    agentIds: z
      .array(z.string().uuid())
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'agentIds must not contain duplicates' })
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

/******************************************************************************
                            Router
******************************************************************************/

const router = express.Router();

router.post(
  '/',
  authenticate,
  validate(createEventSchema),
  (req, res, next) =>
    eventController.create(req as unknown as ICreateEventReq, res, next),
);

router.put(
  '/:eventId',
  authenticate,
  validate(updateEventSchema),
  (req, res, next) =>
    eventController.update(req as unknown as IUpdateEventReq, res, next),
);

router.get(
  '/',
  authenticate,
  (req, res, next) =>
    eventController.getAll(req as unknown as IBaseReq, res, next),
);

router.get(
  '/:eventId',
  authenticate,
  (req, res, next) =>
    eventController.getById(req as unknown as IGetEventByIdReq, res, next),
);

export default router;
