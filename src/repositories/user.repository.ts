import {
  UserAlreadyExistsError,
  UserNotFoundError,
} from '@src/models/errors/auth.errors';
import { DynamoConditionFailedError } from '@src/models/errors/dynamo.error';
import { DynamoTable } from '@src/services/dynamo.service';
import type { IUser, IUserContext } from '@src/types/auth.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';
import { nowUtc } from '@src/utils/period';

/******************************************************************************
                            Item and input types
******************************************************************************/

export interface IUserItem {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  agent_code?: string;
  location?: string;
  group_id?: string;
  phone?: string;
  agency?: string;
  sales_target?: number;
  fyct_target?: number;
  fyc_target?: number;
  signed_out_at?: string;
  created_at: string;
  updated_at: string;
}

export interface INewUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status?: string;
  agent_code?: string | null;
  location?: string | null;
  group_id?: string | null;
  phone?: string | null;
  agency?: string | null;
}

export interface IUserUpdate {
  email?: string;
  name?: string;
  role?: string;
  status?: string;
  agent_code?: string | null;
  location?: string | null;
  group_id?: string | null;
  phone?: string | null;
  agency?: string | null;
  sales_target?: number | null;
  fyct_target?: number | null;
  fyc_target?: number | null;
}

const users = new DynamoTable<IUserItem>('Users');

const OPTIONAL_FIELDS = [
  'agent_code',
  'location',
  'group_id',
  'phone',
  'agency',
  'sales_target',
  'fyct_target',
  'fyc_target',
] as const;

