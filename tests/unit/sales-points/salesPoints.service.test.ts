import salesPointsService from '@src/services/salesPoints.service';
import pointConfigRepository from '@src/repositories/pointConfig.repository';
import pointTransactionRepository from '@src/repositories/pointTransaction.repository';
import salesReportMtdRepository from '@src/repositories/salesReportMtd.repository';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';
import uploadBatchRepository from '@src/repositories/uploadBatch.repository';
import { IUploadBatch } from '@src/types/salesReport.types';

jest.mock('@src/repositories/pointConfig.repository', () => ({
  __esModule: true,
  default: { findByTenantAndCategoryAdmin: jest.fn() },
}));
jest.mock('@src/repositories/pointTransaction.repository', () => ({
  __esModule: true,
  default: { bulkInsert: jest.fn(), findBySubjectIds: jest.fn() },
}));
jest.mock('@src/repositories/salesReportMtd.repository', () => ({
  __esModule: true,
  default: { findAceNocByTenantYearMonth: jest.fn() },
}));
jest.mock('@src/repositories/salesReportYtd.repository', () => ({
  __esModule: true,
  default: { findFyctByTenantYearMonths: jest.fn() },
}));
jest.mock('@src/repositories/uploadBatch.repository', () => ({
  __esModule: true,
  default: { findPriorBatchIdsForPeriod: jest.fn() },
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
  it('awards points for resolved agents based on MTD ACE/NOC and YTD-derived MTD FYCT', async () => {
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue(
      RATES_30,
    );
    (uploadBatchRepository.findPriorBatchIdsForPeriod as jest.Mock).mockResolvedValue([]);
    // No prior batches → no reversal lookups.
    (pointTransactionRepository.findBySubjectIds as jest.Mock).mockResolvedValue([]);
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

    expect(pointTransactionRepository.bulkInsert).toHaveBeenCalledTimes(1);
    const inserted = (pointTransactionRepository.bulkInsert as jest.Mock).mock.calls[0][0];

    // sales_noc: 4 × 30 = 120
    // sales_fyct: floor((14500 - 12000) / 1000) = floor(2.5) = 2 → 2 × 30 = 60
    // sales_ace: floor(13000/1000) = 13 → 13 × 30 = 390
    expect(inserted).toEqual([
      expect.objectContaining({ activity: 'sales_noc', points: 120, subject_id: 'batch-new' }),
      expect.objectContaining({ activity: 'sales_fyct', points: 60, subject_id: 'batch-new' }),
      expect.objectContaining({ activity: 'sales_ace', points: 390, subject_id: 'batch-new' }),
    ]);
    for (const row of inserted) {
      expect(row.tenant_id).toBe('t1');
      expect(row.user_id).toBe('u1');
      expect(row.subject_type).toBe('upload_batch');
    }
  });

  it('treats first month of year (no previous YTD) as MTD FYCT = current YTD', async () => {
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue(RATES_30);
    (uploadBatchRepository.findPriorBatchIdsForPeriod as jest.Mock).mockResolvedValue([]);
    (salesReportMtdRepository.findAceNocByTenantYearMonth as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 1, ace: 0, noc: 0 },
    ]);
    (salesReportYtdRepository.findFyctByTenantYearMonths as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 1, fyct: 4000 },
    ]);

    await salesPointsService.awardForBatch(makeBatch({ month: 1 }), [
      { user_id: 'u1', agent_code: 'AG006' },
    ]);

    const inserted = (pointTransactionRepository.bulkInsert as jest.Mock).mock.calls[0][0];
    // sales_fyct: floor(4000 / 1000) = 4 → 4 × 30 = 120
    expect(inserted).toEqual([
      expect.objectContaining({ activity: 'sales_fyct', points: 120 }),
    ]);
  });
});

