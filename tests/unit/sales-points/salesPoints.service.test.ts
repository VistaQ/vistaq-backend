import salesPointsService from '@src/services/salesPoints.service';
import pointConfigRepository from '@src/repositories/pointConfig.repository';
import pointTransactionRepository from '@src/repositories/pointTransaction.repository';
import salesReportMtdRepository from '@src/repositories/salesReportMtd.repository';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';
import { IUploadBatch } from '@src/types/salesReport.types';

jest.mock('@src/repositories/pointConfig.repository', () => ({
  __esModule: true,
  default: { findByTenantAndCategoryAdmin: jest.fn() },
}));
jest.mock('@src/repositories/pointTransaction.repository', () => ({
  __esModule: true,
  default: { awardWithReversal: jest.fn() },
}));
jest.mock('@src/repositories/salesReportMtd.repository', () => ({
  __esModule: true,
  default: { findAceNocByTenantYearMonth: jest.fn() },
}));
jest.mock('@src/repositories/salesReportYtd.repository', () => ({
  __esModule: true,
  default: { findFyctByTenantYearMonths: jest.fn() },
}));
jest.mock('@sentry/node', () => ({
  __esModule: true,
  captureException: jest.fn(),
}));

beforeEach(() => jest.resetAllMocks());

function makeBatch(overrides: Partial<IUploadBatch> = {}): IUploadBatch {
  return {
    id: 'batch-new',
    tenant_id: 't1',
    uploaded_by: 'u-mgr',
    year: 2026,
    month: 5,
    file_name: 'May2026.xlsx',
    rows_loaded: 2,
    rows_skipped: 0,
    status: 'success',
    created_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

const RATES_30 = [
  { activity: 'sales_noc', points: 30, category: 'sales' },
  { activity: 'sales_fyct', points: 30, category: 'sales' },
  { activity: 'sales_ace', points: 30, category: 'sales' },
];

describe('SalesPointsService.awardForBatch — happy path (first upload of month)', () => {
  it('computes and forwards awards based on MTD ACE/NOC and YTD-derived MTD FYCT', async () => {
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue(
      RATES_30,
    );
    (salesReportMtdRepository.findAceNocByTenantYearMonth as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 5, ace: 13000, noc: 4 },
    ]);
    (salesReportYtdRepository.findFyctByTenantYearMonths as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 5, fyct: 14500 },
      { user_id: 'u1', month: 4, fyct: 12000 },
    ]);

    await salesPointsService.awardForBatch(makeBatch(), [
      { user_id: 'u1', agent_code: 'AG006' },
    ]);

    expect(pointTransactionRepository.awardWithReversal).toHaveBeenCalledTimes(1);
    const call = (pointTransactionRepository.awardWithReversal as jest.Mock).mock.calls[0][0];

    expect(call.tenantId).toBe('t1');
    expect(call.year).toBe(2026);
    expect(call.month).toBe(5);
    expect(call.batchId).toBe('batch-new');
    expect(call.activities).toEqual(['sales_noc', 'sales_fyct', 'sales_ace']);

    // sales_noc: 4 × 30 = 120
    // sales_fyct: floor((14500 - 12000) / 1000) = floor(2.5) = 2 → 2 × 30 = 60
    // sales_ace: floor(13000/1000) = 13 → 13 × 30 = 390
    expect(call.awards).toEqual([
      { user_id: 'u1', activity: 'sales_noc', points: 120, subject_id: 'batch-new' },
      { user_id: 'u1', activity: 'sales_fyct', points: 60, subject_id: 'batch-new' },
      { user_id: 'u1', activity: 'sales_ace', points: 390, subject_id: 'batch-new' },
    ]);
  });

  it('treats first month of year (no previous YTD) as MTD FYCT = current YTD', async () => {
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue(RATES_30);
    (salesReportMtdRepository.findAceNocByTenantYearMonth as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 1, ace: 0, noc: 0 },
    ]);
    (salesReportYtdRepository.findFyctByTenantYearMonths as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 1, fyct: 4000 },
    ]);

    await salesPointsService.awardForBatch(makeBatch({ month: 1 }), [
      { user_id: 'u1', agent_code: 'AG006' },
    ]);

    const call = (pointTransactionRepository.awardWithReversal as jest.Mock).mock.calls[0][0];
    // sales_fyct: floor(4000 / 1000) = 4 → 4 × 30 = 120
    expect(call.awards).toEqual([
      expect.objectContaining({ activity: 'sales_fyct', points: 120 }),
    ]);
  });
});

