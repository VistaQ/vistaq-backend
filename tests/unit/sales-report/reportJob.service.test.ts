// Set env vars BEFORE importing — EnvVars captures them at module load time
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-srk';
process.env.FRONTEND_RESET_PASSWORD_URL = process.env.FRONTEND_RESET_PASSWORD_URL || 'http://test/reset';
process.env.ETL_SERVICE_URL = process.env.ETL_SERVICE_URL || 'http://etl';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'test-key';
process.env.BACKEND_BASE_URL = 'http://api';

import reportJobService from '@src/services/reportJob.service';
import reportJobRepository from '@src/repositories/reportJob.repository';
import salesReportService from '@src/services/salesReport.service';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';
import etlService from '@src/services/etl.service';
import supabaseService from '@src/services/supabase.service';
import {
  ReportJobNotFoundError,
  JobNotRetryableError,
} from '@src/models/errors/reportJob.errors';
import { NonConsecutiveUploadError } from '@src/models/errors/salesReport.errors';

jest.mock('@src/repositories/reportJob.repository', () => ({
  __esModule: true,
  default: {
    insertJob: jest.fn(), findByReference: jest.fn(),
    markProcessing: jest.fn(), markCompleted: jest.fn(), markFailed: jest.fn(),
  },
}));
jest.mock('@src/services/salesReport.service', () => ({
  __esModule: true,
  default: { uploadReport: jest.fn() },
}));
jest.mock('@src/repositories/salesReportYtd.repository', () => ({
  __esModule: true,
  default: { findLatestUploadedMonth: jest.fn() },
}));
jest.mock('@src/services/etl.service', () => ({
  __esModule: true,
  default: { kickoff: jest.fn() },
}));
jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    uploadToStorage: jest.fn(),
    createSignedDownloadUrl: jest.fn(),
  },
}));

beforeEach(() => jest.resetAllMocks());

const fakeJob = {
  id: 'j1', reference: 'SALES-REPORT-20260502143022873',
  tenant_id: 't1', uploaded_by: 'u1',
  storage_path: 'reports-raw/j1.xlsx', file_name: 'May.xlsx',
  report_year: 2026, report_month: 5,
  status: 'pending' as const, batch_id: null, result: null, error_message: null,
  attempts: 0, created_at: 'now', updated_at: 'now',
};

describe('ReportJobService.createJob', () => {
  it('uploads file, generates a reference, inserts job, kicks off ETL with reference, returns the job', async () => {
    (salesReportYtdRepository.findLatestUploadedMonth as jest.Mock).mockResolvedValue(null);
    (supabaseService.uploadToStorage as jest.Mock).mockResolvedValue({ data: { path: 'p' }, error: null });
    (reportJobRepository.insertJob as jest.Mock).mockResolvedValue(fakeJob);
    (supabaseService.createSignedDownloadUrl as jest.Mock).mockResolvedValue('https://signed/');
    (etlService.kickoff as jest.Mock).mockResolvedValue(undefined);

    const job = await reportJobService.createJob({
      tenantId: 't1', uploadedBy: 'u1',
      fileBuffer: Buffer.from('x'), fileName: 'May.xlsx',
      reportYear: 2026, reportMonth: 5,
    });

    expect(supabaseService.uploadToStorage).toHaveBeenCalled();
    expect(reportJobRepository.insertJob).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: 't1', uploaded_by: 'u1', file_name: 'May.xlsx',
      report_year: 2026, report_month: 5,
      reference: expect.stringMatching(/^SALES-REPORT-\d{17}$/),
    }));

    // ETL kickoff is fire-and-forget; allow microtasks to flush
    await new Promise((resolve) => setImmediate(resolve));

    expect(etlService.kickoff).toHaveBeenCalledWith(expect.objectContaining({
      reference: 'SALES-REPORT-20260502143022873',
      fileUrl: 'https://signed/',
      callbackUrl: expect.stringContaining('/api/reports/jobs/SALES-REPORT-20260502143022873/complete'),
    }));
    expect(job.reference).toBe('SALES-REPORT-20260502143022873');
  });

  it('still returns job even when ETL kickoff fails (reconciler will catch it)', async () => {
    (salesReportYtdRepository.findLatestUploadedMonth as jest.Mock).mockResolvedValue(null);
    (supabaseService.uploadToStorage as jest.Mock).mockResolvedValue({ data: { path: 'p' }, error: null });
    (reportJobRepository.insertJob as jest.Mock).mockResolvedValue(fakeJob);
    (supabaseService.createSignedDownloadUrl as jest.Mock).mockResolvedValue('https://signed/');
    (etlService.kickoff as jest.Mock).mockRejectedValue(new Error('ETL down'));

    const job = await reportJobService.createJob({
      tenantId: 't1', uploadedBy: 'u1',
      fileBuffer: Buffer.from('x'), fileName: 'May.xlsx',
      reportYear: 2026, reportMonth: 5,
    });

    expect(job.id).toBe('j1');
  });

  it('rejects non-consecutive month with NonConsecutiveUploadError', async () => {
    (salesReportYtdRepository.findLatestUploadedMonth as jest.Mock).mockResolvedValue(2);

    await expect(
      reportJobService.createJob({
        tenantId: 't1', uploadedBy: 'u1',
        fileBuffer: Buffer.from('x'), fileName: 'Apr.xlsx',
        reportYear: 2026, reportMonth: 4,
      }),
    ).rejects.toBeInstanceOf(NonConsecutiveUploadError);

    expect(supabaseService.uploadToStorage).not.toHaveBeenCalled();
    expect(reportJobRepository.insertJob).not.toHaveBeenCalled();
  });

  it('accepts the next consecutive month', async () => {
    (salesReportYtdRepository.findLatestUploadedMonth as jest.Mock).mockResolvedValue(2);
    (supabaseService.uploadToStorage as jest.Mock).mockResolvedValue({ data: { path: 'p' }, error: null });
    (reportJobRepository.insertJob as jest.Mock).mockResolvedValue({ ...fakeJob, report_month: 3 });
    (supabaseService.createSignedDownloadUrl as jest.Mock).mockResolvedValue('https://signed/');
    (etlService.kickoff as jest.Mock).mockResolvedValue(undefined);

    const job = await reportJobService.createJob({
      tenantId: 't1', uploadedBy: 'u1',
      fileBuffer: Buffer.from('x'), fileName: 'Mar.xlsx',
      reportYear: 2026, reportMonth: 3,
    });

    expect(job.id).toBe('j1');
    expect(reportJobRepository.insertJob).toHaveBeenCalled();
  });

  it('accepts any month when no prior YTD row exists', async () => {
    (salesReportYtdRepository.findLatestUploadedMonth as jest.Mock).mockResolvedValue(null);
    (supabaseService.uploadToStorage as jest.Mock).mockResolvedValue({ data: { path: 'p' }, error: null });
    (reportJobRepository.insertJob as jest.Mock).mockResolvedValue(fakeJob);
    (supabaseService.createSignedDownloadUrl as jest.Mock).mockResolvedValue('https://signed/');
    (etlService.kickoff as jest.Mock).mockResolvedValue(undefined);

    const job = await reportJobService.createJob({
      tenantId: 't1', uploadedBy: 'u1',
      fileBuffer: Buffer.from('x'), fileName: 'Aug.xlsx',
      reportYear: 2026, reportMonth: 8,
    });

    expect(job.id).toBe('j1');
    expect(reportJobRepository.insertJob).toHaveBeenCalled();
  });
});

