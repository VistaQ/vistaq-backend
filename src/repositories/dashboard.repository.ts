import { handleRepositoryError } from '@src/utils/errorHandlers';
import supabaseService from '@src/services/supabase.service';

/******************************************************************************
                            DashboardRepository
******************************************************************************/

class DashboardRepository {
  async getStats(token: string, periodStart: string) {
    try {
      return await supabaseService.userRpc(token, 'get_dashboard_stats', {
        period_start: periodStart,
      });
    } catch (error) {
      handleRepositoryError('DashboardRepository.getStats', error);
    }
  }

  async getAgentsCount(token: string): Promise<number> {
    try {
      return await supabaseService.userCount(token, 'users', 'role', ['agent', 'group_leader']);
    } catch (error) {
      handleRepositoryError('DashboardRepository.getAgentsCount', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export default new DashboardRepository();
