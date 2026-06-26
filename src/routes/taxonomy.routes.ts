import express from 'express';
import { z } from 'zod';

import taxonomyController, {
  ICreateTaxonomyReq,
  IDeleteTaxonomyReq,
  IUpdateTaxonomyReq,
} from '@src/controllers/taxonomy.controller';
import { authenticate } from '@src/middleware/auth';
import { validate } from '@src/middleware/validate';
import { IBaseReq } from '@src/models/interfaces/base.interface';

/******************************************************************************
                            Zod Schemas
******************************************************************************/

export const createTaxonomySchema = z
  .object({
    type: z.string().min(1),
    value: z.string().min(1),
    sort_order: z.number().int().optional(),
  })
  .strict();

export const updateTaxonomySchema = z
  .object({
    value: z.string().min(1).optional(),
    sort_order: z.number().int().optional(),
  })
  .strict()
  .refine((d) => d.value !== undefined || d.sort_order !== undefined, {
    message: 'At least one of value or sort_order must be provided',
  });

/******************************************************************************
                            Router
******************************************************************************/

const router = express.Router();

router.get(
  '/',
  authenticate,
  (req, res, next) =>
    taxonomyController.getAll(req as unknown as IBaseReq, res, next),
);

router.post(
  '/',
  authenticate,
  validate(createTaxonomySchema),
  (req, res, next) =>
    taxonomyController.create(req as unknown as ICreateTaxonomyReq, res, next),
);

router.put(
  '/:id',
  authenticate,
  validate(updateTaxonomySchema),
  (req, res, next) =>
    taxonomyController.update(req as unknown as IUpdateTaxonomyReq, res, next),
);

router.delete(
  '/:id',
  authenticate,
  (req, res, next) =>
    taxonomyController.delete(req as unknown as IDeleteTaxonomyReq, res, next),
);

export default router;
