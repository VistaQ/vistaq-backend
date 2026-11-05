const mockRegister = jest.fn();
const mockLogin = jest.fn();
const mockVerifyLogin = jest.fn();
const mockLogout = jest.fn();
const mockMe = jest.fn();

jest.mock('@src/services/auth.service', () => ({
  __esModule: true,
  default: {
    register: mockRegister,
    login: mockLogin,
    verifyLogin: mockVerifyLogin,
    logout: mockLogout,
    me: mockMe,
  },
}));

import type { Response } from 'express';

import authController, {
  type ILoginReq,
  type ILogoutReq,
  type IMeReq,
  type IRegisterReq,
  type IVerifyLoginReq,
} from '@src/controllers/auth.controller';
import {
  AgentCodeInvalidError,
  InvalidCredentialsError,
  UserAlreadyExistsError,
  UserInactiveError,
} from '@src/models/errors/auth.errors';
import { CognitoRateLimitedError } from '@src/models/errors/cognito.error';
import { ControllerError } from '@src/models/errors/layer.errors';
import type { RouteError } from '@src/models/errors/route.error';

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
};

const request = <T>(overrides: Record<string, unknown>): T =>
  ({ headers: {}, body: {}, ...overrides }) as unknown as T;

const statusOf = (next: jest.Mock): number =>
  (next.mock.calls[0][0] as RouteError).status;

beforeEach(() => jest.resetAllMocks());

describe('AuthController.register', () => {
  const body = {
    fullName: 'Ann',
    agentCode: 'A1',
    email: 'a@b.co',
    groupId: 'g',
    location: 'KL',
  };

  it('returns 201 with the user and no token', async () => {
    mockRegister.mockResolvedValue({ user: { id: 'u1' } });
    const res = makeRes();

    await authController.register(request<IRegisterReq>({ body }), res as unknown as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { user: { id: 'u1' } } });
  });

  it.each([
    [new AgentCodeInvalidError(), 400],
    [new UserAlreadyExistsError(), 409],
  ])('maps %p to %i', async (error, status) => {
    mockRegister.mockRejectedValue(error);
    const next = jest.fn();

    await authController.register(request<IRegisterReq>({ body }), makeRes() as unknown as Response, next);

    expect(statusOf(next)).toBe(status);
  });

  it('forwards an unexpected failure as a ControllerError', async () => {
    mockRegister.mockRejectedValue(new Error('boom'));
    const next = jest.fn();

    await authController.register(request<IRegisterReq>({ body }), makeRes() as unknown as Response, next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(ControllerError);
  });
});

describe('AuthController.login', () => {
  it('returns the session', async () => {
    mockLogin.mockResolvedValue({ session: 's' });
    const res = makeRes();

    await authController.login(request<ILoginReq>({ body: { email: 'a@b.co' } }), res as unknown as Response, jest.fn());

    expect(mockLogin).toHaveBeenCalledWith('a@b.co');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { session: 's' } });
  });

  it.each([
    [new InvalidCredentialsError(), 400],
    [new CognitoRateLimitedError(), 429],
  ])('maps %p to %i', async (error, status) => {
    mockLogin.mockRejectedValue(error);
    const next = jest.fn();

    await authController.login(request<ILoginReq>({ body: { email: 'a@b.co' } }), makeRes() as unknown as Response, next);

    expect(statusOf(next)).toBe(status);
  });
});

describe('AuthController.verifyLogin', () => {
  const body = { email: 'a@b.co', session: 's', code: '123456' };

  it('returns the user and tokens', async () => {
    mockVerifyLogin.mockResolvedValue({ user: { id: 'u1' }, tokens: { accessToken: 't' } });
    const res = makeRes();

    await authController.verifyLogin(request<IVerifyLoginReq>({ body }), res as unknown as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { user: { id: 'u1' }, tokens: { accessToken: 't' } },
    });
  });

  it.each([
    [new InvalidCredentialsError(), 400],
    [new UserInactiveError(), 403],
    [new CognitoRateLimitedError(), 429],
  ])('maps %p to %i', async (error, status) => {
    mockVerifyLogin.mockRejectedValue(error);
    const next = jest.fn();

    await authController.verifyLogin(request<IVerifyLoginReq>({ body }), makeRes() as unknown as Response, next);

    expect(statusOf(next)).toBe(status);
  });
});

describe('AuthController.logout', () => {
  it('rejects a request without a bearer token', async () => {
    const next = jest.fn();

    await authController.logout(request<ILogoutReq>({}), makeRes() as unknown as Response, next);

    expect(statusOf(next)).toBe(401);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('signs the bearer token out', async () => {
    mockLogout.mockResolvedValue(undefined);
    const res = makeRes();

    await authController.logout(
      request<ILogoutReq>({ headers: { authorization: 'Bearer abc' } }),
      res as unknown as Response,
      jest.fn(),
    );

    expect(mockLogout).toHaveBeenCalledWith('abc');
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});

describe('AuthController.me', () => {
  it('returns the caller', async () => {
    mockMe.mockResolvedValue({ id: 'u1' });
    const res = makeRes();

    await authController.me(request<IMeReq>({ user: { id: 'u1' } }), res as unknown as Response, jest.fn());

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'u1' } });
  });

  it('returns 404 when the user item is missing', async () => {
    mockMe.mockResolvedValue(null);
    const next = jest.fn();

    await authController.me(request<IMeReq>({ user: { id: 'u1' } }), makeRes() as unknown as Response, next);

    expect(statusOf(next)).toBe(404);
  });
});
