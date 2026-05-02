import salesReportService from '@src/services/salesReport.service';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';

jest.mock('@src/repositories/salesReportYtd.repository', () => ({
  __esModule: true,
  default: { findByTenantYearMonthWithUser: jest.fn() },
}));

beforeEach(() => jest.resetAllMocks());

describe('SalesReportService.getGroupSummary', () => {
  it('aggregates summary, sorts agents by fyc DESC', async () => {
    (salesReportYtdRepository.findByTenantYearMonthWithUser as jest.Mock).mockResolvedValue([
      { user_id: 'u1', name: 'Alice', agent_code: 'A1', fyct: 100, fyc: 90,  fyc_pct: 0.5, ace: 200, noc: 5, mdrt_shortage_fyc: 10 },
      { user_id: 'u2', name: 'Bob',   agent_code: 'A2', fyct: 200, fyc: 180, fyc_pct: 0.9, ace: 400, noc: 9, mdrt_shortage_fyc: 20 },
    ]);

    const result = await salesReportService.getGroupSummary({ tenantId: 't1', year: 2026, month: 5 });

    expect(result.agents.map((a) => a.user_id)).toEqual(['u2', 'u1']);
    expect(result.summary).toEqual({
      fyct_ytd: 300,
      fyc_ytd: 270,
      ace_ytd: 600,
      noc_ytd: 14,
      fyc_pct_avg: 0.7,
      fyct_pct_avg: 0,   // not in data shape for this aggregate; computed from fyc_pct only
      agent_count: 2,
      noc_per_agent: 7,
    });
  });

  it('returns empty summary when no agents have YTD rows', async () => {
    (salesReportYtdRepository.findByTenantYearMonthWithUser as jest.Mock).mockResolvedValue([]);

    const result = await salesReportService.getGroupSummary({ tenantId: 't1', year: 2026, month: 5 });

    expect(result.agents).toEqual([]);
    expect(result.summary.agent_count).toBe(0);
    expect(result.summary.fyc_pct_avg).toBe(0);
    expect(result.summary.noc_per_agent).toBe(0);
  });
});
