import {
  AgentCodeInvalidError,
  UserNotFoundError,
} from '@src/models/errors/auth.errors';
import userRepository from '@src/repositories/user.repository';
import loggingService from '@src/services/logging.service';
import { IUser } from '@src/types/auth.types';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                            Interfaces
******************************************************************************/

interface IUpdateUserParams {
  userId: string;
  callerRole: string;
  token: string;
  data: {
    email?: string;
    name?: string;
    phone?: string;
    agency?: string;
    location?: string;
    role?: string;
    status?: string;
    group_id?: string | null;
  };
}

interface ICreateUserParams {
  email: string;
  name: string;
  password: string;
  role: string;
  agentCode?: string;
  tenantId: string;
  token: string;
}

/******************************************************************************
                            UserService
******************************************************************************/

class UserService {
  async getUsers(token: string): Promise<IUser[]> {
    try {
      loggingService.info('UserService.getUsers called');

      const users = await userRepository.findAll(token);

      return users;
    } catch (error) {
      return handleServiceError('UserService.getUsers', error);
    }
  }

  async getUserById(userId: string, token: string): Promise<IUser | null> {
    try {
      loggingService.info('UserService.getUserById called', { userId });

      const user = await userRepository.findById(userId, token);

      return user;
    } catch (error) {
      return handleServiceError('UserService.getUserById', error);
    }
  }

  async updateUser(params: IUpdateUserParams): Promise<IUser> {
    try {
      loggingService.info('UserService.updateUser called', {
        userId: params.userId,
      });

      // Strip admin-only fields for non-admin callers
      const updateData = { ...params.data };
      if (params.callerRole !== 'admin') {
        delete updateData.role;
        delete updateData.status;
      }

      // Fetch existing user
      const existingUser = await userRepository.findById(
        params.userId,
        params.token,
      );
      if (!existingUser) {
        throw new UserNotFoundError();
      }

      // Handle email update (two-phase: Auth first, then DB)
      if (updateData.email && updateData.email !== existingUser.email) {
        const oldEmail = existingUser.email;

        // Phase 1 — Update Supabase Auth email
        await userRepository.updateAuthUserEmail(
          params.userId,
          updateData.email,
        );

        // Phase 2 — Update users table (with rollback on failure)
        try {
          const updatedUser = await userRepository.updateUser(
            params.userId,
            updateData,
            params.token,
          );
          return updatedUser;
        } catch (dbError) {
          loggingService.error(
            'UserService.updateUser — DB update failed, rolling back Auth email',
            dbError,
            { userId: params.userId },
          );
          try {
            await userRepository.updateAuthUserEmail(params.userId, oldEmail);
          } catch (rollbackError) {
            loggingService.error(
              'UserService.updateUser — Auth email rollback failed',
              rollbackError,
              { userId: params.userId },
            );
          }
          throw dbError;
        }
      }

      // Non-email update
      const updatedUser = await userRepository.updateUser(
        params.userId,
        updateData,
        params.token,
      );

      return updatedUser;
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw error;
      }
      return handleServiceError('UserService.updateUser', error);
    }
  }

  async deleteUser(userId: string, token: string): Promise<void> {
    try {
      loggingService.info('UserService.deleteUser called', { userId });

      const user = await userRepository.findById(userId, token);
      if (!user) {
        throw new UserNotFoundError();
      }

      await userRepository.deleteUser(userId);

      try {
        await userRepository.deleteAuthUser(userId);
      } catch (authError) {
        loggingService.error(
          'UserService.deleteUser — Auth user deletion failed, DB row already removed',
          authError,
          { userId },
        );
      }
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        throw error;
      }
      return handleServiceError('UserService.deleteUser', error);
    }
  }

  async findUsersByIds(userIds: string[], token: string): Promise<IUser[]> {
    try {
      loggingService.info('UserService.findUsersByIds called', { count: userIds.length });
      return await userRepository.findByIds(userIds, token);
    } catch (error) {
      return handleServiceError('UserService.findUsersByIds', error);
    }
  }

  async updateUsersGroupId(userIds: string[], groupId: string, token: string): Promise<void> {
    try {
      loggingService.info('UserService.updateUsersGroupId called', { count: userIds.length, groupId });
      await userRepository.updateGroupIdForUsers(userIds, groupId, token);
    } catch (error) {
      return handleServiceError('UserService.updateUsersGroupId', error);
    }
  }

  async createUser(params: ICreateUserParams): Promise<IUser> {
    try {
      loggingService.info('UserService.createUser called', {
        email: params.email,
        role: params.role,
      });

      // Step 1 — Validate agent code if role is agent
      let agentCodeRecord = null;
      if (params.role === 'agent') {
        agentCodeRecord = await userRepository.findAgentCode(
          params.agentCode!,
          params.tenantId,
          params.token,
        );
        if (!agentCodeRecord) {
          throw new AgentCodeInvalidError();
        }
      }

      // Step 2 — Create Supabase Auth user
      const authUser = await userRepository.createAuthUser(
        params.email,
        params.password,
      );

      // Step 3 — Insert into users table (with rollback on failure)
      let user: IUser;
      try {
        user = await userRepository.insertUser(
          {
            id: authUser.id,
            email: params.email,
            name: params.name,
            role: params.role,
            tenant_id: params.tenantId,
            agent_code: params.role === 'agent' ? params.agentCode : null,
          },
          params.token,
        );
      } catch (insertError) {
        loggingService.error(
          'UserService.createUser — user insert failed, rolling back auth user',
          insertError,
          { authUserId: authUser.id },
        );
        try {
          await userRepository.deleteAuthUser(authUser.id);
        } catch (rollbackError) {
          loggingService.error(
            'UserService.createUser — rollback failed, auth user may be orphaned',
            rollbackError,
            { authUserId: authUser.id },
          );
        }
        throw insertError;
      }

      // Step 4 — Mark agent code as used if role is agent (with rollback on failure)
      if (params.role === 'agent' && agentCodeRecord) {
        try {
          await userRepository.updateAgentCode(
            agentCodeRecord.id,
            authUser.id,
            params.token,
          );
        } catch (updateError) {
          loggingService.error(
            'UserService.createUser — agent code update failed, rolling back users row and auth user',
            updateError,
            { authUserId: authUser.id },
          );
          try {
            await userRepository.deleteUser(authUser.id);
          } catch (rollbackUserError) {
            loggingService.error(
              'UserService.createUser — rollback of users row failed, user row may be orphaned',
              rollbackUserError,
              { authUserId: authUser.id },
            );
          }
          try {
            await userRepository.deleteAuthUser(authUser.id);
          } catch (rollbackAuthError) {
            loggingService.error(
              'UserService.createUser — rollback of auth user failed, auth user may be orphaned',
              rollbackAuthError,
              { authUserId: authUser.id },
            );
          }
          throw updateError;
        }
      }

      return user;
    } catch (error) {
      // Re-throw domain errors directly so the controller can handle them
      if (error instanceof AgentCodeInvalidError) {
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
