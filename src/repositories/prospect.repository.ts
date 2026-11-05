import { randomUUID } from 'crypto';

import { TRANSITIONAL_TENANT_ID } from '@src/constants/tenant';
import { DynamoConditionFailedError } from '@src/models/errors/dynamo.error';
import { ProspectNotFoundError } from '@src/models/errors/prospect.errors';
import { DynamoTable } from '@src/services/dynamo.service';
import type {
  IProductSold,
  IProspect,
  IStageEntry,
} from '@src/types/auth.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';
import { nowUtc } from '@src/utils/period';

/******************************************************************************
                            Item and input types
******************************************************************************/

interface IProspectItem {
  id: string;
  agent_id: string;
  prospect_name: string;
  prospect_email?: string;
  prospect_phone?: string;
  current_stage: string;
  prospect_entered_at: string;
  stage_history: IStageEntry[];
  appointment_date?: string;
  appointment_start_time?: string;
  appointment_end_time?: string;
  appointment_location?: string;
  appointment_status?: string;
  appointment_completed_at?: string;
  sales_parts_completed: string[];
  products_sold: IProductSold[];
  sales_outcome?: string;
  unsuccessful_reason?: string;
  sales_completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface INewProspect {
  agent_id: string;
  prospect_name: string;
  prospect_email?: string | null;
  prospect_phone?: string | null;
}

export interface IProspectUpdate {
  prospect_name?: string;
  prospect_email?: string | null;
  prospect_phone?: string | null;
  current_stage?: string;
  stage_history?: IStageEntry[];
  appointment_date?: string | null;
  appointment_start_time?: string | null;
  appointment_end_time?: string | null;
  appointment_location?: string | null;
  appointment_status?: string | null;
  appointment_completed_at?: string | null;
  sales_parts_completed?: string[];
  products_sold?: IProductSold[];
  sales_outcome?: string | null;
  unsuccessful_reason?: string | null;
  sales_completed_at?: string | null;
}

const prospects = new DynamoTable<IProspectItem>('Prospects');

const STAGES = ['prospect', 'appointment', 'sales'] as const;

function toProspect(item: IProspectItem): IProspect {
  return {
    id: item.id,
    tenant_id: TRANSITIONAL_TENANT_ID,
    agent_id: item.agent_id,
    prospect_name: item.prospect_name,
    prospect_email: item.prospect_email ?? null,
    prospect_phone: item.prospect_phone ?? null,
    current_stage: item.current_stage,
    prospect_entered_at: item.prospect_entered_at,
    stage_history: item.stage_history ?? [],
    appointment_date: item.appointment_date ?? null,
    appointment_start_time: item.appointment_start_time ?? null,
    appointment_end_time: item.appointment_end_time ?? null,
    appointment_location: item.appointment_location ?? null,
    appointment_status: item.appointment_status ?? null,
    appointment_completed_at: item.appointment_completed_at ?? null,
    sales_parts_completed: item.sales_parts_completed ?? [],
    products_sold: item.products_sold ?? [],
    sales_outcome: item.sales_outcome ?? null,
    unsuccessful_reason: item.unsuccessful_reason ?? null,
    sales_completed_at: item.sales_completed_at ?? null,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

/******************************************************************************
                            ProspectRepository
******************************************************************************/

class ProspectRepository {
  async insertProspect(prospect: INewProspect): Promise<IProspect> {
    try {
      const now = nowUtc();
      const item: IProspectItem = {
        id: randomUUID(),
        agent_id: prospect.agent_id,
        prospect_name: prospect.prospect_name,
        ...(prospect.prospect_email && {
          prospect_email: prospect.prospect_email,
        }),
        ...(prospect.prospect_phone && {
          prospect_phone: prospect.prospect_phone,
        }),
        current_stage: 'prospect',
        prospect_entered_at: now,
        stage_history: [],
        sales_parts_completed: [],
        products_sold: [],
        created_at: now,
        updated_at: now,
      };
      await prospects.put(
        { ...item },
        {
          condition: 'attribute_not_exists(id)',
        },
      );
      return toProspect(item);
    } catch (error) {
      return handleRepositoryError('ProspectRepository.insertProspect', error);
    }
  }

  async findById(
    prospectId: string,
    options?: { consistent?: boolean },
  ): Promise<IProspect | null> {
    try {
      const item = await prospects.get({ id: prospectId }, options);
      return item ? toProspect(item) : null;
    } catch (error) {
      return handleRepositoryError('ProspectRepository.findById', error);
    }
  }

  async findByAgentIds(agentIds: string[]): Promise<IProspect[]> {
    try {
      const pages = await Promise.all(
        Array.from(new Set(agentIds)).map((agentId) =>
          prospects.queryAll({
            index: 'byAgent',
            keyCondition: 'agent_id = :agent',
            values: { ':agent': agentId },
          }),
        ),
      );
      return pages.flat().map(toProspect);
    } catch (error) {
      return handleRepositoryError('ProspectRepository.findByAgentIds', error);
    }
  }

  async findAll(): Promise<IProspect[]> {
    try {
      const pages = await Promise.all(
        STAGES.map((stage) =>
          prospects.queryAll({
            index: 'byStage',
            keyCondition: 'current_stage = :stage',
            values: { ':stage': stage },
            descending: true,
          }),
        ),
      );
      return pages
        .flat()
        .map(toProspect)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    } catch (error) {
      return handleRepositoryError('ProspectRepository.findAll', error);
    }
  }

  async updateProspect(
    prospectId: string,
    data: IProspectUpdate,
  ): Promise<IProspect> {
    try {
      const updated = await prospects.updateFields({ id: prospectId }, data, {
        condition: 'attribute_exists(id)',
      });
      if (!updated) {
        throw new ProspectNotFoundError();
      }
      return toProspect(updated);
    } catch (error) {
      if (
        error instanceof ProspectNotFoundError ||
        error instanceof DynamoConditionFailedError
      ) {
        throw new ProspectNotFoundError();
      }
      return handleRepositoryError('ProspectRepository.updateProspect', error);
    }
  }

  async deleteProspect(prospectId: string): Promise<void> {
    try {
      await prospects.delete({ id: prospectId });
    } catch (error) {
      return handleRepositoryError('ProspectRepository.deleteProspect', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const prospectRepository = new ProspectRepository();
export default prospectRepository;
