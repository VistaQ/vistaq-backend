import supabaseService from '@src/services/supabase.service';
import { IReportJob, ReportJobIns, ReportJobRow } from '@src/types/reportJob.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

class ReportJobRepository {
  private mapRow(row: ReportJobRow): IReportJob {
    return {
      id: row.id,
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

  async insertJob(data: ReportJobIns): Promise<IReportJob> {
    try {
      const response = await supabaseService.adminInsert('report_jobs', data);
      if (response.error || !response.data?.[0]) {
        throw new Error(response.error?.message ?? 'No row returned');
      }
      return this.mapRow(response.data[0] as ReportJobRow);
    } catch (error) {
      handleRepositoryError('ReportJobRepository.insertJob', error);
    }
  }

  async findById(id: string): Promise<IReportJob | null> {
    try {
      const response = await supabaseService.adminSelect('report_jobs', '*', { id });
      if (response.error) throw new Error(response.error.message);
      const row = (response.data ?? [])[0] as ReportJobRow | undefined;
      return row ? this.mapRow(row) : null;
    } catch (error) {
      handleRepositoryError('ReportJobRepository.findById', error);
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

  async markCompleted(id: string, batchId: string, result: unknown): Promise<void> {
    try {
      const response = await supabaseService.adminUpdate(
        'report_jobs',
        { status: 'completed', batch_id: batchId, result, error_message: null },
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
