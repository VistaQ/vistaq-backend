import leaderboardRepository from '@src/repositories/leaderboard.repository';
import { ILeaderboardEntry } from '@src/types/leaderboard.types';
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
      handleServiceError('LeaderboardService.getLeaderboard', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export default new LeaderboardService();
