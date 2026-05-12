import type { NextFunction, Response } from 'express';

/******************************************************************************
  Mocks — must be set up before any module under test is imported
******************************************************************************/

// Mock EnvVars so the env validation guards don't throw during import
jest.mock('@src/utils/env', () => ({
  __esModule: true,
  default: {
    NodeEnv: 'test',
    Port: 3000,
    SupabaseUrl: 'https://mock.supabase.co',
    SupabaseAnonKey: 'mock-anon-key',
    SupabaseServiceRoleKey: 'mock-service-role-key',
  },
  NodeEnvs: { DEV: 'development', TEST: 'test', PRODUCTION: 'production' },
}));

// Mock loggingService to suppress all output during tests
jest.mock('@src/services/logging.service', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  asyncLocalStorage: {
    getStore: jest.fn().mockReturnValue(null),
  },
}));

jest.mock('@sentry/node', () => ({
  withScope: jest.fn((cb) => cb({ setFingerprint: jest.fn(), setLevel: jest.fn(), setExtra: jest.fn() })),
  setTag: jest.fn(),
  setUser: jest.fn(),
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('@src/utils/sentry.metrics', () => ({
  emitErrorCount: jest.fn(),
}));

// Mock userService — used by UserController
jest.mock('@src/services/user.service', () => ({
  __esModule: true,
  default: {
    createUser: jest.fn(),
  },
}));

// Mock userRepository — used by UserService
jest.mock('@src/repositories/user.repository', () => ({
  __esModule: true,
  default: {
    findAgentCode: jest.fn(),
    createAuthUser: jest.fn(),
    insertUser: jest.fn(),
    deleteUser: jest.fn(),
    deleteAuthUser: jest.fn(),
    updateAgentCode: jest.fn(),
  },
}));

import userService from '@src/services/user.service';
import userRepository from '@src/repositories/user.repository';
import userController from '@src/controllers/user.controller';
import { ICreateUserReq } from '@src/controllers/user.controller';
import { ControllerError, ServiceError } from '@src/models/errors/layer.errors';
import { RouteError } from '@src/models/errors/route.error';
import { AgentCodeInvalidError } from '@src/models/errors/auth.errors';
import { IUser } from '@src/types/auth.types';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
  Shared Fixtures
******************************************************************************/

const mockUser: IUser = {
  id: 'user-123',
  tenant_id: 'tenant-456',
  email: 'newuser@example.com',
  name: 'New User',
  role: 'agent',
  agent_code: 'AGT001',
  location: null,
  group_id: null,
  phone: null,
  agency: null,
  sales_target: null,
  status: 'active',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockAgentCodeRecord = {
  id: 'ac-001',
  tenant_id: 'tenant-456',
  agent_code: 'AGT001',
  user_id: null,
  is_used: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

/******************************************************************************
  Helpers
******************************************************************************/

function buildCreateReq(overrides: Partial<{
  role: string;
  body: Partial<ICreateUserReq['body']>;
}> = {}): ICreateUserReq {
  return {
    user: { id: 'admin-001', tenant_id: 'tenant-456', role: overrides.role ?? 'admin' },
    headers: { authorization: 'Bearer mock-token-abc' },
    body: {
      email: 'newuser@example.com',
      name: 'New User',
      password: 'password123',
      role: 'agent',
      agentCode: 'AGT001',
      ...overrides.body,
    },
  } as unknown as ICreateUserReq;
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
  UserController.create — uses mocked userService
******************************************************************************/

describe('UserController.create', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Returns 403 if req.user.role !== 'admin'
  it('calls next with RouteError(FORBIDDEN) when req.user.role is not admin', async () => {
    const req = buildCreateReq({ role: 'agent' });
    const res = buildRes();
    const next = buildNext();

    await userController.create(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(RouteError);
    expect((arg as RouteError).status).toBe(HttpStatusCodes.FORBIDDEN);
    expect((arg as RouteError).message).toBe('Forbidden');
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  // 2. Returns 400 (AgentCodeInvalidError) when agent code is invalid
  it('calls next with RouteError(BAD_REQUEST) when userService.createUser throws AgentCodeInvalidError', async () => {
    (userService.createUser as jest.Mock).mockRejectedValue(new AgentCodeInvalidError());

    const req = buildCreateReq();
    const res = buildRes();
    const next = buildNext();

    await userController.create(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(RouteError);
    expect((arg as RouteError).status).toBe(HttpStatusCodes.BAD_REQUEST);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  // 3. Returns 201 with { success: true, data: IUser } on success
  it('returns 201 with { success: true, data: IUser } when user is created successfully', async () => {
    (userService.createUser as jest.Mock).mockResolvedValue(mockUser);

    const req = buildCreateReq();
    const res = buildRes();
    const next = buildNext();

    await userController.create(req, res, next);

    expect(userService.createUser).toHaveBeenCalledTimes(1);
    expect(userService.createUser).toHaveBeenCalledWith({
      email: 'newuser@example.com',
      name: 'New User',
      password: 'password123',
      role: 'agent',
      agentCode: 'AGT001',
      tenantId: 'tenant-456',
      token: 'mock-token-abc',
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.CREATED);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: mockUser });
    expect(next).not.toHaveBeenCalled();
  });

  // 4. Forwards unexpected errors to next via handleControllerError (ControllerError)
  it('calls next with ControllerError when userService.createUser throws an unexpected error', async () => {
    (userService.createUser as jest.Mock).mockRejectedValue(
      new ServiceError('UserService.createUser failed', new Error('DB error')),
    );

    const req = buildCreateReq();
    const res = buildRes();
    const next = buildNext();

    await userController.create(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const arg: unknown = next.mock.calls[0][0];
    expect(arg).toBeInstanceOf(ControllerError);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

/******************************************************************************
  UserService.createUser — uses mocked userRepository directly
******************************************************************************/

describe('UserService.createUser', () => {
  // Use jest.requireActual to get the real service implementation while
  // allowing it to use the already-mocked userRepository
  const realUserServiceModule = jest.requireActual<typeof import('@src/services/user.service')>(
    '@src/services/user.service',
  );
  const realService = realUserServiceModule.default;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Throws AgentCodeInvalidError when role is agent and findAgentCode returns null
  it('throws AgentCodeInvalidError when role is agent and findAgentCode returns null', async () => {
    (userRepository.findAgentCode as jest.Mock).mockResolvedValue(null);

    await expect(
      realService.createUser({
        email: 'agent@example.com',
        name: 'Agent User',
        password: 'password123',
        role: 'agent',
        agentCode: 'INVALID001',
        tenantId: 'tenant-456',
        token: 'mock-token-abc',
      }),
    ).rejects.toBeInstanceOf(AgentCodeInvalidError);

    expect(userRepository.findAgentCode).toHaveBeenCalledTimes(1);
    expect(userRepository.findAgentCode).toHaveBeenCalledWith('INVALID001', 'tenant-456', 'mock-token-abc');
    expect(userRepository.createAuthUser).not.toHaveBeenCalled();
  });

  // 2. Returns IUser on success (role = agent path)
  it('returns IUser on success for agent role — validates code, creates auth user, inserts user, updates agent code', async () => {
    (userRepository.findAgentCode as jest.Mock).mockResolvedValue(mockAgentCodeRecord);
    (userRepository.createAuthUser as jest.Mock).mockResolvedValue({ id: 'user-123' });
    (userRepository.insertUser as jest.Mock).mockResolvedValue(mockUser);
    (userRepository.updateAgentCode as jest.Mock).mockResolvedValue(undefined);

    const result = await realService.createUser({
      email: 'agent@example.com',
      name: 'Agent User',
      password: 'password123',
      role: 'agent',
      agentCode: 'AGT001',
      tenantId: 'tenant-456',
      token: 'mock-token-abc',
    });

    expect(result).toEqual(mockUser);
    expect(userRepository.findAgentCode).toHaveBeenCalledTimes(1);
    expect(userRepository.findAgentCode).toHaveBeenCalledWith('AGT001', 'tenant-456', 'mock-token-abc');
    expect(userRepository.createAuthUser).toHaveBeenCalledTimes(1);
    expect(userRepository.createAuthUser).toHaveBeenCalledWith('agent@example.com', 'password123');
    expect(userRepository.insertUser).toHaveBeenCalledTimes(1);
    expect(userRepository.insertUser).toHaveBeenCalledWith(
      {
        id: 'user-123',
        email: 'agent@example.com',
        name: 'Agent User',
        role: 'agent',
        tenant_id: 'tenant-456',
        agent_code: 'AGT001',
      },
      'mock-token-abc',
    );
    expect(userRepository.updateAgentCode).toHaveBeenCalledTimes(1);
    expect(userRepository.updateAgentCode).toHaveBeenCalledWith('ac-001', 'user-123', 'mock-token-abc');
  });

  // 3. Returns IUser on success (non-agent path — no agent code validation, no agent code update)
  it('returns IUser on success for non-agent role — skips agent code validation and update', async () => {
    const trainerUser: IUser = { ...mockUser, role: 'trainer', agent_code: null };
    (userRepository.createAuthUser as jest.Mock).mockResolvedValue({ id: 'user-123' });
    (userRepository.insertUser as jest.Mock).mockResolvedValue(trainerUser);

    const result = await realService.createUser({
      email: 'trainer@example.com',
      name: 'Trainer User',
      password: 'password123',
      role: 'trainer',
      tenantId: 'tenant-456',
      token: 'mock-token-abc',
    });

    expect(result).toEqual(trainerUser);
    expect(userRepository.findAgentCode).not.toHaveBeenCalled();
    expect(userRepository.createAuthUser).toHaveBeenCalledTimes(1);
    expect(userRepository.insertUser).toHaveBeenCalledTimes(1);
    expect(userRepository.insertUser).toHaveBeenCalledWith(
      {
        id: 'user-123',
        email: 'trainer@example.com',
        name: 'Trainer User',
        role: 'trainer',
        tenant_id: 'tenant-456',
        agent_code: null,
      },
      'mock-token-abc',
    );
    expect(userRepository.updateAgentCode).not.toHaveBeenCalled();
  });

  // 4. Calls deleteAuthUser (rollback) if insertUser throws after createAuthUser succeeds
  it('calls deleteAuthUser as rollback when insertUser throws after createAuthUser succeeds', async () => {
    const insertError = new Error('Insert failed');
    (userRepository.findAgentCode as jest.Mock).mockResolvedValue(mockAgentCodeRecord);
    (userRepository.createAuthUser as jest.Mock).mockResolvedValue({ id: 'user-123' });
    (userRepository.insertUser as jest.Mock).mockRejectedValue(insertError);
    (userRepository.deleteAuthUser as jest.Mock).mockResolvedValue(undefined);

    await expect(
      realService.createUser({
        email: 'agent@example.com',
        name: 'Agent User',
        password: 'password123',
        role: 'agent',
        agentCode: 'AGT001',
        tenantId: 'tenant-456',
        token: 'mock-token-abc',
      }),
    ).rejects.toBeInstanceOf(ServiceError);

    expect(userRepository.createAuthUser).toHaveBeenCalledTimes(1);
    expect(userRepository.insertUser).toHaveBeenCalledTimes(1);
    expect(userRepository.deleteAuthUser).toHaveBeenCalledTimes(1);
    expect(userRepository.deleteAuthUser).toHaveBeenCalledWith('user-123');
  });

  // 5. Calls deleteUser and deleteAuthUser (rollback) if updateAgentCode throws after insertUser succeeds
  it('calls deleteUser and deleteAuthUser as rollback when updateAgentCode throws after insertUser succeeds', async () => {
    const updateError = new Error('Agent code update failed');
    (userRepository.findAgentCode as jest.Mock).mockResolvedValue(mockAgentCodeRecord);
    (userRepository.createAuthUser as jest.Mock).mockResolvedValue({ id: 'user-123' });
    (userRepository.insertUser as jest.Mock).mockResolvedValue(mockUser);
    (userRepository.updateAgentCode as jest.Mock).mockRejectedValue(updateError);
    (userRepository.deleteUser as jest.Mock).mockResolvedValue(undefined);
    (userRepository.deleteAuthUser as jest.Mock).mockResolvedValue(undefined);

    await expect(
      realService.createUser({
        email: 'agent@example.com',
        name: 'Agent User',
        password: 'password123',
        role: 'agent',
        agentCode: 'AGT001',
        tenantId: 'tenant-456',
        token: 'mock-token-abc',
      }),
    ).rejects.toBeInstanceOf(ServiceError);

    expect(userRepository.updateAgentCode).toHaveBeenCalledTimes(1);
    expect(userRepository.deleteUser).toHaveBeenCalledTimes(1);
    expect(userRepository.deleteUser).toHaveBeenCalledWith('user-123');
    expect(userRepository.deleteAuthUser).toHaveBeenCalledTimes(1);
    expect(userRepository.deleteAuthUser).toHaveBeenCalledWith('user-123');
  });

  // 6. Throws ServiceError when an unexpected error occurs
  it('throws ServiceError when an unexpected error occurs', async () => {
    (userRepository.createAuthUser as jest.Mock).mockRejectedValue(
      new Error('Supabase connection error'),
    );

    await expect(
      realService.createUser({
        email: 'trainer@example.com',
        name: 'Trainer User',
        password: 'password123',
        role: 'trainer',
        tenantId: 'tenant-456',
        token: 'mock-token-abc',
      }),
    ).rejects.toBeInstanceOf(ServiceError);

    expect(userRepository.createAuthUser).toHaveBeenCalledTimes(1);
  });
});
