import salesReportService from '@src/services/salesReport.service';
import salesReportMtdRepository from '@src/repositories/salesReportMtd.repository';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';
import uploadBatchRepository from '@src/repositories/uploadBatch.repository';
import userRepository from '@src/repositories/user.repository';

jest.mock('@src/repositories/salesReportYtd.repository', () => ({
  __esModule: true,
  default: {
    findLatestYtdPerUserByTenantYear: jest.fn(),
    findLatestYtdForUserYear: jest.fn(),
  },
}));
jest.mock('@src/repositories/salesReportMtd.repository', () => ({
  __esModule: true,
  default: {
    findAceNocByTenantYear: jest.fn(),
    findFycByTenantYear: jest.fn(),
  },
}));
jest.mock('@src/repositories/user.repository', () => ({
  __esModule: true,
  default: { findIdNameAgentCodeByIds: jest.fn() },
}));
jest.mock('@src/repositories/uploadBatch.repository', () => ({
  __esModule: true,
  default: { findPaginatedAuditByTenant: jest.fn() },
}));

beforeEach(() => jest.resetAllMocks());

describe('SalesReportService.getYearReports', () => {
  it('returns one ISalesReport per agent with monthly arrays populated', async () => {
    (salesReportYtdRepository.findLatestYtdPerUserByTenantYear as jest.Mock).mockResolvedValue([
      {
        id: 'ytd-u1', user_id: 'u1', year: 2026, month: 3,
        ace: 620000, noc: 18, fyct: 295000, fyct_pct: 0.0132, mdrt_shortage_fyct: 393112.13,
        fyc: 1222.11, fyc_pct: 0.0092, mdrt_shortage_fyc: 131577.89,
        created_at: '2026-04-29T16:01:33.000Z',
        updated_at: '2026-04-30T08:15:00.000Z',
      },
    ]);
    (salesReportMtdRepository.findAceNocByTenantYear as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 3, ace: 9118.64, noc: 7 },
    ]);
    (salesReportMtdRepository.findFycByTenantYear as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 3, fyc_mtd: 1222.11, fyct_mtd: 5287.87 },
    ]);
    (userRepository.findIdNameAgentCodeByIds as jest.Mock).mockResolvedValue([
      { id: 'u1', name: 'MELISSA ADLINA', agent_code: 'T75040K' },
    ]);

    const out = await salesReportService.getYearReports({ tenantId: 't1', year: 2026, scope: { type: 'all' } });

    expect(out).toHaveLength(1);
    const r = out[0];
    expect(r.id).toBe('ytd-u1');
    expect(r.agent_id).toBe('u1');
    expect(r.agent_code).toBe('T75040K');
    expect(r.agent_name).toBe('MELISSA ADLINA');
    expect(r.year).toBe(2026);
    expect(r.imported_at).toBe('2026-04-30T08:15:00.000Z');
    expect(r.ace_ytd).toBe(620000);
    expect(r.fyct_pct).toBeCloseTo(0.0132);
    expect(r.month_ace).toEqual([0, 0, 9118.64, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.month_noc).toEqual([0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.month_fyct).toEqual([0, 0, 5287.87, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.month_fyc).toEqual([0, 0, 1222.11, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('returns empty array when no agents have YTD rows for the year', async () => {
    (salesReportYtdRepository.findLatestYtdPerUserByTenantYear as jest.Mock).mockResolvedValue([]);

    const out = await salesReportService.getYearReports({ tenantId: 't1', year: 2026, scope: { type: 'all' } });

    expect(out).toEqual([]);
    // Other repos must not be called when there are no users to decorate.
    expect(salesReportMtdRepository.findAceNocByTenantYear).not.toHaveBeenCalled();
    expect(salesReportMtdRepository.findFycByTenantYear).not.toHaveBeenCalled();
    expect(userRepository.findIdNameAgentCodeByIds).not.toHaveBeenCalled();
  });

  it('short-circuits to [] without DB calls when scope.groupIds is empty', async () => {
    const out = await salesReportService.getYearReports({
      tenantId: 't1',
      year: 2026,
      scope: { type: 'group_ids', groupIds: [] },
    });

    expect(out).toEqual([]);
    expect(salesReportYtdRepository.findLatestYtdPerUserByTenantYear).not.toHaveBeenCalled();
    expect(salesReportMtdRepository.findAceNocByTenantYear).not.toHaveBeenCalled();
    expect(salesReportMtdRepository.findFycByTenantYear).not.toHaveBeenCalled();
    expect(userRepository.findIdNameAgentCodeByIds).not.toHaveBeenCalled();
  });

  it('passes groupIds through to userRepository and drops out-of-scope YTD rows', async () => {
    (salesReportYtdRepository.findLatestYtdPerUserByTenantYear as jest.Mock).mockResolvedValue([
      {
        id: 'ytd-u1', user_id: 'u1', year: 2026, month: 3,
        ace: 0, noc: 0, fyct: 0, fyct_pct: 0, mdrt_shortage_fyct: 0,
        fyc: 0, fyc_pct: 0, mdrt_shortage_fyc: 0,
        created_at: '2026-04-29T16:01:33.000Z',
        updated_at: '2026-04-29T16:01:33.000Z',
      },
      {
        id: 'ytd-u2', user_id: 'u2', year: 2026, month: 3,
        ace: 0, noc: 0, fyct: 0, fyct_pct: 0, mdrt_shortage_fyct: 0,
        fyc: 0, fyc_pct: 0, mdrt_shortage_fyc: 0,
        created_at: '2026-04-29T16:01:33.000Z',
        updated_at: '2026-04-29T16:01:33.000Z',
      },
    ]);
    (salesReportMtdRepository.findAceNocByTenantYear as jest.Mock).mockResolvedValue([]);
    (salesReportMtdRepository.findFycByTenantYear as jest.Mock).mockResolvedValue([]);
    // Only u1 matches the supplied groupIds — u2 is filtered out at the user query.
    (userRepository.findIdNameAgentCodeByIds as jest.Mock).mockResolvedValue([
      { id: 'u1', name: 'Alice', agent_code: 'A1' },
    ]);

    const out = await salesReportService.getYearReports({
      tenantId: 't1',
      year: 2026,
      scope: { type: 'group_ids', groupIds: ['g1', 'g2'] },
    });

    expect(userRepository.findIdNameAgentCodeByIds).toHaveBeenCalledWith(
      ['u1', 'u2'],
      ['g1', 'g2'],
    );
    expect(out).toHaveLength(1);
    expect(out[0].agent_id).toBe('u1');
  });

  it('falls back to empty agent_name/agent_code when the user row is missing', async () => {
    (salesReportYtdRepository.findLatestYtdPerUserByTenantYear as jest.Mock).mockResolvedValue([
      {
        id: 'ytd-u1', user_id: 'u-orphan', year: 2026, month: 3,
        ace: 0, noc: 0, fyct: 0, fyct_pct: 0, mdrt_shortage_fyct: 0,
        fyc: 0, fyc_pct: 0, mdrt_shortage_fyc: 0,
        created_at: '2026-04-29T16:01:33.000Z',
        updated_at: '2026-04-29T16:01:33.000Z',
      },
    ]);
    (salesReportMtdRepository.findAceNocByTenantYear as jest.Mock).mockResolvedValue([]);
    (salesReportMtdRepository.findFycByTenantYear as jest.Mock).mockResolvedValue([]);
    (userRepository.findIdNameAgentCodeByIds as jest.Mock).mockResolvedValue([]);

    const out = await salesReportService.getYearReports({ tenantId: 't1', year: 2026, scope: { type: 'all' } });

    expect(out[0].agent_name).toBe('');
    expect(out[0].agent_code).toBe('');
  });
});

describe('SalesReportService.getMyYearReport', () => {
  it('returns null when the caller has no YTD row for the year', async () => {
    (salesReportYtdRepository.findLatestYtdForUserYear as jest.Mock).mockResolvedValue(null);

    const out = await salesReportService.getMyYearReport({
      tenantId: 't1', userId: 'u1', year: 2026,
    });

    expect(out).toBeNull();
    expect(salesReportMtdRepository.findAceNocByTenantYear).not.toHaveBeenCalled();
  });

  it('returns the assembled report when a YTD row exists', async () => {
    (salesReportYtdRepository.findLatestYtdForUserYear as jest.Mock).mockResolvedValue({
      id: 'ytd-u1', user_id: 'u1', year: 2026, month: 5,
      ace: 100, noc: 5, fyct: 80, fyct_pct: 0.4, mdrt_shortage_fyct: 20,
      fyc: 70, fyc_pct: 0.35, mdrt_shortage_fyc: 30,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-02T10:00:00Z',
    });
    (salesReportMtdRepository.findAceNocByTenantYear as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 1, ace: 10, noc: 1 },
      { user_id: 'u1', month: 5, ace: 30, noc: 2 },
    ]);
    (salesReportMtdRepository.findFycByTenantYear as jest.Mock).mockResolvedValue([
      { user_id: 'u1', month: 5, fyc_mtd: 35, fyct_mtd: 40 },
    ]);
    (userRepository.findIdNameAgentCodeByIds as jest.Mock).mockResolvedValue([
      { id: 'u1', name: 'Alice', agent_code: 'A1' },
    ]);

    const out = await salesReportService.getMyYearReport({
      tenantId: 't1', userId: 'u1', year: 2026,
    });

    expect(out).not.toBeNull();
    expect(out!.agent_name).toBe('Alice');
    expect(out!.month_ace[0]).toBe(10);
    expect(out!.month_ace[4]).toBe(30);
    expect(out!.month_fyc[4]).toBe(35);
    // Per-user filter must be passed through to the MTD repos.
    expect(salesReportMtdRepository.findAceNocByTenantYear).toHaveBeenCalledWith('t1', 2026, ['u1']);
    expect(salesReportMtdRepository.findFycByTenantYear).toHaveBeenCalledWith('t1', 2026, ['u1']);
  });
});

describe('SalesReportService.getUploadAudit', () => {
  it('forwards page/pageSize to the repository and returns its result', async () => {
    (uploadBatchRepository.findPaginatedAuditByTenant as jest.Mock).mockResolvedValue({
      data: [{ id: 'b1' }],
      meta: { page: 2, pageSize: 25, total: 30 },
    });

    const out = await salesReportService.getUploadAudit({
      tenantId: 't1', year: 2026, page: 2, pageSize: 25,
    });

    expect(uploadBatchRepository.findPaginatedAuditByTenant).toHaveBeenCalledWith(
      't1', 2026, 2, 25,
    );
    expect(out.meta.total).toBe(30);
  });
});
