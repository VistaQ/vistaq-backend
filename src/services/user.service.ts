import {
  AgentCodeInvalidError,
  UserAlreadyExistsError,
  UserNotFoundError,
} from '@src/models/errors/auth.errors';
import agentCodeRepository from '@src/repositories/agentCode.repository';
import groupTrainerRepository from '@src/repositories/groupTrainer.repository';
import userRepository, {
  type IUserUpdate,
} from '@src/repositories/user.repository';
import cognitoService from '@src/services/cognito.service';
import scopeService from '@src/services/scope.service';
import type {
  ICaller,
  IUser,
  IUserWithManagedGroups,
} from '@src/types/auth.types';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                            Interfaces
******************************************************************************/

interface IUpdateUserParams {
  userId: string;
  callerRole: string;
  data: {
    email?: string;
    name?: string;
    phone?: string;
    agency?: string;
    location?: string;
    role?: string;
    group_id?: string | null;
    sales_target?: number | null;
    fyct_target?: number | null;
    fyc_target?: number | null;
  };
}

interface ICreateUserParams {
  email: string;
  name: string;
  role: string;
  agentCode?: string;
}

const ALL_ROLES = [
  'admin',
  'master_trainer',
  'trainer',
  'group_leader',
  'agent',
];
const ROLES_BELOW_ADMIN = ALL_ROLES.filter((role) => role !== 'admin');

/******************************************************************************
                            UserService
******************************************************************************/

class UserService {
  private async enrichWithManagedGroupIds(
    users: IUser[],
  ): Promise<IUserWithManagedGroups[]> {
    try {
      const trainerIds = users
        .filter((u) => u.role === 'trainer')
        .map((u) => u.id);
      const managedGroupMap =
        await groupTrainerRepository.findGroupIdsByTrainerIds(trainerIds);
      return users.map((user) => ({
        ...user,
        managed_group_ids: managedGroupMap.get(user.id) ?? [],
      }));
    } catch (error) {
      return handleServiceError('UserService.enrichWithManagedGroupIds', error);
    }
  }

  /**
   * Lists the users the caller may see: admin all, master trainer everyone but
   * admins, trainer the active members of their groups, group leader their
   * active group, agent only themselves.
   */
  async getUsers(caller: ICaller): Promise<IUserWithManagedGroups[]> {
    try {
      let users: IUser[];
      if (caller.role === 'admin') {
        users = await userRepository.findByRoles(ALL_ROLES);
      } else if (caller.role === 'master_trainer') {
        users = await userRepository.findByRoles(ROLES_BELOW_ADMIN, 'active');
      } else if (caller.role === 'trainer') {
        const groupIds = await scopeService.managedGroupIds(caller.id);
        const pages = await Promise.all(
          groupIds.map((groupId) =>
            userRepository.findByGroupId(groupId),
          ),
        );
        users = pages.flat();
      } else if (caller.role === 'group_leader' && caller.group_id) {
        users = await userRepository.findByGroupId(caller.group_id);
      } else {
        const self = await userRepository.findById(caller.id);
        users = self ? [self] : [];
      }
      return await this.enrichWithManagedGroupIds(users);
    } catch (error) {
      return handleServiceError('UserService.getUsers', error);
    }
  }

  async getUserById(userId: string): Promise<IUserWithManagedGroups | null> {
    try {
      const user = await userRepository.findById(userId);
      if (!user) return null;
      const [enriched] = await this.enrichWithManagedGroupIds([user]);
      return enriched;
    } catch (error) {
      return handleServiceError('UserService.getUserById', error);
    }
  }

  async updateUser(params: IUpdateUserParams): Promise<IUser> {
    try {
      // Strip admin-only fields for non-admin callers
      const updateData: IUserUpdate = { ...params.data };
      if (params.callerRole !== 'admin') {
        delete updateData.role;
      }

      const existingUser = await userRepository.findById(params.userId);
      if (!existingUser) {
        throw new UserNotFoundError();
      }

      // An email change is two-phase: Cognito first, then the user item
      if (updateData.email && updateData.email !== existingUser.email) {
        const oldEmail = existingUser.email;
        await cognitoService.updateEmail(oldEmail, updateData.email);

        try {
          return await userRepository.updateUser(params.userId, updateData);
        } catch (dbError) {
          try {
            await cognitoService.updateEmail(updateData.email, oldEmail);
          } catch {
            // Best-effort rollback; the original error is rethrown
          }
          throw dbError;
        }
      }

      return await userRepository.updateUser(params.userId, updateData);
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw error;
      }
      return handleServiceError('UserService.updateUser', error);
    }
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      const user = await userRepository.findById(userId);
      if (!user) {
        throw new UserNotFoundError();
      }

      await userRepository.deleteUser(userId);

      try {
        await cognitoService.deleteUser(user.email);
      } catch {
        // The user item is already deleted; an orphaned Cognito user is tolerated
      }
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw error;
      }
      return handleServiceError('UserService.deleteUser', error);
    }
  }

  async findUsersByIds(userIds: string[]): Promise<IUser[]> {
    try {
      return await userRepository.findByIds(userIds);
    } catch (error) {
      return handleServiceError('UserService.findUsersByIds', error);
    }
  }

  async updateUsersGroupId(
    userIds: string[],
    groupId: string | null,
  ): Promise<void> {
    try {
      await userRepository.updateGroupIdForUsers(userIds, groupId);
    } catch (error) {
      return handleServiceError('UserService.updateUsersGroupId', error);
    }
  }

  /** Deactivating also disables the Cognito user so no new sign-in succeeds. */
  async setUserStatus(
    userId: string,
    status: 'active' | 'inactive',
  ): Promise<IUser> {
    try {
      const existingUser = await userRepository.findById(userId);
      if (!existingUser) {
        throw new UserNotFoundError();
      }

      if (existingUser.status === status) {
        return existingUser;
      }

      const updatedUser = await userRepository.updateUser(userId, { status });
      if (status === 'inactive') {
        await cognitoService.disableUser(existingUser.email);
      } else {
        await cognitoService.enableUser(existingUser.email);
      }
      return updatedUser;
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw error;
      }
      return handleServiceError('UserService.setUserStatus', error);
    }
  }

  async createUser(params: ICreateUserParams): Promise<IUser> {
    try {
      const email = params.email.toLowerCase();

      if (params.role === 'agent') {
        const agentCode = await agentCodeRepository.findByCode(
          params.agentCode ?? '',
          { consistent: true },
        );
        if (!agentCode || agentCode.is_used) {
          throw new AgentCodeInvalidError();
        }
      }

      const authUser = await cognitoService.createUser(email);

      try {
        if (params.role === 'agent') {
          await agentCodeRepository.claim(params.agentCode!, authUser.id);
        }
      } catch (claimError) {
        await cognitoService.deleteUser(email).catch(() => undefined);
        throw claimError;
      }

      try {
        return await userRepository.insertUser({
          id: authUser.id,
          email,
          name: params.name,
          role: params.role,
          agent_code: params.role === 'agent' ? params.agentCode : null,
        });
      } catch (insertError) {
        if (params.role === 'agent') {
          await agentCodeRepository
            .release(params.agentCode!)
            .catch(() => undefined);
        }
        await cognitoService.deleteUser(email).catch(() => undefined);
        throw insertError;
      }
    } catch (error) {
      // Re-throw domain errors directly so the controller can handle them
      if (
        error instanceof AgentCodeInvalidError ||
        error instanceof UserAlreadyExistsError
      ) {
        throw error;
      }
      return handleServiceError('UserService.createUser', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const userService = new UserService();
export default userService;