describe('SalesPointsService.awardForBatch — reversal path (re-upload)', () => {
  it('inserts negative offset entries for prior batch txns plus fresh awards', async () => {
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue(RATES_30);
    // One prior batch for May exists → its txns must be reversed.
    (uploadBatchRepository.findPriorBatchIdsForPeriod as jest.Mock).mockResolvedValue([
      'batch-old',
    ]);
    (pointTransactionRepository.findBySubjectIds as jest.Mock).mockResolvedValue([
      {
        id: 'pt-old-1',
        tenant_id: 't1',
        user_id: 'u1',
        activity: 'sales_noc',
        points: 120,
        subject_id: 'batch-old',
        subject_type: 'upload_batch',
        created_at: '2026-06-01T00:00:00Z',
      },
      {
        id: 'pt-old-2',
        tenant_id: 't1',
        user_id: 'u1',
        activity: 'sales_ace',
        points: 360,
        subject_id: 'batch-old',
        subject_type: 'upload_batch',
        created_at: '2026-06-01T00:00:00Z',
      },
    ]);
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

    const inserted = (pointTransactionRepository.bulkInsert as jest.Mock).mock.calls[0][0];

    // 2 reversals (linked to ORIGINAL batch-old) + 3 fresh awards (linked to batch-new)
    expect(inserted).toHaveLength(5);
    expect(inserted[0]).toMatchObject({
      activity: 'sales_noc',
      points: -120,
      subject_id: 'batch-old',
    });
    expect(inserted[1]).toMatchObject({
      activity: 'sales_ace',
      points: -360,
      subject_id: 'batch-old',
    });
    // Fresh awards link to the new batch.
    expect(inserted.slice(2)).toEqual([
      expect.objectContaining({ activity: 'sales_noc', points: 120, subject_id: 'batch-new' }),
      expect.objectContaining({ activity: 'sales_fyct', points: 60, subject_id: 'batch-new' }),
      expect.objectContaining({ activity: 'sales_ace', points: 390, subject_id: 'batch-new' }),
    ]);
  });
});

describe('SalesPointsService.awardForBatch — reversal of past month', () => {
  it('reverses ALL prior batches for that period, regardless of how many exist', async () => {
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue(RATES_30);
    (uploadBatchRepository.findPriorBatchIdsForPeriod as jest.Mock).mockResolvedValue([
      'batch-feb-1',
      'batch-feb-2',
    ]);
    (pointTransactionRepository.findBySubjectIds as jest.Mock).mockResolvedValue([
      {
        id: 'pt1',
        tenant_id: 't1',
        user_id: 'u1',
        activity: 'sales_noc',
        points: 90,
        subject_id: 'batch-feb-1',
        subject_type: 'upload_batch',
        created_at: '2026-03-01T00:00:00Z',
      },
      {
        id: 'pt2',
        tenant_id: 't1',
        user_id: 'u1',
        activity: 'sales_noc',
        points: 60,
        subject_id: 'batch-feb-2',
        subject_type: 'upload_batch',
        created_at: '2026-04-01T00:00:00Z',
      },
    ]);
    (salesReportMtdRepository.findAceNocByTenantYearMonth as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 2, ace: 0, noc: 1 },
    ]);
    (salesReportYtdRepository.findFyctByTenantYearMonths as jest.Mock).mockResolvedValue([]);

    await salesPointsService.awardForBatch(
      makeBatch({ id: 'batch-feb-3', month: 2 }),
      [{ user_id: 'u1', agent_code: 'AG006' }],
    );

    const inserted = (pointTransactionRepository.bulkInsert as jest.Mock).mock.calls[0][0];
    // 2 reversals + 1 fresh award (only sales_noc has nonzero points)
    expect(inserted).toEqual([
      expect.objectContaining({ activity: 'sales_noc', points: -90, subject_id: 'batch-feb-1' }),
      expect.objectContaining({ activity: 'sales_noc', points: -60, subject_id: 'batch-feb-2' }),
      expect.objectContaining({ activity: 'sales_noc', points: 30, subject_id: 'batch-feb-3' }),
    ]);
  });
});

