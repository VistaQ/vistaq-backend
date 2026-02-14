/**
 * Group Controller - Handle group management operations
 */
import { Request, Response } from 'express';
import * as admin from 'firebase-admin';

import HttpStatusCodes from '@src/common/constants/HttpStatusCodes';
import { db } from '@src/config/firebase';
import {
  CreateGroupRequest,
  CreateGroupResponse,
  DeleteGroupResponse,
  GetAllGroupsResponse,
  GetGroupResponse,
  Group,
  GroupMember,
  UpdateGroupRequest,
  UpdateGroupResponse,
} from '@src/types/groups.types';

const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

const GROUPS_COLLECTION = 'groups';
const USERS_COLLECTION = 'users';

/******************************************************************************
                            Helper Functions
******************************************************************************/

/**
 * Get user document by UID
 */
async function getUserByUid(uid: string): Promise<admin.firestore.DocumentData | null> {
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
 * Verify user exists and has specific role
 */
async function verifyUserRole(
  uid: string,
  allowedRoles: string[],
): Promise<{ valid: boolean; user?: admin.firestore.DocumentData; error?: string }> {
  const user = await getUserByUid(uid);

  if (!user) {
    return { valid: false, error: `User ${uid} not found` };
  }

  if (!allowedRoles.includes(user.role)) {
    return {
      valid: false,
      error: `User ${uid} does not have required role (expected: ${allowedRoles.join(' or ')}, got: ${user.role})`
    };
  }

  return { valid: true, user };
}

/**
 * Verify all users exist
 */
async function verifyUsersExist(
  userIds: string[],
): Promise<{ valid: boolean; error?: string }> {
  for (const userId of userIds) {
    const user = await getUserByUid(userId);
    if (!user) {
      return { valid: false, error: `User ${userId} not found` };
    }
  }
  return { valid: true };
}

/**
 * Update user's group information
 */
async function updateUserGroupInfo(
  userId: string,
  groupId: string | null,
  groupName: string | null,
): Promise<void> {
  await db.collection(USERS_COLLECTION).doc(userId).update({
    groupId: groupId || null,
    groupName: groupName || null,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Update trainer's managed groups
 */
async function updateTrainerManagedGroups(
  trainerId: string,
  groupId: string,
  operation: 'add' | 'remove',
): Promise<void> {
  const updateData: { [key: string]: admin.firestore.FieldValue } = {
    updatedAt: Timestamp.now(),
  };

  if (operation === 'add') {
    updateData.managedGroupIds = FieldValue.arrayUnion(groupId);
  } else {
    updateData.managedGroupIds = FieldValue.arrayRemove(groupId);
  }

  await db.collection(USERS_COLLECTION).doc(trainerId).update(updateData);
}

/******************************************************************************
                            Controller Functions
******************************************************************************/

/**
 * Create a new group (admin only)
 * POST /admin/groups
 */
export async function createGroup(req: Request, res: Response): Promise<void> {
  try {
    // Ensure user is admin
    if (!req.user || req.user.role !== 'admin') {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'Only administrators can create groups',
      });
      return;
    }

    const { name, trainerIds, leaderId, memberIds } = req.body as CreateGroupRequest;

    // name is the only required field
    if (!name || name.trim().length < 3) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Group name is required and must be at least 3 characters',
      });
      return;
    }

    // trainerIds must be an array if provided
    if (trainerIds !== undefined && !Array.isArray(trainerIds)) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'trainerIds must be an array',
      });
      return;
    }

    // memberIds must be an array if provided; default to empty
    if (memberIds !== undefined && !Array.isArray(memberIds)) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'memberIds must be an array',
      });
      return;
    }
    const effectiveMemberIds: string[] = Array.isArray(memberIds) ? memberIds : [];

    // If leaderId is provided it must be present in effectiveMemberIds
    if (leaderId && !effectiveMemberIds.includes(leaderId)) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Leader must be included in memberIds array',
      });
      return;
    }

    // Validate each trainer
    const effectiveTrainerIds: string[] = Array.isArray(trainerIds) ? trainerIds : [];
    const trainerNames: string[] = [];

    if (effectiveTrainerIds.length > 0) {
      console.log(`[CreateGroup] Validating ${effectiveTrainerIds.length} trainer(s)...`);
      for (const tid of effectiveTrainerIds) {
        const trainerCheck = await verifyUserRole(tid, ['trainer', 'master_trainer']);
        if (!trainerCheck.valid) {
          res.status(
            trainerCheck.error?.includes('not found')
              ? HttpStatusCodes.NOT_FOUND
              : HttpStatusCodes.FORBIDDEN,
          ).json({ error: trainerCheck.error });
          return;
        }
        trainerNames.push(trainerCheck.user!.name);
      }
    }

    // Validate leader if provided
    let leaderUser: admin.firestore.DocumentData | undefined;
    if (leaderId) {
      console.log(`[CreateGroup] Validating leader ${leaderId}...`);
      const leaderCheck = await verifyUserRole(leaderId, ['agent', 'group_leader']);
      if (!leaderCheck.valid) {
        res.status(
          leaderCheck.error?.includes('not found')
            ? HttpStatusCodes.NOT_FOUND
            : HttpStatusCodes.FORBIDDEN,
        ).json({ error: leaderCheck.error });
        return;
      }
      leaderUser = leaderCheck.user!;
    }

    // Validate members exist if any are provided
    if (effectiveMemberIds.length > 0) {
      console.log(`[CreateGroup] Validating ${effectiveMemberIds.length} member(s)...`);
      const membersCheck = await verifyUsersExist(effectiveMemberIds);
      if (!membersCheck.valid) {
        res.status(HttpStatusCodes.NOT_FOUND).json({ error: membersCheck.error });
        return;
      }
    }

    console.log('[CreateGroup] All validations passed. Creating group...');

    // Atomic batch write
    const batch = db.batch();
    const groupRef = db.collection(GROUPS_COLLECTION).doc();

    const groupData = {
      name: name.trim(),

      // Leadership — null until assigned
      leaderId: leaderId || null,
      leaderName: leaderUser?.name || null,
      leaderEmail: leaderUser?.email || null,

      // Trainers
      trainerIds: effectiveTrainerIds,
      trainerNames,

      // Members
      memberIds: effectiveMemberIds,
      memberCount: effectiveMemberIds.length,

      // Performance stats (initialised to zero)
      totalProspects: 0,
      totalAppointments: 0,
      totalSales: 0,
      totalACE: 0,
      totalPoints: 0,

      // Status
      status: 'active' as const,

      // Timestamps
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    batch.set(groupRef, groupData);

    // Update all members' groupId / groupName
    for (const memberId of effectiveMemberIds) {
      batch.update(db.collection(USERS_COLLECTION).doc(memberId), {
        groupId: groupRef.id,
        groupName: name.trim(),
        updatedAt: Timestamp.now(),
      });
    }

    // Promote leader to group_leader if they are currently an agent
    if (leaderId && leaderUser?.role === 'agent') {
      batch.update(db.collection(USERS_COLLECTION).doc(leaderId), {
        role: 'group_leader',
        updatedAt: Timestamp.now(),
      });
      console.log(`[CreateGroup] Promoted ${leaderId} to group_leader`);
    }

    // Add group to each trainer's managedGroupIds
    for (const tid of effectiveTrainerIds) {
      batch.update(db.collection(USERS_COLLECTION).doc(tid), {
        managedGroupIds: FieldValue.arrayUnion(groupRef.id),
        updatedAt: Timestamp.now(),
      });
    }

    await batch.commit();

    console.log(`[CreateGroup] Group ${groupRef.id} created successfully`);

    const response: CreateGroupResponse = {
      success: true,
      groupId: groupRef.id,
      message: 'Group created successfully',
    };

    res.status(HttpStatusCodes.CREATED).json(response);
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to create group',
    });
  }
}

