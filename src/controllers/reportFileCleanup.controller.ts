import { NextFunction, Response } from 'express';

import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import reportFileCleanupService from '@src/services/reportFileCleanup.service';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export type ICleanupOldReportFilesReq = IBaseReq;

export interface ICleanupOldReportFilesRes extends IBaseRes {
  success: boolean;
  data: {
    deletedCount: number;
    failedCount: number;
  };
}

/******************************************************************************
                        ReportFileCleanupController

  Service-to-service endpoint for retention-driven cleanup of raw report
  files in Storage. Authentication is handled at the route level by the
  `internalKey` middleware — there is no JWT on these requests.
******************************************************************************/

class ReportFileCleanupController {
  async cleanupOldReportFiles(
    _req: ICleanupOldReportFilesReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await reportFileCleanupService.cleanupOldReportFiles();

      const body: ICleanupOldReportFilesRes = {
        success: true,
        data: {
          deletedCount: result.deletedCount,
          failedCount: result.failedCount,
        },
      };
      res.status(HttpStatusCodes.OK).json(body);
    } catch (error) {
      return handleControllerError(
        'ReportFileCleanupController.cleanupOldReportFiles',
        error,
        next,
      );
    }
  }
}

export const reportFileCleanupController = new ReportFileCleanupController();
export default reportFileCleanupController;
