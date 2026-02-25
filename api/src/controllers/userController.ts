/**
 * User Controller - Handle user management operations
 */
import { Request, Response } from 'express';
import * as admin from 'firebase-admin';

import HttpStatusCodes from '@src/common/constants/HttpStatusCodes';
import { adminAuth, db } from '@src/config/firebase';
import {
  DeleteUserResponse,
  GetUsersByGroupResponse,
  GetUsersQuery,
  GetUsersResponse,
  UpdateUserRequest,
  UpdateUserResponse,
  UpdateUserStatusRequest,
  UserData,
} from '@src/types/user.types';

const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;
const USERS_COLLECTION = 'users';
const GROUPS_COLLECTION = 'groups';

/******************************************************************************
                            Helper Functions
******************************************************************************/

/**
 * Get user document by UID
 */
async function getUserDocument(
  uid: string,
): Promise<admin.firestore.DocumentData | null> {
  try {
    const userDoc = await db.collection(USERS_COLLECTION).doc(uid).get();
    if (!userDoc.exists) {
      return null;
    }
    return { uid: userDoc.id, ...userDoc.data() };
  } catch (error) {
    console.error(`Error fetching user ${uid}:`, error);
    throw new Error('Failed to fetch user');
  }
}

/**
 * Get group document by ID
 */
async function getGroupDocument(
  groupId: string,
): Promise<admin.firestore.DocumentData | null> {
  try {
    const groupDoc = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
    if (!groupDoc.exists) {
      return null;
    }
    return { id: groupDoc.id, ...groupDoc.data() };
  } catch (error) {
    console.error(`Error fetching group ${groupId}:`, error);
    throw new Error('Failed to fetch group');
  }
}

/**
 * Check if user can view another user based on role and permissions
 */
function canViewUser(
  requester: admin.firestore.DocumentData,
  targetUser: admin.firestore.DocumentData,
): boolean {
  const requesterId = requester.uid;
  const targetUserId = targetUser.uid;

  // Admin can view anyone
  if (requester.role === 'admin') {
    return true;
  }

  // User can always view themselves
  if (requesterId === targetUserId) {
    return true;
  }

  // Master Trainer can view agents and group leaders
  if (
    requester.role === 'master_trainer' &&
    (targetUser.role === 'agent' || targetUser.role === 'group_leader')
  ) {
    return true;
  }

  // Trainer can view users in their managed groups
  if (
    requester.role === 'trainer' &&
    requester.managedGroupIds &&
    Array.isArray(requester.managedGroupIds) &&
    targetUser.groupId &&
    requester.managedGroupIds.includes(targetUser.groupId)
  ) {
    return true;
  }

  // Group Leader can view users in their own group
  if (
    requester.role === 'group_leader' &&
    requester.groupId &&
    requester.groupId === targetUser.groupId
  ) {
    return true;
  }

  return false;
}

/**
 * Check if user can update another user
 */
function canUpdateUser(
  requester: admin.firestore.DocumentData,
  targetUserId: string,
): { canUpdate: boolean; adminUpdate: boolean } {
  const requesterId = requester.uid;

  // Admin can update anyone with full permissions
  if (requester.role === 'admin') {
    return { canUpdate: true, adminUpdate: true };
  }

  // User can update themselves with limited permissions
  if (requesterId === targetUserId) {
    return { canUpdate: true, adminUpdate: false };
  }

  return { canUpdate: false, adminUpdate: false };
}

/**
 * Validate role string
 */
function isValidRole(role: string): boolean {
  const validRoles = [
    'admin',
    'master_trainer',
    'trainer',
    'group_leader',
    'agent',
  ];
  return validRoles.includes(role);
}

