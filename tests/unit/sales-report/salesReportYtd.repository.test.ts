import supabaseService from '@src/services/supabase.service';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    adminUpsert: jest.fn(),
    adminSelect: jest.fn(),
    adminSelectOrdered: jest.fn(),
    adminSelectInIn: jest.fn(),
  },
}));

describe('SalesReportYtdRepository.bulkUpsert', () => {
  beforeEach(() => jest.resetAllMocks());

  it('calls adminUpsert with the unique-constraint columns', async () => {
    (supabaseService.adminUpsert as jest.Mock).mockResolvedValue({
      data: [{ id: '1' }, { id: '2' }],
      error: null,
    });

    await salesReportYtdRepository.bulkUpsert([
      {
        batch_id: 'b', tenant_id: 't', user_id: 'u1', year: 2026, month: 5,
        ace: 1, noc: 1, fyct: 1, fyct_pct: 0, mdrt_shortage_fyct: 0,
        fyc: 1, fyc_pct: 0, mdrt_shortage_fyc: 0,
      },
      {
        batch_id: 'b', tenant_id: 't', user_id: 'u2', year: 2026, month: 5,
        ace: 2, noc: 2, fyct: 2, fyct_pct: 0, mdrt_shortage_fyct: 0,
        fyc: 2, fyc_pct: 0, mdrt_shortage_fyc: 0,
      },
    ]);

    expect(supabaseService.adminUpsert).toHaveBeenCalledWith(
      'sales_report_ytd',
      expect.any(Array),
      'tenant_id,user_id,year,month',
    );
  });

  it('throws RepositoryError on error response', async () => {
    (supabaseService.adminUpsert as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'check violation' },
    });

    await expect(salesReportYtdRepository.bulkUpsert([
      {
        batch_id: 'b', tenant_id: 't', user_id: 'u1', year: 2026, month: 5,
        ace: 1, noc: 1, fyct: 1, fyct_pct: 0, mdrt_shortage_fyct: 0,
        fyc: 1, fyc_pct: 0, mdrt_shortage_fyc: 0,
      },
    ])).rejects.toThrow(
      'SalesReportYtdRepository.bulkUpsert failed',
    );
  });

  it('skips the supabase call when given an empty array', async () => {
    await salesReportYtdRepository.bulkUpsert([]);
    expect(supabaseService.adminUpsert).not.toHaveBeenCalled();
  });
});

describe('SalesReportYtdRepository.findLatestUploadedMonth', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns the highest month for the tenant/year', async () => {
    (supabaseService.adminSelectOrdered as jest.Mock).mockResolvedValue({
      data: [{ month: 4 }],
      error: null,
    });

    const month = await salesReportYtdRepository.findLatestUploadedMonth('t1', 2026);

    expect(supabaseService.adminSelectOrdered).toHaveBeenCalledWith(
      'sales_report_ytd',
      'month',
      { tenant_id: 't1', year: 2026 },
      { column: 'month', ascending: false },
      1,
    );
    expect(month).toBe(4);
  });

  it('returns null when no rows exist', async () => {
    (supabaseService.adminSelectOrdered as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });

    const month = await salesReportYtdRepository.findLatestUploadedMonth('t1', 2026);

    expect(month).toBeNull();
  });

  it('throws RepositoryError when supabase returns an error', async () => {
    (supabaseService.adminSelectOrdered as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });

    await expect(
      salesReportYtdRepository.findLatestUploadedMonth('t1', 2026),
    ).rejects.toThrow('SalesReportYtdRepository.findLatestUploadedMonth failed');
  });
});