function toUser(item: IUserItem): IUser {
  return {
    id: item.id,
    email: item.email,
    name: item.name,
    role: item.role,
    status: item.status,
    agent_code: item.agent_code ?? null,
    location: item.location ?? null,
    group_id: item.group_id ?? null,
    phone: item.phone ?? null,
    agency: item.agency ?? null,
    sales_target: item.sales_target ?? null,
    fyct_target: item.fyct_target ?? null,
    fyc_target: item.fyc_target ?? null,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

/******************************************************************************
                            UserRepository
******************************************************************************/

class UserRepository {
  async insertUser(user: INewUser): Promise<IUser> {
    try {
      const now = nowUtc();
      const item: IUserItem = {
        id: user.id,
        email: user.email.toLowerCase(),
        name: user.name,
        role: user.role,
        status: user.status ?? 'active',
        created_at: now,
        updated_at: now,
      };
      for (const field of OPTIONAL_FIELDS) {
        const value = (user as unknown as Record<string, unknown>)[field];
        if (value !== undefined && value !== null) {
          (item as unknown as Record<string, unknown>)[field] = value;
        }
      }

      await users.put(
        { ...item },
        {
          condition: 'attribute_not_exists(id)',
        },
      );
      return toUser(item);
    } catch (error) {
      if (error instanceof DynamoConditionFailedError) {
        throw new UserAlreadyExistsError();
      }
      return handleRepositoryError('UserRepository.insertUser', error);
    }
  }

  async findById(
    userId: string,
    options?: { consistent?: boolean },
  ): Promise<IUser | null> {
    try {
      const item = await users.get({ id: userId }, options);
      return item ? toUser(item) : null;
    } catch (error) {
      return handleRepositoryError('UserRepository.findById', error);
    }
  }

  async findContextById(userId: string): Promise<IUserContext | null> {
    try {
      const item = await users.get({ id: userId }, { consistent: true });
      return item
        ? { ...toUser(item), signed_out_at: item.signed_out_at ?? null }
        : null;
    } catch (error) {
      return handleRepositoryError('UserRepository.findContextById', error);
    }
  }

  async markSignedOut(userId: string): Promise<void> {
    try {
      await users.update({ id: userId }, 'SET signed_out_at = :signedOutAt', {
        values: { ':signedOutAt': nowUtc() },
        condition: 'attribute_exists(id)',
      });
    } catch (error) {
      if (error instanceof DynamoConditionFailedError) {
        return;
      }
      return handleRepositoryError('UserRepository.markSignedOut', error);
    }
  }

  async findByIds(userIds: string[]): Promise<IUser[]> {
    try {
      const unique = Array.from(new Set(userIds));
      const items = await users.batchGet(unique.map((id) => ({ id })));
      return items.map(toUser);
    } catch (error) {
      return handleRepositoryError('UserRepository.findByIds', error);
    }
  }

  /** Active members of a group, or every status when `status` is null. */
  async findByGroupId(
    groupId: string,
    status: string | null = 'active',
  ): Promise<IUser[]> {
    try {
      const items = await users.queryAll({
        index: 'byGroup',
        keyCondition: status
          ? 'group_id = :group AND status = :status'
          : 'group_id = :group',
        values: status
          ? { ':group': groupId, ':status': status }
          : { ':group': groupId },
      });
      return items.map(toUser);
    } catch (error) {
      return handleRepositoryError('UserRepository.findByGroupId', error);
    }
  }

  async findByRoles(roles: string[], status?: string): Promise<IUser[]> {
    try {
      const pages = await Promise.all(
        roles.map((role) =>
          users.queryAll({
            index: 'byRoleStatus',
            keyCondition: status
              ? 'role = :role AND status = :status'
              : 'role = :role',
            values: status
              ? { ':role': role, ':status': status }
              : { ':role': role },
          }),
        ),
      );
      return pages.flat().map(toUser);
    } catch (error) {
      return handleRepositoryError('UserRepository.findByRoles', error);
    }
  }

  /** Active users holding any of the given agent codes. */
  async findByAgentCodes(
    agentCodes: string[],
  ): Promise<{ id: string; agent_code: string }[]> {
    try {
      const pages = await Promise.all(
        Array.from(new Set(agentCodes)).map((agentCode) =>
          users.queryAll({
            index: 'byAgentCode',
            keyCondition: 'agent_code = :code',
            values: { ':code': agentCode },
          }),
        ),
      );
      return pages
        .flat()
        .filter((item) => item.status === 'active')
        .map((item) => ({
          id: item.id,
          agent_code: item.agent_code as string,
        }));
    } catch (error) {
      return handleRepositoryError('UserRepository.findByAgentCodes', error);
    }
  }

  async updateUser(userId: string, data: IUserUpdate): Promise<IUser> {
    try {
      const updated = await users.updateFields(
        { id: userId },
        {
          ...data,
          ...(data.email && { email: data.email.toLowerCase() }),
        },
        { condition: 'attribute_exists(id)' },
      );
      if (!updated) {
        throw new UserNotFoundError();
      }
      return toUser(updated);
    } catch (error) {
      if (
        error instanceof UserNotFoundError ||
        error instanceof DynamoConditionFailedError
      ) {
        throw new UserNotFoundError();
      }
      return handleRepositoryError('UserRepository.updateUser', error);
    }
  }

  async updateGroupIdForUsers(
    userIds: string[],
    groupId: string | null,
  ): Promise<void> {
    try {
      await Promise.all(
        userIds.map((id) => this.updateUser(id, { group_id: groupId })),
      );
    } catch (error) {
      return handleRepositoryError(
        'UserRepository.updateGroupIdForUsers',
        error,
      );
    }
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      await users.delete({ id: userId });
    } catch (error) {
      return handleRepositoryError('UserRepository.deleteUser', error);
    }
  }

  async findGroupIdById(userId: string): Promise<string | null> {
    try {
      const user = await this.findById(userId);
      return user?.group_id ?? null;
    } catch (error) {
      return handleRepositoryError('UserRepository.findGroupIdById', error);
    }
  }

  /**
   * Resolves user ids to `{ id, name, agent_code, fyct_target, fyc_target }`.
   * When `groupIds` is given, only users in those groups are returned; an empty
   * `groupIds` means the caller has no permitted scope.
   */
  async findIdNameAgentCodeByIds(
    userIds: string[],
    groupIds?: string[],
  ): Promise<
    {
      id: string;
      name: string;
      agent_code: string | null;
      fyct_target: number | null;
      fyc_target: number | null;
    }[]
  > {
    try {
      if (userIds.length === 0) return [];
      if (groupIds !== undefined && groupIds.length === 0) return [];

      const users = await this.findByIds(userIds);
      return users
        .filter(
          (u) =>
            groupIds === undefined ||
            (u.group_id !== null && groupIds.includes(u.group_id)),
        )
        .map((u) => ({
          id: u.id,
          name: u.name,
          agent_code: u.agent_code,
          fyct_target: u.fyct_target,
          fyc_target: u.fyc_target,
        }));
    } catch (error) {
      return handleRepositoryError(
        'UserRepository.findIdNameAgentCodeByIds',
        error,
      );
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const userRepository = new UserRepository();
export default userRepository;
