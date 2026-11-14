import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { NextFunction, Response } from 'express';

import type {
  ICleanupOldReportFilesReq,
} from '@src/controllers/reportFileCleanup.controller';
import reportFileCleanupController from '@src/controllers/reportFileCleanup.controller';
import reportFileCleanupService from '@src/services/reportFileCleanup.service';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

vi.mock('@src/services/reportFileCleanup.service', () => ({
  __esModule: true,
  default: {
    cleanupOldReportFiles: vi.fn(),
  },
}));

const mkReq = (): ICleanupOldReportFilesReq =>
  ({}) as unknown as ICleanupOldReportFilesReq;

const mkRes = () => {
  const res = {} as Partial<Response>;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
};

beforeEach(() => vi.resetAllMocks());

describe('ReportFileCleanupController.cleanupOldReportFiles', () => {
  it('delegates to the service and returns 200 with the counts', async () => {
    (
      reportFileCleanupService.cleanupOldReportFiles as Mock
    ).mockResolvedValue({ deletedCount: 7, failedCount: 1 });

    const res = mkRes();
    const next = vi.fn() as unknown as NextFunction;

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
      reportFileCleanupService.cleanupOldReportFiles as Mock
    ).mockRejectedValue(new Error('repo blew up'));

    const res = mkRes();
    const next = vi.fn() as unknown as NextFunction;

    await reportFileCleanupController.cleanupOldReportFiles(
      mkReq(),
      res,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
