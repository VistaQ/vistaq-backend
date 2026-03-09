// Supply env vars before env.ts runs so the validation guards do not throw
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

// ---------------------------------------------------------------------------
// LoggingService mock — must be registered before any imports that trigger side effects
// ---------------------------------------------------------------------------

const mockLoggingInfo = jest.fn();
const mockLoggingError = jest.fn();

jest.mock('@src/services/logging.service', () => ({
  __esModule: true,
  default: {
    info: mockLoggingInfo,
    error: mockLoggingError,
    warn: jest.fn(),
    debug: jest.fn(),
  },
  loggingService: {
    info: mockLoggingInfo,
    error: mockLoggingError,
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

import { groupService } from '@src/services/group.service';
import { groupRepository } from '@src/repositories/group.repository';
import { userService } from '@src/services/user.service';
import {
  InvalidLeaderRoleError,
  InvalidTrainerRoleError,
  UserNotInTenantError,
} from '@src/models/errors/group.errors';
import { ServiceError } from '@src/models/errors/layer.errors';
import type { IGroup, IGroupTrainer, IUser } from '@src/types/auth.types';

/******************************************************************************
  Fixtures
******************************************************************************/

const GROUP_ID = '11111111-2222-3333-4444-555555555555';
const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const LEADER_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const TRAINER_ID = 'cccccccc-dddd-eeee-ffff-000000000000';
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

const mockGroupWithLeader: IGroup = {
  ...mockGroup,
  leader_id: LEADER_ID,
};

const mockGroupTrainer: IGroupTrainer = {
  group_id: GROUP_ID,
  trainer_id: TRAINER_ID,
  created_at: '2024-01-01T00:00:00.000Z',
};

const mockLeaderUser: IUser = {
  id: LEADER_ID,
  tenant_id: TENANT_ID,
  email: 'leader@example.com',
  name: 'Leader User',
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

const mockTrainerUser: IUser = {
  id: TRAINER_ID,
  tenant_id: TENANT_ID,
  email: 'trainer@example.com',
  name: 'Trainer User',
  role: 'trainer',
  agent_code: null,
  location: 'Melbourne',
  group_id: null,
  phone: null,
  agency: null,
  status: 'active',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const mockUpdatedLeader: IUser = { ...mockLeaderUser, role: 'group_leader' };

const BASE_PARAMS = {
  name: 'Alpha Squad',
  tenantId: TENANT_ID,
  token: USER_TOKEN,
};

/******************************************************************************
  Test suite — GroupService.createGroup
******************************************************************************/

describe('GroupService.createGroup', () => {
  afterEach(() => jest.restoreAllMocks());

  it('success with name only (no leader, no trainer)', async () => {
    jest.spyOn(groupRepository, 'insertGroup').mockResolvedValue(mockGroup);

    const result = await groupService.createGroup(BASE_PARAMS);

    expect(result).toEqual(mockGroup);
    expect(groupRepository.insertGroup).toHaveBeenCalledTimes(1);
    expect(groupRepository.insertGroup).toHaveBeenCalledWith(
      {
        name: 'Alpha Squad',
        tenant_id: TENANT_ID,
        status: 'active',
        leader_id: null,
      },
      USER_TOKEN,
    );
  });

  it('success with valid leader — verifies leader role updated to group_leader', async () => {
    jest.spyOn(userService, 'getUserById').mockResolvedValue(mockLeaderUser);
    jest.spyOn(groupRepository, 'insertGroup').mockResolvedValue(mockGroupWithLeader);
    jest.spyOn(userService, 'updateUser').mockResolvedValue(mockUpdatedLeader);

    const result = await groupService.createGroup({ ...BASE_PARAMS, leaderId: LEADER_ID });

    expect(result).toEqual(mockGroupWithLeader);
    expect(userService.updateUser).toHaveBeenCalledWith({
      userId: LEADER_ID,
      callerRole: 'admin',
      token: USER_TOKEN,
      data: { role: 'group_leader' },
    });
  });

  it('success with valid trainer — verifies insertGroupTrainer called', async () => {
    jest.spyOn(userService, 'getUserById').mockResolvedValue(mockTrainerUser);
    jest.spyOn(groupRepository, 'insertGroup').mockResolvedValue(mockGroup);
    jest.spyOn(groupRepository, 'insertGroupTrainer').mockResolvedValue(mockGroupTrainer);

    const result = await groupService.createGroup({ ...BASE_PARAMS, trainerId: TRAINER_ID });

    expect(result).toEqual(mockGroup);
    expect(groupRepository.insertGroupTrainer).toHaveBeenCalledWith(
      { group_id: GROUP_ID, trainer_id: TRAINER_ID },
      USER_TOKEN,
    );
  });

  it('success with both leader and trainer', async () => {
    jest
      .spyOn(userService, 'getUserById')
      .mockResolvedValueOnce(mockLeaderUser)
      .mockResolvedValueOnce(mockTrainerUser);
    jest.spyOn(groupRepository, 'insertGroup').mockResolvedValue(mockGroupWithLeader);
    jest.spyOn(userService, 'updateUser').mockResolvedValue(mockUpdatedLeader);
    jest.spyOn(groupRepository, 'insertGroupTrainer').mockResolvedValue(mockGroupTrainer);

    const result = await groupService.createGroup({
      ...BASE_PARAMS,
      leaderId: LEADER_ID,
      trainerId: TRAINER_ID,
    });

    expect(result).toEqual(mockGroupWithLeader);
    expect(userService.updateUser).toHaveBeenCalledWith({
      userId: LEADER_ID,
      callerRole: 'admin',
      token: USER_TOKEN,
      data: { role: 'group_leader' },
    });
    expect(groupRepository.insertGroupTrainer).toHaveBeenCalledWith(
      { group_id: GROUP_ID, trainer_id: TRAINER_ID },
      USER_TOKEN,
    );
  });

  it('throws UserNotInTenantError when leader not found (getUserById returns null)', async () => {
    jest.spyOn(userService, 'getUserById').mockResolvedValue(null);

    await expect(
      groupService.createGroup({ ...BASE_PARAMS, leaderId: LEADER_ID }),
    ).rejects.toBeInstanceOf(UserNotInTenantError);
  });

  it('throws InvalidLeaderRoleError when leader has wrong role', async () => {
    const wrongRoleLeader: IUser = { ...mockLeaderUser, role: 'group_leader' };
    jest.spyOn(userService, 'getUserById').mockResolvedValue(wrongRoleLeader);

    await expect(
      groupService.createGroup({ ...BASE_PARAMS, leaderId: LEADER_ID }),
    ).rejects.toBeInstanceOf(InvalidLeaderRoleError);
  });

  it('throws UserNotInTenantError when trainer not found', async () => {
    jest.spyOn(userService, 'getUserById').mockResolvedValue(null);

    await expect(
      groupService.createGroup({ ...BASE_PARAMS, trainerId: TRAINER_ID }),
    ).rejects.toBeInstanceOf(UserNotInTenantError);
  });

  it('throws InvalidTrainerRoleError when trainer has wrong role', async () => {
    const wrongRoleTrainer: IUser = { ...mockTrainerUser, role: 'agent' };
    jest.spyOn(userService, 'getUserById').mockResolvedValue(wrongRoleTrainer);

    await expect(
      groupService.createGroup({ ...BASE_PARAMS, trainerId: TRAINER_ID }),
    ).rejects.toBeInstanceOf(InvalidTrainerRoleError);
  });

  it('rollback: logs error and rethrows when leader role update fails', async () => {
    const updateError = new Error('role update failed');

    jest.spyOn(userService, 'getUserById').mockResolvedValue(mockLeaderUser);
    jest.spyOn(groupRepository, 'insertGroup').mockResolvedValue(mockGroupWithLeader);
    jest.spyOn(userService, 'updateUser').mockRejectedValue(updateError);

    await expect(
      groupService.createGroup({ ...BASE_PARAMS, leaderId: LEADER_ID }),
    ).rejects.toBeInstanceOf(ServiceError);

    expect(mockLoggingError).toHaveBeenCalledWith(
      expect.stringContaining('leader role update failed'),
      updateError,
      expect.objectContaining({ leaderId: LEADER_ID }),
    );
  });

  it('rollback: when insertGroupTrainer fails, rolls back leader role to agent', async () => {
    const trainerError = new Error('group trainer insert failed');

    jest
      .spyOn(userService, 'getUserById')
      .mockResolvedValueOnce(mockLeaderUser)
      .mockResolvedValueOnce(mockTrainerUser);
    jest.spyOn(groupRepository, 'insertGroup').mockResolvedValue(mockGroupWithLeader);
    jest.spyOn(userService, 'updateUser')
      .mockResolvedValueOnce(mockUpdatedLeader) // leader role → group_leader succeeds
      .mockResolvedValueOnce({ ...mockLeaderUser, role: 'agent' }); // rollback → agent succeeds
    jest.spyOn(groupRepository, 'insertGroupTrainer').mockRejectedValue(trainerError);

    await expect(
      groupService.createGroup({ ...BASE_PARAMS, leaderId: LEADER_ID, trainerId: TRAINER_ID }),
    ).rejects.toBeInstanceOf(ServiceError);

    // Verify rollback call was made to restore leader role to agent
    expect(userService.updateUser).toHaveBeenCalledWith({
      userId: LEADER_ID,
      callerRole: 'admin',
      token: USER_TOKEN,
      data: { role: 'agent' },
    });

    expect(mockLoggingError).toHaveBeenCalledWith(
      expect.stringContaining('group trainer insert failed'),
      trainerError,
      expect.objectContaining({ trainerId: TRAINER_ID }),
    );
  });
});
