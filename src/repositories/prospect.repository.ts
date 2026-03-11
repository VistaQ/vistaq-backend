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
      const prospect: IProspect = {
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

      return prospect;
    } catch (error) {
      return handleRepositoryError('ProspectRepository.insertProspect', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const prospectRepository = new ProspectRepository();
export default prospectRepository;
