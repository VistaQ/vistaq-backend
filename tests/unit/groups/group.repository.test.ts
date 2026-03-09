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

import { groupRepository } from '@src/repositories/group.repository';
import supabaseService from '@src/services/supabase.service';
import { RepositoryError } from '@src/models/errors/layer.errors';
import type { IGroup, IGroupTrainer } from '@src/types/auth.types';

/******************************************************************************
  Fixtures
******************************************************************************/

const GROUP_ID = '11111111-2222-3333-4444-555555555555';
const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TRAINER_ID = 'cccccccc-dddd-eeee-ffff-000000000000';
const USER_TOKEN = 'mock-user-jwt-token';

const mockGroupRow = {
  id: GROUP_ID,
  tenant_id: TENANT_ID,
  name: 'Alpha Squad',
  status: 'active',
  leader_id: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const mockGroupTrainerRow = {
  group_id: GROUP_ID,
  trainer_id: TRAINER_ID,
  created_at: '2024-01-01T00:00:00.000Z',
};

const expectedGroup: IGroup = {
  id: GROUP_ID,
  tenant_id: TENANT_ID,
  name: 'Alpha Squad',
  status: 'active',
  leader_id: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const expectedGroupTrainer: IGroupTrainer = {
  group_id: GROUP_ID,
  trainer_id: TRAINER_ID,
  created_at: '2024-01-01T00:00:00.000Z',
};

/******************************************************************************
  Test suite — GroupRepository.insertGroup
******************************************************************************/

describe('GroupRepository.insertGroup', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns a mapped IGroup on success', async () => {
    jest.spyOn(supabaseService, 'userInsert').mockResolvedValue({
      data: [mockGroupRow],
      error: null,
    });

    const result = await groupRepository.insertGroup(
      { name: 'Alpha Squad', tenant_id: TENANT_ID, status: 'active', leader_id: null },
      USER_TOKEN,
    );

    expect(result).toEqual(expectedGroup);
  });

  it('throws RepositoryError when supabaseService.userInsert returns an error', async () => {
    jest.spyOn(supabaseService, 'userInsert').mockResolvedValue({
      data: null,
      error: { message: 'insert failed: unique constraint violation' },
    });

    await expect(
      groupRepository.insertGroup(
        { name: 'Alpha Squad', tenant_id: TENANT_ID, status: 'active', leader_id: null },
        USER_TOKEN,
      ),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws RepositoryError when supabaseService.userInsert returns empty data', async () => {
    jest.spyOn(supabaseService, 'userInsert').mockResolvedValue({
      data: [],
      error: null,
    });

    await expect(
      groupRepository.insertGroup(
        { name: 'Alpha Squad', tenant_id: TENANT_ID, status: 'active', leader_id: null },
        USER_TOKEN,
      ),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws RepositoryError when supabaseService.userInsert returns null data', async () => {
    jest.spyOn(supabaseService, 'userInsert').mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(
      groupRepository.insertGroup(
        { name: 'Alpha Squad', tenant_id: TENANT_ID, status: 'active', leader_id: null },
        USER_TOKEN,
      ),
    ).rejects.toBeInstanceOf(RepositoryError);
  });
});

/******************************************************************************
  Test suite — GroupRepository.insertGroupTrainer
******************************************************************************/

describe('GroupRepository.insertGroupTrainer', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns a mapped IGroupTrainer on success', async () => {
    jest.spyOn(supabaseService, 'userInsert').mockResolvedValue({
      data: [mockGroupTrainerRow],
      error: null,
    });

    const result = await groupRepository.insertGroupTrainer(
      { group_id: GROUP_ID, trainer_id: TRAINER_ID },
      USER_TOKEN,
    );

    expect(result).toEqual(expectedGroupTrainer);
  });

  it('throws RepositoryError when supabaseService.userInsert returns an error', async () => {
    jest.spyOn(supabaseService, 'userInsert').mockResolvedValue({
      data: null,
      error: { message: 'insert failed: foreign key constraint' },
    });

    await expect(
      groupRepository.insertGroupTrainer(
        { group_id: GROUP_ID, trainer_id: TRAINER_ID },
        USER_TOKEN,
      ),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws RepositoryError when supabaseService.userInsert returns empty data', async () => {
    jest.spyOn(supabaseService, 'userInsert').mockResolvedValue({
      data: [],
      error: null,
    });

    await expect(
      groupRepository.insertGroupTrainer(
        { group_id: GROUP_ID, trainer_id: TRAINER_ID },
        USER_TOKEN,
      ),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws RepositoryError when supabaseService.userInsert returns null data', async () => {
    jest.spyOn(supabaseService, 'userInsert').mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(
      groupRepository.insertGroupTrainer(
        { group_id: GROUP_ID, trainer_id: TRAINER_ID },
        USER_TOKEN,
      ),
    ).rejects.toBeInstanceOf(RepositoryError);
  });
});
