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

// Mock @sentry/node — prevent real Sentry calls; withScope must invoke the callback
jest.mock('@sentry/node', () => ({
  withScope: jest.fn((cb) => cb({ setFingerprint: jest.fn(), setLevel: jest.fn(), setExtra: jest.fn() })),
  setTag: jest.fn(),
  setUser: jest.fn(),
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Mock sentry.metrics to avoid real metric emissions
jest.mock('@src/utils/sentry.metrics', () => ({
  emitErrorCount: jest.fn(),
}));

// Mock userService — used by UserController
jest.mock('@src/services/user.service', () => ({
  __esModule: true,
  default: {
    updateUser: jest.fn(),
  },
}));

// Mock supabaseService — used by UserRepository
jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    userSelect: jest.fn(),
    userUpdate: jest.fn(),
    adminUpdateAuthUserEmail: jest.fn(),
  },
  supabaseService: {
    userSelect: jest.fn(),
    userUpdate: jest.fn(),
    adminUpdateAuthUserEmail: jest.fn(),
  },
}));

// Mock userRepository — used by UserService
jest.mock('@src/repositories/user.repository', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
    updateUser: jest.fn(),
    updateAuthUserEmail: jest.fn(),
  },
}));

import userService from '@src/services/user.service';
import userRepository from '@src/repositories/user.repository';
import supabaseService from '@src/services/supabase.service';
import userController from '@src/controllers/user.controller';
import { ControllerError, RepositoryError, ServiceError } from '@src/models/errors/layer.errors';
import { RouteError } from '@src/models/errors/route.error';
import { UserNotFoundError } from '@src/models/errors/auth.errors';
import { IUser } from '@src/types/auth.types';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';
import { IUpdateUserReq } from '@src/controllers/user.controller';

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

const updatedMockUser: IUser = {
  ...mockUser,
  name: 'Alice Updated',
  updated_at: '2024-06-01T00:00:00Z',
};

/******************************************************************************
  Helpers
******************************************************************************/

