import userRepository from '@src/repositories/user.repository';
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
  tenantId: string;
  role: string;
  /**
   * Bearer token of the calling user. Used by the trainer path so the
   * `group_trainers` lookup runs through the RLS-context client and matches
   * what the caller is permitted to see at the database level.
   */
  userToken: string;
}

/******************************************************************************
                              ScopeService
******************************************************************************/

class ScopeService {
  /**
   * Resolves the per-agent scope for the sales-report read endpoints. Pure
   * authorization logic — does not query sales data. See the `Scope` doc for
   * how each variant should be interpreted by callers.
   */
  async resolveSalesReportScope(params: IResolveScopeParams): Promise<Scope> {
    try {
      const { userId, role, userToken } = params;

      if (role === 'admin' || role === 'master_trainer') {
        return { type: 'all' };
      }

      if (role === 'trainer') {
        const map = await userRepository.findManagedGroupIdsByUserIds(
          [userId],
          userToken,
        );
        const groupIds = map.get(userId) ?? [];
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
