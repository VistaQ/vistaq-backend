import { NextFunction, Response } from 'express';

import reportFileCleanupController, {
  ICleanupOldReportFilesReq,
} from '@src/controllers/reportFileCleanup.controller';
import reportFileCleanupService from '@src/services/reportFileCleanup.service';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

jest.mock('@src/services/reportFileCleanup.service', () => ({
  __esModule: true,
  default: {
    cleanupOldReportFiles: jest.fn(),
  },
}));

const mkReq = (): ICleanupOldReportFilesReq =>
  ({}) as unknown as ICleanupOldReportFilesReq;

const mkRes = () => {
  const res = {} as Partial<Response>;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

beforeEach(() => jest.resetAllMocks());

describe('ReportFileCleanupController.cleanupOldReportFiles', () => {
  it('delegates to the service and returns 200 with the counts', async () => {
    (
      reportFileCleanupService.cleanupOldReportFiles as jest.Mock
    ).mockResolvedValue({ deletedCount: 7, failedCount: 1 });

    const res = mkRes();
    const next = jest.fn() as unknown as NextFunction;

    await reportFileCleanupController.cleanupOldReportFiles(
      mkReq(),
      res,
      next,
    );

    expect(reportFileCleanupService.cleanupOldReportFiles).toHaveBeenCalledTimes(
      1,
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { deletedCount: 7, failedCount: 1 },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards unexpected errors via next() through the centralised handler', async () => {
    (
      reportFileCleanupService.cleanupOldReportFiles as jest.Mock
    ).mockRejectedValue(new Error('repo blew up'));

    const res = mkRes();
    const next = jest.fn() as unknown as NextFunction;

    await reportFileCleanupController.cleanupOldReportFiles(
      mkReq(),
      res,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
