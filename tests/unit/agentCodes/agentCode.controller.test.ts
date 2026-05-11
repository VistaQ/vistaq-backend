// Supply env vars before env.ts runs so the validation guards do not throw
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

jest.mock('@src/services/logging.service', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AsyncLocalStorage } = require('async_hooks');
  return {
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
    asyncLocalStorage: new AsyncLocalStorage(),
  };
});

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: { userUpsert: jest.fn() },
  supabaseService: { userUpsert: jest.fn() },
}));

import type { Response, NextFunction } from 'express';

import { agentCodeController } from '@src/controllers/agentCode.controller';
import type { ICreateAgentCodesReq } from '@src/controllers/agentCode.controller';
import { agentCodeService } from '@src/services/agentCode.service';
import { RouteError } from '@src/models/errors/route.error';
import { ControllerError } from '@src/models/errors/layer.errors';
import { AgentCodeNotFoundError, AgentCodeConflictError } from '@src/models/errors/agentCode.errors';
import type { IAgentCode } from '@src/types/agentCode';
import type { IBaseReq } from '@src/models/interfaces/base.interface';

/******************************************************************************
  Fixtures
******************************************************************************/

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ADMIN_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const USER_TOKEN = 'mock-token';

const mockResult: IAgentCode[] = [
  {
    agent_code: 'ABC123',
    is_used: false,
    user_id: null,
    created_at: '2026-04-23T00:00:00.000Z',
    updated_at: '2026-04-23T00:00:00.000Z',
  },
];

const mappedResult = [
  {
    agentCode: 'ABC123',
    isUsed: false,
    createdAt: '2026-04-23T00:00:00.000Z',
    updatedAt: '2026-04-23T00:00:00.000Z',
  },
];

const mockListResult: IAgentCode[] = [
  {
    agent_code: 'ABC123',
    is_used: false,
    user_id: null,
    created_at: '2026-04-23T00:00:00.000Z',
    updated_at: '2026-04-23T00:00:00.000Z',
  },
  {
    agent_code: 'XYZ789',
    is_used: true,
    user_id: 'user-uuid-111',
    created_at: '2026-04-24T00:00:00.000Z',
    updated_at: '2026-04-24T00:00:00.000Z',
  },
];

function makeReq(overrides: Partial<ICreateAgentCodesReq> = {}): ICreateAgentCodesReq {
  return {
    headers: { authorization: `Bearer ${USER_TOKEN}` },
    body: { agentCodes: ['ABC123'] },
    user: { id: ADMIN_ID, tenant_id: TENANT_ID, role: 'admin' },
    ...overrides,
  } as unknown as ICreateAgentCodesReq;
}

function makeListReq(queryOverrides: Record<string, string> = {}, userOverrides: Partial<{ id: string; tenant_id: string; role: string }> = {}): IBaseReq {
  return {
    headers: { authorization: `Bearer ${USER_TOKEN}` },
    query: queryOverrides,
    body: {},
    user: { id: ADMIN_ID, tenant_id: TENANT_ID, role: 'admin', ...userOverrides },
  } as unknown as IBaseReq;
}

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
  Test suite — AgentCodeController.createMany
******************************************************************************/