// Discriminated union returned by handleRoleChange so callers can send the
// correct HTTP status code without catching generic errors.
type RoleChangeResult =
  | {
      ok: true;
      // Extra fields to merge into the main user document update
      additionalUpdates: Record<string, unknown>;
      // Other documents to update atomically in the same batch
      sideEffects: Array<{
        ref: admin.firestore.DocumentReference;
        data: Record<string, unknown>;
      }>;
    }
  | { ok: false; statusCode: number; error: string };

/**
 * Validate a role transition and compute all side-effect writes needed to
 * keep the users and groups collections consistent.
 *
 * Returns either an error (with the HTTP status code to use) or the extra
 * fields to add to the main user update plus any additional document writes
 * that must be committed atomically alongside the user update.
 *
 * Handles four cases:
 *   1. agent          → group_leader      (promote; update group leadership)
 *   2. group_leader   → agent             (demote;  requires newLeaderId)
 *   3. any            → trainer/master_trainer (validate no group membership)
 *   4. trainer/master_trainer → agent/group_leader (validate no managed groups)
 */
async function handleRoleChange(
  userId: string,
  userData: admin.firestore.DocumentData,
  currentRole: string,
  newRole: string,
  updateData: UpdateUserRequest,
): Promise<RoleChangeResult> {
  const additionalUpdates: Record<string, unknown> = {};
  const sideEffects: Array<{
    ref: admin.firestore.DocumentReference;
    data: Record<string, unknown>;
  }> = [];

  const fromTrainer =
    currentRole === 'trainer' || currentRole === 'master_trainer';
  const toTrainer = newRole === 'trainer' || newRole === 'master_trainer';

  const effectiveGroupId: string | null =
    (userData.groupId as string | null) ?? null;

  // ---------------------------------------------------------------------------
  // Case 3: Any role → Trainer / Master Trainer
  // Trainers are not members of groups; block if one is set (or being set).
  // ---------------------------------------------------------------------------
  if (toTrainer) {
    if (effectiveGroupId) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Trainers cannot be members of groups. Remove from group first.',
      };
    }

    // Ensure managedGroupIds is initialised for brand-new trainers
    if (!userData.managedGroupIds) {
      additionalUpdates.managedGroupIds = [];
    }

    return { ok: true, additionalUpdates, sideEffects };
  }

  // ---------------------------------------------------------------------------
  // Case 4: Trainer / Master Trainer → Agent / Group Leader
  // Must have no managed groups before transitioning away from trainer roles.
  // ---------------------------------------------------------------------------
  if (fromTrainer) {
    const managedGroupIds: string[] = Array.isArray(userData.managedGroupIds)
      ? userData.managedGroupIds
      : [];

    if (managedGroupIds.length > 0) {
      return {
        ok: false,
        statusCode: 400,
        error:
          'Cannot change role while managing groups. Reassign groups first.',
      };
    }

    // Clear the trainer-only field
    additionalUpdates.managedGroupIds = null;

    // Fall through: if destination is group_leader, Case 1 logic below will
    // also run to update the group's leadership fields.
  }

  // ---------------------------------------------------------------------------
  // Case 2: Group Leader → Agent
  // Clear the group's leadership fields. The frontend handles role changes
  // separately — the admin will promote the new leader in a second request.
  // ---------------------------------------------------------------------------
  if (currentRole === 'group_leader' && newRole === 'agent') {
    // Find the group this user currently leads (if any)
    const groupsSnapshot = await db
      .collection(GROUPS_COLLECTION)
      .where('leaderId', '==', userId)
      .limit(1)
      .get();

    if (!groupsSnapshot.empty) {
      const groupRef = groupsSnapshot.docs[0].ref;

      // Clear leadership fields so the group doesn't hold a stale reference
      sideEffects.push({
        ref: groupRef,
        data: {
          leaderId: null,
          leaderName: null,
          leaderEmail: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
      });

      console.log(
        `[RoleChange] Cleared leadership of group ${groupsSnapshot.docs[0].id} (${userId} demoted to agent)`,
      );
    }

    return { ok: true, additionalUpdates, sideEffects };
  }

  // ---------------------------------------------------------------------------
  // Case 1: Any non-trainer role → Group Leader
  // (Covers agent → group_leader and trainer → group_leader via Case 4 above.)
  // Update the target group's leadership to point to this user.
  // ---------------------------------------------------------------------------
  if (newRole === 'group_leader') {
    if (!effectiveGroupId) {
      return {
        ok: false,
        statusCode: 400,
        error:
          'User must be assigned to a group before becoming a group leader',
      };
    }

    const groupRef = db.collection(GROUPS_COLLECTION).doc(effectiveGroupId);
    const groupDoc = await groupRef.get();

    if (!groupDoc.exists) {
      return {
        ok: false,
        statusCode: 404,
        error: 'Group not found',
      };
    }

    sideEffects.push({
      ref: groupRef,
      data: {
        leaderId: userId,
        leaderName: userData.name as string,
        leaderEmail: userData.email as string,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });

    console.log(
      `[RoleChange] User ${userId} promoted to group_leader of group ${effectiveGroupId}`,
    );
  }

  return { ok: true, additionalUpdates, sideEffects };
}

/******************************************************************************
                            Controller Functions
******************************************************************************/

/**
 * Get current user's full profile
 * GET /users/me
 */
export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Not authenticated',
      });
      return;
    }

    console.log(`[GetMe] Fetching profile for user ${req.user.uid}...`);

    // Fetch fresh user data from Firestore
    const userData = await getUserDocument(req.user.uid);

    if (!userData) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'User document not found',
      });
      return;
    }

    res.status(HttpStatusCodes.OK).json({
      user: userData as UserData,
    });
  } catch (error) {
    console.error('Error in getMe:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch user profile',
    });
  }
}

