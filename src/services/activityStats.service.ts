import prospectRepository from '@src/repositories/prospect.repository';
import userStatsRepository from '@src/repositories/userStats.repository';
import sqsService, { type IFifoMessage } from '@src/services/sqs.service';
import type { IProspect } from '@src/types/auth.types';
import type { IStreamChange } from '@src/types/stream.types';
import type { IUserStats } from '@src/types/userStats.types';
import EnvVars from '@src/utils/env';
import { handleServiceError } from '@src/utils/errorHandlers';
import { monthBucketUtc } from '@src/utils/period';

type ICounter = Exclude<keyof IUserStats, 'user_id' | 'ym'>;

const SET_STATUSES = ['scheduled', 'rescheduled', 'done'];

function bucketOf(instant: string | null | undefined): number | null {
  if (!instant) return null;
  const time = Date.parse(instant);
  return Number.isNaN(time) ? null : monthBucketUtc(new Date(time));
}

/** The month buckets of the access-pattern doc's counter rules, for one agent's prospects. */
export function computeBuckets(
  userId: string,
  prospects: IProspect[],
): IUserStats[] {
  const buckets = new Map<number, IUserStats>();
  const add = (ym: number | null, counter: ICounter, amount: number) => {
    if (ym === null) return;
    let bucket = buckets.get(ym);
    if (!bucket) {
      bucket = {
        user_id: userId,
        ym,
        prospects: 0,
        appointments_set: 0,
        appt_done: 0,
        stage_sales: 0,
        sales_noc: 0,
        sales_ace: 0,
      };
      buckets.set(ym, bucket);
    }
    bucket[counter] += amount;
  };

  for (const prospect of prospects) {
    add(bucketOf(prospect.created_at), 'prospects', 1);
    if (SET_STATUSES.includes(prospect.appointment_status ?? '')) {
      add(bucketOf(prospect.appointment_date), 'appointments_set', 1);
    }
    const meetingMonth = bucketOf(
      prospect.appointment_completed_at ?? prospect.updated_at,
    );
    if (prospect.appointment_status === 'done')
      add(meetingMonth, 'appt_done', 1);
    if (prospect.current_stage === 'sales') add(meetingMonth, 'stage_sales', 1);
    if (prospect.sales_outcome === 'successful') {
      const saleMonth = bucketOf(
        prospect.sales_completed_at ?? prospect.updated_at,
      );
      const ace = (prospect.products_sold ?? []).reduce(
        (sum, product) => sum + Number(product.amount ?? 0),
        0,
      );
      add(saleMonth, 'sales_noc', 1);
      add(saleMonth, 'sales_ace', ace);
    }
  }
  return Array.from(buckets.values());
}

/******************************************************************************
                          ActivityStatsService
******************************************************************************/

export interface IRecomputeMessage {
  agent_id: string;
  prospect_ids: string[];
}

class ActivityStatsService {
  /** One FIFO message per agent a change touches, grouped by agent so recomputes run in order. */
  async enqueue(
    changes: { eventId: string; change: IStreamChange }[],
  ): Promise<void> {
    try {
      const messages: IFifoMessage[] = [];
      changes.forEach(({ eventId, change }, index) => {
        const images = [change.oldImage, change.newImage].filter(
          (image) => !!image,
        );
        const agents = new Set(
          images
            .map((image) => image.agent_id)
            .filter((id): id is string => typeof id === 'string'),
        );
        const prospectId = images
          .map((image) => image.id)
          .find((id): id is string => typeof id === 'string');
        for (const agentId of agents) {
          const body: IRecomputeMessage = {
            agent_id: agentId,
            prospect_ids: prospectId ? [prospectId] : [],
          };
          messages.push({
            id: `${index}-${messages.length}`,
            groupId: agentId,
            deduplicationId: `${eventId}:${agentId}`,
            body,
          });
        }
      });
      if (messages.length) {
        await sqsService.sendFifo(EnvVars.StatsQueueUrl, messages);
      }
    } catch (error) {
      return handleServiceError('ActivityStatsService.enqueue', error);
    }
  }

  // Recomputing from source (not incrementing) makes redelivery harmless and
  // handles a date leaving a month. The changed prospects are re-read from the
  // base table because the byAgent index may not show them yet.
  async recompute(
    agentId: string,
    changedProspectIds: string[],
  ): Promise<void> {
    try {
      const [indexed, fresh, existing] = await Promise.all([
        prospectRepository.findByAgentIds([agentId]),
        Promise.all(
          Array.from(new Set(changedProspectIds)).map(async (id) => ({
            id,
            prospect: await prospectRepository.findById(id, {
              consistent: true,
            }),
          })),
        ),
        userStatsRepository.findSince([agentId], 1),
      ]);

      const byId = new Map(indexed.map((prospect) => [prospect.id, prospect]));
      for (const { id, prospect } of fresh) {
        if (prospect && prospect.agent_id === agentId) byId.set(id, prospect);
        else byId.delete(id);
      }

      const buckets = computeBuckets(agentId, Array.from(byId.values()));
      const live = new Set(buckets.map((bucket) => bucket.ym));
      const stale = existing.map((row) => row.ym).filter((ym) => !live.has(ym));
      await userStatsRepository.replaceForUser(agentId, buckets, stale);
    } catch (error) {
      return handleServiceError('ActivityStatsService.recompute', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const activityStatsService = new ActivityStatsService();
export default activityStatsService;
