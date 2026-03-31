import supabaseService from '@src/services/supabase.service';
import { handleRepositoryError } from '@src/utils/errorHandlers';

/******************************************************************************
                            AgentPointsRepository
******************************************************************************/

class AgentPointsRepository {
  async getSummary(tenantId: string, userId: string) {
    try {
      return await supabaseService.adminRpc('get_agent_points_summary', {
        p_tenant_id: tenantId,
        p_user_id: userId,
      });
    } catch (error) {
      handleRepositoryError('AgentPointsRepository.getSummary', error);
    }
  }

  async getBreakdown(tenantId: string, userId: string, limit: number, offset: number) {
    try {
      return await supabaseService.adminRpc('get_agent_points_breakdown', {
        p_tenant_id: tenantId,
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset,
      });
    } catch (error) {
      handleRepositoryError('AgentPointsRepository.getBreakdown', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export default new AgentPointsRepository();
