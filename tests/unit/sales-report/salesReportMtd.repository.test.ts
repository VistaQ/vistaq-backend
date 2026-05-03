import supabaseService from '@src/services/supabase.service';
import salesReportMtdRepository from '@src/repositories/salesReportMtd.repository';

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    adminUpsert: jest.fn(),
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

  function stubChain(
    finalResult: { data: unknown[] | null; error: { message: string } | null },
  ) {
    const final = jest.fn().mockResolvedValue(finalResult);
    // Builder chain: from().select().eq().eq() (and optional .in())
    // Each step returns the same builder shape so callers can chain freely.
    const builder = {
      select: jest.fn(),
      eq: jest.fn(),
      in: jest.fn(),
      then: undefined as unknown,
    };
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.in.mockReturnValue(builder);
    // The terminal awaited promise: the last call in the chain is what's
    // awaited. We make the builder itself thenable by routing then() to the
    // final result.
    (builder as unknown as { then: (cb: (v: unknown) => unknown) => unknown }).then =
      (cb: (v: unknown) => unknown) => Promise.resolve(final()).then(cb);
    const fromMock = jest.fn().mockReturnValue(builder);
    (supabaseService as unknown as { adminClient: { from: jest.Mock } }).adminClient = {
      from: fromMock,
    } as never;
    return { fromMock, builder, final };
  }

  it('queries sales_report_mtd and returns rows when no userIds filter is supplied', async () => {
    const { fromMock, builder } = stubChain({
      data: [
        { user_id: 'u1', month: 1, ace: 10, noc: 1 },
        { user_id: 'u2', month: 5, ace: 50, noc: 5 },
      ],
      error: null,
    });

    const out = await salesReportMtdRepository.findAceNocByTenantYear('t1', 2026);

    expect(fromMock).toHaveBeenCalledWith('sales_report_mtd');
    expect(builder.select).toHaveBeenCalledWith('user_id, month, ace, noc');
    expect(builder.eq).toHaveBeenCalledWith('tenant_id', 't1');
    expect(builder.eq).toHaveBeenCalledWith('year', 2026);
    expect(builder.in).not.toHaveBeenCalled();
    expect(out).toHaveLength(2);
  });

  it('applies an .in filter when userIds is provided', async () => {
    const { builder } = stubChain({ data: [], error: null });

    await salesReportMtdRepository.findAceNocByTenantYear('t1', 2026, ['u1']);

    expect(builder.in).toHaveBeenCalledWith('user_id', ['u1']);
  });

  it('returns an empty array immediately when userIds is an empty array', async () => {
    const { fromMock } = stubChain({ data: [], error: null });

    const out = await salesReportMtdRepository.findAceNocByTenantYear('t1', 2026, []);

    expect(out).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('throws RepositoryError on error response', async () => {
    stubChain({ data: null, error: { message: 'view query failed' } });

    await expect(
      salesReportMtdRepository.findAceNocByTenantYear('t1', 2026),
    ).rejects.toThrow('SalesReportMtdRepository.findAceNocByTenantYear failed');
  });
});

describe('SalesReportMtdRepository.findFycByTenantYear', () => {
  beforeEach(() => jest.resetAllMocks());

  function stubChain(
    finalResult: { data: unknown[] | null; error: { message: string } | null },
  ) {
    const final = jest.fn().mockResolvedValue(finalResult);
    const builder = {
      select: jest.fn(),
      eq: jest.fn(),
      in: jest.fn(),
      then: undefined as unknown,
    };
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.in.mockReturnValue(builder);
    (builder as unknown as { then: (cb: (v: unknown) => unknown) => unknown }).then =
      (cb: (v: unknown) => unknown) => Promise.resolve(final()).then(cb);
    const fromMock = jest.fn().mockReturnValue(builder);
    (supabaseService as unknown as { adminClient: { from: jest.Mock } }).adminClient = {
      from: fromMock,
    } as never;
    return { fromMock, builder };
  }

  it('queries the sales_report_mtd_fyc view with the expected columns', async () => {
    const { fromMock, builder } = stubChain({
      data: [{ user_id: 'u1', month: 5, fyc_mtd: 1000, fyct_mtd: 1100 }],
      error: null,
    });

    const out = await salesReportMtdRepository.findFycByTenantYear('t1', 2026);

    expect(fromMock).toHaveBeenCalledWith('sales_report_mtd_fyc');
    expect(builder.select).toHaveBeenCalledWith('user_id, month, fyc_mtd, fyct_mtd');
    expect(out).toEqual([{ user_id: 'u1', month: 5, fyc_mtd: 1000, fyct_mtd: 1100 }]);
  });

  it('throws RepositoryError on error response', async () => {
    stubChain({ data: null, error: { message: 'view query failed' } });

    await expect(
      salesReportMtdRepository.findFycByTenantYear('t1', 2026),
    ).rejects.toThrow('SalesReportMtdRepository.findFycByTenantYear failed');
  });
});
