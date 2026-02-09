import { Router } from 'express';

import AuthController from '@src/controllers/AuthController';
import GroupController from '@src/controllers/groupController';
import ProspectsController from '@src/controllers/prospectsController';
import UserController from '@src/controllers/userController';
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
                        User Routes (Protected)
******************************************************************************/

// GET /api/users/me - Get current user's full profile
router.get('/users/me', authenticate, UserController.getMe);

// GET /api/users/group/:groupId - Get all users in a specific group
router.get(
  '/users/group/:groupId',
  authenticate,
  UserController.getUsersByGroup,
);

// GET /api/users - Get all users (with optional filters)
router.get('/users', authenticate, UserController.getAllUsers);

// GET /api/users/:userId - Get a specific user by ID
router.get('/users/:userId', authenticate, UserController.getUserById);

// PUT /api/users/:userId - Update user information
router.put('/users/:userId', authenticate, UserController.updateUser);

// PATCH /api/users/:userId/status - Update user status (admin only)
router.patch(
  '/users/:userId/status',
  authenticate,
  requireAdmin,
  UserController.updateUserStatus,
);

// DELETE /api/users/:userId - Delete user (admin only)
router.delete(
  '/users/:userId',
  authenticate,
  requireAdmin,
  UserController.deleteUser,
);

/******************************************************************************
                        Prospects Routes (Protected)
******************************************************************************/

// POST /api/prospects - Create a new prospect (prospect stage)
router.post('/prospects', authenticate, ProspectsController.createProspect);

// GET /api/prospects/my-prospects - Get current user's prospects

// GET /api/prospects/group/:groupId - Get prospects for a specific group (manager/admin only)
router.get(
  '/prospects/group/:groupId',
  authenticate,
  requireAdminOrManager,
  ProspectsController.getGroupProspects,
);

// GET /api/prospects/:id - Get a specific prospect by ID
router.get('/prospects/:id', authenticate, ProspectsController.getProspect);

// PUT /api/prospects/:id - Update a prospect
router.put('/prospects/:id', authenticate, ProspectsController.updateProspect);

// GET /api/admin/all-prospects - Get all prospects (admin only)
router.get(
  '/admin/all-prospects',
  authenticate,
  requireAdmin,
  ProspectsController.getAdminAllProspects,
);

/******************************************************************************
                        Group Routes (Protected)
******************************************************************************/

// POST /api/admin/groups - Create a new group (admin only)
router.post(
  '/admin/groups',
  authenticate,
  requireAdmin,
  GroupController.createGroup,
);

// PUT /api/admin/groups/:groupId - Update a group (admin only)
router.put(
  '/admin/groups/:groupId',
  authenticate,
  requireAdmin,
  GroupController.updateGroup,
);

// DELETE /api/admin/groups/:groupId - Delete a group (admin only)
router.delete(
  '/admin/groups/:groupId',
  authenticate,
  requireAdmin,
  GroupController.deleteGroup,
);

// GET /api/groups - Get all groups (trainers see managed groups, admin sees all)
router.get('/groups', authenticate, GroupController.getAllGroups);

// GET /api/groups/:groupId - Get a specific group by ID
router.get('/groups/:groupId', authenticate, GroupController.getGroup);

/******************************************************************************
                            Export
******************************************************************************/

export default router;
