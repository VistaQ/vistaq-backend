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
  asyncLocalStorage: {
    getStore: jest.fn().mockReturnValue(null),
  },
}));

jest.mock('@sentry/node', () => ({
  withScope: jest.fn((cb) => cb({ setFingerprint: jest.fn(), setLevel: jest.fn(), setExtra: jest.fn() })),
  setTag: jest.fn(),
  setUser: jest.fn(),
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('@src/utils/sentry.metrics', () => ({
  emitErrorCount: jest.fn(),
}));

// Mock userService — used by UserController
jest.mock('@src/services/user.service', () => ({
  __esModule: true,
  default: {
    getUsers: jest.fn(),
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
    findAll: jest.fn(),
    findManagedGroupIdsByUserIds: jest.fn().mockResolvedValue(new Map()),
  },
}));

import userService from '@src/services/user.service';
import userRepository from '@src/repositories/user.repository';
import supabaseService from '@src/services/supabase.service';
import userController from '@src/controllers/user.controller';
import { ControllerError, RepositoryError, ServiceError } from '@src/models/errors/layer.errors';
import { IUser, IUserWithManagedGroups } from '@src/types/auth.types';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';
import { IBaseReq } from '@src/models/interfaces/base.interface';

/******************************************************************************
  Shared Fixtures
******************************************************************************/

const mockUsers: IUser[] = [
  {
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
    sales_target: null,
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'user-002',
    tenant_id: 'tenant-456',
    email: 'bob@example.com',
    name: 'Bob',
    role: 'trainer',
    agent_code: null,
    location: null,
    group_id: null,
    phone: null,
    agency: null,
    sales_target: null,
    status: 'active',
    created_at: '2024-02-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
  },
];

const mockUsersEnriched: IUserWithManagedGroups[] = mockUsers.map((u) => ({
  ...u,
  managed_group_ids: [],
}));

/******************************************************************************
  Helpers
******************************************************************************/

function buildGetReq(): IBaseReq {
  return {
    user: { id: 'admin-001', tenant_id: 'tenant-456', role: 'admin' },
    headers: { authorization: 'Bearer mock-token-abc' },
  } as unknown as IBaseReq;
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
  UserController.getAll — uses mocked userService
******************************************************************************/

describe('UserController.getAll', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with { success: true, data: IUser[] } on success', async () => {
    (userService.getUsers as jest.Mock).mockResolvedValue(mockUsers);

    const req = buildGetReq();
    const res = buildRes();
    const next = buildNext();

    await userController.getAll(req, res, next);

    expect(userService.getUsers).toHaveBeenCalledTimes(1);
    expect(userService.getUsers).toHaveBeenCalledWith('mock-token-abc');
    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: mockUsers });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next with ControllerError when userService.getUsers throws', async () => {
    (userService.getUsers as jest.Mock).mockRejectedValue(
      new ServiceError('UserService.getUsers failed', new Error('DB error')),
    );

    const req = buildGetReq();
    const res = buildRes();
    const next = buildNext();

    await userController.getAll(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(ControllerError);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

/******************************************************************************
  UserService.getUsers — uses mocked userRepository directly
******************************************************************************/

describe('UserService.getUsers', () => {
  const realUserServiceModule = jest.requireActual<typeof import('@src/services/user.service')>(
    '@src/services/user.service',
  );
  const realService = realUserServiceModule.default;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns IUser[] from repository', async () => {
    (userRepository.findAll as jest.Mock).mockResolvedValue(mockUsers);

    const result = await realService.getUsers('mock-token-abc');

    expect(result).toEqual(mockUsersEnriched);
    expect(userRepository.findAll).toHaveBeenCalledTimes(1);
    expect(userRepository.findAll).toHaveBeenCalledWith('mock-token-abc');
  });

  it('throws ServiceError when repository throws', async () => {
    (userRepository.findAll as jest.Mock).mockRejectedValue(
      new RepositoryError('UserRepository.findAll failed', new Error('DB error')),
    );

    await expect(realService.getUsers('mock-token-abc')).rejects.toBeInstanceOf(ServiceError);

    expect(userRepository.findAll).toHaveBeenCalledTimes(1);
  });
});

/******************************************************************************
  UserRepository.findAll — uses mocked supabaseService directly
******************************************************************************/

describe('UserRepository.findAll', () => {
  const realUserRepoModule = jest.requireActual<typeof import('@src/repositories/user.repository')>(
    '@src/repositories/user.repository',
  );
  const realRepo = realUserRepoModule.default;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns mapped IUser[] on success', async () => {
    const dbRows = mockUsers.map((u) => ({ ...u }));
    (supabaseService.userSelect as jest.Mock).mockResolvedValue({
      data: dbRows,
      error: null,
    });

    const result = await realRepo.findAll('mock-token-abc');

    expect(result).toEqual(mockUsers);
    expect(supabaseService.userSelect).toHaveBeenCalledTimes(1);
    expect(supabaseService.userSelect).toHaveBeenCalledWith(
      'mock-token-abc',
      'users',
      '*',
    );
  });

  it('returns empty array when no users found', async () => {
    (supabaseService.userSelect as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });

    const result = await realRepo.findAll('mock-token-abc');

    expect(result).toEqual([]);
    expect(supabaseService.userSelect).toHaveBeenCalledTimes(1);
  });

  it('throws RepositoryError when supabaseService.userSelect returns an error', async () => {
    (supabaseService.userSelect as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'RLS policy violation' },
    });

    await expect(realRepo.findAll('mock-token-abc')).rejects.toBeInstanceOf(RepositoryError);

    expect(supabaseService.userSelect).toHaveBeenCalledTimes(1);
  });
});
