import pointConfigRepository from '@src/repositories/pointConfig.repository';
import pointTransactionRepository from '@src/repositories/pointTransaction.repository';
import salesReportMtdRepository from '@src/repositories/salesReportMtd.repository';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';
import uploadBatchRepository from '@src/repositories/uploadBatch.repository';
import loggingService from '@src/services/logging.service';
import { IUploadBatch } from '@src/types/salesReport.types';
import {
  IPointTransactionIns,
  ISalesPointsAward,
  ISalesPointsRates,
  SALES_POINTS_ACTIVITIES,
  SALES_POINTS_SUBJECT_TYPE,
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
 * The whole flow is non-throwing by design: if any step fails it is logged
 * and swallowed — the upload itself has already succeeded by the time this
 * runs, and we don't want a points failure to roll the upload back.
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

      // 2. Reversal step: find prior batches for this (tenant, year, month)
      //    EXCLUDING the current one, gather their point_transactions, and
      //    build offset entries.
      const reversalRows = await this.buildReversalRows(batch);

      // 3. Award step: for each agent in the upload, look up MTD ACE/NOC
      //    (from sales_report_mtd) and derive MTD FYCT (current YTD - previous
      //    YTD). Compute points and stage non-zero awards.
      const awardRows = await this.buildAwardRows(
        batch,
        agentResolutions,
        rates,
      );

      // 4. Bulk-insert reversal + awards in a single round trip.
      const allRows = [...reversalRows, ...awardRows];
      if (allRows.length === 0) {
        loggingService.info('SalesPointsService.awardForBatch — nothing to insert', {
          batchId: batch.id,
        });
        return;
      }

      await pointTransactionRepository.bulkInsert(allRows);

      loggingService.info('SalesPointsService.awardForBatch completed', {
        batchId: batch.id,
        reversals: reversalRows.length,
        awards: awardRows.length,
      });
    } catch (error) {
      // Non-throwing by design: the upload has already succeeded, points are
      // a downstream concern. Log and swallow so the upload response stays
      // unaffected. Admins can re-trigger an awarding pass if needed.
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
   * Builds offsetting negative entries for every prior point_transaction
   * linked to a previous batch for the same (tenant, year, month). The
   * `subject_id` on each reversal row points to the ORIGINAL batch (not the
   * new one) so audit links resolve to the row being reversed.
   */
  private async buildReversalRows(
    batch: IUploadBatch,
  ): Promise<IPointTransactionIns[]> {
    const priorBatchIds = await uploadBatchRepository.findPriorBatchIdsForPeriod(
      batch.tenant_id,
      batch.year,
      batch.month,
      batch.id,
    );
    if (priorBatchIds.length === 0) return [];

    const priorTxns = await pointTransactionRepository.findBySubjectIds(
      batch.tenant_id,
      priorBatchIds,
      [...SALES_POINTS_ACTIVITIES],
    );

    return priorTxns.map((t) => ({
      tenant_id: t.tenant_id,
      user_id: t.user_id,
      activity: t.activity,
      points: -t.points,
      subject_type: SALES_POINTS_SUBJECT_TYPE,
      // Link reversal back to the ORIGINAL batch — preserves the audit chain.
      subject_id: t.subject_id,
    }));
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
  ): Promise<IPointTransactionIns[]> {
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

    return awards.map((a) => ({
      tenant_id: tenantId,
      user_id: a.user_id,
      activity: a.activity,
      points: a.points,
      subject_type: SALES_POINTS_SUBJECT_TYPE,
      subject_id: a.subject_id,
    }));
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const salesPointsService = new SalesPointsService();
export default salesPointsService;
