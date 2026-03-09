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
    getUserById: jest.fn(),
  },
}));

// Mock supabaseService — used by UserRepository
jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    userSelect: jest.fn(),
  },
  supabaseService: {
    userSelect: jest.fn(),
  },
}));

// Mock userRepository — used by UserService
jest.mock('@src/repositories/user.repository', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

import userService from '@src/services/user.service';
import userRepository from '@src/repositories/user.repository';
import supabaseService from '@src/services/supabase.service';
import userController from '@src/controllers/user.controller';
import { ControllerError, RepositoryError, ServiceError } from '@src/models/errors/layer.errors';
import { RouteError } from '@src/models/errors/route.error';
import { IUser } from '@src/types/auth.types';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';
import { IGetUserByIdReq } from '@src/controllers/user.controller';

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

function buildGetByIdReq(userId = 'user-001'): IGetUserByIdReq {
  return {
    user: { id: 'admin-001', tenant_id: 'tenant-456', role: 'admin' },
    headers: { authorization: 'Bearer mock-token-abc' },
    params: { userId },
  } as unknown as IGetUserByIdReq;
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
  UserController.getById — uses mocked userService
******************************************************************************/

describe('UserController.getById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with { success: true, data: IUser } on success', async () => {
    (userService.getUserById as jest.Mock).mockResolvedValue(mockUser);

    const req = buildGetByIdReq();
    const res = buildRes();
    const next = buildNext();

    await userController.getById(req, res, next);

    expect(userService.getUserById).toHaveBeenCalledTimes(1);
    expect(userService.getUserById).toHaveBeenCalledWith('user-001', 'mock-token-abc');
    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: mockUser });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next with RouteError(404) when userService.getUserById returns null', async () => {
    (userService.getUserById as jest.Mock).mockResolvedValue(null);

    const req = buildGetByIdReq('nonexistent-id');
    const res = buildRes();
    const next = buildNext();

    await userController.getById(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(RouteError);
    expect((arg as RouteError).status).toBe(HttpStatusCodes.NOT_FOUND);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next with ControllerError when userService.getUserById throws', async () => {
    (userService.getUserById as jest.Mock).mockRejectedValue(
      new ServiceError('UserService.getUserById failed', new Error('DB error')),
    );

    const req = buildGetByIdReq();
    const res = buildRes();
    const next = buildNext();

    await userController.getById(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(ControllerError);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

/******************************************************************************
  UserService.getUserById — uses mocked userRepository directly
******************************************************************************/

describe('UserService.getUserById', () => {
  const realUserServiceModule = jest.requireActual<typeof import('@src/services/user.service')>(
    '@src/services/user.service',
  );
  const realService = realUserServiceModule.default;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns IUser when repository returns a user', async () => {
    (userRepository.findById as jest.Mock).mockResolvedValue(mockUser);

    const result = await realService.getUserById('user-001', 'mock-token-abc');

    expect(result).toEqual(mockUser);
    expect(userRepository.findById).toHaveBeenCalledTimes(1);
    expect(userRepository.findById).toHaveBeenCalledWith('user-001', 'mock-token-abc');
  });

  it('returns null when repository returns null', async () => {
    (userRepository.findById as jest.Mock).mockResolvedValue(null);

    const result = await realService.getUserById('nonexistent-id', 'mock-token-abc');

    expect(result).toBeNull();
    expect(userRepository.findById).toHaveBeenCalledTimes(1);
    expect(userRepository.findById).toHaveBeenCalledWith('nonexistent-id', 'mock-token-abc');
  });

  it('throws ServiceError when repository throws', async () => {
    (userRepository.findById as jest.Mock).mockRejectedValue(
      new RepositoryError('UserRepository.findById failed', new Error('DB error')),
    );

    await expect(realService.getUserById('user-001', 'mock-token-abc')).rejects.toBeInstanceOf(
      ServiceError,
    );

    expect(userRepository.findById).toHaveBeenCalledTimes(1);
  });
});

/******************************************************************************
  UserRepository.findById — uses mocked supabaseService directly
******************************************************************************/

describe('UserRepository.findById', () => {
  const realUserRepoModule = jest.requireActual<typeof import('@src/repositories/user.repository')>(
    '@src/repositories/user.repository',
  );
  const realRepo = realUserRepoModule.default;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns mapped IUser when user found', async () => {
    const dbRow = { ...mockUser };
    (supabaseService.userSelect as jest.Mock).mockResolvedValue({
      data: [dbRow],
      error: null,
    });

    const result = await realRepo.findById('user-001', 'mock-token-abc');

    expect(result).toEqual(mockUser);
    expect(supabaseService.userSelect).toHaveBeenCalledTimes(1);
    expect(supabaseService.userSelect).toHaveBeenCalledWith(
      'mock-token-abc',
      'users',
      '*',
      { id: 'user-001' },
    );
  });

  it('returns null when no user found', async () => {
    (supabaseService.userSelect as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });

    const result = await realRepo.findById('nonexistent-id', 'mock-token-abc');

    expect(result).toBeNull();
    expect(supabaseService.userSelect).toHaveBeenCalledTimes(1);
  });

  it('throws RepositoryError when supabaseService.userSelect returns an error', async () => {
    (supabaseService.userSelect as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'RLS policy violation' },
    });

    await expect(realRepo.findById('user-001', 'mock-token-abc')).rejects.toBeInstanceOf(
      RepositoryError,
    );

    expect(supabaseService.userSelect).toHaveBeenCalledTimes(1);
  });
});
