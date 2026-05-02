import express from 'express';
import multer from 'multer';
import { z } from 'zod';

import reportJobController, {
  ICompleteJobReq,
  ICreateJobReq,
  IGetJobReq,
  IRetryJobReq,
} from '@src/controllers/reportJob.controller';
import { authenticate } from '@src/middleware/auth';
import { internalKey } from '@src/middleware/internalKey';
import { validate } from '@src/middleware/validate';
import EnvVars from '@src/utils/env';

/******************************************************************************
                            Multer
******************************************************************************/

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: EnvVars.ReportFileMaxBytes },
});

/******************************************************************************
                            Zod Schemas
******************************************************************************/

// Multipart form fields arrive as strings; coerce + validate.
const createJobSchema = z.object({
  reportYear: z.coerce.number().int().min(2000).max(2100),
  reportMonth: z.coerce.number().int().min(1).max(12),
});

const completeJobSchema = z
  .object({
    status: z.enum(['success', 'failed']),
    etl_result: z.unknown().optional(),
    error: z.string().optional(),
  })
  .refine(
    (d) => (d.status === 'success' ? d.etl_result !== undefined : d.error !== undefined),
    { message: 'success requires etl_result; failed requires error' },
  );

/******************************************************************************
                            Router
******************************************************************************/

const router = express.Router();

router.post(
  '/',
  authenticate,
  upload.single('file'),
  validate(createJobSchema),
  (req, res, next) => reportJobController.create(req as unknown as ICreateJobReq, res, next),
);

// Internal callback from the ETL service. Authed by shared key, NOT user JWT.
router.post(
  '/:jobId/complete',
  internalKey,
  validate(completeJobSchema),
  (req, res, next) => reportJobController.complete(req as unknown as ICompleteJobReq, res, next),
);

router.get('/:jobId', authenticate, (req, res, next) =>
  reportJobController.getById(req as unknown as IGetJobReq, res, next),
);

router.post('/:jobId/retry', authenticate, (req, res, next) =>
  reportJobController.retry(req as unknown as IRetryJobReq, res, next),
);

export default router;