/**
 * Update a group (admin only)
 * PUT /admin/groups/:groupId
 */
export async function updateGroup(req: Request, res: Response): Promise<void> {
  try {
    // Ensure user is admin
    if (!req.user || req.user.role !== 'admin') {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'Only administrators can update groups',
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

    const { name, trainerIds, leaderId, memberIds } = req.body as UpdateGroupRequest;

    // At least one field must be provided
    if (!name && !trainerIds && !leaderId && !memberIds) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'At least one field to update is required',
      });
      return;
    }

    console.log(`[UpdateGroup] Fetching group ${groupId}...`);

    // Fetch existing group
    const groupDoc = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
    if (!groupDoc.exists) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'Group not found',
      });
      return;
    }

    const existingGroup = groupDoc.data() as Group;
    const batch = db.batch();
    const groupRef = db.collection(GROUPS_COLLECTION).doc(groupId);

    // Track updates
    const updates: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    let newLeaderId = existingGroup.leaderId;
    let newMemberIds = existingGroup.memberIds;

    // Handle trainers update
    if (trainerIds !== undefined) {
      if (!Array.isArray(trainerIds) || trainerIds.length === 0) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          error: 'trainerIds must be a non-empty array',
        });
        return;
      }

      console.log(`[UpdateGroup] Updating trainers for group ${groupId}...`);

      // Verify each new trainer
      const newTrainerNames: string[] = [];
      for (const tid of trainerIds) {
        const trainerCheck = await verifyUserRole(tid, ['trainer', 'master_trainer']);
        if (!trainerCheck.valid) {
          res.status(
            trainerCheck.error?.includes('not found')
              ? HttpStatusCodes.NOT_FOUND
              : HttpStatusCodes.FORBIDDEN
          ).json({
            error: trainerCheck.error,
          });
          return;
        }
        newTrainerNames.push(trainerCheck.user!.name);
      }

      // Remove group from trainers no longer assigned
      const trainersToRemove = existingGroup.trainerIds.filter((id) => !trainerIds.includes(id));
      for (const tid of trainersToRemove) {
        batch.update(db.collection(USERS_COLLECTION).doc(tid), {
          managedGroupIds: FieldValue.arrayRemove(groupId),
          updatedAt: Timestamp.now(),
        });
      }

      // Add group to newly assigned trainers
      const trainersToAdd = trainerIds.filter((id) => !existingGroup.trainerIds.includes(id));
      for (const tid of trainersToAdd) {
        batch.update(db.collection(USERS_COLLECTION).doc(tid), {
          managedGroupIds: FieldValue.arrayUnion(groupId),
          updatedAt: Timestamp.now(),
        });
      }

      updates.trainerIds = trainerIds;
      updates.trainerNames = newTrainerNames;
    }

    // Handle leader update
    if (leaderId && leaderId !== existingGroup.leaderId) {
      console.log(`[UpdateGroup] Updating leader from ${existingGroup.leaderId} to ${leaderId}...`);

      // Accept agent or group_leader — role will be updated automatically
      const leaderCheck = await verifyUserRole(leaderId, ['agent', 'group_leader']);
      if (!leaderCheck.valid) {
        res.status(
          leaderCheck.error?.includes('not found')
            ? HttpStatusCodes.NOT_FOUND
            : HttpStatusCodes.FORBIDDEN
        ).json({
          error: leaderCheck.error,
        });
        return;
      }

      const newLeader = leaderCheck.user!;

      // Ensure new leader is in memberIds (either existing or provided)
      const effectiveMemberIds = memberIds || existingGroup.memberIds;
      if (!effectiveMemberIds.includes(leaderId)) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          error: 'New leader must be included in memberIds array',
        });
        return;
      }

      // Demote the old leader back to agent (if one exists)
      if (existingGroup.leaderId) {
        const oldLeaderRef = db.collection(USERS_COLLECTION).doc(existingGroup.leaderId);
        batch.update(oldLeaderRef, {
          role: 'agent',
          updatedAt: Timestamp.now(),
        });
        console.log(`[UpdateGroup] Demoted old leader ${existingGroup.leaderId} to agent`);
      }

      // Promote the new leader to group_leader
      const newLeaderRef = db.collection(USERS_COLLECTION).doc(leaderId);
      batch.update(newLeaderRef, {
        role: 'group_leader',
        updatedAt: Timestamp.now(),
      });
      console.log(`[UpdateGroup] Promoted ${leaderId} to group_leader`);

      updates.leaderId = leaderId;
      updates.leaderName = newLeader.name;
      updates.leaderEmail = newLeader.email;
      newLeaderId = leaderId;
    }

    // Handle members update
    if (memberIds) {
      console.log(`[UpdateGroup] Updating members...`);

      if (!Array.isArray(memberIds) || memberIds.length === 0) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          error: 'memberIds must be a non-empty array',
        });
        return;
      }

      // Ensure current/new leader is in the new memberIds
      if (newLeaderId && !memberIds.includes(newLeaderId)) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          error: 'Leader must be included in memberIds array',
        });
        return;
      }

      // Verify all new members exist
      const membersCheck = await verifyUsersExist(memberIds);
      if (!membersCheck.valid) {
        res.status(HttpStatusCodes.NOT_FOUND).json({
          error: membersCheck.error,
        });
        return;
      }

      // Find members to remove and add
      const oldMemberIds = existingGroup.memberIds;
      const membersToRemove = oldMemberIds.filter((id) => !memberIds.includes(id));
      const membersToAdd = memberIds.filter((id) => !oldMemberIds.includes(id));

      console.log(`[UpdateGroup] Removing ${membersToRemove.length} members, adding ${membersToAdd.length} members`);

      // Remove old members
      for (const memberId of membersToRemove) {
        const memberRef = db.collection(USERS_COLLECTION).doc(memberId);
        batch.update(memberRef, {
          groupId: null,
          groupName: null,
          updatedAt: Timestamp.now(),
        });
      }

      // Add new members — if already in another group, remove them from it first
      for (const memberId of membersToAdd) {
        const memberDoc = await db.collection(USERS_COLLECTION).doc(memberId).get();
        const memberData = memberDoc.data();

        if (memberData?.groupId && memberData.groupId !== groupId) {
          const oldGroupRef = db.collection(GROUPS_COLLECTION).doc(memberData.groupId);
          batch.update(oldGroupRef, {
            memberIds: FieldValue.arrayRemove(memberId),
            memberCount: FieldValue.increment(-1),
            updatedAt: Timestamp.now(),
          });
          console.log(`[UpdateGroup] Removed member ${memberId} from previous group ${memberData.groupId}`);
        }

        const memberRef = db.collection(USERS_COLLECTION).doc(memberId);
        batch.update(memberRef, {
          groupId,
          groupName: name || existingGroup.name,
          updatedAt: Timestamp.now(),
        });
      }

      updates.memberIds = memberIds;
      updates.memberCount = memberIds.length;
      newMemberIds = memberIds;
    }

    // Handle name update
    if (name && name.trim().length >= 3) {
      console.log(`[UpdateGroup] Updating name to "${name}"...`);
      updates.name = name.trim();

      // Update all current members' groupName
      for (const memberId of newMemberIds) {
        const memberRef = db.collection(USERS_COLLECTION).doc(memberId);
        batch.update(memberRef, {
          groupName: name.trim(),
          updatedAt: Timestamp.now(),
        });
      }
    } else if (name) {
      res.status(HttpStatusCodes.BAD_REQUEST).json({
        error: 'Group name must be at least 3 characters',
      });
      return;
    }

    // Apply group updates
    batch.update(groupRef, updates);

    await batch.commit();

    console.log(`[UpdateGroup] Group ${groupId} updated successfully`);

    const response: UpdateGroupResponse = {
      success: true,
      message: 'Group updated successfully',
    };

    res.status(HttpStatusCodes.OK).json(response);
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to update group',
    });
  }
}

