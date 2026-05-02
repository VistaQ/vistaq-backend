import salesReportService from '@src/services/salesReport.service';
import salesReportMtdRepository from '@src/repositories/salesReportMtd.repository';

jest.mock('@src/repositories/salesReportMtd.repository', () => ({
  __esModule: true,
  default: { aggregateTrendByYear: jest.fn() },
}));

beforeEach(() => jest.resetAllMocks());

describe('SalesReportService.getGroupTrend', () => {
  it('passes tenant and year through to the repository', async () => {
    (salesReportMtdRepository.aggregateTrendByYear as jest.Mock).mockResolvedValue([
      { month: 5, fyc_mtd: 1000, fyct_mtd: 1100 },
    ]);

    const result = await salesReportService.getGroupTrend({ tenantId: 't1', year: 2026 });

    expect(salesReportMtdRepository.aggregateTrendByYear).toHaveBeenCalledWith('t1', 2026);
    expect(result).toEqual([{ month: 5, fyc_mtd: 1000, fyct_mtd: 1100 }]);
  });
});
