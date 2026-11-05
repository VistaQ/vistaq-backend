import {
  AgentCodeConflictError,
  AgentCodeInUseError,
  AgentCodeNotFoundError,
} from '@src/models/errors/agentCode.errors';
import agentCodeRepository from '@src/repositories/agentCode.repository';
import type { IAgentCode } from '@src/types/agentCode';
import { handleServiceError } from '@src/utils/errorHandlers';
import { getRootCause } from '@src/utils/errors';

/******************************************************************************
                            Interfaces
******************************************************************************/

interface ICreateManyParams {
  agentCodes: string[];
}

interface IListParams {
  isUsed?: boolean;
}

interface IUpdateParams {
  currentAgentCode: string;
  newAgentCode: string;
}

interface IDeleteParams {
  agentCode: string;
}

/******************************************************************************
                            AgentCodeService
******************************************************************************/

class AgentCodeService {
  async createMany(params: ICreateManyParams): Promise<IAgentCode[]> {
    try {
      const distinct = Array.from(new Set(params.agentCodes));
      return await agentCodeRepository.createMany(distinct);
    } catch (error) {
      return handleServiceError('AgentCodeService.createMany', error);
    }
  }

  async list(params: IListParams): Promise<IAgentCode[]> {
    try {
      const filters: { is_used?: boolean } = {};
      if (params.isUsed !== undefined) {
        filters.is_used = params.isUsed;
      }
      return await agentCodeRepository.findAll(
        Object.keys(filters).length > 0 ? filters : undefined,
      );
    } catch (error) {
      return handleServiceError('AgentCodeService.list', error);
    }
  }

  async update(params: IUpdateParams): Promise<IAgentCode> {
    try {
      return await agentCodeRepository.rename(
        params.currentAgentCode,
        params.newAgentCode,
      );
    } catch (error) {
      const rootCause = getRootCause(error);
      if (
        rootCause instanceof AgentCodeNotFoundError ||
        rootCause instanceof AgentCodeConflictError
      ) {
        throw rootCause;
      }
      return handleServiceError('AgentCodeService.update', error);
    }
  }

  async remove(params: IDeleteParams): Promise<void> {
    try {
      const existing = await agentCodeRepository.findByCode(params.agentCode, {
        consistent: true,
      });
      if (!existing) throw new AgentCodeNotFoundError();
      if (existing.is_used) throw new AgentCodeInUseError();
      await agentCodeRepository.deleteByCode(params.agentCode);
    } catch (error) {
      const rootCause = getRootCause(error);
      if (
        rootCause instanceof AgentCodeNotFoundError ||
        rootCause instanceof AgentCodeInUseError
      ) {
        throw rootCause;
      }
      return handleServiceError('AgentCodeService.remove', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const agentCodeService = new AgentCodeService();
export default agentCodeService;
