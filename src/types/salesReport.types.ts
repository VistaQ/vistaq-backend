import { Database } from '@src/types/database.types';

/******************************************************************************
                            Raw row types (Repository-only)
******************************************************************************/

export type UploadBatchRow =
  Database['public']['Tables']['upload_batches']['Row'];
export type UploadBatchIns =
  Database['public']['Tables']['upload_batches']['Insert'];
export type SalesReportYtdRow =
  Database['public']['Tables']['sales_report_ytd']['Row'];
export type SalesReportYtdIns =
  Database['public']['Tables']['sales_report_ytd']['Insert'];
export type SalesReportMtdRow =
  Database['public']['Tables']['sales_report_mtd']['Row'];
export type SalesReportMtdIns =
  Database['public']['Tables']['sales_report_mtd']['Insert'];
export type SalesReportMtdFycRow =
  Database['public']['Views']['sales_report_mtd_fyc']['Row'];

/******************************************************************************
                            Domain interfaces (Service/Controller)
******************************************************************************/

export type UploadStatus = 'success' | 'partial' | 'failed';

export interface IUploadBatch {
  id: string;
  tenant_id: string;
  /**
   * Nullable: manual ETL ingests (POST /api/reports/ingest) authenticate via
   * ETL_API_KEY rather than a user JWT, so there is no uploader to
   * attribute. Standard JWT-authenticated uploads always populate this field.
   */
  uploaded_by: string | null;
  year: number;
  month: number;
  file_name: string;
  rows_loaded: number;
  rows_skipped: number;
  status: UploadStatus;
  created_at: string;
}

/**
 * Per-agent annual sales-report rollup. Combines the latest YTD snapshot of
 * the year with monthly arrays sourced from `sales_report_mtd` (ACE/NOC) and
 * the `sales_report_mtd_fyc` view (FYC/FYCt MTD derived via LAG()).
 *
 * `imported_at` is the `sales_report_ytd.updated_at` of the latest YTD row —
 * advances on every re-upload to reflect the most recent ingest time.
 */
export interface ISalesReport {
  id: string;
  agent_id: string;
  agent_code: string;
  agent_name: string;
  year: number;
  imported_at: string;
  ace_ytd: number;
  noc_ytd: number;
  fyct_ytd: number;
  fyct_pct: number;
  mdrt_shortage_fyct: number;
  fyc_ytd: number;
  fyc_pct: number;
  mdrt_shortage_fyc: number;
  /** 12-element array, index 0 = January, index 11 = December. */
  month_ace: number[];
  /** 12-element array, index 0 = January, index 11 = December. */
  month_noc: number[];
  /** 12-element array, index 0 = January, index 11 = December. */
  month_fyct: number[];
  /** 12-element array, index 0 = January, index 11 = December. */
  month_fyc: number[];
}

/**
 * Audit list entry for past uploads. `uploader_name` is `users.name` joined via
 * `upload_batches.uploaded_by`; null when the upload was manual-mode (no JWT).
 * `imported_at` maps from `upload_batches.created_at` for FE-friendly naming.
 */
export interface IUploadAuditEntry {
  id: string;
  year: number;
  month: number;
  file_name: string;
  rows_loaded: number;
  rows_skipped: number;
  status: UploadStatus;
  uploader_name: string | null;
  imported_at: string;
}

export interface IPaginatedUploadAudit {
  data: IUploadAuditEntry[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface IUploadResult {
  batchId: string;
  processed: number;
  skipped: number;
  errors: { agentCode: string; reason: string }[];
}

/******************************************************************************
                            ETL input shape
******************************************************************************/

/**
 * `rowData` is a bag of column-name → value pairs as produced by the ETL pipeline.
 * Recognised numeric keys (the ones the service reads) include the YTD totals
 * (`'ACE (YTD)'`, `'NOC (YTD)'`, `'FYCT (YTD)'`, `'% FYCT (YTD)'`,
 * `'MDRT SHORTAGE FYCT'`, `'FYC (YTD)'`, `'% FYC (YTD)'`, `'MDRT SHORTAGE FYC'`)
 * and per-month ACE/NOC pairs (`'JANUARY ACE'`, `'JANUARY NOC'`, etc).
 *
 * The ETL also includes string columns (e.g. `'AGENT CODE'`, `'AGENT NAME'`) and
 * may include `null` placeholders. We accept everything and coerce per-key when
 * building DB rows. Unknown/non-numeric values default to 0.
 */
export type IEtlRowData = Record<string, unknown>;

export interface IEtlRecord {
  agentCode: string;
  rowData: IEtlRowData;
}

export interface IEtlResult {
  source: string;
  created_at: string;
  rows_loaded: number;
  months_detected: string[];
  records: IEtlRecord[];
}

export const MONTH_MAP: Record<string, number> = {
  JANUARY: 1,
  FEBRUARY: 2,
  MARCH: 3,
  APRIL: 4,
  MAY: 5,
  JUNE: 6,
  JULY: 7,
  AUGUST: 8,
  SEPTEMBER: 9,
  OCTOBER: 10,
  NOVEMBER: 11,
  DECEMBER: 12,
};
