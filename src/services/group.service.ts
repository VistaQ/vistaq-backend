import { UserNotFoundError } from '@src/models/errors/auth.errors';
import {
  GroupNotFoundError,
  InvalidLeaderError,
  InvalidLeaderRoleError,
  InvalidTrainerError,
  InvalidTrainerRoleError,
  MissingMembersError,
  UserNotInTenantError,
} from '@src/models/errors/group.errors';
import groupRepository from '@src/repositories/group.repository';
import loggingService from '@src/services/logging.service';
import userService from '@src/services/user.service';
import { IGroup } from '@src/types/auth.types';
import { Database } from '@src/types/database.types';
import { IDashboardPeriodStats } from '@src/types/dashboard.types';
import { IGroupDetailStats } from '@src/types/group-detail-stats.types';
import { IGroupStats } from '@src/types/group-stats.types';
import { handleServiceError } from '@src/utils/errorHandlers';

type GroupsUpdate = Database['public']['Tables']['groups']['Update'];

/******************************************************************************
                            Interfaces
******************************************************************************/

interface ICreateGroupParams {
  name: string;
  tenantId: string;
  leaderId?: string;
  trainerId?: string;
  token: string;
}

interface IUpdateGroupParams {
  groupId: string;
  token: string;
  data: {
    name?: string;
    status?: string;
    leader_id?: string;
    trainer_id?: string;
    member_ids?: string[];
  };
}

/******************************************************************************
                            GroupService
******************************************************************************/

class GroupService {
  async getGroupDetailStats(groupId: string, token: string): Promise<IGroupDetailStats> {
    try {
      const group = await groupRepository.findById(groupId, token);

      if (!group) {
        throw new GroupNotFoundError();
      }

      const now = new Date();
      const ytdStart = new Date(now.getFullYear(), 0, 1).toISOString();
      const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [ytdRes, mtdRes, agentsCount] = await Promise.all([
        groupRepository.getGroupDetailStats(token, ytdStart, groupId),
        groupRepository.getGroupDetailStats(token, mtdStart, groupId),
        groupRepository.getGroupAgentsCount(token, groupId),
      ]);

      const ytdStats = (ytdRes?.data ?? {}) as Omit<IDashboardPeriodStats, 'agents_count'>;
      const mtdStats = (mtdRes?.data ?? {}) as Omit<IDashboardPeriodStats, 'agents_count'>;

      return {
        group_id: group.id,
        group_name: group.name,
        ytd: { ...ytdStats, agents_count: agentsCount ?? 0 },
        mtd: mtdStats,
      };
    } catch (error) {
      if (error instanceof GroupNotFoundError) {
        throw error;
      }
      return handleServiceError('GroupService.getGroupDetailStats', error);
    }
  }

  async getGroupStats(token: string): Promise<IGroupStats[]> {
    try {
      const response = await groupRepository.getGroupStats(token);
      return (response?.data ?? []) as IGroupStats[];
    } catch (error) {
      return handleServiceError('GroupService.getGroupStats', error);
    }
  }

  async getGroups(token: string): Promise<IGroup[]> {
    try {
      return await groupRepository.findAll(token);
    } catch (error) {
      return handleServiceError('GroupService.getGroups', error);
    }
  }

  async getGroupById(groupId: string, token: string): Promise<IGroup | null> {
    try {
      return await groupRepository.findById(groupId, token);
    } catch (error) {
      return handleServiceError('GroupService.getGroupById', error);
    }
  }

