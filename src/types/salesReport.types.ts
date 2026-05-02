import { Database } from '@src/types/database.types';

/******************************************************************************
                            Raw row types (Repository-only)
******************************************************************************/

export type UploadBatchRow   = Database['public']['Tables']['upload_batches']['Row'];
export type UploadBatchIns   = Database['public']['Tables']['upload_batches']['Insert'];
export type SalesReportYtdRow = Database['public']['Tables']['sales_report_ytd']['Row'];
export type SalesReportYtdIns = Database['public']['Tables']['sales_report_ytd']['Insert'];
export type SalesReportMtdRow = Database['public']['Tables']['sales_report_mtd']['Row'];
export type SalesReportMtdIns = Database['public']['Tables']['sales_report_mtd']['Insert'];
export type SalesReportMtdFycRow =
  Database['public']['Views']['sales_report_mtd_fyc']['Row'];

/******************************************************************************
                            Domain interfaces (Service/Controller)
******************************************************************************/

export interface IUploadBatch {
  id: string;
  tenant_id: string;
  uploaded_by: string;
  year: number;
  month: number;
  file_name: string;
  rows_loaded: number;
  created_at: string;
}

export interface IUploadResult {
  batchId: string;
  processed: number;
  skipped: number;
  errors: { agentCode: string; reason: string }[];
}

export interface IGroupSummary {
  fyct_ytd: number;
  fyc_ytd: number;
  ace_ytd: number;
  noc_ytd: number;
  fyc_pct_avg: number;
  fyct_pct_avg: number;
  agent_count: number;
  noc_per_agent: number;
}

export interface IGroupAgent {
  user_id: string;
  name: string;
  agent_code: string;
  fyct: number;
  fyc: number;
  fyc_pct: number;
  ace: number;
  noc: number;
  mdrt_shortage_fyc: number;
}

export interface IGroupReport {
  summary: IGroupSummary;
  agents: IGroupAgent[];
}

export interface IGroupTrendPoint {
  month: number;
  fyc_mtd: number;
  fyct_mtd: number;
}

/******************************************************************************
                            ETL input shape
******************************************************************************/

/**
 * The keys present in `rowData` for each agent in an `etlResult`.
 * Per-month ACE/NOC are uppercase month name + ' ACE' or ' NOC',
 * e.g. 'JANUARY ACE', 'JANUARY NOC'.
 */
export interface IEtlRowData {
  'ACE (YTD)'?: number;
  'NOC (YTD)'?: number;
  'FYCT (YTD)'?: number;
  '% FYCT (YTD)'?: number;
  'MDRT SHORTAGE FYCT'?: number;
  'FYC (YTD)'?: number;
  '% FYC (YTD)'?: number;
  'MDRT SHORTAGE FYC'?: number;
  [key: string]: number | undefined;
}

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
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};