function buildUpdateReq(overrides: Partial<{
  role: string;
  callerId: string;
  userId: string;
  body: Partial<IUpdateUserReq['body']>;
}> = {}): IUpdateUserReq {
  return {
    user: {
      id: overrides.callerId ?? 'admin-001',
      tenant_id: 'tenant-456',
      role: overrides.role ?? 'admin',
    },
    headers: { authorization: 'Bearer mock-token-abc' },
    params: { userId: overrides.userId ?? 'user-001' },
    body: {
      name: 'Alice Updated',
      ...overrides.body,
    },
  } as unknown as IUpdateUserReq;
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
  UserController.update — uses mocked userService
******************************************************************************/

describe('UserController.update', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Returns 403 when non-admin tries to update another user
  it('calls next with RouteError(FORBIDDEN) when non-admin tries to update another user', async () => {
    const req = buildUpdateReq({ role: 'agent', callerId: 'agent-001', userId: 'user-001' });
    const res = buildRes();
    const next = buildNext();

    await userController.update(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(RouteError);
    expect((arg as RouteError).status).toBe(HttpStatusCodes.FORBIDDEN);
    expect((arg as RouteError).message).toBe('Forbidden');
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  // 2. Returns 404 when UserNotFoundError is thrown
  it('calls next with RouteError(NOT_FOUND) when userService.updateUser throws UserNotFoundError', async () => {
    (userService.updateUser as jest.Mock).mockRejectedValue(new UserNotFoundError());

    const req = buildUpdateReq();
    const res = buildRes();
    const next = buildNext();

    await userController.update(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(RouteError);
    expect((arg as RouteError).status).toBe(HttpStatusCodes.NOT_FOUND);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  // 3. Returns 200 with { success: true, data: IUser } on success
  it('returns 200 with { success: true, data: IUser } when user is updated successfully', async () => {
    (userService.updateUser as jest.Mock).mockResolvedValue(updatedMockUser);

    const req = buildUpdateReq();
    const res = buildRes();
    const next = buildNext();

    await userController.update(req, res, next);

    expect(userService.updateUser).toHaveBeenCalledTimes(1);
    expect(userService.updateUser).toHaveBeenCalledWith({
      userId: 'user-001',
      callerRole: 'admin',
      token: 'mock-token-abc',
      data: { name: 'Alice Updated' },
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: updatedMockUser });
    expect(next).not.toHaveBeenCalled();
  });

  // 4. Calls next with ControllerError on unexpected error
  it('calls next with ControllerError when userService.updateUser throws an unexpected error', async () => {
    (userService.updateUser as jest.Mock).mockRejectedValue(
      new ServiceError('UserService.updateUser failed', new Error('DB error')),
    );

    const req = buildUpdateReq();
    const res = buildRes();
    const next = buildNext();

    await userController.update(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(ControllerError);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  // 5. Allows non-admin to update themselves (no 403)
  it('allows non-admin to update themselves without returning 403', async () => {
    (userService.updateUser as jest.Mock).mockResolvedValue(updatedMockUser);

    const req = buildUpdateReq({ role: 'agent', callerId: 'user-001', userId: 'user-001' });
    const res = buildRes();
    const next = buildNext();

    await userController.update(req, res, next);

    expect(userService.updateUser).toHaveBeenCalledTimes(1);
    expect(userService.updateUser).toHaveBeenCalledWith({
      userId: 'user-001',
      callerRole: 'agent',
      token: 'mock-token-abc',
      data: { name: 'Alice Updated' },
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: updatedMockUser });
    expect(next).not.toHaveBeenCalled();
  });
});

/******************************************************************************
  UserService.updateUser — uses mocked userRepository directly
******************************************************************************/

describe('UserService.updateUser', () => {
  const realUserServiceModule = jest.requireActual<typeof import('@src/services/user.service')>(
    '@src/services/user.service',
  );
  const realService = realUserServiceModule.default;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Returns updated IUser on success (non-email update)
  it('returns updated IUser on success for non-email update', async () => {
    (userRepository.findById as jest.Mock).mockResolvedValue(mockUser);
    (userRepository.updateUser as jest.Mock).mockResolvedValue(updatedMockUser);

    const result = await realService.updateUser({
      userId: 'user-001',
      callerRole: 'admin',
      token: 'mock-token-abc',
      data: { name: 'Alice Updated' },
    });

    expect(result).toEqual(updatedMockUser);
    expect(userRepository.findById).toHaveBeenCalledTimes(1);
    expect(userRepository.findById).toHaveBeenCalledWith('user-001', 'mock-token-abc');
    expect(userRepository.updateUser).toHaveBeenCalledTimes(1);
    expect(userRepository.updateUser).toHaveBeenCalledWith(
      'user-001',
      { name: 'Alice Updated' },
      'mock-token-abc',
    );
    expect(userRepository.updateAuthUserEmail).not.toHaveBeenCalled();
  });

  // 2. Strips role for non-admin callers
  // Note: 'status' is no longer accepted by the update schema (.strict() rejects unknown fields).
  // Non-admin callers that attempt to send 'status' via the HTTP route receive a 400 validation error
  // before this service method is reached.
  it('strips role field for non-admin callers', async () => {
    (userRepository.findById as jest.Mock).mockResolvedValue(mockUser);
    (userRepository.updateUser as jest.Mock).mockResolvedValue(updatedMockUser);

    await realService.updateUser({
      userId: 'user-001',
      callerRole: 'agent',
      token: 'mock-token-abc',
      data: { name: 'Alice Updated', role: 'admin' },
    });

    expect(userRepository.updateUser).toHaveBeenCalledTimes(1);
    const updateData = (userRepository.updateUser as jest.Mock).mock.calls[0][1];
    expect(updateData).toEqual({ name: 'Alice Updated' });
    expect(updateData).not.toHaveProperty('role');
  });

  // 3. Throws UserNotFoundError when user doesn't exist
  it('throws UserNotFoundError when user does not exist', async () => {
    (userRepository.findById as jest.Mock).mockResolvedValue(null);

    await expect(
      realService.updateUser({
        userId: 'nonexistent-id',
        callerRole: 'admin',
        token: 'mock-token-abc',
        data: { name: 'Updated' },
      }),
    ).rejects.toBeInstanceOf(UserNotFoundError);

    expect(userRepository.findById).toHaveBeenCalledTimes(1);
    expect(userRepository.updateUser).not.toHaveBeenCalled();
  });

  // 4. Email update: calls updateAuthUserEmail before updateUser
  it('calls updateAuthUserEmail before updateUser when email changes', async () => {
    const emailUpdatedUser: IUser = { ...mockUser, email: 'newalice@example.com' };
    (userRepository.findById as jest.Mock).mockResolvedValue(mockUser);
    (userRepository.updateAuthUserEmail as jest.Mock).mockResolvedValue(undefined);
    (userRepository.updateUser as jest.Mock).mockResolvedValue(emailUpdatedUser);

    const result = await realService.updateUser({
      userId: 'user-001',
      callerRole: 'admin',
      token: 'mock-token-abc',
      data: { email: 'newalice@example.com' },
    });

    expect(result).toEqual(emailUpdatedUser);
    expect(userRepository.updateAuthUserEmail).toHaveBeenCalledTimes(1);
    expect(userRepository.updateAuthUserEmail).toHaveBeenCalledWith(
      'user-001',
      'newalice@example.com',
    );
    expect(userRepository.updateUser).toHaveBeenCalledTimes(1);
    expect(userRepository.updateUser).toHaveBeenCalledWith(
      'user-001',
      { email: 'newalice@example.com' },
      'mock-token-abc',
    );
  });

  // 5. Email update rollback: reverts Auth email when DB update fails
  it('reverts Auth email when DB update fails after Auth email was updated', async () => {
    const dbError = new Error('DB update failed');
    (userRepository.findById as jest.Mock).mockResolvedValue(mockUser);
    (userRepository.updateAuthUserEmail as jest.Mock).mockResolvedValue(undefined);
    (userRepository.updateUser as jest.Mock).mockRejectedValue(dbError);

    await expect(
      realService.updateUser({
        userId: 'user-001',
        callerRole: 'admin',
        token: 'mock-token-abc',
        data: { email: 'newalice@example.com' },
      }),
    ).rejects.toBeInstanceOf(ServiceError);

    // Auth email updated with new email first
    expect(userRepository.updateAuthUserEmail).toHaveBeenCalledTimes(2);
    expect(userRepository.updateAuthUserEmail).toHaveBeenNthCalledWith(
      1,
      'user-001',
      'newalice@example.com',
    );
    // Rollback: revert to old email
    expect(userRepository.updateAuthUserEmail).toHaveBeenNthCalledWith(
      2,
      'user-001',
      'alice@example.com',
    );
  });

  // 6. Throws ServiceError on unexpected error
  it('throws ServiceError on unexpected error', async () => {
    (userRepository.findById as jest.Mock).mockRejectedValue(
      new RepositoryError('UserRepository.findById failed', new Error('DB error')),
    );

    await expect(
      realService.updateUser({
        userId: 'user-001',
        callerRole: 'admin',
        token: 'mock-token-abc',
        data: { name: 'Updated' },
      }),
    ).rejects.toBeInstanceOf(ServiceError);

    expect(userRepository.findById).toHaveBeenCalledTimes(1);
  });
});

/******************************************************************************
  UserRepository.updateUser — uses mocked supabaseService directly
******************************************************************************/

describe('UserRepository.updateUser', () => {
  const realUserRepoModule = jest.requireActual<typeof import('@src/repositories/user.repository')>(
    '@src/repositories/user.repository',
  );
  const realRepo = realUserRepoModule.default;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Returns mapped IUser on success
  it('returns mapped IUser on success', async () => {
    const dbRow = { ...updatedMockUser };
    (supabaseService.userUpdate as jest.Mock).mockResolvedValue({
      data: [dbRow],
      error: null,
    });

    const result = await realRepo.updateUser('user-001', { name: 'Alice Updated' }, 'mock-token-abc');

    expect(result).toEqual(updatedMockUser);
    expect(supabaseService.userUpdate).toHaveBeenCalledTimes(1);
    expect(supabaseService.userUpdate).toHaveBeenCalledWith(
      'mock-token-abc',
      'users',
      { name: 'Alice Updated' },
      { id: 'user-001' },
    );
  });

  // 2. Throws RepositoryError when supabaseService returns error
  it('throws RepositoryError when supabaseService.userUpdate returns an error', async () => {
    (supabaseService.userUpdate as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'RLS policy violation' },
    });

    await expect(
      realRepo.updateUser('user-001', { name: 'Alice Updated' }, 'mock-token-abc'),
    ).rejects.toBeInstanceOf(RepositoryError);

    expect(supabaseService.userUpdate).toHaveBeenCalledTimes(1);
  });
});

/******************************************************************************
  UserRepository.updateAuthUserEmail — uses mocked supabaseService directly
******************************************************************************/

describe('UserRepository.updateAuthUserEmail', () => {
  const realUserRepoModule = jest.requireActual<typeof import('@src/repositories/user.repository')>(
    '@src/repositories/user.repository',
  );
  const realRepo = realUserRepoModule.default;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Resolves void on success
  it('resolves void on success', async () => {
    (supabaseService.adminUpdateAuthUserEmail as jest.Mock).mockResolvedValue(undefined);

    await expect(
      realRepo.updateAuthUserEmail('user-001', 'newalice@example.com'),
    ).resolves.toBeUndefined();

    expect(supabaseService.adminUpdateAuthUserEmail).toHaveBeenCalledTimes(1);
    expect(supabaseService.adminUpdateAuthUserEmail).toHaveBeenCalledWith(
      'user-001',
      'newalice@example.com',
    );
  });

  // 2. Throws RepositoryError on failure
  it('throws RepositoryError when supabaseService.adminUpdateAuthUserEmail throws', async () => {
    (supabaseService.adminUpdateAuthUserEmail as jest.Mock).mockRejectedValue(
      new Error('Auth service unavailable'),
    );

    await expect(
      realRepo.updateAuthUserEmail('user-001', 'newalice@example.com'),
    ).rejects.toBeInstanceOf(RepositoryError);

    expect(supabaseService.adminUpdateAuthUserEmail).toHaveBeenCalledTimes(1);
  });
});