/**
 * Get a specific user by ID
 * GET /users/:userId
 */
export async function getUserById(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Not authenticated',
      });
      return;
    }

    const userId = Array.isArray(req.params.userId)
      ? req.params.userId[0]
      : req.params.userId;

    if (!userId) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'User ID is required',
      });
      return;
    }

    console.log(
      `[GetUserById] User ${req.user.uid} requesting user ${userId}...`,
    );

    // Fetch target user
    const targetUser = await getUserDocument(userId);

    if (!targetUser) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'User not found',
      });
      return;
    }

    // Check permissions
    if (!canViewUser(req.user, targetUser)) {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'You do not have permission to view this user',
      });
      return;
    }

    res.status(HttpStatusCodes.OK).json({
      user: targetUser as UserData,
    });
  } catch (error) {
    console.error('Error in getUserById:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch user',
    });
  }
}

/**
 * Get all users (with optional filters)
 * GET /users
 */
export async function getAllUsers(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Not authenticated',
      });
      return;
    }

    // Only admin, master trainers, and trainers can view all users
    const isAdmin = req.user.role === 'admin';
    const isMasterTrainer = req.user.role === 'master_trainer';
    const isTrainer = req.user.role === 'trainer';

    if (!isAdmin && !isMasterTrainer && !isTrainer) {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'You do not have permission to view users',
      });
      return;
    }

    const { role, groupId, status, limit } = req.query as GetUsersQuery;

    console.log(
      `[GetAllUsers] User ${req.user.uid} (${req.user.role}) querying users...`,
    );

    // Build query
    let query: admin.firestore.Query = db.collection(USERS_COLLECTION);

    // Apply filters
    if (role) {
      query = query.where('role', '==', role);
    }

    if (groupId) {
      query = query.where('groupId', '==', groupId);
    }

    if (status) {
      query = query.where('status', '==', status);
    }

    // Master Trainer sees all agents and group leaders
    if (isMasterTrainer) {
      query = query.where('role', 'in', ['agent', 'group_leader']);
    }

    // If trainer (not admin or master trainer), only show users in their managed groups
    if (isTrainer && !isAdmin) {
      const managedGroupIds = req.user.managedGroupIds || [];

      if (managedGroupIds.length === 0) {
        // Trainer has no managed groups
        res.status(HttpStatusCodes.OK).json({
          users: [],
          count: 0,
        } as GetUsersResponse);
        return;
      }

      // Firestore 'in' operator has a limit of 10 items
      if (managedGroupIds.length > 10) {
        console.warn(
          `[GetAllUsers] Trainer has ${managedGroupIds.length} managed groups (limit: 10)`,
        );
      }

      const limitedGroupIds = managedGroupIds.slice(0, 10);
      query = query.where('groupId', 'in', limitedGroupIds);
    }

    // Apply limit
    const limitNum = limit ? parseInt(limit, 10) : 100;
    query = query.limit(limitNum);

    // Execute query
    const snapshot = await query.get();

    const users: UserData[] = snapshot.docs.map((doc) => ({
      uid: doc.id,
      ...doc.data(),
    })) as UserData[];

    console.log(`[GetAllUsers] Found ${users.length} users`);

    const response: GetUsersResponse = {
      users,
      count: users.length,
    };

    res.status(HttpStatusCodes.OK).json(response);
  } catch (error) {
    console.error('Error in getAllUsers:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch users',
    });
  }
}

