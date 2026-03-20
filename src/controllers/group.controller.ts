import { NextFunction, Response } from 'express';

import {
  GroupNotFoundError,
  InvalidLeaderError,
  InvalidLeaderRoleError,
  InvalidTrainerError,
  InvalidTrainerRoleError,
  MissingMembersError,
  UserNotInTenantError,
} from '@src/models/errors/group.errors';
import { UserNotFoundError } from '@src/models/errors/auth.errors';
import { RouteError } from '@src/models/errors/route.error';
import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import groupService from '@src/services/group.service';
import { IGroup } from '@src/types/auth.types';
import { IGroupDetailStats } from '@src/types/group-detail-stats.types';
import { IGroupStats } from '@src/types/group-stats.types';
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

export interface IGetGroupsRes extends IBaseRes {
  success: boolean;
  data: IGroup[];
}

export interface IUpdateGroupReq extends IBaseReq {
  params: { groupId: string };
  body: {
    name?: string;
    status?: string;
    leader_id?: string;
    trainer_id?: string;
    member_ids?: string[];
  };
}

export interface IUpdateGroupRes extends IBaseRes {
  success: boolean;
  data: IGroup;
}

export interface IGetGroupByIdReq extends IBaseReq {
  params: { groupId: string };
}

export interface IGetGroupByIdRes extends IBaseRes {
  success: boolean;
  data: IGroup;
}

export interface IGetGroupStatsRes extends IBaseRes {
  success: boolean;
  data: IGroupStats[];
}

export interface IGetGroupStatsByIdReq extends IBaseReq {
  params: { groupId: string };
}

export interface IGetGroupStatsByIdRes extends IBaseRes {
  success: boolean;
  data: IGroupDetailStats;
}

/******************************************************************************
                            GroupController
******************************************************************************/

class GroupController {
  async getStats(req: IBaseReq, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.headers['authorization']!.slice(7);
      const data = await groupService.getGroupStats(token);

      const responseBody: IGetGroupStatsRes = {
        success: true,
        data,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('GroupController.getStats', error, next);
    }
  }

  async getAll(req: IBaseReq, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.headers['authorization']!.slice(7);
      const groups = await groupService.getGroups(token);

      const responseBody: IGetGroupsRes = {
        success: true,
        data: groups,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('GroupController.getAll', error, next);
    }
  }

  async getById(
    req: IGetGroupByIdReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const token = req.headers['authorization']!.slice(7);
      const { groupId } = req.params;

      const group = await groupService.getGroupById(groupId, token);

      if (!group) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, 'Group not found'));
        return;
      }

      const responseBody: IGetGroupByIdRes = {
        success: true,
        data: group,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('GroupController.getById', error, next);
    }
  }

  async create(
    req: ICreateGroupReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
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

  async getStatsById(
    req: IGetGroupStatsByIdReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const token = req.headers['authorization']!.slice(7);
      const { groupId } = req.params;

      const data = await groupService.getGroupDetailStats(groupId, token);

      const responseBody: IGetGroupStatsByIdRes = {
        success: true,
        data,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof GroupNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, 'Group not found'));
        return;
      }
      return handleControllerError('GroupController.getStatsById', error, next);
    }
  }

  async update(
    req: IUpdateGroupReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (req.user!.role !== 'admin') {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const token = req.headers['authorization']!.slice(7);
      const { groupId } = req.params;

      const group = await groupService.updateGroup({
        groupId,
        token,
        data: req.body,
      });

      const responseBody: IUpdateGroupRes = {
        success: true,
        data: group,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (
        error instanceof GroupNotFoundError ||
        error instanceof UserNotFoundError
      ) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }

      if (
        error instanceof InvalidLeaderError ||
        error instanceof InvalidTrainerError ||
        error instanceof MissingMembersError
      ) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, error.message));
        return;
      }

      return handleControllerError('GroupController.update', error, next);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const groupController = new GroupController();
export default groupController;
