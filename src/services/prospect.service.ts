import prospectRepository from '@src/repositories/prospect.repository';
import loggingService from '@src/services/logging.service';
import { IProspect } from '@src/types/auth.types';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                            Interfaces
******************************************************************************/

interface ICreateProspectParams {
  prospectName: string;
  prospectPhone?: string;
  prospectEmail?: string;
  agentId: string;
  tenantId: string;
  groupId: string | null;
  token: string;
}

/******************************************************************************
                            ProspectService
******************************************************************************/

class ProspectService {
  async createProspect(params: ICreateProspectParams): Promise<IProspect> {
    try {
      loggingService.info('ProspectService.createProspect called', {
        prospectName: params.prospectName,
      });

      const prospect = await prospectRepository.insertProspect(
        {
          prospect_name: params.prospectName,
          prospect_phone: params.prospectPhone ?? null,
          prospect_email: params.prospectEmail ?? null,
          agent_id: params.agentId,
          tenant_id: params.tenantId,
          group_id: params.groupId,
          current_stage: 'prospect',
        },
        params.token,
      );

      return prospect;
    } catch (error) {
      return handleServiceError('ProspectService.createProspect', error);
    }
  }

  async getProspects(token: string): Promise<IProspect[]> {
    try {
      loggingService.info('ProspectService.getProspects called');

      const prospects = await prospectRepository.findAll(token);
      return prospects;
    } catch (error) {
      return handleServiceError('ProspectService.getProspects', error);
    }
  }

  async getProspectById(prospectId: string, token: string): Promise<IProspect | null> {
    try {
      loggingService.info('ProspectService.getProspectById called', { prospectId });

      const prospect = await prospectRepository.findById(prospectId, token);
      return prospect;
    } catch (error) {
      return handleServiceError('ProspectService.getProspectById', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const prospectService = new ProspectService();
export default prospectService;
