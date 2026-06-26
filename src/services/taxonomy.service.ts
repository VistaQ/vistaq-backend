import {
  TaxonomyConflictError,
  TaxonomyNotFoundError,
} from '@src/models/errors/taxonomy.errors';
import taxonomyRepository from '@src/repositories/taxonomy.repository';
import { Database } from '@src/types/database.types';
import { ITaxonomy } from '@src/types/taxonomy.types';
import { handleServiceError } from '@src/utils/errorHandlers';
import loggingService from '@src/services/logging.service';
import { getRootCause } from '@src/utils/sentry.utils';

type TaxonomiesUpdate = Database['public']['Tables']['taxonomies']['Update'];

/******************************************************************************
                            Interfaces
******************************************************************************/

interface IGetTaxonomiesParams {
  tenantId: string;
  type?: string;
  token: string;
}

interface ICreateTaxonomyParams {
  tenantId: string;
  type: string;
  value: string;
  sortOrder?: number;
  token: string;
}

interface IUpdateTaxonomyParams {
  id: string;
  tenantId: string;
  value?: string;
  sortOrder?: number;
  token: string;
}

interface IDeleteTaxonomyParams {
  id: string;
  tenantId: string;
  token: string;
}

/******************************************************************************
                            TaxonomyService
******************************************************************************/

class TaxonomyService {
  async getTaxonomies(params: IGetTaxonomiesParams): Promise<ITaxonomy[]> {
    try {
      const filters = {
        tenant_id: params.tenantId,
        ...(params.type ? { type: params.type } : {}),
      };

      const taxonomies = await taxonomyRepository.findByTenant(
        params.token,
        filters,
      );

      return taxonomies.sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.value.localeCompare(b.value),
      );
    } catch (error) {
      return handleServiceError('TaxonomyService.getTaxonomies', error);
    }
  }

  async createTaxonomy(params: ICreateTaxonomyParams): Promise<ITaxonomy> {
    try {
      loggingService.info('TaxonomyService.createTaxonomy called', {
        tenantId: params.tenantId,
        type: params.type,
        value: params.value,
      });

      return await taxonomyRepository.insert(params.token, {
        tenant_id: params.tenantId,
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
      loggingService.info('TaxonomyService.updateTaxonomy called', {
        id: params.id,
        tenantId: params.tenantId,
      });

      const values: TaxonomiesUpdate = {};
      if (params.value !== undefined) values.value = params.value;
      if (params.sortOrder !== undefined) values.sort_order = params.sortOrder;

      return await taxonomyRepository.update(
        params.token,
        { id: params.id, tenant_id: params.tenantId },
        values,
      );
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
      loggingService.info('TaxonomyService.deleteTaxonomy called', {
        id: params.id,
        tenantId: params.tenantId,
      });

      await taxonomyRepository.remove(params.token, {
        id: params.id,
        tenant_id: params.tenantId,
      });
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
