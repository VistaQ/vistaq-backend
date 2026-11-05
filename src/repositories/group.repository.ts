import supabaseService from '@src/services/supabase.service';
import type { IGroup } from '@src/types/auth.types';
import type { Database } from '@src/types/database.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type GroupsRow = Database['public']['Tables']['groups']['Row'];
type GroupsInsert = Database['public']['Tables']['groups']['Insert'];
type GroupsUpdate = Database['public']['Tables']['groups']['Update'];

/******************************************************************************
                            GroupRepository
******************************************************************************/

class GroupRepository {
  async insertGroup(data: GroupsInsert, userToken: string): Promise<IGroup> {
    try {
      const response = await supabaseService.userInsert(userToken, 'groups', data);

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        throw new Error('No group returned after insert');
      }

      const row = response.data[0] as unknown as GroupsRow;
      const group: IGroup = {
        id: row.id,
        tenant_id: row.tenant_id,
        name: row.name,
        status: row.status,
        leader_id: row.leader_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };

      return group;
    } catch (error) {
      return handleRepositoryError('GroupRepository.insertGroup', error);
    }
  }

  async findAll(userToken: string): Promise<IGroup[]> {
    try {
      const response = await supabaseService.userSelect(userToken, 'groups', '*');

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = response.data as unknown as GroupsRow[];
      return rows.map((row) => ({
        id: row.id,
        tenant_id: row.tenant_id,
        name: row.name,
        status: row.status,
        leader_id: row.leader_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
    } catch (error) {
      return handleRepositoryError('GroupRepository.findAll', error);
    }
  }

  async findById(groupId: string, userToken: string): Promise<IGroup | null> {
    try {
      const response = await supabaseService.userSelect(
        userToken,
        'groups',
        '*',
        { id: groupId } as Partial<GroupsRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const row = response.data[0] as unknown as GroupsRow;
      const group: IGroup = {
        id: row.id,
        tenant_id: row.tenant_id,
        name: row.name,
        status: row.status,
        leader_id: row.leader_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };

      return group;
    } catch (error) {
      return handleRepositoryError('GroupRepository.findById', error);
    }
  }

  async updateGroup(
    groupId: string,
    data: GroupsUpdate,
    userToken: string,
  ): Promise<IGroup> {
    try {
      const response = await supabaseService.userUpdate(
        userToken,
        'groups',
        data,
        { id: groupId } as Partial<GroupsRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        throw new Error('No group returned after update');
      }

      const row = response.data[0] as unknown as GroupsRow;
      const group: IGroup = {
        id: row.id,
        tenant_id: row.tenant_id,
        name: row.name,
        status: row.status,
        leader_id: row.leader_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };

      return group;
    } catch (error) {
      return handleRepositoryError('GroupRepository.updateGroup', error);
    }
  }

  async getGroupStats(token: string) {
    try {
      return await supabaseService.userRpc(token, 'get_group_stats', {});
    } catch (error) {
      return handleRepositoryError('GroupRepository.getGroupStats', error);
    }
  }

  async getGroupDetailStats(token: string, periodStart: string, groupId: string) {
    try {
      return await supabaseService.userRpc(token, 'get_group_detail_stats', {
        p_group_id: groupId,
        period_start: periodStart,
      });
    } catch (error) {
      return handleRepositoryError('GroupRepository.getGroupDetailStats', error);
    }
  }

  async getAgentStats(token: string, groupId: string, periodStart: string) {
    try {
      return await supabaseService.userRpc(token, 'get_agent_stats', {
        p_group_id: groupId,
        period_start: periodStart,
      });
    } catch (error) {
      return handleRepositoryError('GroupRepository.getAgentStats', error);
    }
  }

  async getGroupAgentsCount(token: string, groupId: string): Promise<number> {
    try {
      return await supabaseService.userCountWithEq(
        token,
        'users',
        { group_id: groupId, status: 'active' },
        'role',
        ['agent', 'group_leader'],
      );
    } catch (error) {
      return handleRepositoryError('GroupRepository.getGroupAgentsCount', error);
    }
  }

  async findActiveByTenantId(tenantId: string): Promise<Pick<GroupsRow, 'id' | 'name'>[]> {
    try {
      const response = await supabaseService.adminSelect(
        'groups',
        'id,name',
        { tenant_id: tenantId, status: 'active' } as Partial<GroupsRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as Pick<GroupsRow, 'id' | 'name'>[];
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
      }));
    } catch (error) {
      return handleRepositoryError('GroupRepository.findActiveByTenantId', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const groupRepository = new GroupRepository();
export default groupRepository;
