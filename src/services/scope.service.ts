import groupTrainerRepository from '@src/repositories/groupTrainer.repository';
import userRepository from '@src/repositories/user.repository';
import type { ICaller } from '@src/types/auth.types';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                              Public Types
******************************************************************************/

/**
 * Scope describes the slice of agents a caller is permitted to see for the
 * sales-report read endpoints.
 *
 * - `all`            — no group filter (admin / master_trainer)
 * - `group_ids`      — restrict to a specific list of `users.group_id` values
 *                      (trainer = managed groups, group_leader = own group).
 *                      An empty list means "caller has no permitted groups";
 *                      callers should treat this as an empty result, NOT a 403.
 * - `forbidden`      — caller's role is not entitled to the endpoint (agent /
 *                      unknown). Controllers map this to HTTP 403.
 */
export type Scope =
  | { type: 'all' }
  | { type: 'group_ids'; groupIds: string[] }
  | { type: 'forbidden' };

export interface IResolveScopeParams {
  userId: string;
  role: string;
}

/******************************************************************************
                              ScopeService
******************************************************************************/

const ALL_RECORD_ROLES = new Set(['admin', 'master_trainer']);
const GROUP_SCOPED_ROLES = new Set(['trainer', 'group_leader']);

class ScopeService {
  async managedGroupIds(trainerId: string): Promise<string[]> {
    try {
      const map = await groupTrainerRepository.findGroupIdsByTrainerIds([
        trainerId,
      ]);
      return map.get(trainerId) ?? [];
    } catch (error) {
      return handleServiceError('ScopeService.managedGroupIds', error);
    }
  }

  /** Group ids the caller may read (the old `groups_read` policy), or null for every group. */
  async resolveGroupScope(caller: ICaller): Promise<string[] | null> {
    try {
      if (ALL_RECORD_ROLES.has(caller.role)) {
        return null;
      }
      if (caller.role === 'trainer') {
        return await this.managedGroupIds(caller.id);
      }
      return caller.group_id ? [caller.group_id] : [];
    } catch (error) {
      return handleServiceError('ScopeService.resolveGroupScope', error);
    }
  }

  /**
   * Resolves the per-agent scope for the sales-report read endpoints. Pure
   * authorization logic — does not query sales data. See the `Scope` doc for
   * how each variant should be interpreted by callers.
   */
  /** Agent ids whose records the caller may read (the old `prospects_read` policy), or null for everyone. */
  async resolveAgentScope(caller: ICaller): Promise<string[] | null> {
    try {
      if (caller.role === 'agent') {
        return [caller.id];
      }
      if (!GROUP_SCOPED_ROLES.has(caller.role)) {
        return ALL_RECORD_ROLES.has(caller.role) ? null : [];
      }
      const groupIds = (await this.resolveGroupScope(caller)) ?? [];
      const members = await Promise.all(
        groupIds.map((groupId) => userRepository.findByGroupId(groupId, null)),
      );
      return members.flat().map((member) => member.id);
    } catch (error) {
      return handleServiceError('ScopeService.resolveAgentScope', error);
    }
  }

  async canReadAgent(caller: ICaller, agentId: string): Promise<boolean> {
    try {
      if (ALL_RECORD_ROLES.has(caller.role)) {
        return true;
      }
      if (caller.role === 'agent') {
        return agentId === caller.id;
      }
      if (!GROUP_SCOPED_ROLES.has(caller.role)) {
        return false;
      }
      const [groupIds, agentGroupId] = await Promise.all([
        this.resolveGroupScope(caller),
        userRepository.findGroupIdById(agentId),
      ]);
      return !!agentGroupId && !!groupIds?.includes(agentGroupId);
    } catch (error) {
      return handleServiceError('ScopeService.canReadAgent', error);
    }
  }

  async resolveSalesReportScope(params: IResolveScopeParams): Promise<Scope> {
    try {
      const { userId, role } = params;

      if (role === 'admin' || role === 'master_trainer') {
        return { type: 'all' };
      }

      if (role === 'trainer') {
        const groupIds = await this.managedGroupIds(userId);
        return { type: 'group_ids', groupIds };
      }

      if (role === 'group_leader') {
        const groupId = await userRepository.findGroupIdById(userId);
        return {
          type: 'group_ids',
          groupIds: groupId === null ? [] : [groupId],
        };
      }

      return { type: 'forbidden' };
    } catch (error) {
      return handleServiceError('ScopeService.resolveSalesReportScope', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const scopeService = new ScopeService();
export default scopeService;
