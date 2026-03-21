import {
  EventNotFoundError,
  InvalidAgentIdsError,
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
  startTime: string;
  endTime: string;
  status?: string;
  type: string;
  link?: string;
  venue?: string;
  description: string;
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
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  type?: string;
  link?: string;
  venue?: string;
  description?: string;
  groupIds?: string[];
  agentIds?: string[];
  tenantId: string;
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

      const startDate = `${params.date}T${params.startTime}`;
      const endDate = `${params.date}T${params.endTime}`;

      const event = await eventRepository.insertEvent(
        {
          event_title: params.title,
          start_date: startDate,
          end_date: endDate,
          status: params.status,
          type: params.type,
          description: params.description,
          meeting_link: params.link ?? null,
          venue: params.venue ?? null,
          tenant_id: params.tenantId,
          created_by: params.createdBy,
          created_by_role: params.createdByRole,
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

      if (params.date !== undefined && params.startTime !== undefined) {
        updateData.start_date = `${params.date}T${params.startTime}`;
      } else if (params.date !== undefined) {
        // Only date provided — preserve existing time from start_date
        const existingTimePart = existing.start_date.split('T')[1] ?? '00:00';
        updateData.start_date = `${params.date}T${existingTimePart}`;
      } else if (params.startTime !== undefined) {
        const existingDatePart = existing.start_date.split('T')[0];
        updateData.start_date = `${existingDatePart}T${params.startTime}`;
      }

      if (params.date !== undefined && params.endTime !== undefined) {
        updateData.end_date = `${params.date}T${params.endTime}`;
      } else if (params.date !== undefined) {
        // Only date provided — preserve existing time from end_date (fallback to start_date if end_date null)
        const existingEnd = existing.end_date ?? existing.start_date;
        const existingTimePart = existingEnd.split('T')[1] ?? '00:00';
        updateData.end_date = `${params.date}T${existingTimePart}`;
      } else if (params.endTime !== undefined) {
        const existingEnd = existing.end_date ?? existing.start_date;
        const existingDatePart = existingEnd.split('T')[0];
        updateData.end_date = `${existingDatePart}T${params.endTime}`;
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
        error instanceof InvalidAgentIdsError
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
