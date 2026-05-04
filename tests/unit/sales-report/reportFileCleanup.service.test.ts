import reportFileCleanupService from '@src/services/reportFileCleanup.service';
import reportJobRepository from '@src/repositories/reportJob.repository';
import supabaseService from '@src/services/supabase.service';

jest.mock('@src/repositories/reportJob.repository', () => ({
  __esModule: true,
  default: {
    findCompletedJobsOlderThan: jest.fn(),
    clearStoragePaths: jest.fn(),
  },
}));

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    removeFromStorage: jest.fn(),
  },
}));

beforeEach(() => jest.resetAllMocks());

describe('ReportFileCleanupService.cleanupOldReportFiles', () => {
  it('returns zeros and does not call removeFromStorage when there are no candidates', async () => {
    (
      reportJobRepository.findCompletedJobsOlderThan as jest.Mock
    ).mockResolvedValue([]);

    const result = await reportFileCleanupService.cleanupOldReportFiles();

    expect(result).toEqual({ deletedCount: 0, failedCount: 0 });
    expect(supabaseService.removeFromStorage).not.toHaveBeenCalled();
    expect(reportJobRepository.clearStoragePaths).not.toHaveBeenCalled();
  });

  it('removes files for each candidate, clears their storage_path, and returns counts', async () => {
    const candidates = [
      { id: 'j1', storage_path: 't1/2026-01.xlsx' },
      { id: 'j2', storage_path: 't1/2026-02.xlsx' },
      { id: 'j3', storage_path: 't2/2026-03.xlsx' },
    ];
    (
      reportJobRepository.findCompletedJobsOlderThan as jest.Mock
    ).mockResolvedValue(candidates);
    (supabaseService.removeFromStorage as jest.Mock).mockResolvedValue({
      data: candidates,
      error: null,
    });
    (reportJobRepository.clearStoragePaths as jest.Mock).mockResolvedValue(
      undefined,
    );

    const result = await reportFileCleanupService.cleanupOldReportFiles();

    expect(supabaseService.removeFromStorage).toHaveBeenCalledTimes(1);
    expect(supabaseService.removeFromStorage).toHaveBeenCalledWith(
      'reports-raw',
      ['t1/2026-01.xlsx', 't1/2026-02.xlsx', 't2/2026-03.xlsx'],
    );
    expect(reportJobRepository.clearStoragePaths).toHaveBeenCalledWith([
      'j1',
      'j2',
      'j3',
    ]);
    expect(result).toEqual({ deletedCount: 3, failedCount: 0 });
  });

  it('uses a 30-day cutoff when querying the repository', async () => {
    (
      reportJobRepository.findCompletedJobsOlderThan as jest.Mock
    ).mockResolvedValue([]);
    const before = Date.now();

    await reportFileCleanupService.cleanupOldReportFiles();

    const after = Date.now();
    const callArg = (
      reportJobRepository.findCompletedJobsOlderThan as jest.Mock
    ).mock.calls[0][0] as string;
    const cutoffMs = new Date(callArg).getTime();
    const expectedMin = before - 30 * 24 * 60 * 60 * 1000 - 100;
    const expectedMax = after - 30 * 24 * 60 * 60 * 1000 + 100;
    expect(cutoffMs).toBeGreaterThanOrEqual(expectedMin);
    expect(cutoffMs).toBeLessThanOrEqual(expectedMax);
  });

  it('logs and counts a chunk as failed when removeFromStorage returns an error, and does not clear paths for that chunk', async () => {
    const candidates = [{ id: 'j1', storage_path: 'x.xlsx' }];
    (
      reportJobRepository.findCompletedJobsOlderThan as jest.Mock
    ).mockResolvedValue(candidates);
    (supabaseService.removeFromStorage as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'storage api outage' },
    });

    const result = await reportFileCleanupService.cleanupOldReportFiles();

    expect(reportJobRepository.clearStoragePaths).not.toHaveBeenCalled();
    expect(result).toEqual({ deletedCount: 0, failedCount: 1 });
  });

  it('counts a chunk as failed when removeFromStorage throws, continues to next chunks', async () => {
    // 250 candidates → 3 chunks of [100, 100, 50]
    const candidates = Array.from({ length: 250 }, (_, i) => ({
      id: `j${i}`,
      storage_path: `p/${i}.xlsx`,
    }));
    (
      reportJobRepository.findCompletedJobsOlderThan as jest.Mock
    ).mockResolvedValue(candidates);
    (supabaseService.removeFromStorage as jest.Mock)
      .mockResolvedValueOnce({ data: [], error: null })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ data: [], error: null });
    (reportJobRepository.clearStoragePaths as jest.Mock).mockResolvedValue(
      undefined,
    );

    const result = await reportFileCleanupService.cleanupOldReportFiles();

    expect(supabaseService.removeFromStorage).toHaveBeenCalledTimes(3);
    expect(reportJobRepository.clearStoragePaths).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ deletedCount: 150, failedCount: 100 });
  });
});
