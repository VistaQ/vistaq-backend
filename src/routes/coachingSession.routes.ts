import express from 'express';
import { z } from 'zod';

import coachingSessionController, {
  ICreateCoachingSessionReq,
  IDeleteCoachingSessionReq,
  IGetCoachingSessionByIdReq,
  IJoinCoachingSessionReq,
  IMarkNonAttendeesReq,
  IUpdateCoachingSessionReq,
} from '@src/controllers/coachingSession.controller';
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

const COACHING_TYPES = ['individual_coaching', 'group_coaching', 'peer_circles', '2_full_days_seminar', '2_hours_online_seminar'] as const;
const TRAINING_MODES = ['online', 'face_to_face'] as const;
const STATUSES = ['upcoming', 'ongoing', 'completed', 'cancelled'] as const;

export const createCoachingSessionSchema = z
  .object({
    coachingType: z.enum(COACHING_TYPES),
    title: z.string().min(1),
    description: z.string().optional(),
    date: z.string()
      .regex(DATE_REGEX, 'Date must be in YYYY-MM-DD format')
      .refine(isNotPastDate, { message: 'Date cannot be in the past' }),
    startTime: z.string().regex(TIME_REGEX, 'Time must be in HH:MM 24-hour format'),
    endTime: z.string().regex(TIME_REGEX, 'Time must be in HH:MM 24-hour format'),
    trainingMode: z.enum(TRAINING_MODES),
    link: z.string().optional(),
    status: z.enum(STATUSES).optional(),
    groupIds: z
      .array(z.string().uuid())
      .refine((ids) => new Set(ids).size === ids.length, { message: 'groupIds must not contain duplicates' })
      .optional(),
    agentIds: z
      .array(z.string().uuid())
      .refine((ids) => new Set(ids).size === ids.length, { message: 'agentIds must not contain duplicates' })
      .optional(),
  })
  .strict();
// NOTE: No cross-field refinement — both groupIds and agentIds being absent means all-audience

export const updateCoachingSessionSchema = z
  .object({
    coachingType: z.enum(COACHING_TYPES).optional(),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    date: z.string()
      .regex(DATE_REGEX, 'Date must be in YYYY-MM-DD format')
      .refine(isNotPastDate, { message: 'Date cannot be in the past' })
      .optional(),
    startTime: z.string().regex(TIME_REGEX, 'Time must be in HH:MM 24-hour format').optional(),
    endTime: z.string().regex(TIME_REGEX, 'Time must be in HH:MM 24-hour format').optional(),
    trainingMode: z.enum(TRAINING_MODES).optional(),
    link: z.string().optional(),
    status: z.enum(STATUSES).optional(),
    groupIds: z
      .array(z.string().uuid())
      .refine((ids) => new Set(ids).size === ids.length, { message: 'groupIds must not contain duplicates' })
      .optional(),
    agentIds: z
      .array(z.string().uuid())
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
  validate(createCoachingSessionSchema),
  (req, res, next) =>
    coachingSessionController.create(req as unknown as ICreateCoachingSessionReq, res, next),
);

router.get(
  '/',
  authenticate,
  (req, res, next) =>
    coachingSessionController.getAll(req as unknown as IBaseReq, res, next),
);

router.get(
  '/:sessionId',
  authenticate,
  (req, res, next) =>
    coachingSessionController.getById(req as unknown as IGetCoachingSessionByIdReq, res, next),
);

router.put(
  '/:sessionId',
  authenticate,
  validate(updateCoachingSessionSchema),
  (req, res, next) =>
    coachingSessionController.update(req as unknown as IUpdateCoachingSessionReq, res, next),
);

router.delete(
  '/:sessionId',
  authenticate,
  (req, res, next) =>
    coachingSessionController.delete(req as unknown as IDeleteCoachingSessionReq, res, next),
);

router.post(
  '/:sessionId/join',
  authenticate,
  (req, res, next) =>
    coachingSessionController.join(req as unknown as IJoinCoachingSessionReq, res, next),
);

router.post(
  '/:sessionId/mark-non-attendees',
  authenticate,
  (req, res, next) =>
    coachingSessionController.markNonAttendees(req as unknown as IMarkNonAttendeesReq, res, next),
);

export default router;
