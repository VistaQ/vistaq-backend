import supabaseService from '@src/services/supabase.service';
import { SalesReportYtdIns } from '@src/types/salesReport.types';
import { Database } from '@src/types/database.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type SalesReportYtdRow = Database['public']['Tables']['sales_report_ytd']['Row'];

/**
 * Subset of `sales_report_ytd` columns the read API needs. Repo-local; the
 * service layer maps these into domain interfaces before returning.
 */
export interface YtdRollupRow {
  id: string;
  user_id: string;
  year: number;
  month: number;
  ace: number;
  noc: number;
  fyct: number;
  fyct_pct: number;
  mdrt_shortage_fyct: number;
  fyc: number;
  fyc_pct: number;
  mdrt_shortage_fyc: number;
  created_at: string;
  /**
   * Most recent time this YTD snapshot row was written or overwritten.
   * Re-uploads of the same (tenant, user, year, month) advance this via the
   * `set_updated_at` trigger while preserving `created_at`. The read API
   * surfaces this as `imported_at` so callers see when the snapshot last
   * changed, not when it was first imported.
   */
  updated_at: string;
}

const ROLLUP_COLUMNS =
  'id, user_id, year, month, ace, noc, fyct, fyct_pct, mdrt_shortage_fyct, fyc, fyc_pct, mdrt_shortage_fyc, created_at, updated_at';

class SalesReportYtdRepository {
  async bulkUpsert(rows: SalesReportYtdIns[]): Promise<void> {
    try {
      if (rows.length === 0) return;
      const response = await supabaseService.adminUpsert(
        'sales_report_ytd',
        rows,
        'tenant_id,user_id,year,month',
      );
      if (response.error) throw new Error(response.error.message);
    } catch (error) {
      handleRepositoryError('SalesReportYtdRepository.bulkUpsert', error);
    }
  }

  async findLatestUploadedMonth(
    tenantId: string,
    year: number,
  ): Promise<number | null> {
    try {
      const { data, error } = await supabaseService.adminSelectOrdered(
        'sales_report_ytd',
        'month',
        { tenant_id: tenantId, year } as Partial<SalesReportYtdRow>,
        { column: 'month', ascending: false },
        1,
      );

      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as { month: number }[];
      if (rows.length === 0) return null;
      return rows[0].month;
    } catch (error) {
      handleRepositoryError(
        'SalesReportYtdRepository.findLatestUploadedMonth',
        error,
      );
    }
  }

  /**
   * Returns one YTD row per (user_id) — the LATEST month for that user in the
   * given tenant + year. Backing storage holds one row per (tenant, user, year,
   * month); we fetch all rows for the year and reduce to the highest month per
   * user in memory.
   */
  async findLatestYtdPerUserByTenantYear(
    tenantId: string,
    year: number,
  ): Promise<YtdRollupRow[]> {
    try {
      const { data, error } = await supabaseService.adminSelect(
        'sales_report_ytd',
        ROLLUP_COLUMNS,
        { tenant_id: tenantId, year } as Partial<SalesReportYtdRow>,
      );

      if (error) throw new Error(error.message);

      const rows = (data ?? []) as unknown as YtdRollupRow[];
      const latestByUser = new Map<string, YtdRollupRow>();
      for (const row of rows) {
        const existing = latestByUser.get(row.user_id);
        if (!existing || row.month > existing.month) {
          latestByUser.set(row.user_id, row);
        }
      }
      return Array.from(latestByUser.values());
    } catch (error) {
      handleRepositoryError(
        'SalesReportYtdRepository.findLatestYtdPerUserByTenantYear',
        error,
      );
    }
  }

  /**
   * Returns every YTD row for the given tenant + year + months, restricted to
   * the supplied user list. Used by the sales-points awarding service to look
   * up FYCT YTD values for both the current month and the previous month in a
   * single query (FYCT MTD = current.fyct - previous.fyct).
   *
   * Returns just the columns the awarding flow needs: `user_id`, `month`,
   * `fyct`. Empty user list short-circuits to `[]`.
   */
  async findFyctByTenantYearMonths(
    tenantId: string,
    year: number,
    months: number[],
    userIds: string[],
  ): Promise<{ user_id: string; month: number; fyct: number }[]> {
    try {
      if (userIds.length === 0 || months.length === 0) return [];

      const { data, error } = await supabaseService.adminSelectInIn(
        'sales_report_ytd',
        'user_id, month, fyct',
        [
          { column: 'month', values: months },
          { column: 'user_id', values: userIds },
        ],
        { tenant_id: tenantId, year } as Partial<SalesReportYtdRow>,
      );

      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as {
        user_id: string;
        month: number;
        fyct: number;
      }[];
    } catch (error) {
      handleRepositoryError(
        'SalesReportYtdRepository.findFyctByTenantYearMonths',
        error,
      );
    }
  }

  /**
   * Returns the LATEST YTD row for a single user in the given tenant + year,
   * or null if the user has no YTD row for that year yet.
   */
  async findLatestYtdForUserYear(
    tenantId: string,
    userId: string,
    year: number,
  ): Promise<YtdRollupRow | null> {
    try {
      const { data, error } = await supabaseService.adminSelectOrdered(
        'sales_report_ytd',
        ROLLUP_COLUMNS,
        { tenant_id: tenantId, user_id: userId, year } as Partial<SalesReportYtdRow>,
        { column: 'month', ascending: false },
        1,
      );

      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as YtdRollupRow[];
      return rows.length === 0 ? null : rows[0];
    } catch (error) {
      handleRepositoryError(
        'SalesReportYtdRepository.findLatestYtdForUserYear',
        error,
      );
    }
  }
}

export const salesReportYtdRepository = new SalesReportYtdRepository();
export default salesReportYtdRepository;