describe('SalesPointsService.awardForBatch — zero-points skipped', () => {
  it('does not stage a row when computed points equal 0', async () => {
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue(RATES_30);
    (uploadBatchRepository.findPriorBatchIdsForPeriod as jest.Mock).mockResolvedValue([]);
    // Agent has no MTD activity at all → all three computed values = 0.
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

    // Nothing to insert — no reversal, no awards.
    expect(pointTransactionRepository.bulkInsert).not.toHaveBeenCalled();
  });

  it('omits a sub-1000 ACE bucket (floor(999/1000) = 0)', async () => {
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue(RATES_30);
    (uploadBatchRepository.findPriorBatchIdsForPeriod as jest.Mock).mockResolvedValue([]);
    (salesReportMtdRepository.findAceNocByTenantYearMonth as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 5, ace: 999, noc: 1 },
    ]);
    (salesReportYtdRepository.findFyctByTenantYearMonths as jest.Mock).mockResolvedValue([]);

    await salesPointsService.awardForBatch(makeBatch(), [
      { user_id: 'u1', agent_code: 'AG006' },
    ]);

    const inserted = (pointTransactionRepository.bulkInsert as jest.Mock).mock.calls[0][0];
    // sales_noc: 1×30=30 (kept). sales_fyct: 0 (omitted). sales_ace: floor(999/1000)=0 (omitted).
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ activity: 'sales_noc', points: 30 });
  });
});

describe('SalesPointsService.awardForBatch — missing config defaults to 0', () => {
  it('does not award sales_noc when its rate is missing (defaults to 0)', async () => {
    // Only sales_fyct + sales_ace configured — sales_noc absent.
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue([
      { activity: 'sales_fyct', points: 30, category: 'sales' },
      { activity: 'sales_ace', points: 30, category: 'sales' },
    ]);
    (uploadBatchRepository.findPriorBatchIdsForPeriod as jest.Mock).mockResolvedValue([]);
    (salesReportMtdRepository.findAceNocByTenantYearMonth as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 5, ace: 13000, noc: 4 },
    ]);
    (salesReportYtdRepository.findFyctByTenantYearMonths as jest.Mock).mockResolvedValue([]);

    await salesPointsService.awardForBatch(makeBatch(), [
      { user_id: 'u1', agent_code: 'AG006' },
    ]);

    const inserted = (pointTransactionRepository.bulkInsert as jest.Mock).mock.calls[0][0];
    // sales_noc skipped (rate=0). sales_fyct: 0 (no YTD rows). sales_ace: 13×30=390.
    expect(inserted).toEqual([
      expect.objectContaining({ activity: 'sales_ace', points: 390 }),
    ]);
  });

  it('produces an empty insert when no rates are configured at all', async () => {
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue([]);
    (uploadBatchRepository.findPriorBatchIdsForPeriod as jest.Mock).mockResolvedValue([]);
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

    expect(pointTransactionRepository.bulkInsert).not.toHaveBeenCalled();
  });
});

describe('SalesPointsService.awardForBatch — non-throwing contract', () => {
  it('swallows errors raised by the bulk insert (upload must not fail)', async () => {
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue(RATES_30);
    (uploadBatchRepository.findPriorBatchIdsForPeriod as jest.Mock).mockResolvedValue([]);
    (salesReportMtdRepository.findAceNocByTenantYearMonth as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 5, ace: 13000, noc: 4 },
    ]);
    (salesReportYtdRepository.findFyctByTenantYearMonths as jest.Mock).mockResolvedValue([]);
    (pointTransactionRepository.bulkInsert as jest.Mock).mockRejectedValue(
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
    expect(pointTransactionRepository.bulkInsert).not.toHaveBeenCalled();
  });
});

describe('SalesPointsService.awardForBatch — no resolved agents', () => {
  it('does nothing when the agent list is empty', async () => {
    (pointConfigRepository.findByTenantAndCategoryAdmin as jest.Mock).mockResolvedValue(RATES_30);
    (uploadBatchRepository.findPriorBatchIdsForPeriod as jest.Mock).mockResolvedValue([]);

    await salesPointsService.awardForBatch(makeBatch(), []);

    expect(pointTransactionRepository.bulkInsert).not.toHaveBeenCalled();
  });
});
