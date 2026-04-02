import supabaseService from '@src/services/supabase.service';
import { Database } from '@src/types/database.types';
import { IPointActivityType } from '@src/types/pointActivityType.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type PointActivityTypeRow = Database['public']['Tables']['point_activity_types']['Row'];

/******************************************************************************
                        PointActivityTypeRepository
******************************************************************************/

class PointActivityTypeRepository {
  async findAll(): Promise<IPointActivityType[]> {
    try {
      const response = await supabaseService.adminSelect(
        'point_activity_types',
        'name, category, label, subject_type',
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as PointActivityTypeRow[];
      return rows.map((row) => this.mapRow(row));
    } catch (error) {
      return handleRepositoryError('PointActivityTypeRepository.findAll', error);
    }
  }

  async findByName(name: string): Promise<IPointActivityType | null> {
    try {
      const response = await supabaseService.adminSelect(
        'point_activity_types',
        'name, category, label, subject_type',
        { name },
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const row = response.data[0] as unknown as PointActivityTypeRow;
      return this.mapRow(row);
    } catch (error) {
      return handleRepositoryError('PointActivityTypeRepository.findByName', error);
    }
  }

  private mapRow(row: PointActivityTypeRow): IPointActivityType {
    return {
      name: row.name,
      category: row.category,
      label: row.label,
      subject_type: row.subject_type,
    };
  }
}

/******************************************************************************
                                Export
******************************************************************************/

const pointActivityTypeRepository = new PointActivityTypeRepository();
export default pointActivityTypeRepository;
