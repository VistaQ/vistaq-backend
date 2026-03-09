import type { NextFunction, Response } from 'express';

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

// Mock authService — used by AuthController
jest.mock('@src/services/auth.service', () => ({
  __esModule: true,
  default: {
    me: jest.fn(),
    register: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
  },
}));

// Mock authRepository — used by AuthService
jest.mock('@src/repositories/auth.repository', () => ({
  __esModule: true,
  default: {
    findUserById: jest.fn(),
    findTenantBySlug: jest.fn(),
    findAgentCode: jest.fn(),
    insertUser: jest.fn(),
    createAuthUser: jest.fn(),
    deleteAuthUser: jest.fn(),
    signInWithPassword: jest.fn(),
    signOut: jest.fn(),
    updateAgentCode: jest.fn(),
  },
}));

import authService from '@src/services/auth.service';
import authRepository from '@src/repositories/auth.repository';
import authController from '@src/controllers/auth.controller';
import { ControllerError, ServiceError } from '@src/models/errors/layer.errors';
import { RouteError } from '@src/models/errors/route.error';
import { IUser } from '@src/types/auth.types';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
  Shared Fixtures
******************************************************************************/

const mockUser: IUser = {
  id: 'user-123',
  tenant_id: 'tenant-456',
  email: 'test@example.com',
  name: 'Test User',
  role: 'agent',
  agent_code: 'AGT001',
  location: 'Singapore',
  group_id: 'group-789',
  phone: null,
  agency: null,
  status: 'active',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

/******************************************************************************
  AuthController.me — uses mocked authService
******************************************************************************/

function buildMeReq(userId = 'user-123') {
  return {
    user: { id: userId, tenant_id: 'tenant-456', role: 'agent' },
    headers: {},
    body: {},
  } as unknown as Parameters<typeof authController.me>[0];
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

describe('AuthController.me', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with { success: true, data: IUser } when user is found', async () => {
    (authService.me as jest.Mock).mockResolvedValue(mockUser);

    const req = buildMeReq();
    const res = buildRes();
    const next = buildNext();

    await authController.me(req, res, next);

    expect(authService.me).toHaveBeenCalledTimes(1);
    expect(authService.me).toHaveBeenCalledWith('user-123');
    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: mockUser });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next with RouteError(NOT_FOUND) when authService.me returns null', async () => {
    (authService.me as jest.Mock).mockResolvedValue(null);

    const req = buildMeReq();
    const res = buildRes();
    const next = buildNext();

    await authController.me(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(RouteError);
    expect((arg as RouteError).status).toBe(HttpStatusCodes.NOT_FOUND);
    expect((arg as RouteError).message).toBe('User not found');
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next with ControllerError when authService.me throws', async () => {
    (authService.me as jest.Mock).mockRejectedValue(
      new ServiceError('AuthService.me failed', new Error('DB error')),
    );

    const req = buildMeReq();
    const res = buildRes();
    const next = buildNext();

    await authController.me(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(ControllerError);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

/******************************************************************************
  AuthService.me — uses mocked authRepository directly
  Because AuthService is not exported as a class, we call the singleton's
  real method. The singleton mock (jest.mock '@src/services/auth.service')
  replaces authService.me with jest.fn(). To test the real implementation,
  we call authRepository (which is mocked) through a locally-created instance
  that uses the module-level mock of authRepository.

  Strategy: restore the real implementation on authService.me using
  jest.spyOn + mockImplementation of the real module behaviour,
  which reads through to the mocked authRepository.
******************************************************************************/

describe('AuthService.me', () => {
  // We need the real AuthService implementation. Since only the singleton is
  // exported (not the class), we restore the mock to call through to the real
  // implementation by reimporting via jest.requireActual on the service module.
  // The real service will use the already-mocked authRepository at the top of
  // this file, so we can control findUserById per-test.

  const realAuthServiceModule = jest.requireActual<typeof import('@src/services/auth.service')>(
    '@src/services/auth.service',
  );
  const realService = realAuthServiceModule.default;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns IUser when authRepository.findUserById returns a user', async () => {
    (authRepository.findUserById as jest.Mock).mockResolvedValue(mockUser);

    const result = await realService.me('user-123');

    expect(authRepository.findUserById).toHaveBeenCalledTimes(1);
    expect(authRepository.findUserById).toHaveBeenCalledWith('user-123');
    expect(result).toEqual(mockUser);
  });

  it('returns null when authRepository.findUserById returns null', async () => {
    (authRepository.findUserById as jest.Mock).mockResolvedValue(null);

    const result = await realService.me('user-123');

    expect(authRepository.findUserById).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('throws ServiceError when authRepository.findUserById throws', async () => {
    (authRepository.findUserById as jest.Mock).mockRejectedValue(
      new Error('DB connection failed'),
    );

    await expect(realService.me('user-123')).rejects.toBeInstanceOf(ServiceError);
  });
});
