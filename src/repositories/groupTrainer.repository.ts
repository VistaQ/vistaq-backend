import dynamoService from '@src/services/dynamo.service';
import EnvVars from '@src/utils/env';
import { handleRepositoryError } from '@src/utils/errorHandlers';
import { nowUtc } from '@src/utils/period';

/******************************************************************************
                              Item type
******************************************************************************/

interface IGroupTrainerItem {
  group_id: string;
  trainer_id: string;
  created_at: string;
}

export interface IGroupTrainerRow {
  group_id: string;
  trainer_id: string;
}

/******************************************************************************
                          GroupTrainerRepository
******************************************************************************/

class GroupTrainerRepository {
  async findGroupTrainersByGroupId(
    groupId: string,
  ): Promise<IGroupTrainerRow[]> {
    try {
      const items = await dynamoService.queryAll<IGroupTrainerItem>({
        table: EnvVars.GroupTrainersTable,
        keyCondition: 'group_id = :group',
        values: { ':group': groupId },
      });
      return items.map(({ group_id, trainer_id }) => ({ group_id, trainer_id }));
    } catch (error) {
      return handleRepositoryError(
        'GroupTrainerRepository.findGroupTrainersByGroupId',
        error,
      );
    }
  }

  async insertGroupTrainers(rows: IGroupTrainerRow[]): Promise<void> {
    try {
      const createdAt = nowUtc();
      await Promise.all(
        rows.map((row) =>
          dynamoService.put(EnvVars.GroupTrainersTable, {
            group_id: row.group_id,
            trainer_id: row.trainer_id,
            created_at: createdAt,
          }),
        ),
      );
    } catch (error) {
      return handleRepositoryError(
        'GroupTrainerRepository.insertGroupTrainers',
        error,
      );
    }
  }

  async deleteGroupTrainersByGroupId(groupId: string): Promise<void> {
    try {
      const existing = await this.findGroupTrainersByGroupId(groupId);
      await Promise.all(
        existing.map((row) =>
          dynamoService.delete(EnvVars.GroupTrainersTable, {
            group_id: row.group_id,
            trainer_id: row.trainer_id,
          }),
        ),
      );
    } catch (error) {
      return handleRepositoryError(
        'GroupTrainerRepository.deleteGroupTrainersByGroupId',
        error,
      );
    }
  }

  /** Returns a `trainer_id -> group_ids[]` map for the supplied trainers. */
  async findGroupIdsByTrainerIds(
    trainerIds: string[],
  ): Promise<Map<string, string[]>> {
    try {
      const map = new Map<string, string[]>();
      const unique = Array.from(new Set(trainerIds));
      const pages = await Promise.all(
        unique.map((trainerId) =>
          dynamoService.queryAll<IGroupTrainerItem>({
            table: EnvVars.GroupTrainersTable,
            index: 'byTrainer',
            keyCondition: 'trainer_id = :trainer',
            values: { ':trainer': trainerId },
          }),
        ),
      );
      unique.forEach((trainerId, i) => {
        if (pages[i].length > 0) {
          map.set(trainerId, pages[i].map((item) => item.group_id));
        }
      });
      return map;
    } catch (error) {
      return handleRepositoryError(
        'GroupTrainerRepository.findGroupIdsByTrainerIds',
        error,
      );
    }
  }
}

export const groupTrainerRepository = new GroupTrainerRepository();
export default groupTrainerRepository;
