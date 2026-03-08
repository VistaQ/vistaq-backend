import { AgentCodeInvalidError } from '@src/models/errors/auth.errors';
import userRepository from '@src/repositories/user.repository';
import loggingService from '@src/services/logging.service';
import { IUser } from '@src/types/auth.types';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                            Interfaces
******************************************************************************/

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
