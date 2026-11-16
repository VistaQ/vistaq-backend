import groupRepository from '@src/repositories/group.repository';
import pointTotalsRepository, {
  LIFETIME_YM,
} from '@src/repositories/pointTotals.repository';
import salesReportMtdRepository from '@src/repositories/salesReportMtd.repository';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';
import userRepository from '@src/repositories/user.repository';
import userStatsRepository from '@src/repositories/userStats.repository';
import type { IUser } from '@src/types/auth.types';
import type {
  ILeaderboardEntry,
  ILeaderboardStats,
  ILeaderboardStatsGroup,
  ILeaderboardStatsIndividual,
} from '@src/types/leaderboard.types';
import { handleServiceError } from '@src/utils/errorHandlers';
import { monthBucketUtc, nowUtc, periodStartsUtc } from '@src/utils/period';

/******************************************************************************
                            Helpers
******************************************************************************/

const AGENT_ROLES = ['agent', 'group_leader'];

interface ISales {
  ace: number;
  fyc: number;
  fyct: number;
  noc: number;
  acs: number;
}

interface ICounters {
  prospects_added: number;
  appointments_completed: number;
  sales_meetings: number;
  sales_successful: number;
  total_points: number;
}

const NO_SALES: ISales = { ace: 0, fyc: 0, fyct: 0, noc: 0, acs: 0 };

function zeroCounters(): ICounters {
  return {
    prospects_added: 0,
    appointments_completed: 0,
    sales_meetings: 0,
    sales_successful: 0,
    total_points: 0,
  };
}

function monthsBetween(fromYm: number, toYm: number): number[] {
  const months: number[] = [];
  for (let ym = fromYm; ym <= toYm; ym = ym % 100 === 12 ? ym + 89 : ym + 1) {
    months.push(ym);
  }
  return months;
}

/******************************************************************************
                            LeaderboardService
******************************************************************************/

class LeaderboardService {
  private async activeAgents(): Promise<IUser[]> {
    try {
      return await userRepository.findByRoles(AGENT_ROLES, 'active');
    } catch (error) {
      return handleServiceError('LeaderboardService.activeAgents', error);
    }
  }

  private async groupNames(users: IUser[]): Promise<Map<string, string>> {
    try {
      const groups = await groupRepository.findByIds(
        users.map((user) => user.group_id).filter((id): id is string => !!id),
      );
      return new Map(groups.map((group) => [group.id, group.name]));
    } catch (error) {
      return handleServiceError('LeaderboardService.groupNames', error);
    }
  }

  async getLeaderboard(): Promise<ILeaderboardEntry[]> {
    try {
      const [users, lifetime] = await Promise.all([
        this.activeAgents(),
        pointTotalsRepository.findByMonths([LIFETIME_YM]),
      ]);
      const names = await this.groupNames(users);
      const points = new Map(lifetime.map((row) => [row.user_id, row.points]));

      return users
        .map((user) => ({
          agent_id: user.id,
          agent_name: user.name,
          agent_code: user.agent_code ?? '',
          group_id: user.group_id,
          group_name: user.group_id ? (names.get(user.group_id) ?? null) : null,
          total_points: points.get(user.id) ?? 0,
        }))
        .sort((a, b) => b.total_points - a.total_points);
    } catch (error) {
      return handleServiceError('LeaderboardService.getLeaderboard', error);
    }
  }

  private async salesByUser(
    period: 'mtd' | 'ytd',
    year: number,
    month: number,
  ): Promise<Map<string, ISales>> {
    try {
      if (period === 'mtd') {
        const rows = await salesReportMtdRepository.findFycRowsByYear(year);
        return new Map(
          rows
            .filter((row) => row.month === month)
            .map((row) => [
              row.user_id,
              {
                ace: row.ace,
                fyc: row.fyc_mtd,
                fyct: row.fyct_mtd,
                noc: row.noc,
                acs: row.acs,
              },
            ]),
        );
      }
      const rows =
        await salesReportYtdRepository.findLatestYtdPerUserByYear(year);
      return new Map(
        rows.map((row) => [
          row.user_id,
          {
            ace: row.ace,
            fyc: row.fyc,
            fyct: row.fyct,
            noc: row.noc,
            acs: row.acs,
          },
        ]),
      );
    } catch (error) {
      return handleServiceError('LeaderboardService.salesByUser', error);
    }
  }

