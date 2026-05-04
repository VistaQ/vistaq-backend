import {
  EventNotFoundError,
  ForbiddenEventAccessError,
  InvalidAgentIdsError,
  InvalidDateRangeError,
  InvalidGroupIdsError,
  UnauthorizedGroupAccessError,
} from '@src/models/errors/event.errors';
import eventRepository from '@src/repositories/event.repository';
import { IEvent, IPublicEvent } from '@src/types/event.types';
import { handleServiceError } from '@src/utils/errorHandlers';
import { withServiceSpan } from '@src/utils/sentry.metrics';

/******************************************************************************
                            Interfaces
******************************************************************************/

interface ICreateEventParams {
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
  tenantId: string;
  createdBy: string;
  createdByRole: string;
  role: string;
  token: string;
}

interface IUpdateEventParams {
  eventId: string;
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
  tenantId: string;
  role: string;
  userId: string;
  token: string;
}

interface IDeleteEventParams {
  eventId: string;
  userId: string;
  role: string;
  token: string;
}

/******************************************************************************
                            EventService
******************************************************************************/

class EventService {
  async createEvent(params: ICreateEventParams): Promise<IEvent> {
    return withServiceSpan('EventService', 'createEvent', { tenant_id: params.tenantId, type: params.type }, async () => {
    try {
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
            params.createdBy,
          );
          const managedSet = new Set(managedGroupIds);

          if (!params.groupIds.every((id) => managedSet.has(id))) {
            throw new UnauthorizedGroupAccessError();
          }
        }
      }

      if (params.agentIds) {
        const agentRows = await eventRepository.findUsersByIdsAndRoles(
          params.agentIds,
          params.token,
        );

        if (agentRows.length !== params.agentIds.length) {
          throw new InvalidAgentIdsError();
        }

        const allowedRoles = ['agent', 'group_leader'];
        if (agentRows.some((row) => !allowedRoles.includes(row.role))) {
          throw new InvalidAgentIdsError();
        }

        if (agentRows.some((row) => row.tenant_id !== params.tenantId)) {
          throw new InvalidAgentIdsError();
        }
      }

      const event = await eventRepository.insertEvent(
        {
          event_title: params.title,
          start_date: params.startDate,
          end_date: params.endDate,
          status: params.status,
          type: params.type,
          description: params.description,
          meeting_link: params.link ?? null,
          venue: params.venue ?? null,
          tenant_id: params.tenantId,
          created_by: params.createdBy,
          created_by_role: params.createdByRole,
          visibility: params.visibility,
        },
        params.token,
      );

      if (params.groupIds) {
        const eventGroups = params.groupIds.map((groupId) => ({
          event_id: event.id,
          group_id: groupId,
        }));
        await eventRepository.insertEventGroups(eventGroups, params.token);
      }

      if (params.agentIds) {
        const eventAgents = params.agentIds.map((userId) => ({
          event_id: event.id,
          user_id: userId,
        }));
        await eventRepository.insertEventAgents(eventAgents, params.token);
      }

      const finalEvent = await eventRepository.findById(event.id, params.token);

      if (!finalEvent) {
        throw new EventNotFoundError();
      }

      return finalEvent;
    } catch (error) {
      if (
        error instanceof InvalidGroupIdsError ||
        error instanceof UnauthorizedGroupAccessError ||
        error instanceof InvalidAgentIdsError
      ) {
        throw error;
      }
      return handleServiceError('EventService.createEvent', error);
    }
    });
  }

  async updateEvent(params: IUpdateEventParams): Promise<IEvent> {
    return withServiceSpan('EventService', 'updateEvent', { event_id: params.eventId, tenant_id: params.tenantId }, async () => {
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

      if (params.agentIds) {
        const agentRows = await eventRepository.findUsersByIdsAndRoles(
          params.agentIds,
          params.token,
        );

        if (agentRows.length !== params.agentIds.length) {
          throw new InvalidAgentIdsError();
        }

        const allowedRoles = ['agent', 'group_leader'];
        if (agentRows.some((row) => !allowedRoles.includes(row.role))) {
          throw new InvalidAgentIdsError();
        }

        if (agentRows.some((row) => row.tenant_id !== params.tenantId)) {
          throw new InvalidAgentIdsError();
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
      if (params.status !== undefined) updateData.status = params.status;
      if (params.type !== undefined) updateData.type = params.type;
      if (params.visibility !== undefined) updateData.visibility = params.visibility;

      if (params.startDate !== undefined) updateData.start_date = params.startDate;
      if (params.endDate !== undefined) updateData.end_date = params.endDate;

      const effectiveStart = updateData.start_date ?? existing.start_date;
      const effectiveEnd = updateData.end_date ?? existing.end_date ?? existing.start_date;
      if (new Date(effectiveEnd as string) <= new Date(effectiveStart as string)) {
        throw new InvalidDateRangeError();
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

      if (params.agentIds) {
        await eventRepository.deleteEventAgentsByEventId(
          params.eventId,
          params.token,
        );
        const eventAgents = params.agentIds.map((userId) => ({
          event_id: params.eventId,
          user_id: userId,
        }));
        await eventRepository.insertEventAgents(eventAgents, params.token);
      }

      const finalEvent = await eventRepository.findById(
        params.eventId,
        params.token,
      );

      if (!finalEvent) {
        throw new EventNotFoundError();
      }

      return finalEvent;
    } catch (error) {
      if (
        error instanceof EventNotFoundError ||
        error instanceof InvalidGroupIdsError ||
        error instanceof UnauthorizedGroupAccessError ||
        error instanceof InvalidAgentIdsError ||
        error instanceof InvalidDateRangeError
      ) {
        throw error;
      }
      return handleServiceError('EventService.updateEvent', error);
    }
    });
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

  async deleteEvent(params: IDeleteEventParams): Promise<void> {
    try {
      const event = await eventRepository.findById(params.eventId, params.token);

      if (!event) {
        throw new EventNotFoundError();
      }

      if (params.role !== 'admin' && event.created_by !== params.userId) {
        throw new ForbiddenEventAccessError();
      }

      await eventRepository.deleteEvent(params.eventId, params.token);
    } catch (error) {
      if (error instanceof EventNotFoundError || error instanceof ForbiddenEventAccessError) {
        throw error;
      }
      return handleServiceError('EventService.deleteEvent', error);
    }
  }

  async getPublicEventById(eventId: string): Promise<IPublicEvent | null> {
    try {
      const raw = await eventRepository.findPublicEventById(eventId);

      if (!raw) {
        return null;
      }

      if (raw.status === 'cancelled' || raw.visibility !== 'public') {
        return null;
      }

      return {
        id: raw.id,
        event_title: raw.event_title,
        description: raw.description,
        start_date: raw.start_date,
        end_date: raw.end_date,
        type: raw.type,
        venue: raw.venue,
        meeting_link: raw.meeting_link,
        created_by_name: raw.created_by_name,
        status: raw.status,
      };
    } catch (error) {
      return handleServiceError('EventService.getPublicEventById', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const eventService = new EventService();
export default eventService;
