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
import type { ICreateGroupReq, IGetGroupByIdReq, IUpdateGroupReq } from '@src/controllers/group.controller';
import type { IBaseReq } from '@src/models/interfaces/base.interface';
import { groupService } from '@src/services/group.service';
import { RouteError } from '@src/models/errors/route.error';
import { ControllerError } from '@src/models/errors/layer.errors';
import {
  GroupNotFoundError,
  InvalidLeaderError,
  InvalidLeaderRoleError,
  InvalidTrainerError,
  InvalidTrainerRoleError,
  MissingMembersError,
  UserNotInTenantError,
} from '@src/models/errors/group.errors';
import { UserNotFoundError } from '@src/models/errors/auth.errors';
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

function makeGetAllReq(overrides: Partial<IBaseReq> = {}): IBaseReq {
  return {
    headers: { authorization: `Bearer ${USER_TOKEN}` },
    user: { id: 'user-id', tenant_id: TENANT_ID, role: 'agent' },
    ...overrides,
  } as unknown as IBaseReq;
}

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
  Test suite — GroupController.getAll
******************************************************************************/

describe('GroupController.getAll', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with IGroup[] on success', async () => {
    const mockGroups: IGroup[] = [mockGroup];
    jest.spyOn(groupService, 'getGroups').mockResolvedValue(mockGroups);

    const req = makeGetAllReq();
    const res = makeRes();
    const next = makeNext();

    await groupController.getAll(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockGroups,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 200 with empty array when no groups exist', async () => {
    jest.spyOn(groupService, 'getGroups').mockResolvedValue([]);

    const req = makeGetAllReq();
    const res = makeRes();
    const next = makeNext();

    await groupController.getAll(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next(ControllerError) for unexpected errors', async () => {
    jest.spyOn(groupService, 'getGroups').mockRejectedValue(new Error('unexpected db failure'));

    const req = makeGetAllReq();
    const res = makeRes();
    const next = makeNext();

    await groupController.getAll(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ControllerError);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

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

/******************************************************************************
  Test suite — GroupController.update
******************************************************************************/

function makeGetByIdReq(overrides: Partial<IGetGroupByIdReq> = {}): IGetGroupByIdReq {
  return {
    headers: { authorization: `Bearer ${USER_TOKEN}` },
    params: { groupId: GROUP_ID },
    user: { id: 'user-id', tenant_id: TENANT_ID, role: 'agent' },
    ...overrides,
  } as unknown as IGetGroupByIdReq;
}

/******************************************************************************
  Test suite — GroupController.getById
******************************************************************************/

describe('GroupController.getById', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with { success: true, data: group } when group found', async () => {
    jest.spyOn(groupService, 'getGroupById').mockResolvedValue(mockGroup);

    const req = makeGetByIdReq();
    const res = makeRes();
    const next = makeNext();

    await groupController.getById(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockGroup,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next(RouteError(404)) when service returns null', async () => {
    jest.spyOn(groupService, 'getGroupById').mockResolvedValue(null);

    const req = makeGetByIdReq();
    const res = makeRes();
    const next = makeNext();

    await groupController.getById(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(404);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls handleControllerError when service throws', async () => {
    jest.spyOn(groupService, 'getGroupById').mockRejectedValue(new Error('unexpected db failure'));

    const req = makeGetByIdReq();
    const res = makeRes();
    const next = makeNext();

    await groupController.getById(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ControllerError);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

function makeUpdateReq(overrides: Partial<IUpdateGroupReq> = {}): IUpdateGroupReq {
  return {
    headers: { authorization: `Bearer ${USER_TOKEN}` },
    params: { groupId: GROUP_ID },
    body: { name: 'Updated Squad' },
    user: { id: 'admin-user-id', tenant_id: TENANT_ID, role: 'admin' },
    ...overrides,
  } as unknown as IUpdateGroupReq;
}

describe('GroupController.update', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 403 when role is not admin', async () => {
    const req = makeUpdateReq({ user: { id: 'agent-id', tenant_id: TENANT_ID, role: 'agent' } } as Partial<IUpdateGroupReq>);
    const res = makeRes();
    const next = makeNext();

    await groupController.update(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(403);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 200 with updated group on success', async () => {
    const updatedGroup: IGroup = { ...mockGroup, name: 'Updated Squad' };
    jest.spyOn(groupService, 'updateGroup').mockResolvedValue(updatedGroup);

    const req = makeUpdateReq();
    const res = makeRes();
    const next = makeNext();

    await groupController.update(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: updatedGroup,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 when service throws GroupNotFoundError', async () => {
    jest.spyOn(groupService, 'updateGroup').mockRejectedValue(new GroupNotFoundError());

    const req = makeUpdateReq();
    const res = makeRes();
    const next = makeNext();

    await groupController.update(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(404);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 404 when service throws UserNotFoundError', async () => {
    jest.spyOn(groupService, 'updateGroup').mockRejectedValue(new UserNotFoundError());

    const req = makeUpdateReq();
    const res = makeRes();
    const next = makeNext();

    await groupController.update(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(404);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 400 when service throws InvalidLeaderError', async () => {
    jest.spyOn(groupService, 'updateGroup').mockRejectedValue(new InvalidLeaderError());

    const req = makeUpdateReq();
    const res = makeRes();
    const next = makeNext();

    await groupController.update(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(400);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 400 when service throws InvalidTrainerError', async () => {
    jest.spyOn(groupService, 'updateGroup').mockRejectedValue(new InvalidTrainerError());

    const req = makeUpdateReq();
    const res = makeRes();
    const next = makeNext();

    await groupController.update(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(400);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns 400 when service throws MissingMembersError', async () => {
    jest.spyOn(groupService, 'updateGroup').mockRejectedValue(new MissingMembersError());

    const req = makeUpdateReq();
    const res = makeRes();
    const next = makeNext();

    await groupController.update(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(400);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls handleControllerError for unexpected errors', async () => {
    jest.spyOn(groupService, 'updateGroup').mockRejectedValue(new Error('unexpected db failure'));

    const req = makeUpdateReq();
    const res = makeRes();
    const next = makeNext();

    await groupController.update(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ControllerError);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
