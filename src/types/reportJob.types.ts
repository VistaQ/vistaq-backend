import { Database } from '@src/types/database.types';

export type ReportJobRow = Database['public']['Tables']['report_jobs']['Row'];
export type ReportJobIns = Database['public']['Tables']['report_jobs']['Insert'];
export type ReportJobUpd = Database['public']['Tables']['report_jobs']['Update'];

export type ReportJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface IReportJob {
  id: string;
  tenant_id: string;
  uploaded_by: string;
  storage_path: string;
  file_name: string;
  report_year: number;
  report_month: number;
  status: ReportJobStatus;
  batch_id: string | null;
  result: unknown;
  error_message: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}

export interface ICreateJobParams {
  tenantId: string;
  uploadedBy: string;
  fileBuffer: Buffer;
  fileName: string;
  reportYear: number;
  reportMonth: number;
}

export interface ICompleteJobParams {
  jobId: string;
  status: 'success' | 'failed';
  etlResult?: unknown;
  error?: string;
}

export interface IEtlKickoffParams {
  jobId: string;
  fileUrl: string;
  callbackUrl: string;
}