describe('SalesPointsService.awardForBatch — concurrency (advisory lock)', () => {
  it('serializes concurrent re-uploads of the same period via the awarding RPC', async () => {
    // The advisory lock lives inside award_sales_points_for_batch (Postgres
    // function). At the service level we assert that two concurrent calls
    // both reach the RPC layer without dropping awards or recomputing
    // priors in JS — the database is the single arbiter for ordering.
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue(RATES_30);
    (salesReportMtdRepository.findAceNocByTenantYearMonth as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 5, ace: 0, noc: 4 },
    ]);
    (salesReportYtdRepository.findFyctByTenantYearMonths as jest.Mock).mockResolvedValue([]);

    // Simulate the RPC being called twice concurrently. Each invocation
    // resolves independently; the RPC body (in Postgres) serialises by
    // taking pg_advisory_xact_lock on the period — so for the SECOND
    // caller the prior batch's writes are already visible when its
    // reversal scan runs. The test asserts the service never short-
    // circuits the RPC dispatch and forwards the per-call awards intact.
    const batchA = makeBatch({ id: 'batch-A' });
    const batchB = makeBatch({ id: 'batch-B' });

    await Promise.all([
      salesPointsService.awardForBatch(batchA, [
        { user_id: 'u1', agent_code: 'AG006' },
      ]),
      salesPointsService.awardForBatch(batchB, [
        { user_id: 'u1', agent_code: 'AG006' },
      ]),
    ]);

    expect(pointTransactionRepository.awardWithReversal).toHaveBeenCalledTimes(2);
    const calls = (pointTransactionRepository.awardWithReversal as jest.Mock).mock.calls;
    const batchIds = calls.map((c) => (c[0] as { batchId: string }).batchId).sort();
    expect(batchIds).toEqual(['batch-A', 'batch-B']);
    // Each call must carry its OWN batch's awards — the second caller's
    // awards must not be overwritten or dropped due to interleaving.
    for (const c of calls) {
      const params = c[0];
      expect(params.awards.every((a: { subject_id: string }) => a.subject_id === params.batchId)).toBe(true);
    }
  });
});

describe('SalesPointsService.awardForBatch — zero-points skipped', () => {
  it('forwards an empty award list when computed points all equal 0', async () => {
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue(RATES_30);
    (salesReportMtdRepository.findAceNocByTenantYearMonth as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 5, ace: 0, noc: 0 },
    ]);
    (salesReportYtdRepository.findFyctByTenantYearMonths as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 5, fyct: 100 },
      { user_id: 'u1', month: 4, fyct: 100 }, // delta = 0
    ]);

    await salesPointsService.awardForBatch(makeBatch(), [
      { user_id: 'u1', agent_code: 'AG006' },
    ]);

    // The RPC is still called — the reversal step needs to run even when
    // there are no fresh awards (a re-upload that zeroes everything must
    // still negate the prior batch's awards).
    expect(pointTransactionRepository.awardWithReversal).toHaveBeenCalledTimes(1);
    const call = (pointTransactionRepository.awardWithReversal as jest.Mock).mock.calls[0][0];
    expect(call.awards).toEqual([]);
  });

  it('omits a sub-1000 ACE bucket (floor(999/1000) = 0)', async () => {
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue(RATES_30);
    (salesReportMtdRepository.findAceNocByTenantYearMonth as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 5, ace: 999, noc: 1 },
    ]);
    (salesReportYtdRepository.findFyctByTenantYearMonths as jest.Mock).mockResolvedValue([]);

    await salesPointsService.awardForBatch(makeBatch(), [
      { user_id: 'u1', agent_code: 'AG006' },
    ]);

    const call = (pointTransactionRepository.awardWithReversal as jest.Mock).mock.calls[0][0];
    // sales_noc: 1×30=30 (kept). sales_fyct: 0 (omitted). sales_ace: floor(999/1000)=0 (omitted).
    expect(call.awards).toHaveLength(1);
    expect(call.awards[0]).toMatchObject({ activity: 'sales_noc', points: 30 });
  });
});