  async getStats(period: 'mtd' | 'ytd'): Promise<ILeaderboardStats> {
    try {
      const { mtdStart, ytdStart } = periodStartsUtc();
      const periodStart = period === 'mtd' ? mtdStart : ytdStart;
      const fromYm = monthBucketUtc(periodStart);
      const start = new Date(periodStart);

      const users = await this.activeAgents();
      const userIds = users.map((user) => user.id);
      const [names, statsRows, pointRows, sales, groups] = await Promise.all([
        this.groupNames(users),
        userStatsRepository.findSince(userIds, fromYm),
        pointTotalsRepository.findByMonths(
          monthsBetween(fromYm, monthBucketUtc(nowUtc())),
        ),
        this.salesByUser(
          period,
          start.getUTCFullYear(),
          start.getUTCMonth() + 1,
        ),
        groupRepository.findAll(),
      ]);

      const counters = new Map<string, ICounters>();
      const countersOf = (userId: string): ICounters => {
        let entry = counters.get(userId);
        if (!entry) {
          entry = zeroCounters();
          counters.set(userId, entry);
        }
        return entry;
      };
      for (const row of statsRows) {
        const entry = countersOf(row.user_id);
        entry.prospects_added += row.prospects;
        entry.appointments_completed += row.appt_done;
        entry.sales_meetings += row.stage_sales;
        entry.sales_successful += row.sales_noc;
      }
      const active = new Set(userIds);
      for (const row of pointRows) {
        if (active.has(row.user_id))
          countersOf(row.user_id).total_points += row.points;
      }

      const individual: ILeaderboardStatsIndividual[] = users.map((user) => {
        const s = sales.get(user.id) ?? NO_SALES;
        return {
          user_id: user.id,
          name: user.name,
          agent_code: user.agent_code ?? '',
          group_id: user.group_id,
          group_name: user.group_id ? (names.get(user.group_id) ?? null) : null,
          ...(counters.get(user.id) ?? zeroCounters()),
          ace: s.ace,
          fyc: s.fyc,
          fyct: s.fyct,
          acs: s.acs,
        };
      });

      const leaders = new Map(
        (
          await userRepository.findByIds(
            groups
              .map((group) => group.leader_id)
              .filter((id): id is string => !!id),
          )
        ).map((leader) => [leader.id, leader.name]),
      );
      const groupStats: ILeaderboardStatsGroup[] = [];
      for (const group of groups) {
        const members = users.filter((user) => user.group_id === group.id);
        if (members.length === 0) continue;
        const total = zeroCounters();
        const groupSales = { ace: 0, fyc: 0, fyct: 0, noc: 0 };
        for (const member of members) {
          const c = counters.get(member.id);
          if (c) {
            total.prospects_added += c.prospects_added;
            total.appointments_completed += c.appointments_completed;
            total.sales_meetings += c.sales_meetings;
            total.sales_successful += c.sales_successful;
            total.total_points += c.total_points;
          }
          const s = sales.get(member.id);
          if (s) {
            groupSales.ace += s.ace;
            groupSales.fyc += s.fyc;
            groupSales.fyct += s.fyct;
            groupSales.noc += s.noc;
          }
        }
        groupStats.push({
          group_id: group.id,
          group_name: group.name,
          leader_name: group.leader_id
            ? (leaders.get(group.leader_id) ?? null)
            : null,
          member_count: members.length,
          ...total,
          ace: groupSales.ace,
          fyc: groupSales.fyc,
          fyct: groupSales.fyct,
          acs: groupSales.noc ? groupSales.ace / groupSales.noc : 0,
        });
      }

      return { period, generated_at: nowUtc(), individual, groups: groupStats };
    } catch (error) {
      return handleServiceError('LeaderboardService.getStats', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export default new LeaderboardService();
