import loggingService from '@src/services/logging.service';
import supabaseService from '@src/services/supabase.service';
import { IAgentCode, IUser } from '@src/types/auth.types';
import { Database } from '@src/types/database.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type AgentCodesRow = Database['public']['Tables']['agent_codes']['Row'];
type UsersRow = Database['public']['Tables']['users']['Row'];
type UsersInsert = Database['public']['Tables']['users']['Insert'];

/******************************************************************************
                            UserRepository
******************************************************************************/

class UserRepository {
  async findAgentCode(
    agentCode: string,
    tenantId: string,
    userToken: string,
  ): Promise<IAgentCode | null> {
    try {
      loggingService.info('UserRepository.findAgentCode called', {
        agentCode,
        tenantId,
      });

      const response = await supabaseService.userSelect(
        userToken,
        'agent_codes',
        '*',
        {
          agent_code: agentCode,
          tenant_id: tenantId,
          is_used: false,
        } as Partial<AgentCodesRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const row = response.data[0] as unknown as AgentCodesRow;
      const agentCodeRecord: IAgentCode = {
        id: row.id,
        tenant_id: row.tenant_id,
        agent_code: row.agent_code,
        user_id: row.user_id,
        is_used: row.is_used,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };

      return agentCodeRecord;
    } catch (error) {
      return handleRepositoryError('UserRepository.findAgentCode', error);
    }
  }

  async createAuthUser(
    email: string,
    password: string,
  ): Promise<{ id: string }> {
    try {
      loggingService.info('UserRepository.createAuthUser called', { email });

      const authUser = await supabaseService.adminCreateAuthUser(
        email,
        password,
      );

      return { id: authUser.id };
    } catch (error) {
      return handleRepositoryError('UserRepository.createAuthUser', error);
    }
  }

  async insertUser(userData: UsersInsert, userToken: string): Promise<IUser> {
    try {
      loggingService.info('UserRepository.insertUser called', {
        email: userData.email,
      });

      const response = await supabaseService.userInsert(
        userToken,
        'users',
        userData,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        throw new Error('No user returned after insert');
      }

      const row = response.data[0] as unknown as UsersRow;
      const user: IUser = {
        id: row.id,
        tenant_id: row.tenant_id,
        email: row.email,
        name: row.name,
        role: row.role,
        agent_code: row.agent_code,
        location: row.location,
        group_id: row.group_id,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };

      return user;
    } catch (error) {
      return handleRepositoryError('UserRepository.insertUser', error);
    }
  }

  async findAll(userToken: string): Promise<IUser[]> {
    try {
      loggingService.info('UserRepository.findAll called');

      const response = await supabaseService.userSelect(
        userToken,
        'users',
        '*',
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as UsersRow[];
      const users: IUser[] = rows.map((row) => ({
        id: row.id,
        tenant_id: row.tenant_id,
        email: row.email,
        name: row.name,
        role: row.role,
        agent_code: row.agent_code,
        location: row.location,
        group_id: row.group_id,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));

      return users;
    } catch (error) {
      return handleRepositoryError('UserRepository.findAll', error);
    }
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      loggingService.info('UserRepository.deleteUser called', { userId });

      await supabaseService.adminDelete('users', { id: userId });
    } catch (error) {
      return handleRepositoryError('UserRepository.deleteUser', error);
    }
  }

  async deleteAuthUser(userId: string): Promise<void> {
    try {
      loggingService.info('UserRepository.deleteAuthUser called', { userId });

      await supabaseService.adminDeleteAuthUser(userId);
    } catch (error) {
      return handleRepositoryError('UserRepository.deleteAuthUser', error);
    }
  }

  async updateAgentCode(
    agentCodeId: string,
    userId: string,
    userToken: string,
  ): Promise<void> {
    try {
      loggingService.info('UserRepository.updateAgentCode called', {
        agentCodeId,
        userId,
      });

      const response = await supabaseService.userUpdate(
        userToken,
        'agent_codes',
        { is_used: true, user_id: userId },
        { id: agentCodeId },
      );

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      return handleRepositoryError('UserRepository.updateAgentCode', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const userRepository = new UserRepository();
export default userRepository;
