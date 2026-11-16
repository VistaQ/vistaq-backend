import {
  TaxonomyConflictError,
  TaxonomyNotFoundError,
} from '@src/models/errors/taxonomy.errors';
import taxonomyRepository, {
  type ITaxonomyUpdate,
} from '@src/repositories/taxonomy.repository';
import type { ITaxonomy } from '@src/types/taxonomy.types';
import { handleServiceError } from '@src/utils/errorHandlers';
import { getRootCause } from '@src/utils/errors';

/******************************************************************************
                            Interfaces
******************************************************************************/

interface IGetTaxonomiesParams {
  type?: string;
}

interface ICreateTaxonomyParams {
  type: string;
  value: string;
  sortOrder?: number;
}

interface IUpdateTaxonomyParams {
  id: string;
  value?: string;
  sortOrder?: number;
}

interface IDeleteTaxonomyParams {
  id: string;
}

/******************************************************************************
                            TaxonomyService
******************************************************************************/

class TaxonomyService {
  async getTaxonomies(params: IGetTaxonomiesParams): Promise<ITaxonomy[]> {
    try {
      const taxonomies = await taxonomyRepository.findAll(params.type);

      return taxonomies.sort(
        (a, b) => a.sort_order - b.sort_order || a.value.localeCompare(b.value),
      );
    } catch (error) {
      return handleServiceError('TaxonomyService.getTaxonomies', error);
    }
  }

  async createTaxonomy(params: ICreateTaxonomyParams): Promise<ITaxonomy> {
    try {
      return await taxonomyRepository.insert({
        type: params.type,
        value: params.value,
        sort_order: params.sortOrder ?? 0,
      });
    } catch (error) {
      const rootCause = getRootCause(error);
      if (
        rootCause instanceof TaxonomyConflictError ||
        rootCause instanceof TaxonomyNotFoundError
      ) {
        throw rootCause;
      }
      return handleServiceError('TaxonomyService.createTaxonomy', error);
    }
  }

  async updateTaxonomy(params: IUpdateTaxonomyParams): Promise<ITaxonomy> {
    try {
      const values: ITaxonomyUpdate = {};
      if (params.value !== undefined) values.value = params.value;
      if (params.sortOrder !== undefined) values.sort_order = params.sortOrder;

      return await taxonomyRepository.update(params.id, values);
    } catch (error) {
      const rootCause = getRootCause(error);
      if (
        rootCause instanceof TaxonomyConflictError ||
        rootCause instanceof TaxonomyNotFoundError
      ) {
        throw rootCause;
      }
      return handleServiceError('TaxonomyService.updateTaxonomy', error);
    }
  }

  async deleteTaxonomy(params: IDeleteTaxonomyParams): Promise<void> {
    try {
      await taxonomyRepository.remove(params.id);
    } catch (error) {
      const rootCause = getRootCause(error);
      if (
        rootCause instanceof TaxonomyConflictError ||
        rootCause instanceof TaxonomyNotFoundError
      ) {
        throw rootCause;
      }
      return handleServiceError('TaxonomyService.deleteTaxonomy', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const taxonomyService = new TaxonomyService();
export default taxonomyService;
