// Supply env vars before env.ts runs so the validation guards do not throw
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

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
// SupabaseService mock — prevent real client instantiation
// ---------------------------------------------------------------------------

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    adminSelect: jest.fn(),
    adminInsert: jest.fn(),
    adminUpdate: jest.fn(),
    adminDelete: jest.fn(),
    adminCreateAuthUser: jest.fn(),
    adminDeleteAuthUser: jest.fn(),
    signInWithPassword: jest.fn(),
    signOut: jest.fn(),
  },
  supabaseService: {
    adminSelect: jest.fn(),
    adminInsert: jest.fn(),
    adminUpdate: jest.fn(),
    adminDelete: jest.fn(),
    adminCreateAuthUser: jest.fn(),
    adminDeleteAuthUser: jest.fn(),
    signInWithPassword: jest.fn(),
    signOut: jest.fn(),
  },
}));

import type { Response, NextFunction } from 'express';

import { authController } from '@src/controllers/auth.controller';
import type { IRegisterReq, ILoginReq, ILogoutReq } from '@src/controllers/auth.controller';
import { authService } from '@src/services/auth.service';
import { RouteError } from '@src/models/errors/route.error';
import { ControllerError } from '@src/models/errors/layer.errors';
import { TenantNotFoundError, AgentCodeInvalidError, InvalidCredentialsError } from '@src/models/errors/auth.errors';
import type { IUser } from '@src/types/auth.types';

/******************************************************************************
  Fixtures
******************************************************************************/

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = 'ffffffff-0000-1111-2222-333333333333';
const GROUP_ID = '99999999-aaaa-bbbb-cccc-dddddddddddd';

