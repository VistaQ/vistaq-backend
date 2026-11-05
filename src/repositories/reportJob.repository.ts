import { randomUUID } from 'crypto';

import { TRANSITIONAL_TENANT_ID } from '@src/constants/tenant';
import { DynamoConditionFailedError } from '@src/models/errors/dynamo.error';
import { DynamoTable } from '@src/services/dynamo.service';
import type { IReportJob, ReportJobIns } from '@src/types/reportJob.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';
import { generateJobReference } from '@src/utils/generateJobReference';
import { nowUtc } from '@src/utils/period';

type IReportJobItem = Omit<
  IReportJob,
  'tenant_id' | 'batch_id' | 'result' | 'error_message'
> & {
  batch_id?: string;
  result?: unknown;
  error_message?: string;
};

const reportJobs = new DynamoTable<IReportJobItem>('ReportJobs');

const MAX_REFERENCE_ATTEMPTS = 2;

function toJob(item: IReportJobItem): IReportJob {
  return {
    ...item,
    tenant_id: TRANSITIONAL_TENANT_ID,
    batch_id: item.batch_id ?? null,
    result: item.result ?? null,
    error_message: item.error_message ?? null,
  };
}

/******************************************************************************
                            ReportJobRepository
******************************************************************************/

class ReportJobRepository {
  async insertJob(data: ReportJobIns): Promise<IReportJob> {
    try {
      const now = nowUtc();
      for (let attempt = 1; ; attempt++) {
        const item: IReportJobItem = {
          id: randomUUID(),
          reference: generateJobReference(),
          uploaded_by: data.uploaded_by,
          storage_path: data.storage_path,
          file_name: data.file_name,
          report_year: data.report_year,
          report_month: data.report_month,
          status: 'pending',
          attempts: 0,
          created_at: now,
          updated_at: now,
        };
        try {
          await reportJobs.put(item, {
            condition: 'attribute_not_exists(reference)',
          });
          return toJob(item);
        } catch (error) {
          if (
            !(error instanceof DynamoConditionFailedError) ||
            attempt >= MAX_REFERENCE_ATTEMPTS
          ) {
            throw error;
          }
        }
      }
    } catch (error) {
      return handleRepositoryError('ReportJobRepository.insertJob', error);
    }
  }

  async findByReference(reference: string): Promise<IReportJob | null> {
    try {
      const item = await reportJobs.get({ reference }, { consistent: true });
      return item ? toJob(item) : null;
    } catch (error) {
      return handleRepositoryError(
        'ReportJobRepository.findByReference',
        error,
      );
    }
  }

  async markProcessing(reference: string, attempts: number): Promise<void> {
    try {
      await reportJobs.updateFields(
        { reference },
        { status: 'processing', attempts },
        { condition: 'attribute_exists(reference)' },
      );
    } catch (error) {
      return handleRepositoryError('ReportJobRepository.markProcessing', error);
    }
  }

  async markCompleted(
    reference: string,
    batchId: string,
    result: unknown,
  ): Promise<void> {
    try {
      await reportJobs.updateFields(
        { reference },
        {
          status: 'completed',
          batch_id: batchId,
          result,
          error_message: null,
        },
        { condition: 'attribute_exists(reference)' },
      );
    } catch (error) {
      return handleRepositoryError('ReportJobRepository.markCompleted', error);
    }
  }

  async markFailed(reference: string, errorMessage: string): Promise<void> {
    try {
      await reportJobs.updateFields(
        { reference },
        { status: 'failed', error_message: errorMessage },
        { condition: 'attribute_exists(reference)' },
      );
    } catch (error) {
      return handleRepositoryError('ReportJobRepository.markFailed', error);
    }
  }

  async findCompletedJobsOlderThan(
    cutoff: string,
  ): Promise<{ reference: string; storage_path: string }[]> {
    try {
      const items = await reportJobs.queryAll({
        index: 'byStatus',
        keyCondition: 'status = :status AND created_at < :cutoff',
        values: { ':status': 'completed', ':cutoff': cutoff },
      });
      return items
        .filter((item) => item.storage_path !== '')
        .map((item) => ({
          reference: item.reference,
          storage_path: item.storage_path,
        }));
    } catch (error) {
      return handleRepositoryError(
        'ReportJobRepository.findCompletedJobsOlderThan',
        error,
      );
    }
  }

  async clearStoragePaths(references: string[]): Promise<void> {
    try {
      await Promise.all(
        references.map((reference) =>
          reportJobs.updateFields({ reference }, { storage_path: '' }),
        ),
      );
    } catch (error) {
      return handleRepositoryError(
        'ReportJobRepository.clearStoragePaths',
        error,
      );
    }
  }
}

export const reportJobRepository = new ReportJobRepository();
export default reportJobRepository;
