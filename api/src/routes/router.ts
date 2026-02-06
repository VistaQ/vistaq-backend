import { Router } from 'express';

import AuthController from '@src/controllers/AuthController';
import { authenticate } from '@src/middleware/auth';
import { requireAdmin } from '@src/middleware/roleCheck';

/******************************************************************************
                                Setup
******************************************************************************/

const router = Router();

/******************************************************************************
                            Auth Routes (Public)
******************************************************************************/

// POST /api/auth/login - Login with email and password
router.post('/auth/login', AuthController.login);

/******************************************************************************
                        Auth Routes (Protected)
******************************************************************************/

// GET /api/auth/me - Get current user info (requires authentication)
router.get('/auth/me', authenticate, AuthController.getCurrentUser);

// POST /api/auth/create-user - Create new user (admin only)
router.post(
  '/auth/create-user',
  authenticate,
  requireAdmin,
  AuthController.createUser,
);

/******************************************************************************
                            Export
******************************************************************************/

export default router;