const mockUser: IUser = {
  id: USER_ID,
  tenant_id: TENANT_ID,
  email: 'jane.doe@example.com',
  name: 'Jane Doe',
  role: 'agent',
  agent_code: 'AGT-001',
  location: 'Sydney',
  group_id: GROUP_ID,
  phone: null,
  agency: null,
  status: 'active',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const VALID_BODY = {
  fullName: 'Jane Doe',
  agentCode: 'AGT-001',
  email: 'jane.doe@example.com',
  password: 'Secret1!',
  groupId: GROUP_ID,
  location: 'Sydney',
};

/******************************************************************************
  Helpers
******************************************************************************/

function makeReq(overrides: Partial<IRegisterReq> = {}): IRegisterReq {
  return {
    headers: { 'x-tenant-slug': 'acme' },
    body: { ...VALID_BODY },
    ...overrides,
  } as unknown as IRegisterReq;
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
  Test suite — AuthController.register
******************************************************************************/

describe('AuthController.register', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls next() with a RouteError (status 400) when X-Tenant-Slug header is missing', async () => {
    const req = makeReq({ headers: {} } as Partial<IRegisterReq>);
    const res = makeRes();
    const next = makeNext();

    await authController.register(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(400);

    // Response must not be sent
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next() with a RouteError (status 404) when service throws TenantNotFoundError', async () => {
    jest.spyOn(authService, 'register').mockRejectedValue(new TenantNotFoundError());

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await authController.register(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(404);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next() with a RouteError (status 400) when service throws AgentCodeInvalidError', async () => {
    jest.spyOn(authService, 'register').mockRejectedValue(new AgentCodeInvalidError());

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await authController.register(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(400);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next() with a ControllerError when service throws an unexpected error', async () => {
    jest.spyOn(authService, 'register').mockRejectedValue(new Error('unexpected db failure'));

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await authController.register(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ControllerError);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('responds HTTP 201 with { success: true, data: { user, token } } on happy path', async () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.mock-token';
    jest.spyOn(authService, 'register').mockResolvedValue({ user: mockUser, token });

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await authController.register(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { user: mockUser, token },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('responds HTTP 201 with token: null when service returns token: null', async () => {
    jest.spyOn(authService, 'register').mockResolvedValue({ user: mockUser, token: null });

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await authController.register(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { user: mockUser, token: null },
    });
    expect(next).not.toHaveBeenCalled();
  });
});

/******************************************************************************
  Helpers — login
******************************************************************************/

const LOGIN_BODY = {
  email: 'jane.doe@example.com',
  password: 'Secret1!',
};

function makeLoginReq(overrides: Partial<ILoginReq> = {}): ILoginReq {
  return {
    headers: { 'x-tenant-slug': 'acme' },
    body: { ...LOGIN_BODY },
    ...overrides,
  } as unknown as ILoginReq;
}

/******************************************************************************
  Test suite — AuthController.login
******************************************************************************/

describe('AuthController.login', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls next() with a RouteError (status 400) when X-Tenant-Slug header is missing', async () => {
    const req = makeLoginReq({ headers: {} } as Partial<ILoginReq>);
    const res = makeRes();
    const next = makeNext();

    await authController.login(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(400);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next() with a RouteError (status 404) when service throws TenantNotFoundError', async () => {
    jest.spyOn(authService, 'login').mockRejectedValue(new TenantNotFoundError());

    const req = makeLoginReq();
    const res = makeRes();
    const next = makeNext();

    await authController.login(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(404);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next() with a RouteError (status 400, message "Invalid credentials") when service throws InvalidCredentialsError', async () => {
    jest.spyOn(authService, 'login').mockRejectedValue(new InvalidCredentialsError());

    const req = makeLoginReq();
    const res = makeRes();
    const next = makeNext();

    await authController.login(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(400);
    expect((err as RouteError).message).toBe('Invalid credentials');

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next() with a ControllerError when service throws an unexpected error', async () => {
    jest.spyOn(authService, 'login').mockRejectedValue(new Error('unexpected db failure'));

    const req = makeLoginReq();
    const res = makeRes();
    const next = makeNext();

    await authController.login(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ControllerError);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('responds HTTP 200 with { success: true, data: { user, token } } on happy path', async () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.mock-token';
    jest.spyOn(authService, 'login').mockResolvedValue({ user: mockUser, token });

    const req = makeLoginReq();
    const res = makeRes();
    const next = makeNext();

    await authController.login(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { user: mockUser, token },
    });
    expect(next).not.toHaveBeenCalled();
  });
});

/******************************************************************************
  Helpers — logout
******************************************************************************/

const MOCK_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.mock-token';

function makeLogoutReq(overrides: Partial<ILogoutReq> = {}): ILogoutReq {
  return {
    headers: { authorization: `Bearer ${MOCK_TOKEN}` },
    body: {},
    ...overrides,
  } as unknown as ILogoutReq;
}

/******************************************************************************
  Test suite — AuthController.logout
******************************************************************************/

describe('AuthController.logout', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls authService.logout with the extracted token and returns 200 { success: true }', async () => {
    jest.spyOn(authService, 'logout').mockResolvedValue(undefined);

    const req = makeLogoutReq();
    const res = makeRes();
    const next = makeNext();

    await authController.logout(req, res, next as NextFunction);

    expect(authService.logout).toHaveBeenCalledTimes(1);
    expect(authService.logout).toHaveBeenCalledWith(MOCK_TOKEN);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const req = makeLogoutReq({ headers: {} } as Partial<ILogoutReq>);
    const res = makeRes();
    const next = makeNext();

    await authController.logout(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(401);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header does not start with "Bearer "', async () => {
    const req = makeLogoutReq({
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    } as Partial<ILogoutReq>);
    const res = makeRes();
    const next = makeNext();

    await authController.logout(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(401);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 401 when token is empty (Authorization: Bearer )', async () => {
    const req = makeLogoutReq({
      headers: { authorization: 'Bearer ' },
    } as Partial<ILogoutReq>);
    const res = makeRes();
    const next = makeNext();

    await authController.logout(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(401);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next with error when authService.logout throws', async () => {
    jest.spyOn(authService, 'logout').mockRejectedValue(new Error('signout failed'));

    const req = makeLogoutReq();
    const res = makeRes();
    const next = makeNext();

    await authController.logout(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
