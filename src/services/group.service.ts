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
import groupRepository, {
  type IGroupUpdate,
} from '@src/repositories/group.repository';
import groupTrainerRepository from '@src/repositories/groupTrainer.repository';
import userRepository from '@src/repositories/user.repository';
import userStatsRepository from '@src/repositories/userStats.repository';
import scopeService from '@src/services/scope.service';
import userService from '@src/services/user.service';
import type { ICaller, IGroup, IUser } from '@src/types/auth.types';
import type { IDashboardPeriodStats } from '@src/types/dashboard.types';
import type {
  IAgentStats,
  IGroupDetailStats,
} from '@src/types/group-detail-stats.types';
import type { IGroupStats } from '@src/types/group-stats.types';
import type { IUserStats } from '@src/types/userStats.types';
import { handleServiceError } from '@src/utils/errorHandlers';
import { monthBucketUtc, periodStartsUtc } from '@src/utils/period';

/******************************************************************************
                            Interfaces
******************************************************************************/

interface ICreateGroupParams {
  name: string;
  leaderId?: string;
  trainerIds?: string[];
}

interface IUpdateGroupParams {
  groupId: string;
  data: {
    name?: string;
    status?: string;
    leader_id?: string;
    trainer_ids?: string[];
    member_ids?: string[];
  };
}

type ICounters = Omit<IDashboardPeriodStats, 'agents_count'>;

const ZERO: ICounters = {
  prospects: 0,
  appointments_set: 0,
  sales_meetings: 0,
  sales_noc: 0,
  sales_ace: 0,
};

const AGENT_ROLES = new Set(['agent', 'group_leader']);

function plus(total: ICounters, other: ICounters | undefined): ICounters {
  if (!other) return total;
  return {
    prospects: total.prospects + other.prospects,
    appointments_set: total.appointments_set + other.appointments_set,
    sales_meetings: total.sales_meetings + other.sales_meetings,
    sales_noc: total.sales_noc + other.sales_noc,
    sales_ace: total.sales_ace + other.sales_ace,
  };
}

function countersOf(row: IUserStats): ICounters {
  return {
    prospects: row.prospects,
    appointments_set: row.appointments_set,
    sales_meetings: row.appt_done,
    sales_noc: row.sales_noc,
    sales_ace: row.sales_ace,
  };
}

function sumByUser(rows: IUserStats[], fromYm = 0): Map<string, ICounters> {
  const totals = new Map<string, ICounters>();
  for (const row of rows) {
    if (row.ym < fromYm) continue;
    totals.set(row.user_id, plus(totals.get(row.user_id) ?? ZERO, countersOf(row)));
  }
  return totals;
}

function sumMembers(members: IUser[], totals: Map<string, ICounters>): ICounters {
  return members.reduce((sum, member) => plus(sum, totals.get(member.id)), ZERO);
}

/******************************************************************************
                            GroupService
******************************************************************************/

class GroupService {
  private async findVisibleGroup(
    groupId: string,
    caller: ICaller,
  ): Promise<IGroup | null> {
    try {
      const visible = await scopeService.resolveGroupScope(caller);
      if (visible && !visible.includes(groupId)) {
        return null;
      }
      return await groupRepository.findById(groupId);
    } catch (error) {
      return handleServiceError('GroupService.findVisibleGroup', error);
    }
  }