/**
 * Delete a group (admin only)
 * DELETE /admin/groups/:groupId
 */
export async function deleteGroup(req: Request, res: Response): Promise<void> {
  try {
    // Ensure user is admin
    if (!req.user || req.user.role !== 'admin') {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'Only administrators can delete groups',
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

    console.log(`[DeleteGroup] Fetching group ${groupId}...`);

    // Fetch group
    const groupDoc = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
    if (!groupDoc.exists) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'Group not found',
      });
      return;
    }

    const group = groupDoc.data() as Group;
    const batch = db.batch();

    console.log(`[DeleteGroup] Removing ${group.memberIds.length} members from group...`);

    // Remove all members from group
    for (const memberId of group.memberIds) {
      const memberRef = db.collection(USERS_COLLECTION).doc(memberId);
      batch.update(memberRef, {
        groupId: null,
        groupName: null,
        updatedAt: Timestamp.now(),
      });
    }

    // Remove group from all trainers' managedGroupIds
    for (const trainerId of group.trainerIds) {
      batch.update(db.collection(USERS_COLLECTION).doc(trainerId), {
        managedGroupIds: FieldValue.arrayRemove(groupId),
        updatedAt: Timestamp.now(),
      });
    }

    // Delete group document
    const groupRef = db.collection(GROUPS_COLLECTION).doc(groupId);
    batch.delete(groupRef);

    await batch.commit();

    console.log(`[DeleteGroup] Group ${groupId} deleted successfully`);

    const response: DeleteGroupResponse = {
      success: true,
      message: 'Group deleted successfully',
    };

    res.status(HttpStatusCodes.OK).json(response);
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to delete group',
    });
  }
}

