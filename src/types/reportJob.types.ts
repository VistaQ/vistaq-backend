
export interface ReportJobIns {
  tenant_id?: string;
  uploaded_by: string;
  storage_path: string;
  file_name: string;
  report_year: number;
  report_month: number;
}

export type ReportJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface IReportJob {
  id: string;
  reference: string;
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
  reference: string;
  status: 'success' | 'failed';
  etlResult?: unknown;
  error?: string;
}

export interface IEtlKickoffParams {
  reference: string;
  fileUrl: string;
  callbackUrl: string;
}
