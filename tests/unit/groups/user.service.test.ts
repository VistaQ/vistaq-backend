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
    userInsert: jest.fn(),
    userSelect: jest.fn(),
    userUpdate: jest.fn(),
    userSelectIn: jest.fn(),
    userUpdateIn: jest.fn(),
  },
}));

import { userService } from '@src/services/user.service';
import { userRepository } from '@src/repositories/user.repository';
import { ServiceError } from '@src/models/errors/layer.errors';
import type { IUser } from '@src/types/auth.types';

/******************************************************************************
  Fixtures
******************************************************************************/

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID_1 = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const USER_ID_2 = 'cccccccc-dddd-eeee-ffff-000000000000';
const GROUP_ID = '11111111-2222-3333-4444-555555555555';
const USER_TOKEN = 'mock-user-jwt-token';

const mockUser1: IUser = {
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
  sales_target: null,
  status: 'active',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const mockUser2: IUser = {
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
  sales_target: null,
  status: 'active',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

/******************************************************************************
  Test suite — UserService.findUsersByIds
******************************************************************************/

describe('UserService.findUsersByIds', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns IUser[] delegating to userRepository.findByIds', async () => {
    jest.spyOn(userRepository, 'findByIds').mockResolvedValue([mockUser1, mockUser2]);

    const result = await userService.findUsersByIds([USER_ID_1, USER_ID_2], USER_TOKEN);

    expect(result).toEqual([mockUser1, mockUser2]);
    expect(userRepository.findByIds).toHaveBeenCalledWith([USER_ID_1, USER_ID_2], USER_TOKEN);
  });

  it('rethrows via handleServiceError on failure', async () => {
    jest.spyOn(userRepository, 'findByIds').mockRejectedValue(new Error('db failure'));

    await expect(
      userService.findUsersByIds([USER_ID_1], USER_TOKEN),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});

/******************************************************************************
  Test suite — UserService.updateUsersGroupId
******************************************************************************/

describe('UserService.updateUsersGroupId', () => {
  afterEach(() => jest.restoreAllMocks());

  it('resolves void delegating to userRepository.updateGroupIdForUsers', async () => {
    jest.spyOn(userRepository, 'updateGroupIdForUsers').mockResolvedValue(undefined);

    await expect(
      userService.updateUsersGroupId([USER_ID_1, USER_ID_2], GROUP_ID, USER_TOKEN),
    ).resolves.toBeUndefined();

    expect(userRepository.updateGroupIdForUsers).toHaveBeenCalledWith(
      [USER_ID_1, USER_ID_2],
      GROUP_ID,
      USER_TOKEN,
    );
  });

  it('rethrows via handleServiceError on failure', async () => {
    jest.spyOn(userRepository, 'updateGroupIdForUsers').mockRejectedValue(new Error('db failure'));

    await expect(
      userService.updateUsersGroupId([USER_ID_1], GROUP_ID, USER_TOKEN),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});
