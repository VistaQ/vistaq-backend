import * as Sentry from '@sentry/node';

import {
  InvalidEtlResultError,
  NonConsecutiveUploadError,
} from '@src/models/errors/salesReport.errors';
import salesReportMtdRepository from '@src/repositories/salesReportMtd.repository';
import salesReportYtdRepository, {
  YtdRollupRow,
} from '@src/repositories/salesReportYtd.repository';
import uploadBatchRepository from '@src/repositories/uploadBatch.repository';
import userRepository from '@src/repositories/user.repository';
import loggingService from '@src/services/logging.service';
import salesPointsService, {
  IAgentResolution,
} from '@src/services/salesPoints.service';
import { Scope } from '@src/services/scope.service';
import {
  IEtlResult,
  IEtlRowData,
  IPaginatedUploadAudit,
  ISalesReport,
  IUploadResult,
  MONTH_MAP,
  SalesReportMtdIns,
  SalesReportYtdIns,
  UploadStatus,
} from '@src/types/salesReport.types';
import { handleServiceError } from '@src/utils/errorHandlers';

interface IUploadParams {
  etlResult: IEtlResult;
  tenantId: string;
  /**
   * Nullable for manual ETL ingests (POST /api/reports/ingest) where the
   * caller is authenticated via ETL_API_KEY rather than a user JWT.
   * Standard JWT-authenticated uploads always pass the user id.
   */
  uploadedBy: string | null;
  /**
   * Calendar year the report covers (e.g. 2026). Caller-supplied intent —
   * lives as a sibling of `etlResult` so the raw ETL pipeline output stays
   * untouched. Already validated by the route's Zod schema.
   */
  reportYear: number;
  /**
   * Calendar month the report covers, 1-12. Caller-supplied intent — see
   * `reportYear`. Already validated by the route's Zod schema.
   */
  reportMonth: number;
}

