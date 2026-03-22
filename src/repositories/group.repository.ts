import supabaseService from '@src/services/supabase.service';
import { IGroup, IGroupTrainer } from '@src/types/auth.types';
import { Database } from '@src/types/database.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type GroupsRow = Database['public']['Tables']['groups']['Row'];
type GroupTrainersRow = Database['public']['Tables']['group_trainers']['Row'];
type GroupsInsert = Database['public']['Tables']['groups']['Insert'];
type GroupsUpdate = Database['public']['Tables']['groups']['Update'];
type GroupTrainersInsert = Database['public']['Tables']['group_trainers']['Insert'];

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
        { group_id: groupId },
        'role',
        ['agent', 'group_leader'],
      );
    } catch (error) {
      return handleRepositoryError('GroupRepository.getGroupAgentsCount', error);
    }
  }

  async findGroupTrainersByGroupId(groupId: string, userToken: string): Promise<Array<{ group_id: string; trainer_id: string }>> {
    try {
      const response = await supabaseService.userSelect(
        userToken,
        'group_trainers',
        'group_id,trainer_id',
        { group_id: groupId } as Partial<GroupTrainersRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as GroupTrainersRow[];
      return rows.map((row) => ({
        group_id: row.group_id,
        trainer_id: row.trainer_id,
      }));
    } catch (error) {
      return handleRepositoryError('GroupRepository.findGroupTrainersByGroupId', error);
    }
  }

  async insertGroupTrainer(data: GroupTrainersInsert, userToken: string): Promise<IGroupTrainer> {
    try {
      const response = await supabaseService.userInsert(userToken, 'group_trainers', data);

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        throw new Error('No group trainer returned after insert');
      }

      const row = response.data[0] as unknown as GroupTrainersRow;
      const groupTrainer: IGroupTrainer = {
        group_id: row.group_id,
        trainer_id: row.trainer_id,
        created_at: row.created_at,
      };

      return groupTrainer;
    } catch (error) {
      return handleRepositoryError('GroupRepository.insertGroupTrainer', error);
    }
  }

  async insertGroupTrainers(data: GroupTrainersInsert[], userToken: string): Promise<IGroupTrainer[]> {
    try {
      const response = await supabaseService.userInsert(userToken, 'group_trainers', data);

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        throw new Error('No group trainers returned after insert');
      }

      const rows = response.data as unknown as GroupTrainersRow[];
      return rows.map((row) => ({
        group_id: row.group_id,
        trainer_id: row.trainer_id,
        created_at: row.created_at,
      }));
    } catch (error) {
      return handleRepositoryError('GroupRepository.insertGroupTrainers', error);
    }
  }

  async deleteGroupTrainersByGroupId(groupId: string, userToken: string): Promise<void> {
    try {
      const response = await supabaseService.userDelete(userToken, 'group_trainers', {
        group_id: groupId,
      } as Partial<GroupTrainersRow>);

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      return handleRepositoryError('GroupRepository.deleteGroupTrainersByGroupId', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const groupRepository = new GroupRepository();
export default groupRepository;
