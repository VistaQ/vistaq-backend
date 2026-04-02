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

// Wire up the reward points configs for coaching sessions
// Test the attendance too

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

const COACHING_TYPES = [
  'individual_coaching',
  'group_coaching',
  'peer_circles',
  '2_full_days_seminar',
  '2_hours_online_seminar',
] as const;
const TRAINING_MODES = ['online', 'face_to_face'] as const;
const STATUSES = ['upcoming', 'ongoing', 'completed', 'cancelled'] as const;

export const createCoachingSessionSchema = z
  .object({
    coachingType: z.enum(COACHING_TYPES),
    title: z.string().min(1),
    description: z.string().optional(),
    startDate: isoDateTimeField.refine(isNotPastDateTime, { message: 'startDate cannot be in the past' }),
    endDate: isoDateTimeField,
    trainingMode: z.enum(TRAINING_MODES),
    link: z.string().optional(),
    status: z.enum(STATUSES).optional(),
    groupIds: z
      .array(z.string().uuid())
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'groupIds must not contain duplicates',
      })
      .optional(),
    agentIds: z
      .array(z.string().uuid())
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'agentIds must not contain duplicates',
      })
      .optional(),
  })
  .strict()
  .refine(
    (data) => new Date(data.endDate) > new Date(data.startDate),
    { message: 'endDate must be after startDate', path: ['endDate'] },
  );
// NOTE: No cross-field refinement for groupIds/agentIds — both being absent means all-audience

export const updateCoachingSessionSchema = z
  .object({
    coachingType: z.enum(COACHING_TYPES).optional(),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    startDate: isoDateTimeField.refine(isNotPastDateTime, { message: 'startDate cannot be in the past' }).optional(),
    endDate: isoDateTimeField.optional(),
    trainingMode: z.enum(TRAINING_MODES).optional(),
    link: z.string().optional(),
    status: z.enum(STATUSES).optional(),
    groupIds: z
      .array(z.string().uuid())
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'groupIds must not contain duplicates',
      })
      .optional(),
    agentIds: z
      .array(z.string().uuid())
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'agentIds must not contain duplicates',
      })
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
  validate(createCoachingSessionSchema),
  (req, res, next) =>
    coachingSessionController.create(
      req as unknown as ICreateCoachingSessionReq,
      res,
      next,
    ),
);

router.get('/', authenticate, (req, res, next) =>
  coachingSessionController.getAll(req as unknown as IBaseReq, res, next),
);

router.get('/:sessionId', authenticate, (req, res, next) =>
  coachingSessionController.getById(
    req as unknown as IGetCoachingSessionByIdReq,
    res,
    next,
  ),
);

router.put(
  '/:sessionId',
  authenticate,
  validate(updateCoachingSessionSchema),
  (req, res, next) =>
    coachingSessionController.update(
      req as unknown as IUpdateCoachingSessionReq,
      res,
      next,
    ),
);

router.delete('/:sessionId', authenticate, (req, res, next) =>
  coachingSessionController.delete(
    req as unknown as IDeleteCoachingSessionReq,
    res,
    next,
  ),
);

router.post('/:sessionId/join', authenticate, (req, res, next) =>
  coachingSessionController.join(
    req as unknown as IJoinCoachingSessionReq,
    res,
    next,
  ),
);

router.post('/:sessionId/mark-non-attendees', authenticate, (req, res, next) =>
  coachingSessionController.markNonAttendees(
    req as unknown as IMarkNonAttendeesReq,
    res,
    next,
  ),
);

export default router;
