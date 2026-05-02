import express from 'express';
import { z } from 'zod';

import salesReportController, {
  IGetGroupReq,
  IGetGroupTrendReq,
  IUploadReportReq,
} from '@src/controllers/salesReport.controller';
import { authenticate } from '@src/middleware/auth';
import { validate } from '@src/middleware/validate';

/******************************************************************************
                            Zod Schemas
******************************************************************************/

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
] as const;

// rowData has fixed YTD keys + dynamic per-month keys (e.g. 'JANUARY ACE').
// Strict object would reject the per-month keys, so we use a record with optional fixed fields.
const etlRowDataSchema = z.record(z.string(), z.number().optional());

const etlRecordSchema = z.object({
  agentCode: z.string().min(1),
  rowData: etlRowDataSchema,
}).strict();

const etlResultSchema = z.object({
  source: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  rows_loaded: z.number().int().nonnegative(),
  months_detected: z.array(z.enum(MONTH_NAMES)).min(1),
  records: z.array(etlRecordSchema).min(1),
}).strict();

export const uploadReportSchema = z.object({
  etlResult: etlResultSchema,
}).strict();

/******************************************************************************
                            Router
******************************************************************************/

const router = express.Router();

router.post(
  '/upload',
  authenticate,
  validate(uploadReportSchema),
  (req, res, next) =>
    salesReportController.upload(req as unknown as IUploadReportReq, res, next),
);

router.get('/group', authenticate, (req, res, next) => {
  // Lightweight inline query validation: year/month must parse as integers in valid ranges
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    res.status(400).json({ message: 'Validation failed', errors: [{ path: ['year'], message: 'Invalid year' }] });
    return;
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    res.status(400).json({ message: 'Validation failed', errors: [{ path: ['month'], message: 'Invalid month' }] });
    return;
  }
  return salesReportController.getGroup(req as unknown as IGetGroupReq, res, next);
});

router.get('/group/trend', authenticate, (req, res, next) => {
  const year = Number(req.query.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    res.status(400).json({ message: 'Validation failed', errors: [{ path: ['year'], message: 'Invalid year' }] });
    return;
  }
  return salesReportController.getGroupTrend(req as unknown as IGetGroupTrendReq, res, next);
});

export default router;
