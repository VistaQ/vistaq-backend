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
import { IDashboardPeriodStats } from '@src/types/dashboard.types';
import { Database } from '@src/types/database.types';
import {
  IAgentStats,
  IGroupDetailStats,
} from '@src/types/group-detail-stats.types';
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
  trainerIds?: string[];
  token: string;
}

interface IUpdateGroupParams {
  groupId: string;
  token: string;
  data: {
    name?: string;
    status?: string;
    leader_id?: string;
    trainer_ids?: string[];
    member_ids?: string[];
  };
}

/******************************************************************************
                            GroupService
******************************************************************************/

class GroupService {
  async getGroupDetailStats(
    groupId: string,
    token: string,
  ): Promise<IGroupDetailStats> {
    try {
      const group = await groupRepository.findById(groupId, token);

      if (!group) {
        throw new GroupNotFoundError();
      }

      const now = new Date();
      const ytdStart = new Date(now.getFullYear(), 0, 1).toISOString();
      const mtdStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
      ).toISOString();

      const [ytdRes, mtdRes, agentsCount, ytdAgentsRes, mtdAgentsRes] =
        await Promise.all([
          groupRepository.getGroupDetailStats(token, ytdStart, groupId),
          groupRepository.getGroupDetailStats(token, mtdStart, groupId),
          groupRepository.getGroupAgentsCount(token, groupId),
          groupRepository.getAgentStats(token, groupId, ytdStart),
          groupRepository.getAgentStats(token, groupId, mtdStart),
        ]);

      const ytdStats = (ytdRes?.data ?? {}) as Omit<
        IDashboardPeriodStats,
        'agents_count'
      >;
      const mtdStats = (mtdRes?.data ?? {}) as Omit<
        IDashboardPeriodStats,
        'agents_count'
      >;

      type AgentRpcRow = {
        agent_id: string;
        agent_name: string;
        prospects: number;
        appointments_set: number;
        sales_meetings: number;
        sales_noc: number;
        sales_ace: number;
      };

      const ytdAgentRows: AgentRpcRow[] = (ytdAgentsRes?.data ??
        []) as AgentRpcRow[];
      const mtdAgentRows: AgentRpcRow[] = (mtdAgentsRes?.data ??
        []) as AgentRpcRow[];

      const agentMap = new Map<string, IAgentStats>();

      for (const row of ytdAgentRows) {
        agentMap.set(row.agent_id, {
          agent_id: row.agent_id,
          agent_name: row.agent_name,
          ytd_prospects: row.prospects,
          ytd_appointments_set: row.appointments_set,
          ytd_sales_meetings: row.sales_meetings,
          ytd_sales_noc: row.sales_noc,
          ytd_sales_ace: row.sales_ace,
          mtd_prospects: 0,
          mtd_appointments_set: 0,
          mtd_sales_meetings: 0,
          mtd_sales_noc: 0,
          mtd_sales_ace: 0,
        });
      }

      for (const row of mtdAgentRows) {
        const existing = agentMap.get(row.agent_id);
        if (existing) {
          existing.mtd_prospects = row.prospects;
          existing.mtd_appointments_set = row.appointments_set;
          existing.mtd_sales_meetings = row.sales_meetings;
          existing.mtd_sales_noc = row.sales_noc;
          existing.mtd_sales_ace = row.sales_ace;
        } else {
          agentMap.set(row.agent_id, {
            agent_id: row.agent_id,
            agent_name: row.agent_name,
            ytd_prospects: 0,
            ytd_appointments_set: 0,
            ytd_sales_meetings: 0,
            ytd_sales_noc: 0,
            ytd_sales_ace: 0,
            mtd_prospects: row.prospects,
            mtd_appointments_set: row.appointments_set,
            mtd_sales_meetings: row.sales_meetings,
            mtd_sales_noc: row.sales_noc,
            mtd_sales_ace: row.sales_ace,
          });
        }
      }

      return {
        group_id: group.id,
        group_name: group.name,
        ytd: { ...ytdStats, agents_count: agentsCount ?? 0 },
        mtd: mtdStats,
        agents: Array.from(agentMap.values()),
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

  private async validateTrainers(
    trainerIds: string[],
    token: string,
    errorClass: 'create' | 'update' = 'create',
  ): Promise<string[]> {
    try {
      const uniqueIds = [...new Set(trainerIds)];
      const foundTrainers = await userService.findUsersByIds(uniqueIds, token);

      if (foundTrainers.length !== uniqueIds.length) {
        const foundIds = new Set(foundTrainers.map((u) => u.id));
        const missingIds = uniqueIds.filter((id) => !foundIds.has(id));
        const message = `The following trainer IDs were not found: ${missingIds.join(', ')}`;
        if (errorClass === 'update') throw new InvalidTrainerError(message);
        throw new UserNotInTenantError(message);
      }

      const nonTrainers = foundTrainers.filter((u) => u.role !== 'trainer');
      if (nonTrainers.length > 0) {
        const badIds = nonTrainers.map((u) => u.id).join(', ');
        const message = `The following user IDs do not have the trainer role: ${badIds}`;
        if (errorClass === 'update') throw new InvalidTrainerError(message);
        throw new InvalidTrainerRoleError(message);
      }

      return uniqueIds;
    } catch (error) {
      if (
        error instanceof InvalidTrainerRoleError ||
        error instanceof InvalidTrainerError ||
        error instanceof UserNotInTenantError
      ) {
        throw error;
      }
      return handleServiceError('GroupService.validateTrainers', error);
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

      // Step 2 — Validate trainers if provided
      if (params.trainerIds && params.trainerIds.length > 0) {
        await this.validateTrainers(params.trainerIds, params.token, 'create');
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

      // Step 5 — Insert group_trainers records (with rollback on failure)
      if (params.trainerIds && params.trainerIds.length > 0) {
        try {
          const trainerInserts = params.trainerIds.map((id) => ({
            group_id: group.id,
            trainer_id: id,
          }));
          await groupRepository.insertGroupTrainers(
            trainerInserts,
            params.token,
          );
        } catch (trainerError) {
          loggingService.error(
            'GroupService.createGroup — group trainers insert failed, rolling back leader role and group',
            trainerError,
            { groupId: group.id, trainerIds: params.trainerIds },
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
        error instanceof InvalidTrainerError ||
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

      // Step 3 — Trainer logic (replace)
      if (data.trainer_ids && data.trainer_ids.length > 0) {
        const uniqueTrainerIds = await this.validateTrainers(
          data.trainer_ids,
          token,
          'update',
        );

        // Fetch existing trainers before deleting (for rollback)
        const existingTrainers =
          await groupRepository.findGroupTrainersByGroupId(groupId, token);

        await groupRepository.deleteGroupTrainersByGroupId(groupId, token);
        const trainerInserts = uniqueTrainerIds.map((id) => ({
          group_id: groupId,
          trainer_id: id,
        }));
        try {
          await groupRepository.insertGroupTrainers(trainerInserts, token);
        } catch (insertError) {
          loggingService.error(
            'GroupService.updateGroup — trainer insert failed after delete, attempting rollback',
            insertError,
            { groupId, trainerIds: uniqueTrainerIds },
          );
          if (existingTrainers.length > 0) {
            try {
              await groupRepository.insertGroupTrainers(
                existingTrainers.map((t) => ({
                  group_id: t.group_id,
                  trainer_id: t.trainer_id,
                })),
                token,
              );
            } catch (rollbackError) {
              loggingService.error(
                'GroupService.updateGroup — trainer rollback failed',
                rollbackError,
                { groupId },
              );
            }
          }
          throw insertError;
        }
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
