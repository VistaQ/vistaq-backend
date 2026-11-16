import {
  AgentCodeConflictError,
  AgentCodeNotFoundError,
} from '@src/models/errors/agentCode.errors';
import { AgentCodeInvalidError } from '@src/models/errors/auth.errors';
import { DynamoConditionFailedError } from '@src/models/errors/dynamo.error';
import dynamoService, { DynamoTable } from '@src/services/dynamo.service';
import type { IAgentCode } from '@src/types/agentCode';
import { handleRepositoryError } from '@src/utils/errorHandlers';
import { nowUtc } from '@src/utils/period';

/******************************************************************************
                              Item type
******************************************************************************/

export interface IAgentCodeItem {
  agent_code: string;
  used_flag: 0 | 1;
  user_id?: string;
  created_at: string;
  updated_at: string;
}

const agentCodes = new DynamoTable<IAgentCodeItem>('AgentCodes');

function toAgentCode(item: IAgentCodeItem): IAgentCode {
  return {
    agent_code: item.agent_code,
    is_used: item.used_flag === 1,
    user_id: item.user_id ?? null,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

/******************************************************************************
                            AgentCodeRepository
******************************************************************************/

class AgentCodeRepository {
  async findAll(filters?: { is_used?: boolean }): Promise<IAgentCode[]> {
    try {
      const flags: (0 | 1)[] =
        filters?.is_used === undefined ? [0, 1] : [filters.is_used ? 1 : 0];
      const pages = await Promise.all(
        flags.map((flag) =>
          agentCodes.queryAll({
            index: 'byUsed',
            keyCondition: 'used_flag = :flag',
            values: { ':flag': flag },
          }),
        ),
      );
      return pages.flat().map(toAgentCode);
    } catch (error) {
      return handleRepositoryError('AgentCodeRepository.findAll', error);
    }
  }

  /** Creates each code, or leaves an existing one as it is. */
  async createMany(codes: string[]): Promise<IAgentCode[]> {
    try {
      const now = nowUtc();
      const items = await Promise.all(
        codes.map((agentCode) =>
          agentCodes.update(
            { agent_code: agentCode },
            'SET used_flag = if_not_exists(used_flag, :unused), created_at = if_not_exists(created_at, :now), updated_at = :now',
            { values: { ':unused': 0, ':now': now } },
          ),
        ),
      );
      return items.filter((i): i is IAgentCodeItem => !!i).map(toAgentCode);
    } catch (error) {
      return handleRepositoryError('AgentCodeRepository.createMany', error);
    }
  }

  async findByCode(
    agentCode: string,
    options?: { consistent?: boolean },
  ): Promise<IAgentCode | null> {
    try {
      const item = await agentCodes.get({ agent_code: agentCode }, options);
      return item ? toAgentCode(item) : null;
    } catch (error) {
      return handleRepositoryError('AgentCodeRepository.findByCode', error);
    }
  }

  async findByCodes(codes: string[]): Promise<IAgentCode[]> {
    try {
      const items = await agentCodes.batchGet(
        Array.from(new Set(codes)).map((agent_code) => ({ agent_code })),
      );
      return items.map(toAgentCode);
    } catch (error) {
      return handleRepositoryError('AgentCodeRepository.findByCodes', error);
    }
  }

  /** Renames a code: the old item is deleted and the new one written together. */
  async rename(current: string, next: string): Promise<IAgentCode> {
    try {
      const existing = await agentCodes.get(
        { agent_code: current },
        { consistent: true },
      );
      if (!existing) {
        throw new AgentCodeNotFoundError();
      }

      const renamed: IAgentCodeItem = {
        ...existing,
        agent_code: next,
        updated_at: nowUtc(),
      };
      await dynamoService.transactWrite([
        agentCodes.deleteItem(
          { agent_code: current },
          { condition: 'attribute_exists(agent_code)' },
        ),
        agentCodes.putItem(renamed, {
          condition: 'attribute_not_exists(agent_code)',
        }),
      ]);
      return toAgentCode(renamed);
    } catch (error) {
      if (error instanceof AgentCodeNotFoundError) {
        throw error;
      }
      if (error instanceof DynamoConditionFailedError) {
        throw new AgentCodeConflictError();
      }
      return handleRepositoryError('AgentCodeRepository.rename', error);
    }
  }

  async deleteByCode(agentCode: string): Promise<void> {
    try {
      await agentCodes.delete(
        { agent_code: agentCode },
        { condition: 'attribute_exists(agent_code)' },
      );
    } catch (error) {
      if (error instanceof DynamoConditionFailedError) {
        throw new AgentCodeNotFoundError();
      }
      return handleRepositoryError('AgentCodeRepository.deleteByCode', error);
    }
  }

  /** Marks an unused code as used by the user; fails if it is missing or used. */
  async claim(agentCode: string, userId: string): Promise<void> {
    try {
      await agentCodes.update(
        { agent_code: agentCode },
        'SET used_flag = :used, user_id = :user, updated_at = :now',
        {
          values: {
            ':used': 1,
            ':unused': 0,
            ':user': userId,
            ':now': nowUtc(),
          },
          condition: 'attribute_exists(agent_code) AND used_flag = :unused',
        },
      );
    } catch (error) {
      if (error instanceof DynamoConditionFailedError) {
        throw new AgentCodeInvalidError();
      }
      return handleRepositoryError('AgentCodeRepository.claim', error);
    }
  }

  /** Undoes a claim when a later step of registration fails. */
  async release(agentCode: string): Promise<void> {
    try {
      await agentCodes.update(
        { agent_code: agentCode },
        'SET used_flag = :unused, updated_at = :now REMOVE user_id',
        { values: { ':unused': 0, ':now': nowUtc() } },
      );
    } catch (error) {
      return handleRepositoryError('AgentCodeRepository.release', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const agentCodeRepository = new AgentCodeRepository();
export default agentCodeRepository;
