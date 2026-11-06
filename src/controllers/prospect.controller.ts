import type { NextFunction, Response } from 'express';
import { z } from 'zod';

import {
  InvalidPageTokenError,
  ProspectNotFoundError,
} from '@src/models/errors/prospect.errors';
import { RouteError } from '@src/models/errors/route.error';
import type { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import prospectService from '@src/services/prospect.service';
import type { IProspect } from '@src/types/auth.types';
import { callerOf } from '@src/utils/caller';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface ICreateProspectReq extends IBaseReq {
  body: {
    fullName: string;
    phoneNum?: string;
    email?: string;
  };
}

export interface ICreateProspectRes extends IBaseRes {
  success: boolean;
  data: IProspect;
}

export interface IGetProspectsRes extends IBaseRes {
  success: boolean;
  data: IProspect[];
  nextToken?: string;
}

export const listProspectsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  nextToken: z.string().min(1).optional(),
  stage: z.enum(['prospect', 'appointment', 'sales']).optional(),
});

export interface IGetProspectByIdReq extends IBaseReq {
  params: { prospectId: string };
}

export interface IGetProspectByIdRes extends IBaseRes {
  success: boolean;
  data: IProspect;
}

export interface IUpdateProspectReq extends IBaseReq {
  params: { prospectId: string };
  body: {
    fullName?: string;
    phoneNum?: string;
    email?: string;
    currentStage?: string;
    appointmentDate?: string;
    appointmentStartTime?: string;
    appointmentEndTime?: string;
    appointmentLocation?: string;
    appointmentStatus?: string;
    salesMeetingStages?: string[];
    products?: { productName: string; amount: number }[];
    salesOutcome?: string;
    unsuccessfulReason?: string;
  };
}

export interface IUpdateProspectRes extends IBaseRes {
  success: boolean;
  data: IProspect;
}

export interface IDeleteProspectReq extends IBaseReq {
  params: { prospectId: string };
}

export interface IDeleteProspectRes extends IBaseRes {
  success: boolean;
}

/******************************************************************************
                            ProspectController
******************************************************************************/

class ProspectController {
  async create(
    req: ICreateProspectReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!['agent', 'group_leader'].includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const { fullName, phoneNum, email } = req.body;

      const prospect = await prospectService.createProspect({
        prospectName: fullName,
        prospectPhone: phoneNum,
        prospectEmail: email,
        agentId: req.user!.id,
      });

      const responseBody: ICreateProspectRes = {
        success: true,
        data: prospect,
      };

      res.status(HttpStatusCodes.CREATED).json(responseBody);
    } catch (error) {
      return handleControllerError('ProspectController.create', error, next);
    }
  }

  async getAll(
    req: IBaseReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const parsed = listProspectsQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          message: 'Validation failed',
          errors: parsed.error.issues,
        });
        return;
      }

      const page = await prospectService.getProspects(
        callerOf(req),
        parsed.data,
      );

      const responseBody: IGetProspectsRes = {
        success: true,
        data: page.prospects,
        ...(page.nextToken && { nextToken: page.nextToken }),
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof InvalidPageTokenError) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, error.message));
        return;
      }
      return handleControllerError('ProspectController.getAll', error, next);
    }
  }

  async getById(
    req: IGetProspectByIdReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { prospectId } = req.params;

      const prospect = await prospectService.getProspectById(
        prospectId,
        callerOf(req),
      );

      if (!prospect) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, 'Prospect not found'));
        return;
      }

      const responseBody: IGetProspectByIdRes = {
        success: true,
        data: prospect,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('ProspectController.getById', error, next);
    }
  }

  async delete(
    req: IDeleteProspectReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!['agent', 'admin', 'group_leader'].includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const { prospectId } = req.params;

      await prospectService.deleteProspect(prospectId, callerOf(req));

      const responseBody: IDeleteProspectRes = { success: true };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof ProspectNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }
      return handleControllerError('ProspectController.delete', error, next);
    }
  }

  async update(
    req: IUpdateProspectReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!['agent', 'group_leader'].includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const { prospectId } = req.params;

      const updatedProspect = await prospectService.updateProspect({
        prospectId,
        caller: callerOf(req),
        data: req.body,
      });

      const responseBody: IUpdateProspectRes = {
        success: true,
        data: updatedProspect,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof ProspectNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }
      return handleControllerError('ProspectController.update', error, next);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const prospectController = new ProspectController();
export default prospectController;
