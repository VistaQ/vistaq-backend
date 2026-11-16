import type { NextFunction, Response } from 'express';

import {
  CoachingSessionNotFoundError,
  InvalidAgentIdsError,
  InvalidDateRangeError,
  InvalidGroupIdsError,
  UnauthorizedGroupAccessError,
  UnauthorizedSessionAccessError,
} from '@src/models/errors/coachingSession.errors';
import { RouteError } from '@src/models/errors/route.error';
import type { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import coachingSessionService from '@src/services/coachingSession.service';
import type {
  ICoachingSession,
  ICoachingSessionAttendance,
  ICoachingSessionDetail,
} from '@src/types/coachingSession.types';
import { callerOf } from '@src/utils/caller';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface ICreateCoachingSessionReq extends IBaseReq {
  body: {
    coachingType: string;
    title: string;
    description?: string;
    startDate: string;
    endDate: string;
    trainingMode: string;
    link?: string;
    status?: string;
    groupIds?: string[];
    agentIds?: string[];
  };
}

export interface ICreateCoachingSessionRes extends IBaseRes {
  success: boolean;
  data: ICoachingSession;
}

export interface IUpdateCoachingSessionReq extends IBaseReq {
  params: { sessionId: string };
  body: {
    coachingType?: string;
    title?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    trainingMode?: string;
    link?: string;
    status?: string;
    groupIds?: string[];
    agentIds?: string[];
  };
}

export interface IUpdateCoachingSessionRes extends IBaseRes {
  success: boolean;
  data: ICoachingSession;
}

export interface IGetCoachingSessionsRes extends IBaseRes {
  success: boolean;
  data: ICoachingSession[];
}

export interface IGetCoachingSessionByIdReq extends IBaseReq {
  params: { sessionId: string };
}

export interface IGetCoachingSessionByIdRes extends IBaseRes {
  success: boolean;
  data: ICoachingSessionDetail;
}

export interface IJoinCoachingSessionReq extends IBaseReq {
  params: { sessionId: string };
}

export interface IJoinCoachingSessionRes extends IBaseRes {
  success: boolean;
  data: ICoachingSessionAttendance;
}

export interface IMarkNonAttendeesReq extends IBaseReq {
  params: { sessionId: string };
}

export interface IMarkNonAttendeesRes extends IBaseRes {
  success: boolean;
}

export interface IDeleteCoachingSessionReq extends IBaseReq {
  params: { sessionId: string };
}

/******************************************************************************
                            CoachingSessionController
******************************************************************************/

const ALLOWED_ROLES = ['admin', 'master_trainer', 'trainer', 'group_leader'];

class CoachingSessionController {
  async create(
    req: ICreateCoachingSessionReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!ALLOWED_ROLES.includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }
      const {
        coachingType, title, description, startDate, endDate,
        trainingMode, link, status, groupIds, agentIds,
      } = req.body;

      const session = await coachingSessionService.createSession({
        coachingType,
        title,
        description,
        startDate,
        endDate,
        trainingMode,
        link,
        status,
        groupIds,
        agentIds,
        createdBy: req.user!.id,
        role: req.user!.role,
      });

      const responseBody: ICreateCoachingSessionRes = { success: true, data: session };
      res.status(HttpStatusCodes.CREATED).json(responseBody);
    } catch (error) {
      if (error instanceof InvalidGroupIdsError) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, error.message));
        return;
      }
      if (error instanceof UnauthorizedGroupAccessError) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, error.message));
        return;
      }
      if (error instanceof InvalidAgentIdsError) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, error.message));
        return;
      }
      return handleControllerError('CoachingSessionController.create', error, next);
    }
  }

  async update(
    req: IUpdateCoachingSessionReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!ALLOWED_ROLES.includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }
      const { sessionId } = req.params;
      const {
        coachingType, title, description, startDate, endDate,
        trainingMode, link, status, groupIds, agentIds,
      } = req.body;

      const session = await coachingSessionService.updateSession({
        sessionId,
        coachingType,
        title,
        description,
        startDate,
        endDate,
        trainingMode,
        link,
        status,
        groupIds,
        agentIds,
        caller: callerOf(req),
      });

      const responseBody: IUpdateCoachingSessionRes = { success: true, data: session };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof CoachingSessionNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }
      if (error instanceof InvalidGroupIdsError) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, error.message));
        return;
      }
      if (error instanceof UnauthorizedGroupAccessError) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, error.message));
        return;
      }
      if (error instanceof InvalidAgentIdsError) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, error.message));
        return;
      }
      if (error instanceof InvalidDateRangeError) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, error.message));
        return;
      }
      if (error instanceof UnauthorizedSessionAccessError) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, error.message));
        return;
      }
      return handleControllerError('CoachingSessionController.update', error, next);
    }
  }

  async delete(
    req: IDeleteCoachingSessionReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!ALLOWED_ROLES.includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }
      const { sessionId } = req.params;

      await coachingSessionService.deleteSession(sessionId, callerOf(req));

      res.status(HttpStatusCodes.OK).json({ success: true });
    } catch (error) {
      if (error instanceof CoachingSessionNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }
      if (error instanceof UnauthorizedSessionAccessError) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, error.message));
        return;
      }
      return handleControllerError('CoachingSessionController.delete', error, next);
    }
  }

  async getAll(
    req: IBaseReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const sessions = await coachingSessionService.getSessions(callerOf(req));

      const responseBody: IGetCoachingSessionsRes = { success: true, data: sessions };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('CoachingSessionController.getAll', error, next);
    }
  }

  async getById(
    req: IGetCoachingSessionByIdReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { sessionId } = req.params;

      const session = await coachingSessionService.getSessionById(
        sessionId,
        callerOf(req),
      );

      if (!session) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, 'Coaching session not found'));
        return;
      }

      const responseBody: IGetCoachingSessionByIdRes = { success: true, data: session };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('CoachingSessionController.getById', error, next);
    }
  }

  async join(
    req: IJoinCoachingSessionReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { sessionId } = req.params;

      const attendance = await coachingSessionService.joinSession(
        sessionId,
        callerOf(req),
      );

      const responseBody: IJoinCoachingSessionRes = { success: true, data: attendance };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof CoachingSessionNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }
      return handleControllerError('CoachingSessionController.join', error, next);
    }
  }

  async markNonAttendees(
    req: IMarkNonAttendeesReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!ALLOWED_ROLES.includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }
      const { sessionId } = req.params;

      await coachingSessionService.markNonAttendees(sessionId, callerOf(req));

      const responseBody: IMarkNonAttendeesRes = { success: true };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof CoachingSessionNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }
      if (error instanceof UnauthorizedSessionAccessError) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, error.message));
        return;
      }
      return handleControllerError('CoachingSessionController.markNonAttendees', error, next);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const coachingSessionController = new CoachingSessionController();
export default coachingSessionController;
