// Supply env vars before env.ts runs so the validation guards do not throw
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

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
    userInsert: jest.fn(),
  },
  supabaseService: {
    adminSelect: jest.fn(),
    adminInsert: jest.fn(),
    adminUpdate: jest.fn(),
    adminDelete: jest.fn(),
    userInsert: jest.fn(),
  },
}));

import type { Response, NextFunction } from 'express';

import { groupController } from '@src/controllers/group.controller';
import type { ICreateGroupReq } from '@src/controllers/group.controller';
import { groupService } from '@src/services/group.service';
import { RouteError } from '@src/models/errors/route.error';
import { ControllerError } from '@src/models/errors/layer.errors';
import {
  InvalidLeaderRoleError,
  InvalidTrainerRoleError,
  UserNotInTenantError,
} from '@src/models/errors/group.errors';
import type { IGroup } from '@src/types/auth.types';

/******************************************************************************
  Fixtures
******************************************************************************/

const GROUP_ID = '11111111-2222-3333-4444-555555555555';
const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const LEADER_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const USER_TOKEN = 'mock-user-jwt-token';

const mockGroup: IGroup = {
  id: GROUP_ID,
  tenant_id: TENANT_ID,
  name: 'Alpha Squad',
  status: 'active',
  leader_id: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

/******************************************************************************
  Helpers
******************************************************************************/

function makeReq(overrides: Partial<ICreateGroupReq> = {}): ICreateGroupReq {
  return {
    headers: { authorization: `Bearer ${USER_TOKEN}` },
    body: { name: 'Alpha Squad' },
    user: { id: 'admin-user-id', tenant_id: TENANT_ID, role: 'admin' },
    ...overrides,
  } as unknown as ICreateGroupReq;
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
  Test suite — GroupController.create
******************************************************************************/

describe('GroupController.create', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 403 when user role is not admin', async () => {
    const req = makeReq({ user: { id: 'agent-id', tenant_id: TENANT_ID, role: 'agent' } } as Partial<ICreateGroupReq>);
    const res = makeRes();
    const next = makeNext();

    await groupController.create(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(403);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 201 with group data on success', async () => {
    jest.spyOn(groupService, 'createGroup').mockResolvedValue(mockGroup);

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await groupController.create(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockGroup,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 201 with group data when leader_id is provided', async () => {
    const groupWithLeader: IGroup = { ...mockGroup, leader_id: LEADER_ID };
    jest.spyOn(groupService, 'createGroup').mockResolvedValue(groupWithLeader);

    const req = makeReq({
      body: { name: 'Alpha Squad', leader_id: LEADER_ID },
    } as Partial<ICreateGroupReq>);
    const res = makeRes();
    const next = makeNext();

    await groupController.create(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: groupWithLeader,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 when service throws UserNotInTenantError', async () => {
    jest.spyOn(groupService, 'createGroup').mockRejectedValue(new UserNotInTenantError());

    const req = makeReq({ body: { name: 'Alpha Squad', leader_id: LEADER_ID } } as Partial<ICreateGroupReq>);
    const res = makeRes();
    const next = makeNext();

    await groupController.create(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(400);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 400 when service throws InvalidLeaderRoleError', async () => {
    jest.spyOn(groupService, 'createGroup').mockRejectedValue(new InvalidLeaderRoleError());

    const req = makeReq({ body: { name: 'Alpha Squad', leader_id: LEADER_ID } } as Partial<ICreateGroupReq>);
    const res = makeRes();
    const next = makeNext();

    await groupController.create(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(400);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 400 when service throws InvalidTrainerRoleError', async () => {
    jest.spyOn(groupService, 'createGroup').mockRejectedValue(new InvalidTrainerRoleError());

    const req = makeReq({ body: { name: 'Alpha Squad', trainer_id: 'trainer-uuid' } } as Partial<ICreateGroupReq>);
    const res = makeRes();
    const next = makeNext();

    await groupController.create(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(400);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next(ControllerError) for unexpected errors', async () => {
    jest.spyOn(groupService, 'createGroup').mockRejectedValue(new Error('unexpected db failure'));

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await groupController.create(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ControllerError);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
