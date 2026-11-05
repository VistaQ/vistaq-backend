import '../../helpers/setEnv';

const mockFindById = jest.fn();
const mockFindByRoles = jest.fn();
const mockFindByGroupId = jest.fn();
const mockFindByIds = jest.fn();
const mockUpdateUser = jest.fn();
const mockInsertUser = jest.fn();
const mockDeleteUser = jest.fn();
const mockUpdateGroupId = jest.fn();
const mockFindCode = jest.fn();
const mockClaim = jest.fn();
const mockRelease = jest.fn();
const mockFindGroupIds = jest.fn();
const mockCreateCognitoUser = jest.fn();
const mockDeleteCognitoUser = jest.fn();
const mockUpdateEmail = jest.fn();
const mockDisable = jest.fn();
const mockEnable = jest.fn();

jest.mock('@src/repositories/user.repository', () => ({
  __esModule: true,
  default: {
    findById: mockFindById,
    findByRoles: mockFindByRoles,
    findByGroupId: mockFindByGroupId,
    findByIds: mockFindByIds,
    updateUser: mockUpdateUser,
    insertUser: mockInsertUser,
    deleteUser: mockDeleteUser,
    updateGroupIdForUsers: mockUpdateGroupId,
  },
}));

jest.mock('@src/repositories/agentCode.repository', () => ({
  __esModule: true,
  default: { findByCode: mockFindCode, claim: mockClaim, release: mockRelease },
}));

jest.mock('@src/repositories/groupTrainer.repository', () => ({
  __esModule: true,
  default: { findGroupIdsByTrainerIds: mockFindGroupIds },
}));

jest.mock('@src/services/cognito.service', () => ({
  __esModule: true,
  default: {
    createUser: mockCreateCognitoUser,
    deleteUser: mockDeleteCognitoUser,
    updateEmail: mockUpdateEmail,
    disableUser: mockDisable,
    enableUser: mockEnable,
  },
}));

import {
  AgentCodeInvalidError,
  UserAlreadyExistsError,
  UserNotFoundError,
} from '@src/models/errors/auth.errors';
import { ServiceError } from '@src/models/errors/layer.errors';
import userService from '@src/services/user.service';

const user = (overrides: Record<string, unknown> = {}) => ({
  id: 'u1',
  email: 'ann@example.com',
  name: 'Ann',
  role: 'agent',
  status: 'active',
  group_id: 'g1',
  ...overrides,
});

beforeEach(() => {
  jest.resetAllMocks();
  mockFindGroupIds.mockResolvedValue(new Map());
  mockDeleteCognitoUser.mockResolvedValue(undefined);
  mockRelease.mockResolvedValue(undefined);
});

describe('UserService.getUsers scoping', () => {
  it('lets an admin see every role and status', async () => {
    mockFindByRoles.mockResolvedValue([user()]);

    await userService.getUsers({ id: 'a', role: 'admin', group_id: null });

    expect(mockFindByRoles).toHaveBeenCalledWith(
      ['admin', 'master_trainer', 'trainer', 'group_leader', 'agent'],
    );
  });

  it('lets a master trainer see active non-admin users', async () => {
    mockFindByRoles.mockResolvedValue([]);

    await userService.getUsers({ id: 'm', role: 'master_trainer', group_id: null });

    expect(mockFindByRoles).toHaveBeenCalledWith(
      ['master_trainer', 'trainer', 'group_leader', 'agent'],
      'active',
    );
  });

  it('lets a trainer see the members of their groups only', async () => {
    mockFindGroupIds.mockResolvedValue(new Map([['t1', ['g1', 'g2']]]));
    mockFindByGroupId.mockResolvedValueOnce([user({ id: 'a' })]).mockResolvedValueOnce([user({ id: 'b' })]);

    const users = await userService.getUsers({ id: 't1', role: 'trainer', group_id: null });

    expect(mockFindByGroupId.mock.calls.map((c) => c[0])).toEqual(['g1', 'g2']);
    expect(users.map((u) => u.id)).toEqual(['a', 'b']);
  });

  it('lets a group leader see their own group', async () => {
    mockFindByGroupId.mockResolvedValue([user()]);

    await userService.getUsers({ id: 'l1', role: 'group_leader', group_id: 'g9' });

    expect(mockFindByGroupId).toHaveBeenCalledWith('g9');
  });

  it('lets an agent see only themselves', async () => {
    mockFindById.mockResolvedValue(user({ id: 'me' }));

    const users = await userService.getUsers({ id: 'me', role: 'agent', group_id: 'g1' });

    expect(users.map((u) => u.id)).toEqual(['me']);
    expect(mockFindByRoles).not.toHaveBeenCalled();
  });

  it('adds managed group ids for trainers only', async () => {
    mockFindByRoles.mockResolvedValue([user({ id: 't1', role: 'trainer' }), user({ id: 'a1' })]);
    mockFindGroupIds.mockResolvedValue(new Map([['t1', ['g1']]]));

    const users = await userService.getUsers({ id: 'a', role: 'admin', group_id: null });

    expect(mockFindGroupIds).toHaveBeenCalledWith(['t1']);
    expect(users.find((u) => u.id === 't1')?.managed_group_ids).toEqual(['g1']);
    expect(users.find((u) => u.id === 'a1')?.managed_group_ids).toEqual([]);
  });
});

