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
    resetPasswordForEmail: jest.fn(),
    exchangeCodeForSession: jest.fn(),
    adminUpdateAuthUserPassword: jest.fn(),
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
    resetPasswordForEmail: jest.fn(),
    exchangeCodeForSession: jest.fn(),
    adminUpdateAuthUserPassword: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Sentry mock — prevent real Sentry initialisation
// ---------------------------------------------------------------------------

jest.mock('@sentry/node', () => ({
  withScope: jest.fn((cb) => cb({ setFingerprint: jest.fn(), setLevel: jest.fn(), setExtra: jest.fn() })),
  setTag: jest.fn(),
  setUser: jest.fn(),
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// sentry.metrics mock — prevent real metrics calls
// ---------------------------------------------------------------------------

jest.mock('@src/utils/sentry.metrics', () => ({
  emitErrorCount: jest.fn(),
}));

import type { Response, NextFunction } from 'express';

import { userController } from '@src/controllers/user.controller';
import type { IChangePasswordReq } from '@src/controllers/user.controller';
import { userService } from '@src/services/user.service';
import userRepository from '@src/repositories/user.repository';
import supabaseService from '@src/services/supabase.service';
import { ControllerError } from '@src/models/errors/layer.errors';
import { ServiceError } from '@src/models/errors/layer.errors';
import { RepositoryError } from '@src/models/errors/layer.errors';

/******************************************************************************
  Helpers
******************************************************************************/

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
  Test suite — UserController.changePassword
******************************************************************************/

describe('UserController.changePassword', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns HTTP 200 with { success: true, message: "Password changed successfully" } on happy path', async () => {
    jest.spyOn(userService, 'changePassword').mockResolvedValue(undefined);

    const req: IChangePasswordReq = {
      user: { id: 'user-uuid-123', tenant_id: 'tenant-uuid-456', role: 'agent' },
      body: { newPassword: 'NewSecret1!' },
      headers: {},
    } as unknown as IChangePasswordReq;
    const res = makeRes();
    const next = makeNext();

    await userController.changePassword(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Password changed successfully',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() with ControllerError when service throws', async () => {
    jest
      .spyOn(userService, 'changePassword')
      .mockRejectedValue(new ServiceError('UserService.changePassword failed', new Error('db failure')));

    const req: IChangePasswordReq = {
      user: { id: 'user-uuid-123', tenant_id: 'tenant-uuid-456', role: 'agent' },
      body: { newPassword: 'NewSecret1!' },
      headers: {},
    } as unknown as IChangePasswordReq;
    const res = makeRes();
    const next = makeNext();

    await userController.changePassword(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ControllerError);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

/******************************************************************************
  Test suite — UserService.changePassword
******************************************************************************/

describe('UserService.changePassword', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls userRepository.updateAuthUserPassword with correct arguments', async () => {
    const spy = jest
      .spyOn(userRepository, 'updateAuthUserPassword')
      .mockResolvedValue(undefined);

    await userService.changePassword('user-uuid-123', 'NewSecret1!');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('user-uuid-123', 'NewSecret1!');
  });

  it('propagates error as ServiceError when repository throws', async () => {
    jest
      .spyOn(userRepository, 'updateAuthUserPassword')
      .mockRejectedValue(new RepositoryError('UserRepository.updateAuthUserPassword failed', new Error('supabase error')));

    await expect(userService.changePassword('user-uuid-123', 'NewSecret1!')).rejects.toBeInstanceOf(ServiceError);
  });
});

/******************************************************************************
  Test suite — UserRepository.updateAuthUserPassword
******************************************************************************/

describe('UserRepository.updateAuthUserPassword', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls supabaseService.adminUpdateAuthUserPassword with correct arguments', async () => {
    const mockAdminUpdateAuthUserPassword = supabaseService.adminUpdateAuthUserPassword as jest.Mock;
    mockAdminUpdateAuthUserPassword.mockResolvedValue(undefined);

    await userRepository.updateAuthUserPassword('user-uuid-123', 'NewSecret1!');

    expect(mockAdminUpdateAuthUserPassword).toHaveBeenCalledTimes(1);
    expect(mockAdminUpdateAuthUserPassword).toHaveBeenCalledWith('user-uuid-123', 'NewSecret1!');
  });

  it('propagates error as RepositoryError when supabaseService throws', async () => {
    const mockAdminUpdateAuthUserPassword = supabaseService.adminUpdateAuthUserPassword as jest.Mock;
    mockAdminUpdateAuthUserPassword.mockRejectedValue(new Error('network failure'));

    await expect(
      userRepository.updateAuthUserPassword('user-uuid-123', 'NewSecret1!'),
    ).rejects.toBeInstanceOf(RepositoryError);
  });
});
