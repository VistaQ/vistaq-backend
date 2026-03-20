import dashboardRepository from '@src/repositories/dashboard.repository';
import { IDashboardPeriodStats } from '@src/types/dashboard.types';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                            DashboardService
******************************************************************************/

class DashboardService {
  async getStats(token: string): Promise<{ ytd: IDashboardPeriodStats; mtd: IDashboardPeriodStats }> {
    try {
      const now = new Date();

      const ytdStart = new Date(now.getFullYear(), 0, 1).toISOString();
      const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [ytdRes, mtdRes, agentsRes] = await Promise.all([
        dashboardRepository.getStats(token, ytdStart),
        dashboardRepository.getStats(token, mtdStart),
        dashboardRepository.getAgentsCount(token),
      ]);

      const agentsCount: number = agentsRes ?? 0;

      const ytdStats = (ytdRes?.data ?? {}) as Omit<IDashboardPeriodStats, 'agents_count'>;
      const mtdStats = (mtdRes?.data ?? {}) as Omit<IDashboardPeriodStats, 'agents_count'>;

      return {
        ytd: { ...ytdStats, agents_count: agentsCount },
        mtd: { ...mtdStats, agents_count: agentsCount },
      };
    } catch (error) {
      handleServiceError('DashboardService.getStats', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export default new DashboardService();
