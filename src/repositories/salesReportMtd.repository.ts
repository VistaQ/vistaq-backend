import { randomUUID } from 'crypto';

import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';
import { DynamoTable } from '@src/services/dynamo.service';
import type { SalesReportMtdIns } from '@src/types/salesReport.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';
import { nowUtc } from '@src/utils/period';

export interface MtdMonthlyRow {
  user_id: string;
  month: number;
  ace: number;
  noc: number;
}

export interface MtdFycMonthlyRow {
  user_id: string;
  month: number;
  fyc_mtd: number;
  fyct_mtd: number;
}

export interface MtdFycRow extends MtdMonthlyRow, MtdFycMonthlyRow {
  acs: number;
}

interface IMtdItem {
  user_id: string;
  ym: number;
  id: string;
  batch_id: string;
  year: number;
  month: number;
  ace?: number;
  noc?: number;
  acs?: number;
  created_at: string;
  updated_at: string;
}

const METRICS = ['ace', 'noc', 'acs'] as const;

const mtd = new DynamoTable<IMtdItem>('SalesReportMtd');

function toMonthly(item: IMtdItem): MtdMonthlyRow {
  return {
    user_id: item.user_id,
    month: item.month,
    ace: item.ace ?? 0,
    noc: item.noc ?? 0,
  };
}

/******************************************************************************
                          SalesReportMtdRepository
******************************************************************************/

class SalesReportMtdRepository {
  private async findItems(
    year: number,
    userIds?: string[],
    month?: number,
  ): Promise<IMtdItem[]> {
    try {
      if (userIds) {
        const from = year * 100 + (month ?? 1);
        const to = year * 100 + (month ?? 12);
        const pages = await Promise.all(
          Array.from(new Set(userIds)).map((userId) =>
            mtd.queryAll({
              keyCondition: 'user_id = :user AND ym BETWEEN :from AND :to',
              values: { ':user': userId, ':from': from, ':to': to },
            }),
          ),
        );
        return pages.flat();
      }
      return await mtd.queryAll({
        index: 'byPeriod',
        keyCondition: month
          ? 'year = :year AND month = :month'
          : 'year = :year',
        values: month ? { ':year': year, ':month': month } : { ':year': year },
      });
    } catch (error) {
      return handleRepositoryError('SalesReportMtdRepository.findItems', error);
    }
  }

  async bulkUpsert(rows: SalesReportMtdIns[]): Promise<void> {
    try {
      const now = nowUtc();
      await Promise.all(
        rows.map((row) => {
          const metrics = METRICS.filter((m) => row[m] !== undefined);
          return mtd.update(
            { user_id: row.user_id, ym: row.year * 100 + row.month },
            `SET ${[
              ...metrics.map((m) => `${m} = :${m}`),
              'year = :year',
              'month = :month',
              'batch_id = :batch',
              'updated_at = :now',
              'id = if_not_exists(id, :id)',
              'created_at = if_not_exists(created_at, :now)',
            ].join(', ')}`,
            {
              values: {
                ...Object.fromEntries(metrics.map((m) => [`:${m}`, row[m]])),
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
        'SalesReportMtdRepository.bulkUpsert',
        error,
      );
    }
  }

  async findAceNocByYear(
    year: number,
    userIds?: string[],
  ): Promise<MtdMonthlyRow[]> {
    try {
      return (await this.findItems(year, userIds)).map(toMonthly);
    } catch (error) {
      return handleRepositoryError(
        'SalesReportMtdRepository.findAceNocByYear',
        error,
      );
    }
  }

  async findAceNocByYearMonth(
    year: number,
    month: number,
    userIds: string[],
  ): Promise<MtdMonthlyRow[]> {
    try {
      if (userIds.length === 0) return [];
      return (await this.findItems(year, userIds, month)).map(toMonthly);
    } catch (error) {
      return handleRepositoryError(
        'SalesReportMtdRepository.findAceNocByYearMonth',
        error,
      );
    }
  }

  // Replaces the `sales_report_mtd_fyc` view: each MTD row joined to the YTD
  // row of the same month, with FYC and FYCT minus the user's previous joined
  // month (LAG over joined rows, default 0).
  async findFycRowsByYear(
    year: number,
    userIds?: string[],
  ): Promise<MtdFycRow[]> {
    try {
      const [mtdItems, ytdRows] = await Promise.all([
        this.findItems(year, userIds),
        salesReportYtdRepository.findByYear(year),
      ]);
      const ytdByKey = new Map(
        ytdRows.map((row) => [`${row.user_id}#${row.month}`, row]),
      );

      const joined = mtdItems
        .filter((item) => ytdByKey.has(`${item.user_id}#${item.month}`))
        .sort(
          (a, b) => a.user_id.localeCompare(b.user_id) || a.month - b.month,
        );

      const rows: MtdFycRow[] = [];
      let previous: { user_id: string; fyc: number; fyct: number } | null =
        null;
      for (const item of joined) {
        const y = ytdByKey.get(`${item.user_id}#${item.month}`)!;
        const prior = previous?.user_id === item.user_id ? previous : null;
        rows.push({
          ...toMonthly(item),
          acs: item.acs ?? 0,
          fyc_mtd: y.fyc - (prior?.fyc ?? 0),
          fyct_mtd: y.fyct - (prior?.fyct ?? 0),
        });
        previous = { user_id: item.user_id, fyc: y.fyc, fyct: y.fyct };
      }
      return rows;
    } catch (error) {
      return handleRepositoryError(
        'SalesReportMtdRepository.findFycRowsByYear',
        error,
      );
    }
  }

  async findFycByYear(
    year: number,
    userIds?: string[],
  ): Promise<MtdFycMonthlyRow[]> {
    try {
      const rows = await this.findFycRowsByYear(year, userIds);
      return rows.map(({ user_id, month, fyc_mtd, fyct_mtd }) => ({
        user_id,
        month,
        fyc_mtd,
        fyct_mtd,
      }));
    } catch (error) {
      return handleRepositoryError(
        'SalesReportMtdRepository.findFycByYear',
        error,
      );
    }
  }
}

export const salesReportMtdRepository = new SalesReportMtdRepository();
export default salesReportMtdRepository;
