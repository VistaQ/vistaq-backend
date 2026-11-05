import type { NextFunction, Request, Response } from 'express';

const mockVerify = jest.fn();
const mockGetUserContext = jest.fn();

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: jest.fn(() => ({ verify: mockVerify })) },
}));

jest.mock('@src/utils/env', () => ({
  __esModule: true,
  default: { CognitoUserPoolId: 'pool', CognitoClientId: 'client' },
}));

jest.mock('@src/services/auth.service', () => ({
  __esModule: true,
  default: { getUserContext: mockGetUserContext },
}));

import { authenticate } from '@src/middleware/auth';
import { RouteError } from '@src/models/errors/route.error';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

const activeUser = {
  id: 'sub-1',
  tenant_id: 'tenant-1',
  role: 'trainer',
  group_id: null,
  status: 'active',
};

const gatewayRequest = (claims: Record<string, unknown>): Request =>
  ({
    headers: {},
    apiGateway: {
      event: { requestContext: { authorizer: { jwt: { claims } } } },
    },
  }) as unknown as Request;

const localRequest = (authorization?: string): Request =>
  ({ headers: authorization ? { authorization } : {} }) as unknown as Request;

const run = async (req: Request): Promise<jest.Mock> => {
  const next = jest.fn() as jest.Mock & NextFunction;
  await authenticate(req, {} as Response, next);
  return next;
};

const rejectedWith = (next: jest.Mock): RouteError => {
  expect(next).toHaveBeenCalledTimes(1);
  const error = next.mock.calls[0][0] as RouteError;
  expect(error).toBeInstanceOf(RouteError);
  return error;
};

describe('authenticate middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('behind the gateway', () => {
    it('loads the user by subject and sets req.user from the record', async () => {
      mockGetUserContext.mockResolvedValue(activeUser);
      const req = gatewayRequest({ sub: 'sub-1' });

      const next = await run(req);

      expect(mockGetUserContext).toHaveBeenCalledWith('sub-1');
      expect(next).toHaveBeenCalledWith();
      expect(req.user).toEqual({
        id: 'sub-1',
        tenant_id: 'tenant-1',
        role: 'trainer',
        group_id: null,
      });
      expect(mockVerify).not.toHaveBeenCalled();
    });

    it('uses the stored role, not a role carried in the token', async () => {
      mockGetUserContext.mockResolvedValue({ ...activeUser, role: 'agent' });
      const req = gatewayRequest({ sub: 'sub-1', 'cognito:groups': ['admin'] });

      await run(req);

      expect(req.user?.role).toBe('agent');
    });

    it('rejects with 401 when the claims have no subject', async () => {
      const next = await run(gatewayRequest({}));

      expect(rejectedWith(next).status).toBe(HttpStatusCodes.UNAUTHORIZED);
    });

    it('rejects with 401 when the subject has no user record', async () => {
      mockGetUserContext.mockResolvedValue(null);

      const next = await run(gatewayRequest({ sub: 'ghost' }));

      expect(rejectedWith(next).status).toBe(HttpStatusCodes.UNAUTHORIZED);
    });

    it('rejects an inactive user with 403 even though the token is valid', async () => {
      mockGetUserContext.mockResolvedValue({
        ...activeUser,
        status: 'inactive',
      });

      const next = await run(gatewayRequest({ sub: 'sub-1' }));

      const error = rejectedWith(next);
      expect(error.status).toBe(HttpStatusCodes.FORBIDDEN);
      expect(error.message).toBe('Account is inactive');
    });

    it.each([['role']])(
      'rejects with 401 when the user record has no %s',
      async (field) => {
        mockGetUserContext.mockResolvedValue({ ...activeUser, [field]: null });

        const next = await run(gatewayRequest({ sub: 'sub-1' }));

        expect(rejectedWith(next).status).toBe(HttpStatusCodes.UNAUTHORIZED);
      },
    );

    it('rejects with 401 when the user lookup fails', async () => {
      mockGetUserContext.mockRejectedValue(new Error('db down'));

      const next = await run(gatewayRequest({ sub: 'sub-1' }));

      expect(rejectedWith(next).status).toBe(HttpStatusCodes.UNAUTHORIZED);
    });
  });

  describe('without the gateway (local development)', () => {
    it('verifies the bearer token and uses its subject', async () => {
      mockVerify.mockResolvedValue({ sub: 'sub-1' });
      mockGetUserContext.mockResolvedValue(activeUser);
      const req = localRequest('Bearer good-token');

      const next = await run(req);

      expect(mockVerify).toHaveBeenCalledWith('good-token');
      expect(mockGetUserContext).toHaveBeenCalledWith('sub-1');
      expect(next).toHaveBeenCalledWith();
      expect(req.user?.id).toBe('sub-1');
    });

    it('rejects with 401 when there is no Authorization header', async () => {
      const next = await run(localRequest());

      expect(rejectedWith(next).status).toBe(HttpStatusCodes.UNAUTHORIZED);
      expect(mockVerify).not.toHaveBeenCalled();
    });

    it('rejects with 401 when the token fails verification', async () => {
      mockVerify.mockRejectedValue(new Error('invalid signature'));

      const next = await run(localRequest('Bearer forged'));

      expect(rejectedWith(next).status).toBe(HttpStatusCodes.UNAUTHORIZED);
      expect(mockGetUserContext).not.toHaveBeenCalled();
    });
  });
});
