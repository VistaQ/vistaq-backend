// Supply env vars before env.ts runs so the validation guards do not throw
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.FRONTEND_RESET_PASSWORD_URL = 'https://test.example.com/reset-password';

// ---------------------------------------------------------------------------
// LoggingService mock — must be registered before any imports that trigger side effects
// ---------------------------------------------------------------------------

const mockAsyncLocalStorage = {
  getStore: jest.fn().mockReturnValue(undefined),
};

jest.mock('@src/services/logging.service', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  loggingService: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  asyncLocalStorage: mockAsyncLocalStorage,
}));

// ---------------------------------------------------------------------------
// SupabaseService mock — prevent real client instantiation
// ---------------------------------------------------------------------------

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    adminSelect: jest.fn(),
    adminInsert: jest.fn(),
    adminUpdate: jest.fn(),
    adminDelete: jest.fn(),
  },
  supabaseService: {
    adminSelect: jest.fn(),
    adminInsert: jest.fn(),
    adminUpdate: jest.fn(),
    adminDelete: jest.fn(),
  },
}));

import type { Response, NextFunction } from 'express';

import { publicController } from '@src/controllers/public.controller';
import { groupService } from '@src/services/group.service';
import { RouteError } from '@src/models/errors/route.error';
import { ControllerError } from '@src/models/errors/layer.errors';
import { TenantNotFoundError } from '@src/models/errors/auth.errors';
import type { IBaseReq } from '@src/models/interfaces/base.interface';
import type { IPublicGroupItem } from '@src/controllers/public.controller';

/******************************************************************************
  Fixtures
******************************************************************************/

const mockGroups: IPublicGroupItem[] = [
  { id: '11111111-2222-3333-4444-555555555555', name: 'Alpha Squad' },
  { id: '22222222-3333-4444-5555-666666666666', name: 'Beta Team' },
];

/******************************************************************************
  Helpers
******************************************************************************/

function makeReq(headersOverride?: Record<string, unknown>): IBaseReq {
  const headers = headersOverride !== undefined
    ? headersOverride
    : { 'x-tenant-slug': 'acme' };
  return {
    headers,
    body: {},
  } as unknown as IBaseReq;
}

function makeRes(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

function makeNext(): jest.Mock {
  return jest.fn();
}

/******************************************************************************
  Test suite — PublicController.getGroups
******************************************************************************/

describe('PublicController.getGroups', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns HTTP 200 with { success: true, data: [...] } when header is valid and service returns groups', async () => {
    jest.spyOn(groupService, 'getActiveGroupsByTenantSlug').mockResolvedValue(mockGroups);

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await publicController.getGroups(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockGroups,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() with a RouteError (status 400) when X-Tenant-Slug header is missing', async () => {
    const req = makeReq({});
    const res = makeRes();
    const next = makeNext();

    await publicController.getGroups(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(400);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next() with a RouteError (status 400) when X-Tenant-Slug header is an array (not a string)', async () => {
    const req = makeReq({ 'x-tenant-slug': ['acme', 'other'] });
    const res = makeRes();
    const next = makeNext();

    await publicController.getGroups(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(400);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next() with a RouteError (status 404) when service throws TenantNotFoundError', async () => {
    jest.spyOn(groupService, 'getActiveGroupsByTenantSlug').mockRejectedValue(new TenantNotFoundError());

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await publicController.getGroups(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(404);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next() with a ControllerError when service throws an unexpected error', async () => {
    jest.spyOn(groupService, 'getActiveGroupsByTenantSlug').mockRejectedValue(
      new Error('unexpected db failure'),
    );

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await publicController.getGroups(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ControllerError);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('passes the tenant slug to groupService.getActiveGroupsByTenantSlug', async () => {
    const spy = jest.spyOn(groupService, 'getActiveGroupsByTenantSlug').mockResolvedValue([]);

    const req = makeReq({ 'x-tenant-slug': 'my-tenant' });
    const res = makeRes();
    const next = makeNext();

    await publicController.getGroups(req, res, next as NextFunction);

    expect(spy).toHaveBeenCalledWith('my-tenant');
  });
});
