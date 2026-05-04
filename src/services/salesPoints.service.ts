import * as Sentry from '@sentry/node';

import pointConfigRepository from '@src/repositories/pointConfig.repository';
import pointTransactionRepository from '@src/repositories/pointTransaction.repository';
import salesReportMtdRepository from '@src/repositories/salesReportMtd.repository';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';
import loggingService from '@src/services/logging.service';
import { IUploadBatch } from '@src/types/salesReport.types';
import {
  ISalesPointsAward,
  ISalesPointsRates,
  SALES_POINTS_ACTIVITIES,
} from '@src/types/salesPoints.types';

/**
 * Resolution row passed in from the parent upload flow — one entry per agent
 * whose YTD/MTD upserts succeeded. We avoid re-querying the agent set by
 * accepting the already-resolved `(user_id, agent_code)` list.
 */
export interface IAgentResolution {
  user_id: string;
  agent_code: string;
}

/******************************************************************************
                            SalesPointsService
******************************************************************************/

/**
 * Awards sales-completion points after every successful sales-report ingest.
 *
 * Three activities, all category `'sales'`, all `subject_type='upload_batch'`:
 *   - sales_noc:  MTD_NOC × cfg.points
 *   - sales_fyct: floor(MTD_FYCT / 1000) × cfg.points
 *   - sales_ace:  floor(MTD_ACE / 1000) × cfg.points
 *
 * MTD ACE and MTD NOC come straight from `sales_report_mtd` (already populated
 * by the upload). MTD FYCT has no per-month source column — it is derived as
 * `current_month_YTD − previous_month_YTD` (same math the
 * `sales_report_mtd_fyc` view does via LAG).
 *
 * Re-uploads of an existing month (corrections) trigger a reversal step that
 * inserts offsetting negative entries for every prior batch's transactions
 * before awarding the fresh positives. The ledger stays append-only.
 *
 * Concurrency guarantee: the critical reversal-then-insert section is pushed
 * into a single Postgres function (`award_sales_points_for_batch`) which
 * acquires `pg_advisory_xact_lock(hashtext('sales_points:tenant:year:month'))`
 * before reading priors and writing offsets+awards. Two simultaneous
 * re-uploads of the same period are serialised inside the database — the
 * second caller sees the first caller's writes when it acquires the lock,
 * so each correction reverses the immediately-preceding state, not a stale
 * one. See `supabase/migrations/.._add_award_sales_points_rpc.sql`.
 *
 * The whole flow is non-throwing by design: if any step fails it is logged,
 * surfaced as a Sentry issue, and swallowed — the upload itself has already
 * succeeded by the time this runs, and we don't want a points failure to
 * roll the upload back.
 */
class SalesPointsService {
  /**
   * Public entrypoint called by `salesReportService.uploadReport` after the
   * batch summary has been updated. Never throws.
   */
  async awardForBatch(
    batch: IUploadBatch,
    agentResolutions: IAgentResolution[],
  ): Promise<void> {
    try {
      // 1. Fetch the configured rates for this tenant + category=sales. Any
      //    missing activity defaults to 0 — a missing rate must not block the
      //    upload.
      const rates = await this.fetchRates(batch.tenant_id);

      // 2. Compute fresh awards in-memory: for each agent in the upload, look
      //    up MTD ACE/NOC (from sales_report_mtd) and derive MTD FYCT (current
      //    YTD - previous YTD). Skip zero-point rows so the ledger stays clean.
      const awardRows = await this.buildAwardRows(
        batch,
        agentResolutions,
        rates,
      );

      // 3. Atomic reversal+insert in a single Postgres transaction guarded by
      //    a period-scoped advisory lock. The RPC handles:
      //      a. acquire pg_advisory_xact_lock on (tenant, year, month)
      //      b. find prior batches for this period (excluding current)
      //      c. insert negative offset rows for their point_transactions
      //      d. insert the fresh `awardRows` we just computed
      //    All four steps run inside the function's implicit transaction, so
      //    the second caller in a concurrent re-upload observes the first
      //    caller's writes when it acquires the lock.
      await pointTransactionRepository.awardWithReversal({
        tenantId: batch.tenant_id,
        year: batch.year,
        month: batch.month,
        batchId: batch.id,
        activities: SALES_POINTS_ACTIVITIES,
        awards: awardRows,
      });

      loggingService.info('SalesPointsService.awardForBatch completed', {
        batchId: batch.id,
        awards: awardRows.length,
      });
    } catch (error) {
      // Non-throwing by design: the upload has already succeeded, points are
      // a downstream concern. Surface as a Sentry issue (separate from the
      // log entry, which is breadcrumb-only) so operators can detect schema
      // drift, RPC outages, or programming errors during reversal — then log
      // and swallow so the upload response stays unaffected. Admins can
      // re-trigger an awarding pass if needed.
      Sentry.captureException(error, {
        tags: { critical: 'sales_points_awarding' },
        extra: {
          batchId: batch.id,
          tenantId: batch.tenant_id,
          year: batch.year,
          month: batch.month,
        },
      });
      loggingService.error('SalesPointsService.awardForBatch failed', error, {
        batchId: batch.id,
      });
    }
  }

