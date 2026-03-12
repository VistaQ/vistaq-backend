import prospectRepository from '@src/repositories/prospect.repository';
import loggingService from '@src/services/logging.service';
import { ProspectNotFoundError } from '@src/models/errors/prospect.errors';
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
  token: string;
}

interface IUpdateProspectParams {
  prospectId: string;
  token: string;
  data: {
    currentStage?: string;
    appointmentDate?: string;
    appointmentStartTime?: string;
    appointmentEndTime?: string;
    appointmentLocation?: string;
    appointmentStatus?: string;
    salesMeetingStages?: string[];
    products?: { productName: string; amount: number }[];
    salesOutcome?: string;
    unsuccessfulReason?: string;
  };
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

  async updateProspect(params: IUpdateProspectParams): Promise<IProspect> {
    try {
      loggingService.info('ProspectService.updateProspect called', {
        prospectId: params.prospectId,
      });

      const existing = await prospectRepository.findById(params.prospectId, params.token);
      if (!existing) {
        throw new ProspectNotFoundError();
      }

      const { data } = params;
      const updateData: Record<string, unknown> = {};

      if (data.currentStage !== undefined) {
        updateData.current_stage = data.currentStage;

        if (data.currentStage !== existing.current_stage) {
          const history = (existing.stage_history as { stage: string; enteredAt: string }[]) ?? [];
          updateData.stage_history = [
            ...history,
            { stage: data.currentStage, enteredAt: new Date().toISOString() },
          ];
        }
      }

      if (data.appointmentDate !== undefined) updateData.appointment_date = data.appointmentDate;
      if (data.appointmentStartTime !== undefined) updateData.appointment_start_time = data.appointmentStartTime;
      if (data.appointmentEndTime !== undefined) updateData.appointment_end_time = data.appointmentEndTime;
      if (data.appointmentLocation !== undefined) updateData.appointment_location = data.appointmentLocation;
      if (data.appointmentStatus !== undefined) updateData.appointment_status = data.appointmentStatus;
      if (data.salesMeetingStages !== undefined) updateData.sales_parts_completed = data.salesMeetingStages;
      if (data.products !== undefined) updateData.products_sold = data.products;
      if (data.salesOutcome !== undefined) updateData.sales_outcome = data.salesOutcome;
      if (data.unsuccessfulReason !== undefined) updateData.unsuccessful_reason = data.unsuccessfulReason;

      updateData.updated_at = new Date().toISOString();

      const updatedProspect = await prospectRepository.updateProspect(
        params.prospectId,
        updateData,
        params.token,
      );

      if (!updatedProspect) {
        throw new ProspectNotFoundError();
      }

      return updatedProspect;
    } catch (error) {
      if (error instanceof ProspectNotFoundError) throw error;
      return handleServiceError('ProspectService.updateProspect', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const prospectService = new ProspectService();
export default prospectService;
