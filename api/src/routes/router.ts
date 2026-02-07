import { Router } from 'express';

import AuthController from '@src/controllers/AuthController';
import SalesController from '@src/controllers/salesController';
import { authenticate } from '@src/middleware/auth';
import { requireAdmin, requireAdminOrManager } from '@src/middleware/roleCheck';

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
                        Sales Routes (Protected)
******************************************************************************/

// POST /api/sales - Create a new sale (prospect stage)
router.post('/sales', authenticate, SalesController.createSale);

// GET /api/sales/my-sales - Get current user's sales
router.get('/sales/my-sales', authenticate, SalesController.getMySales);

// GET /api/sales/group/:groupId - Get sales for a specific group (manager/admin only)
router.get(
  '/sales/group/:groupId',
  authenticate,
  requireAdminOrManager,
  SalesController.getGroupSales,
);

// GET /api/sales/:id - Get a specific sale by ID
router.get('/sales/:id', authenticate, SalesController.getSale);

// PUT /api/sales/:id - Update a sale
router.put('/sales/:id', authenticate, SalesController.updateSale);

// GET /api/admin/all-sales - Get all sales (admin only)
router.get(
  '/admin/all-sales',
  authenticate,
  requireAdmin,
  SalesController.getAdminAllSales,
);

/******************************************************************************
                            Export
******************************************************************************/

export default router;
