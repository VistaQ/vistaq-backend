/**
 * API Routes - Main routing configuration
 *
 * This file defines all API endpoints and applies appropriate middleware
 * for authentication and authorization.
 */
import express from 'express';
import { authenticate } from 'middleware/auth';
import { requireRole } from 'middleware/roleCheck';

// Import all controllers
import authController from '@src/controllers/AuthController';
import eventController from '@src/controllers/eventController';
import groupController from '@src/controllers/groupController';
import prospectsController from '@src/controllers/prospectsController';
import userController from '@src/controllers/userController';

const router = express.Router();

/******************************************************************************
                        PUBLIC ROUTES (No authentication)
******************************************************************************/

// Authentication
router.post('/auth/login', authController.login);
router.post('/auth/register', authController.register);
router.post('/auth/forgot-password', authController.forgotPassword);

// Public group listing — used by the self-signup flow to populate the group picker
router.get('/groups/public', groupController.getPublicGroups);

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
 * PATCH /users/me/password
 * Change current user's own password
 * Accessible by: All authenticated users
 */
router.patch('/users/me/password', userController.changeMyPassword);

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
 * GET /prospects/managed-groups
 * Get all prospects across all of the trainer's managed groups
 * Query params: limit (optional, applied per group)
 * Accessible by: Trainer
 */
router.get(
  '/prospects/managed-groups',
  prospectsController.getManagedGroupsProspects,
);

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

// ===== EVENT ENDPOINTS =====

/**
 * POST /events
 * Create a new event/meetup
 * Accessible by: Admin, Master Trainer, Trainer, Group Leader
 */
router.post('/events', eventController.createEvent);

/**
 * GET /events/my-events
 * Get upcoming events relevant to the authenticated user's groups
 * Accessible by: All authenticated users
 * NOTE: Must be registered before /events/:eventId to avoid param collision
 */
router.get('/events/my-events', eventController.getMyEvents);

/**
 * GET /events
 * Get all events with optional filters (status, groupId)
 * Accessible by: Admin only
 */
router.get('/events', eventController.getAllEvents);

/**
 * GET /events/:eventId
 * Get a specific event by ID
 * Accessible by: All authenticated users (role-restricted)
 */
router.get('/events/:eventId', eventController.getEvent);

/**
 * PUT /events/:eventId
 * Update an event
 * Accessible by: Admin (any event), Creator (own event)
 */
router.put('/events/:eventId', eventController.updateEvent);

/**
 * DELETE /events/:eventId
 * Delete an event
 * Accessible by: Admin (any event), Creator (own event)
 */
router.delete('/events/:eventId', eventController.deleteEvent);

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
 * PATCH /admin/users/:userId/password
 * Reset a user's password
 * Accessible by: Admin only
 */
router.patch(
  '/admin/users/:userId/password',
  requireRole(['admin']),
  userController.resetUserPassword,
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
 * Accessible by: Admin, Master Trainer
 */
router.get(
  '/admin/all-prospects',
  requireRole(['admin', 'master_trainer']),
  prospectsController.getAdminAllProspects,
);

/**
 * DELETE /prospects/:id
 * Delete a prospect
 * Accessible by: Admin (any prospect), Agent/Group Leader (own prospects only)
 */
router.delete('/prospects/:id', prospectsController.deleteProspect);

// ===== ADMIN - GROUP MANAGEMENT =====

/**
 * POST /admin/groups
 * Create a new group
 * Accessible by: Admin only
 */
router.post(
  '/admin/groups',
  requireRole(['admin']),
  groupController.createGroup,
);

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
