import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import {
  EventNotFoundError,
  ForbiddenEventAccessError,
  InvalidAgentIdsError,
  InvalidDateRangeError,
  InvalidGroupIdsError,
  UnauthorizedGroupAccessError,
} from '@src/models/errors/event.errors';
import { RouteError } from '@src/models/errors/route.error';
import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import eventService from '@src/services/event.service';
import { IEvent, IPublicEvent } from '@src/types/event.types';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface ICreateEventReq extends IBaseReq {
  body: {
    title: string;
    startDate: string;
    endDate: string;
    status?: string;
    type: string;
    link?: string;
    venue?: string;
    description: string;
    visibility?: string;
    groupIds?: string[];
    agentIds?: string[];
  };
}

export interface ICreateEventRes extends IBaseRes {
  success: boolean;
  data: IEvent;
}

export interface IUpdateEventReq extends IBaseReq {
  params: { eventId: string };
  body: {
    title?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    type?: string;
    link?: string;
    venue?: string;
    description?: string;
    visibility?: string;
    groupIds?: string[];
    agentIds?: string[];
  };
}

export interface IUpdateEventRes extends IBaseRes {
  success: boolean;
  data: IEvent;
}

export interface IGetEventsRes extends IBaseRes {
  success: boolean;
  data: IEvent[];
}

export interface IGetEventByIdReq extends IBaseReq {
  params: { eventId: string };
}

export interface IGetEventByIdRes extends IBaseRes {
  success: boolean;
  data: IEvent;
}

export interface IGetPublicEventRes extends IBaseRes {
  success: boolean;
  data: IPublicEvent;
}

/******************************************************************************
                            EventController
******************************************************************************/

const ALLOWED_ROLES = ['admin', 'master_trainer', 'trainer', 'group_leader', 'agent'];

class EventController {
  async create(
    req: ICreateEventReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!ALLOWED_ROLES.includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const token = req.headers['authorization']!.slice(7);
      const { title, startDate, endDate, status, type, link, venue, description } = req.body;
      let { visibility, groupIds, agentIds } = req.body;

      if (req.user!.role === 'agent') {
        groupIds = undefined;
        agentIds = [req.user!.id];
      } else if (!groupIds?.length && !agentIds?.length) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, 'At least one of groupIds or agentIds must be provided'));
        return;
      }

      if (visibility === undefined) {
        visibility = req.user!.role === 'agent' ? 'public' : 'private';
      }

      const event = await eventService.createEvent({
        title,
        startDate,
        endDate,
        status,
        type,
        link,
        venue,
        description,
        visibility,
        groupIds,
        agentIds,
        tenantId: req.user!.tenant_id,
        createdBy: req.user!.id,
        createdByRole: req.user!.role,
        role: req.user!.role,
        token,
      });

      const responseBody: ICreateEventRes = { success: true, data: event };
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
      return handleControllerError('EventController.create', error, next);
    }
  }

  async update(
    req: IUpdateEventReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!ALLOWED_ROLES.includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const token = req.headers['authorization']!.slice(7);
      const { eventId } = req.params;
      const { title, startDate, endDate, status, type, link, venue, description, visibility } = req.body;
      let { groupIds, agentIds } = req.body;

      if (req.user!.role === 'agent') {
        groupIds = undefined;
        agentIds = [req.user!.id];
      } else {
        if (groupIds !== undefined && groupIds.length === 0) {
          next(new RouteError(HttpStatusCodes.BAD_REQUEST, 'groupIds must not be empty'));
          return;
        }
        if (agentIds !== undefined && agentIds.length === 0) {
          next(new RouteError(HttpStatusCodes.BAD_REQUEST, 'agentIds must not be empty'));
          return;
        }
      }

      const event = await eventService.updateEvent({
        eventId,
        title,
        startDate,
        endDate,
        status,
        type,
        link,
        venue,
        description,
        visibility,
        groupIds,
        agentIds,
        tenantId: req.user!.tenant_id,
        role: req.user!.role,
        userId: req.user!.id,
        token,
      });

      const responseBody: IUpdateEventRes = { success: true, data: event };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof EventNotFoundError) {
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
      return handleControllerError('EventController.update', error, next);
    }
  }

  async getAll(
    req: IBaseReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const token = req.headers['authorization']!.slice(7);
      const events = await eventService.getEvents(token);

      const responseBody: IGetEventsRes = { success: true, data: events };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('EventController.getAll', error, next);
    }
  }

  async getById(
    req: IGetEventByIdReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const token = req.headers['authorization']!.slice(7);
      const { eventId } = req.params;

      const event = await eventService.getEventById(eventId, token);

      if (!event) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, 'Event not found'));
        return;
      }

      const responseBody: IGetEventByIdRes = { success: true, data: event };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('EventController.getById', error, next);
    }
  }

  async delete(
    req: IGetEventByIdReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!ALLOWED_ROLES.includes(req.user!.role)) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const token = req.headers['authorization']!.slice(7);
      const { eventId } = req.params;

      await eventService.deleteEvent({
        eventId,
        userId: req.user!.id,
        role: req.user!.role,
        token,
      });

      res.status(HttpStatusCodes.NO_CONTENT).send();
    } catch (error) {
      if (error instanceof EventNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }
      if (error instanceof ForbiddenEventAccessError) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, error.message));
        return;
      }
      return handleControllerError('EventController.delete', error, next);
    }
  }

  async getPublic(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const parsed = z.string().uuid().safeParse(req.params.eventId);
      if (!parsed.success) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, 'Event not found'));
        return;
      }

      const event = await eventService.getPublicEventById(parsed.data);

      if (!event) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, 'Event not found'));
        return;
      }

      const responseBody: IGetPublicEventRes = { success: true, data: event };
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('EventController.getPublic', error, next);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const eventController = new EventController();
export default eventController;
