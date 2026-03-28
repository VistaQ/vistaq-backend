import supabaseService from '@src/services/supabase.service';
import { Database } from '@src/types/database.types';
import { IPointConfig } from '@src/types/pointConfig.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type PointConfigsRow = Database['public']['Tables']['point_configs']['Row'];
type PointConfigsInsert = Database['public']['Tables']['point_configs']['Insert'];
type PointConfigsUpdate = Database['public']['Tables']['point_configs']['Update'];

/******************************************************************************
                            PointConfigRepository
******************************************************************************/

class PointConfigRepository {
  private mapRowToPointConfig(row: PointConfigsRow): IPointConfig {
    return {
      id: row.id,
      activity: row.activity,
      points: row.points,
      tenant_id: row.tenant_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async insertPointConfig(
    data: PointConfigsInsert,
    userToken: string,
  ): Promise<IPointConfig> {
    try {
      const response = await supabaseService.userInsert(
        userToken,
        'point_configs',
        data,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        throw new Error('No point config returned after insert');
      }

      const row = response.data[0] as unknown as PointConfigsRow;
      return this.mapRowToPointConfig(row);
    } catch (error) {
      return handleRepositoryError('PointConfigRepository.insertPointConfig', error);
    }
  }

  async findByTenantId(
    tenantId: string,
    userToken: string,
  ): Promise<IPointConfig[]> {
    try {
      const response = await supabaseService.userSelect(
        userToken,
        'point_configs',
        '*',
        { tenant_id: tenantId } as Partial<PointConfigsRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as PointConfigsRow[];
      return rows.map((row) => this.mapRowToPointConfig(row));
    } catch (error) {
      return handleRepositoryError('PointConfigRepository.findByTenantId', error);
    }
  }

  async findByTenantAndActivity(
    tenantId: string,
    activity: string,
    userToken: string,
  ): Promise<IPointConfig | null> {
    try {
      const response = await supabaseService.userSelect(
        userToken,
        'point_configs',
        '*',
        { tenant_id: tenantId, activity } as Partial<PointConfigsRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const row = response.data[0] as unknown as PointConfigsRow;
      return this.mapRowToPointConfig(row);
    } catch (error) {
      return handleRepositoryError('PointConfigRepository.findByTenantAndActivity', error);
    }
  }

  async updatePointConfig(
    tenantId: string,
    activity: string,
    data: PointConfigsUpdate,
    userToken: string,
  ): Promise<IPointConfig | null> {
    try {
      const response = await supabaseService.userUpdate(
        userToken,
        'point_configs',
        data,
        { tenant_id: tenantId, activity } as Partial<PointConfigsRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const row = response.data[0] as unknown as PointConfigsRow;
      return this.mapRowToPointConfig(row);
    } catch (error) {
      return handleRepositoryError('PointConfigRepository.updatePointConfig', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const pointConfigRepository = new PointConfigRepository();
export default pointConfigRepository;
