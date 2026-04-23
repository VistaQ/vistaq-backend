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
import type { IAgentCode } from '@src/types/agentCode';

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

function makeReq(overrides: Partial<ICreateAgentCodesReq> = {}): ICreateAgentCodesReq {
  return {
    headers: { authorization: `Bearer ${USER_TOKEN}` },
    body: { agentCodes: ['ABC123'] },
    user: { id: ADMIN_ID, tenant_id: TENANT_ID, role: 'admin' },
    ...overrides,
  } as unknown as ICreateAgentCodesReq;
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
    expect(res.json).toHaveBeenCalledWith({ agentCodes: mappedResult });
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
