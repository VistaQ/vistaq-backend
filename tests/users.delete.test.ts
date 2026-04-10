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

// Mock userService — used by UserController
jest.mock('@src/services/user.service', () => ({
  __esModule: true,
  default: {
    deleteUser: jest.fn(),
  },
}));

// Mock supabaseService — used by UserRepository
jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    userSelect: jest.fn(),
    adminDelete: jest.fn(),
    adminDeleteAuthUser: jest.fn(),
  },
  supabaseService: {
    userSelect: jest.fn(),
    adminDelete: jest.fn(),
    adminDeleteAuthUser: jest.fn(),
  },
}));

// Mock userRepository — used by UserService
jest.mock('@src/repositories/user.repository', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
    deleteUser: jest.fn(),
    deleteAuthUser: jest.fn(),
  },
}));

import userService from '@src/services/user.service';
import userRepository from '@src/repositories/user.repository';
import loggingService from '@src/services/logging.service';
import userController from '@src/controllers/user.controller';
import { ControllerError, RepositoryError, ServiceError } from '@src/models/errors/layer.errors';
import { RouteError } from '@src/models/errors/route.error';
import { UserNotFoundError } from '@src/models/errors/auth.errors';
import { IUser } from '@src/types/auth.types';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';
import { IDeleteUserReq } from '@src/controllers/user.controller';

/******************************************************************************
  Shared Fixtures
******************************************************************************/

const mockUser: IUser = {
  id: 'user-001',
  tenant_id: 'tenant-456',
  email: 'alice@example.com',
  name: 'Alice',
  role: 'agent',
  agent_code: 'AGT001',
  location: 'KL',
  group_id: 'group-001',
  phone: null,
  agency: null,
  status: 'active',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

/******************************************************************************
  Helpers
******************************************************************************/

function buildDeleteReq(overrides: Partial<{
  userId: string;
}> = {}): IDeleteUserReq {
  return {
    user: { id: 'admin-001', tenant_id: 'tenant-456', role: 'admin' },
    headers: { authorization: 'Bearer mock-token-abc' },
    params: { userId: overrides.userId ?? 'user-001' },
  } as unknown as IDeleteUserReq;
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

/******************************************************************************
  UserController.delete — uses mocked userService
******************************************************************************/

describe('UserController.delete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Returns 200 with { success: true } on success
  it('returns 200 with { success: true } when user is deleted successfully', async () => {
    (userService.deleteUser as jest.Mock).mockResolvedValue(undefined);

    const req = buildDeleteReq();
    const res = buildRes();
    const next = buildNext();

    await userController.delete(req, res, next);

    expect(userService.deleteUser).toHaveBeenCalledTimes(1);
    expect(userService.deleteUser).toHaveBeenCalledWith('user-001', 'mock-token-abc');
    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(next).not.toHaveBeenCalled();
  });

  // 2. Calls next with RouteError(NOT_FOUND) when UserNotFoundError is thrown
  it('calls next with RouteError(NOT_FOUND) when userService.deleteUser throws UserNotFoundError', async () => {
    (userService.deleteUser as jest.Mock).mockRejectedValue(new UserNotFoundError());

    const req = buildDeleteReq();
    const res = buildRes();
    const next = buildNext();

    await userController.delete(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(RouteError);
    expect((arg as RouteError).status).toBe(HttpStatusCodes.NOT_FOUND);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  // 3. Calls next with ControllerError on unexpected error
  it('calls next with ControllerError when userService.deleteUser throws an unexpected error', async () => {
    (userService.deleteUser as jest.Mock).mockRejectedValue(
      new ServiceError('UserService.deleteUser failed', new Error('DB error')),
    );

    const req = buildDeleteReq();
    const res = buildRes();
    const next = buildNext();

    await userController.delete(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(ControllerError);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

/******************************************************************************
  UserService.deleteUser — uses mocked userRepository directly
******************************************************************************/

describe('UserService.deleteUser', () => {
  const realUserServiceModule = jest.requireActual<typeof import('@src/services/user.service')>(
    '@src/services/user.service',
  );
  const realService = realUserServiceModule.default;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Resolves void on success — user found, both deletes succeed
  it('resolves void when user exists and both deletes succeed', async () => {
    (userRepository.findById as jest.Mock).mockResolvedValue(mockUser);
    (userRepository.deleteUser as jest.Mock).mockResolvedValue(undefined);
    (userRepository.deleteAuthUser as jest.Mock).mockResolvedValue(undefined);

    await expect(
      realService.deleteUser('user-001', 'mock-token-abc'),
    ).resolves.toBeUndefined();

    expect(userRepository.findById).toHaveBeenCalledTimes(1);
    expect(userRepository.findById).toHaveBeenCalledWith('user-001', 'mock-token-abc');
    expect(userRepository.deleteUser).toHaveBeenCalledTimes(1);
    expect(userRepository.deleteUser).toHaveBeenCalledWith('user-001');
    expect(userRepository.deleteAuthUser).toHaveBeenCalledTimes(1);
    expect(userRepository.deleteAuthUser).toHaveBeenCalledWith('user-001');
  });

  // 2. Throws UserNotFoundError when findById returns null
  it('throws UserNotFoundError when user does not exist', async () => {
    (userRepository.findById as jest.Mock).mockResolvedValue(null);

    await expect(
      realService.deleteUser('nonexistent-id', 'mock-token-abc'),
    ).rejects.toBeInstanceOf(UserNotFoundError);

    expect(userRepository.findById).toHaveBeenCalledTimes(1);
    expect(userRepository.deleteUser).not.toHaveBeenCalled();
    expect(userRepository.deleteAuthUser).not.toHaveBeenCalled();
  });

  // 3. Auth delete failure (best-effort) — DB delete succeeds, auth delete fails, still resolves void
  it('resolves void when DB delete succeeds but auth delete fails (best-effort)', async () => {
    (userRepository.findById as jest.Mock).mockResolvedValue(mockUser);
    (userRepository.deleteUser as jest.Mock).mockResolvedValue(undefined);
    (userRepository.deleteAuthUser as jest.Mock).mockRejectedValue(
      new Error('Auth service unavailable'),
    );

    await expect(
      realService.deleteUser('user-001', 'mock-token-abc'),
    ).resolves.toBeUndefined();

    expect(userRepository.findById).toHaveBeenCalledTimes(1);
    expect(userRepository.deleteUser).toHaveBeenCalledTimes(1);
    expect(userRepository.deleteAuthUser).toHaveBeenCalledTimes(1);
    expect(loggingService.error).toHaveBeenCalledWith(
      'UserService.deleteUser — Auth user deletion failed, DB row already removed',
      expect.any(Error),
      { userId: 'user-001' },
    );
  });

  // 4. DB delete failure — deleteUser throws, goes to handleServiceError
  it('throws ServiceError when repository.deleteUser throws', async () => {
    (userRepository.findById as jest.Mock).mockResolvedValue(mockUser);
    (userRepository.deleteUser as jest.Mock).mockRejectedValue(
      new RepositoryError('UserRepository.deleteUser failed', new Error('DB error')),
    );

    await expect(
      realService.deleteUser('user-001', 'mock-token-abc'),
    ).rejects.toBeInstanceOf(ServiceError);

    expect(userRepository.findById).toHaveBeenCalledTimes(1);
    expect(userRepository.deleteUser).toHaveBeenCalledTimes(1);
    expect(userRepository.deleteAuthUser).not.toHaveBeenCalled();
  });
});
