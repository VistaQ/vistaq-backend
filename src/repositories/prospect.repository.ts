import loggingService from '@src/services/logging.service';
import supabaseService from '@src/services/supabase.service';
import { IProspect } from '@src/types/auth.types';
import { Database } from '@src/types/database.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type ProspectsRow = Database['public']['Tables']['prospects']['Row'];
type ProspectsInsert = Database['public']['Tables']['prospects']['Insert'];
type ProspectsUpdate = Database['public']['Tables']['prospects']['Update'];

/******************************************************************************
                            ProspectRepository
******************************************************************************/

class ProspectRepository {
  private mapRowToProspect(row: ProspectsRow): IProspect {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      agent_id: row.agent_id,
      prospect_name: row.prospect_name,
      prospect_email: row.prospect_email,
      prospect_phone: row.prospect_phone,
      current_stage: row.current_stage,
      prospect_entered_at: row.prospect_entered_at,
      stage_history: row.stage_history,
      appointment_date: row.appointment_date,
      appointment_start_time: row.appointment_start_time,
      appointment_end_time: row.appointment_end_time,
      appointment_location: row.appointment_location,
      appointment_status: row.appointment_status,
      appointment_completed_at: row.appointment_completed_at,
      sales_parts_completed: row.sales_parts_completed,
      products_sold: row.products_sold,
      sales_outcome: row.sales_outcome,
      unsuccessful_reason: row.unsuccessful_reason,
      sales_completed_at: row.sales_completed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async insertProspect(
    data: ProspectsInsert,
    userToken: string,
  ): Promise<IProspect> {
    try {
      loggingService.info('ProspectRepository.insertProspect called', {
        prospect_name: data.prospect_name,
      });

      const response = await supabaseService.userInsert(
        userToken,
        'prospects',
        data,
      );

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

      const response = await supabaseService.userSelect(
        userToken,
        'prospects',
        '*',
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = response.data as unknown as ProspectsRow[];
      return rows.map((row) => this.mapRowToProspect(row));
    } catch (error) {
      return handleRepositoryError('ProspectRepository.findAll', error);
    }
  }

  async findById(
    prospectId: string,
    userToken: string,
  ): Promise<IProspect | null> {
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

  async updateProspect(
    prospectId: string,
    data: ProspectsUpdate,
    userToken: string,
  ): Promise<IProspect | null> {
    try {
      loggingService.info('ProspectRepository.updateProspect called', {
        prospectId,
      });

      const response = await supabaseService.userUpdate(
        userToken,
        'prospects',
        data,
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
      return handleRepositoryError('ProspectRepository.updateProspect', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const prospectRepository = new ProspectRepository();
export default prospectRepository;
