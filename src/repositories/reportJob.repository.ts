import supabaseService from '@src/services/supabase.service';
import { Database } from '@src/types/database.types';
import {
  IReportJob,
  ReportJobIns,
  ReportJobRow,
} from '@src/types/reportJob.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';
import { generateJobReference } from '@src/utils/generateJobReference';

type Json = Database['public']['Tables']['report_jobs']['Update']['result'];

/**
 * Postgres `unique_violation` SQLSTATE — surfaced by PostgREST on the
 * `error.code` field when an insert hits a UNIQUE constraint (e.g. two
 * uploads in the same millisecond colliding on `report_jobs.reference`).
 */
const UNIQUE_VIOLATION_CODE = '23505';

/**
 * Insert payload accepted by the repository. The reference is generated
 * inside `insertJob` so the caller doesn't have to coordinate retry tokens
 * — see `insertJob` for the collision-retry contract.
 */
type ReportJobInsWithoutReference = Omit<ReportJobIns, 'reference'>;

class ReportJobRepository {
  private mapRow(row: ReportJobRow): IReportJob {
    return {
      id: row.id,
      reference: row.reference,
      tenant_id: row.tenant_id,
      uploaded_by: row.uploaded_by,
      storage_path: row.storage_path,
      file_name: row.file_name,
      report_year: row.report_year,
      report_month: row.report_month,
      status: row.status as IReportJob['status'],
      batch_id: row.batch_id,
      result: row.result,
      error_message: row.error_message,
      attempts: row.attempts,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Inserts a new `report_jobs` row, generating a fresh `reference` per
   * attempt. Two concurrent uploads in the same millisecond can collide on
   * the `reference` UNIQUE constraint (`generateJobReference()` resolves to
   * the millisecond); on a `23505` violation we retry exactly once with a
   * freshly-generated reference. Two retries failing is astronomically
   * unlikely and propagates as a regular repository error.
   *
   * The caller does NOT supply a reference — passing one would defeat the
   * retry. If a `reference` field is present on `data` it is silently
   * stripped.
   */
  async insertJob(data: ReportJobInsWithoutReference): Promise<IReportJob> {
    try {
      const MAX_ATTEMPTS = 2;
      let lastError: { message: string; code?: string } | null = null;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const reference = generateJobReference();
        const response = await supabaseService.adminInsert('report_jobs', {
          ...data,
          reference,
        });

        if (!response.error && response.data?.[0]) {
          return this.mapRow(response.data[0] as ReportJobRow);
        }

        lastError = response.error as { message: string; code?: string } | null;

        // Retry only on unique_violation; any other failure is terminal.
        if (
          attempt < MAX_ATTEMPTS - 1 &&
          lastError?.code === UNIQUE_VIOLATION_CODE
        ) {
          continue;
        }

        break;
      }

      throw new Error(
        lastError?.message ?? 'Reference collision could not be resolved',
      );
    } catch (error) {
      handleRepositoryError('ReportJobRepository.insertJob', error);
    }
  }

  async findByReference(reference: string): Promise<IReportJob | null> {
    try {
      const response = await supabaseService.adminSelect(
        'report_jobs',
        '*',
        { reference },
      );
      if (response.error) throw new Error(response.error.message);
      const row = (response.data ?? [])[0] as unknown as
        | ReportJobRow
        | undefined;
      return row ? this.mapRow(row) : null;
    } catch (error) {
      handleRepositoryError('ReportJobRepository.findByReference', error);
    }
  }

  async markProcessing(id: string, attempts: number): Promise<void> {
    try {
      const response = await supabaseService.adminUpdate(
        'report_jobs',
        { status: 'processing', attempts },
        { id },
      );
      if (response.error) throw new Error(response.error.message);
    } catch (error) {
      handleRepositoryError('ReportJobRepository.markProcessing', error);
    }
  }

  async markCompleted(
    id: string,
    batchId: string,
    result: unknown,
  ): Promise<void> {
    try {
      const response = await supabaseService.adminUpdate(
        'report_jobs',
        {
          status: 'completed',
          batch_id: batchId,
          result: result as Json,
          error_message: null,
        },
        { id },
      );
      if (response.error) throw new Error(response.error.message);
    } catch (error) {
      handleRepositoryError('ReportJobRepository.markCompleted', error);
    }
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    try {
      const response = await supabaseService.adminUpdate(
        'report_jobs',
        { status: 'failed', error_message: errorMessage },
        { id },
      );
      if (response.error) throw new Error(response.error.message);
    } catch (error) {
      handleRepositoryError('ReportJobRepository.markFailed', error);
    }
  }
}

export const reportJobRepository = new ReportJobRepository();
export default reportJobRepository;
