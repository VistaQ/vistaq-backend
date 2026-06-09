import supabaseService from '@src/services/supabase.service';
import reportJobRepository from '@src/repositories/reportJob.repository';
import { generateJobReference } from '@src/utils/generateJobReference';

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    adminInsert: jest.fn(),
    adminUpdate: jest.fn(),
    adminSelect: jest.fn(),
    adminSelectLessThan: jest.fn(),
  },
}));

jest.mock('@src/utils/generateJobReference', () => ({
  __esModule: true,
  generateJobReference: jest.fn(),
  default: jest.fn(),
}));

beforeEach(() => jest.resetAllMocks());

const mockJobRow = {
  id: 'j1', tenant_id: 't1', uploaded_by: 'u1',
  storage_path: 'reports-raw/j1.xlsx', file_name: 'May.xlsx',
  reference: 'SALES-REPORT-20260502143022873',
  report_year: 2026, report_month: 5,
  status: 'pending', batch_id: null, result: null, error_message: null,
  attempts: 0, created_at: 'now', updated_at: 'now',
};

describe('ReportJobRepository.insertJob', () => {
  it('generates a reference and returns the inserted job row mapped to IReportJob', async () => {
    (generateJobReference as jest.Mock).mockReturnValue(
      'SALES-REPORT-20260502143022873',
    );
    (supabaseService.adminInsert as jest.Mock).mockResolvedValue({
      data: [mockJobRow],
      error: null,
    });

    const job = await reportJobRepository.insertJob({
      tenant_id: 't1',
      uploaded_by: 'u1',
      storage_path: 'reports-raw/j1.xlsx',
      file_name: 'May.xlsx',
      report_year: 2026,
      report_month: 5,
    });

    expect(supabaseService.adminInsert).toHaveBeenCalledWith(
      'report_jobs',
      expect.objectContaining({
        tenant_id: 't1',
        file_name: 'May.xlsx',
        reference: 'SALES-REPORT-20260502143022873',
      }),
    );
    expect(job.id).toBe('j1');
    expect(job.reference).toBe('SALES-REPORT-20260502143022873');
    expect(job.status).toBe('pending');
  });

  it('retries once with a fresh reference on a unique_violation (23505)', async () => {
    (generateJobReference as jest.Mock)
      .mockReturnValueOnce('SALES-REPORT-COLLIDE')
      .mockReturnValueOnce('SALES-REPORT-FRESH');
    (supabaseService.adminInsert as jest.Mock)
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'duplicate key', code: '23505' },
      })
      .mockResolvedValueOnce({
        data: [{ ...mockJobRow, reference: 'SALES-REPORT-FRESH' }],
        error: null,
      });

    const job = await reportJobRepository.insertJob({
      tenant_id: 't1',
      uploaded_by: 'u1',
      storage_path: 'p',
      file_name: 'f',
      report_year: 2026,
      report_month: 5,
    });

    expect(supabaseService.adminInsert).toHaveBeenCalledTimes(2);
    // Second call uses the fresh reference, NOT the colliding one.
    expect(
      (supabaseService.adminInsert as jest.Mock).mock.calls[1][1].reference,
    ).toBe('SALES-REPORT-FRESH');
    expect(job.reference).toBe('SALES-REPORT-FRESH');
  });

  it('does not retry on non-collision errors (any other error code)', async () => {
    (generateJobReference as jest.Mock).mockReturnValue('SALES-REPORT-X');
    (supabaseService.adminInsert as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'fk fail', code: '23503' },
    });

    await expect(
      reportJobRepository.insertJob({
        tenant_id: 't1', uploaded_by: 'u1',
        storage_path: 'p', file_name: 'f',
        report_year: 2026, report_month: 5,
      }),
    ).rejects.toThrow('ReportJobRepository.insertJob failed');
    expect(supabaseService.adminInsert).toHaveBeenCalledTimes(1);
  });

  it('surfaces the original error after exhausting retries on repeated collisions', async () => {
    (generateJobReference as jest.Mock).mockReturnValue('SALES-REPORT-X');
    (supabaseService.adminInsert as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'duplicate key', code: '23505' },
    });

    await expect(
      reportJobRepository.insertJob({
        tenant_id: 't1', uploaded_by: 'u1',
        storage_path: 'p', file_name: 'f',
        report_year: 2026, report_month: 5,
      }),
    ).rejects.toThrow('ReportJobRepository.insertJob failed');
    expect(supabaseService.adminInsert).toHaveBeenCalledTimes(2);
  });

  it('throws RepositoryError on error response', async () => {
    (generateJobReference as jest.Mock).mockReturnValue('SALES-REPORT-X');
    (supabaseService.adminInsert as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'fk fail' },
    });
    await expect(
      reportJobRepository.insertJob({
        tenant_id: 't1', uploaded_by: 'u1',
        storage_path: 'p', file_name: 'f',
        report_year: 2026, report_month: 5,
      }),
    ).rejects.toThrow('ReportJobRepository.insertJob failed');
  });
});

