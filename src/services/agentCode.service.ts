import agentCodeRepository from '@src/repositories/agentCode.repository';
import { IAgentCode } from '@src/types/agentCode';
import { handleServiceError } from '@src/utils/errorHandlers';

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
}

/******************************************************************************
                                Export
******************************************************************************/

export const agentCodeService = new AgentCodeService();
export default agentCodeService;
