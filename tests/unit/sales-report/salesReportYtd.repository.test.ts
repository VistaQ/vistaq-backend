import supabaseService from '@src/services/supabase.service';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    adminUpsert: jest.fn(),
    adminSelect: jest.fn(),
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
    const limitMock = jest.fn().mockResolvedValue({
      data: [{ month: 4 }],
      error: null,
    });
    const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
    const eqMock2 = jest.fn().mockReturnValue({ order: orderMock });
    const eqMock1 = jest.fn().mockReturnValue({ eq: eqMock2 });
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock1 });
    const fromMock = jest.fn().mockReturnValue({ select: selectMock });
    (supabaseService as unknown as { adminClient: { from: jest.Mock } }).adminClient = {
      from: fromMock,
    } as never;

    const month = await salesReportYtdRepository.findLatestUploadedMonth('t1', 2026);

    expect(fromMock).toHaveBeenCalledWith('sales_report_ytd');
    expect(selectMock).toHaveBeenCalledWith('month');
    expect(eqMock1).toHaveBeenCalledWith('tenant_id', 't1');
    expect(eqMock2).toHaveBeenCalledWith('year', 2026);
    expect(orderMock).toHaveBeenCalledWith('month', { ascending: false });
    expect(limitMock).toHaveBeenCalledWith(1);
    expect(month).toBe(4);
  });

  it('returns null when no rows exist', async () => {
    const limitMock = jest.fn().mockResolvedValue({ data: [], error: null });
    const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
    const eqMock2 = jest.fn().mockReturnValue({ order: orderMock });
    const eqMock1 = jest.fn().mockReturnValue({ eq: eqMock2 });
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock1 });
    const fromMock = jest.fn().mockReturnValue({ select: selectMock });
    (supabaseService as unknown as { adminClient: { from: jest.Mock } }).adminClient = {
      from: fromMock,
    } as never;

    const month = await salesReportYtdRepository.findLatestUploadedMonth('t1', 2026);

    expect(month).toBeNull();
  });

  it('throws RepositoryError when supabase returns an error', async () => {
    const limitMock = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });
    const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
    const eqMock2 = jest.fn().mockReturnValue({ order: orderMock });
    const eqMock1 = jest.fn().mockReturnValue({ eq: eqMock2 });
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock1 });
    const fromMock = jest.fn().mockReturnValue({ select: selectMock });
    (supabaseService as unknown as { adminClient: { from: jest.Mock } }).adminClient = {
      from: fromMock,
    } as never;

    await expect(
      salesReportYtdRepository.findLatestUploadedMonth('t1', 2026),
    ).rejects.toThrow('SalesReportYtdRepository.findLatestUploadedMonth failed');
  });
});

describe('SalesReportYtdRepository.findByTenantYearMonthWithUser', () => {
  beforeEach(() => jest.resetAllMocks());

  it('queries with the user join and returns mapped rows', async () => {
    // Stub the chained from->select->eq->eq->eq builder used directly
    // (this method bypasses the wrapper because it needs a join select string).
    const eqMock3 = jest.fn().mockResolvedValue({
      data: [{
        user_id: 'u1', fyct: 100, fyc: 90, fyc_pct: 0.5,
        ace: 200, noc: 5, mdrt_shortage_fyc: 10,
        users: { name: 'Alice', agent_code: 'A1' },
      }],
      error: null,
    });
    const eqMock2 = jest.fn().mockReturnValue({ eq: eqMock3 });
    const eqMock1 = jest.fn().mockReturnValue({ eq: eqMock2 });
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock1 });
    const fromMock = jest.fn().mockReturnValue({ select: selectMock });
    (supabaseService as unknown as { adminClient: { from: jest.Mock } }).adminClient = {
      from: fromMock,
    } as never;

    const rows = await salesReportYtdRepository.findByTenantYearMonthWithUser('t1', 2026, 5);

    expect(fromMock).toHaveBeenCalledWith('sales_report_ytd');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Alice');
    expect(rows[0].agent_code).toBe('A1');
  });
});
