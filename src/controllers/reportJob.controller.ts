import type { NextFunction, Request, Response } from 'express';
import 'multer';

import {
  JobNotRetryableError,
  ReportJobNotFoundError,
} from '@src/models/errors/reportJob.errors';
import { RouteError } from '@src/models/errors/route.error';
import { NonConsecutiveUploadError } from '@src/models/errors/salesReport.errors';
import type { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import reportJobService from '@src/services/reportJob.service';
import type { IReportJob } from '@src/types/reportJob.types';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';
import { baseUrlOf } from '@src/utils/requestUrl';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface ICreateJobReq extends IBaseReq {
  body: { reportYear: number; reportMonth: number };
  file?: Express.Multer.File;
}

export interface ICreateJobRes extends IBaseRes {
  success: boolean;
  data: { reference: string };
}

export interface ICompleteJobReq extends IBaseReq {
  params: { reference: string };
  body: { status: 'success' | 'failed'; etl_result?: unknown; error?: string };
}

export interface IGetJobReq extends IBaseReq {
  params: { reference: string };
}

export interface IGetJobRes extends IBaseRes {
  success: boolean;
  data: IReportJob;
}

export interface IRetryJobReq extends IBaseReq {
  params: { reference: string };
}

/******************************************************************************
                            ReportJobController
******************************************************************************/

const ALLOWED_ROLES = ['admin', 'master_trainer', 'group_leader'];

class ReportJobController {
  async create(
    req: ICreateJobReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!ALLOWED_ROLES.includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }
      if (!req.file) {
        next(
          new RouteError(
            HttpStatusCodes.BAD_REQUEST,
            'file is required (multipart field name "file")',
          ),
        );
        return;
      }

      const job = await reportJobService.createJob({
        uploadedBy: req.user!.id,
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        reportYear: req.body.reportYear,
        reportMonth: req.body.reportMonth,
        callbackBaseUrl: baseUrlOf(req as unknown as Request),
      });

      const body: ICreateJobRes = {
        success: true,
        data: { reference: job.reference },
      };
      res.status(HttpStatusCodes.ACCEPTED).json(body);
    } catch (error) {
      if (error instanceof NonConsecutiveUploadError) {
        next(new RouteError(HttpStatusCodes.CONFLICT, error.message));
        return;
      }
      return handleControllerError('ReportJobController.create', error, next);
    }
  }

  async complete(
    req: ICompleteJobReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { reference } = req.params;
      const { status, etl_result, error } = req.body;

      await reportJobService.completeJob({
        reference,
        status,
        etlResult: etl_result,
        error,
      });

      res.status(HttpStatusCodes.NO_CONTENT).end();
    } catch (error) {
      if (error instanceof ReportJobNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }
      return handleControllerError('ReportJobController.complete', error, next);
    }
  }

  async getById(
    req: IGetJobReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!ALLOWED_ROLES.includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const job = await reportJobService.getJob(req.params.reference);
      const body: IGetJobRes = { success: true, data: job };
      res.status(HttpStatusCodes.OK).json(body);
    } catch (error) {
      if (error instanceof ReportJobNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }
      return handleControllerError('ReportJobController.getById', error, next);
    }
  }

  async retry(
    req: IRetryJobReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!ALLOWED_ROLES.includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      await reportJobService.retryJob(
        req.params.reference,
        baseUrlOf(req as unknown as Request),
      );

      res
        .status(HttpStatusCodes.ACCEPTED)
        .json({ success: true, data: { reference: req.params.reference } });
    } catch (error) {
      if (error instanceof ReportJobNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }
      if (error instanceof JobNotRetryableError) {
        next(new RouteError(HttpStatusCodes.CONFLICT, error.message));
        return;
      }
      return handleControllerError('ReportJobController.retry', error, next);
    }
  }
}

const reportJobController = new ReportJobController();
export default reportJobController;
