import express from 'express';

import reportFileCleanupController, {
  ICleanupOldReportFilesReq,
} from '@src/controllers/reportFileCleanup.controller';
import { internalKey } from '@src/middleware/internalKey';

/******************************************************************************
                            Internal Routes (/api/internal/*)

  Service-to-service endpoints authenticated by INTERNAL_API_KEY rather than
  user JWTs. Designed to be invoked by external schedulers (Vercel Cron,
  GitHub Actions, etc.) — there is no human user behind these calls.
******************************************************************************/

const router = express.Router();

router.post(
  '/cleanup-old-report-files',
  internalKey,
  (req, res, next) =>
    reportFileCleanupController.cleanupOldReportFiles(
      req as unknown as ICleanupOldReportFilesReq,
      res,
      next,
    ),
);

export default router;
