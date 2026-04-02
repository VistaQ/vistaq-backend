import agentPointsRepository from '@src/repositories/agentPoints.repository';
import pointActivityTypeService from '@src/services/pointActivityType.service';
import {
  IAgentPointsBreakdownItem,
  IAgentPointsResponse,
  PointCategory,
} from '@src/types/agentPoints.types';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                            AgentPointsService
******************************************************************************/

class AgentPointsService {
  async getAgentPoints(
    tenantId: string,
    userId: string,
    page: number,
    limit: number,
  ): Promise<IAgentPointsResponse> {
    try {
      const offset = (page - 1) * limit;

      const [summaryResponse, breakdownResponse, activityTypes] = await Promise.all([
        agentPointsRepository.getSummary(tenantId, userId),
        agentPointsRepository.getBreakdown(tenantId, userId, limit, offset),
        pointActivityTypeService.getAllActivityTypes(),
      ]);

      const labelMap = Object.fromEntries(activityTypes.map((t) => [t.name, t.label]));

      const summary = (summaryResponse?.data ?? {}) as {
        total?: number;
        categories?: Record<PointCategory, number>;
      };

      const breakdownRaw = (breakdownResponse?.data ?? {}) as {
        rows?: Array<{
          id: string;
          date: string;
          category: PointCategory;
          action: string;
          subject: string | null;
          points: number;
        }>;
        total_count?: number;
      };

      const totalCount = breakdownRaw.total_count ?? 0;
      const breakdown: IAgentPointsBreakdownItem[] = (
        breakdownRaw.rows ?? []
      ).map((row) => ({
        id: row.id,
        date: row.date,
        category: row.category,
        action: labelMap[row.action] ?? row.action,
        subject: row.subject,
        points: row.points,
      }));

      return {
        total: summary.total ?? 0,
        categories: summary.categories ?? {
          prospect: 0,
          sales: 0,
          coaching: 0,
        },
        breakdown,
        pagination: {
          page,
          limit,
          total_count: totalCount,
          total_pages: Math.ceil(totalCount / limit),
        },
      };
    } catch (error) {
      return handleServiceError('AgentPointsService.getAgentPoints', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export default new AgentPointsService();
