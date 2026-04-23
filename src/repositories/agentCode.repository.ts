import supabaseService from '@src/services/supabase.service';
import { IAgentCode } from '@src/types/agentCode';
import { Database } from '@src/types/database.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type AgentCodesRow = Database['public']['Tables']['agent_codes']['Row'];
type AgentCodesInsert = Database['public']['Tables']['agent_codes']['Insert'];

/******************************************************************************
                            AgentCodeRepository
******************************************************************************/

class AgentCodeRepository {
  private mapRowToAgentCode(row: AgentCodesRow): IAgentCode {
    return {
      agent_code: row.agent_code,
      is_used: row.is_used,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async upsertMany(
    rows: AgentCodesInsert[],
    userToken: string,
  ): Promise<IAgentCode[]> {
    try {
      const response = await supabaseService.userUpsert(
        userToken,
        'agent_codes',
        rows,
        { onConflict: 'tenant_id,agent_code', ignoreDuplicates: false },
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        throw new Error('No agent codes returned after upsert');
      }

      const data = response.data as unknown as AgentCodesRow[];
      return data.map((row) => this.mapRowToAgentCode(row));
    } catch (error) {
      return handleRepositoryError('AgentCodeRepository.upsertMany', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const agentCodeRepository = new AgentCodeRepository();
export default agentCodeRepository;
