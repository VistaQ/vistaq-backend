import { NextFunction, Response } from 'express';

import { ProspectNotFoundError } from '@src/models/errors/prospect.errors';
import { RouteError } from '@src/models/errors/route.error';
import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import loggingService from '@src/services/logging.service';
import prospectService from '@src/services/prospect.service';
import { IProspect } from '@src/types/auth.types';
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
}

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
      loggingService.info('ProspectController.create called');

      if (!['agent', 'group_leader'].includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const token = req.headers['authorization']!.slice(7);
      const { fullName, phoneNum, email } = req.body;

      const prospect = await prospectService.createProspect({
        prospectName: fullName,
        prospectPhone: phoneNum,
        prospectEmail: email,
        agentId: req.user!.id,
        tenantId: req.user!.tenant_id,
        token,
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
      loggingService.info('ProspectController.getAll called');

      const token = req.headers['authorization']!.slice(7);
      const prospects = await prospectService.getProspects(token);

      const responseBody: IGetProspectsRes = {
        success: true,
        data: prospects,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('ProspectController.getAll', error, next);
    }
  }

  async getById(
    req: IGetProspectByIdReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      loggingService.info('ProspectController.getById called');

      const token = req.headers['authorization']!.slice(7);
      const { prospectId } = req.params;

      const prospect = await prospectService.getProspectById(prospectId, token);

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

  async update(
    req: IUpdateProspectReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      loggingService.info('ProspectController.update called');

      if (!['agent', 'group_leader'].includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const token = req.headers['authorization']!.slice(7);
      const { prospectId } = req.params;

      const updatedProspect = await prospectService.updateProspect({
        prospectId,
        token,
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