describe('UserService.updateUser', () => {
  it('strips the role for a non-admin caller', async () => {
    mockFindById.mockResolvedValue(user());
    mockUpdateUser.mockResolvedValue(user());

    await userService.updateUser({ userId: 'u1', callerRole: 'agent', data: { name: 'X', role: 'admin' } });

    expect(mockUpdateUser).toHaveBeenCalledWith('u1', { name: 'X' });
  });

  it('lets an admin change the role', async () => {
    mockFindById.mockResolvedValue(user());
    mockUpdateUser.mockResolvedValue(user());

    await userService.updateUser({ userId: 'u1', callerRole: 'admin', data: { role: 'trainer' } });

    expect(mockUpdateUser).toHaveBeenCalledWith('u1', { role: 'trainer' });
  });

  it('changes the Cognito email first, then the user item', async () => {
    mockFindById.mockResolvedValue(user());
    mockUpdateEmail.mockResolvedValue(undefined);
    mockUpdateUser.mockResolvedValue(user({ email: 'new@example.com' }));

    await userService.updateUser({ userId: 'u1', callerRole: 'admin', data: { email: 'new@example.com' } });

    expect(mockUpdateEmail).toHaveBeenCalledWith('ann@example.com', 'new@example.com');
    expect(mockUpdateUser).toHaveBeenCalled();
  });

  it('puts the old email back in Cognito when the item update fails', async () => {
    mockFindById.mockResolvedValue(user());
    mockUpdateEmail.mockResolvedValue(undefined);
    mockUpdateUser.mockRejectedValue(new Error('write failed'));

    await expect(
      userService.updateUser({ userId: 'u1', callerRole: 'admin', data: { email: 'new@example.com' } }),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(mockUpdateEmail).toHaveBeenLastCalledWith('new@example.com', 'ann@example.com');
  });

  it('throws UserNotFoundError for an unknown user', async () => {
    mockFindById.mockResolvedValue(null);

    await expect(
      userService.updateUser({ userId: 'nope', callerRole: 'admin', data: { name: 'X' } }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe('UserService.deleteUser', () => {
  it('deletes the item, then the Cognito user', async () => {
    mockFindById.mockResolvedValue(user());
    mockDeleteUser.mockResolvedValue(undefined);

    await userService.deleteUser('u1');

    expect(mockDeleteUser).toHaveBeenCalledWith('u1');
    expect(mockDeleteCognitoUser).toHaveBeenCalledWith('ann@example.com');
  });

  it('still succeeds when the Cognito delete fails', async () => {
    mockFindById.mockResolvedValue(user());
    mockDeleteUser.mockResolvedValue(undefined);
    mockDeleteCognitoUser.mockRejectedValue(new Error('down'));

    await expect(userService.deleteUser('u1')).resolves.toBeUndefined();
  });

  it('throws UserNotFoundError and deletes nothing for an unknown user', async () => {
    mockFindById.mockResolvedValue(null);

    await expect(userService.deleteUser('nope')).rejects.toBeInstanceOf(UserNotFoundError);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });
});

describe('UserService.setUserStatus', () => {
  it('deactivating disables the Cognito user', async () => {
    mockFindById.mockResolvedValue(user());
    mockUpdateUser.mockResolvedValue(user({ status: 'inactive' }));
    mockDisable.mockResolvedValue(undefined);

    const result = await userService.setUserStatus('u1', 'inactive');

    expect(mockUpdateUser).toHaveBeenCalledWith('u1', { status: 'inactive' });
    expect(mockDisable).toHaveBeenCalledWith('ann@example.com');
    expect(result.status).toBe('inactive');
  });

  it('reactivating enables the Cognito user', async () => {
    mockFindById.mockResolvedValue(user({ status: 'inactive' }));
    mockUpdateUser.mockResolvedValue(user());
    mockEnable.mockResolvedValue(undefined);

    await userService.setUserStatus('u1', 'active');

    expect(mockEnable).toHaveBeenCalledWith('ann@example.com');
  });

  it('does nothing when the status is already set', async () => {
    mockFindById.mockResolvedValue(user({ status: 'inactive' }));

    await userService.setUserStatus('u1', 'inactive');

    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockDisable).not.toHaveBeenCalled();
  });

  it('throws UserNotFoundError for an unknown user', async () => {
    mockFindById.mockResolvedValue(null);

    await expect(userService.setUserStatus('nope', 'inactive')).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });
});

describe('UserService.createUser', () => {
  beforeEach(() => {
    mockCreateCognitoUser.mockResolvedValue({ id: 'sub-1' });
    mockInsertUser.mockResolvedValue(user({ id: 'sub-1' }));
  });

  it('creates a non-agent user without touching agent codes', async () => {
    await userService.createUser({ email: 'T@Example.com', name: 'Tess', role: 'trainer' });

    expect(mockFindCode).not.toHaveBeenCalled();
    expect(mockInsertUser).toHaveBeenCalledWith({
      id: 'sub-1',
      email: 't@example.com',
      name: 'Tess',
      role: 'trainer',
      agent_code: null,
    });
  });

  it('claims the agent code for an agent', async () => {
    mockFindCode.mockResolvedValue({ agent_code: 'A1', is_used: false });
    mockClaim.mockResolvedValue(undefined);

    await userService.createUser({ email: 'a@b.co', name: 'Ann', role: 'agent', agentCode: 'A1' });

    expect(mockClaim).toHaveBeenCalledWith('A1', 'sub-1');
  });

  it('rejects an agent with a missing or used code before creating anything', async () => {
    mockFindCode.mockResolvedValue({ agent_code: 'A1', is_used: true });

    await expect(
      userService.createUser({ email: 'a@b.co', name: 'Ann', role: 'agent', agentCode: 'A1' }),
    ).rejects.toBeInstanceOf(AgentCodeInvalidError);
    expect(mockCreateCognitoUser).not.toHaveBeenCalled();
  });

  it('surfaces a duplicate email unwrapped', async () => {
    mockCreateCognitoUser.mockRejectedValue(new UserAlreadyExistsError());

    await expect(
      userService.createUser({ email: 'a@b.co', name: 'Ann', role: 'trainer' }),
    ).rejects.toBeInstanceOf(UserAlreadyExistsError);
  });

  it('releases the code and deletes the Cognito user when storing the user fails', async () => {
    mockFindCode.mockResolvedValue({ agent_code: 'A1', is_used: false });
    mockClaim.mockResolvedValue(undefined);
    mockInsertUser.mockRejectedValue(new Error('write failed'));

    await expect(
      userService.createUser({ email: 'a@b.co', name: 'Ann', role: 'agent', agentCode: 'A1' }),
    ).rejects.toBeInstanceOf(ServiceError);
    expect(mockRelease).toHaveBeenCalledWith('A1');
    expect(mockDeleteCognitoUser).toHaveBeenCalledWith('a@b.co');
  });
});

describe('UserService lookups', () => {
  it('findUsersByIds delegates to the repository', async () => {
    mockFindByIds.mockResolvedValue([user()]);

    expect(await userService.findUsersByIds(['u1'])).toHaveLength(1);
  });

  it('updateUsersGroupId delegates to the repository', async () => {
    mockUpdateGroupId.mockResolvedValue(undefined);

    await userService.updateUsersGroupId(['u1'], 'g2');

    expect(mockUpdateGroupId).toHaveBeenCalledWith(['u1'], 'g2');
  });
});
