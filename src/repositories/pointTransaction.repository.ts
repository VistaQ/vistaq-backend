import { randomUUID } from 'crypto';

import { DynamoConditionFailedError } from '@src/models/errors/dynamo.error';
import {
  type IPointTotalsItem,
  LIFETIME_YM,
} from '@src/repositories/pointTotals.repository';
import dynamoService, {
  DynamoTable,
  type ITransactItem,
} from '@src/services/dynamo.service';
import type { PointCategory } from '@src/types/agentPoints.types';
import type { ISalesPointsAward } from '@src/types/salesPoints.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';
import { monthBucketUtc, nowUtc } from '@src/utils/period';

export interface IPointTransaction {
  id: string;
  user_id: string;
  created_at: string;
  activity: string;
  category: PointCategory;
  points: number;
  subject_type: string;
  subject_id: string;
  subject_label: string | null;
}

interface IPointTransactionItem extends Omit<
  IPointTransaction,
  'subject_label'
> {
  created_at_id: string;
  subject_label?: string;
}

interface ISalesAwardItem {
  user_id: string;
  ym_activity: string;
  points: number;
  batch_id: string;
}

const ledger = new DynamoTable<IPointTransactionItem>('PointTransactions');
const pointTotals = new DynamoTable<IPointTotalsItem>('PointTotals');
const salesAwards = new DynamoTable<ISalesAwardItem>('SalesAwards');
const uploadBatches = new DynamoTable<{
  id: string;
  year: number;
  month: number;
}>('UploadBatches');

interface IAwardGuardItem {
  subject_id: string;
  activity: string;
  user_id: string;
  points: number;
  subject_type: string;
}

export interface IAward {
  user_id: string;
  activity: string;
  category: PointCategory;
  points: number;
  subject_type: string;
  subject_id: string;
  subject_label?: string;
}

const awardGuards = new DynamoTable<IAwardGuardItem>('AwardGuards');

const MAX_AWARD_ATTEMPTS = 3;

/******************************************************************************
                        PointTransactionRepository
******************************************************************************/

class PointTransactionRepository {
  /** Newest first; the caller pages by slicing, with the total from PointTotals. */
  async findRecentForUser(
    userId: string,
    count: number,
  ): Promise<IPointTransaction[]> {
    try {
      const items = await ledger.queryAll({
        keyCondition: 'user_id = :user',
        values: { ':user': userId },
        descending: true,
        limit: count,
      });
      return items.map(({ created_at_id: _sortKey, ...item }) => ({
        ...item,
        subject_label: item.subject_label ?? null,
      }));
    } catch (error) {
      return handleRepositoryError(
        'PointTransactionRepository.findRecentForUser',
        error,
      );
    }
  }

  /** Everything already awarded for a subject, read strongly consistent (PT5). */
  async findGuards(subjectId: string): Promise<IAwardGuardItem[]> {
    try {
      return await awardGuards.queryAll({
        keyCondition: 'subject_id = :subject',
        values: { ':subject': subjectId },
        consistent: true,
      });
    } catch (error) {
      return handleRepositoryError(
        'PointTransactionRepository.findGuards',
        error,
      );
    }
  }

  // The guard, ledger row and totals go in one transaction, so a redelivered or
  // concurrent stream record fails the guard and awards nothing (design K10).
  async awardOnce(award: IAward): Promise<boolean> {
    try {
      await dynamoService.transactWrite([
        awardGuards.putItem(
          {
            subject_id: award.subject_id,
            activity: award.activity,
            user_id: award.user_id,
            points: award.points,
            subject_type: award.subject_type,
          },
          { condition: 'attribute_not_exists(subject_id)' },
        ),
        ...this.ledgerItems(award),
      ]);
      return true;
    } catch (error) {
      if (error instanceof DynamoConditionFailedError) return false;
      return handleRepositoryError(
        'PointTransactionRepository.awardOnce',
        error,
      );
    }
  }