/**
 * Get all users in a specific group
 * GET /users/group/:groupId
 */
export async function getUsersByGroup(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Not authenticated',
      });
      return;
    }

    const groupId = Array.isArray(req.params.groupId)
      ? req.params.groupId[0]
      : req.params.groupId;

    if (!groupId) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Group ID is required',
      });
      return;
    }

    console.log(
      `[GetUsersByGroup] User ${req.user.uid} requesting users for group ${groupId}...`,
    );

    // Fetch group
    const group = await getGroupDocument(groupId);

    if (!group) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'Group not found',
      });
      return;
    }

    // Check permissions
    const isAdmin = req.user.role === 'admin';
    const isMasterTrainer = req.user.role === 'master_trainer';
    const isTrainerOfGroup =
      req.user.role === 'trainer' &&
      req.user.managedGroupIds?.includes(groupId);
    const isGroupLeader =
      req.user.role === 'group_leader' && req.user.groupId === groupId;

    if (!isAdmin && !isMasterTrainer && !isTrainerOfGroup && !isGroupLeader) {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: "You do not have permission to view this group's users",
      });
      return;
    }

    // Query users in this group
    const snapshot = await db
      .collection(USERS_COLLECTION)
      .where('groupId', '==', groupId)
      .get();

    const users: UserData[] = snapshot.docs.map((doc) => ({
      uid: doc.id,
      ...doc.data(),
    })) as UserData[];

    console.log(
      `[GetUsersByGroup] Found ${users.length} users in group ${groupId}`,
    );

    const response: GetUsersByGroupResponse = {
      users,
      groupName: group.name as string,
    };

    res.status(HttpStatusCodes.OK).json(response);
  } catch (error) {
    console.error('Error in getUsersByGroup:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch users by group',
    });
  }
}

/**
 * Update user information
 * PUT /users/:userId
 */
