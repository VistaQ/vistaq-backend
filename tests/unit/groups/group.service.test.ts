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
  GroupNotFoundError,
  InvalidLeaderError,
  InvalidLeaderRoleError,
  InvalidTrainerError,
  InvalidTrainerRoleError,
  MissingMembersError,
  UserNotInTenantError,
} from '@src/models/errors/group.errors';
import { UserNotFoundError } from '@src/models/errors/auth.errors';
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
  Test suite — GroupService.getGroups
******************************************************************************/

describe('GroupService.getGroups', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns IGroup[] from repository on success', async () => {
    const mockGroups: IGroup[] = [mockGroup];
    jest.spyOn(groupRepository, 'findAll').mockResolvedValue(mockGroups);

    const result = await groupService.getGroups(USER_TOKEN);

    expect(result).toEqual(mockGroups);
    expect(groupRepository.findAll).toHaveBeenCalledWith(USER_TOKEN);
  });

  it('returns empty array when repository returns no groups', async () => {
    jest.spyOn(groupRepository, 'findAll').mockResolvedValue([]);

    const result = await groupService.getGroups(USER_TOKEN);

    expect(result).toEqual([]);
  });

  it('throws ServiceError when repository throws', async () => {
    jest.spyOn(groupRepository, 'findAll').mockRejectedValue(new Error('db failure'));

    await expect(groupService.getGroups(USER_TOKEN)).rejects.toThrow(ServiceError);
  });
});

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

/******************************************************************************
  Test suite — GroupService.updateGroup
******************************************************************************/

const MEMBER_ID_1 = 'dddddddd-eeee-ffff-0000-111111111111';
const MEMBER_ID_2 = 'eeeeeeee-ffff-0000-1111-222222222222';
const OLD_LEADER_ID = 'ffffffff-0000-1111-2222-333333333333';

const mockGroupWithOldLeader: IGroup = {
  ...mockGroup,
  leader_id: OLD_LEADER_ID,
};

