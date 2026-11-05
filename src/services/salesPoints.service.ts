import pointConfigRepository from '@src/repositories/pointConfig.repository';
import pointTransactionRepository from '@src/repositories/pointTransaction.repository';
import salesReportMtdRepository from '@src/repositories/salesReportMtd.repository';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';
import type {
  ISalesPointsAward,
  ISalesPointsRates,
} from '@src/types/salesPoints.types';
import { SALES_POINTS_ACTIVITIES } from '@src/types/salesPoints.types';
import type { IUploadBatch } from '@src/types/salesReport.types';

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
 * Re-uploads of an existing month (corrections) write only the difference
 * from what each agent already holds for that month, so the ledger stays
 * append-only and concurrent re-uploads cannot double-count (see
 * `pointTransactionRepository.awardWithReversal`).
 *
 * The whole flow is non-throwing by design: if any step fails it is
 * swallowed — the upload itself has already succeeded by the time this runs,
 * and we don't want a points failure to roll the upload back.
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
      const rates = await this.fetchRates();

      const awardRows = await this.buildAwardRows(
        batch,
        agentResolutions,
        rates,
      );

      await pointTransactionRepository.awardWithReversal({
        tenantId: batch.tenant_id,
        year: batch.year,
        month: batch.month,
        batchId: batch.id,
        activities: SALES_POINTS_ACTIVITIES,
        awards: awardRows,
      });
    } catch {
      // Non-throwing by design: the upload has already succeeded and points
      // are a downstream concern. Admins can re-trigger an awarding pass.
    }
  }

  // An activity with no config earns 0, as on a fresh stage before rates are set.
  private async fetchRates(): Promise<ISalesPointsRates> {
    const configs = await pointConfigRepository.findByCategory('sales');
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
      mtdByUser.set(row.user_id, {
        ace: Number(row.ace),
        noc: Number(row.noc),
      });
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