/**
 * Get a specific group by ID
 * GET /groups/:groupId
 */
export async function getGroup(req: Request, res: Response): Promise<void> {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Authentication required',
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

    console.log(`[GetGroup] Fetching group ${groupId} for user ${req.user.uid}...`);

    // Fetch group
    const groupDoc = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
    if (!groupDoc.exists) {
      res.status(HttpStatusCodes.NOT_FOUND).json({
        error: 'Group not found',
      });
      return;
    }

    const group = { id: groupDoc.id, ...groupDoc.data() } as Group;

    // Check permissions
    const isAdmin = req.user.role === 'admin';
    const isMasterTrainer = req.user.role === 'master_trainer';
    const isTrainerOfGroup =
      req.user.role === 'trainer' &&
      req.user.managedGroupIds?.includes(groupId);
    const isGroupLeader =
      req.user.role === 'group_leader' &&
      req.user.groupId === groupId;

    if (!isAdmin && !isMasterTrainer && !isTrainerOfGroup && !isGroupLeader) {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'You do not have permission to view this group',
      });
      return;
    }

    console.log(`[GetGroup] Fetching ${group.memberIds.length} member details...`);

    // Fetch all member details
    const members: GroupMember[] = [];
    for (const memberId of group.memberIds) {
      const memberDoc = await db.collection(USERS_COLLECTION).doc(memberId).get();
      if (memberDoc.exists) {
        const memberData = memberDoc.data();
        members.push({
          uid: memberId,
          name: memberData?.name || '',
          email: memberData?.email || '',
          agentCode: memberData?.agentCode || '',
          totalPoints: memberData?.totalPoints || 0,
          totalProspects: memberData?.totalProspects || 0,
          totalAppointments: memberData?.totalAppointments || 0,
          totalSales: memberData?.totalSales || 0,
          totalACE: memberData?.totalACE || 0,
          currentBadge: memberData?.currentBadge || '',
          status: memberData?.status || '',
        });
      }
    }

    const response: GetGroupResponse = {
      group,
      members,
    };

    res.status(HttpStatusCodes.OK).json(response);
  } catch (error) {
    console.error('Error fetching group:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch group',
    });
  }
}

