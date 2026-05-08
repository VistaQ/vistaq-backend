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
  asyncLocalStorage: {
    getStore: jest.fn().mockReturnValue(null),
  },
}));

// ---------------------------------------------------------------------------
// Sentry mock
// ---------------------------------------------------------------------------

jest.mock('@sentry/node', () => ({
  withScope: jest.fn((cb) => cb({ setFingerprint: jest.fn(), setLevel: jest.fn(), setExtra: jest.fn() })),
  setTag: jest.fn(),
  setUser: jest.fn(),
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// ---------------------------------------------------------------------------
// sentry.metrics mock
// ---------------------------------------------------------------------------

jest.mock('@src/utils/sentry.metrics', () => ({
  emitErrorCount: jest.fn(),
}));

// ---------------------------------------------------------------------------
// userService mock — used by UserController
// ---------------------------------------------------------------------------

jest.mock('@src/services/user.service', () => ({
  __esModule: true,
  default: {
    setUserStatus: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// supabaseService mock — prevent real client instantiation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// userRepository mock — used by UserService
// ---------------------------------------------------------------------------

jest.mock('@src/repositories/user.repository', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
    updateUser: jest.fn(),
  },
}));

import type { NextFunction, Response } from 'express';

import userController from '@src/controllers/user.controller';
import type { IUserStatusChangeReq } from '@src/controllers/user.controller';
import userService from '@src/services/user.service';
import userRepository from '@src/repositories/user.repository';
import { ControllerError, ServiceError, RepositoryError } from '@src/models/errors/layer.errors';
import { RouteError } from '@src/models/errors/route.error';
import { UserNotFoundError } from '@src/models/errors/auth.errors';
import { IUser } from '@src/types/auth.types';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
  Shared Fixtures
******************************************************************************/

const mockInactiveUser: IUser = {
  id: 'user-001',
  tenant_id: 'tenant-456',
  email: 'bob@example.com',
  name: 'Bob',
  role: 'agent',
  agent_code: 'AGT001',
  location: 'KL',
  group_id: 'group-001',
  phone: null,
  agency: null,
  status: 'inactive',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockActiveUser: IUser = {
  ...mockInactiveUser,
  status: 'active',
  updated_at: '2024-06-01T00:00:00Z',
};

/******************************************************************************
  Helpers
******************************************************************************/

function buildReactivateReq(overrides: Partial<{
  adminId: string;
  role: string;
  userId: string;
}> = {}): IUserStatusChangeReq {
  return {
    user: {
      id: overrides.adminId ?? 'admin-001',
      tenant_id: 'tenant-456',
      role: overrides.role ?? 'admin',
    },
    headers: { authorization: 'Bearer mock-token-abc' },
    params: { userId: overrides.userId ?? 'user-001' },
  } as unknown as IUserStatusChangeReq;
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
  UserController.reactivate — uses mocked userService
******************************************************************************/

describe('UserController.reactivate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Admin reactivates a user → 200 with updated user (status: 'active')
  it('returns 200 with reactivated user when admin reactivates a user', async () => {
    (userService.setUserStatus as jest.Mock).mockResolvedValue(mockActiveUser);

    const req = buildReactivateReq({ adminId: 'admin-001', userId: 'user-001' });
    const res = buildRes();
    const next = buildNext();

    await userController.reactivate(req, res, next);

    expect(userService.setUserStatus).toHaveBeenCalledTimes(1);
    expect(userService.setUserStatus).toHaveBeenCalledWith('user-001', 'active', 'mock-token-abc');
    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: mockActiveUser });
    expect(next).not.toHaveBeenCalled();
  });

  // 2. Non-admin caller → 403
  it('calls next with RouteError(FORBIDDEN) when caller is not an admin', async () => {
    const req = buildReactivateReq({ role: 'trainer', adminId: 'trainer-001', userId: 'user-001' });
    const res = buildRes();
    const next = buildNext();

    await userController.reactivate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(RouteError);
    expect((arg as RouteError).status).toBe(HttpStatusCodes.FORBIDDEN);
    expect((arg as RouteError).message).toBe('Forbidden');
    expect(userService.setUserStatus).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  // 3. Target user not found → 404
  it('calls next with RouteError(NOT_FOUND) when userService.setUserStatus throws UserNotFoundError', async () => {
    (userService.setUserStatus as jest.Mock).mockRejectedValue(new UserNotFoundError());

    const req = buildReactivateReq({ adminId: 'admin-001', userId: 'nonexistent-user' });
    const res = buildRes();
    const next = buildNext();

    await userController.reactivate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(RouteError);
    expect((arg as RouteError).status).toBe(HttpStatusCodes.NOT_FOUND);
    expect(res.status).not.toHaveBeenCalled();
  });

  // 4. Unexpected error → ControllerError
  it('calls next with ControllerError when userService.setUserStatus throws an unexpected error', async () => {
    (userService.setUserStatus as jest.Mock).mockRejectedValue(
      new ServiceError('UserService.setUserStatus failed', new Error('DB error')),
    );

    const req = buildReactivateReq();
    const res = buildRes();
    const next = buildNext();

    await userController.reactivate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(ControllerError);
    expect(res.status).not.toHaveBeenCalled();
  });
});

/******************************************************************************
  UserService.setUserStatus (reactivate path) — uses mocked userRepository
******************************************************************************/

describe('UserService.setUserStatus — reactivate path', () => {
  const realUserServiceModule = jest.requireActual<typeof import('@src/services/user.service')>(
    '@src/services/user.service',
  );
  const realService = realUserServiceModule.default;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Returns updated user with status: 'active' on success
  it('calls userRepository.updateUser and returns active user', async () => {
    (userRepository.findById as jest.Mock).mockResolvedValue(mockInactiveUser);
    (userRepository.updateUser as jest.Mock).mockResolvedValue(mockActiveUser);

    const result = await realService.setUserStatus('user-001', 'active', 'mock-token-abc');

    expect(result).toEqual(mockActiveUser);
    expect(userRepository.findById).toHaveBeenCalledWith('user-001', 'mock-token-abc');
    expect(userRepository.updateUser).toHaveBeenCalledWith('user-001', { status: 'active' }, 'mock-token-abc');
  });

  // 2. Idempotency: calling reactivate on already-active user → returns existing user, no DB write
  it('returns existing user unchanged without calling updateUser when already active', async () => {
    (userRepository.findById as jest.Mock).mockResolvedValue(mockActiveUser);

    const result = await realService.setUserStatus('user-001', 'active', 'mock-token-abc');

    expect(result).toEqual(mockActiveUser);
    expect(userRepository.updateUser).not.toHaveBeenCalled();
  });

  // 3. Throws UserNotFoundError when user is not found
  it('throws UserNotFoundError when user does not exist', async () => {
    (userRepository.findById as jest.Mock).mockResolvedValue(null);

    await expect(
      realService.setUserStatus('nonexistent-id', 'active', 'mock-token-abc'),
    ).rejects.toBeInstanceOf(UserNotFoundError);

    expect(userRepository.updateUser).not.toHaveBeenCalled();
  });

  // 4. Throws ServiceError on unexpected repository error
  it('throws ServiceError on unexpected repository error', async () => {
    (userRepository.findById as jest.Mock).mockRejectedValue(
      new RepositoryError('UserRepository.findById failed', new Error('DB error')),
    );

    await expect(
      realService.setUserStatus('user-001', 'active', 'mock-token-abc'),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});
