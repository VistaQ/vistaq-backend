import { randomUUID } from 'crypto';

import { DynamoTable } from '@src/services/dynamo.service';
import type { SalesReportYtdIns } from '@src/types/salesReport.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';
import { nowUtc } from '@src/utils/period';

export interface YtdRollupRow {
  id: string;
  user_id: string;
  year: number;
  month: number;
  ace: number;
  noc: number;
  acs: number;
  fyct: number;
  fyct_pct: number;
  mdrt_shortage_fyct: number;
  fyc: number;
  fyc_pct: number;
  mdrt_shortage_fyc: number;
  created_at: string;
  updated_at: string;
}

type IYtdItem = YtdRollupRow & { ym: number; batch_id: string };

const METRICS = [
  'ace',
  'noc',
  'acs',
  'fyc',
  'fyc_pct',
  'fyct',
  'fyct_pct',
  'mdrt_shortage_fyc',
  'mdrt_shortage_fyct',
] as const;

const ytd = new DynamoTable<IYtdItem>('SalesReportYtd');

function toRow(item: IYtdItem): YtdRollupRow {
  const row = { ...item } as Partial<IYtdItem>;
  delete row.ym;
  delete row.batch_id;
  for (const metric of METRICS) row[metric] ??= 0;
  return row as YtdRollupRow;
}

function latestPerUser(rows: YtdRollupRow[]): YtdRollupRow[] {
  const latest = new Map<string, YtdRollupRow>();
  for (const row of rows) {
    const existing = latest.get(row.user_id);
    if (!existing || row.month > existing.month) latest.set(row.user_id, row);
  }
  return Array.from(latest.values());
}

/******************************************************************************
                          SalesReportYtdRepository
******************************************************************************/

class SalesReportYtdRepository {
  async bulkUpsert(rows: SalesReportYtdIns[]): Promise<void> {
    try {
      const now = nowUtc();
      await Promise.all(
        rows.map((row) => {
          const metrics = Object.fromEntries(
            METRICS.filter((m) => row[m] !== undefined).map((m) => [m, row[m]]),
          );
          const sets = Object.keys(metrics).map((m) => `${m} = :${m}`);
          return ytd.update(
            { user_id: row.user_id, ym: row.year * 100 + row.month },
            `SET ${[
              ...sets,
              'year = :year',
              'month = :month',
              'batch_id = :batch',
              'updated_at = :now',
              'id = if_not_exists(id, :id)',
              'created_at = if_not_exists(created_at, :now)',
            ].join(', ')}`,
            {
              values: {
                ...Object.fromEntries(
                  Object.entries(metrics).map(([m, v]) => [`:${m}`, v]),
                ),
                ':year': row.year,
                ':month': row.month,
                ':batch': row.batch_id,
                ':now': now,
                ':id': randomUUID(),
              },
            },
          );
        }),
      );
    } catch (error) {
      return handleRepositoryError(
        'SalesReportYtdRepository.bulkUpsert',
        error,
      );
    }
  }

  async findByYear(year: number): Promise<YtdRollupRow[]> {
    try {
      const items = await ytd.queryAll({
        index: 'byPeriod',
        keyCondition: 'year = :year',
        values: { ':year': year },
      });
      return items.map(toRow);
    } catch (error) {
      return handleRepositoryError(
        'SalesReportYtdRepository.findByYear',
        error,
      );
    }
  }

  async findLatestUploadedMonth(year: number): Promise<number | null> {
    try {
      const page = await ytd.query({
        index: 'byPeriod',
        keyCondition: 'year = :year',
        values: { ':year': year },
        descending: true,
        limit: 1,
      });
      return page.items[0]?.month ?? null;
    } catch (error) {
      return handleRepositoryError(
        'SalesReportYtdRepository.findLatestUploadedMonth',
        error,
      );
    }
  }

  async findLatestYtdPerUserByYear(year: number): Promise<YtdRollupRow[]> {
    try {
      return latestPerUser(await this.findByYear(year));
    } catch (error) {
      return handleRepositoryError(
        'SalesReportYtdRepository.findLatestYtdPerUserByYear',
        error,
      );
    }
  }

  async findFyctByYearMonths(
    year: number,
    months: number[],
    userIds: string[],
  ): Promise<{ user_id: string; month: number; fyct: number }[]> {
    try {
      const keys = userIds.flatMap((user_id) =>
        months.map((month) => ({ user_id, ym: year * 100 + month })),
      );
      const items = await ytd.batchGet(keys);
      return items.map((item) => ({
        user_id: item.user_id,
        month: item.month,
        fyct: item.fyct ?? 0,
      }));
    } catch (error) {
      return handleRepositoryError(
        'SalesReportYtdRepository.findFyctByYearMonths',
        error,
      );
    }
  }

  async findLatestYtdForUserYear(
    userId: string,
    year: number,
  ): Promise<YtdRollupRow | null> {
    try {
      const page = await ytd.query({
        keyCondition: 'user_id = :user AND ym BETWEEN :from AND :to',
        values: {
          ':user': userId,
          ':from': year * 100 + 1,
          ':to': year * 100 + 12,
        },
        descending: true,
        limit: 1,
      });
      return page.items[0] ? toRow(page.items[0]) : null;
    } catch (error) {
      return handleRepositoryError(
        'SalesReportYtdRepository.findLatestYtdForUserYear',
        error,
      );
    }
  }
}

export const salesReportYtdRepository = new SalesReportYtdRepository();
export default salesReportYtdRepository;
