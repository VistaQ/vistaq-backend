import { NextFunction, Response } from 'express';
import salesReportController, {
  IGetMyYearReportReq,
  IGetUploadAuditReq,
  IGetYearReportsReq,
  IIngestReportReq,
  IUploadReportReq,
} from '@src/controllers/salesReport.controller';
import salesReportService from '@src/services/salesReport.service';
import {
  InvalidEtlResultError,
  NonConsecutiveUploadError,
} from '@src/models/errors/salesReport.errors';
import { RouteError } from '@src/models/errors/route.error';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

jest.mock('@src/services/salesReport.service', () => ({
  __esModule: true,
  default: {
    uploadReport: jest.fn(),
    getYearReports: jest.fn(),
    getMyYearReport: jest.fn(),
    getUploadAudit: jest.fn(),
  },
}));

const mkReq = (role: string): IUploadReportReq => ({
  user: { id: 'u-mgr', tenant_id: 't1', role },
  body: {
    report_year: 2026,
    report_month: 5,
    etlResult: {
      source: 's',
      created_at: '2026-06-01T00:00:00Z',
      rows_loaded: 0,
      months_detected: ['MAY'],
      records: [{ agentCode: 'A1', rowData: {} }],
    },
  },
} as unknown as IUploadReportReq);

const mkRes = () => {
  const res = {} as Partial<Response>;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

beforeEach(() => jest.resetAllMocks());

describe('SalesReportController.upload', () => {
  it('returns 200 + result on success', async () => {
    (salesReportService.uploadReport as jest.Mock).mockResolvedValue({
      batchId: 'b1', processed: 1, skipped: 0, errors: [],
    });
    const res = mkRes();
    const next = jest.fn() as NextFunction;

    await salesReportController.upload(mkReq('group_leader'), res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({ batchId: 'b1' }) });
  });

  it('returns 403 when role is not group_leader/admin/master_trainer', async () => {
    const res = mkRes();
    const next = jest.fn() as unknown as NextFunction;
    await salesReportController.upload(mkReq('agent'), res, next);
    expect(next).toHaveBeenCalledWith(expect.any(RouteError));
    const err = (next as jest.Mock).mock.calls[0][0] as RouteError;
    expect(err.status).toBe(HttpStatusCodes.FORBIDDEN);
  });

  it('maps InvalidEtlResultError to 400', async () => {
    (salesReportService.uploadReport as jest.Mock).mockRejectedValue(new InvalidEtlResultError());
    const res = mkRes();
    const next = jest.fn() as unknown as NextFunction;
    await salesReportController.upload(mkReq('group_leader'), res, next);
    const err = (next as jest.Mock).mock.calls[0][0] as RouteError;
    expect(err.status).toBe(HttpStatusCodes.BAD_REQUEST);
  });

  it('maps NonConsecutiveUploadError to 409 Conflict', async () => {
    (salesReportService.uploadReport as jest.Mock).mockRejectedValue(
      new NonConsecutiveUploadError('Cannot upload 2026-04. Latest uploaded is 2026-02; next must be 3.'),
    );
    const res = mkRes();
    const next = jest.fn() as unknown as NextFunction;
    await salesReportController.upload(mkReq('group_leader'), res, next);
    const err = (next as jest.Mock).mock.calls[0][0] as RouteError;
    expect(err.status).toBe(HttpStatusCodes.CONFLICT);
    expect(err.message).toMatch(/^Cannot upload 2026-04/);
  });

});

const mkIngestReq = (overrides: Partial<IIngestReportReq['body']> = {}): IIngestReportReq => ({
  body: {
    tenant_id: 't1',
    report_year: 2026,
    report_month: 5,
    etl_result: {
      source: 's',
      created_at: '2026-06-01T00:00:00Z',
      rows_loaded: 0,
      months_detected: ['MAY'],
      records: [{ agentCode: 'A1', rowData: {} }],
    },
    ...overrides,
  },
} as unknown as IIngestReportReq);

describe('SalesReportController.ingest', () => {
  it('returns 200 + result on success and forwards uploadedBy: null to the service', async () => {
    (salesReportService.uploadReport as jest.Mock).mockResolvedValue({
      batchId: 'b1', processed: 1, skipped: 0, errors: [],
    });
    const res = mkRes();
    const next = jest.fn() as NextFunction;

    await salesReportController.ingest(mkIngestReq(), res, next);

    expect(salesReportService.uploadReport).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        uploadedBy: null,
        reportYear: 2026,
        reportMonth: 5,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ batchId: 'b1' }),
    });
  });

  it('maps InvalidEtlResultError to 400', async () => {
    (salesReportService.uploadReport as jest.Mock).mockRejectedValue(new InvalidEtlResultError());
    const res = mkRes();
    const next = jest.fn() as unknown as NextFunction;

    await salesReportController.ingest(mkIngestReq(), res, next);

    const err = (next as jest.Mock).mock.calls[0][0] as RouteError;
    expect(err.status).toBe(HttpStatusCodes.BAD_REQUEST);
  });

  it('maps NonConsecutiveUploadError to 409 Conflict', async () => {
    (salesReportService.uploadReport as jest.Mock).mockRejectedValue(
      new NonConsecutiveUploadError('Cannot upload 2026-04. Latest uploaded is 2026-02; next must be 3.'),
    );
    const res = mkRes();
    const next = jest.fn() as unknown as NextFunction;

    await salesReportController.ingest(mkIngestReq(), res, next);

    const err = (next as jest.Mock).mock.calls[0][0] as RouteError;
    expect(err.status).toBe(HttpStatusCodes.CONFLICT);
    expect(err.message).toMatch(/^Cannot upload 2026-04/);
  });
});

