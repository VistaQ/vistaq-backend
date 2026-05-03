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
import { IEtlResult } from '@src/types/salesReport.types';
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
      // 0. Guard: block skip-ahead uploads only. Re-uploads of the latest month
      //    (data corrections) and earlier months (historical corrections) are
      //    allowed — the upsert on (tenant, user, year, month) replaces cleanly
      //    and the LAG-derived MTD FYC view recomputes automatically.
      const latest = await salesReportYtdRepository.findLatestUploadedMonth(
        params.tenantId,
        params.reportYear,
      );
      if (latest !== null && params.reportMonth > latest + 1) {
        const reqMonth = String(params.reportMonth).padStart(2, '0');
        const latestMonth = String(latest).padStart(2, '0');
        const nextAllowed = String(latest + 1).padStart(2, '0');
        throw new NonConsecutiveUploadError(
          `Cannot upload ${params.reportYear}-${reqMonth}. Latest uploaded is ${params.reportYear}-${latestMonth}; cannot skip ahead — next allowed is ${params.reportYear}-${nextAllowed} or any earlier month.`,
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

      // 2. Insert job row (status defaults to 'pending'). The repository
      // generates the public-facing `reference` and retries once on a
      // millisecond-level UNIQUE collision (two uploads in the same
      // millisecond from different requests).
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
          reference: job.reference,
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
      const job = await reportJobRepository.findByReference(params.reference);
      if (!job) throw new ReportJobNotFoundError(`Job ${params.reference} not found`);

      if (params.status === 'failed') {
        await reportJobRepository.markFailed(job.id, params.error ?? 'Unknown ETL failure');
        return;
      }

      if (!params.etlResult) {
        throw new Error('etlResult required when status=success');
      }

      // Reuse the existing persistence layer; idempotent on (tenant, user, year, month).
      // Year/month live on the report_jobs row (captured at upload time) and are
      // passed as siblings of etlResult — the ETL itself is unaware of them.
      const result = await salesReportService.uploadReport({
        etlResult: params.etlResult as IEtlResult,
        tenantId: job.tenant_id,
        uploadedBy: job.uploaded_by,
        reportYear: job.report_year,
        reportMonth: job.report_month,
      });

      await reportJobRepository.markCompleted(job.id, result.batchId, result);
    } catch (error) {
      if (error instanceof ReportJobNotFoundError) throw error;
      return handleServiceError('ReportJobService.completeJob', error);
    }
  }

  async retryJob(reference: string): Promise<void> {
    try {
      const job = await reportJobRepository.findByReference(reference);
      if (!job) throw new ReportJobNotFoundError(`Job ${reference} not found`);
      if (job.status !== 'failed') {
        throw new JobNotRetryableError(
          `Job is in status '${job.status}'; only 'failed' jobs can be retried`,
        );
      }

      await reportJobRepository.markProcessing(job.id, job.attempts + 1);
      await this.kickoffEtl(job);
    } catch (error) {
      if (error instanceof ReportJobNotFoundError) throw error;
      if (error instanceof JobNotRetryableError) throw error;
      return handleServiceError('ReportJobService.retryJob', error);
    }
  }

  async getJob(reference: string): Promise<IReportJob> {
    try {
      const job = await reportJobRepository.findByReference(reference);
      if (!job) throw new ReportJobNotFoundError(`Job ${reference} not found`);
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
      reference: job.reference,
      fileUrl,
      callbackUrl: `${EnvVars.BackendBaseUrl}/api/reports/jobs/${job.reference}/complete`,
    });
  }
}

export const reportJobService = new ReportJobService();
export default reportJobService;
