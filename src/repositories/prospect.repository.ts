import loggingService from '@src/services/logging.service';
import supabaseService from '@src/services/supabase.service';
import { IProspect } from '@src/types/auth.types';
import { Database } from '@src/types/database.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type ProspectsRow = Database['public']['Tables']['prospects']['Row'];
type ProspectsInsert = Database['public']['Tables']['prospects']['Insert'];

/******************************************************************************
                            ProspectRepository
******************************************************************************/

class ProspectRepository {
  private mapRowToProspect(row: ProspectsRow): IProspect {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      agent_id: row.agent_id,
      group_id: row.group_id,
      prospect_name: row.prospect_name,
      prospect_email: row.prospect_email,
      prospect_phone: row.prospect_phone,
      current_stage: row.current_stage,
      prospect_entered_at: row.prospect_entered_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async insertProspect(data: ProspectsInsert, userToken: string): Promise<IProspect> {
    try {
      loggingService.info('ProspectRepository.insertProspect called', {
        prospect_name: data.prospect_name,
      });

      const response = await supabaseService.userInsert(userToken, 'prospects', data);

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        throw new Error('No prospect returned after insert');
      }

      const row = response.data[0] as unknown as ProspectsRow;
      return this.mapRowToProspect(row);
    } catch (error) {
      return handleRepositoryError('ProspectRepository.insertProspect', error);
    }
  }

  async findAll(userToken: string): Promise<IProspect[]> {
    try {
      loggingService.info('ProspectRepository.findAll called');

      const response = await supabaseService.userSelect(userToken, 'prospects', '*');

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = response.data as unknown as ProspectsRow[];
      return rows.map((row) => this.mapRowToProspect(row));
    } catch (error) {
      return handleRepositoryError('ProspectRepository.findAll', error);
    }
  }

  async findById(prospectId: string, userToken: string): Promise<IProspect | null> {
    try {
      loggingService.info('ProspectRepository.findById called', { prospectId });

      const response = await supabaseService.userSelect(
        userToken,
        'prospects',
        '*',
        { id: prospectId } as Partial<ProspectsRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const row = response.data[0] as unknown as ProspectsRow;
      return this.mapRowToProspect(row);
    } catch (error) {
      return handleRepositoryError('ProspectRepository.findById', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const prospectRepository = new ProspectRepository();
export default prospectRepository;
