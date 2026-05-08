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
    adminSelectIn: jest.fn(),
    adminSelectInIn: jest.fn(),
    userInsert: jest.fn(),
    userSelect: jest.fn(),
    userUpdate: jest.fn(),
    userSelectIn: jest.fn(),
    userUpdateIn: jest.fn(),
  },
  supabaseService: {
    adminSelect: jest.fn(),
    adminInsert: jest.fn(),
    adminUpdate: jest.fn(),
    adminDelete: jest.fn(),
    adminSelectIn: jest.fn(),
    adminSelectInIn: jest.fn(),
    userInsert: jest.fn(),
    userSelect: jest.fn(),
    userUpdate: jest.fn(),
    userSelectIn: jest.fn(),
    userUpdateIn: jest.fn(),
  },
}));

import { userRepository } from '@src/repositories/user.repository';
import supabaseService from '@src/services/supabase.service';
import { RepositoryError } from '@src/models/errors/layer.errors';
import type { IUser } from '@src/types/auth.types';

/******************************************************************************
  Fixtures
******************************************************************************/

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID_1 = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const USER_ID_2 = 'cccccccc-dddd-eeee-ffff-000000000000';
const GROUP_ID = '11111111-2222-3333-4444-555555555555';
const USER_TOKEN = 'mock-user-jwt-token';

