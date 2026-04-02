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

const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?([+-]\d{2}:\d{2}|Z)$/;

function isNotPastDateTime(dateStr: string): boolean {
  const input = new Date(dateStr);
  return !isNaN(input.getTime()) && input >= new Date();
}

const isoDateTimeField = z
  .string()
  .regex(ISO_DATETIME_REGEX, 'Must be ISO 8601 with timezone (e.g. 2026-04-03T09:00:00+08:00)');

export const createEventSchema = z
  .object({
    title: z.string().min(1),
    startDate: isoDateTimeField.refine(isNotPastDateTime, { message: 'startDate cannot be in the past' }),
    endDate: isoDateTimeField,
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
  )
  .refine(
    (data) => new Date(data.endDate) > new Date(data.startDate),
    { message: 'endDate must be after startDate', path: ['endDate'] },
  );

export const updateEventSchema = z
  .object({
    title: z.string().min(1).optional(),
    startDate: isoDateTimeField.refine(isNotPastDateTime, { message: 'startDate cannot be in the past' }).optional(),
    endDate: isoDateTimeField.optional(),
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
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.endDate) > new Date(data.startDate);
      }
      return true;
    },
    { message: 'endDate must be after startDate', path: ['endDate'] },
  );

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
