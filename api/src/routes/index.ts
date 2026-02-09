/**
 * API Routes - Main routing configuration
 *
 * This file defines all API endpoints and applies appropriate middleware
 * for authentication and authorization.
 */
import express from 'express';

import { authenticate } from '@src/middleware/auth';
import { requireRole } from '@src/middleware/roleCheck';

// Import all controllers
import authController from '@src/controllers/AuthController';
import prospectsController from '@src/controllers/prospectsController';
import groupController from '@src/controllers/groupController';
import userController from '@src/controllers/userController';

const router = express.Router();

/******************************************************************************
                        PUBLIC ROUTES (No authentication)
******************************************************************************/

// Authentication
router.post('/auth/login', authController.login);

/******************************************************************************
                    PROTECTED ROUTES (Authentication required)
******************************************************************************/

// Apply authentication middleware to all routes below
router.use(authenticate);

// ===== USER ENDPOINTS =====

/**
 * GET /users/me
 * Get current user's full profile
 * Accessible by: All authenticated users
 */
router.get('/users/me', userController.getMe);

/**
 * GET /users/:userId
 * Get a specific user by ID
 * Accessible by: Admin (any user), Trainers (users in managed groups), Group Leaders (users in same group), User (self)
 */
router.get('/users/:userId', userController.getUserById);

/**
 * GET /users
 * Get all users with optional filters
 * Query params: role, groupId, status, limit
 * Accessible by: Admin, Trainers
 */
router.get('/users', userController.getAllUsers);

/**
 * GET /users/group/:groupId
 * Get all users in a specific group
 * Accessible by: Admin, Trainers (for managed groups), Group Leaders (for own group)
 */
router.get('/users/group/:groupId', userController.getUsersByGroup);

/**
 * PUT /users/:userId
 * Update user information
 * Accessible by: Admin (any user, full fields), User (self, limited fields)
 */
router.put('/users/:userId', userController.updateUser);

// ===== PROSPECTS ENDPOINTS =====

/**
 * POST /prospects
 * Create a new prospect
 * Accessible by: Agents, Group Leaders, Managers
 */
router.post('/prospects', prospectsController.createProspect);

/**
 * GET /prospects/my-prospects
 * Get current user's prospects
 * Query params: limit (optional)
 * Accessible by: All authenticated users
 */
router.get('/prospects/my-prospects', prospectsController.getMyProspects);

/**
 * GET /prospects/:id
 * Get a specific prospect by ID
 * Accessible by: Admin (any prospect), Manager (group's prospects), Agent (own prospects)
 */
router.get('/prospects/:id', prospectsController.getProspect);

/**
 * PUT /prospects/:id
 * Update a prospect
 * Accessible by: Admin (any prospect), Agent (own prospects)
 */
router.put('/prospects/:id', prospectsController.updateProspect);

/**
 * GET /prospects/group/:groupId
 * Get prospects for a specific group
 * Query params: limit (optional)
 * Accessible by: Admin, Manager (own group), Agents (cannot access)
 */
router.get('/prospects/group/:groupId', prospectsController.getGroupProspects);

// ===== GROUP ENDPOINTS =====

/**
 * GET /groups/:groupId
 * Get a specific group by ID (includes member details)
 * Accessible by: Admin, Trainers (for managed groups), Group Leaders (for own group)
 */
router.get('/groups/:groupId', groupController.getGroup);

/**
 * GET /groups
 * Get all groups
 * Accessible by: Admin (all groups), Trainers (managed groups), Group Leaders (own group)
 */
router.get('/groups', groupController.getAllGroups);

/******************************************************************************
                        ADMIN ONLY ROUTES
******************************************************************************/

// ===== ADMIN - USER MANAGEMENT =====

/**
 * POST /admin/users
 * Create a new user
 * Accessible by: Admin only
 */
router.post('/admin/users', requireRole(['admin']), authController.createUser);

/**
 * PATCH /admin/users/:userId/status
 * Update user status (active/inactive)
 * Accessible by: Admin only
 */
router.patch(
  '/admin/users/:userId/status',
  requireRole(['admin']),
  userController.updateUserStatus,
);

/**
 * DELETE /admin/users/:userId
 * Delete a user (permanent deletion)
 * Accessible by: Admin only
 */
router.delete(
  '/admin/users/:userId',
  requireRole(['admin']),
  userController.deleteUser,
);

// ===== ADMIN - PROSPECTS MANAGEMENT =====

/**
 * GET /admin/all-prospects
 * Get all prospects in the system
 * Query params: limit (optional)
 * Accessible by: Admin only
 */
router.get(
  '/admin/all-prospects',
  requireRole(['admin']),
  prospectsController.getAdminAllProspects,
);

// ===== ADMIN - GROUP MANAGEMENT =====

/**
 * POST /admin/groups
 * Create a new group
 * Accessible by: Admin only
 */
router.post('/admin/groups', requireRole(['admin']), groupController.createGroup);

/**
 * PUT /admin/groups/:groupId
 * Update a group
 * Accessible by: Admin only
 */
router.put(
  '/admin/groups/:groupId',
  requireRole(['admin']),
  groupController.updateGroup,
);

/**
 * DELETE /admin/groups/:groupId
 * Delete a group
 * Accessible by: Admin only
 */
router.delete(
  '/admin/groups/:groupId',
  requireRole(['admin']),
  groupController.deleteGroup,
);

/******************************************************************************
                            Export
******************************************************************************/

export default router;
