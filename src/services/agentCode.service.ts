import agentCodeRepository from '@src/repositories/agentCode.repository';
import { AgentCodeConflictError, AgentCodeNotFoundError } from '@src/models/errors/agentCode.errors';
import { IAgentCode } from '@src/types/agentCode';
import { handleServiceError } from '@src/utils/errorHandlers';
import { getRootCause } from '@src/utils/sentry.utils';

/******************************************************************************
                            Interfaces
******************************************************************************/

interface ICreateManyParams {
  agentCodes: string[];
  tenantId: string;
  token: string;
}

interface IListParams {
  isUsed?: boolean;
  token: string;
}

interface IUpdateParams {
  currentAgentCode: string;
  newAgentCode: string;
  tenantId: string;
  token: string;
}

/******************************************************************************
                            AgentCodeService
******************************************************************************/

class AgentCodeService {
  async createMany(params: ICreateManyParams): Promise<IAgentCode[]> {
    try {
      const distinct = Array.from(new Set(params.agentCodes));
      const rows = distinct.map((agent_code) => ({
        tenant_id: params.tenantId,
        agent_code,
      }));

      const result = await agentCodeRepository.upsertMany(rows, params.token);
      return result;
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
        params.token,
        Object.keys(filters).length > 0 ? filters : undefined,
      );
    } catch (error) {
      return handleServiceError('AgentCodeService.list', error);
    }
  }

  async update(params: IUpdateParams): Promise<IAgentCode> {
    try {
      return await agentCodeRepository.update(
        params.token,
        { tenant_id: params.tenantId, agent_code: params.currentAgentCode },
        {
          agent_code: params.newAgentCode,
          updated_at: new Date().toISOString(),
        },
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
}

/******************************************************************************
                                Export
******************************************************************************/

export const agentCodeService = new AgentCodeService();
export default agentCodeService;
