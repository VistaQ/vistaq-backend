import { NextFunction, Response } from 'express';

import { RouteError } from '@src/models/errors/route.error';
import {
  InvalidEtlResultError,
  NonConsecutiveUploadError,
} from '@src/models/errors/salesReport.errors';
import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import salesReportService from '@src/services/salesReport.service';
import scopeService from '@src/services/scope.service';
import {
  IEtlResult,
  IPaginatedUploadAudit,
  ISalesReport,
  IUploadResult,
} from '@src/types/salesReport.types';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface IUploadReportReq extends IBaseReq {
  body: {
    report_year: number;
    report_month: number;
    etlResult: IEtlResult;
  };
}

export interface IUploadReportRes extends IBaseRes {
  success: boolean;
  data: IUploadResult;
}

/**
 * Manual-mode ingest from the local ETL script. Body fields use snake_case to
 * mirror the ETL JSON style. Authenticated by INTERNAL_API_KEY (no JWT), so
 * `tenant_id` is supplied in the body and `uploaded_by` is intentionally
 * unattributed (null).
 */
export interface IIngestReportReq extends IBaseReq {
  body: {
    tenant_id: string;
    report_year: number;
    report_month: number;
    etl_result: IEtlResult;
  };
}

export interface IIngestReportRes extends IBaseRes {
  success: boolean;
  data: IUploadResult;
}

export interface IGetYearReportsReq extends IBaseReq {
  query: { year: string };
}

export interface IGetYearReportsRes extends IBaseRes {
  success: boolean;
  data: ISalesReport[];
}

export interface IGetMyYearReportReq extends IBaseReq {
  query: { year: string };
}

export interface IGetMyYearReportRes extends IBaseRes {
  success: boolean;
  data: ISalesReport;
}

export interface IGetUploadAuditReq extends IBaseReq {
  query: { year: string; page?: string; pageSize?: string };
}

export interface IGetUploadAuditRes extends IBaseRes {
  success: boolean;
  data: IPaginatedUploadAudit['data'];
  meta: IPaginatedUploadAudit['meta'];
}

/******************************************************************************
                            SalesReportController
******************************************************************************/

// Roles permitted to upload a sales report. Upload remains gated on
// `group_leader` and the two senior manager roles — trainers have read access
// (audit + scoped per-agent rollup) but are not entitled to publish data.
const UPLOAD_ALLOWED_ROLES = ['admin', 'master_trainer', 'group_leader'];

// Roles permitted to view the tenant-wide upload-audit list. Uploads are not
// group-bound (every xlsx covers the whole tenant), so any of the four
// manager-tier roles can see the audit. `agent` continues to get 403.
const AUDIT_ALLOWED_ROLES = [
  'admin',
  'master_trainer',
  'trainer',
  'group_leader',
];

class SalesReportController {
  async upload(
    req: IUploadReportReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!UPLOAD_ALLOWED_ROLES.includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const result = await salesReportService.uploadReport({
        etlResult: req.body.etlResult,
        tenantId: req.user!.tenant_id,
        uploadedBy: req.user!.id,
        reportYear: req.body.report_year,
        reportMonth: req.body.report_month,
      });

      const responseBody: IUploadReportRes = { success: true, data: result };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof InvalidEtlResultError) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, error.message));
        return;
      }
      if (error instanceof NonConsecutiveUploadError) {
        next(new RouteError(HttpStatusCodes.CONFLICT, error.message));
        return;
      }
      return handleControllerError('SalesReportController.upload', error, next);
    }
  }

  async ingest(
    req: IIngestReportReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await salesReportService.uploadReport({
        etlResult: req.body.etl_result,
        tenantId: req.body.tenant_id,
        uploadedBy: null,
        reportYear: req.body.report_year,
        reportMonth: req.body.report_month,
      });

      const responseBody: IIngestReportRes = { success: true, data: result };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof InvalidEtlResultError) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, error.message));
        return;
      }
      if (error instanceof NonConsecutiveUploadError) {
        next(new RouteError(HttpStatusCodes.CONFLICT, error.message));
        return;
      }
      return handleControllerError('SalesReportController.ingest', error, next);
    }
  }

  async getYearReports(
    req: IGetYearReportsReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const scope = await scopeService.resolveSalesReportScope({
        userId: req.user!.id,
        tenantId: req.user!.tenant_id,
        role: req.user!.role,
      });

      if (scope.type === 'forbidden') {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const year = Number(req.query.year);
      const data = await salesReportService.getYearReports({
        tenantId: req.user!.tenant_id,
        year,
        scope,
      });

      const responseBody: IGetYearReportsRes = { success: true, data };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError(
        'SalesReportController.getYearReports',
        error,
        next,
      );
    }
  }

  async getMyYearReport(
    req: IGetMyYearReportReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const year = Number(req.query.year);
      const data = await salesReportService.getMyYearReport({
        tenantId: req.user!.tenant_id,
        userId: req.user!.id,
        year,
      });

      if (!data) {
        res
          .status(HttpStatusCodes.NOT_FOUND)
          .json({ message: 'No sales report for this year' });
        return;
      }

      const responseBody: IGetMyYearReportRes = { success: true, data };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError(
        'SalesReportController.getMyYearReport',
        error,
        next,
      );
    }
  }

  async getUploadAudit(
    req: IGetUploadAuditReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!AUDIT_ALLOWED_ROLES.includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const year = Number(req.query.year);
      const page = req.query.page !== undefined ? Number(req.query.page) : 1;
      const pageSize =
        req.query.pageSize !== undefined ? Number(req.query.pageSize) : 50;

      const result = await salesReportService.getUploadAudit({
        tenantId: req.user!.tenant_id,
        year,
        page,
        pageSize,
      });

      const responseBody: IGetUploadAuditRes = {
        success: true,
        data: result.data,
        meta: result.meta,
      };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError(
        'SalesReportController.getUploadAudit',
        error,
        next,
      );
    }
  }
}

const salesReportController = new SalesReportController();
export default salesReportController;
