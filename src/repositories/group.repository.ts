import loggingService from '@src/services/logging.service';
import supabaseService from '@src/services/supabase.service';
import { IGroup, IGroupTrainer } from '@src/types/auth.types';
import { Database } from '@src/types/database.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type GroupsRow = Database['public']['Tables']['groups']['Row'];
type GroupTrainersRow = Database['public']['Tables']['group_trainers']['Row'];
type GroupsInsert = Database['public']['Tables']['groups']['Insert'];
type GroupTrainersInsert = Database['public']['Tables']['group_trainers']['Insert'];

/******************************************************************************
                            GroupRepository
******************************************************************************/

class GroupRepository {
  async insertGroup(data: GroupsInsert, userToken: string): Promise<IGroup> {
    try {
      loggingService.info('GroupRepository.insertGroup called', { name: data.name });

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

  async insertGroupTrainer(data: GroupTrainersInsert, userToken: string): Promise<IGroupTrainer> {
    try {
      loggingService.info('GroupRepository.insertGroupTrainer called', {
        group_id: data.group_id,
        trainer_id: data.trainer_id,
      });

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
}

/******************************************************************************
                                Export
******************************************************************************/

export const groupRepository = new GroupRepository();
export default groupRepository;
