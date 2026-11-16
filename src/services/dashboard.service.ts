import userRepository from '@src/repositories/user.repository';
import userStatsRepository from '@src/repositories/userStats.repository';
import scopeService from '@src/services/scope.service';
import type { ICaller, IUser } from '@src/types/auth.types';
import type { IDashboardPeriodStats } from '@src/types/dashboard.types';
import type { IUserStats } from '@src/types/userStats.types';
import { handleServiceError } from '@src/utils/errorHandlers';
import { monthBucketUtc, periodStartsUtc } from '@src/utils/period';

/******************************************************************************
                            Helpers
******************************************************************************/

const AGENT_ROLES = ['agent', 'group_leader'];

type ICounters = Omit<IDashboardPeriodStats, 'agents_count'>;

function sum(rows: IUserStats[], fromYm: number): ICounters {
  const total: ICounters = {
    prospects: 0,
    appointments_set: 0,
    sales_meetings: 0,
    sales_noc: 0,
    sales_ace: 0,
  };
  for (const row of rows) {
    if (row.ym < fromYm) continue;
    total.prospects += row.prospects;
    total.appointments_set += row.appointments_set;
    total.sales_meetings += row.appt_done;
    total.sales_noc += row.sales_noc;
    total.sales_ace += row.sales_ace;
  }
  return total;
}

function monthsOfYearFrom(fromYm: number): number[] {
  const year = Math.floor(fromYm / 100);
  const months: number[] = [];
  for (let month = fromYm % 100; month <= 12; month++) {
    months.push(year * 100 + month);
  }
  return months;
}

/******************************************************************************
                            DashboardService
******************************************************************************/

class DashboardService {
  // The old users policy decides who counts: everyone for admin and master
  // trainer, the caller's groups for trainer and group leader, self for agent.
  private async countAgents(caller: ICaller): Promise<number> {
    try {
      let users: IUser[];
      if (caller.role === 'admin' || caller.role === 'master_trainer') {
        users = await userRepository.findByRoles(AGENT_ROLES, 'active');
      } else if (caller.role === 'agent') {
        const self = await userRepository.findById(caller.id);
        users = self ? [self] : [];
      } else {
        const groupIds = (await scopeService.resolveGroupScope(caller)) ?? [];
        users = (
          await Promise.all(
            groupIds.map((id) => userRepository.findByGroupId(id, 'active')),
          )
        ).flat();
      }
      return users.filter(
        (user) => user.status === 'active' && AGENT_ROLES.includes(user.role),
      ).length;
    } catch (error) {
      return handleServiceError('DashboardService.countAgents', error);
    }
  }

  async getStats(
    caller: ICaller,
  ): Promise<{ ytd: IDashboardPeriodStats; mtd: IDashboardPeriodStats }> {
    try {
      const { ytdStart, mtdStart } = periodStartsUtc();
      const ytdFrom = monthBucketUtc(ytdStart);
      const mtdFrom = monthBucketUtc(mtdStart);

      // GL and AG dashboards show only their own prospects (documented quirk);
      // admin and master trainer sum everyone, inactive users included.
      const agentIds =
        caller.role === 'group_leader' || caller.role === 'agent'
          ? [caller.id]
          : await scopeService.resolveAgentScope(caller);

      const [rows, agentsCount] = await Promise.all([
        agentIds === null
          ? userStatsRepository.findByMonths(monthsOfYearFrom(ytdFrom))
          : userStatsRepository.findSince(agentIds, ytdFrom),
        this.countAgents(caller),
      ]);

      return {
        ytd: { ...sum(rows, ytdFrom), agents_count: agentsCount },
        mtd: { ...sum(rows, mtdFrom), agents_count: agentsCount },
      };
    } catch (error) {
      return handleServiceError('DashboardService.getStats', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export default new DashboardService();