const mkGetYearReq = (role: string): IGetYearReportsReq => ({
  user: { id: 'u-mgr', tenant_id: 't1', role },
  query: { year: '2026' },
} as unknown as IGetYearReportsReq);

describe('SalesReportController.getYearReports', () => {
  it('returns 200 with the array of reports', async () => {
    (salesReportService.getYearReports as jest.Mock).mockResolvedValue([
      { id: 'r1', agent_id: 'u1' },
    ]);
    const res = mkRes();
    const next = jest.fn() as NextFunction;

    await salesReportController.getYearReports(mkGetYearReq('group_leader'), res, next);

    expect(salesReportService.getYearReports).toHaveBeenCalledWith({
      tenantId: 't1', year: 2026,
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [{ id: 'r1', agent_id: 'u1' }],
    });
  });

  it('returns 403 for non-manager roles', async () => {
    const res = mkRes();
    const next = jest.fn() as unknown as NextFunction;

    await salesReportController.getYearReports(mkGetYearReq('agent'), res, next);

    const err = (next as jest.Mock).mock.calls[0][0] as RouteError;
    expect(err.status).toBe(HttpStatusCodes.FORBIDDEN);
    expect(salesReportService.getYearReports).not.toHaveBeenCalled();
  });
});

const mkGetMeReq = (): IGetMyYearReportReq => ({
  user: { id: 'u1', tenant_id: 't1', role: 'agent' },
  query: { year: '2026' },
} as unknown as IGetMyYearReportReq);

describe('SalesReportController.getMyYearReport', () => {
  it('returns 200 with the report when found', async () => {
    (salesReportService.getMyYearReport as jest.Mock).mockResolvedValue({
      id: 'r1', agent_id: 'u1', agent_name: 'Alice',
    });
    const res = mkRes();
    const next = jest.fn() as NextFunction;

    await salesReportController.getMyYearReport(mkGetMeReq(), res, next);

    expect(salesReportService.getMyYearReport).toHaveBeenCalledWith({
      tenantId: 't1', userId: 'u1', year: 2026,
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ id: 'r1' }),
    });
  });

  it('returns 404 with the documented message when no YTD row exists for the user/year', async () => {
    (salesReportService.getMyYearReport as jest.Mock).mockResolvedValue(null);
    const res = mkRes();
    const next = jest.fn() as NextFunction;

    await salesReportController.getMyYearReport(mkGetMeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.NOT_FOUND);
    expect(res.json).toHaveBeenCalledWith({ message: 'No sales report for this year' });
  });
});

const mkAuditReq = (
  role: string,
  query: { year: string; page?: string; pageSize?: string } = { year: '2026' },
): IGetUploadAuditReq =>
  ({
    user: { id: 'u-mgr', tenant_id: 't1', role },
    query,
  }) as unknown as IGetUploadAuditReq;

describe('SalesReportController.getUploadAudit', () => {
  it('returns 200 with data + meta on success', async () => {
    (salesReportService.getUploadAudit as jest.Mock).mockResolvedValue({
      data: [{ id: 'b1', uploader_name: 'Jane' }],
      meta: { page: 1, pageSize: 50, total: 1 },
    });
    const res = mkRes();
    const next = jest.fn() as NextFunction;

    await salesReportController.getUploadAudit(mkAuditReq('admin'), res, next);

    expect(salesReportService.getUploadAudit).toHaveBeenCalledWith({
      tenantId: 't1', year: 2026, page: 1, pageSize: 50,
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [{ id: 'b1', uploader_name: 'Jane' }],
      meta: { page: 1, pageSize: 50, total: 1 },
    });
  });

  it('coerces query page/pageSize to numbers when supplied', async () => {
    (salesReportService.getUploadAudit as jest.Mock).mockResolvedValue({
      data: [],
      meta: { page: 2, pageSize: 25, total: 0 },
    });
    const res = mkRes();
    const next = jest.fn() as NextFunction;

    await salesReportController.getUploadAudit(
      mkAuditReq('admin', { year: '2026', page: '2', pageSize: '25' }),
      res,
      next,
    );

    expect(salesReportService.getUploadAudit).toHaveBeenCalledWith({
      tenantId: 't1', year: 2026, page: 2, pageSize: 25,
    });
  });

  it('returns 403 for non-manager roles', async () => {
    const res = mkRes();
    const next = jest.fn() as unknown as NextFunction;

    await salesReportController.getUploadAudit(mkAuditReq('agent'), res, next);

    const err = (next as jest.Mock).mock.calls[0][0] as RouteError;
    expect(err.status).toBe(HttpStatusCodes.FORBIDDEN);
    expect(salesReportService.getUploadAudit).not.toHaveBeenCalled();
  });
});
