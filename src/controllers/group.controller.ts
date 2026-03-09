import { NextFunction, Response } from 'express';

import {
  InvalidLeaderRoleError,
  InvalidTrainerRoleError,
  UserNotInTenantError,
} from '@src/models/errors/group.errors';
import { RouteError } from '@src/models/errors/route.error';
import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import loggingService from '@src/services/logging.service';
import groupService from '@src/services/group.service';
import { IGroup } from '@src/types/auth.types';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface ICreateGroupReq extends IBaseReq {
  body: {
    name: string;
    leader_id?: string;
    trainer_id?: string;
  };
}

export interface ICreateGroupRes extends IBaseRes {
  success: boolean;
  data: IGroup;
}

/******************************************************************************
                            GroupController
******************************************************************************/

class GroupController {
  async create(
    req: ICreateGroupReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      loggingService.info('GroupController.create called');

      if (req.user!.role !== 'admin') {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const token = req.headers['authorization']!.slice(7);
      const { name, leader_id, trainer_id } = req.body;

      const group = await groupService.createGroup({
        name,
        tenantId: req.user!.tenant_id,
        leaderId: leader_id,
        trainerId: trainer_id,
        token,
      });

      const responseBody: ICreateGroupRes = {
        success: true,
        data: group,
      };

      res.status(HttpStatusCodes.CREATED).json(responseBody);
    } catch (error) {
      if (
        error instanceof InvalidLeaderRoleError ||
        error instanceof InvalidTrainerRoleError ||
        error instanceof UserNotInTenantError
      ) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, error.message));
        return;
      }

      return handleControllerError('GroupController.create', error, next);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const groupController = new GroupController();
export default groupController;
