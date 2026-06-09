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

const mockActiveUser: IUser = {
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
  sales_target: null,
  status: 'active',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockInactiveUser: IUser = {
  ...mockActiveUser,
  status: 'inactive',
  updated_at: '2024-06-01T00:00:00Z',
};

/******************************************************************************
  Helpers
******************************************************************************/

function buildDeactivateReq(overrides: Partial<{
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
  UserController.deactivate — uses mocked userService
******************************************************************************/

describe('UserController.deactivate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Admin deactivates another user → 200 with updated user (status: 'inactive')
  it('returns 200 with deactivated user when admin deactivates another user', async () => {
    (userService.setUserStatus as jest.Mock).mockResolvedValue(mockInactiveUser);

    const req = buildDeactivateReq({ adminId: 'admin-001', userId: 'user-001' });
    const res = buildRes();
    const next = buildNext();

    await userController.deactivate(req, res, next);

    expect(userService.setUserStatus).toHaveBeenCalledTimes(1);
    expect(userService.setUserStatus).toHaveBeenCalledWith('user-001', 'inactive', 'mock-token-abc');
    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: mockInactiveUser });
    expect(next).not.toHaveBeenCalled();
  });

  // 2. Non-admin caller → 403
  it('calls next with RouteError(FORBIDDEN) when caller is not an admin', async () => {
    const req = buildDeactivateReq({ role: 'agent', adminId: 'caller-001', userId: 'user-001' });
    const res = buildRes();
    const next = buildNext();

    await userController.deactivate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(RouteError);
    expect((arg as RouteError).status).toBe(HttpStatusCodes.FORBIDDEN);
    expect((arg as RouteError).message).toBe('Forbidden');
    expect(userService.setUserStatus).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  // 3. Admin tries to deactivate themselves → 400
  it('calls next with RouteError(BAD_REQUEST) when admin tries to deactivate themselves', async () => {
    // adminId === userId → self-deactivation
    const req = buildDeactivateReq({ adminId: 'admin-001', userId: 'admin-001' });
    const res = buildRes();
    const next = buildNext();

    await userController.deactivate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(RouteError);
    expect((arg as RouteError).status).toBe(HttpStatusCodes.BAD_REQUEST);
    expect(userService.setUserStatus).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  // 4. Target user not found → 404
  it('calls next with RouteError(NOT_FOUND) when userService.setUserStatus throws UserNotFoundError', async () => {
    (userService.setUserStatus as jest.Mock).mockRejectedValue(new UserNotFoundError());

    const req = buildDeactivateReq({ adminId: 'admin-001', userId: 'nonexistent-user' });
    const res = buildRes();
    const next = buildNext();

    await userController.deactivate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(RouteError);
    expect((arg as RouteError).status).toBe(HttpStatusCodes.NOT_FOUND);
    expect(res.status).not.toHaveBeenCalled();
  });

  // 5. Unexpected error → ControllerError
  it('calls next with ControllerError when userService.setUserStatus throws an unexpected error', async () => {
    (userService.setUserStatus as jest.Mock).mockRejectedValue(
      new ServiceError('UserService.setUserStatus failed', new Error('DB error')),
    );

    const req = buildDeactivateReq();
    const res = buildRes();
    const next = buildNext();

    await userController.deactivate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(ControllerError);
    expect(res.status).not.toHaveBeenCalled();
  });
});

/******************************************************************************
  UserService.setUserStatus (deactivate path) — uses mocked userRepository
******************************************************************************/

describe('UserService.setUserStatus — deactivate path', () => {
  const realUserServiceModule = jest.requireActual<typeof import('@src/services/user.service')>(
    '@src/services/user.service',
  );
  const realService = realUserServiceModule.default;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Returns updated user with status: 'inactive' on success
  it('calls userRepository.updateUser and returns inactive user', async () => {
    (userRepository.findById as jest.Mock).mockResolvedValue(mockActiveUser);
    (userRepository.updateUser as jest.Mock).mockResolvedValue(mockInactiveUser);

    const result = await realService.setUserStatus('user-001', 'inactive', 'mock-token-abc');

    expect(result).toEqual(mockInactiveUser);
    expect(userRepository.findById).toHaveBeenCalledWith('user-001', 'mock-token-abc');
    expect(userRepository.updateUser).toHaveBeenCalledWith('user-001', { status: 'inactive' }, 'mock-token-abc');
  });

  // 2. Idempotency: calling deactivate on already-inactive user → returns existing user, no DB write
  it('returns existing user unchanged without calling updateUser when already inactive', async () => {
    (userRepository.findById as jest.Mock).mockResolvedValue(mockInactiveUser);

    const result = await realService.setUserStatus('user-001', 'inactive', 'mock-token-abc');

    expect(result).toEqual(mockInactiveUser);
    expect(userRepository.updateUser).not.toHaveBeenCalled();
  });

  // 3. Throws UserNotFoundError when user is not found
  it('throws UserNotFoundError when user does not exist', async () => {
    (userRepository.findById as jest.Mock).mockResolvedValue(null);

    await expect(
      realService.setUserStatus('nonexistent-id', 'inactive', 'mock-token-abc'),
    ).rejects.toBeInstanceOf(UserNotFoundError);

    expect(userRepository.updateUser).not.toHaveBeenCalled();
  });

  // 4. Throws ServiceError on unexpected repository error
  it('throws ServiceError on unexpected repository error', async () => {
    (userRepository.findById as jest.Mock).mockRejectedValue(
      new RepositoryError('UserRepository.findById failed', new Error('DB error')),
    );

    await expect(
      realService.setUserStatus('user-001', 'inactive', 'mock-token-abc'),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});
