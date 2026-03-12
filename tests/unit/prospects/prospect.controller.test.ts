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

import { prospectController } from '@src/controllers/prospect.controller';
import type { ICreateProspectReq, IGetProspectByIdReq } from '@src/controllers/prospect.controller';
import { prospectService } from '@src/services/prospect.service';
import { RouteError } from '@src/models/errors/route.error';
import { ControllerError } from '@src/models/errors/layer.errors';
import type { IProspect } from '@src/types/auth.types';
import type { IBaseReq } from '@src/models/interfaces/base.interface';

/******************************************************************************
  Fixtures
******************************************************************************/

const PROSPECT_ID = '11111111-2222-3333-4444-555555555555';
const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const AGENT_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const GROUP_ID = 'cccccccc-dddd-eeee-ffff-000000000000';
const USER_TOKEN = 'test-token';

const mockProspect: IProspect = {
  id: PROSPECT_ID,
  tenant_id: TENANT_ID,
  agent_id: AGENT_ID,
  group_id: GROUP_ID,
  prospect_name: 'John Doe',
  prospect_email: 'john@example.com',
  prospect_phone: '+61400000000',
  current_stage: 'prospect',
  prospect_entered_at: '2024-01-01T00:00:00.000Z',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

/******************************************************************************
  Helpers
******************************************************************************/

function makeReq(overrides: Partial<ICreateProspectReq> = {}): ICreateProspectReq {
  return {
    headers: { authorization: `Bearer ${USER_TOKEN}` },
    body: { fullName: 'John Doe', phoneNum: '+61400000000', email: 'john@example.com' },
    user: { id: AGENT_ID, tenant_id: TENANT_ID, role: 'agent', group_id: GROUP_ID },
    ...overrides,
  } as unknown as ICreateProspectReq;
}

function makeBaseReq(overrides: Partial<IBaseReq> = {}): IBaseReq {
  return {
    headers: { authorization: `Bearer ${USER_TOKEN}` },
    user: { id: AGENT_ID, tenant_id: TENANT_ID, role: 'agent', group_id: GROUP_ID },
    ...overrides,
  } as unknown as IBaseReq;
}

function makeGetByIdReq(overrides: Partial<IGetProspectByIdReq> = {}): IGetProspectByIdReq {
  return {
    headers: { authorization: `Bearer ${USER_TOKEN}` },
    user: { id: AGENT_ID, tenant_id: TENANT_ID, role: 'agent', group_id: GROUP_ID },
    params: { prospectId: PROSPECT_ID },
    ...overrides,
  } as unknown as IGetProspectByIdReq;
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
  Test suite — ProspectController.create
******************************************************************************/

describe('ProspectController.create', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 201 with { success: true, data: prospect } when role is agent and all params valid', async () => {
    jest.spyOn(prospectService, 'createProspect').mockResolvedValue(mockProspect);

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await prospectController.create(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockProspect,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 201 when role is group_leader', async () => {
    jest.spyOn(prospectService, 'createProspect').mockResolvedValue(mockProspect);

    const req = makeReq({
      user: { id: AGENT_ID, tenant_id: TENANT_ID, role: 'group_leader', group_id: GROUP_ID },
    } as Partial<ICreateProspectReq>);
    const res = makeRes();
    const next = makeNext();

    await prospectController.create(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockProspect,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when role is not agent or group_leader', async () => {
    const req = makeReq({
      user: { id: AGENT_ID, tenant_id: TENANT_ID, role: 'manager', group_id: null },
    } as Partial<ICreateProspectReq>);
    const res = makeRes();
    const next = makeNext();

    await prospectController.create(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(403);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next(ControllerError) when prospectService.createProspect throws', async () => {
    jest.spyOn(prospectService, 'createProspect').mockRejectedValue(new Error('unexpected db failure'));

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    await prospectController.create(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ControllerError);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('passes group_id as null when req.user.group_id is null', async () => {
    const prospectWithNullGroup: IProspect = { ...mockProspect, group_id: null };
    const createProspectSpy = jest
      .spyOn(prospectService, 'createProspect')
      .mockResolvedValue(prospectWithNullGroup);

    const req = makeReq({
      user: { id: AGENT_ID, tenant_id: TENANT_ID, role: 'agent', group_id: null },
    } as Partial<ICreateProspectReq>);
    const res = makeRes();
    const next = makeNext();

    await prospectController.create(req, res, next as NextFunction);

    expect(createProspectSpy).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: null }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('passes undefined phoneNum and email when optional fields are not provided', async () => {
    const prospectWithNoContact: IProspect = {
      ...mockProspect,
      prospect_email: null,
      prospect_phone: null,
    };
    const createProspectSpy = jest
      .spyOn(prospectService, 'createProspect')
      .mockResolvedValue(prospectWithNoContact);

    const req = makeReq({
      body: { fullName: 'John Doe' },
    } as Partial<ICreateProspectReq>);
    const res = makeRes();
    const next = makeNext();

    await prospectController.create(req, res, next as NextFunction);

    expect(createProspectSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        prospectPhone: undefined,
        prospectEmail: undefined,
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

/******************************************************************************
  Test suite — ProspectController.getAll
******************************************************************************/

describe('ProspectController.getAll', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with { success: true, data: prospects } when service returns a non-empty array', async () => {
    jest.spyOn(prospectService, 'getProspects').mockResolvedValue([mockProspect]);

    const req = makeBaseReq();
    const res = makeRes();
    const next = makeNext();

    await prospectController.getAll(req as unknown as IBaseReq, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [mockProspect],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 200 with { success: true, data: [] } when service returns an empty array', async () => {
    jest.spyOn(prospectService, 'getProspects').mockResolvedValue([]);

    const req = makeBaseReq();
    const res = makeRes();
    const next = makeNext();

    await prospectController.getAll(req as unknown as IBaseReq, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next(ControllerError) when prospectService.getProspects throws', async () => {
    jest.spyOn(prospectService, 'getProspects').mockRejectedValue(new Error('db failure'));

    const req = makeBaseReq();
    const res = makeRes();
    const next = makeNext();

    await prospectController.getAll(req as unknown as IBaseReq, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ControllerError);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

/******************************************************************************
  Test suite — ProspectController.getById
******************************************************************************/

describe('ProspectController.getById', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with { success: true, data: prospect } when service returns a prospect', async () => {
    jest.spyOn(prospectService, 'getProspectById').mockResolvedValue(mockProspect);

    const req = makeGetByIdReq();
    const res = makeRes();
    const next = makeNext();

    await prospectController.getById(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockProspect,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next(RouteError) with status 404 when service returns null', async () => {
    jest.spyOn(prospectService, 'getProspectById').mockResolvedValue(null);

    const req = makeGetByIdReq();
    const res = makeRes();
    const next = makeNext();

    await prospectController.getById(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(RouteError);
    expect((err as RouteError).status).toBe(404);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('calls next(ControllerError) when prospectService.getProspectById throws', async () => {
    jest.spyOn(prospectService, 'getProspectById').mockRejectedValue(new Error('db failure'));

    const req = makeGetByIdReq();
    const res = makeRes();
    const next = makeNext();

    await prospectController.getById(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ControllerError);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