describe('SalesPointsService.awardForBatch — missing config defaults to 0', () => {
  it('does not award sales_noc when its rate is missing (defaults to 0)', async () => {
    // Only sales_fyct + sales_ace configured — sales_noc absent.
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue([
      { activity: 'sales_fyct', points: 30, category: 'sales' },
      { activity: 'sales_ace', points: 30, category: 'sales' },
    ]);
    (salesReportMtdRepository.findAceNocByTenantYearMonth as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 5, ace: 13000, noc: 4 },
    ]);
    (salesReportYtdRepository.findFyctByTenantYearMonths as jest.Mock).mockResolvedValue([]);

    await salesPointsService.awardForBatch(makeBatch(), [
      { user_id: 'u1', agent_code: 'AG006' },
    ]);

    const call = (pointTransactionRepository.awardWithReversal as jest.Mock).mock.calls[0][0];
    // sales_noc skipped (rate=0). sales_fyct: 0 (no YTD rows). sales_ace: 13×30=390.
    expect(call.awards).toEqual([
      expect.objectContaining({ activity: 'sales_ace', points: 390 }),
    ]);
  });

  it('forwards an empty award list when no rates are configured at all', async () => {
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue([]);
    (salesReportMtdRepository.findAceNocByTenantYearMonth as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 5, ace: 13000, noc: 4 },
    ]);
    (salesReportYtdRepository.findFyctByTenantYearMonths as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 5, fyct: 14500 },
      { user_id: 'u1', month: 4, fyct: 12000 },
    ]);

    await salesPointsService.awardForBatch(makeBatch(), [
      { user_id: 'u1', agent_code: 'AG006' },
    ]);

    const call = (pointTransactionRepository.awardWithReversal as jest.Mock).mock.calls[0][0];
    expect(call.awards).toEqual([]);
  });
});

describe('SalesPointsService.awardForBatch — non-throwing contract', () => {
  it('swallows errors raised by the awarding RPC (upload must not fail)', async () => {
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue(RATES_30);
    (salesReportMtdRepository.findAceNocByTenantYearMonth as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 5, ace: 13000, noc: 4 },
    ]);
    (salesReportYtdRepository.findFyctByTenantYearMonths as jest.Mock).mockResolvedValue([]);
    (pointTransactionRepository.awardWithReversal as jest.Mock).mockRejectedValue(
      new Error('db on fire'),
    );

    await expect(
      salesPointsService.awardForBatch(makeBatch(), [
        { user_id: 'u1', agent_code: 'AG006' },
      ]),
    ).resolves.toBeUndefined();
  });

  it('swallows errors raised by config lookup (logs but does not propagate)', async () => {
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockRejectedValue(
      new Error('db down'),
    );

    await expect(
      salesPointsService.awardForBatch(makeBatch(), [
        { user_id: 'u1', agent_code: 'AG006' },
      ]),
    ).resolves.toBeUndefined();
    expect(pointTransactionRepository.awardWithReversal).not.toHaveBeenCalled();
  });

  it('captures awarding failures as Sentry issues with critical tag', async () => {
    const Sentry = jest.requireMock('@sentry/node') as {
      captureException: jest.Mock;
    };
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockRejectedValue(
      new Error('config db unreachable'),
    );

    await salesPointsService.awardForBatch(makeBatch(), [
      { user_id: 'u1', agent_code: 'AG006' },
    ]);

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const args = Sentry.captureException.mock.calls[0];
    expect(args[0]).toBeInstanceOf(Error);
    expect(args[1]).toMatchObject({
      tags: { critical: 'sales_points_awarding' },
      extra: expect.objectContaining({
        batchId: 'batch-new',
        tenantId: 't1',
        year: 2026,
        month: 5,
      }),
    });
  });
});

describe('SalesPointsService.awardForBatch — no resolved agents', () => {
  it('still calls the RPC with an empty awards list (so reversals run)', async () => {
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue(RATES_30);

    await salesPointsService.awardForBatch(makeBatch(), []);

    expect(pointTransactionRepository.awardWithReversal).toHaveBeenCalledTimes(1);
    const call = (pointTransactionRepository.awardWithReversal as jest.Mock).mock.calls[0][0];
    expect(call.awards).toEqual([]);
  });
});
