import { randomUUID } from 'crypto';

import { TRANSITIONAL_TENANT_ID } from '@src/constants/tenant';
import userRepository from '@src/repositories/user.repository';
import { DynamoTable } from '@src/services/dynamo.service';
import type {
  IPaginatedUploadAudit,
  IUploadBatch,
  UploadBatchIns,
  UploadStatus,
} from '@src/types/salesReport.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';
import { nowUtc } from '@src/utils/period';

interface IUploadBatchItem {
  id: string;
  uploaded_by?: string;
  year: number;
  month: number;
  file_name: string;
  rows_loaded: number;
  rows_skipped: number;
  status: string;
  created_at: string;
}

interface BatchSummaryUpdate {
  rows_loaded: number;
  rows_skipped: number;
  status: UploadStatus;
}

const uploadBatches = new DynamoTable<IUploadBatchItem>('UploadBatches');

function toBatch(item: IUploadBatchItem): IUploadBatch {
  return {
    id: item.id,
    tenant_id: TRANSITIONAL_TENANT_ID,
    uploaded_by: item.uploaded_by ?? null,
    year: item.year,
    month: item.month,
    file_name: item.file_name,
    rows_loaded: item.rows_loaded,
    rows_skipped: item.rows_skipped,
    status: item.status as UploadStatus,
    created_at: item.created_at,
  };
}

/******************************************************************************
                          UploadBatchRepository
******************************************************************************/

class UploadBatchRepository {
  async findPriorBatchIdsForPeriod(
    _tenantId: string,
    year: number,
    month: number,
    excludeBatchId: string,
  ): Promise<string[]> {
    try {
      const items = await uploadBatches.queryAll({
        index: 'byPeriod',
        keyCondition: 'year = :year AND month = :month',
        values: { ':year': year, ':month': month },
      });
      return items.map((item) => item.id).filter((id) => id !== excludeBatchId);
    } catch (error) {
      return handleRepositoryError(
        'UploadBatchRepository.findPriorBatchIdsForPeriod',
        error,
      );
    }
  }

  async insertBatch(data: UploadBatchIns): Promise<IUploadBatch> {
    try {
      const item: IUploadBatchItem = {
        id: randomUUID(),
        ...(data.uploaded_by && { uploaded_by: data.uploaded_by }),
        year: data.year,
        month: data.month,
        file_name: data.file_name,
        rows_loaded: data.rows_loaded ?? 0,
        rows_skipped: data.rows_skipped ?? 0,
        status: data.status ?? 'success',
        created_at: nowUtc(),
      };
      await uploadBatches.put(item, { condition: 'attribute_not_exists(id)' });
      return toBatch(item);
    } catch (error) {
      return handleRepositoryError('UploadBatchRepository.insertBatch', error);
    }
  }

  async updateBatchSummary(
    batchId: string,
    summary: BatchSummaryUpdate,
  ): Promise<void> {
    try {
      await uploadBatches.update(
        { id: batchId },
        'SET rows_loaded = :loaded, rows_skipped = :skipped, status = :status',
        {
          condition: 'attribute_exists(id)',
          values: {
            ':loaded': summary.rows_loaded,
            ':skipped': summary.rows_skipped,
            ':status': summary.status,
          },
        },
      );
    } catch (error) {
      return handleRepositoryError(
        'UploadBatchRepository.updateBatchSummary',
        error,
      );
    }
  }

  async findPaginatedAuditByTenant(
    _tenantId: string,
    year: number,
    page: number,
    pageSize: number,
  ): Promise<IPaginatedUploadAudit> {
    try {
      const items = await uploadBatches.queryAll({
        index: 'byYear',
        keyCondition: 'year = :year',
        values: { ':year': year },
        descending: true,
      });
      const pageItems = items.slice((page - 1) * pageSize, page * pageSize);
      const uploaders = await userRepository.findByIds(
        pageItems
          .map((item) => item.uploaded_by)
          .filter((id): id is string => !!id),
      );
      const names = new Map(uploaders.map((user) => [user.id, user.name]));

      return {
        data: pageItems.map((item) => ({
          id: item.id,
          year: item.year,
          month: item.month,
          file_name: item.file_name,
          rows_loaded: item.rows_loaded,
          rows_skipped: item.rows_skipped,
          status: item.status as UploadStatus,
          uploader_name: item.uploaded_by
            ? (names.get(item.uploaded_by) ?? null)
            : null,
          imported_at: item.created_at,
        })),
        meta: { page, pageSize, total: items.length },
      };
    } catch (error) {
      return handleRepositoryError(
        'UploadBatchRepository.findPaginatedAuditByTenant',
        error,
      );
    }
  }
}

export const uploadBatchRepository = new UploadBatchRepository();
export default uploadBatchRepository;
