import {
  InvalidPageTokenError,
  ProspectNotFoundError,
} from '@src/models/errors/prospect.errors';
import prospectRepository, {
  type IProspectCursor,
  type IProspectUpdate,
  PROSPECT_STAGES,
} from '@src/repositories/prospect.repository';
import scopeService from '@src/services/scope.service';
import type { ICaller, IProspect } from '@src/types/auth.types';
import { handleServiceError } from '@src/utils/errorHandlers';
import { decodePageToken, encodePageToken } from '@src/utils/pageToken';
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

export interface IListProspectsOptions {
  limit: number;
  nextToken?: string;
  stage?: string;
}

export interface IProspectPage {
  prospects: IProspect[];
  nextToken?: string;
}

// A token is only ever produced by findPage, so anything else is rejected
// before it can reach DynamoDB as an arbitrary ExclusiveStartKey.
function toCursor(value: unknown, stages: readonly string[]): IProspectCursor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidPageTokenError();
  }
  const cursor: IProspectCursor = {};
  for (const [stage, entry] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!stages.includes(stage) || !entry || typeof entry !== 'object') {
      throw new InvalidPageTokenError();
    }
    const { done, lastKey } = entry as { done?: unknown; lastKey?: unknown };
    if (done === true && lastKey === undefined) {
      cursor[stage] = { done: true };
      continue;
    }
    const key = lastKey as Record<string, unknown> | undefined;
    if (
      done !== undefined ||
      !key ||
      Object.keys(key).length !== 3 ||
      typeof key.id !== 'string' ||
      key.current_stage !== stage ||
      typeof key.updated_at !== 'string'
    ) {
      throw new InvalidPageTokenError();
    }
    cursor[stage] = {
      lastKey: { id: key.id, current_stage: stage, updated_at: key.updated_at },
    };
  }
  return cursor;
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

  // Admins and master trainers see every prospect, so only their list is
  // paged; other roles get their whole (group-sized) scope in one response.
  async getProspects(
    caller: ICaller,
    options: IListProspectsOptions,
  ): Promise<IProspectPage> {
    try {
      const agentIds = await scopeService.resolveAgentScope(caller);
      if (agentIds) {
        const prospects = await prospectRepository.findByAgentIds(agentIds);
        return {
          prospects: options.stage
            ? prospects.filter((p) => p.current_stage === options.stage)
            : prospects,
        };
      }

      const stages = options.stage ? [options.stage] : PROSPECT_STAGES;
      const cursor = options.nextToken
        ? toCursor(decodePageToken(options.nextToken), stages)
        : {};
      const page = await prospectRepository.findPage(
        stages,
        options.limit,
        cursor,
      );
      return {
        prospects: page.items,
        ...(page.cursor && { nextToken: encodePageToken(page.cursor) }),
      };
    } catch (error) {
      if (error instanceof InvalidPageTokenError) throw error;
      return handleServiceError('ProspectService.getProspects', error);
    }
  }

  async getProspectById(
    prospectId: string,
    caller: ICaller,
  ): Promise<IProspect | null> {
    try {
      const prospect = await prospectRepository.findById(prospectId);
      if (
        !prospect ||
        !(await scopeService.canReadAgent(caller, prospect.agent_id))
      ) {
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

      return await prospectRepository.updateProspect(
        params.prospectId,
        updateData,
      );
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
