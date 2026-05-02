import supabaseService from '@src/services/supabase.service';
import {
  IGroupTrendPoint,
  SalesReportMtdIns,
} from '@src/types/salesReport.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

interface MtdFycViewRow {
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

  async aggregateTrendByYear(
    tenantId: string,
    year: number,
  ): Promise<IGroupTrendPoint[]> {
    try {
      const { data, error } = await (
        supabaseService as unknown as {
          adminClient: {
            from: (t: string) => {
              select: (s: string) => {
                eq: (c: string, v: unknown) => {
                  eq: (c: string, v: unknown) => Promise<{ data: MtdFycViewRow[] | null; error: { message: string } | null }>;
                };
              };
            };
          };
        }
      ).adminClient
        .from('sales_report_mtd_fyc')
        .select('month, fyc_mtd, fyct_mtd')
        .eq('tenant_id', tenantId)
        .eq('year', year);

      if (error) throw new Error(error.message);

      const grouped = new Map<number, IGroupTrendPoint>();
      for (const row of data ?? []) {
        const existing = grouped.get(row.month);
        if (existing) {
          existing.fyc_mtd += Number(row.fyc_mtd);
          existing.fyct_mtd += Number(row.fyct_mtd);
        } else {
          grouped.set(row.month, {
            month: row.month,
            fyc_mtd: Number(row.fyc_mtd),
            fyct_mtd: Number(row.fyct_mtd),
          });
        }
      }
      return Array.from(grouped.values()).sort((a, b) => a.month - b.month);
    } catch (error) {
      handleRepositoryError('SalesReportMtdRepository.aggregateTrendByYear', error);
    }
  }
}

export const salesReportMtdRepository = new SalesReportMtdRepository();
export default salesReportMtdRepository;
