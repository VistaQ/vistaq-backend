import supabaseService from '@src/services/supabase.service';
import { Database } from '@src/types/database.types';
import { ITenantLabel } from '@src/types/tenantLabel.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type TenantLabelsRow = Database['public']['Tables']['tenant_labels']['Row'];

/******************************************************************************
                            TenantLabelRepository
******************************************************************************/

class TenantLabelRepository {
  private mapRowToTenantLabel(row: TenantLabelsRow): ITenantLabel {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      key: row.key,
      value: row.value,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async findByTenant(
    userToken: string,
    filters: { tenant_id: string },
  ): Promise<ITenantLabel[]> {
    try {
      const response = await supabaseService.userSelect(
        userToken,
        'tenant_labels',
        '*',
        filters,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as TenantLabelsRow[];
      return rows.map((row) => this.mapRowToTenantLabel(row));
    } catch (error) {
      return handleRepositoryError('TenantLabelRepository.findByTenant', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const tenantLabelRepository = new TenantLabelRepository();
export default tenantLabelRepository;