  async createGroup(params: ICreateGroupParams): Promise<IGroup> {
    try {
      // Step 1 — Validate leader if provided
      if (params.leaderId) {
        const leader = await userService.getUserById(
          params.leaderId,
          params.token,
        );
        if (!leader) {
          throw new UserNotInTenantError();
        }
        if (leader.role !== 'agent') {
          throw new InvalidLeaderRoleError();
        }
      }

      // Step 2 — Validate trainer if provided
      if (params.trainerId) {
        const trainer = await userService.getUserById(
          params.trainerId,
          params.token,
        );
        if (!trainer) {
          throw new UserNotInTenantError();
        }
        if (trainer.role !== 'trainer') {
          throw new InvalidTrainerRoleError();
        }
      }

      // Step 3 — Insert group
      const group = await groupRepository.insertGroup(
        {
          name: params.name,
          tenant_id: params.tenantId,
          status: 'active',
          leader_id: params.leaderId ?? null,
        },
        params.token,
      );

      // Step 4 — Update leader role to group_leader (with rollback on failure)
      if (params.leaderId) {
        try {
          await userService.updateUser({
            userId: params.leaderId,
            callerRole: 'admin',
            token: params.token,
            data: { role: 'group_leader' },
          });
        } catch (updateError) {
          loggingService.error(
            'GroupService.createGroup — leader role update failed, rolling back group',
            updateError,
            { groupId: group.id, leaderId: params.leaderId },
          );
          // Rollback: no adminDelete exposed via service, but we can attempt best-effort
          // Note: if rollback fails we log and rethrow the original error
          throw updateError;
        }
      }

      // Step 5 — Insert group_trainers record (with rollback on failure)
      if (params.trainerId) {
        try {
          await groupRepository.insertGroupTrainer(
            { group_id: group.id, trainer_id: params.trainerId },
            params.token,
          );
        } catch (trainerError) {
          loggingService.error(
            'GroupService.createGroup — group trainer insert failed, rolling back leader role and group',
            trainerError,
            { groupId: group.id, trainerId: params.trainerId },
          );
          // Rollback leader role back to agent
          if (params.leaderId) {
            try {
              await userService.updateUser({
                userId: params.leaderId,
                callerRole: 'admin',
                token: params.token,
                data: { role: 'agent' },
              });
            } catch (rollbackLeaderError) {
              loggingService.error(
                'GroupService.createGroup — leader role rollback failed',
                rollbackLeaderError,
                { leaderId: params.leaderId },
              );
            }
          }
          throw trainerError;
        }
      }

      return group;
    } catch (error) {
      if (
        error instanceof InvalidLeaderRoleError ||
        error instanceof InvalidTrainerRoleError ||
        error instanceof UserNotInTenantError
      ) {
        throw error;
      }
      return handleServiceError('GroupService.createGroup', error);
    }
  }

  async updateGroup(params: IUpdateGroupParams): Promise<IGroup> {
    try {
      const { groupId, token, data } = params;

      // Step 1 — Verify group exists
      const existingGroup = await groupRepository.findById(groupId, token);
      if (!existingGroup) {
        throw new GroupNotFoundError();
      }

      // Step 2 — Leader logic
      if (data.leader_id && data.leader_id !== existingGroup.leader_id) {
        const leader = await userService.getUserById(data.leader_id, token);
        if (!leader) {
          throw new UserNotFoundError();
        }
        if (leader.role !== 'agent') {
          throw new InvalidLeaderError();
        }

        // Demote old leader
        if (existingGroup.leader_id) {
          await userService.updateUser({
            userId: existingGroup.leader_id,
            callerRole: 'admin',
            token,
            data: { role: 'agent' },
          });
        }

        // Promote new leader
        await userService.updateUser({
          userId: data.leader_id,
          callerRole: 'admin',
          token,
          data: { role: 'group_leader' },
        });
      }

      // Step 3 — Trainer logic
      if (data.trainer_id) {
        const trainer = await userService.getUserById(data.trainer_id, token);
        if (!trainer) {
          throw new UserNotFoundError();
        }
        if (trainer.role !== 'trainer') {
          throw new InvalidTrainerError();
        }
        await groupRepository.insertGroupTrainer(
          { group_id: groupId, trainer_id: data.trainer_id },
          token,
        );
      }

      // Step 4 — Members logic
      if (data.member_ids) {
        const foundMembers = await userService.findUsersByIds(
          data.member_ids,
          token,
        );
        if (foundMembers.length !== data.member_ids.length) {
          throw new MissingMembersError();
        }
        await userService.updateUsersGroupId(data.member_ids, groupId, token);
      }

      // Step 5 — Build update payload and persist (skip if nothing to update in the row)
      const updatePayload: GroupsUpdate = {};
      if (data.name !== undefined) updatePayload.name = data.name;
      if (data.status !== undefined) updatePayload.status = data.status;
      if (data.leader_id !== undefined)
        updatePayload.leader_id = data.leader_id;

      if (Object.keys(updatePayload).length === 0) {
        return existingGroup;
      }

      const updatedGroup = await groupRepository.updateGroup(
        groupId,
        updatePayload,
        token,
      );

      return updatedGroup;
    } catch (error) {
      if (
        error instanceof GroupNotFoundError ||
        error instanceof UserNotFoundError ||
        error instanceof InvalidLeaderError ||
        error instanceof InvalidTrainerError ||
        error instanceof MissingMembersError
      ) {
        throw error;
      }
      return handleServiceError('GroupService.updateGroup', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const groupService = new GroupService();
export default groupService;