describe('SalesReportYtdRepository.findLatestYtdPerUserByTenantYear', () => {
  beforeEach(() => jest.resetAllMocks());

  it('keeps only the highest-month row per user', async () => {
    (supabaseService.adminSelect as jest.Mock).mockResolvedValue({
      data: [
        { id: 'r1', user_id: 'u1', year: 2026, month: 3, ace: 0, noc: 0, fyct: 0, fyct_pct: 0, mdrt_shortage_fyct: 0, fyc: 0, fyc_pct: 0, mdrt_shortage_fyc: 0, created_at: '2026-04-01', updated_at: '2026-04-01' },
        { id: 'r2', user_id: 'u1', year: 2026, month: 5, ace: 0, noc: 0, fyct: 0, fyct_pct: 0, mdrt_shortage_fyct: 0, fyc: 0, fyc_pct: 0, mdrt_shortage_fyc: 0, created_at: '2026-06-01', updated_at: '2026-06-01' },
        { id: 'r3', user_id: 'u2', year: 2026, month: 4, ace: 0, noc: 0, fyct: 0, fyct_pct: 0, mdrt_shortage_fyct: 0, fyc: 0, fyc_pct: 0, mdrt_shortage_fyc: 0, created_at: '2026-05-01', updated_at: '2026-05-01' },
      ],
      error: null,
    });

    const out = await salesReportYtdRepository.findLatestYtdPerUserByTenantYear('t1', 2026);

    expect(supabaseService.adminSelect).toHaveBeenCalledWith(
      'sales_report_ytd',
      expect.stringContaining('updated_at'),
      { tenant_id: 't1', year: 2026 },
    );
    expect(out.find((r) => r.user_id === 'u1')?.id).toBe('r2');
    expect(out.find((r) => r.user_id === 'u2')?.id).toBe('r3');
    expect(out).toHaveLength(2);
  });

  it('returns empty array when nothing matches', async () => {
    (supabaseService.adminSelect as jest.Mock).mockResolvedValue({ data: [], error: null });
    const out = await salesReportYtdRepository.findLatestYtdPerUserByTenantYear('t1', 2026);
    expect(out).toEqual([]);
  });

  it('throws RepositoryError when supabase returns an error', async () => {
    (supabaseService.adminSelect as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });
    await expect(
      salesReportYtdRepository.findLatestYtdPerUserByTenantYear('t1', 2026),
    ).rejects.toThrow(
      'SalesReportYtdRepository.findLatestYtdPerUserByTenantYear failed',
    );
  });
});

describe('SalesReportYtdRepository.findLatestYtdForUserYear', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns the single latest row when one exists', async () => {
    (supabaseService.adminSelectOrdered as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 'r1', user_id: 'u1', year: 2026, month: 5,
          ace: 1, noc: 0, fyct: 0, fyct_pct: 0, mdrt_shortage_fyct: 0,
          fyc: 0, fyc_pct: 0, mdrt_shortage_fyc: 0,
          created_at: '2026-06-01', updated_at: '2026-06-02',
        },
      ],
      error: null,
    });

    const out = await salesReportYtdRepository.findLatestYtdForUserYear('t1', 'u1', 2026);

    expect(supabaseService.adminSelectOrdered).toHaveBeenCalledWith(
      'sales_report_ytd',
      expect.stringContaining('updated_at'),
      { tenant_id: 't1', user_id: 'u1', year: 2026 },
      { column: 'month', ascending: false },
      1,
    );
    expect(out?.id).toBe('r1');
  });

  it('returns null when no row exists', async () => {
    (supabaseService.adminSelectOrdered as jest.Mock).mockResolvedValue({ data: [], error: null });
    const out = await salesReportYtdRepository.findLatestYtdForUserYear('t1', 'u1', 2026);
    expect(out).toBeNull();
  });

  it('throws RepositoryError when supabase returns an error', async () => {
    (supabaseService.adminSelectOrdered as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });
    await expect(
      salesReportYtdRepository.findLatestYtdForUserYear('t1', 'u1', 2026),
    ).rejects.toThrow('SalesReportYtdRepository.findLatestYtdForUserYear failed');
  });
});

describe('SalesReportYtdRepository.findFyctByTenantYearMonths', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns rows scoped via adminSelectInIn with month + user_id .in() filters', async () => {
    (supabaseService.adminSelectInIn as jest.Mock).mockResolvedValue({
      data: [{ user_id: 'u1', month: 5, fyct: 14500 }],
      error: null,
    });

    const out = await salesReportYtdRepository.findFyctByTenantYearMonths(
      't1', 2026, [5, 4], ['u1'],
    );

    expect(supabaseService.adminSelectInIn).toHaveBeenCalledWith(
      'sales_report_ytd',
      'user_id, month, fyct',
      [
        { column: 'month', values: [5, 4] },
        { column: 'user_id', values: ['u1'] },
      ],
      { tenant_id: 't1', year: 2026 },
    );
    expect(out).toEqual([{ user_id: 'u1', month: 5, fyct: 14500 }]);
  });

  it('short-circuits to [] on empty userIds (no DB call)', async () => {
    const out = await salesReportYtdRepository.findFyctByTenantYearMonths(
      't1', 2026, [5], [],
    );
    expect(out).toEqual([]);
    expect(supabaseService.adminSelectInIn).not.toHaveBeenCalled();
  });

  it('short-circuits to [] on empty months (no DB call)', async () => {
    const out = await salesReportYtdRepository.findFyctByTenantYearMonths(
      't1', 2026, [], ['u1'],
    );
    expect(out).toEqual([]);
    expect(supabaseService.adminSelectInIn).not.toHaveBeenCalled();
  });
});
