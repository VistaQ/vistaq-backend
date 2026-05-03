import express, { Request, Response } from 'express';

import salesReportController, {
  IGetMyYearReportReq,
  IGetUploadAuditReq,
  IGetYearReportsReq,
} from '@src/controllers/salesReport.controller';
import { authenticate } from '@src/middleware/auth';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Inline query validators
******************************************************************************/

interface ValidationFailure {
  status: number;
  body: { message: string; errors: { path: string[]; message: string }[] };
}

function validateYear(raw: unknown): { ok: true; year: number } | ValidationFailure {
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return {
      status: HttpStatusCodes.BAD_REQUEST,
      body: {
        message: 'Validation failed',
        errors: [{ path: ['year'], message: 'Invalid year' }],
      },
    };
  }
  return { ok: true, year };
}

function validatePagination(
  rawPage: unknown,
  rawPageSize: unknown,
):
  | { ok: true; page: number; pageSize: number }
  | ValidationFailure {
  const page = rawPage === undefined ? 1 : Number(rawPage);
  if (!Number.isInteger(page) || page < 1) {
    return {
      status: HttpStatusCodes.BAD_REQUEST,
      body: {
        message: 'Validation failed',
        errors: [{ path: ['page'], message: 'Invalid page' }],
      },
    };
  }

  const pageSize = rawPageSize === undefined ? 50 : Number(rawPageSize);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
    return {
      status: HttpStatusCodes.BAD_REQUEST,
      body: {
        message: 'Validation failed',
        errors: [{ path: ['pageSize'], message: 'Invalid pageSize' }],
      },
    };
  }

  return { ok: true, page, pageSize };
}

function isValidationFailure(
  v: { ok: true } | ValidationFailure,
): v is ValidationFailure {
  return !('ok' in v);
}

function sendValidationFailure(res: Response, failure: ValidationFailure): void {
  res.status(failure.status).json(failure.body);
}

/******************************************************************************
                            Router
******************************************************************************/

const router = express.Router();

// GET /api/sales-reports?year= — manager-only list of per-agent year rollups.
router.get('/', authenticate, (req: Request, res: Response, next) => {
  const yearCheck = validateYear(req.query.year);
  if (isValidationFailure(yearCheck)) {
    sendValidationFailure(res, yearCheck);
    return;
  }
  return salesReportController.getYearReports(
    req as unknown as IGetYearReportsReq,
    res,
    next,
  );
});

// GET /api/sales-reports/me?year= — caller's own report. Any authenticated user.
router.get('/me', authenticate, (req: Request, res: Response, next) => {
  const yearCheck = validateYear(req.query.year);
  if (isValidationFailure(yearCheck)) {
    sendValidationFailure(res, yearCheck);
    return;
  }
  return salesReportController.getMyYearReport(
    req as unknown as IGetMyYearReportReq,
    res,
    next,
  );
});

// GET /api/sales-reports/uploads?year=&page=&pageSize= — manager-only audit list.
router.get('/uploads', authenticate, (req: Request, res: Response, next) => {
  const yearCheck = validateYear(req.query.year);
  if (isValidationFailure(yearCheck)) {
    sendValidationFailure(res, yearCheck);
    return;
  }
  const pagCheck = validatePagination(req.query.page, req.query.pageSize);
  if (isValidationFailure(pagCheck)) {
    sendValidationFailure(res, pagCheck);
    return;
  }
  return salesReportController.getUploadAudit(
    req as unknown as IGetUploadAuditReq,
    res,
    next,
  );
});

export default router;
