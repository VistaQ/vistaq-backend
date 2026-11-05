import { randomUUID } from 'crypto';

import { TRANSITIONAL_TENANT_ID } from '@src/constants/tenant';
import { DynamoConditionFailedError } from '@src/models/errors/dynamo.error';
import {
  TaxonomyConflictError,
  TaxonomyNotFoundError,
} from '@src/models/errors/taxonomy.errors';
import { DynamoTable } from '@src/services/dynamo.service';
import type { ITaxonomy } from '@src/types/taxonomy.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';
import { nowUtc } from '@src/utils/period';

interface ITaxonomyItem {
  id: string;
  type: string;
  value: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ITaxonomyUpdate {
  value?: string;
  sort_order?: number;
}

const taxonomies = new DynamoTable<ITaxonomyItem>('Taxonomies');

function toTaxonomy(item: ITaxonomyItem): ITaxonomy {
  return {
    id: item.id,
    tenant_id: TRANSITIONAL_TENANT_ID,
    type: item.type,
    value: item.value,
    sort_order: item.sort_order,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

/******************************************************************************
                            TaxonomyRepository
******************************************************************************/

class TaxonomyRepository {
  // No Uniques table (design K5), so (type, value) is guarded by an index read.
  // It is eventually consistent; acceptable because only admins write here.
  private async assertValueFree(
    type: string,
    value: string,
    exceptId?: string,
  ): Promise<void> {
    try {
      const taken = await taxonomies.queryAll({
        index: 'byType',
        keyCondition: 'type = :type',
        filter: 'value = :value',
        values: { ':type': type, ':value': value },
      });
      if (taken.some((item) => item.id !== exceptId)) {
        throw new TaxonomyConflictError();
      }
    } catch (error) {
      if (error instanceof TaxonomyConflictError) throw error;
      return handleRepositoryError('TaxonomyRepository.assertValueFree', error);
    }
  }

  async findAll(type?: string): Promise<ITaxonomy[]> {
    try {
      const items = type
        ? await taxonomies.queryAll({
            index: 'byType',
            keyCondition: 'type = :type',
            values: { ':type': type },
          })
        : await taxonomies.scanAll();
      return items.map(toTaxonomy);
    } catch (error) {
      return handleRepositoryError('TaxonomyRepository.findAll', error);
    }
  }

  async insert(data: {
    type: string;
    value: string;
    sort_order: number;
  }): Promise<ITaxonomy> {
    try {
      await this.assertValueFree(data.type, data.value);
      const now = nowUtc();
      const item: ITaxonomyItem = {
        id: randomUUID(),
        ...data,
        created_at: now,
        updated_at: now,
      };
      await taxonomies.put(item, { condition: 'attribute_not_exists(id)' });
      return toTaxonomy(item);
    } catch (error) {
      if (error instanceof TaxonomyConflictError) throw error;
      return handleRepositoryError('TaxonomyRepository.insert', error);
    }
  }

  async update(id: string, data: ITaxonomyUpdate): Promise<ITaxonomy> {
    try {
      const existing = await taxonomies.get({ id }, { consistent: true });
      if (!existing) {
        throw new TaxonomyNotFoundError();
      }
      if (data.value !== undefined && data.value !== existing.value) {
        await this.assertValueFree(existing.type, data.value, id);
      }
      const updated = await taxonomies.updateFields({ id }, data, {
        condition: 'attribute_exists(id)',
      });
      if (!updated) {
        throw new TaxonomyNotFoundError();
      }
      return toTaxonomy(updated);
    } catch (error) {
      if (
        error instanceof TaxonomyConflictError ||
        error instanceof TaxonomyNotFoundError
      ) {
        throw error;
      }
      if (error instanceof DynamoConditionFailedError) {
        throw new TaxonomyNotFoundError();
      }
      return handleRepositoryError('TaxonomyRepository.update', error);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await taxonomies.delete({ id }, { condition: 'attribute_exists(id)' });
    } catch (error) {
      if (error instanceof DynamoConditionFailedError) {
        throw new TaxonomyNotFoundError();
      }
      return handleRepositoryError('TaxonomyRepository.remove', error);
    }
  }
}

export const taxonomyRepository = new TaxonomyRepository();
export default taxonomyRepository;
