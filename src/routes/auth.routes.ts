import express from 'express';
import { z } from 'zod';

import authController, { ILoginReq, ILogoutReq, IRegisterReq } from '@src/controllers/auth.controller';
import { validate } from '@src/middleware/validate';

/******************************************************************************
                            Zod Schema
******************************************************************************/

export const registerSchema = z.object({
  fullName: z.string().min(1),
  agentCode: z.string().min(1),
  email: z.string().email(),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character')
    .regex(/[0-9]/, 'Password must contain at least one digit'),
  groupId: z.string().uuid(),
  location: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/******************************************************************************
                            Router
******************************************************************************/

const router = express.Router();

router.post(
  '/register',
  validate(registerSchema),
  (req, res, next) => authController.register(req as unknown as IRegisterReq, res, next),
);

router.post(
  '/login',
  validate(loginSchema),
  (req, res, next) => authController.login(req as unknown as ILoginReq, res, next),
);

router.post(
  '/logout',
  (req, res, next) => authController.logout(req as unknown as ILogoutReq, res, next),
);

export default router;