  async getGroupDetailStats(
    groupId: string,
    caller: ICaller,
  ): Promise<IGroupDetailStats> {
    try {
      const group = await this.findVisibleGroup(groupId, caller);
      if (!group) {
        throw new GroupNotFoundError();
      }

      const { ytdStart, mtdStart } = periodStartsUtc();
      const members = await userRepository.findByGroupId(groupId, 'active');
      const rows = await userStatsRepository.findSince(
        members.map((member) => member.id),
        monthBucketUtc(ytdStart),
      );
      const ytd = sumByUser(rows);
      const mtd = sumByUser(rows, monthBucketUtc(mtdStart));
      const agents = members.filter((member) => AGENT_ROLES.has(member.role));

      return {
        group_id: group.id,
        group_name: group.name,
        ytd: { ...sumMembers(members, ytd), agents_count: agents.length },
        mtd: sumMembers(members, mtd),
        agents: agents.map((agent): IAgentStats => {
          const y = ytd.get(agent.id) ?? ZERO;
          const m = mtd.get(agent.id) ?? ZERO;
          return {
            agent_id: agent.id,
            agent_name: agent.name,
            ytd_prospects: y.prospects,
            ytd_appointments_set: y.appointments_set,
            ytd_sales_meetings: y.sales_meetings,
            ytd_sales_noc: y.sales_noc,
            ytd_sales_ace: y.sales_ace,
            mtd_prospects: m.prospects,
            mtd_appointments_set: m.appointments_set,
            mtd_sales_meetings: m.sales_meetings,
            mtd_sales_noc: m.sales_noc,
            mtd_sales_ace: m.sales_ace,
          };
        }),
      };
    } catch (error) {
      if (error instanceof GroupNotFoundError) {
        throw error;
      }
      return handleServiceError('GroupService.getGroupDetailStats', error);
    }
  }

  async getGroupStats(caller: ICaller): Promise<IGroupStats[]> {
    try {
      const groups = await this.getGroups(caller);
      const members = await Promise.all(
        groups.map((group) => userRepository.findByGroupId(group.id, 'active')),
      );
      const rows = await userStatsRepository.findSince(
        members.flat().map((member) => member.id),
        monthBucketUtc(periodStartsUtc().ytdStart),
      );
      const ytd = sumByUser(rows);

      return groups
        .map((group, i): IGroupStats => {
          const total = sumMembers(members[i], ytd);
          return {
            group_id: group.id,
            group_name: group.name,
            ytd_prospects: total.prospects,
            ytd_appointments_set: total.appointments_set,
            ytd_sales_meetings: total.sales_meetings,
            ytd_sales_noc: total.sales_noc,
            ytd_sales_ace: total.sales_ace,
            ytd_agents_count: members[i].filter((m) => AGENT_ROLES.has(m.role))
              .length,
          };
        })
        .sort((a, b) => b.ytd_sales_ace - a.ytd_sales_ace);
    } catch (error) {
      return handleServiceError('GroupService.getGroupStats', error);
    }
  }

  async getGroups(caller: ICaller): Promise<IGroup[]> {
    try {
      const visible = await scopeService.resolveGroupScope(caller);
      return visible
        ? await groupRepository.findByIds(visible)
        : await groupRepository.findAll();
    } catch (error) {
      return handleServiceError('GroupService.getGroups', error);
    }
  }

  async getGroupById(groupId: string, caller: ICaller): Promise<IGroup | null> {
    try {
      return await this.findVisibleGroup(groupId, caller);
    } catch (error) {
      return handleServiceError('GroupService.getGroupById', error);
    }
  }

  async getActiveGroups(): Promise<Pick<IGroup, 'id' | 'name'>[]> {
    try {
      const groups = await groupRepository.findByStatus('active');
      return groups.map((group) => ({ id: group.id, name: group.name }));
    } catch (error) {
      return handleServiceError('GroupService.getActiveGroups', error);
    }
  }

