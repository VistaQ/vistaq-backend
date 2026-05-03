import { Database } from '@src/types/database.types';

/******************************************************************************
                            Raw row types (Repository-only)
******************************************************************************/

export type PointTransactionRow =
  Database['public']['Tables']['point_transactions']['Row'];

/**
 * Insert shape for `point_transactions`. Matches the supabase-generated
 * `Insert` type 1:1 — the repository accepts and forwards this exact shape.
 */
export type IPointTransactionIns =
  Database['public']['Tables']['point_transactions']['Insert'];

/******************************************************************************
                            Domain interfaces (Service)
******************************************************************************/

/**
 * The three configured per-tenant rates needed to compute sales-completion
 * points. Values default to 0 when a tenant has no `point_configs` row for a
 * given activity (defensive: a missing config short-circuits awarding without
 * blocking the upload).
 */
export interface ISalesPointsRates {
  noc: number;
  fyct: number;
  ace: number;
}

/**
 * One award row staged for insertion into `point_transactions`. Used as an
 * intermediate shape inside the service before the final bulk insert.
 *
 * - `subject_type` is implied to be `'upload_batch'` for every award.
 * - `subject_id` links each row to the originating `upload_batches.id`. For
 *   reversal entries the subject_id points to the ORIGINAL batch being
 *   reversed (not the new batch), preserving audit linkage.
 */
export interface ISalesPointsAward {
  user_id: string;
  activity: string;
  points: number;
  subject_id: string;
}

/**
 * Sales-completion activity name constants. Single source of truth for the
 * three activity strings used by the awarding service and the reversal lookup.
 */
export const SALES_POINTS_ACTIVITIES = ['sales_noc', 'sales_fyct', 'sales_ace'] as const;
export type SalesPointsActivity = (typeof SALES_POINTS_ACTIVITIES)[number];

export const SALES_POINTS_SUBJECT_TYPE = 'upload_batch';
