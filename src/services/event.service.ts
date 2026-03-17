import {
  EventNotFoundError,
  InvalidGroupIdsError,
  UnauthorizedGroupAccessError,
} from '@src/models/errors/event.errors';
import eventRepository from '@src/repositories/event.repository';
import { IEvent } from '@src/types/event.types';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                            Interfaces
******************************************************************************/

interface ICreateEventParams {
  title: string;
  date: string;
  time?: string;
  link?: string;
  venue?: string;
  description: string;
  groupIds: string[];
  tenantId: string;
  createdBy: string;
  createdByRole: string;
  role: string;
  token: string;
}

interface IUpdateEventParams {
  eventId: string;
  title?: string;
  date?: string;
  time?: string;
  link?: string;
  venue?: string;
  description?: string;
  groupIds?: string[];
  role: string;
  userId: string;
  token: string;
}

/******************************************************************************
                            EventService
******************************************************************************/

class EventService {
  async createEvent(params: ICreateEventParams): Promise<IEvent> {
    try {
      const foundGroupIds = await eventRepository.findGroupsByIds(
        params.groupIds,
        params.token,
      );

      if (foundGroupIds.length !== params.groupIds.length) {
        throw new InvalidGroupIdsError();
      }

      if (params.role === 'trainer') {
        const managedGroupIds = await eventRepository.findTrainerGroups(
          params.createdBy,
        );
        const managedSet = new Set(managedGroupIds);

        if (!params.groupIds.every((id) => managedSet.has(id))) {
          throw new UnauthorizedGroupAccessError();
        }
      }

      const dateValue = params.time
        ? `${params.date}T${params.time}`
        : params.date;

      const event = await eventRepository.insertEvent(
        {
          event_title: params.title,
          date: dateValue,
          description: params.description,
          meeting_link: params.link ?? null,
          venue: params.venue ?? null,
          tenant_id: params.tenantId,
          created_by: params.createdBy,
          created_by_role: params.createdByRole,
        },
        params.token,
      );

      const eventGroups = params.groupIds.map((groupId) => ({
        event_id: event.id,
        group_id: groupId,
      }));

      await eventRepository.insertEventGroups(eventGroups, params.token);

      return event;
    } catch (error) {
      if (
        error instanceof InvalidGroupIdsError ||
        error instanceof UnauthorizedGroupAccessError
      ) {
        throw error;
      }
      return handleServiceError('EventService.createEvent', error);
    }
  }

  async updateEvent(params: IUpdateEventParams): Promise<IEvent> {
    try {
      const existing = await eventRepository.findById(
        params.eventId,
        params.token,
      );

      if (!existing) {
        throw new EventNotFoundError();
      }

      if (params.groupIds) {
        const foundGroupIds = await eventRepository.findGroupsByIds(
          params.groupIds,
          params.token,
        );

        if (foundGroupIds.length !== params.groupIds.length) {
          throw new InvalidGroupIdsError();
        }

        if (params.role === 'trainer') {
          const managedGroupIds = await eventRepository.findTrainerGroups(
            params.userId,
          );
          const managedSet = new Set(managedGroupIds);

          if (!params.groupIds.every((id) => managedSet.has(id))) {
            throw new UnauthorizedGroupAccessError();
          }
        }
      }

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (params.title !== undefined) updateData.event_title = params.title;
      if (params.link !== undefined) updateData.meeting_link = params.link;
      if (params.venue !== undefined) updateData.venue = params.venue;
      if (params.description !== undefined)
        updateData.description = params.description;

      if (params.date !== undefined) {
        updateData.date =
          params.time !== undefined
            ? `${params.date}T${params.time}`
            : params.date;
      } else if (params.time !== undefined) {
        const existingDatePart = existing.date.split('T')[0];
        updateData.date = `${existingDatePart}T${params.time}`;
      }

      const updatedEvent = await eventRepository.updateEvent(
        params.eventId,
        updateData,
        params.token,
      );

      if (!updatedEvent) {
        throw new EventNotFoundError();
      }

      if (params.groupIds) {
        await eventRepository.deleteEventGroupsByEventId(
          params.eventId,
          params.token,
        );
        const eventGroups = params.groupIds.map((groupId) => ({
          event_id: params.eventId,
          group_id: groupId,
        }));
        await eventRepository.insertEventGroups(eventGroups, params.token);
      }

      return updatedEvent;
    } catch (error) {
      if (
        error instanceof EventNotFoundError ||
        error instanceof InvalidGroupIdsError ||
        error instanceof UnauthorizedGroupAccessError
      ) {
        throw error;
      }
      return handleServiceError('EventService.updateEvent', error);
    }
  }

  async getEvents(token: string): Promise<IEvent[]> {
    try {
      return await eventRepository.findAll(token);
    } catch (error) {
      return handleServiceError('EventService.getEvents', error);
    }
  }

  async getEventById(eventId: string, token: string): Promise<IEvent | null> {
    try {
      return await eventRepository.findById(eventId, token);
    } catch (error) {
      return handleServiceError('EventService.getEventById', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const eventService = new EventService();
export default eventService;
