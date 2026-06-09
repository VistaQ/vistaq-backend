// Supply env vars before env.ts runs so the validation guards do not throw
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.FRONTEND_RESET_PASSWORD_URL = 'https://test.example.com/reset-password';

// ---------------------------------------------------------------------------
// LoggingService mock — must be registered before any imports that trigger side effects
// ---------------------------------------------------------------------------

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
}));

// ---------------------------------------------------------------------------
// jsonwebtoken mock — each test configures decode behaviour individually
// ---------------------------------------------------------------------------

jest.mock('jsonwebtoken');

// ---------------------------------------------------------------------------
// supabaseService mock — each test configures verifyToken behaviour individually
// ---------------------------------------------------------------------------

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: { verifyToken: jest.fn() },
}));

// ---------------------------------------------------------------------------
// authService mock — each test configures getUserStatus behaviour individually
// ---------------------------------------------------------------------------

jest.mock('@src/services/auth.service', () => ({
  __esModule: true,
  default: { getUserStatus: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Sentry mock — prevent real Sentry initialisation
// ---------------------------------------------------------------------------

jest.mock('@sentry/node', () => ({
  withScope: jest.fn((cb) => cb({ setFingerprint: jest.fn(), setLevel: jest.fn(), setExtra: jest.fn() })),
  setTag: jest.fn(),
  setUser: jest.fn(),
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import supabaseService from '@src/services/supabase.service';
import authService from '@src/services/auth.service';
import { authenticate } from '@src/middleware/auth';
import { RouteError } from '@src/models/errors/route.error';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
  Helpers
******************************************************************************/

/** Build a decoded JWT payload with all required custom claims */
function validDecodedToken(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    user_id: 'user-abc-123',
    tenant_id: 'tenant-xyz-456',
    app_role: 'agent',
    ...overrides,
  };
}

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

/** Assert next was called once with a RouteError(401, 'Unauthorized') */
function expectUnauthorized(next: jest.Mock): void {
  expect(next).toHaveBeenCalledTimes(1);
  const arg: unknown = next.mock.calls[0][0];
  expect(arg).toBeInstanceOf(RouteError);
  expect((arg as RouteError).status).toBe(HttpStatusCodes.UNAUTHORIZED);
  expect((arg as RouteError).message).toBe('Unauthorized');
}

/** Set up mocks for a token that passes Supabase verification and JWT decode */
function setupValidTokenMocks(userId = 'user-abc-123'): void {
  (supabaseService.verifyToken as jest.Mock).mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  });
  (jwt.decode as jest.Mock).mockReturnValue(validDecodedToken({ user_id: userId }));
}

/******************************************************************************
  Tests — authenticate middleware (status check)
******************************************************************************/

describe('authenticate middleware — user status check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. User status is 'inactive' → next called with RouteError(401, 'Unauthorized')
  it('calls next with RouteError(UNAUTHORIZED) when user status is inactive', async () => {
    setupValidTokenMocks();
    (authService.getUserStatus as jest.Mock).mockResolvedValue('inactive');

    const req = buildReq('Bearer valid.token.here');
    const res = buildRes();
    const next = buildNext();

    await authenticate(req, res, next as NextFunction);

    expectUnauthorized(next);
    expect(res.status).not.toHaveBeenCalled();
  });

  // 2. User not found — getUserStatus returns null → next called with RouteError(401, 'Unauthorized')
  it('calls next with RouteError(UNAUTHORIZED) when getUserStatus returns null (user not found)', async () => {
    setupValidTokenMocks();
    (authService.getUserStatus as jest.Mock).mockResolvedValue(null);

    const req = buildReq('Bearer valid.token.here');
    const res = buildRes();
    const next = buildNext();

    await authenticate(req, res, next as NextFunction);

    expectUnauthorized(next);
    expect(res.status).not.toHaveBeenCalled();
  });

  // 3. User status is 'active' → next() called with no args, req.user populated
  it('calls next() with no arguments and populates req.user when user status is active', async () => {
    setupValidTokenMocks('user-abc-123');
    (authService.getUserStatus as jest.Mock).mockResolvedValue('active');

    const req = buildReq('Bearer valid.token.here');
    const res = buildRes();
    const next = buildNext();

    await authenticate(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(/* no args */);

    const typedReq = req as Request & { user: { id: string; tenant_id: string; role: string } };
    expect(typedReq.user).toEqual(expect.objectContaining({
      id: 'user-abc-123',
      tenant_id: 'tenant-xyz-456',
      role: 'agent',
    }));

    expect(res.status).not.toHaveBeenCalled();
  });

  // 4. getUserStatus throws unexpectedly → middleware catches and calls next with RouteError(401)
  it('calls next with RouteError(UNAUTHORIZED) when getUserStatus throws an unexpected error', async () => {
    setupValidTokenMocks();
    (authService.getUserStatus as jest.Mock).mockRejectedValue(new Error('DB connection failed'));

    const req = buildReq('Bearer valid.token.here');
    const res = buildRes();
    const next = buildNext();

    await authenticate(req, res, next as NextFunction);

    expectUnauthorized(next);
    expect(res.status).not.toHaveBeenCalled();
  });
});
