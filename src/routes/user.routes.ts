import express from 'express';
import { z } from 'zod';

import userController, {
  ICreateUserReq,
  IDeleteUserReq,
  IGetUserByIdReq,
  IUpdateUserReq,
} from '@src/controllers/user.controller';
import { IBaseReq } from '@src/models/interfaces/base.interface';
import { authenticate } from '@src/middleware/auth';
import { validate } from '@src/middleware/validate';

/******************************************************************************
                            Zod Schema
******************************************************************************/

export const updateUserSchema = z
  .object({
    email: z.string().email().optional(),
    name: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    agency: z.string().min(1).optional(),
    location: z.string().min(1).optional(),
    role: z.enum(['admin', 'master_trainer', 'trainer', 'agent']).optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const createUserSchema = z
  .object({
    email: z.string().email(),
    name: z.string().min(1),
    password: z
      .string()
      .min(6, 'Password must be at least 6 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one digit')
      .regex(
        /[^a-zA-Z0-9]/,
        'Password must contain at least one special character',
      ),
    role: z.enum(['admin', 'master_trainer', 'trainer', 'agent']),
    agentCode: z.string().min(1).optional(),
  })
  .refine((data) => data.role !== 'agent' || !!data.agentCode, {
    message: 'agentCode is required when role is agent',
    path: ['agentCode'],
  });

/******************************************************************************
                            Router
******************************************************************************/

const router = express.Router();

router.get(
  '/',
  authenticate,
  (req, res, next) =>
    userController.getAll(req as unknown as IBaseReq, res, next),
);

router.get(
  '/:userId',
  authenticate,
  (req, res, next) =>
    userController.getById(req as unknown as IGetUserByIdReq, res, next),
);

router.put(
  '/:userId',
  authenticate,
  validate(updateUserSchema),
  (req, res, next) =>
    userController.update(req as unknown as IUpdateUserReq, res, next),
);

router.post(
  '/',
  authenticate,
  validate(createUserSchema),
  (req, res, next) =>
    userController.create(req as unknown as ICreateUserReq, res, next),
);

router.delete(
  '/:userId',
  authenticate,
  (req, res, next) =>
    userController.delete(req as unknown as IDeleteUserReq, res, next),
);

export default router;
