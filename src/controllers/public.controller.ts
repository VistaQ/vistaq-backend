import { NextFunction, Response } from 'express';

import { TenantNotFoundError } from '@src/models/errors/auth.errors';
import { RouteError } from '@src/models/errors/route.error';
import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import groupService from '@src/services/group.service';
import loggingService from '@src/services/logging.service';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface IPublicGroupItem {
  id: string;
  name: string;
}

export interface IGetPublicGroupsRes extends IBaseRes {
  success: boolean;
  data: IPublicGroupItem[];
}

/******************************************************************************
                            PublicController
******************************************************************************/

class PublicController {
  async getGroups(
    req: IBaseReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const tenantSlug = req.headers['x-tenant-slug'];

      if (!tenantSlug || typeof tenantSlug !== 'string') {
        loggingService.error(
          'PublicController.getGroups — missing or invalid X-Tenant-Slug header',
        );
        next(
          new RouteError(
            HttpStatusCodes.BAD_REQUEST,
            'X-Tenant-Slug header is required',
          ),
        );
        return;
      }

      const groups = await groupService.getActiveGroupsByTenantSlug(tenantSlug);

      const responseBody: IGetPublicGroupsRes = {
        success: true,
        data: groups,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof TenantNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }

      return handleControllerError('PublicController.getGroups', error, next);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const publicController = new PublicController();
export default publicController;
