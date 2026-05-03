import supabaseService from '@src/services/supabase.service';
import { IAgentCode, IUser } from '@src/types/auth.types';
import { Database } from '@src/types/database.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type AgentCodesRow = Database['public']['Tables']['agent_codes']['Row'];
type GroupTrainersRow = Database['public']['Tables']['group_trainers']['Row'];
type UsersRow = Database['public']['Tables']['users']['Row'];
type UsersInsert = Database['public']['Tables']['users']['Insert'];
type UsersUpdate = Database['public']['Tables']['users']['Update'];

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
        phone: row.phone,
        agency: row.agency,
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
        phone: row.phone,
        agency: row.agency,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));

      return users;
    } catch (error) {
      return handleRepositoryError('UserRepository.findAll', error);
    }
  }

  async findById(
    userId: string,
    userToken: string,
  ): Promise<IUser | null> {
    try {
      const response = await supabaseService.userSelect(
        userToken,
        'users',
        '*',
        { id: userId } as Partial<UsersRow>,
      );

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
      return handleRepositoryError('UserRepository.findById', error);
    }
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      await supabaseService.adminDelete('users', { id: userId });
    } catch (error) {
      return handleRepositoryError('UserRepository.deleteUser', error);
    }
  }

  async deleteAuthUser(userId: string): Promise<void> {
    try {
      await supabaseService.adminDeleteAuthUser(userId);
    } catch (error) {
      return handleRepositoryError('UserRepository.deleteAuthUser', error);
    }
  }

  async updateUser(
    userId: string,
    data: UsersUpdate,
    userToken: string,
  ): Promise<IUser> {
    try {
      const response = await supabaseService.userUpdate(
        userToken,
        'users',
        data,
        { id: userId } as Partial<UsersRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        throw new Error('No user returned after update');
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
      return handleRepositoryError('UserRepository.updateUser', error);
    }
  }

  async findByIds(userIds: string[], userToken: string): Promise<IUser[]> {
    try {
      const response = await supabaseService.userSelectIn(
        userToken,
        'users',
        '*',
        'id',
        userIds,
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
        phone: row.phone,
        agency: row.agency,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));

      return users;
    } catch (error) {
      return handleRepositoryError('UserRepository.findByIds', error);
    }
  }

  async updateGroupIdForUsers(
    userIds: string[],
    groupId: string,
    userToken: string,
  ): Promise<void> {
    try {
      const response = await supabaseService.userUpdateIn(
        userToken,
        'users',
        { group_id: groupId },
        'id',
        userIds,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      return handleRepositoryError(
        'UserRepository.updateGroupIdForUsers',
        error,
      );
    }
  }

  async updateAuthUserEmail(userId: string, email: string): Promise<void> {
    try {
      await supabaseService.adminUpdateAuthUserEmail(userId, email);
    } catch (error) {
      return handleRepositoryError(
        'UserRepository.updateAuthUserEmail',
        error,
      );
    }
  }

  async findManagedGroupIdsByUserIds(
    userIds: string[],
    userToken: string,
  ): Promise<Map<string, string[]>> {
    try {
      if (userIds.length === 0) return new Map();

      const response = await supabaseService.userSelectIn(
        userToken,
        'group_trainers',
        'group_id,trainer_id',
        'trainer_id',
        userIds,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as GroupTrainersRow[];
      const map = new Map<string, string[]>();
      for (const row of rows) {
        const existing = map.get(row.trainer_id) ?? [];
        existing.push(row.group_id);
        map.set(row.trainer_id, existing);
      }
      return map;
    } catch (error) {
      return handleRepositoryError(
        'UserRepository.findManagedGroupIdsByUserIds',
        error,
      );
    }
  }

  async updateAgentCode(
    agentCodeId: string,
    userId: string,
    userToken: string,
  ): Promise<void> {
    try {
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

  async updateAuthUserPassword(userId: string, password: string): Promise<void> {
    try {
      await supabaseService.adminUpdateAuthUserPassword(userId, password);
    } catch (error) {
      return handleRepositoryError('UserRepository.updateAuthUserPassword', error);
    }
  }

  async findByAgentCodes(
    tenantId: string,
    agentCodes: string[],
  ): Promise<{ id: string; agent_code: string }[]> {
    try {
      if (agentCodes.length === 0) return [];

      const { data, error } = await (
        supabaseService as unknown as {
          adminClient: {
            from: (t: string) => {
              select: (s: string) => {
                eq: (c: string, v: unknown) => {
                  in: (c: string, v: unknown[]) => Promise<{ data: { id: string; agent_code: string }[] | null; error: { message: string } | null }>;
                };
              };
            };
          };
        }
      ).adminClient
        .from('users')
        .select('id, agent_code')
        .eq('tenant_id', tenantId)
        .in('agent_code', agentCodes);

      if (error) throw new Error(error.message);
      return data ?? [];
    } catch (error) {
      handleRepositoryError('UserRepository.findByAgentCodes', error);
    }
  }

  /**
   * Returns the caller's `users.group_id` (nullable) using the service-role
   * client. Used by the sales-report read API to scope a `group_leader`'s
   * view to their own group's agents — the caller is always identified by a
   * verified JWT, so bypassing RLS for this lookup is safe.
   */
  async findGroupIdById(userId: string): Promise<string | null> {
    try {
      const response = await supabaseService.adminSelect(
        'users',
        'group_id',
        { id: userId } as Partial<UsersRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as { group_id: string | null }[];
      if (rows.length === 0) return null;
      return rows[0].group_id ?? null;
    } catch (error) {
      return handleRepositoryError('UserRepository.findGroupIdById', error);
    }
  }

  /**
   * Resolves a set of user IDs to `{ id, name, agent_code }` triples using the
   * service-role client (bypasses RLS). Used by the sales-report read API to
   * decorate aggregated YTD rows with the agent's display name + code.
   *
   * When `groupIds` is supplied, the result is additionally filtered to users
   * whose `users.group_id` is in that set — this is how role-based scoping for
   * `trainer` and `group_leader` callers is enforced. An empty `groupIds`
   * array short-circuits to `[]` (caller has no permitted scope).
   */
  async findIdNameAgentCodeByIds(
    userIds: string[],
    groupIds?: string[],
  ): Promise<{ id: string; name: string; agent_code: string | null }[]> {
    try {
      if (userIds.length === 0) return [];
      if (groupIds !== undefined && groupIds.length === 0) return [];

      let q = (
        supabaseService as unknown as {
          adminClient: { from: (t: string) => unknown };
        }
      ).adminClient
        .from('users');

      q = (q as { select: (s: string) => unknown }).select(
        'id, name, agent_code',
      );
      q = (q as { in: (c: string, v: unknown[]) => unknown }).in('id', userIds);
      if (groupIds !== undefined) {
        q = (q as { in: (c: string, v: unknown[]) => unknown }).in(
          'group_id',
          groupIds,
        );
      }

      const { data, error } = (await q) as {
        data:
          | { id: string; name: string; agent_code: string | null }[]
          | null;
        error: { message: string } | null;
      };

      if (error) throw new Error(error.message);
      return data ?? [];
    } catch (error) {
      handleRepositoryError('UserRepository.findIdNameAgentCodeByIds', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const userRepository = new UserRepository();
export default userRepository;
