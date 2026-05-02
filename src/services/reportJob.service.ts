import etlService from '@src/services/etl.service';
import reportJobRepository from '@src/repositories/reportJob.repository';
import salesReportService from '@src/services/salesReport.service';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';
import supabaseService from '@src/services/supabase.service';
import {
  JobNotRetryableError,
  ReportJobNotFoundError,
} from '@src/models/errors/reportJob.errors';
import { NonConsecutiveUploadError } from '@src/models/errors/salesReport.errors';
import {
  ICompleteJobParams,
  ICreateJobParams,
  IReportJob,
} from '@src/types/reportJob.types';
import EnvVars from '@src/utils/env';
import { handleServiceError } from '@src/utils/errorHandlers';
import loggingService from '@src/services/logging.service';

const REPORTS_BUCKET = 'reports-raw';
const SIGNED_URL_TTL_SECONDS = 600; // 10 min — covers ETL pull + processing safety margin
const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

class ReportJobService {
  async createJob(params: ICreateJobParams): Promise<IReportJob> {
    try {
      // 0. Guard: enforce consecutive-month uploads to keep MTD FYC math correct.
      const latest = await salesReportYtdRepository.findLatestUploadedMonth(
        params.tenantId,
        params.reportYear,
      );
      if (latest !== null && params.reportMonth !== latest + 1) {
        const reqMonth = String(params.reportMonth).padStart(2, '0');
        const latestMonth = String(latest).padStart(2, '0');
        throw new NonConsecutiveUploadError(
          `Cannot upload ${params.reportYear}-${reqMonth}. Latest uploaded is ${params.reportYear}-${latestMonth}; next must be ${latest + 1}.`,
        );
      }

      const storagePath = `${params.tenantId}/${params.reportYear}-${String(params.reportMonth).padStart(2, '0')}/${Date.now()}-${params.fileName}`;

      // 1. Upload file to Storage
      const upload = await supabaseService.uploadToStorage(
        REPORTS_BUCKET,
        storagePath,
        params.fileBuffer,
        XLSX_CONTENT_TYPE,
      );
      if (upload.error) {
        throw new Error(`Storage upload failed: ${upload.error.message}`);
      }

      // 2. Insert job row (status defaults to 'pending')
      const job = await reportJobRepository.insertJob({
        tenant_id: params.tenantId,
        uploaded_by: params.uploadedBy,
        storage_path: storagePath,
        file_name: params.fileName,
        report_year: params.reportYear,
        report_month: params.reportMonth,
      });

      // 3. Kick off ETL (fire-and-forget — don't fail the user upload if ETL is unavailable)
      void this.kickoffEtl(job).catch((err) => {
        loggingService.error('ReportJobService.kickoffEtl deferred failure', err, {
          jobId: job.id,
        });
      });

      return job;
    } catch (error) {
      if (error instanceof NonConsecutiveUploadError) throw error;
      return handleServiceError('ReportJobService.createJob', error);
    }
  }

  async completeJob(params: ICompleteJobParams): Promise<void> {
    try {
      const job = await reportJobRepository.findById(params.jobId);
      if (!job) throw new ReportJobNotFoundError(`Job ${params.jobId} not found`);

      if (params.status === 'failed') {
        await reportJobRepository.markFailed(job.id, params.error ?? 'Unknown ETL failure');
        return;
      }

      if (!params.etlResult) {
        throw new Error('etlResult required when status=success');
      }

      // Reuse the existing persistence layer; idempotent on (tenant, user, year, month)
      const result = await salesReportService.uploadReport({
        etlResult: {
          ...(params.etlResult as Record<string, unknown>),
          report_year: job.report_year,
          report_month: job.report_month,
        } as never,
        tenantId: job.tenant_id,
        uploadedBy: job.uploaded_by,
      });

      await reportJobRepository.markCompleted(job.id, result.batchId, result);
    } catch (error) {
      if (error instanceof ReportJobNotFoundError) throw error;
      return handleServiceError('ReportJobService.completeJob', error);
    }
  }

  async retryJob(jobId: string): Promise<void> {
    try {
      const job = await reportJobRepository.findById(jobId);
      if (!job) throw new ReportJobNotFoundError(`Job ${jobId} not found`);
      if (job.status !== 'failed') {
        throw new JobNotRetryableError(
          `Job is in status '${job.status}'; only 'failed' jobs can be retried`,
        );
      }

      await reportJobRepository.markProcessing(jobId, job.attempts + 1);
      await this.kickoffEtl(job);
    } catch (error) {
      if (error instanceof ReportJobNotFoundError) throw error;
      if (error instanceof JobNotRetryableError) throw error;
      return handleServiceError('ReportJobService.retryJob', error);
    }
  }

  async getJob(jobId: string): Promise<IReportJob> {
    try {
      const job = await reportJobRepository.findById(jobId);
      if (!job) throw new ReportJobNotFoundError(`Job ${jobId} not found`);
      return job;
    } catch (error) {
      if (error instanceof ReportJobNotFoundError) throw error;
      return handleServiceError('ReportJobService.getJob', error);
    }
  }

  private async kickoffEtl(job: IReportJob): Promise<void> {
    const fileUrl = await supabaseService.createSignedDownloadUrl(
      REPORTS_BUCKET,
      job.storage_path,
      SIGNED_URL_TTL_SECONDS,
    );
    await etlService.kickoff({
      jobId: job.id,
      fileUrl,
      callbackUrl: `${EnvVars.BackendBaseUrl}/api/reports/jobs/${job.id}/complete`,
    });
  }
}

export const reportJobService = new ReportJobService();
export default reportJobService;