  /**
   * Fetches the per-tenant rates for the three sales activities. Missing
   * activities default to 0 (defensive: tenant onboarding case).
   */
  private async fetchRates(tenantId: string): Promise<ISalesPointsRates> {
    const configs = await pointConfigRepository.findByTenantAndCategoryAdmin(
      tenantId,
      'sales',
    );
    const byActivity = new Map(configs.map((c) => [c.activity, c.points]));
    return {
      noc: byActivity.get('sales_noc') ?? 0,
      fyct: byActivity.get('sales_fyct') ?? 0,
      ace: byActivity.get('sales_ace') ?? 0,
    };
  }

  /**
   * Builds the fresh positive award entries for the just-uploaded batch.
   * Looks up MTD ACE/NOC for the report month and derives MTD FYCT from the
   * delta between current-month and previous-month YTD totals. Skips zero-
   * point rows so the ledger stays clean.
   */
  private async buildAwardRows(
    batch: IUploadBatch,
    agentResolutions: IAgentResolution[],
    rates: ISalesPointsRates,
  ): Promise<ISalesPointsAward[]> {
    if (agentResolutions.length === 0) return [];

    const userIds = agentResolutions.map((a) => a.user_id);
    const { tenant_id: tenantId, year, month, id: batchId } = batch;

    // Months we need YTD rows for: the current report month and (when month
    // > 1) the previous month. The previous-month query is skipped for
    // January — there's no December-of-prior-year fall-through.
    const ytdMonths = month > 1 ? [month, month - 1] : [month];

    const [mtdRows, ytdRows] = await Promise.all([
      salesReportMtdRepository.findAceNocByTenantYearMonth(
        tenantId,
        year,
        month,
        userIds,
      ),
      salesReportYtdRepository.findFyctByTenantYearMonths(
        tenantId,
        year,
        ytdMonths,
        userIds,
      ),
    ]);

    // Index lookups by user_id for O(1) joins.
    const mtdByUser = new Map<string, { ace: number; noc: number }>();
    for (const row of mtdRows) {
      mtdByUser.set(row.user_id, { ace: Number(row.ace), noc: Number(row.noc) });
    }

    // YTD: pick the value at the report month and (if available) the prior
    // month. Storage may have either or both.
    const ytdCurByUser = new Map<string, number>();
    const ytdPrevByUser = new Map<string, number>();
    for (const row of ytdRows) {
      if (row.month === month) ytdCurByUser.set(row.user_id, Number(row.fyct));
      else if (row.month === month - 1)
        ytdPrevByUser.set(row.user_id, Number(row.fyct));
    }

    const awards: ISalesPointsAward[] = [];

    for (const { user_id: userId } of agentResolutions) {
      const mtd = mtdByUser.get(userId) ?? { ace: 0, noc: 0 };
      // Prior YTD defaults to 0 when there's no row (first month of the year
      // for this agent, or January).
      const ytdCur = ytdCurByUser.get(userId) ?? 0;
      const ytdPrev = ytdPrevByUser.get(userId) ?? 0;
      const mtdFyct = ytdCur - ytdPrev;

      const nocPoints = mtd.noc * rates.noc;
      const fyctPoints = Math.floor(mtdFyct / 1000) * rates.fyct;
      const acePoints = Math.floor(mtd.ace / 1000) * rates.ace;

      if (nocPoints !== 0) {
        awards.push({
          user_id: userId,
          activity: 'sales_noc',
          points: nocPoints,
          subject_id: batchId,
        });
      }
      if (fyctPoints !== 0) {
        awards.push({
          user_id: userId,
          activity: 'sales_fyct',
          points: fyctPoints,
          subject_id: batchId,
        });
      }
      if (acePoints !== 0) {
        awards.push({
          user_id: userId,
          activity: 'sales_ace',
          points: acePoints,
          subject_id: batchId,
        });
      }
    }

    return awards;
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const salesPointsService = new SalesPointsService();
export default salesPointsService;