describe('AgentCodeController.createMany', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with camelCase-mapped agentCodes when role is admin', async () => {
    jest.spyOn(agentCodeService, 'createMany').mockResolvedValue(mockResult);

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.createMany(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: mappedResult });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls service with agentCodes, tenantId from JWT, and bearer token', async () => {
    const spy = jest
      .spyOn(agentCodeService, 'createMany')
      .mockResolvedValue(mockResult);

    const req = makeReq({
      body: { agentCodes: ['X', 'Y'] },
    } as Partial<ICreateAgentCodesReq>);
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.createMany(req, res, next as NextFunction);

    expect(spy).toHaveBeenCalledWith({
      agentCodes: ['X', 'Y'],
      tenantId: TENANT_ID,
      token: USER_TOKEN,
    });
  });

  it('calls next(RouteError) with status 403 when role is not admin', async () => {
    const req = makeReq({
      user: { id: ADMIN_ID, tenant_id: TENANT_ID, role: 'agent' },
    } as Partial<ICreateAgentCodesReq>);
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.createMany(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(403);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next(RouteError) with status 403 when role is group_leader', async () => {
    const req = makeReq({
      user: { id: ADMIN_ID, tenant_id: TENANT_ID, role: 'group_leader' },
    } as Partial<ICreateAgentCodesReq>);
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.createMany(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(403);
  });

  it('calls next(ControllerError) when agentCodeService.createMany throws', async () => {
    jest
      .spyOn(agentCodeService, 'createMany')
      .mockRejectedValue(new Error('db failure'));

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.createMany(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ControllerError);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

/******************************************************************************
  Test suite — AgentCodeController.list
******************************************************************************/

describe('AgentCodeController.list', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 403 when role is not admin', async () => {
    const req = makeListReq({}, { role: 'agent' });
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.list(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(403);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 403 when role is group_leader', async () => {
    const req = makeListReq({}, { role: 'group_leader' });
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.list(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(403);
  });

  it('returns 400 when isUsed query param is not "true" or "false"', async () => {
    const req = makeListReq({ isUsed: 'maybe' });
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.list(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Validation failed' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 when isUsed query param is an integer string', async () => {
    const req = makeListReq({ isUsed: '1' });
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.list(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Validation failed' }),
    );
  });

  it('calls agentCodeService.list with { isUsed: true, token } when ?isUsed=true', async () => {
    const spy = jest
      .spyOn(agentCodeService, 'list')
      .mockResolvedValue(mockListResult);

    const req = makeListReq({ isUsed: 'true' });
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.list(req, res, next as NextFunction);

    expect(spy).toHaveBeenCalledWith({ isUsed: true, token: USER_TOKEN });
  });

  it('calls agentCodeService.list with { isUsed: false, token } when ?isUsed=false', async () => {
    const spy = jest
      .spyOn(agentCodeService, 'list')
      .mockResolvedValue(mockListResult);

    const req = makeListReq({ isUsed: 'false' });
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.list(req, res, next as NextFunction);

    expect(spy).toHaveBeenCalledWith({ isUsed: false, token: USER_TOKEN });
  });

  it('calls agentCodeService.list with { isUsed: undefined, token } when no query param', async () => {
    const spy = jest
      .spyOn(agentCodeService, 'list')
      .mockResolvedValue(mockListResult);

    const req = makeListReq();
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.list(req, res, next as NextFunction);

    expect(spy).toHaveBeenCalledWith({ isUsed: undefined, token: USER_TOKEN });
  });

  it('returns 200 with { success: true, data: [...] } and maps user_id to userId', async () => {
    jest.spyOn(agentCodeService, 'list').mockResolvedValue(mockListResult);

    const req = makeListReq();
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.list(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        {
          agentCode: 'ABC123',
          isUsed: false,
          userId: null,
          createdAt: '2026-04-23T00:00:00.000Z',
          updatedAt: '2026-04-23T00:00:00.000Z',
        },
        {
          agentCode: 'XYZ789',
          isUsed: true,
          userId: 'user-uuid-111',
          createdAt: '2026-04-24T00:00:00.000Z',
          updatedAt: '2026-04-24T00:00:00.000Z',
        },
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next(ControllerError) when agentCodeService.list throws', async () => {
    jest
      .spyOn(agentCodeService, 'list')
      .mockRejectedValue(new Error('service failure'));

    const req = makeListReq();
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.list(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ControllerError);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

/******************************************************************************
  Test suite — AgentCodeController.update
******************************************************************************/

const mockUpdatedAgentCode: IAgentCode = {
  agent_code: 'NEW001',
  is_used: true,
  user_id: 'user-uuid-111',
  created_at: '2026-05-01T12:00:00.000Z',
  updated_at: '2026-05-12T08:00:00.000Z',
};

function makeUpdateReq(overrides: Partial<IBaseReq> = {}): IBaseReq {
  return {
    headers: { authorization: `Bearer ${USER_TOKEN}` },
    params: { agentCode: 'OLD001' },
    body: { agentCode: 'NEW001' },
    user: { id: ADMIN_ID, tenant_id: TENANT_ID, role: 'admin' },
    ...overrides,
  } as unknown as IBaseReq;
}

describe('AgentCodeController.update', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 403 when role is not admin', async () => {
    const req = makeUpdateReq({
      user: { id: ADMIN_ID, tenant_id: TENANT_ID, role: 'agent' },
    } as Partial<IBaseReq>);
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.update(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(403);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls agentCodeService.update with correct params from req', async () => {
    const spy = jest
      .spyOn(agentCodeService, 'update')
      .mockResolvedValue(mockUpdatedAgentCode);

    const req = makeUpdateReq();
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.update(req, res, next as NextFunction);

    expect(spy).toHaveBeenCalledWith({
      currentAgentCode: 'OLD001',
      newAgentCode: 'NEW001',
      tenantId: TENANT_ID,
      token: USER_TOKEN,
    });
  });

  it('returns 200 with { success: true, data: { agentCode, isUsed, userId, createdAt, updatedAt } } on success', async () => {
    jest
      .spyOn(agentCodeService, 'update')
      .mockResolvedValue(mockUpdatedAgentCode);

    const req = makeUpdateReq();
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.update(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        agentCode: 'NEW001',
        isUsed: true,
        userId: 'user-uuid-111',
        createdAt: '2026-05-01T12:00:00.000Z',
        updatedAt: '2026-05-12T08:00:00.000Z',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next(RouteError) with status 404 when service throws AgentCodeNotFoundError', async () => {
    jest
      .spyOn(agentCodeService, 'update')
      .mockRejectedValue(new AgentCodeNotFoundError());

    const req = makeUpdateReq();
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.update(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(404);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next(RouteError) with status 409 when service throws AgentCodeConflictError', async () => {
    jest
      .spyOn(agentCodeService, 'update')
      .mockRejectedValue(new AgentCodeConflictError());

    const req = makeUpdateReq();
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.update(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(409);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next(ControllerError) for unexpected service errors', async () => {
    jest
      .spyOn(agentCodeService, 'update')
      .mockRejectedValue(new Error('unexpected failure'));

    const req = makeUpdateReq();
    const res = makeRes();
    const next = makeNext();

    await agentCodeController.update(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ControllerError);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
