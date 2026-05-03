import supabaseService from '@src/services/supabase.service';
import {
  IPointTransactionIns,
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

      // The wrapper's `adminSelectIn` only supports a single `.in()` filter;
      // we need two (one on `subject_id`, one on `activity`) plus an `.eq()`
      // on tenant_id. Drop to the underlying admin client directly.
      const { data, error } = await (
        supabaseService as unknown as {
          adminClient: {
            from: (t: string) => {
              select: (s: string) => {
                eq: (c: string, v: unknown) => {
                  eq: (c: string, v: unknown) => {
                    in: (c: string, v: unknown[]) => {
                      in: (c: string, v: unknown[]) => Promise<{
                        data: PointTransactionRow[] | null;
                        error: { message: string } | null;
                      }>;
                    };
                  };
                };
              };
            };
          };
        }
      ).adminClient
        .from('point_transactions')
        .select(
          'id, tenant_id, user_id, activity, points, subject_id, subject_type, created_at',
        )
        .eq('tenant_id', tenantId)
        .eq('subject_type', 'upload_batch')
        .in('subject_id', subjectIds)
        .in('activity', activities);

      if (error) throw new Error(error.message);
      return data ?? [];
    } catch (error) {
      handleRepositoryError(
        'PointTransactionRepository.findBySubjectIds',
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