/**
 * Get all groups
 * GET /groups
 */
export async function getAllGroups(req: Request, res: Response): Promise<void> {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(HttpStatusCodes.UNAUTHORIZED).json({
        error: 'Authentication required',
      });
      return;
    }

    console.log(`[GetAllGroups] Fetching groups for user ${req.user.uid} (${req.user.role})...`);

    let groups: Group[] = [];

    // Admin and Master Trainer see all groups
    if (req.user.role === 'admin' || req.user.role === 'master_trainer') {
      const snapshot = await db.collection(GROUPS_COLLECTION).orderBy('name').get();
      groups = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Group[];
    }
    // Trainers see only their managed groups
    else if (req.user.role === 'trainer') {
      const managedGroupIds = req.user.managedGroupIds || [];

      if (managedGroupIds.length === 0) {
        // No groups managed
        groups = [];
      } else {
        // Fetch managed groups
        for (const groupId of managedGroupIds) {
          const groupDoc = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
          if (groupDoc.exists) {
            groups.push({
              id: groupDoc.id,
              ...groupDoc.data(),
            } as Group);
          }
        }
        // Sort by name
        groups.sort((a, b) => a.name.localeCompare(b.name));
      }
    }
    // Group leaders see their own group
    else if (req.user.role === 'group_leader' && req.user.groupId) {
      const groupDoc = await db.collection(GROUPS_COLLECTION).doc(req.user.groupId).get();
      if (groupDoc.exists) {
        groups = [{
          id: groupDoc.id,
          ...groupDoc.data(),
        } as Group];
      }
    }
    // Others cannot view groups
    else {
      res.status(HttpStatusCodes.FORBIDDEN).json({
        error: 'You do not have permission to view groups',
      });
      return;
    }

    console.log(`[GetAllGroups] Found ${groups.length} groups`);

    const response: GetAllGroupsResponse = {
      groups,
    };

    res.status(HttpStatusCodes.OK).json(response);
  } catch (error) {
    console.error('Error fetching all groups:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch groups',
    });
  }
}

/******************************************************************************
                            Export
******************************************************************************/

/**
 * Get all active groups — public, no auth required
 * GET /groups/public
 *
 * Returns only id + name, used by the self-signup flow to populate the group picker.
 */
export async function getPublicGroups(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const snapshot = await db
      .collection(GROUPS_COLLECTION)
      .where('status', '==', 'active')
      .orderBy('name')
      .get();

    const groups = snapshot.docs.map((doc) => ({
      id: doc.id,
      name: doc.data().name as string,
    }));

    res.status(HttpStatusCodes.OK).json({ groups });
  } catch (error) {
    console.error('Error fetching public groups:', error);
    res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to fetch groups',
    });
  }
}

export default {
  createGroup,
  updateGroup,
  deleteGroup,
  getGroup,
  getAllGroups,
  getPublicGroups,
};
