import { NextFunction, Response } from 'express';
import salesReportController, { IUploadReportReq } from '@src/controllers/salesReport.controller';
import salesReportService from '@src/services/salesReport.service';
import { InvalidEtlResultError } from '@src/models/errors/salesReport.errors';
import { RouteError } from '@src/models/errors/route.error';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

jest.mock('@src/services/salesReport.service', () => ({
  __esModule: true,
  default: { uploadReport: jest.fn(), getGroupSummary: jest.fn(), getGroupTrend: jest.fn() },
}));

const mkReq = (role: string): IUploadReportReq => ({
  user: { id: 'u-mgr', tenant_id: 't1', role },
  body: { etlResult: {
    source: 's',
    created_at: '2026-06-01T00:00:00Z',
    rows_loaded: 0,
    months_detected: ['MAY'],
    report_year: 2026,
    report_month: 5,
    records: [{ agentCode: 'A1', rowData: {} }],
  } },
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

});
