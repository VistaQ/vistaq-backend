import loggingService from '@src/services/logging.service';
import supabaseService from '@src/services/supabase.service';
import { IAgentCode, ITenant, IUser } from '@src/types/auth.types';
import { Database } from '@src/types/database.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type TenantsRow = Database['public']['Tables']['tenants']['Row'];
type AgentCodesRow = Database['public']['Tables']['agent_codes']['Row'];
type UsersRow = Database['public']['Tables']['users']['Row'];
type UsersInsert = Database['public']['Tables']['users']['Insert'];

/******************************************************************************
                            AuthRepository
******************************************************************************/

class AuthRepository {
  async findTenantBySlug(slug: string): Promise<ITenant | null> {
    try {
      loggingService.info('AuthRepository.findTenantBySlug called', { slug });

      const response = await supabaseService.adminSelect('tenants', '*', {
        slug,
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const row = response.data[0] as unknown as TenantsRow;
      const tenant: ITenant = {
        id: row.id,
        slug: row.slug,
        name: row.name,
        status: row.status,
        created_at: row.created_at,
      };

      return tenant;
    } catch (error) {
      return handleRepositoryError('AuthRepository.findTenantBySlug', error);
    }
  }

  async findAgentCode(
    agentCode: string,
    tenantId: string,
  ): Promise<IAgentCode | null> {
    try {
      loggingService.info('AuthRepository.findAgentCode called', {
        agentCode,
        tenantId,
      });

      const response = await supabaseService.adminSelect('agent_codes', '*', {
        agent_code: agentCode,
        tenant_id: tenantId,
        is_used: false,
      } as Partial<AgentCodesRow>);

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
      return handleRepositoryError('AuthRepository.findAgentCode', error);
    }
  }

  async insertUser(userData: UsersInsert): Promise<IUser> {
    try {
      loggingService.info('AuthRepository.insertUser called', {
        email: userData.email,
      });

      const response = await supabaseService.adminInsert('users', userData);

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
        phone: row.phone,
        agency: row.agency,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };

      return user;
    } catch (error) {
      return handleRepositoryError('AuthRepository.insertUser', error);
    }
  }

  async createAuthUser(
    email: string,
    password: string,
  ): Promise<{ id: string }> {
    try {
      loggingService.info('AuthRepository.createAuthUser called', { email });

      const authUser = await supabaseService.adminCreateAuthUser(
        email,
        password,
      );

      return { id: authUser.id };
    } catch (error) {
      return handleRepositoryError('AuthRepository.createAuthUser', error);
    }
  }

  async deleteAuthUser(userId: string): Promise<void> {
    try {
      loggingService.info('AuthRepository.deleteAuthUser called', { userId });

      await supabaseService.adminDeleteAuthUser(userId);
    } catch (error) {
      return handleRepositoryError('AuthRepository.deleteAuthUser', error);
    }
  }

  async signInWithPassword(
    email: string,
    password: string,
  ): Promise<{ userId: string; token: string } | null> {
    try {
      loggingService.info('AuthRepository.signInWithPassword called', { email });

      const response = await supabaseService.signInWithPassword(email, password);

      if (response.error || !response.data.session) {
        // Credential failure — not an unexpected error
        loggingService.info('AuthRepository.signInWithPassword — invalid credentials', { email });
        return null;
      }

      return {
        userId: response.data.session.user.id,
        token: response.data.session.access_token,
      };
    } catch (error) {
      // Unexpected error (network, etc.) — rethrow via handleRepositoryError
      return handleRepositoryError('AuthRepository.signInWithPassword', error);
    }
  }

  async findUserById(id: string): Promise<IUser | null> {
    try {
      loggingService.info('AuthRepository.findUserById called', { id });

      const response = await supabaseService.adminSelect('users', '*', {
        id,
      } as Partial<UsersRow>);

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        return null;
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
        phone: row.phone,
        agency: row.agency,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };

      return user;
    } catch (error) {
      return handleRepositoryError('AuthRepository.findUserById', error);
    }
  }

  async signOut(token: string): Promise<void> {
    try {
      loggingService.info('AuthRepository.signOut called');

      await supabaseService.signOut(token);
    } catch (error) {
      return handleRepositoryError('AuthRepository.signOut', error);
    }
  }

  async updateAgentCode(agentCodeId: string, userId: string): Promise<void> {
    try {
      loggingService.info('AuthRepository.updateAgentCode called', {
        agentCodeId,
        userId,
      });

      const response = await supabaseService.adminUpdate(
        'agent_codes',
        { is_used: true, user_id: userId },
        { id: agentCodeId },
      );

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      return handleRepositoryError('AuthRepository.updateAgentCode', error);
    }
  }

  async findUserByEmail(email: string, tenantId: string): Promise<IUser | null> {
    try {
      loggingService.info('AuthRepository.findUserByEmail called', { email, tenantId });

      const response = await supabaseService.adminSelect('users', '*', {
        email,
        tenant_id: tenantId,
      } as Partial<UsersRow>);

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        return null;
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
        phone: row.phone,
        agency: row.agency,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };

      return user;
    } catch (error) {
      return handleRepositoryError('AuthRepository.findUserByEmail', error);
    }
  }

  async resetPasswordForEmail(email: string, redirectTo: string): Promise<void> {
    try {
      loggingService.info('AuthRepository.resetPasswordForEmail called', { email });

      await supabaseService.resetPasswordForEmail(email, redirectTo);
    } catch (error) {
      return handleRepositoryError('AuthRepository.resetPasswordForEmail', error);
    }
  }

  async getUserIdFromToken(token: string): Promise<{ userId: string }> {
    try {
      loggingService.info('AuthRepository.getUserIdFromToken called');

      return await supabaseService.getUserIdFromToken(token);
    } catch (error) {
      return handleRepositoryError('AuthRepository.getUserIdFromToken', error);
    }
  }

  async updateAuthUserPassword(userId: string, password: string): Promise<void> {
    try {
      loggingService.info('AuthRepository.updateAuthUserPassword called', { userId });

      await supabaseService.adminUpdateAuthUserPassword(userId, password);
    } catch (error) {
      return handleRepositoryError('AuthRepository.updateAuthUserPassword', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const authRepository = new AuthRepository();
export default authRepository;
