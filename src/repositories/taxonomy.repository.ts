import {
  TaxonomyConflictError,
  TaxonomyNotFoundError,
} from '@src/models/errors/taxonomy.errors';
import supabaseService from '@src/services/supabase.service';
import { Database } from '@src/types/database.types';
import { ITaxonomy } from '@src/types/taxonomy.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type TaxonomiesRow = Database['public']['Tables']['taxonomies']['Row'];
type TaxonomiesInsert = Database['public']['Tables']['taxonomies']['Insert'];
type TaxonomiesUpdate = Database['public']['Tables']['taxonomies']['Update'];

const UNIQUE_VIOLATION_CODE = '23505';

/******************************************************************************
                            TaxonomyRepository
******************************************************************************/

class TaxonomyRepository {
  private mapRowToTaxonomy(row: TaxonomiesRow): ITaxonomy {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      type: row.type,
      value: row.value,
      sort_order: row.sort_order,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async findByTenant(
    userToken: string,
    filters: { tenant_id: string; type?: string },
  ): Promise<ITaxonomy[]> {
    try {
      const response = await supabaseService.userSelect(
        userToken,
        'taxonomies',
        '*',
        filters,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as TaxonomiesRow[];
      return rows.map((row) => this.mapRowToTaxonomy(row));
    } catch (error) {
      return handleRepositoryError('TaxonomyRepository.findByTenant', error);
    }
  }

  async insert(
    userToken: string,
    data: TaxonomiesInsert,
  ): Promise<ITaxonomy> {
    try {
      const response = await supabaseService.userInsert(
        userToken,
        'taxonomies',
        data,
      );

      if (response.error) {
        if (
          (response.error as { code?: string }).code === UNIQUE_VIOLATION_CODE
        ) {
          throw new TaxonomyConflictError();
        }
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        throw new Error('No taxonomy returned after insert');
      }

      const row = response.data[0] as unknown as TaxonomiesRow;
      return this.mapRowToTaxonomy(row);
    } catch (error) {
      return handleRepositoryError('TaxonomyRepository.insert', error);
    }
  }

  async update(
    userToken: string,
    filters: { id: string; tenant_id: string },
    values: TaxonomiesUpdate,
  ): Promise<ITaxonomy> {
    try {
      const response = await supabaseService.userUpdate(
        userToken,
        'taxonomies',
        values,
        filters,
      );

      if (response.error) {
        if (
          (response.error as { code?: string }).code === UNIQUE_VIOLATION_CODE
        ) {
          throw new TaxonomyConflictError();
        }
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as TaxonomiesRow[];
      if (rows.length === 0) {
        throw new TaxonomyNotFoundError();
      }

      return this.mapRowToTaxonomy(rows[0]);
    } catch (error) {
      return handleRepositoryError('TaxonomyRepository.update', error);
    }
  }

  async remove(
    userToken: string,
    filters: { id: string; tenant_id: string },
  ): Promise<void> {
    try {
      const response = await supabaseService.userDelete(
        userToken,
        'taxonomies',
        filters,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as TaxonomiesRow[];
      if (rows.length === 0) {
        throw new TaxonomyNotFoundError();
      }
    } catch (error) {
      return handleRepositoryError('TaxonomyRepository.remove', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const taxonomyRepository = new TaxonomyRepository();
export default taxonomyRepository;
