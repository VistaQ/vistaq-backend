import supabaseService from '@src/services/supabase.service';
import {
  IPointTransactionIns,
  ISalesPointsAward,
  PointTransactionRow,
} from '@src/types/salesPoints.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

/******************************************************************************
                          PointTransactionRepository
******************************************************************************/

/**
 * Repository for the `point_transactions` ledger. Sales-completion points are
 * the first writer to hit this repo from the backend (existing point insertion
 * paths live in Postgres functions / older flows). Read-side aggregation lives
 * in the existing `agentPoints` repository / RPCs and is intentionally NOT
 * reused here.
 */
class PointTransactionRepository {
  /**
   * Bulk-inserts an array of point transactions in a single round trip.
   * Returns silently on an empty input — callers can pass a freshly built
   * array without a length guard.
   */
  async bulkInsert(rows: IPointTransactionIns[]): Promise<void> {
    try {
      if (rows.length === 0) return;
      const response = await supabaseService.adminInsert(
        'point_transactions',
        rows,
      );
      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      handleRepositoryError('PointTransactionRepository.bulkInsert', error);
    }
  }

  /**
   * Returns every point_transaction whose `subject_id` is in the supplied list
   * AND whose `activity` is in the supplied activities filter, scoped to the
   * given tenant. Used by the reversal step to find prior awards linked to
   * older `upload_batches` rows for the same (tenant, year, month).
   *
   * Both `subjectIds` and `activities` are required and non-empty; an empty
   * array short-circuits to `[]` so callers don't need to guard.
   */
  async findBySubjectIds(
    tenantId: string,
    subjectIds: string[],
    activities: string[],
  ): Promise<PointTransactionRow[]> {
    try {
      if (subjectIds.length === 0 || activities.length === 0) return [];

      const { data, error } = await supabaseService.adminSelectInIn(
        'point_transactions',
        'id, tenant_id, user_id, activity, points, subject_id, subject_type, created_at',
        [
          { column: 'subject_id', values: subjectIds },
          { column: 'activity', values: activities },
        ],
        { tenant_id: tenantId, subject_type: 'upload_batch' },
      );

      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PointTransactionRow[];
    } catch (error) {
      handleRepositoryError(
        'PointTransactionRepository.findBySubjectIds',
        error,
      );
    }
  }

  /**
   * Calls the `award_sales_points_for_batch` Postgres RPC. The function
   * acquires a transaction-scoped advisory lock keyed on the period
   * (`hashtext('sales_points:tenant:year:month')`) before doing the
   * reversal-then-award insert atomically. This serializes concurrent
   * re-uploads of the same (tenant, year, month) and prevents the
   * read-priors-then-insert race that would otherwise corrupt the ledger.
   *
   * The caller hands in already-computed award rows (rate × MTD math has
   * happened in the service layer); this method exists purely to push the
   * critical reversal+insert section into a single Postgres transaction.
   */
  async awardWithReversal(params: {
    tenantId: string;
    year: number;
    month: number;
    batchId: string;
    activities: readonly string[];
    awards: ISalesPointsAward[];
  }): Promise<void> {
    try {
      const awardsJson = params.awards.map((a) => ({
        user_id: a.user_id,
        activity: a.activity,
        points: a.points,
        subject_id: a.subject_id,
      }));

      await supabaseService.adminRpc('award_sales_points_for_batch', {
        p_tenant_id: params.tenantId,
        p_year: params.year,
        p_month: params.month,
        p_batch_id: params.batchId,
        p_activities: [...params.activities],
        p_awards: awardsJson,
      });
    } catch (error) {
      handleRepositoryError(
        'PointTransactionRepository.awardWithReversal',
        error,
      );
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const pointTransactionRepository = new PointTransactionRepository();
export default pointTransactionRepository;