const mockUserRow1 = {
  id: USER_ID_1,
  tenant_id: TENANT_ID,
  email: 'user1@example.com',
  name: 'User One',
  role: 'agent',
  agent_code: 'AGT-001',
  location: 'Sydney',
  group_id: null,
  phone: null,
  agency: null,
  status: 'active',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const mockUserRow2 = {
  id: USER_ID_2,
  tenant_id: TENANT_ID,
  email: 'user2@example.com',
  name: 'User Two',
  role: 'agent',
  agent_code: 'AGT-002',
  location: 'Melbourne',
  group_id: null,
  phone: null,
  agency: null,
  status: 'active',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const expectedUser1: IUser = {
  id: USER_ID_1,
  tenant_id: TENANT_ID,
  email: 'user1@example.com',
  name: 'User One',
  role: 'agent',
  agent_code: 'AGT-001',
  location: 'Sydney',
  group_id: null,
  phone: null,
  agency: null,
  status: 'active',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const expectedUser2: IUser = {
  id: USER_ID_2,
  tenant_id: TENANT_ID,
  email: 'user2@example.com',
  name: 'User Two',
  role: 'agent',
  agent_code: 'AGT-002',
  location: 'Melbourne',
  group_id: null,
  phone: null,
  agency: null,
  status: 'active',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

/******************************************************************************
  Test suite — UserRepository.findByIds
******************************************************************************/

describe('UserRepository.findByIds', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns mapped IUser[] on success', async () => {
    jest.spyOn(supabaseService, 'userSelectIn').mockResolvedValue({
      data: [mockUserRow1, mockUserRow2],
      error: null,
    } as any);

    const result = await userRepository.findByIds([USER_ID_1, USER_ID_2], USER_TOKEN);

    expect(result).toEqual([expectedUser1, expectedUser2]);
    expect(supabaseService.userSelectIn).toHaveBeenCalledWith(
      USER_TOKEN,
      'users',
      '*',
      'id',
      [USER_ID_1, USER_ID_2],
    );
  });

  it('returns empty array when no rows returned', async () => {
    jest.spyOn(supabaseService, 'userSelectIn').mockResolvedValue({
      data: [],
      error: null,
    } as any);

    const result = await userRepository.findByIds([USER_ID_1], USER_TOKEN);

    expect(result).toEqual([]);
  });

  it('throws RepositoryError when supabaseService.userSelectIn returns an error', async () => {
    jest.spyOn(supabaseService, 'userSelectIn').mockResolvedValue({
      data: null,
      error: { message: 'select failed: permission denied' },
    } as any);

    await expect(
      userRepository.findByIds([USER_ID_1], USER_TOKEN),
    ).rejects.toBeInstanceOf(RepositoryError);
  });
});

/******************************************************************************
  Test suite — UserRepository.updateGroupIdForUsers
******************************************************************************/

describe('UserRepository.updateGroupIdForUsers', () => {
  afterEach(() => jest.restoreAllMocks());

  it('resolves void on success', async () => {
    jest.spyOn(supabaseService, 'userUpdateIn').mockResolvedValue({
      data: [{ id: USER_ID_1, group_id: GROUP_ID }, { id: USER_ID_2, group_id: GROUP_ID }],
      error: null,
    } as any);

    await expect(
      userRepository.updateGroupIdForUsers([USER_ID_1, USER_ID_2], GROUP_ID, USER_TOKEN),
    ).resolves.toBeUndefined();

    expect(supabaseService.userUpdateIn).toHaveBeenCalledWith(
      USER_TOKEN,
      'users',
      { group_id: GROUP_ID },
      'id',
      [USER_ID_1, USER_ID_2],
    );
  });

  it('throws RepositoryError when supabaseService.userUpdateIn returns an error', async () => {
    jest.spyOn(supabaseService, 'userUpdateIn').mockResolvedValue({
      data: null,
      error: { message: 'update failed: permission denied' },
    } as any);

    await expect(
      userRepository.updateGroupIdForUsers([USER_ID_1, USER_ID_2], GROUP_ID, USER_TOKEN),
    ).rejects.toBeInstanceOf(RepositoryError);
  });
});

/******************************************************************************
  Test suite — UserRepository.findByGroupId
******************************************************************************/

describe('UserRepository.findByGroupId', () => {
  afterEach(() => jest.restoreAllMocks());

  it('passes { group_id, status: "active" } filter to userSelect and returns mapped users', async () => {
    jest.spyOn(supabaseService, 'userSelect').mockResolvedValue({
      data: [mockUserRow1, mockUserRow2],
      error: null,
    } as any);

    const result = await userRepository.findByGroupId(GROUP_ID, USER_TOKEN);

    expect(result).toEqual([expectedUser1, expectedUser2]);
    expect(supabaseService.userSelect).toHaveBeenCalledWith(
      USER_TOKEN,
      'users',
      '*',
      { group_id: GROUP_ID, status: 'active' },
    );
  });

  it('returns empty array when no rows match', async () => {
    jest.spyOn(supabaseService, 'userSelect').mockResolvedValue({
      data: [],
      error: null,
    } as any);

    const result = await userRepository.findByGroupId(GROUP_ID, USER_TOKEN);

    expect(result).toEqual([]);
  });

  it('throws RepositoryError when supabaseService.userSelect returns an error', async () => {
    jest.spyOn(supabaseService, 'userSelect').mockResolvedValue({
      data: null,
      error: { message: 'select failed: permission denied' },
    } as any);

    await expect(
      userRepository.findByGroupId(GROUP_ID, USER_TOKEN),
    ).rejects.toBeInstanceOf(RepositoryError);
  });
});

/******************************************************************************
  Test suite — UserRepository.findByAgentCodes
******************************************************************************/

describe('UserRepository.findByAgentCodes', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns id+agent_code for matching agents via adminSelectIn', async () => {
    (
      supabaseService as unknown as { adminSelectIn: jest.Mock }
    ).adminSelectIn = jest.fn().mockResolvedValue({
      data: [
        { id: 'u1', agent_code: 'A1' },
        { id: 'u2', agent_code: 'A2' },
      ],
      error: null,
    });

    const result = await userRepository.findByAgentCodes('t1', ['A1', 'A2']);

    expect(
      (supabaseService as unknown as { adminSelectIn: jest.Mock }).adminSelectIn,
    ).toHaveBeenCalledWith(
      'users',
      'id, agent_code',
      'agent_code',
      ['A1', 'A2'],
      { tenant_id: 't1', status: 'active' },
    );
    expect(result).toEqual([
      { id: 'u1', agent_code: 'A1' },
      { id: 'u2', agent_code: 'A2' },
    ]);
  });

  it('returns [] when given an empty agentCodes array (no DB call)', async () => {
    const result = await userRepository.findByAgentCodes('t1', []);
    expect(result).toEqual([]);
  });

  it('throws RepositoryError on error response', async () => {
    (
      supabaseService as unknown as { adminSelectIn: jest.Mock }
    ).adminSelectIn = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'query failed' },
    });

    await expect(
      userRepository.findByAgentCodes('t1', ['A1']),
    ).rejects.toBeInstanceOf(RepositoryError);
  });
});
