import { AgentCodeConflictError, AgentCodeNotFoundError } from '@src/models/errors/agentCode.errors';
import supabaseService from '@src/services/supabase.service';
import { IAgentCode } from '@src/types/agentCode';
import { Database } from '@src/types/database.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type AgentCodesRow = Database['public']['Tables']['agent_codes']['Row'];
type AgentCodesInsert = Database['public']['Tables']['agent_codes']['Insert'];
type AgentCodesUpdate = Database['public']['Tables']['agent_codes']['Update'];

const UNIQUE_VIOLATION_CODE = '23505';

/******************************************************************************
                            AgentCodeRepository
******************************************************************************/

class AgentCodeRepository {
  private mapRowToAgentCode(row: AgentCodesRow): IAgentCode {
    return {
      agent_code: row.agent_code,
      is_used: row.is_used,
      user_id: row.user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async findAll(
    userToken: string,
    filters?: { is_used?: boolean },
  ): Promise<IAgentCode[]> {
    try {
      const response = await supabaseService.userSelect(
        userToken,
        'agent_codes',
        '*',
        filters,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = (response.data ?? []) as unknown as AgentCodesRow[];
      return data.map((row) => this.mapRowToAgentCode(row));
    } catch (error) {
      return handleRepositoryError('AgentCodeRepository.findAll', error);
    }
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

  async update(
    userToken: string,
    filters: { tenant_id: string; agent_code: string },
    values: AgentCodesUpdate,
  ): Promise<IAgentCode> {
    try {
      const response = await supabaseService.userUpdate(
        userToken,
        'agent_codes',
        values,
        filters,
      );

      if (response.error) {
        if ((response.error as { code?: string }).code === UNIQUE_VIOLATION_CODE) {
          throw new AgentCodeConflictError();
        }
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as AgentCodesRow[];
      if (rows.length === 0) {
        throw new AgentCodeNotFoundError();
      }

      return this.mapRowToAgentCode(rows[0]);
    } catch (error) {
      return handleRepositoryError('AgentCodeRepository.update', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const agentCodeRepository = new AgentCodeRepository();
export default agentCodeRepository;
