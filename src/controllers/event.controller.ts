import { NextFunction, Response } from 'express';

import {
  EventNotFoundError,
  InvalidGroupIdsError,
  UnauthorizedGroupAccessError,
} from '@src/models/errors/event.errors';
import { RouteError } from '@src/models/errors/route.error';
import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import eventService from '@src/services/event.service';
import { IEvent } from '@src/types/event.types';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface ICreateEventReq extends IBaseReq {
  body: {
    title: string;
    date: string;
    time?: string;
    link?: string;
    venue?: string;
    description: string;
    groupIds: string[];
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
    date?: string;
    time?: string;
    link?: string;
    venue?: string;
    description?: string;
    groupIds?: string[];
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

/******************************************************************************
                            EventController
******************************************************************************/

const ALLOWED_ROLES = ['admin', 'master_trainer', 'trainer', 'group_leader'];

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
      const { title, date, time, link, venue, description, groupIds } =
        req.body;

      const event = await eventService.createEvent({
        title,
        date,
        time,
        link,
        venue,
        description,
        groupIds,
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
      const { title, date, time, link, venue, description, groupIds } =
        req.body;

      const event = await eventService.updateEvent({
        eventId,
        title,
        date,
        time,
        link,
        venue,
        description,
        groupIds,
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
}

/******************************************************************************
                                Export
******************************************************************************/

export const eventController = new EventController();
export default eventController;