describe('ReportJobService.completeJob — success path', () => {
  it('looks up the job by reference, calls uploadReport with the job context, and marks completed', async () => {
    (reportJobRepository.findByReference as jest.Mock).mockResolvedValue(fakeJob);
    (salesReportService.uploadReport as jest.Mock).mockResolvedValue({
      batchId: 'b1', processed: 5, skipped: 0, errors: [],
    });

    await reportJobService.completeJob({
      reference: 'SALES-REPORT-20260502143022873', status: 'success',
      etlResult: { source: 's', records: [] },
    });

    expect(reportJobRepository.findByReference).toHaveBeenCalledWith(
      'SALES-REPORT-20260502143022873',
    );
    expect(salesReportService.uploadReport).toHaveBeenCalledWith({
      etlResult: expect.objectContaining({
        source: 's', records: [], report_year: 2026, report_month: 5,
      }),
      tenantId: 't1', uploadedBy: 'u1',
    });
    expect(reportJobRepository.markCompleted).toHaveBeenCalledWith(
      'j1', 'b1',
      expect.objectContaining({ batchId: 'b1', processed: 5 }),
    );
  });

  it('throws ReportJobNotFoundError when the job does not exist', async () => {
    (reportJobRepository.findByReference as jest.Mock).mockResolvedValue(null);

    await expect(
      reportJobService.completeJob({
        reference: 'SALES-REPORT-99999999999999999', status: 'success', etlResult: {},
      }),
    ).rejects.toBeInstanceOf(ReportJobNotFoundError);
  });
});

describe('ReportJobService.completeJob — failed path', () => {
  it('marks the job failed with the supplied error', async () => {
    (reportJobRepository.findByReference as jest.Mock).mockResolvedValue(fakeJob);

    await reportJobService.completeJob({
      reference: 'SALES-REPORT-20260502143022873', status: 'failed', error: 'ColumnNotFoundError',
    });

    expect(reportJobRepository.markFailed).toHaveBeenCalledWith('j1', 'ColumnNotFoundError');
    expect(salesReportService.uploadReport).not.toHaveBeenCalled();
  });
});

describe('ReportJobService.retryJob', () => {
  it('throws JobNotRetryableError when status is not failed', async () => {
    (reportJobRepository.findByReference as jest.Mock).mockResolvedValue({ ...fakeJob, status: 'completed' });
    await expect(
      reportJobService.retryJob('SALES-REPORT-20260502143022873'),
    ).rejects.toBeInstanceOf(JobNotRetryableError);
  });

  it('marks processing, regenerates signed URL, kicks off ETL', async () => {
    (reportJobRepository.findByReference as jest.Mock).mockResolvedValue({ ...fakeJob, status: 'failed', attempts: 1 });
    (supabaseService.createSignedDownloadUrl as jest.Mock).mockResolvedValue('https://signed/');

    await reportJobService.retryJob('SALES-REPORT-20260502143022873');

    expect(reportJobRepository.markProcessing).toHaveBeenCalledWith('j1', 2);
    expect(etlService.kickoff).toHaveBeenCalledWith(expect.objectContaining({
      reference: 'SALES-REPORT-20260502143022873',
    }));
  });
});

describe('ReportJobService.getJob', () => {
  it('returns the job by reference', async () => {
    (reportJobRepository.findByReference as jest.Mock).mockResolvedValue(fakeJob);
    const job = await reportJobService.getJob('SALES-REPORT-20260502143022873');
    expect(reportJobRepository.findByReference).toHaveBeenCalledWith(
      'SALES-REPORT-20260502143022873',
    );
    expect(job).toEqual(fakeJob);
  });

  it('throws ReportJobNotFoundError when missing', async () => {
    (reportJobRepository.findByReference as jest.Mock).mockResolvedValue(null);
    await expect(
      reportJobService.getJob('SALES-REPORT-99999999999999999'),
    ).rejects.toBeInstanceOf(ReportJobNotFoundError);
  });
});