const mockOldLeader: IUser = {
  id: OLD_LEADER_ID,
  tenant_id: TENANT_ID,
  email: 'old-leader@example.com',
  name: 'Old Leader',
  role: 'group_leader',
  agent_code: 'AGT-000',
  location: 'Brisbane',
  group_id: GROUP_ID,
  phone: null,
  agency: null,
  status: 'active',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const mockMember1: IUser = {
  id: MEMBER_ID_1,
  tenant_id: TENANT_ID,
  email: 'member1@example.com',
  name: 'Member One',
  role: 'agent',
  agent_code: 'AGT-002',
  location: 'Perth',
  group_id: null,
  phone: null,
  agency: null,
  status: 'active',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const mockMember2: IUser = {
  id: MEMBER_ID_2,
  tenant_id: TENANT_ID,
  email: 'member2@example.com',
  name: 'Member Two',
  role: 'agent',
  agent_code: 'AGT-003',
  location: 'Adelaide',
  group_id: null,
  phone: null,
  agency: null,
  status: 'active',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const mockUpdatedGroup: IGroup = {
  ...mockGroup,
  name: 'Updated Squad',
};

describe('GroupService.updateGroup', () => {
  afterEach(() => jest.restoreAllMocks());

  it('throws GroupNotFoundError when group not found', async () => {
    jest.spyOn(groupRepository, 'findById').mockResolvedValue(null);

    await expect(
      groupService.updateGroup({ groupId: GROUP_ID, token: USER_TOKEN, data: { name: 'New Name' } }),
    ).rejects.toBeInstanceOf(GroupNotFoundError);
  });

  it('throws UserNotFoundError when leader not found', async () => {
    jest.spyOn(groupRepository, 'findById').mockResolvedValue(mockGroup);
    jest.spyOn(userService, 'getUserById').mockResolvedValue(null);

    await expect(
      groupService.updateGroup({
        groupId: GROUP_ID,
        token: USER_TOKEN,
        data: { leader_id: LEADER_ID },
      }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('throws InvalidLeaderError when leader role is not agent', async () => {
    const nonAgentLeader: IUser = { ...mockLeaderUser, role: 'group_leader' };
    jest.spyOn(groupRepository, 'findById').mockResolvedValue(mockGroup);
    jest.spyOn(userService, 'getUserById').mockResolvedValue(nonAgentLeader);

    await expect(
      groupService.updateGroup({
        groupId: GROUP_ID,
        token: USER_TOKEN,
        data: { leader_id: LEADER_ID },
      }),
    ).rejects.toBeInstanceOf(InvalidLeaderError);
  });

  it('skips leader update when same leader_id is already assigned (idempotent)', async () => {
    const groupWithSameLeader: IGroup = { ...mockGroup, leader_id: LEADER_ID };
    jest.spyOn(groupRepository, 'findById').mockResolvedValue(groupWithSameLeader);
    jest.spyOn(groupRepository, 'updateGroup').mockResolvedValue(groupWithSameLeader);
    const getUserByIdSpy = jest.spyOn(userService, 'getUserById');
    const updateUserSpy = jest.spyOn(userService, 'updateUser');

    await groupService.updateGroup({
      groupId: GROUP_ID,
      token: USER_TOKEN,
      data: { leader_id: LEADER_ID, name: 'Updated Name' },
    });

    expect(getUserByIdSpy).not.toHaveBeenCalled();
    expect(updateUserSpy).not.toHaveBeenCalled();
  });

  it('demotes old leader and promotes new leader when leader changes', async () => {
    jest.spyOn(groupRepository, 'findById').mockResolvedValue(mockGroupWithOldLeader);
    jest.spyOn(userService, 'getUserById').mockResolvedValue(mockLeaderUser);
    jest.spyOn(userService, 'updateUser').mockResolvedValue(mockUpdatedLeader);
    jest.spyOn(groupRepository, 'updateGroup').mockResolvedValue(mockGroupWithLeader);

    await groupService.updateGroup({
      groupId: GROUP_ID,
      token: USER_TOKEN,
      data: { leader_id: LEADER_ID },
    });

    expect(userService.updateUser).toHaveBeenCalledWith({
      userId: OLD_LEADER_ID,
      callerRole: 'admin',
      token: USER_TOKEN,
      data: { role: 'agent' },
    });
    expect(userService.updateUser).toHaveBeenCalledWith({
      userId: LEADER_ID,
      callerRole: 'admin',
      token: USER_TOKEN,
      data: { role: 'group_leader' },
    });
  });

  it('throws UserNotFoundError when trainer not found', async () => {
    jest.spyOn(groupRepository, 'findById').mockResolvedValue(mockGroup);
    jest.spyOn(userService, 'getUserById').mockResolvedValue(null);

    await expect(
      groupService.updateGroup({
        groupId: GROUP_ID,
        token: USER_TOKEN,
        data: { trainer_id: TRAINER_ID },
      }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('throws InvalidTrainerError when trainer role is not trainer', async () => {
    const nonTrainer: IUser = { ...mockTrainerUser, role: 'agent' };
    jest.spyOn(groupRepository, 'findById').mockResolvedValue(mockGroup);
    jest.spyOn(userService, 'getUserById').mockResolvedValue(nonTrainer);

    await expect(
      groupService.updateGroup({
        groupId: GROUP_ID,
        token: USER_TOKEN,
        data: { trainer_id: TRAINER_ID },
      }),
    ).rejects.toBeInstanceOf(InvalidTrainerError);
  });

  it('inserts group_trainer when trainer_id is provided and valid', async () => {
    jest.spyOn(groupRepository, 'findById').mockResolvedValue(mockGroup);
    jest.spyOn(userService, 'getUserById').mockResolvedValue(mockTrainerUser);
    jest.spyOn(groupRepository, 'insertGroupTrainer').mockResolvedValue(mockGroupTrainer);

    await groupService.updateGroup({
      groupId: GROUP_ID,
      token: USER_TOKEN,
      data: { trainer_id: TRAINER_ID },
    });

    expect(groupRepository.insertGroupTrainer).toHaveBeenCalledWith(
      { group_id: GROUP_ID, trainer_id: TRAINER_ID },
      USER_TOKEN,
    );
  });

  it('throws MissingMembersError when returned member count does not match requested count', async () => {
    jest.spyOn(groupRepository, 'findById').mockResolvedValue(mockGroup);
    jest.spyOn(userService, 'findUsersByIds').mockResolvedValue([mockMember1]); // only 1 returned, 2 requested

    await expect(
      groupService.updateGroup({
        groupId: GROUP_ID,
        token: USER_TOKEN,
        data: { member_ids: [MEMBER_ID_1, MEMBER_ID_2] },
      }),
    ).rejects.toBeInstanceOf(MissingMembersError);
  });

  it('calls updateUsersGroupId when member_ids are valid', async () => {
    jest.spyOn(groupRepository, 'findById').mockResolvedValue(mockGroup);
    jest.spyOn(userService, 'findUsersByIds').mockResolvedValue([mockMember1, mockMember2]);
    jest.spyOn(userService, 'updateUsersGroupId').mockResolvedValue(undefined);

    await groupService.updateGroup({
      groupId: GROUP_ID,
      token: USER_TOKEN,
      data: { member_ids: [MEMBER_ID_1, MEMBER_ID_2] },
    });

    expect(userService.updateUsersGroupId).toHaveBeenCalledWith(
      [MEMBER_ID_1, MEMBER_ID_2],
      GROUP_ID,
      USER_TOKEN,
    );
  });

  it('returns existingGroup directly when updatePayload is empty (only trainer_id/member_ids sent)', async () => {
    jest.spyOn(groupRepository, 'findById').mockResolvedValue(mockGroup);
    jest.spyOn(userService, 'getUserById').mockResolvedValue(mockTrainerUser);
    jest.spyOn(groupRepository, 'insertGroupTrainer').mockResolvedValue(mockGroupTrainer);
    const updateGroupSpy = jest.spyOn(groupRepository, 'updateGroup');

    const result = await groupService.updateGroup({
      groupId: GROUP_ID,
      token: USER_TOKEN,
      data: { trainer_id: TRAINER_ID },
    });

    expect(updateGroupSpy).not.toHaveBeenCalled();
    expect(result).toEqual(mockGroup);
  });

  it('calls groupRepository.updateGroup with correct payload when name/status/leader_id present', async () => {
    jest.spyOn(groupRepository, 'findById').mockResolvedValue(mockGroup);
    jest.spyOn(groupRepository, 'updateGroup').mockResolvedValue(mockUpdatedGroup);

    await groupService.updateGroup({
      groupId: GROUP_ID,
      token: USER_TOKEN,
      data: { name: 'Updated Squad', status: 'inactive' },
    });

    expect(groupRepository.updateGroup).toHaveBeenCalledWith(
      GROUP_ID,
      { name: 'Updated Squad', status: 'inactive' },
      USER_TOKEN,
    );
  });

  it('returns updated group on success', async () => {
    jest.spyOn(groupRepository, 'findById').mockResolvedValue(mockGroup);
    jest.spyOn(groupRepository, 'updateGroup').mockResolvedValue(mockUpdatedGroup);

    const result = await groupService.updateGroup({
      groupId: GROUP_ID,
      token: USER_TOKEN,
      data: { name: 'Updated Squad' },
    });

    expect(result).toEqual(mockUpdatedGroup);
  });
});