// rowData values are unknown — the ETL emits numbers, strings, and nulls.
// Coerce per-key when building DB rows; non-numeric/missing → 0.
function num(value: unknown): number {
  if (value === undefined || value === null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function readRowData(r: IEtlRowData, key: string): number {
  return num(r[key]);
}

class SalesReportService {
  async uploadReport(params: IUploadParams): Promise<IUploadResult> {
    try {
      const { etlResult, tenantId, uploadedBy, reportYear, reportMonth } =
        params;

      // 1. Validate input
      if (!etlResult.records?.length) {
        throw new InvalidEtlResultError('etlResult.records must be non-empty');
      }

      // 2. Year/month come straight from the caller as separate params —
      //    they live as siblings of etlResult, never inside it. The route's
      //    Zod schema has already validated they are integers in range.

      // 2a. Defense-in-depth guard: block skip-ahead uploads only. Re-uploads of
      //     the latest month (data corrections) and earlier months (historical
      //     corrections) are allowed — the upsert on (tenant, user, year, month)
      //     replaces cleanly and the LAG-derived MTD FYC view recomputes.
      const latest = await salesReportYtdRepository.findLatestUploadedMonth(
        tenantId,
        reportYear,
      );
      if (latest !== null && reportMonth > latest + 1) {
        const reqMonth = String(reportMonth).padStart(2, '0');
        const latestMonth = String(latest).padStart(2, '0');
        const nextAllowed = String(latest + 1).padStart(2, '0');
        throw new NonConsecutiveUploadError(
          `Cannot upload ${reportYear}-${reqMonth}. Latest uploaded is ${reportYear}-${latestMonth}; cannot skip ahead — next allowed is ${reportYear}-${nextAllowed} or any earlier month.`,
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
      const matched = await userRepository.findByAgentCodes(
        tenantId,
        agentCodes,
      );
      const userIdByCode = new Map(matched.map((m) => [m.agent_code, m.id]));

      // 5. Build YTD rows (report month only) + MTD rows (every month present in rowData)
      const ytdRows: SalesReportYtdIns[] = [];
      const mtdRows: SalesReportMtdIns[] = [];
      const errors: IUploadResult['errors'] = [];
      const agentResolutions: IAgentResolution[] = [];

      for (const record of etlResult.records) {
        const userId = userIdByCode.get(record.agentCode);
        if (!userId) {
          errors.push({
            agentCode: record.agentCode,
            reason: 'User not found',
          });
          continue;
        }
        agentResolutions.push({
          user_id: userId,
          agent_code: record.agentCode,
        });

        const r = record.rowData;
        ytdRows.push({
          batch_id: batch.id,
          tenant_id: tenantId,
          user_id: userId,
          year: reportYear,
          month: reportMonth,
          ace: readRowData(r, 'ACE (YTD)'),
          noc: readRowData(r, 'NOC (YTD)'),
          fyct: readRowData(r, 'FYCT (YTD)'),
          fyct_pct: readRowData(r, '% FYCT (YTD)'),
          mdrt_shortage_fyct: readRowData(r, 'MDRT SHORTAGE FYCT'),
          fyc: readRowData(r, 'FYC (YTD)'),
          fyc_pct: readRowData(r, '% FYC (YTD)'),
          mdrt_shortage_fyc: readRowData(r, 'MDRT SHORTAGE FYC'),
        });

        for (const [monthName, monthNum] of Object.entries(MONTH_MAP)) {
          const aceKey = `${monthName} ACE`;
          const nocKey = `${monthName} NOC`;
          const aceRaw = r[aceKey];
          const nocRaw = r[nocKey];
          if (aceRaw === undefined && nocRaw === undefined) continue;

          mtdRows.push({
            batch_id: batch.id,
            tenant_id: tenantId,
            user_id: userId,
            year: reportYear,
            month: monthNum,
            ace: num(aceRaw),
            noc: num(nocRaw),
          });
        }
      }

      // 6. Bulk upserts in parallel
      await Promise.all([
        salesReportYtdRepository.bulkUpsert(ytdRows),
        salesReportMtdRepository.bulkUpsert(mtdRows),
      ]);

      // 7. Update batch summary with the actual processed/skipped counts and
      //    a derived status: every-row-failed → 'failed', mixed → 'partial',
      //    clean → 'success'.
      const processed = ytdRows.length;
      const skipped = errors.length;
      const status: UploadStatus =
        processed === 0 ? 'failed' : skipped > 0 ? 'partial' : 'success';

      await uploadBatchRepository.updateBatchSummary(batch.id, {
        rows_loaded: processed,
        rows_skipped: skipped,
        status,
      });

      // 8. Award sales-completion points based on the just-uploaded MTD data.
      //    The points service is non-throwing by design — it logs failures
      //    and swallows them so a points hiccup never fails the upload. We
      //    additionally wrap the call here as a defense-in-depth guard: the
      //    persistence above is the critical contract, points are downstream.
      try {
        await salesPointsService.awardForBatch(
          {
            ...batch,
            rows_loaded: processed,
            rows_skipped: skipped,
            status,
          },
          agentResolutions,
        );
      } catch (pointsError) {
        // Already logged by salesPointsService; swallow defensively in case a
        // future change makes the inner method throw again. Surface to Sentry
        // here too — mirrors the inner swallow's instrumentation so a
        // regression at either layer is queryable as an issue.
        Sentry.captureException(pointsError, {
          tags: { critical: 'sales_points_awarding' },
          extra: { batchId: batch.id },
        });
        loggingService.error(
          'SalesReportService.uploadReport — points awarding step failed (swallowed)',
          pointsError,
          { batchId: batch.id },
        );
      }

      return {
        batchId: batch.id,
        processed,
        skipped,
        errors,
      };
    } catch (error) {
      if (error instanceof InvalidEtlResultError) {
        throw error;
      }
      if (error instanceof NonConsecutiveUploadError) {
        throw error;
      }
      return handleServiceError('SalesReportService.uploadReport', error);
    }
  }

  /**
   * Manager-only: returns one `ISalesReport` per agent in the tenant for the
   * given year. Each entry combines the agent's latest YTD snapshot with
   * monthly arrays for ACE/NOC (from `sales_report_mtd`) and FYC/FYCt
   * (from the `sales_report_mtd_fyc` view).
   *
   * Implementation: 4 flat indexed queries (latest YTD per user, all MTD rows,
   * all MTD-FYC view rows, users for the matched ids), then assembly in JS.
   *
   * The `scope` parameter applies role-based filtering:
   * - `{ type: 'all' }` — no extra filter (admin / master_trainer)
   * - `{ type: 'group_ids', groupIds: [] }` — short-circuits to `[]`
   * - `{ type: 'group_ids', groupIds: [...] }` — restricts the result to
   *   agents whose `users.group_id` is in the supplied list. Agents that
   *   don't survive the filter are dropped from the assembled result.
   */
  async getYearReports(p: {
    tenantId: string;
    year: number;
    scope: Scope;
  }): Promise<ISalesReport[]> {
    try {
      // Empty group_ids scope means caller has no permitted agents — short
      // circuit before any DB call.
      if (p.scope.type === 'group_ids' && p.scope.groupIds.length === 0) {
        return [];
      }

      const ytdRows =
        await salesReportYtdRepository.findLatestYtdPerUserByTenantYear(
          p.tenantId,
          p.year,
        );

      if (ytdRows.length === 0) return [];

      const userIds = ytdRows.map((r) => r.user_id);
      const groupIds =
        p.scope.type === 'group_ids' ? p.scope.groupIds : undefined;

      const [mtdRows, fycRows, users] = await Promise.all([
        salesReportMtdRepository.findAceNocByTenantYear(p.tenantId, p.year),
        salesReportMtdRepository.findFycByTenantYear(p.tenantId, p.year),
        userRepository.findIdNameAgentCodeByIds(userIds, groupIds),
      ]);

      const userById = new Map(users.map((u) => [u.id, u]));

      // When a group filter is in effect, drop YTD rows for users that didn't
      // survive the user query — they fall outside the caller's scope.
      const visibleYtdRows =
        groupIds === undefined
          ? ytdRows
          : ytdRows.filter((r) => userById.has(r.user_id));

      return visibleYtdRows.map((ytd) =>
        this.assembleSalesReport(ytd, p.year, mtdRows, fycRows, userById),
      );
    } catch (error) {
      return handleServiceError('SalesReportService.getYearReports', error);
    }
  }

  /**
   * Returns the calling user's own `ISalesReport` for the year, or null when
   * the user has no YTD row yet (controller maps null → 404).
   */
  async getMyYearReport(p: {
    tenantId: string;
    userId: string;
    year: number;
  }): Promise<ISalesReport | null> {
    try {
      const ytd = await salesReportYtdRepository.findLatestYtdForUserYear(
        p.tenantId,
        p.userId,
        p.year,
      );
      if (!ytd) return null;

      const [mtdRows, fycRows, users] = await Promise.all([
        salesReportMtdRepository.findAceNocByTenantYear(p.tenantId, p.year, [
          p.userId,
        ]),
        salesReportMtdRepository.findFycByTenantYear(p.tenantId, p.year, [
          p.userId,
        ]),
        userRepository.findIdNameAgentCodeByIds([p.userId]),
      ]);

      const userById = new Map(users.map((u) => [u.id, u]));
      return this.assembleSalesReport(ytd, p.year, mtdRows, fycRows, userById);
    } catch (error) {
      return handleServiceError('SalesReportService.getMyYearReport', error);
    }
  }

  /**
   * Manager-only: paginated audit list of upload batches for a tenant + year,
   * sorted most-recent-first.
   */
  async getUploadAudit(p: {
    tenantId: string;
    year: number;
    page: number;
    pageSize: number;
  }): Promise<IPaginatedUploadAudit> {
    try {
      return await uploadBatchRepository.findPaginatedAuditByTenant(
        p.tenantId,
        p.year,
        p.page,
        p.pageSize,
      );
    } catch (error) {
      return handleServiceError('SalesReportService.getUploadAudit', error);
    }
  }

  /**
   * Builds a single `ISalesReport` by combining a YTD snapshot with monthly
   * MTD arrays. Pulled out for reuse between the list and /me endpoints.
   */
  private assembleSalesReport(
    ytd: YtdRollupRow,
    year: number,
    mtdRows: { user_id: string; month: number; ace: number; noc: number }[],
    fycRows: {
      user_id: string;
      month: number;
      fyc_mtd: number;
      fyct_mtd: number;
    }[],
    userById: Map<
      string,
      { id: string; name: string; agent_code: string | null }
    >,
  ): ISalesReport {
    const monthAce = new Array<number>(12).fill(0);
    const monthNoc = new Array<number>(12).fill(0);
    const monthFyc = new Array<number>(12).fill(0);
    const monthFyct = new Array<number>(12).fill(0);

    for (const row of mtdRows) {
      if (row.user_id !== ytd.user_id) continue;
      if (row.month < 1 || row.month > 12) continue;
      monthAce[row.month - 1] = Number(row.ace);
      monthNoc[row.month - 1] = Number(row.noc);
    }

    for (const row of fycRows) {
      if (row.user_id !== ytd.user_id) continue;
      if (row.month < 1 || row.month > 12) continue;
      monthFyc[row.month - 1] = Number(row.fyc_mtd);
      monthFyct[row.month - 1] = Number(row.fyct_mtd);
    }

    const user = userById.get(ytd.user_id);

    return {
      id: ytd.id,
      agent_id: ytd.user_id,
      agent_code: user?.agent_code ?? '',
      agent_name: user?.name ?? '',
      year,
      // `imported_at` reflects when this YTD snapshot was LAST written. On a
      // corrective re-upload, the upsert preserves `created_at` and only
      // advances `updated_at`; using `updated_at` here keeps the FE's "when
      // was this data imported" reading correct after corrections.
      imported_at: ytd.updated_at,
      ace_ytd: Number(ytd.ace),
      noc_ytd: Number(ytd.noc),
      fyct_ytd: Number(ytd.fyct),
      fyct_pct: Number(ytd.fyct_pct),
      mdrt_shortage_fyct: Number(ytd.mdrt_shortage_fyct),
      fyc_ytd: Number(ytd.fyc),
      fyc_pct: Number(ytd.fyc_pct),
      mdrt_shortage_fyc: Number(ytd.mdrt_shortage_fyc),
      month_ace: monthAce,
      month_noc: monthNoc,
      month_fyct: monthFyct,
      month_fyc: monthFyc,
    };
  }
}

export const salesReportService = new SalesReportService();
export default salesReportService;
