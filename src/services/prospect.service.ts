import { ProspectNotFoundError } from '@src/models/errors/prospect.errors';
import prospectRepository, {
  type IProspectUpdate,
} from '@src/repositories/prospect.repository';
import scopeService from '@src/services/scope.service';
import type { ICaller, IProspect } from '@src/types/auth.types';
import { handleServiceError } from '@src/utils/errorHandlers';
import { nowUtc } from '@src/utils/period';

/******************************************************************************
                            Interfaces
******************************************************************************/

interface ICreateProspectParams {
  prospectName: string;
  prospectPhone?: string;
  prospectEmail?: string;
  agentId: string;
}

interface IUpdateProspectParams {
  prospectId: string;
  caller: ICaller;
  data: {
    fullName?: string;
    phoneNum?: string;
    email?: string;
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
      return await prospectRepository.insertProspect({
        prospect_name: params.prospectName,
        prospect_phone: params.prospectPhone ?? null,
        prospect_email: params.prospectEmail ?? null,
        agent_id: params.agentId,
      });
    } catch (error) {
      return handleServiceError('ProspectService.createProspect', error);
    }
  }

  async getProspects(caller: ICaller): Promise<IProspect[]> {
    try {
      const agentIds = await scopeService.resolveAgentScope(caller);
      return agentIds
        ? await prospectRepository.findByAgentIds(agentIds)
        : await prospectRepository.findAll();
    } catch (error) {
      return handleServiceError('ProspectService.getProspects', error);
    }
  }

  async getProspectById(
    prospectId: string,
    caller: ICaller,
  ): Promise<IProspect | null> {
    try {
      const prospect = await prospectRepository.findById(prospectId);
      if (!prospect || !(await scopeService.canReadAgent(caller, prospect.agent_id))) {
        return null;
      }
      return prospect;
    } catch (error) {
      return handleServiceError('ProspectService.getProspectById', error);
    }
  }

  async deleteProspect(prospectId: string, caller: ICaller): Promise<void> {
    try {
      const existing = await prospectRepository.findById(prospectId, {
        consistent: true,
      });
      if (!existing) {
        throw new ProspectNotFoundError();
      }
      if (caller.role !== 'admin' && existing.agent_id !== caller.id) {
        throw new ProspectNotFoundError();
      }
      await prospectRepository.deleteProspect(prospectId);
    } catch (error) {
      if (error instanceof ProspectNotFoundError) throw error;
      return handleServiceError('ProspectService.deleteProspect', error);
    }
  }

  async updateProspect(params: IUpdateProspectParams): Promise<IProspect> {
    try {
      const existing = await prospectRepository.findById(params.prospectId, {
        consistent: true,
      });
      if (!existing || existing.agent_id !== params.caller.id) {
        throw new ProspectNotFoundError();
      }

      const { data } = params;
      const updateData: IProspectUpdate = {};

      if (data.fullName !== undefined) updateData.prospect_name = data.fullName;
      if (data.phoneNum !== undefined)
        updateData.prospect_phone = data.phoneNum;
      if (data.email !== undefined) updateData.prospect_email = data.email;

      if (data.currentStage !== undefined) {
        updateData.current_stage = data.currentStage;

        if (data.currentStage !== existing.current_stage) {
          updateData.stage_history = [
            ...existing.stage_history,
            { stage: data.currentStage, enteredAt: nowUtc() },
          ];
        }
      }

      if (data.appointmentDate !== undefined)
        updateData.appointment_date = data.appointmentDate;
      if (data.appointmentStartTime !== undefined)
        updateData.appointment_start_time = data.appointmentStartTime;
      if (data.appointmentEndTime !== undefined)
        updateData.appointment_end_time = data.appointmentEndTime;
      if (data.appointmentLocation !== undefined)
        updateData.appointment_location = data.appointmentLocation;
      if (data.appointmentStatus !== undefined) {
        updateData.appointment_status = data.appointmentStatus;
        if (data.appointmentStatus === 'done') {
          updateData.appointment_completed_at = nowUtc();
        }
      }
      if (data.salesMeetingStages !== undefined)
        updateData.sales_parts_completed = data.salesMeetingStages;
      if (data.products !== undefined) updateData.products_sold = data.products;
      if (data.salesOutcome !== undefined) {
        updateData.sales_outcome = data.salesOutcome;
        if (data.salesOutcome === 'successful') {
          updateData.sales_completed_at = nowUtc();
        }
      }
      if (data.unsuccessfulReason !== undefined)
        updateData.unsuccessful_reason = data.unsuccessfulReason;

      return await prospectRepository.updateProspect(params.prospectId, updateData);
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
