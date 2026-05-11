// Supply env vars before env.ts runs so the validation guards do not throw
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

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

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: { userUpsert: jest.fn() },
  supabaseService: { userUpsert: jest.fn() },
}));

import { agentCodeService } from '@src/services/agentCode.service';
import { agentCodeRepository } from '@src/repositories/agentCode.repository';
import { ServiceError, RepositoryError } from '@src/models/errors/layer.errors';
import { AgentCodeNotFoundError, AgentCodeConflictError } from '@src/models/errors/agentCode.errors';
import type { IAgentCode } from '@src/types/agentCode';

/******************************************************************************
  Fixtures
******************************************************************************/

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_TOKEN = 'mock-user-jwt-token';

const mockResult: IAgentCode[] = [
  {
    agent_code: 'ABC123',
    is_used: false,
    user_id: null,
    created_at: '2026-04-23T00:00:00.000Z',
    updated_at: '2026-04-23T00:00:00.000Z',
  },
  {
    agent_code: 'DEF456',
    is_used: false,
    user_id: null,
    created_at: '2026-04-23T00:00:00.000Z',
    updated_at: '2026-04-23T00:00:00.000Z',
  },
];

/******************************************************************************
  Test suite — AgentCodeService.createMany
******************************************************************************/

describe('AgentCodeService.createMany', () => {
  afterEach(() => jest.restoreAllMocks());

  it('passes deduplicated rows with tenant_id stamped to repository', async () => {
    const spy = jest
      .spyOn(agentCodeRepository, 'upsertMany')
      .mockResolvedValue(mockResult);

    await agentCodeService.createMany({
      agentCodes: ['ABC123', 'ABC123', 'DEF456'],
      tenantId: TENANT_ID,
      token: USER_TOKEN,
    });

    expect(spy).toHaveBeenCalledWith(
      [
        { tenant_id: TENANT_ID, agent_code: 'ABC123' },
        { tenant_id: TENANT_ID, agent_code: 'DEF456' },
      ],
      USER_TOKEN,
    );
  });

  it('returns IAgentCode[] from repository unchanged', async () => {
    jest.spyOn(agentCodeRepository, 'upsertMany').mockResolvedValue(mockResult);

    const result = await agentCodeService.createMany({
      agentCodes: ['ABC123', 'DEF456'],
      tenantId: TENANT_ID,
      token: USER_TOKEN,
    });

    expect(result).toEqual(mockResult);
  });

  it('throws ServiceError when repository throws', async () => {
    jest
      .spyOn(agentCodeRepository, 'upsertMany')
      .mockRejectedValue(new Error('db failure'));

    await expect(
      agentCodeService.createMany({
        agentCodes: ['X'],
        tenantId: TENANT_ID,
        token: USER_TOKEN,
      }),
    ).rejects.toThrow(ServiceError);
  });
});

/******************************************************************************
  Test suite — AgentCodeService.list
******************************************************************************/

describe('AgentCodeService.list', () => {
  afterEach(() => jest.restoreAllMocks());

  it('passes { is_used: true } filter to repository when isUsed is true', async () => {
    const spy = jest
      .spyOn(agentCodeRepository, 'findAll')
      .mockResolvedValue(mockResult);

    await agentCodeService.list({ isUsed: true, token: USER_TOKEN });

    expect(spy).toHaveBeenCalledWith(USER_TOKEN, { is_used: true });
  });

  it('passes { is_used: false } filter to repository when isUsed is false', async () => {
    const spy = jest
      .spyOn(agentCodeRepository, 'findAll')
      .mockResolvedValue(mockResult);

    await agentCodeService.list({ isUsed: false, token: USER_TOKEN });

    expect(spy).toHaveBeenCalledWith(USER_TOKEN, { is_used: false });
  });

  it('passes undefined (no filter) to repository when isUsed is not provided', async () => {
    const spy = jest
      .spyOn(agentCodeRepository, 'findAll')
      .mockResolvedValue(mockResult);

    await agentCodeService.list({ token: USER_TOKEN });

    expect(spy).toHaveBeenCalledWith(USER_TOKEN, undefined);
  });

  it('returns whatever findAll returns', async () => {
    jest.spyOn(agentCodeRepository, 'findAll').mockResolvedValue(mockResult);

    const result = await agentCodeService.list({ token: USER_TOKEN });

    expect(result).toEqual(mockResult);
  });

  it('throws ServiceError when repository throws', async () => {
    jest
      .spyOn(agentCodeRepository, 'findAll')
      .mockRejectedValue(new Error('db failure'));

    await expect(
      agentCodeService.list({ token: USER_TOKEN }),
    ).rejects.toThrow(ServiceError);
  });
});

