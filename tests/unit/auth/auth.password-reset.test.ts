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

import type { Response, NextFunction } from 'express';

import { authController } from '@src/controllers/auth.controller';
import type { IForgotPasswordReq, IResetPasswordReq } from '@src/controllers/auth.controller';
import { authService } from '@src/services/auth.service';
import { RouteError } from '@src/models/errors/route.error';
import { ControllerError } from '@src/models/errors/layer.errors';
import { TenantNotFoundError } from '@src/models/errors/auth.errors';

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
  Test suite — AuthController.forgotPassword
******************************************************************************/

describe('AuthController.forgotPassword', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls next() with RouteError (status 400) when X-Tenant-Slug header is missing', async () => {
    const req: IForgotPasswordReq = {
      headers: {},
      body: { email: 'user@example.com' },
    } as unknown as IForgotPasswordReq;
    const res = makeRes();
    const next = makeNext();

    await authController.forgotPassword(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(400);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next() with RouteError (status 404) when service throws TenantNotFoundError', async () => {
    jest.spyOn(authService, 'forgotPassword').mockRejectedValue(new TenantNotFoundError());

    const req: IForgotPasswordReq = {
      headers: { 'x-tenant-slug': 'acme' },
      body: { email: 'user@example.com' },
    } as unknown as IForgotPasswordReq;
    const res = makeRes();
    const next = makeNext();

    await authController.forgotPassword(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(404);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next() with ControllerError when service throws an unexpected error', async () => {
    jest.spyOn(authService, 'forgotPassword').mockRejectedValue(new Error('unexpected db failure'));

    const req: IForgotPasswordReq = {
      headers: { 'x-tenant-slug': 'acme' },
      body: { email: 'user@example.com' },
    } as unknown as IForgotPasswordReq;
    const res = makeRes();
    const next = makeNext();

    await authController.forgotPassword(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ControllerError);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('responds HTTP 200 with { success: true, message: "Password reset email sent" } on happy path', async () => {
    jest.spyOn(authService, 'forgotPassword').mockResolvedValue(undefined);

    const req: IForgotPasswordReq = {
      headers: { 'x-tenant-slug': 'acme' },
      body: { email: 'user@example.com' },
    } as unknown as IForgotPasswordReq;
    const res = makeRes();
    const next = makeNext();

    await authController.forgotPassword(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Password reset email sent',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('responds HTTP 200 even when email does not exist (user enumeration protection)', async () => {
    // Service silently returns when user not found — controller still sends success
    jest.spyOn(authService, 'forgotPassword').mockResolvedValue(undefined);

    const req: IForgotPasswordReq = {
      headers: { 'x-tenant-slug': 'acme' },
      body: { email: 'nonexistent@example.com' },
    } as unknown as IForgotPasswordReq;
    const res = makeRes();
    const next = makeNext();

    await authController.forgotPassword(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Password reset email sent',
    });
    expect(next).not.toHaveBeenCalled();
  });
});

/******************************************************************************
  Test suite — AuthController.resetPassword
******************************************************************************/

describe('AuthController.resetPassword', () => {
  afterEach(() => jest.restoreAllMocks());

  it('responds HTTP 200 with { success: true, message: "Password reset successful" } on happy path', async () => {
    jest.spyOn(authService, 'resetPassword').mockResolvedValue(undefined);

    const req: IResetPasswordReq = {
      headers: {},
      body: { token: 'valid-reset-token', newPassword: 'NewSecret1!' },
    } as unknown as IResetPasswordReq;
    const res = makeRes();
    const next = makeNext();

    await authController.resetPassword(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Password reset successful',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() with ControllerError when service throws (invalid/expired token)', async () => {
    jest
      .spyOn(authService, 'resetPassword')
      .mockRejectedValue(new Error('invalid code: code already used'));

    const req: IResetPasswordReq = {
      headers: {},
      body: { token: 'expired-or-invalid-token', newPassword: 'NewSecret1!' },
    } as unknown as IResetPasswordReq;
    const res = makeRes();
    const next = makeNext();

    await authController.resetPassword(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ControllerError);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next() with ControllerError when service throws an unexpected error', async () => {
    jest
      .spyOn(authService, 'resetPassword')
      .mockRejectedValue(new Error('unexpected failure'));

    const req: IResetPasswordReq = {
      headers: {},
      body: { token: 'some-token', newPassword: 'NewSecret1!' },
    } as unknown as IResetPasswordReq;
    const res = makeRes();
    const next = makeNext();

    await authController.resetPassword(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ControllerError);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
