import { NextFunction, Response } from 'express';

import { RouteError } from '@src/models/errors/route.error';
import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import pointConfigService from '@src/services/pointConfig.service';
import { IPointConfig } from '@src/types/pointConfig.types';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface ICreatePointConfigReq extends IBaseReq {
  body: {
    activity: string;
    category: string;
    points: number;
  };
}

export interface ICreatePointConfigRes extends IBaseRes {
  success: boolean;
  data: IPointConfig;
}

export interface IGetPointConfigsRes extends IBaseRes {
  success: boolean;
  data: IPointConfig[];
}

export interface IUpdatePointConfigReq extends IBaseReq {
  params: {
    activity: string;
  };
  body: {
    category?: string;
    points: number;
  };
}

export interface IUpdatePointConfigRes extends IBaseRes {
  success: boolean;
  data: IPointConfig;
}

/******************************************************************************
                            PointConfigController
******************************************************************************/

class PointConfigController {
  async create(
    req: ICreatePointConfigReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (req.user!.role !== 'admin') {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const token = req.headers['authorization']!.slice(7);
      const { activity, category, points } = req.body;

      const pointConfig = await pointConfigService.createPointConfig({
        activity,
        category,
        points,
        tenantId: req.user!.tenant_id,
        token,
      });

      const responseBody: ICreatePointConfigRes = {
        success: true,
        data: pointConfig,
      };

      res.status(HttpStatusCodes.CREATED).json(responseBody);
    } catch (error) {
      if (error instanceof RouteError) {
        next(error);
        return;
      }
      return handleControllerError('PointConfigController.create', error, next);
    }
  }

  async getAll(
    req: IBaseReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (req.user!.role !== 'admin') {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const token = req.headers['authorization']!.slice(7);

      const configs = await pointConfigService.getPointConfigs(
        req.user!.tenant_id,
        token,
      );

      const responseBody: IGetPointConfigsRes = {
        success: true,
        data: configs,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof RouteError) {
        next(error);
        return;
      }
      return handleControllerError('PointConfigController.getAll', error, next);
    }
  }

  async update(
    req: IUpdatePointConfigReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (req.user!.role !== 'admin') {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const token = req.headers['authorization']!.slice(7);
      const { activity } = req.params;
      const { category, points } = req.body;

      const updatedConfig = await pointConfigService.updatePointConfig({
        activity,
        category,
        points,
        tenantId: req.user!.tenant_id,
        token,
      });

      const responseBody: IUpdatePointConfigRes = {
        success: true,
        data: updatedConfig,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof RouteError) {
        next(error);
        return;
      }
      return handleControllerError('PointConfigController.update', error, next);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const pointConfigController = new PointConfigController();
export default pointConfigController;
