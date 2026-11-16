import express from 'express';
import { z } from 'zod';

import type {
  ILoginReq,
  ILogoutReq,
  IMeReq,
  IRegisterReq,
  IVerifyLoginReq,
} from '@src/controllers/auth.controller';
import authController from '@src/controllers/auth.controller';
import { authenticate } from '@src/middleware/auth';
import { validate } from '@src/middleware/validate';

/******************************************************************************
                            Zod Schema
******************************************************************************/

export const registerSchema = z.object({
  fullName: z.string().min(1),
  agentCode: z.string().min(1),
  email: z.string().email(),
  groupId: z.string().uuid(),
  location: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().email(),
});

export const verifyLoginSchema = z.object({
  email: z.string().email(),
  session: z.string().min(1),
  code: z.string().min(1),
});

/******************************************************************************
                            Router
******************************************************************************/

const router = express.Router();

router.post('/register', validate(registerSchema), (req, res, next) =>
  authController.register(req as unknown as IRegisterReq, res, next),
);

router.post('/login', validate(loginSchema), (req, res, next) =>
  authController.login(req as unknown as ILoginReq, res, next),
);

router.post('/login/verify', validate(verifyLoginSchema), (req, res, next) =>
  authController.verifyLogin(req as unknown as IVerifyLoginReq, res, next),
);

router.post('/logout', (req, res, next) =>
  authController.logout(req as unknown as ILogoutReq, res, next),
);

router.get('/me', authenticate, (req, res, next) =>
  authController.me(req as unknown as IMeReq, res, next),
);

export default router;