describe('ReportJobRepository.findByReference', () => {
  it('returns the job when found', async () => {
    (supabaseService.adminSelect as jest.Mock).mockResolvedValue({
      data: [mockJobRow],
      error: null,
    });

    const job = await reportJobRepository.findByReference('SALES-REPORT-20260502143022873');

    expect(supabaseService.adminSelect).toHaveBeenCalledWith(
      'report_jobs',
      '*',
      { reference: 'SALES-REPORT-20260502143022873' },
    );
    expect(job?.reference).toBe('SALES-REPORT-20260502143022873');
  });

  it('returns null when not found', async () => {
    (supabaseService.adminSelect as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });

    const job = await reportJobRepository.findByReference('SALES-REPORT-99999999999999999');
    expect(job).toBeNull();
  });
});

describe('ReportJobRepository.markProcessing', () => {
  it('updates status and increments attempts', async () => {
    (supabaseService.adminUpdate as jest.Mock).mockResolvedValue({
      data: [{ ...mockJobRow, status: 'processing', attempts: 1 }],
      error: null,
    });

    await reportJobRepository.markProcessing('j1', 1);

    expect(supabaseService.adminUpdate).toHaveBeenCalledWith(
      'report_jobs',
      { status: 'processing', attempts: 1 },
      { id: 'j1' },
    );
  });
});

describe('ReportJobRepository.markCompleted', () => {
  it('updates status, batch_id, result', async () => {
    (supabaseService.adminUpdate as jest.Mock).mockResolvedValue({
      data: [{ ...mockJobRow, status: 'completed' }],
      error: null,
    });

    await reportJobRepository.markCompleted('j1', 'batch-1', { processed: 5 });

    expect(supabaseService.adminUpdate).toHaveBeenCalledWith(
      'report_jobs',
      { status: 'completed', batch_id: 'batch-1', result: { processed: 5 }, error_message: null },
      { id: 'j1' },
    );
  });
});

describe('ReportJobRepository.markFailed', () => {
  it('updates status and error_message', async () => {
    (supabaseService.adminUpdate as jest.Mock).mockResolvedValue({
      data: [{ ...mockJobRow, status: 'failed' }],
      error: null,
    });

    await reportJobRepository.markFailed('j1', 'ETL crashed');

    expect(supabaseService.adminUpdate).toHaveBeenCalledWith(
      'report_jobs',
      { status: 'failed', error_message: 'ETL crashed' },
      { id: 'j1' },
    );
  });
});

describe('ReportJobRepository.findCompletedJobsOlderThan', () => {
  it('queries report_jobs with status=completed and created_at < cutoff and returns rows with non-empty paths', async () => {
    (supabaseService.adminSelectLessThan as jest.Mock).mockResolvedValue({
      data: [
        { id: 'j1', storage_path: 'p1.xlsx' },
        { id: 'j2', storage_path: '' }, // should be filtered out
        { id: 'j3', storage_path: 'p3.xlsx' },
      ],
      error: null,
    });

    const rows = await reportJobRepository.findCompletedJobsOlderThan(
      '2026-04-01T00:00:00Z',
    );

    expect(supabaseService.adminSelectLessThan).toHaveBeenCalledWith(
      'report_jobs',
      'id, storage_path',
      'created_at',
      '2026-04-01T00:00:00Z',
      { status: 'completed' },
    );
    expect(rows).toEqual([
      { id: 'j1', storage_path: 'p1.xlsx' },
      { id: 'j3', storage_path: 'p3.xlsx' },
    ]);
  });

  it('returns an empty array when the query returns no rows', async () => {
    (supabaseService.adminSelectLessThan as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });

    const rows = await reportJobRepository.findCompletedJobsOlderThan(
      '2026-04-01T00:00:00Z',
    );

    expect(rows).toEqual([]);
  });

  it('throws (wrapped) when the query errors', async () => {
    (supabaseService.adminSelectLessThan as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'db down' },
    });

    await expect(
      reportJobRepository.findCompletedJobsOlderThan('2026-04-01T00:00:00Z'),
    ).rejects.toThrow();
  });
});

describe('ReportJobRepository.clearStoragePaths', () => {
  it('updates each id with storage_path = ""', async () => {
    (supabaseService.adminUpdate as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });

    await reportJobRepository.clearStoragePaths(['j1', 'j2']);

    expect(supabaseService.adminUpdate).toHaveBeenCalledTimes(2);
    expect(supabaseService.adminUpdate).toHaveBeenNthCalledWith(
      1,
      'report_jobs',
      { storage_path: '' },
      { id: 'j1' },
    );
    expect(supabaseService.adminUpdate).toHaveBeenNthCalledWith(
      2,
      'report_jobs',
      { storage_path: '' },
      { id: 'j2' },
    );
  });

  it('is a no-op when given an empty list', async () => {
    await reportJobRepository.clearStoragePaths([]);
    expect(supabaseService.adminUpdate).not.toHaveBeenCalled();
  });
});
