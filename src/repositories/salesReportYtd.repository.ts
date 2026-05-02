import supabaseService from '@src/services/supabase.service';
import {
  IGroupAgent,
  SalesReportYtdIns,
} from '@src/types/salesReport.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

const YTD_USER_JOIN_SELECT =
  'user_id, fyct, fyc, fyc_pct, ace, noc, mdrt_shortage_fyc, users!inner(name, agent_code)';

interface YtdJoinRow {
  user_id: string;
  fyct: number;
  fyc: number;
  fyc_pct: number;
  ace: number;
  noc: number;
  mdrt_shortage_fyc: number;
  users: { name: string | null; agent_code: string | null };
}

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

  async findByTenantYearMonthWithUser(
    tenantId: string,
    year: number,
    month: number,
  ): Promise<IGroupAgent[]> {
    try {
      // Direct adminClient call because the wrapper's `adminSelect` doesn't support
      // the embedded relationship select-string syntax we need for the users join.
      const { data, error } = await (
        supabaseService as unknown as {
          adminClient: {
            from: (t: string) => {
              select: (s: string) => {
                eq: (c: string, v: unknown) => {
                  eq: (c: string, v: unknown) => {
                    eq: (c: string, v: unknown) => Promise<{ data: YtdJoinRow[] | null; error: { message: string } | null }>;
                  };
                };
              };
            };
          };
        }
      ).adminClient
        .from('sales_report_ytd')
        .select(YTD_USER_JOIN_SELECT)
        .eq('tenant_id', tenantId)
        .eq('year', year)
        .eq('month', month);

      if (error) throw new Error(error.message);
      const rows = data ?? [];
      return rows.map((r) => ({
        user_id: r.user_id,
        name: r.users.name ?? '',
        agent_code: r.users.agent_code ?? '',
        fyct: Number(r.fyct),
        fyc: Number(r.fyc),
        fyc_pct: Number(r.fyc_pct),
        ace: Number(r.ace),
        noc: Number(r.noc),
        mdrt_shortage_fyc: Number(r.mdrt_shortage_fyc),
      }));
    } catch (error) {
      handleRepositoryError(
        'SalesReportYtdRepository.findByTenantYearMonthWithUser',
        error,
      );
    }
  }
}

export const salesReportYtdRepository = new SalesReportYtdRepository();
export default salesReportYtdRepository;
