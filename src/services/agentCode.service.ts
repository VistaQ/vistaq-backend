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
}

/******************************************************************************
                                Export
******************************************************************************/

export const agentCodeService = new AgentCodeService();
export default agentCodeService;
