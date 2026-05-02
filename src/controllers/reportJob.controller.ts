import 'multer';
import { NextFunction, Response } from 'express';

import {
  JobNotRetryableError,
  ReportJobNotFoundError,
} from '@src/models/errors/reportJob.errors';
import { RouteError } from '@src/models/errors/route.error';
import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import reportJobService from '@src/services/reportJob.service';
import { IReportJob } from '@src/types/reportJob.types';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface ICreateJobReq extends IBaseReq {
  body: { reportYear: number; reportMonth: number };
  file?: Express.Multer.File;
}

export interface ICreateJobRes extends IBaseRes {
  success: boolean;
  data: { jobId: string };
}

export interface ICompleteJobReq extends IBaseReq {
  params: { jobId: string };
  body: { status: 'success' | 'failed'; etl_result?: unknown; error?: string };
}

export interface IGetJobReq extends IBaseReq {
  params: { jobId: string };
}

export interface IGetJobRes extends IBaseRes {
  success: boolean;
  data: IReportJob;
}

export interface IRetryJobReq extends IBaseReq {
  params: { jobId: string };
}

/******************************************************************************
                            ReportJobController
******************************************************************************/

const ALLOWED_ROLES = ['admin', 'master_trainer', 'group_leader'];

class ReportJobController {
  async create(req: ICreateJobReq, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!ALLOWED_ROLES.includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }
      if (!req.file) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, 'file is required (multipart field name "file")'));
        return;
      }

      const job = await reportJobService.createJob({
        tenantId: req.user!.tenant_id,
        uploadedBy: req.user!.id,
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        reportYear: req.body.reportYear,
        reportMonth: req.body.reportMonth,
      });

      const body: ICreateJobRes = { success: true, data: { jobId: job.id } };
      res.status(HttpStatusCodes.ACCEPTED).json(body);
    } catch (error) {
      return handleControllerError('ReportJobController.create', error, next);
    }
  }

  async complete(req: ICompleteJobReq, res: Response, next: NextFunction): Promise<void> {
    try {
      const { jobId } = req.params;
      const { status, etl_result, error } = req.body;

      await reportJobService.completeJob({
        jobId,
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

  async getById(req: IGetJobReq, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!ALLOWED_ROLES.includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const job = await reportJobService.getJob(req.params.jobId);

      // Tenant isolation: a manager from tenant A must not see tenant B's jobs.
      // Admin client bypasses RLS, so we enforce it here.
      if (job.tenant_id !== req.user!.tenant_id) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

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

  async retry(req: IRetryJobReq, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!ALLOWED_ROLES.includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      // Tenant guard before the retry
      const existing = await reportJobService.getJob(req.params.jobId);
      if (existing.tenant_id !== req.user!.tenant_id) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      await reportJobService.retryJob(req.params.jobId);

      res.status(HttpStatusCodes.ACCEPTED).json({ success: true, data: { jobId: req.params.jobId } });
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
