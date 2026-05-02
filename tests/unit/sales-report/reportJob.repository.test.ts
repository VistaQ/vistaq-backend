import supabaseService from '@src/services/supabase.service';
import reportJobRepository from '@src/repositories/reportJob.repository';

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    adminInsert: jest.fn(),
    adminUpdate: jest.fn(),
    adminSelect: jest.fn(),
  },
}));

beforeEach(() => jest.resetAllMocks());

const mockJobRow = {
  id: 'j1', tenant_id: 't1', uploaded_by: 'u1',
  storage_path: 'reports-raw/j1.xlsx', file_name: 'May.xlsx',
  report_year: 2026, report_month: 5,
  status: 'pending', batch_id: null, result: null, error_message: null,
  attempts: 0, created_at: 'now', updated_at: 'now',
};

describe('ReportJobRepository.insertJob', () => {
  it('returns the inserted job row mapped to IReportJob', async () => {
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
      expect.objectContaining({ tenant_id: 't1', file_name: 'May.xlsx' }),
    );
    expect(job.id).toBe('j1');
    expect(job.status).toBe('pending');
  });

  it('throws RepositoryError on error response', async () => {
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

describe('ReportJobRepository.findById', () => {
  it('returns the job when found', async () => {
    (supabaseService.adminSelect as jest.Mock).mockResolvedValue({
      data: [mockJobRow],
      error: null,
    });

    const job = await reportJobRepository.findById('j1');

    expect(supabaseService.adminSelect).toHaveBeenCalledWith(
      'report_jobs',
      '*',
      { id: 'j1' },
    );
    expect(job?.id).toBe('j1');
  });

  it('returns null when not found', async () => {
    (supabaseService.adminSelect as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });

    const job = await reportJobRepository.findById('missing');
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
