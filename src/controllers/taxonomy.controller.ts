import { NextFunction, Response } from 'express';
import { z } from 'zod';

import {
  TaxonomyConflictError,
  TaxonomyNotFoundError,
} from '@src/models/errors/taxonomy.errors';
import { RouteError } from '@src/models/errors/route.error';
import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import taxonomyService from '@src/services/taxonomy.service';
import { ITaxonomy } from '@src/types/taxonomy.types';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface ICreateTaxonomyReq extends IBaseReq {
  body: {
    type: string;
    value: string;
    sort_order?: number;
  };
}

export interface IUpdateTaxonomyReq extends IBaseReq {
  params: {
    id: string;
  };
  body: {
    value?: string;
    sort_order?: number;
  };
}

export interface IDeleteTaxonomyReq extends IBaseReq {
  params: {
    id: string;
  };
}

export interface IGetTaxonomiesRes extends IBaseRes {
  success: boolean;
  data: ITaxonomy[];
}

export interface ICreateTaxonomyRes extends IBaseRes {
  success: boolean;
  data: ITaxonomy;
}

export interface IUpdateTaxonomyRes extends IBaseRes {
  success: boolean;
  data: ITaxonomy;
}

const getTaxonomiesQuerySchema = z.object({
  type: z.string().min(1).optional(),
});

/******************************************************************************
                            TaxonomyController
******************************************************************************/

class TaxonomyController {
  async getAll(
    req: IBaseReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const parsed = getTaxonomiesQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          message: 'Validation failed',
          errors: parsed.error.issues,
        });
        return;
      }

      const token = req.headers['authorization']!.slice(7);

      const data = await taxonomyService.getTaxonomies({
        tenantId: req.user!.tenant_id,
        type: parsed.data.type,
        token,
      });

      const responseBody: IGetTaxonomiesRes = {
        success: true,
        data,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('TaxonomyController.getAll', error, next);
    }
  }

  async create(
    req: ICreateTaxonomyReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (req.user!.role !== 'admin') {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const token = req.headers['authorization']!.slice(7);
      const { type, value, sort_order } = req.body;

      const data = await taxonomyService.createTaxonomy({
        tenantId: req.user!.tenant_id,
        type,
        value,
        sortOrder: sort_order,
        token,
      });

      const responseBody: ICreateTaxonomyRes = {
        success: true,
        data,
      };

      res.status(HttpStatusCodes.CREATED).json(responseBody);
    } catch (error) {
      if (error instanceof TaxonomyConflictError) {
        next(new RouteError(HttpStatusCodes.CONFLICT, error.message));
        return;
      }
      return handleControllerError('TaxonomyController.create', error, next);
    }
  }

  async update(
    req: IUpdateTaxonomyReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (req.user!.role !== 'admin') {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const token = req.headers['authorization']!.slice(7);
      const { id } = req.params;
      const { value, sort_order } = req.body;

      const data = await taxonomyService.updateTaxonomy({
        id,
        tenantId: req.user!.tenant_id,
        value,
        sortOrder: sort_order,
        token,
      });

      const responseBody: IUpdateTaxonomyRes = {
        success: true,
        data,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof TaxonomyNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }
      if (error instanceof TaxonomyConflictError) {
        next(new RouteError(HttpStatusCodes.CONFLICT, error.message));
        return;
      }
      return handleControllerError('TaxonomyController.update', error, next);
    }
  }

  async delete(
    req: IDeleteTaxonomyReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (req.user!.role !== 'admin') {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const token = req.headers['authorization']!.slice(7);
      const { id } = req.params;

      await taxonomyService.deleteTaxonomy({
        id,
        tenantId: req.user!.tenant_id,
        token,
      });

      res.status(HttpStatusCodes.NO_CONTENT).send();
    } catch (error) {
      if (error instanceof TaxonomyNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }
      return handleControllerError('TaxonomyController.delete', error, next);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const taxonomyController = new TaxonomyController();
export default taxonomyController;