  // Totals are bucketed by the month the ledger row is written, as the old
  // leaderboard summed point_transactions by created_at.
  private ledgerItems(
    entry: Omit<IPointTransaction, 'id' | 'created_at' | 'subject_label'> & {
      subject_label?: string;
    },
  ): ITransactItem[] {
    const id = randomUUID();
    const createdAt = nowUtc();
    const ym = monthBucketUtc(createdAt);
    const totals = `ADD points :points, txn_count :one, ${entry.category}_points :points`;
    const values = { ':points': entry.points, ':one': 1 };
    return [
      ledger.putItem(
        {
          ...entry,
          id,
          created_at: createdAt,
          created_at_id: `${createdAt}#${id}`,
        },
        { condition: 'attribute_not_exists(created_at_id)' },
      ),
      pointTotals.updateItem({ user_id: entry.user_id, ym }, totals, {
        values,
      }),
      pointTotals.updateItem(
        { user_id: entry.user_id, ym: LIFETIME_YM },
        totals,
        {
          values,
        },
      ),
    ];
  }

  // Replaces award_sales_points_for_batch. SalesAwards holds the points each
  // user currently has for (month, activity); each pair moves to the new value
  // in one transaction conditioned on the value read, so re-uploads and
  // retries never double-count. Users dropped from the report go to 0.
  async awardWithReversal(params: {
    year: number;
    month: number;
    batchId: string;
    activities: readonly string[];
    awards: ISalesPointsAward[];
  }): Promise<void> {
    try {
      const ym = params.year * 100 + params.month;
      const target = new Map<string, number>();
      for (const award of params.awards) {
        target.set(`${award.user_id}|${award.activity}`, award.points);
      }

      const batches = await uploadBatches.queryAll({
        index: 'byPeriod',
        keyCondition: 'year = :year AND month = :month',
        values: { ':year': params.year, ':month': params.month },
      });
      const priorRows = await Promise.all(
        batches
          .filter((batch) => batch.id !== params.batchId)
          .map((batch) =>
            ledger.queryAll({
              index: 'bySubject',
              keyCondition: 'subject_type = :type AND subject_id = :batch',
              values: { ':type': 'upload_batch', ':batch': batch.id },
            }),
          ),
      );
      const users = new Set([
        ...params.awards.map((award) => award.user_id),
        ...priorRows.flat().map((row) => row.user_id),
      ]);
      const keys = [...users].flatMap((user_id) =>
        params.activities.map((activity) => ({
          user_id,
          ym_activity: `${ym}#${activity}`,
        })),
      );
      const current = new Map(
        (await salesAwards.batchGet(keys)).map((item) => [
          `${item.user_id}|${item.ym_activity.split('#')[1]}`,
          item,
        ]),
      );

      await Promise.all(
        keys.map(({ user_id, ym_activity }) => {
          const activity = ym_activity.split('#')[1];
          const key = `${user_id}|${activity}`;
          return this.moveAward(
            { user_id, ym_activity },
            activity,
            params.batchId,
            target.get(key) ?? 0,
            current.get(key) ?? null,
          );
        }),
      );
    } catch (error) {
      return handleRepositoryError(
        'PointTransactionRepository.awardWithReversal',
        error,
      );
    }
  }

  private async moveAward(
    key: { user_id: string; ym_activity: string },
    activity: string,
    batchId: string,
    points: number,
    existing: ISalesAwardItem | null,
  ): Promise<void> {
    try {
      let previous = existing;
      for (let attempt = 0; attempt < MAX_AWARD_ATTEMPTS; attempt++) {
        if (previous?.batch_id === batchId) return;
        const delta = points - (previous?.points ?? 0);
        if (delta === 0 && (previous || points === 0)) return;

        const guard = previous
          ? salesAwards.putItem(
              { ...key, points, batch_id: batchId },
              {
                condition: 'points = :was AND batch_id = :wasBatch',
                values: {
                  ':was': previous.points,
                  ':wasBatch': previous.batch_id,
                },
              },
            )
          : salesAwards.putItem(
              { ...key, points, batch_id: batchId },
              { condition: 'attribute_not_exists(user_id)' },
            );
        try {
          await dynamoService.transactWrite([
            guard,
            ...(delta === 0
              ? []
              : this.ledgerItems({
                  user_id: key.user_id,
                  activity,
                  category: 'sales',
                  points: delta,
                  subject_type: 'upload_batch',
                  subject_id: batchId,
                })),
          ]);
          return;
        } catch (error) {
          if (!(error instanceof DynamoConditionFailedError)) throw error;
          previous = (await salesAwards.get(key, { consistent: true })) ?? null;
        }
      }
      throw new Error(`sales award for ${key.user_id} kept changing`);
    } catch (error) {
      return handleRepositoryError(
        'PointTransactionRepository.moveAward',
        error,
      );
    }
  }
}

export const pointTransactionRepository = new PointTransactionRepository();
export default pointTransactionRepository;
