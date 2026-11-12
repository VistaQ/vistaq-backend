import { randomUUID } from 'crypto';

import { DynamoConditionFailedError } from '@src/models/errors/dynamo.error';
import { GroupNotFoundError } from '@src/models/errors/group.errors';
import { DynamoTable } from '@src/services/dynamo.service';
import type { IGroup } from '@src/types/auth.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';
import { nowUtc } from '@src/utils/period';

/******************************************************************************
                            Item and input types
******************************************************************************/

export interface IGroupItem {
  id: string;
  name: string;
  status: string;
  leader_id?: string;
  created_at: string;
  updated_at: string;
}

export interface INewGroup {
  name: string;
  status?: string;
  leader_id?: string | null;
}

export interface IGroupUpdate {
  name?: string;
  status?: string;
  leader_id?: string | null;
}

const groups = new DynamoTable<IGroupItem>('Groups');

const GROUP_STATUSES = ['active', 'inactive'] as const;

function toGroup(item: IGroupItem): IGroup {
  return {
    id: item.id,
    name: item.name,
    status: item.status,
    leader_id: item.leader_id ?? null,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

/******************************************************************************
                            GroupRepository
******************************************************************************/

class GroupRepository {
  async insertGroup(group: INewGroup): Promise<IGroup> {
    try {
      const now = nowUtc();
      const item: IGroupItem = {
        id: randomUUID(),
        name: group.name,
        status: group.status ?? 'active',
        ...(group.leader_id && { leader_id: group.leader_id }),
        created_at: now,
        updated_at: now,
      };
      await groups.put(
        { ...item },
        {
          condition: 'attribute_not_exists(id)',
        },
      );
      return toGroup(item);
    } catch (error) {
      return handleRepositoryError('GroupRepository.insertGroup', error);
    }
  }

  async findAll(): Promise<IGroup[]> {
    try {
      const pages = await Promise.all(
        GROUP_STATUSES.map((status) => this.findByStatus(status)),
      );
      return pages.flat();
    } catch (error) {
      return handleRepositoryError('GroupRepository.findAll', error);
    }
  }

  async findByStatus(status: string): Promise<IGroup[]> {
    try {
      const items = await groups.queryAll({
        index: 'byStatus',
        keyCondition: 'status = :status',
        values: { ':status': status },
      });
      return items.map(toGroup);
    } catch (error) {
      return handleRepositoryError('GroupRepository.findByStatus', error);
    }
  }

  async findById(groupId: string): Promise<IGroup | null> {
    try {
      const item = await groups.get({
        id: groupId,
      });
      return item ? toGroup(item) : null;
    } catch (error) {
      return handleRepositoryError('GroupRepository.findById', error);
    }
  }

  async findByIds(groupIds: string[]): Promise<IGroup[]> {
    try {
      const unique = Array.from(new Set(groupIds));
      if (unique.length === 0) {
        return [];
      }
      const items = await groups.batchGet(unique.map((id) => ({ id })));
      return items.map(toGroup);
    } catch (error) {
      return handleRepositoryError('GroupRepository.findByIds', error);
    }
  }

  async updateGroup(groupId: string, data: IGroupUpdate): Promise<IGroup> {
    try {
      const updated = await groups.updateFields({ id: groupId }, data, {
        condition: 'attribute_exists(id)',
      });
      if (!updated) {
        throw new GroupNotFoundError();
      }
      return toGroup(updated);
    } catch (error) {
      if (
        error instanceof GroupNotFoundError ||
        error instanceof DynamoConditionFailedError
      ) {
        throw new GroupNotFoundError();
      }
      return handleRepositoryError('GroupRepository.updateGroup', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const groupRepository = new GroupRepository();
export default groupRepository;
