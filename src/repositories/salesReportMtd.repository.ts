import supabaseService from '@src/services/supabase.service';
import { Database } from '@src/types/database.types';
import { SalesReportMtdIns } from '@src/types/salesReport.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type SalesReportMtdRow = Database['public']['Tables']['sales_report_mtd']['Row'];

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

class SalesReportMtdRepository {
  async bulkUpsert(rows: SalesReportMtdIns[]): Promise<void> {
    try {
      if (rows.length === 0) return;
      const response = await supabaseService.adminUpsert(
        'sales_report_mtd',
        rows,
        'tenant_id,user_id,year,month',
      );
      if (response.error) throw new Error(response.error.message);
    } catch (error) {
      handleRepositoryError('SalesReportMtdRepository.bulkUpsert', error);
    }
  }

  /**
   * Returns every MTD row for a tenant + year. Used to populate the per-agent
   * `month_ace[12]` and `month_noc[12]` arrays in the year-rollup endpoint.
   *
   * If `userIds` is non-empty, restricts results to those users (the /me
   * endpoint passes a single id; the manager list endpoint omits the filter).
   */
  async findAceNocByTenantYear(
    tenantId: string,
    year: number,
    userIds?: string[],
  ): Promise<MtdMonthlyRow[]> {
    try {
      if (userIds && userIds.length === 0) return [];

      const eqFilters = { tenant_id: tenantId, year } as Partial<SalesReportMtdRow>;

      const response = userIds
        ? await supabaseService.adminSelectInIn(
            'sales_report_mtd',
            'user_id, month, ace, noc',
            [{ column: 'user_id', values: userIds }],
            eqFilters,
          )
        : await supabaseService.adminSelect(
            'sales_report_mtd',
            'user_id, month, ace, noc',
            eqFilters,
          );

      if (response.error) throw new Error(response.error.message);
      return (response.data ?? []) as unknown as MtdMonthlyRow[];
    } catch (error) {
      handleRepositoryError(
        'SalesReportMtdRepository.findAceNocByTenantYear',
        error,
      );
    }
  }

  /**
   * Returns every MTD row for a tenant + year + month, restricted to the
   * supplied user list. Used by the sales-points awarding service to look up
   * each agent's MTD ACE/NOC for the just-uploaded month in a single query.
   * Returns `[]` when `userIds` is empty.
   */
  async findAceNocByTenantYearMonth(
    tenantId: string,
    year: number,
    month: number,
    userIds: string[],
  ): Promise<MtdMonthlyRow[]> {
    try {
      if (userIds.length === 0) return [];

      const { data, error } = await supabaseService.adminSelectInIn(
        'sales_report_mtd',
        'user_id, month, ace, noc',
        [{ column: 'user_id', values: userIds }],
        { tenant_id: tenantId, year, month } as Partial<SalesReportMtdRow>,
      );

      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as MtdMonthlyRow[];
    } catch (error) {
      handleRepositoryError(
        'SalesReportMtdRepository.findAceNocByTenantYearMonth',
        error,
      );
    }
  }

  /**
   * Returns every `sales_report_mtd_fyc` view row for a tenant + year. Used to
   * populate the per-agent `month_fyc[12]` and `month_fyct[12]` arrays.
   *
   * If `userIds` is non-empty, restricts results to those users.
   */
  async findFycByTenantYear(
    tenantId: string,
    year: number,
    userIds?: string[],
  ): Promise<MtdFycMonthlyRow[]> {
    try {
      if (userIds && userIds.length === 0) return [];

      // `sales_report_mtd_fyc` is a view (Database['public']['Views']), not a
      // Table — the typed wrappers accept any table name when called via the
      // string-typed `adminSelectWithJoinIn`. `.eq()` filters cover tenant +
      // year; `.in()` covers the optional userIds filter.
      const eqFilters = { tenant_id: tenantId, year } as Record<string, unknown>;
      const inFilters = userIds
        ? [{ column: 'user_id', values: userIds }]
        : [];

      const { data, error } =
        await supabaseService.adminSelectWithJoinIn(
          'sales_report_mtd_fyc',
          'user_id, month, fyc_mtd, fyct_mtd',
          inFilters,
          eqFilters,
        );

      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as MtdFycMonthlyRow[];
    } catch (error) {
      handleRepositoryError(
        'SalesReportMtdRepository.findFycByTenantYear',
        error,
      );
    }
  }
}

export const salesReportMtdRepository = new SalesReportMtdRepository();
export default salesReportMtdRepository;
