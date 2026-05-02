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

describe('SalesReportMtdRepository.aggregateTrendByYear', () => {
  beforeEach(() => jest.resetAllMocks());

  it('aggregates fyc_mtd and fyct_mtd grouped by month', async () => {
    const eqMock2 = jest.fn().mockResolvedValue({
      data: [
        { month: 1, fyc_mtd: 100, fyct_mtd: 110 },
        { month: 1, fyc_mtd: 50,  fyct_mtd: 60  },
        { month: 2, fyc_mtd: 200, fyct_mtd: 210 },
      ],
      error: null,
    });
    const eqMock1 = jest.fn().mockReturnValue({ eq: eqMock2 });
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock1 });
    const fromMock = jest.fn().mockReturnValue({ select: selectMock });
    (supabaseService as unknown as { adminClient: { from: jest.Mock } }).adminClient = {
      from: fromMock,
    } as never;

    const trend = await salesReportMtdRepository.aggregateTrendByYear('t1', 2026);

    expect(fromMock).toHaveBeenCalledWith('sales_report_mtd_fyc');
    expect(trend).toEqual([
      { month: 1, fyc_mtd: 150, fyct_mtd: 170 },
      { month: 2, fyc_mtd: 200, fyct_mtd: 210 },
    ]);
  });

  it('throws RepositoryError on error response', async () => {
    const eqMock2 = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'view query failed' },
    });
    const eqMock1 = jest.fn().mockReturnValue({ eq: eqMock2 });
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock1 });
    const fromMock = jest.fn().mockReturnValue({ select: selectMock });
    (supabaseService as unknown as { adminClient: { from: jest.Mock } }).adminClient = {
      from: fromMock,
    } as never;

    await expect(
      salesReportMtdRepository.aggregateTrendByYear('t1', 2026),
    ).rejects.toThrow('SalesReportMtdRepository.aggregateTrendByYear failed');
  });
});
