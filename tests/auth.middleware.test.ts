import type { NextFunction, Request, Response } from 'express';

/******************************************************************************
  Mocks — must be set up before any module under test is imported
******************************************************************************/

// Mock EnvVars so the env validation guards don't throw during import
jest.mock('@src/utils/env', () => ({
  __esModule: true,
  default: {
    NodeEnv: 'test',
    Port: 3000,
    SupabaseUrl: 'https://mock.supabase.co',
    SupabaseAnonKey: 'mock-anon-key',
    SupabaseServiceRoleKey: 'mock-service-role-key',
  },
  NodeEnvs: { DEV: 'development', TEST: 'test', PRODUCTION: 'production' },
}));

// Mock loggingService to suppress all output during tests
jest.mock('@src/services/logging.service', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock jsonwebtoken — each test configures decode behaviour individually
jest.mock('jsonwebtoken');

// Mock supabaseService — each test configures verifyToken behaviour individually
jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: { verifyToken: jest.fn() },
}));

// Mock authService — each test configures getUserStatus behaviour individually
jest.mock('@src/services/auth.service', () => ({
  __esModule: true,
  default: { getUserStatus: jest.fn() },
}));

import jwt from 'jsonwebtoken';
import supabaseService from '@src/services/supabase.service';
import authService from '@src/services/auth.service';
import { authenticate } from '@src/middleware/auth';
import { RouteError } from '@src/models/errors/route.error';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
  Helpers
******************************************************************************/

function buildReq(authHeader?: string): Request {
  return {
    headers: authHeader !== undefined ? { authorization: authHeader } : {},
  } as unknown as Request;
}

function buildRes(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
}

function buildNext(): jest.Mock {
  return jest.fn() as jest.Mock;
}

function expectUnauthorizedRouteError(next: jest.Mock): void {
  expect(next).toHaveBeenCalledTimes(1);
  const arg: unknown = next.mock.calls[0][0];
  expect(arg).toBeInstanceOf(RouteError);
  expect((arg as RouteError).status).toBe(HttpStatusCodes.UNAUTHORIZED);
  expect((arg as RouteError).message).toBe('Unauthorized');
}

/******************************************************************************
  Tests
******************************************************************************/

describe('authenticate middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Missing Authorization header
  it('calls next with RouteError(UNAUTHORIZED) when Authorization header is missing', async () => {
    const req = buildReq(); // no authorization header
    const res = buildRes();
    const next = buildNext();

    await authenticate(req, res, next);

    expectUnauthorizedRouteError(next);
  });

  // 2. Non-Bearer Authorization header
  it('calls next with RouteError(UNAUTHORIZED) when Authorization header is not Bearer scheme', async () => {
    const req = buildReq('Basic dXNlcjpwYXNz');
    const res = buildRes();
    const next = buildNext();

    await authenticate(req, res, next);

    expectUnauthorizedRouteError(next);
  });

  // 3. supabaseService.verifyToken returns an error
  it('calls next with RouteError(UNAUTHORIZED) when supabaseService.verifyToken returns an error', async () => {
    (supabaseService.verifyToken as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: new Error('invalid token'),
    });

    const req = buildReq('Bearer some.token.here');
    const res = buildRes();
    const next = buildNext();

    await authenticate(req, res, next);

    expectUnauthorizedRouteError(next);
  });

  // 4. supabaseService.verifyToken returns { user: null } with no error
  it('calls next with RouteError(UNAUTHORIZED) when supabaseService.verifyToken returns { user: null }', async () => {
    (supabaseService.verifyToken as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const req = buildReq('Bearer some.token.here');
    const res = buildRes();
    const next = buildNext();

    await authenticate(req, res, next);

    expectUnauthorizedRouteError(next);
  });

  // 5. jwt.decode returns null
  it('calls next with RouteError(UNAUTHORIZED) when jwt.decode returns null', async () => {
    (supabaseService.verifyToken as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    (jwt.decode as jest.Mock).mockReturnValue(null);

    const req = buildReq('Bearer valid.token.here');
    const res = buildRes();
    const next = buildNext();

    await authenticate(req, res, next);

    expectUnauthorizedRouteError(next);
  });

  // 6. Decoded token missing required claims (app_role absent)
  it('calls next with RouteError(UNAUTHORIZED) when decoded token is missing required claims', async () => {
    (supabaseService.verifyToken as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    (jwt.decode as jest.Mock).mockReturnValue({
      user_id: 'user-123',
      tenant_id: 'tenant-456',
      // app_role intentionally omitted
    });

    const req = buildReq('Bearer valid.but.incomplete');
    const res = buildRes();
    const next = buildNext();

    await authenticate(req, res, next);

    expectUnauthorizedRouteError(next);
  });

  // 7. Valid token with all claims → req.user populated, next() called with no args
  it('attaches req.user and calls next() with no arguments when token is valid', async () => {
    (supabaseService.verifyToken as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-abc-123' } },
      error: null,
    });
    (jwt.decode as jest.Mock).mockReturnValue({
      user_id: 'user-abc-123',
      tenant_id: 'tenant-xyz-456',
      app_role: 'agent',
    });
    (authService.getUserStatus as jest.Mock).mockResolvedValue('active');

    const req = buildReq('Bearer valid.token.here');
    const res = buildRes();
    const next = buildNext();

    await authenticate(req, res, next);

    // next() called exactly once with no arguments
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();

    // req.user populated from decoded claims
    const typedReq = req as Request & { user: { id: string; tenant_id: string; role: string } };
    expect(typedReq.user).toEqual(expect.objectContaining({
      id: 'user-abc-123',
      tenant_id: 'tenant-xyz-456',
      role: 'agent',
    }));
  });
});