export async function updateUser(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Not authenticated',
      });
      return;
    }

    const userId = Array.isArray(req.params.userId)
      ? req.params.userId[0]
      : req.params.userId;

    if (!userId) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'User ID is required',
      });
      return;
    }

    console.log(`[UpdateUser] User ${req.user.uid} updating user ${userId}...`);

    // Fetch target user
    const targetUser = await getUserDocument(userId);

    if (!targetUser) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'User not found',
      });
      return;
    }

    // Check permissions
    const { canUpdate, adminUpdate } = canUpdateUser(req.user, userId);

    if (!canUpdate) {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'You do not have permission to update this user',
      });
      return;
    }

    const updateData = req.body as UpdateUserRequest;

    // Collects all fields to write to the target user document
    const updates: Record<string, unknown> = {};

    // Side-effect writes to other documents (group, new leader) accumulated
    // during role-change handling and committed atomically with the user update.
    let sideEffects: Array<{
      ref: admin.firestore.DocumentReference;
      data: Record<string, unknown>;
    }> = [];

    // -------------------------------------------------------------------------
    // Fields all authenticated users can update on their own profile
    // -------------------------------------------------------------------------

    if (updateData.name !== undefined) {
      if (updateData.name.trim().length < 2) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          error: 'Name must be at least 2 characters',
        });
        return;
      }
      updates.name = updateData.name.trim();
    }

    if (updateData.phone !== undefined) {
      updates.phone = updateData.phone.trim();
    }

    if (updateData.location !== undefined) {
      updates.location = updateData.location.trim();
    }

    if (updateData.email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updateData.email)) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          error: 'Invalid email format',
        });
        return;
      }

      // Update Firebase Auth first — will throw if email already exists
      try {
        await adminAuth.updateUser(userId, { email: updateData.email });
      } catch (authError) {
        const code = (authError as { code?: string }).code;
        if (code === 'auth/email-already-exists') {
          res.status(HttpStatusCodes.CONFLICT).json({
            error: 'Email already in use',
          });
          return;
        }
        throw authError;
      }

      updates.email = updateData.email;
      console.log(`[UpdateUser] Email updated for ${userId}`);
    }

    // -------------------------------------------------------------------------
    // Admin-only fields
    // -------------------------------------------------------------------------

    if (adminUpdate) {
      if (updateData.agency !== undefined) {
        updates.agency = updateData.agency.trim();
      }

      if (updateData.agentCode !== undefined) {
        updates.agentCode = updateData.agentCode.trim();
      }

      // Role change — validate first, then delegate consistency work to helper
      if (updateData.role !== undefined) {
        if (!isValidRole(updateData.role)) {
          res.status(HttpStatusCodes.BAD_REQUEST).json({
            error: 'Invalid role',
          });
          return;
        }

        const currentRole = targetUser.role as string;
        const newRole = updateData.role;

        if (currentRole !== newRole) {
          console.log(
            `[UpdateUser] Role change for ${userId}: ${currentRole} → ${newRole}`,
          );

          const roleChangeResult = await handleRoleChange(
            userId,
            targetUser,
            currentRole,
            newRole,
            updateData,
          );

          if (!roleChangeResult.ok) {
            res.status(roleChangeResult.statusCode).json({
              error: roleChangeResult.error,
            });
            return;
          }

          // Merge any extra fields the role change requires on the user doc
          Object.assign(updates, roleChangeResult.additionalUpdates);
          sideEffects = roleChangeResult.sideEffects;
        }

        updates.role = newRole;
        console.log(
          `[AUDIT] Admin ${req.user.uid} changed role of ${userId} from ${targetUser.role} to ${newRole}`,
        );
      }

      if (updateData.password !== undefined) {
        if (updateData.password.length < 6) {
          res.status(HttpStatusCodes.BAD_REQUEST).json({
            error: 'Password must be at least 6 characters',
          });
          return;
        }
        await adminAuth.updateUser(userId, { password: updateData.password });
        console.log(
          `[AUDIT] Admin ${req.user.uid} reset password for ${userId}`,
        );
      }

      if (updateData.status !== undefined) {
        if (
          updateData.status !== 'active' &&
          updateData.status !== 'inactive' &&
          updateData.status !== 'suspended'
        ) {
          res.status(HttpStatusCodes.BAD_REQUEST).json({
            error: 'Invalid status. Must be active, inactive, or suspended',
          });
          return;
        }
        updates.status = updateData.status;
        console.log(`[UpdateUser] Updating status to ${updateData.status}`);
      }
    } else {
      // Non-admin trying to update restricted fields
      if (
        updateData.agency !== undefined ||
        updateData.role !== undefined ||
        updateData.status !== undefined ||
        updateData.password !== undefined
      ) {
        res.status(HttpStatusCodes.FORBIDDEN).json({
          error:
            'You can only update your name, phone, location, and email. Other fields require admin privileges.',
        });
        return;
      }
    }

    if (Object.keys(updates).length === 0) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'No valid fields to update',
      });
      return;
    }

    updates.updatedAt = Timestamp.now();

    // -------------------------------------------------------------------------
    // Commit everything atomically: main user update + all side effects
    // -------------------------------------------------------------------------

    const batch = db.batch();
    batch.update(db.collection(USERS_COLLECTION).doc(userId), updates);
    for (const { ref, data } of sideEffects) {
      batch.update(ref, data);
    }
    await batch.commit();

    console.log(
      `[UpdateUser] User ${userId} updated successfully` +
        (sideEffects.length > 0
          ? ` (+ ${sideEffects.length} related document(s) updated)`
          : ''),
    );

    if (adminUpdate) {
      console.log(
        `[AUDIT] Admin ${req.user.uid} updated user ${userId}:`,
        updates,
      );
    }

    const response: UpdateUserResponse = {
      success: true,
      message: 'User updated successfully',
    };

    res.status(HttpStatusCodes.OK).json(response);
  } catch (error) {
    console.error('Error in updateUser:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to update user',
    });
  }
}

