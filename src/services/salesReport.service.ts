import salesReportMtdRepository from '@src/repositories/salesReportMtd.repository';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';
import uploadBatchRepository from '@src/repositories/uploadBatch.repository';
import userRepository from '@src/repositories/user.repository';
import {
  InvalidEtlResultError,
  UnknownReportMonthError,
} from '@src/models/errors/salesReport.errors';
import {
  IEtlResult,
  IGroupReport,
  IGroupTrendPoint,
  IUploadResult,
  MONTH_MAP,
  SalesReportMtdIns,
  SalesReportYtdIns,
} from '@src/types/salesReport.types';
import { handleServiceError } from '@src/utils/errorHandlers';

interface IUploadParams {
  etlResult: IEtlResult;
  tenantId: string;
  uploadedBy: string;
}

class SalesReportService {
  async uploadReport(params: IUploadParams): Promise<IUploadResult> {
    try {
      const { etlResult, tenantId, uploadedBy } = params;

      // 1. Validate input
      if (!etlResult.records?.length) {
        throw new InvalidEtlResultError('etlResult.records must be non-empty');
      }

      // 2. Derive year/month
      const reportYear = new Date(etlResult.created_at).getFullYear();
      if (isNaN(reportYear)) {
        throw new InvalidEtlResultError(
          `etlResult.created_at "${etlResult.created_at}" is not a valid date`,
        );
      }
      const reportMonthName = etlResult.months_detected.at(-1) ?? '';
      const reportMonth = MONTH_MAP[reportMonthName];
      if (!reportMonth) {
        throw new UnknownReportMonthError(
          `months_detected last entry "${reportMonthName}" is not a recognised month`,
        );
      }

      // 3. Insert upload batch
      const batch = await uploadBatchRepository.insertBatch({
        tenant_id: tenantId,
        uploaded_by: uploadedBy,
        year: reportYear,
        month: reportMonth,
        file_name: etlResult.source,
        rows_loaded: 0,
      });

      // 4. Resolve agentCode → user_id
      const agentCodes = etlResult.records.map((r) => r.agentCode);
      const matched = await userRepository.findByAgentCodes(tenantId, agentCodes);
      const userIdByCode = new Map(matched.map((m) => [m.agent_code, m.id]));

      // 5. Build YTD rows (report month only) + MTD rows (every month present in rowData)
      const ytdRows: SalesReportYtdIns[] = [];
      const mtdRows: SalesReportMtdIns[] = [];
      const errors: IUploadResult['errors'] = [];

      for (const record of etlResult.records) {
        const userId = userIdByCode.get(record.agentCode);
        if (!userId) {
          errors.push({ agentCode: record.agentCode, reason: 'User not found' });
          continue;
        }

        const r = record.rowData;
        ytdRows.push({
          batch_id: batch.id,
          tenant_id: tenantId,
          user_id: userId,
          year: reportYear,
          month: reportMonth,
          ace: r['ACE (YTD)'] ?? 0,
          noc: r['NOC (YTD)'] ?? 0,
          fyct: r['FYCT (YTD)'] ?? 0,
          fyct_pct: r['% FYCT (YTD)'] ?? 0,
          mdrt_shortage_fyct: r['MDRT SHORTAGE FYCT'] ?? 0,
          fyc: r['FYC (YTD)'] ?? 0,
          fyc_pct: r['% FYC (YTD)'] ?? 0,
          mdrt_shortage_fyc: r['MDRT SHORTAGE FYC'] ?? 0,
        });

        for (const [monthName, monthNum] of Object.entries(MONTH_MAP)) {
          const ace = r[`${monthName} ACE`];
          const noc = r[`${monthName} NOC`];
          if (ace === undefined && noc === undefined) continue;

          mtdRows.push({
            batch_id: batch.id,
            tenant_id: tenantId,
            user_id: userId,
            year: reportYear,
            month: monthNum,
            ace: ace ?? 0,
            noc: noc ?? 0,
          });
        }
      }

      // 6. Bulk upserts in parallel
      await Promise.all([
        salesReportYtdRepository.bulkUpsert(ytdRows),
        salesReportMtdRepository.bulkUpsert(mtdRows),
      ]);

      // 7. Update rows_loaded with the actual processed count
      const processed = ytdRows.length;
      await uploadBatchRepository.updateRowsLoaded(batch.id, processed);

      return {
        batchId: batch.id,
        processed,
        skipped: errors.length,
        errors,
      };
    } catch (error) {
      if (
        error instanceof InvalidEtlResultError ||
        error instanceof UnknownReportMonthError
      ) {
        throw error;
      }
      return handleServiceError('SalesReportService.uploadReport', error);
    }
  }

  async getGroupSummary(p: {
    tenantId: string;
    year: number;
    month: number;
  }): Promise<IGroupReport> {
    try {
      const agents = await salesReportYtdRepository.findByTenantYearMonthWithUser(
        p.tenantId,
        p.year,
        p.month,
      );

      const sorted = [...agents].sort((a, b) => b.fyc - a.fyc);

      const agentCount = sorted.length;
      const sum = (k: keyof typeof sorted[number]) =>
        sorted.reduce((acc, a) => acc + Number(a[k] as number), 0);

      const fyct_ytd = sum('fyct');
      const fyc_ytd = sum('fyc');
      const ace_ytd = sum('ace');
      const noc_ytd = sum('noc');
      const fyc_pct_avg = agentCount > 0 ? sum('fyc_pct') / agentCount : 0;
      // fyct_pct is not currently selected — defaulting to 0 until we surface it.
      const fyct_pct_avg = 0;
      const noc_per_agent = agentCount > 0 ? noc_ytd / agentCount : 0;

      return {
        summary: {
          fyct_ytd, fyc_ytd, ace_ytd, noc_ytd,
          fyc_pct_avg, fyct_pct_avg, agent_count: agentCount, noc_per_agent,
        },
        agents: sorted,
      };
    } catch (error) {
      return handleServiceError('SalesReportService.getGroupSummary', error);
    }
  }

  async getGroupTrend(p: { tenantId: string; year: number }): Promise<IGroupTrendPoint[]> {
    try {
      return await salesReportMtdRepository.aggregateTrendByYear(p.tenantId, p.year);
    } catch (error) {
      return handleServiceError('SalesReportService.getGroupTrend', error);
    }
  }
}

export const salesReportService = new SalesReportService();
export default salesReportService;
