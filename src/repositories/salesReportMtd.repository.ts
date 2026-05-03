import supabaseService from '@src/services/supabase.service';
import { SalesReportMtdIns } from '@src/types/salesReport.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

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

      const query = (
        supabaseService as unknown as {
          adminClient: { from: (t: string) => unknown };
        }
      ).adminClient
        .from('sales_report_mtd');

      // Builder type widens with each filter; coerce per step.
      let q = (query as { select: (s: string) => unknown }).select(
        'user_id, month, ace, noc',
      );
      q = (q as { eq: (c: string, v: unknown) => unknown }).eq(
        'tenant_id',
        tenantId,
      );
      q = (q as { eq: (c: string, v: unknown) => unknown }).eq('year', year);
      if (userIds) {
        q = (q as { in: (c: string, v: unknown[]) => unknown }).in(
          'user_id',
          userIds,
        );
      }

      const { data, error } = (await q) as {
        data: MtdMonthlyRow[] | null;
        error: { message: string } | null;
      };

      if (error) throw new Error(error.message);
      return data ?? [];
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

      let q = (
        supabaseService as unknown as {
          adminClient: { from: (t: string) => unknown };
        }
      ).adminClient
        .from('sales_report_mtd');

      q = (q as { select: (s: string) => unknown }).select(
        'user_id, month, ace, noc',
      );
      q = (q as { eq: (c: string, v: unknown) => unknown }).eq(
        'tenant_id',
        tenantId,
      );
      q = (q as { eq: (c: string, v: unknown) => unknown }).eq('year', year);
      q = (q as { eq: (c: string, v: unknown) => unknown }).eq('month', month);
      q = (q as { in: (c: string, v: unknown[]) => unknown }).in(
        'user_id',
        userIds,
      );

      const { data, error } = (await q) as {
        data: MtdMonthlyRow[] | null;
        error: { message: string } | null;
      };

      if (error) throw new Error(error.message);
      return data ?? [];
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

      let q = (
        supabaseService as unknown as {
          adminClient: { from: (t: string) => unknown };
        }
      ).adminClient
        .from('sales_report_mtd_fyc');

      q = (q as { select: (s: string) => unknown }).select(
        'user_id, month, fyc_mtd, fyct_mtd',
      );
      q = (q as { eq: (c: string, v: unknown) => unknown }).eq(
        'tenant_id',
        tenantId,
      );
      q = (q as { eq: (c: string, v: unknown) => unknown }).eq('year', year);
      if (userIds) {
        q = (q as { in: (c: string, v: unknown[]) => unknown }).in(
          'user_id',
          userIds,
        );
      }

      const { data, error } = (await q) as {
        data: MtdFycMonthlyRow[] | null;
        error: { message: string } | null;
      };

      if (error) throw new Error(error.message);
      return data ?? [];
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