/**
 * Update user status (admin only)
 * PATCH /users/:userId/status
 */
export async function updateUserStatus(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'Only administrators can update user status',
      });
      return;
    }

    const userId = Array.isArray(req.params.userId)
      ? req.params.userId[0]
      : req.params.userId;

    if (!userId) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'User ID is required',
      });
      return;
    }

    const { status } = req.body as UpdateUserStatusRequest;

    if (!status || (status !== 'active' && status !== 'inactive')) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Status must be "active" or "inactive"',
      });
      return;
    }

    console.log(
      `[UpdateUserStatus] Admin ${req.user.uid} updating user ${userId} status to ${status}...`,
    );

    // Fetch user
    const targetUser = await getUserDocument(userId);

    if (!targetUser) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'User not found',
      });
      return;
    }

    // Update Firestore
    await db.collection(USERS_COLLECTION).doc(userId).update({
      status,
      updatedAt: Timestamp.now(),
    });

    // Optionally disable/enable Firebase Auth account
    try {
      await adminAuth.updateUser(userId, {
        disabled: status === 'inactive',
      });
      console.log(
        `[UpdateUserStatus] Firebase Auth account ${status === 'inactive' ? 'disabled' : 'enabled'}`,
      );
    } catch (authError) {
      console.error('Error updating Firebase Auth status:', authError);
      // Continue even if auth update fails
    }

    console.log(
      `[UpdateUserStatus] User ${userId} status updated to ${status}`,
    );
    console.log(
      `[AUDIT] Admin ${req.user.uid} changed user ${userId} status to ${status}`,
    );

    const response: UpdateUserResponse = {
      success: true,
      message: 'User status updated successfully',
    };

    res.status(HttpStatusCodes.OK).json(response);
  } catch (error) {
    console.error('Error in updateUserStatus:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to update user status',
    });
  }
}

/**
 * Delete user (admin only)
 * DELETE /users/:userId
 *
 * CAUTION: This permanently deletes the user from Firebase Auth and Firestore.
 * Consider using updateUserStatus with 'inactive' instead for soft delete.
 */
