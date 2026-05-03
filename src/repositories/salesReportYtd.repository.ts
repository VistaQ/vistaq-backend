import supabaseService from '@src/services/supabase.service';
import { SalesReportYtdIns } from '@src/types/salesReport.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

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
}

const ROLLUP_COLUMNS =
  'id, user_id, year, month, ace, noc, fyct, fyct_pct, mdrt_shortage_fyct, fyc, fyc_pct, mdrt_shortage_fyc, created_at';

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
      // Direct adminClient call because the wrapper's `adminSelect` doesn't
      // expose order/limit chaining.
      const { data, error } = await (
        supabaseService as unknown as {
          adminClient: {
            from: (t: string) => {
              select: (s: string) => {
                eq: (c: string, v: unknown) => {
                  eq: (c: string, v: unknown) => {
                    order: (c: string, opts: { ascending: boolean }) => {
                      limit: (n: number) => Promise<{
                        data: { month: number }[] | null;
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
        .from('sales_report_ytd')
        .select('month')
        .eq('tenant_id', tenantId)
        .eq('year', year)
        .order('month', { ascending: false })
        .limit(1);

      if (error) throw new Error(error.message);
      const rows = data ?? [];
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
      const { data, error } = await (
        supabaseService as unknown as {
          adminClient: {
            from: (t: string) => {
              select: (s: string) => {
                eq: (c: string, v: unknown) => {
                  eq: (
                    c: string,
                    v: unknown,
                  ) => Promise<{
                    data: YtdRollupRow[] | null;
                    error: { message: string } | null;
                  }>;
                };
              };
            };
          };
        }
      ).adminClient
        .from('sales_report_ytd')
        .select(ROLLUP_COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('year', year);

      if (error) throw new Error(error.message);

      const latestByUser = new Map<string, YtdRollupRow>();
      for (const row of data ?? []) {
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
   * Returns the LATEST YTD row for a single user in the given tenant + year,
   * or null if the user has no YTD row for that year yet.
   */
  async findLatestYtdForUserYear(
    tenantId: string,
    userId: string,
    year: number,
  ): Promise<YtdRollupRow | null> {
    try {
      const { data, error } = await (
        supabaseService as unknown as {
          adminClient: {
            from: (t: string) => {
              select: (s: string) => {
                eq: (c: string, v: unknown) => {
                  eq: (c: string, v: unknown) => {
                    eq: (c: string, v: unknown) => {
                      order: (c: string, opts: { ascending: boolean }) => {
                        limit: (n: number) => Promise<{
                          data: YtdRollupRow[] | null;
                          error: { message: string } | null;
                        }>;
                      };
                    };
                  };
                };
              };
            };
          };
        }
      ).adminClient
        .from('sales_report_ytd')
        .select(ROLLUP_COLUMNS)
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .eq('year', year)
        .order('month', { ascending: false })
        .limit(1);

      if (error) throw new Error(error.message);
      const rows = data ?? [];
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