/******************************************************************************
  Test suite — AgentCodeService.update
******************************************************************************/

const mockUpdatedAgentCode: IAgentCode = {
  agent_code: 'NEW001',
  is_used: true,
  user_id: 'user-uuid-111',
  created_at: '2026-05-01T12:00:00.000Z',
  updated_at: '2026-05-12T08:00:00.000Z',
};

describe('AgentCodeService.update', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls agentCodeRepository.update with correct token, filters, and values including updated_at', async () => {
    const spy = jest
      .spyOn(agentCodeRepository, 'update')
      .mockResolvedValue(mockUpdatedAgentCode);

    await agentCodeService.update({
      currentAgentCode: 'OLD001',
      newAgentCode: 'NEW001',
      tenantId: TENANT_ID,
      token: USER_TOKEN,
    });

    expect(spy).toHaveBeenCalledWith(
      USER_TOKEN,
      { tenant_id: TENANT_ID, agent_code: 'OLD001' },
      expect.objectContaining({ agent_code: 'NEW001', updated_at: expect.any(String) }),
    );
  });

  it('returns the IAgentCode returned by the repository', async () => {
    jest
      .spyOn(agentCodeRepository, 'update')
      .mockResolvedValue(mockUpdatedAgentCode);

    const result = await agentCodeService.update({
      currentAgentCode: 'OLD001',
      newAgentCode: 'NEW001',
      tenantId: TENANT_ID,
      token: USER_TOKEN,
    });

    expect(result).toEqual(mockUpdatedAgentCode);
  });

  it('re-throws AgentCodeNotFoundError directly when it is the root cause', async () => {
    const rootCause = new AgentCodeNotFoundError();
    const wrappedError = new RepositoryError('Repository error', rootCause);

    jest
      .spyOn(agentCodeRepository, 'update')
      .mockRejectedValue(wrappedError);

    await expect(
      agentCodeService.update({
        currentAgentCode: 'MISSING',
        newAgentCode: 'NEW001',
        tenantId: TENANT_ID,
        token: USER_TOKEN,
      }),
    ).rejects.toBeInstanceOf(AgentCodeNotFoundError);
  });

  it('re-throws AgentCodeConflictError directly when it is the root cause', async () => {
    const rootCause = new AgentCodeConflictError();
    const wrappedError = new RepositoryError('Repository error', rootCause);

    jest
      .spyOn(agentCodeRepository, 'update')
      .mockRejectedValue(wrappedError);

    await expect(
      agentCodeService.update({
        currentAgentCode: 'OLD001',
        newAgentCode: 'DUPLICATE',
        tenantId: TENANT_ID,
        token: USER_TOKEN,
      }),
    ).rejects.toBeInstanceOf(AgentCodeConflictError);
  });

  it('wraps unexpected errors in ServiceError via handleServiceError', async () => {
    jest
      .spyOn(agentCodeRepository, 'update')
      .mockRejectedValue(new Error('unexpected db failure'));

    await expect(
      agentCodeService.update({
        currentAgentCode: 'OLD001',
        newAgentCode: 'NEW001',
        tenantId: TENANT_ID,
        token: USER_TOKEN,
      }),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});