export async function deleteUser(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'Only administrators can delete users',
      });
      return;
    }

    const userId = Array.isArray(req.params.userId)
      ? req.params.userId[0]
      : req.params.userId;

    if (!userId) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'User ID is required',
      });
      return;
    }

    // Prevent self-deletion
    if (userId === req.user.uid) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'You cannot delete yourself',
      });
      return;
    }

    console.log(
      `[DeleteUser] Admin ${req.user.uid} deleting user ${userId}...`,
    );

    // Fetch user
    const targetUser = await getUserDocument(userId);

    if (!targetUser) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'User not found',
      });
      return;
    }

    // Check if trainer with assigned groups
    if (
      (targetUser.role === 'trainer' || targetUser.role === 'master_trainer') &&
      targetUser.managedGroupIds &&
      Array.isArray(targetUser.managedGroupIds) &&
      targetUser.managedGroupIds.length > 0
    ) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error:
          'Cannot delete trainer with assigned groups. Please reassign groups first.',
      });
      return;
    }

    const batch = db.batch();

    // If user is in a group, remove them from the group's memberIds
    if (targetUser.groupId) {
      console.log(
        `[DeleteUser] Removing user from group ${targetUser.groupId}...`,
      );
      const groupRef = db.collection(GROUPS_COLLECTION).doc(targetUser.groupId);
      const groupDoc = await groupRef.get();

      if (groupDoc.exists) {
        const groupData = groupDoc.data();
        const updatedMemberIds = (groupData?.memberIds || []).filter(
          (id: string) => id !== userId,
        );

        batch.update(groupRef, {
          memberIds: updatedMemberIds,
          memberCount: updatedMemberIds.length,
          updatedAt: Timestamp.now(),
        });
      }
    }

    // Delete user document from Firestore
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    batch.delete(userRef);

    await batch.commit();

    // Delete from Firebase Auth
    try {
      await adminAuth.deleteUser(userId);
      console.log(`[DeleteUser] User ${userId} deleted from Firebase Auth`);
    } catch (authError) {
      console.error('Error deleting user from Firebase Auth:', authError);
      // If Firestore delete succeeded but Auth delete failed, log it
      console.warn(
        `[DeleteUser] User ${userId} deleted from Firestore but Firebase Auth deletion failed`,
      );
    }

    console.log(`[DeleteUser] User ${userId} deleted successfully`);
    console.log(`[AUDIT] Admin ${req.user.uid} deleted user ${userId}`);

    const response: DeleteUserResponse = {
      success: true,
      message: 'User deleted successfully',
    };

    res.status(HttpStatusCodes.OK).json(response);
  } catch (error) {
    console.error('Error in deleteUser:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to delete user',
    });
  }
}

/**
 * Change own password
 * PATCH /users/me/password
 */
export async function changeMyPassword(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Not authenticated',
      });
      return;
    }

    const { password } = req.body as { password: string };

    if (!password || password.length < 6) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Password must be at least 6 characters',
      });
      return;
    }

    await adminAuth.updateUser(req.user.uid, { password });

    console.log(`[ChangePassword] User ${req.user.uid} changed their password`);

    res.status(HttpStatusCodes.OK).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Error in changeMyPassword:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to change password',
    });
  }
}

/**
 * Reset a user's password (admin only)
 * PATCH /admin/users/:userId/password
 */
export async function resetUserPassword(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'Only administrators can reset user passwords',
      });
      return;
    }

    const userId = Array.isArray(req.params.userId)
      ? req.params.userId[0]
      : req.params.userId;

    if (!userId) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'User ID is required',
      });
      return;
    }

    const { password } = req.body as { password: string };

    if (!password || password.length < 6) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Password must be at least 6 characters',
      });
      return;
    }

    const targetUser = await getUserDocument(userId);

    if (!targetUser) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'User not found',
      });
      return;
    }

    await adminAuth.updateUser(userId, { password });

    console.log(
      `[AUDIT] Admin ${req.user.uid} reset password for user ${userId}`,
    );

    res.status(HttpStatusCodes.OK).json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    console.error('Error in resetUserPassword:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to reset password',
    });
  }
}

/******************************************************************************
                            Export
******************************************************************************/

export default {
  getMe,
  getUserById,
  getAllUsers,
  getUsersByGroup,
  updateUser,
  updateUserStatus,
  deleteUser,
  resetUserPassword,
  changeMyPassword,
};
