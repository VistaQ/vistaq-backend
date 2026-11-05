import pointTotalsRepository, {
  LIFETIME_YM,
} from '@src/repositories/pointTotals.repository';
import pointTransactionRepository from '@src/repositories/pointTransaction.repository';
import pointActivityTypeService from '@src/services/pointActivityType.service';
import type { IAgentPointsResponse } from '@src/types/agentPoints.types';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                            AgentPointsService
******************************************************************************/

class AgentPointsService {
  async getAgentPoints(
    userId: string,
    page: number,
    limit: number,
  ): Promise<IAgentPointsResponse> {
    try {
      const offset = (page - 1) * limit;
      const [lifetime, recent, activityTypes] = await Promise.all([
        pointTotalsRepository.findOne(userId, LIFETIME_YM),
        pointTransactionRepository.findRecentForUser(userId, offset + limit),
        pointActivityTypeService.getAllActivityTypes(),
      ]);
      const labels = new Map(activityTypes.map((t) => [t.name, t.label]));
      const totalCount = lifetime?.txn_count ?? 0;

      return {
        total: lifetime?.points ?? 0,
        categories: lifetime?.categories ?? {
          prospect: 0,
          sales: 0,
          coaching: 0,
        },
        breakdown: recent.slice(offset).map((row) => ({
          id: row.id,
          date: row.created_at,
          category: row.category,
          action: labels.get(row.activity) ?? row.activity,
          subject: row.subject_label,
          points: row.points,
        })),
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
