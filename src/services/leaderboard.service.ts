import leaderboardRepository from '@src/repositories/leaderboard.repository';
import {
  ILeaderboardEntry,
  ILeaderboardStats,
  ILeaderboardStatsGroup,
  ILeaderboardStatsIndividual,
} from '@src/types/leaderboard.types';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                            LeaderboardService
******************************************************************************/

class LeaderboardService {
  async getLeaderboard(tenantId: string): Promise<ILeaderboardEntry[]> {
    try {
      const response = await leaderboardRepository.getLeaderboard(tenantId);
      return (response?.data ?? []) as ILeaderboardEntry[];
    } catch (error) {
      return handleServiceError('LeaderboardService.getLeaderboard', error);
    }
  }

  async getStats(tenantId: string, period: 'mtd' | 'ytd'): Promise<ILeaderboardStats> {
    try {
      const now = new Date();
      const periodStart =
        period === 'mtd'
          ? new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
          : new Date(now.getFullYear(), 0, 1).toISOString();

      const response = await leaderboardRepository.getStats(tenantId, periodStart);
      const raw = (response?.data ?? {}) as {
        individual?: ILeaderboardStatsIndividual[];
        groups?: ILeaderboardStatsGroup[];
      };

      return {
        period,
        generated_at: new Date().toISOString(),
        individual: raw.individual ?? [],
        groups: raw.groups ?? [],
      };
    } catch (error) {
      return handleServiceError('LeaderboardService.getStats', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export default new LeaderboardService();
