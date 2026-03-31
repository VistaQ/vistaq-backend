import supabaseService from '@src/services/supabase.service';
import { handleRepositoryError } from '@src/utils/errorHandlers';

/******************************************************************************
                            LeaderboardRepository
******************************************************************************/

class LeaderboardRepository {
  async getLeaderboard(tenantId: string) {
    try {
      return await supabaseService.adminRpc('get_agent_leaderboard', {
        p_tenant_id: tenantId,
      });
    } catch (error) {
      handleRepositoryError('LeaderboardRepository.getLeaderboard', error);
    }
  }

  async getStats(tenantId: string, periodStart: string) {
    try {
      return await supabaseService.adminRpc('get_leaderboard_stats', {
        p_tenant_id: tenantId,
        p_period_start: periodStart,
      });
    } catch (error) {
      handleRepositoryError('LeaderboardRepository.getStats', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export default new LeaderboardRepository();
