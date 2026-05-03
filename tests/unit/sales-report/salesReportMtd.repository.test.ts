import supabaseService from '@src/services/supabase.service';
import salesReportMtdRepository from '@src/repositories/salesReportMtd.repository';

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    adminUpsert: jest.fn(),
    adminSelect: jest.fn(),
    adminSelectInIn: jest.fn(),
    adminSelectWithJoin: jest.fn(),
    adminSelectWithJoinIn: jest.fn(),
  },
}));

describe('SalesReportMtdRepository.bulkUpsert', () => {
  beforeEach(() => jest.resetAllMocks());

  it('calls adminUpsert with the MTD unique columns', async () => {
    (supabaseService.adminUpsert as jest.Mock).mockResolvedValue({
      data: [{ id: 'm1' }],
      error: null,
    });

    await salesReportMtdRepository.bulkUpsert([
      { batch_id: 'b', tenant_id: 't', user_id: 'u1', year: 2026, month: 5, ace: 1, noc: 1 },
    ]);

    expect(supabaseService.adminUpsert).toHaveBeenCalledWith(
      'sales_report_mtd',
      expect.any(Array),
      'tenant_id,user_id,year,month',
    );
  });

  it('skips the call when given an empty array', async () => {
    await salesReportMtdRepository.bulkUpsert([]);
    expect(supabaseService.adminUpsert).not.toHaveBeenCalled();
  });

  it('throws RepositoryError on error response', async () => {
    (supabaseService.adminUpsert as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'constraint violation' },
    });
    await expect(salesReportMtdRepository.bulkUpsert([
      { batch_id: 'b', tenant_id: 't', user_id: 'u1', year: 2026, month: 5, ace: 1, noc: 1 },
    ])).rejects.toThrow('SalesReportMtdRepository.bulkUpsert failed');
  });
});

describe('SalesReportMtdRepository.findAceNocByTenantYear', () => {
  beforeEach(() => jest.resetAllMocks());

  it('queries sales_report_mtd via adminSelect when no userIds filter is supplied', async () => {
    (supabaseService.adminSelect as jest.Mock).mockResolvedValue({
      data: [
        { user_id: 'u1', month: 1, ace: 10, noc: 1 },
        { user_id: 'u2', month: 5, ace: 50, noc: 5 },
      ],
      error: null,
    });

    const out = await salesReportMtdRepository.findAceNocByTenantYear('t1', 2026);

    expect(supabaseService.adminSelect).toHaveBeenCalledWith(
      'sales_report_mtd',
      'user_id, month, ace, noc',
      { tenant_id: 't1', year: 2026 },
    );
    expect(supabaseService.adminSelectInIn).not.toHaveBeenCalled();
    expect(out).toHaveLength(2);
  });

  it('routes through adminSelectInIn when userIds is provided', async () => {
    (supabaseService.adminSelectInIn as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });

    await salesReportMtdRepository.findAceNocByTenantYear('t1', 2026, ['u1']);

    expect(supabaseService.adminSelectInIn).toHaveBeenCalledWith(
      'sales_report_mtd',
      'user_id, month, ace, noc',
      [{ column: 'user_id', values: ['u1'] }],
      { tenant_id: 't1', year: 2026 },
    );
  });

  it('returns an empty array immediately when userIds is an empty array', async () => {
    const out = await salesReportMtdRepository.findAceNocByTenantYear('t1', 2026, []);
    expect(out).toEqual([]);
    expect(supabaseService.adminSelect).not.toHaveBeenCalled();
    expect(supabaseService.adminSelectInIn).not.toHaveBeenCalled();
  });

  it('throws RepositoryError on error response', async () => {
    (supabaseService.adminSelect as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'view query failed' },
    });

    await expect(
      salesReportMtdRepository.findAceNocByTenantYear('t1', 2026),
    ).rejects.toThrow('SalesReportMtdRepository.findAceNocByTenantYear failed');
  });
});

describe('SalesReportMtdRepository.findAceNocByTenantYearMonth', () => {
  beforeEach(() => jest.resetAllMocks());

  it('routes through adminSelectInIn with month + user_id filters', async () => {
    (supabaseService.adminSelectInIn as jest.Mock).mockResolvedValue({
      data: [{ user_id: 'u1', month: 5, ace: 100, noc: 2 }],
      error: null,
    });

    const out = await salesReportMtdRepository.findAceNocByTenantYearMonth(
      't1', 2026, 5, ['u1'],
    );

    expect(supabaseService.adminSelectInIn).toHaveBeenCalledWith(
      'sales_report_mtd',
      'user_id, month, ace, noc',
      [{ column: 'user_id', values: ['u1'] }],
      { tenant_id: 't1', year: 2026, month: 5 },
    );
    expect(out).toHaveLength(1);
  });

  it('short-circuits to [] on empty userIds (no DB call)', async () => {
    const out = await salesReportMtdRepository.findAceNocByTenantYearMonth(
      't1', 2026, 5, [],
    );
    expect(out).toEqual([]);
    expect(supabaseService.adminSelectInIn).not.toHaveBeenCalled();
  });
});

describe('SalesReportMtdRepository.findFycByTenantYear', () => {
  beforeEach(() => jest.resetAllMocks());

  it('queries the sales_report_mtd_fyc view via adminSelectWithJoinIn', async () => {
    (supabaseService.adminSelectWithJoinIn as jest.Mock).mockResolvedValue({
      data: [{ user_id: 'u1', month: 5, fyc_mtd: 1000, fyct_mtd: 1100 }],
      error: null,
    });

    const out = await salesReportMtdRepository.findFycByTenantYear('t1', 2026);

    expect(supabaseService.adminSelectWithJoinIn).toHaveBeenCalledWith(
      'sales_report_mtd_fyc',
      'user_id, month, fyc_mtd, fyct_mtd',
      [],
      { tenant_id: 't1', year: 2026 },
    );
    expect(out).toEqual([{ user_id: 'u1', month: 5, fyc_mtd: 1000, fyct_mtd: 1100 }]);
  });

  it('forwards an .in() filter when userIds is provided', async () => {
    (supabaseService.adminSelectWithJoinIn as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });

    await salesReportMtdRepository.findFycByTenantYear('t1', 2026, ['u1']);

    expect(supabaseService.adminSelectWithJoinIn).toHaveBeenCalledWith(
      'sales_report_mtd_fyc',
      'user_id, month, fyc_mtd, fyct_mtd',
      [{ column: 'user_id', values: ['u1'] }],
      { tenant_id: 't1', year: 2026 },
    );
  });

  it('short-circuits to [] on empty userIds (no DB call)', async () => {
    const out = await salesReportMtdRepository.findFycByTenantYear('t1', 2026, []);
    expect(out).toEqual([]);
    expect(supabaseService.adminSelectWithJoinIn).not.toHaveBeenCalled();
  });

  it('throws RepositoryError on error response', async () => {
    (supabaseService.adminSelectWithJoinIn as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'view query failed' },
    });

    await expect(
      salesReportMtdRepository.findFycByTenantYear('t1', 2026),
    ).rejects.toThrow('SalesReportMtdRepository.findFycByTenantYear failed');
  });
});
