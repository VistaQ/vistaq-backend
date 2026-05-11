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
    userUpsert: jest.fn(),
    userSelect: jest.fn(),
  },
  supabaseService: {
    userUpsert: jest.fn(),
    userSelect: jest.fn(),
  },
}));

import { agentCodeRepository } from '@src/repositories/agentCode.repository';
import supabaseService from '@src/services/supabase.service';
import { RepositoryError } from '@src/models/errors/layer.errors';

/******************************************************************************
  Fixtures
******************************************************************************/

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_TOKEN = 'mock-user-jwt-token';

const mockRows = [
  {
    id: 'uuid-1',
    tenant_id: TENANT_ID,
    agent_code: 'ABC123',
    user_id: null,
    is_used: false,
    created_at: '2026-04-23T12:00:00.000Z',
    updated_at: '2026-04-23T12:00:00.000Z',
  },
  {
    id: 'uuid-2',
    tenant_id: TENANT_ID,
    agent_code: 'DEF456',
    user_id: null,
    is_used: false,
    created_at: '2026-04-23T12:00:00.000Z',
    updated_at: '2026-04-23T12:00:00.000Z',
  },
];

/******************************************************************************
  Test suite — AgentCodeRepository.upsertMany
******************************************************************************/

describe('AgentCodeRepository.upsertMany', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls supabaseService.userUpsert with agent_codes, rows, and onConflict tenant_id,agent_code', async () => {
    jest.spyOn(supabaseService, 'userUpsert').mockResolvedValue({
      data: mockRows,
      error: null,
    } as any);

    const inputRows = [
      { tenant_id: TENANT_ID, agent_code: 'ABC123' },
      { tenant_id: TENANT_ID, agent_code: 'DEF456' },
    ];

    await agentCodeRepository.upsertMany(inputRows, USER_TOKEN);

    expect(supabaseService.userUpsert).toHaveBeenCalledWith(
      USER_TOKEN,
      'agent_codes',
      inputRows,
      { onConflict: 'tenant_id,agent_code', ignoreDuplicates: false },
    );
  });

  it('maps returned rows to IAgentCode[] (picks agent_code, is_used, user_id, created_at, updated_at)', async () => {
    jest.spyOn(supabaseService, 'userUpsert').mockResolvedValue({
      data: mockRows,
      error: null,
    } as any);

    const result = await agentCodeRepository.upsertMany(
      [{ tenant_id: TENANT_ID, agent_code: 'ABC123' }],
      USER_TOKEN,
    );

    expect(result).toEqual([
      {
        agent_code: 'ABC123',
        is_used: false,
        user_id: null,
        created_at: '2026-04-23T12:00:00.000Z',
        updated_at: '2026-04-23T12:00:00.000Z',
      },
      {
        agent_code: 'DEF456',
        is_used: false,
        user_id: null,
        created_at: '2026-04-23T12:00:00.000Z',
        updated_at: '2026-04-23T12:00:00.000Z',
      },
    ]);
  });

  it('throws RepositoryError when userUpsert returns a truthy error object', async () => {
    jest.spyOn(supabaseService, 'userUpsert').mockResolvedValue({
      data: null,
      error: { message: 'upsert failed: permission denied' },
    } as any);

    await expect(
      agentCodeRepository.upsertMany(
        [{ tenant_id: TENANT_ID, agent_code: 'X' }],
        USER_TOKEN,
      ),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws RepositoryError when userUpsert returns empty data', async () => {
    jest.spyOn(supabaseService, 'userUpsert').mockResolvedValue({
      data: [],
      error: null,
    } as any);

    await expect(
      agentCodeRepository.upsertMany(
        [{ tenant_id: TENANT_ID, agent_code: 'X' }],
        USER_TOKEN,
      ),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws RepositoryError when userUpsert itself throws', async () => {
    jest
      .spyOn(supabaseService, 'userUpsert')
      .mockRejectedValue(new Error('network error'));

    await expect(
      agentCodeRepository.upsertMany(
        [{ tenant_id: TENANT_ID, agent_code: 'X' }],
        USER_TOKEN,
      ),
    ).rejects.toBeInstanceOf(RepositoryError);
  });
});

/******************************************************************************
  Test suite — AgentCodeRepository.findAll
******************************************************************************/

const mockSelectRows = [
  {
    id: 'uuid-1',
    tenant_id: TENANT_ID,
    agent_code: 'ABC123',
    user_id: null,
    is_used: false,
    created_at: '2026-04-23T12:00:00.000Z',
    updated_at: '2026-04-23T12:00:00.000Z',
  },
  {
    id: 'uuid-2',
    tenant_id: TENANT_ID,
    agent_code: 'XYZ789',
    user_id: 'user-uuid-111',
    is_used: true,
    created_at: '2026-04-24T12:00:00.000Z',
    updated_at: '2026-04-24T12:00:00.000Z',
  },
];

describe('AgentCodeRepository.findAll', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls supabaseService.userSelect with table "agent_codes", "*", and the provided filter', async () => {
    jest.spyOn(supabaseService, 'userSelect').mockResolvedValue({
      data: mockSelectRows,
      error: null,
    } as any);

    await agentCodeRepository.findAll(USER_TOKEN, { is_used: true });

    expect(supabaseService.userSelect).toHaveBeenCalledWith(
      USER_TOKEN,
      'agent_codes',
      '*',
      { is_used: true },
    );
  });

  it('calls supabaseService.userSelect with undefined filter when no filter is given', async () => {
    jest.spyOn(supabaseService, 'userSelect').mockResolvedValue({
      data: mockSelectRows,
      error: null,
    } as any);

    await agentCodeRepository.findAll(USER_TOKEN);

    expect(supabaseService.userSelect).toHaveBeenCalledWith(
      USER_TOKEN,
      'agent_codes',
      '*',
      undefined,
    );
  });

  it('maps returned rows to IAgentCode[] including user_id', async () => {
    jest.spyOn(supabaseService, 'userSelect').mockResolvedValue({
      data: mockSelectRows,
      error: null,
    } as any);

    const result = await agentCodeRepository.findAll(USER_TOKEN);

    expect(result).toEqual([
      {
        agent_code: 'ABC123',
        is_used: false,
        user_id: null,
        created_at: '2026-04-23T12:00:00.000Z',
        updated_at: '2026-04-23T12:00:00.000Z',
      },
      {
        agent_code: 'XYZ789',
        is_used: true,
        user_id: 'user-uuid-111',
        created_at: '2026-04-24T12:00:00.000Z',
        updated_at: '2026-04-24T12:00:00.000Z',
      },
    ]);
  });

  it('returns empty array when supabaseService.userSelect returns empty data', async () => {
    jest.spyOn(supabaseService, 'userSelect').mockResolvedValue({
      data: [],
      error: null,
    } as any);

    const result = await agentCodeRepository.findAll(USER_TOKEN);

    expect(result).toEqual([]);
  });

  it('throws RepositoryError when userSelect returns a truthy error object', async () => {
    jest.spyOn(supabaseService, 'userSelect').mockResolvedValue({
      data: null,
      error: { message: 'select failed: permission denied' },
    } as any);

    await expect(
      agentCodeRepository.findAll(USER_TOKEN),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws RepositoryError when userSelect itself throws', async () => {
    jest
      .spyOn(supabaseService, 'userSelect')
      .mockRejectedValue(new Error('network error'));

    await expect(
      agentCodeRepository.findAll(USER_TOKEN),
    ).rejects.toBeInstanceOf(RepositoryError);
  });
});
