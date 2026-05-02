// Set env vars BEFORE importing
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-srk';
process.env.FRONTEND_RESET_PASSWORD_URL = process.env.FRONTEND_RESET_PASSWORD_URL || 'http://test/reset';
process.env.ETL_SERVICE_URL = process.env.ETL_SERVICE_URL || 'http://etl';
process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'test-key';
process.env.BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || 'http://api';

import { NextFunction, Response } from 'express';
import reportJobController, {
  ICreateJobReq, IGetJobReq, IRetryJobReq, ICompleteJobReq,
} from '@src/controllers/reportJob.controller';
import reportJobService from '@src/services/reportJob.service';
import { ReportJobNotFoundError, JobNotRetryableError } from '@src/models/errors/reportJob.errors';
import { RouteError } from '@src/models/errors/route.error';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

jest.mock('@src/services/reportJob.service', () => ({
  __esModule: true,
  default: {
    createJob: jest.fn(), completeJob: jest.fn(),
    getJob: jest.fn(), retryJob: jest.fn(),
  },
}));

const mkRes = () => {
  const res = {} as Partial<Response>;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res as Response;
};

beforeEach(() => jest.resetAllMocks());

describe('ReportJobController.create', () => {
  const baseReq = (role: string): ICreateJobReq => ({
    user: { id: 'u1', tenant_id: 't1', role },
    body: { reportYear: 2026, reportMonth: 5 },
    file: {
      buffer: Buffer.from('x'),
      originalname: 'May.xlsx',
      size: 1,
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    } as never,
  } as unknown as ICreateJobReq);

  it('returns 202 with jobId on success', async () => {
    (reportJobService.createJob as jest.Mock).mockResolvedValue({ id: 'j1' });
    const res = mkRes();
    const next = jest.fn() as NextFunction;

    await reportJobController.create(baseReq('group_leader'), res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.ACCEPTED);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { jobId: 'j1' } });
  });

  it('returns 403 for non-manager', async () => {
    const res = mkRes();
    const next = jest.fn() as unknown as NextFunction;
    await reportJobController.create(baseReq('agent'), res, next);
    const err = (next as jest.Mock).mock.calls[0][0] as RouteError;
    expect(err.status).toBe(HttpStatusCodes.FORBIDDEN);
  });

  it('returns 400 when no file is attached', async () => {
    const req = { ...baseReq('group_leader'), file: undefined } as unknown as ICreateJobReq;
    const res = mkRes();
    const next = jest.fn() as unknown as NextFunction;
    await reportJobController.create(req, res, next);
    const err = (next as jest.Mock).mock.calls[0][0] as RouteError;
    expect(err.status).toBe(HttpStatusCodes.BAD_REQUEST);
  });
});

describe('ReportJobController.complete', () => {
  const req = (status: 'success' | 'failed'): ICompleteJobReq => ({
    params: { jobId: 'j1' },
    body: status === 'success'
      ? { status, etl_result: { source: 's', records: [] } }
      : { status, error: 'crashed' },
  } as unknown as ICompleteJobReq);

  it('returns 204 on success-path completion', async () => {
    (reportJobService.completeJob as jest.Mock).mockResolvedValue(undefined);
    const res = mkRes();
    const next = jest.fn() as NextFunction;

    await reportJobController.complete(req('success'), res, next);

    expect(reportJobService.completeJob).toHaveBeenCalledWith({
      jobId: 'j1', status: 'success', etlResult: { source: 's', records: [] },
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.NO_CONTENT);
  });

  it('returns 204 on failed-path completion', async () => {
    (reportJobService.completeJob as jest.Mock).mockResolvedValue(undefined);
    const res = mkRes();
    const next = jest.fn() as NextFunction;

    await reportJobController.complete(req('failed'), res, next);

    expect(reportJobService.completeJob).toHaveBeenCalledWith({
      jobId: 'j1', status: 'failed', error: 'crashed',
    });
  });

  it('maps ReportJobNotFoundError to 404', async () => {
    (reportJobService.completeJob as jest.Mock).mockRejectedValue(new ReportJobNotFoundError());
    const res = mkRes();
    const next = jest.fn() as unknown as NextFunction;
    await reportJobController.complete(req('success'), res, next);
    const err = (next as jest.Mock).mock.calls[0][0] as RouteError;
    expect(err.status).toBe(HttpStatusCodes.NOT_FOUND);
  });
});

describe('ReportJobController.getById', () => {
  const req = (role: string): IGetJobReq => ({
    user: { id: 'u1', tenant_id: 't1', role },
    params: { jobId: 'j1' },
  } as unknown as IGetJobReq);

  it('returns 200 with the job', async () => {
    const job = { id: 'j1', tenant_id: 't1', status: 'completed' };
    (reportJobService.getJob as jest.Mock).mockResolvedValue(job);
    const res = mkRes();
    const next = jest.fn() as NextFunction;

    await reportJobController.getById(req('group_leader'), res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: job });
  });

  it('returns 403 for non-manager', async () => {
    const res = mkRes();
    const next = jest.fn() as unknown as NextFunction;
    await reportJobController.getById(req('agent'), res, next);
    const err = (next as jest.Mock).mock.calls[0][0] as RouteError;
    expect(err.status).toBe(HttpStatusCodes.FORBIDDEN);
  });

  it('returns 404 when job not found', async () => {
    (reportJobService.getJob as jest.Mock).mockRejectedValue(new ReportJobNotFoundError());
    const res = mkRes();
    const next = jest.fn() as unknown as NextFunction;
    await reportJobController.getById(req('group_leader'), res, next);
    const err = (next as jest.Mock).mock.calls[0][0] as RouteError;
    expect(err.status).toBe(HttpStatusCodes.NOT_FOUND);
  });

  it('returns 403 when job belongs to another tenant', async () => {
    (reportJobService.getJob as jest.Mock).mockResolvedValue({
      id: 'j1', tenant_id: 'other-tenant', status: 'completed',
    });
    const res = mkRes();
    const next = jest.fn() as unknown as NextFunction;
    await reportJobController.getById(req('group_leader'), res, next);
    const err = (next as jest.Mock).mock.calls[0][0] as RouteError;
    expect(err.status).toBe(HttpStatusCodes.FORBIDDEN);
  });
});

describe('ReportJobController.retry', () => {
  const req = (role: string): IRetryJobReq => ({
    user: { id: 'u1', tenant_id: 't1', role },
    params: { jobId: 'j1' },
  } as unknown as IRetryJobReq);

  it('returns 202 on success', async () => {
    (reportJobService.getJob as jest.Mock).mockResolvedValue({ id: 'j1', tenant_id: 't1', status: 'failed' });
    (reportJobService.retryJob as jest.Mock).mockResolvedValue(undefined);
    const res = mkRes();
    const next = jest.fn() as NextFunction;

    await reportJobController.retry(req('group_leader'), res, next);

    expect(reportJobService.retryJob).toHaveBeenCalledWith('j1');
    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.ACCEPTED);
  });

  it('maps JobNotRetryableError to 409 Conflict', async () => {
    (reportJobService.getJob as jest.Mock).mockResolvedValue({ id: 'j1', tenant_id: 't1', status: 'completed' });
    (reportJobService.retryJob as jest.Mock).mockRejectedValue(new JobNotRetryableError());
    const res = mkRes();
    const next = jest.fn() as unknown as NextFunction;

    await reportJobController.retry(req('group_leader'), res, next);

    const err = (next as jest.Mock).mock.calls[0][0] as RouteError;
    expect(err.status).toBe(HttpStatusCodes.CONFLICT);
  });
});
