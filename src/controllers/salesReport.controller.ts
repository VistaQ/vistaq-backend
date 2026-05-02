import { NextFunction, Response } from 'express';

import {
  InvalidEtlResultError,
  UnknownReportMonthError,
} from '@src/models/errors/salesReport.errors';
import { RouteError } from '@src/models/errors/route.error';
import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import salesReportService from '@src/services/salesReport.service';
import {
  IEtlResult,
  IGroupReport,
  IGroupTrendPoint,
  IUploadResult,
} from '@src/types/salesReport.types';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface IUploadReportReq extends IBaseReq {
  body: { etlResult: IEtlResult };
}

export interface IUploadReportRes extends IBaseRes {
  success: boolean;
  data: IUploadResult;
}

export interface IGetGroupReq extends IBaseReq {
  query: { year: string; month: string };
}

export interface IGetGroupRes extends IBaseRes {
  success: boolean;
  data: IGroupReport;
}

export interface IGetGroupTrendReq extends IBaseReq {
  query: { year: string };
}

export interface IGetGroupTrendRes extends IBaseRes {
  success: boolean;
  data: IGroupTrendPoint[];
}

/******************************************************************************
                            SalesReportController
******************************************************************************/

const ALLOWED_ROLES = ['admin', 'master_trainer', 'group_leader'];

class SalesReportController {
  async upload(
    req: IUploadReportReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!ALLOWED_ROLES.includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const result = await salesReportService.uploadReport({
        etlResult: req.body.etlResult,
        tenantId: req.user!.tenant_id,
        uploadedBy: req.user!.id,
      });

      const responseBody: IUploadReportRes = { success: true, data: result };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof InvalidEtlResultError) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, error.message));
        return;
      }
      if (error instanceof UnknownReportMonthError) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, error.message));
        return;
      }
      return handleControllerError('SalesReportController.upload', error, next);
    }
  }

  async getGroup(
    req: IGetGroupReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!ALLOWED_ROLES.includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const year = Number(req.query.year);
      const month = Number(req.query.month);
      const data = await salesReportService.getGroupSummary({
        tenantId: req.user!.tenant_id,
        year,
        month,
      });

      const responseBody: IGetGroupRes = { success: true, data };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('SalesReportController.getGroup', error, next);
    }
  }

  async getGroupTrend(
    req: IGetGroupTrendReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!ALLOWED_ROLES.includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const year = Number(req.query.year);
      const data = await salesReportService.getGroupTrend({
        tenantId: req.user!.tenant_id,
        year,
      });

      const responseBody: IGetGroupTrendRes = { success: true, data };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('SalesReportController.getGroupTrend', error, next);
    }
  }
}

const salesReportController = new SalesReportController();
export default salesReportController;