  private async validateTrainers(
    trainerIds: string[],
    errorClass: 'create' | 'update' = 'create',
  ): Promise<string[]> {
    try {
      const uniqueIds = [...new Set(trainerIds)];
      const foundTrainers = await userService.findUsersByIds(uniqueIds);

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
      if (params.leaderId) {
        const leader = await userService.getUserById(
          params.leaderId
        );
        if (!leader) {
          throw new UserNotInTenantError();
        }
        if (leader.role !== 'agent') {
          throw new InvalidLeaderRoleError();
        }
      }

      if (params.trainerIds && params.trainerIds.length > 0) {
        await this.validateTrainers(params.trainerIds, 'create');
      }

      const group = await groupRepository.insertGroup({
        name: params.name,
        status: 'active',
        leader_id: params.leaderId ?? null,
      });

      if (params.leaderId) {
        await userService.updateUser({
          userId: params.leaderId,
          callerRole: 'admin',
          data: { role: 'group_leader' },
        });
      }

      if (params.trainerIds && params.trainerIds.length > 0) {
        try {
          const trainerInserts = params.trainerIds.map((id) => ({
            group_id: group.id,
            trainer_id: id,
          }));
          await groupTrainerRepository.insertGroupTrainers(trainerInserts);
        } catch (trainerError) {
          if (params.leaderId) {
            try {
              await userService.updateUser({
                userId: params.leaderId,
                callerRole: 'admin',
                data: { role: 'agent' },
              });
            } catch {
              // Best-effort rollback; the original error is rethrown
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
      const { groupId, data } = params;

      const existingGroup = await groupRepository.findById(groupId);
      if (!existingGroup) {
        throw new GroupNotFoundError();
      }

      if (data.leader_id && data.leader_id !== existingGroup.leader_id) {
        const leader = await userService.getUserById(data.leader_id);
        if (!leader) {
          throw new UserNotFoundError();
        }
        if (leader.role !== 'agent') {
          throw new InvalidLeaderError();
        }

        if (existingGroup.leader_id) {
          await userService.updateUser({
            userId: existingGroup.leader_id,
            callerRole: 'admin',
            data: { role: 'agent' },
          });
        }

        await userService.updateUser({
          userId: data.leader_id,
          callerRole: 'admin',
          data: { role: 'group_leader' },
        });
      }

      if (data.trainer_ids && data.trainer_ids.length > 0) {
        const uniqueTrainerIds = await this.validateTrainers(
          data.trainer_ids,
          'update',
        );

        const existingTrainers =
          await groupTrainerRepository.findGroupTrainersByGroupId(groupId);

        await groupTrainerRepository.deleteGroupTrainersByGroupId(groupId);
        const trainerInserts = uniqueTrainerIds.map((id) => ({
          group_id: groupId,
          trainer_id: id,
        }));
        try {
          await groupTrainerRepository.insertGroupTrainers(trainerInserts);
        } catch (insertError) {
          if (existingTrainers.length > 0) {
            try {
              await groupTrainerRepository.insertGroupTrainers(existingTrainers);
            } catch {
              // Best-effort rollback; the original error is rethrown
            }
          }
          throw insertError;
        }
      }

      if (data.member_ids !== undefined) {
        if (data.member_ids.length > 0) {
          const foundMembers = await userService.findUsersByIds(
            data.member_ids
          );
          if (foundMembers.length !== data.member_ids.length) {
            throw new MissingMembersError();
          }
        }

        // Effective leader — use new leader_id if being changed in this same request
        const effectiveLeaderId = data.leader_id ?? existingGroup.leader_id;

        const currentMembers = await userRepository.findByGroupId(groupId, null);
        const currentMemberIds = currentMembers.map((m) => m.id);

        // Unlink: currently in group AND not in new list AND not the leader
        const newMemberSet = new Set(data.member_ids);
        const toUnlink = currentMemberIds.filter(
          (id) => !newMemberSet.has(id) && id !== effectiveLeaderId,
        );

        // Link: in new list AND not already in this group
        const currentMemberSet = new Set(currentMemberIds);
        const toLink = data.member_ids.filter(
          (id) => !currentMemberSet.has(id),
        );

        try {
          if (toUnlink.length > 0) {
            await userService.updateUsersGroupId(toUnlink, null);
          }
          if (toLink.length > 0) {
            await userService.updateUsersGroupId(toLink, groupId);
          }
        } catch (memberError) {
          if (toUnlink.length > 0) {
            try {
              await userService.updateUsersGroupId(toUnlink, groupId);
            } catch {
              // Best-effort rollback; the original error is rethrown
            }
          }
          throw memberError;
        }
      }

      const updatePayload: IGroupUpdate = {};
      if (data.name !== undefined) updatePayload.name = data.name;
      if (data.status !== undefined) updatePayload.status = data.status;
      if (data.leader_id !== undefined)
        updatePayload.leader_id = data.leader_id;

      if (Object.keys(updatePayload).length === 0) {
        return existingGroup;
      }

      return await groupRepository.updateGroup(groupId, updatePayload);
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
