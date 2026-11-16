import {
  EventNotFoundError,
  ForbiddenEventAccessError,
  InvalidAgentIdsError,
  InvalidDateRangeError,
  InvalidGroupIdsError,
  UnauthorizedGroupAccessError,
} from '@src/models/errors/event.errors';
import eventRepository, {
  type IEventUpdate,
} from '@src/repositories/event.repository';
import groupRepository from '@src/repositories/group.repository';
import userRepository from '@src/repositories/user.repository';
import scopeService from '@src/services/scope.service';
import type { ICaller } from '@src/types/auth.types';
import type { IEvent, IPublicEvent } from '@src/types/event.types';
import { handleServiceError } from '@src/utils/errorHandlers';

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
  createdBy: string;
  createdByRole: string;
  role: string;
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
  role: string;
  userId: string;
}

const AGENT_ROLES = ['agent', 'group_leader'];

function canRead(
  caller: ICaller,
  event: IEvent,
  groupScope: string[] | null,
): boolean {
  return (
    groupScope === null ||
    event.created_by === caller.id ||
    event.agentIds.includes(caller.id) ||
    event.groupIds.some((groupId) => groupScope.includes(groupId))
  );
}

/******************************************************************************
                            EventService
******************************************************************************/

class EventService {
  private async validateTargets(
    role: string,
    userId: string,
    groupIds?: string[],
    agentIds?: string[],
  ): Promise<void> {
    try {
      if (groupIds) {
        const unique = Array.from(new Set(groupIds));
        const found = await groupRepository.findByIds(unique);
        if (found.length !== unique.length) {
          throw new InvalidGroupIdsError();
        }
        if (role === 'trainer') {
          const managed = new Set(await scopeService.managedGroupIds(userId));
          if (!unique.every((id) => managed.has(id))) {
            throw new UnauthorizedGroupAccessError();
          }
        }
      }

      if (agentIds) {
        const unique = Array.from(new Set(agentIds));
        const agents = (await userRepository.findByIds(unique)).filter(
          (user) => user.status === 'active',
        );
        if (
          agents.length !== unique.length ||
          agents.some((agent) => !AGENT_ROLES.includes(agent.role))
        ) {
          throw new InvalidAgentIdsError();
        }
      }
    } catch (error) {
      if (
        error instanceof InvalidGroupIdsError ||
        error instanceof UnauthorizedGroupAccessError ||
        error instanceof InvalidAgentIdsError
      ) {
        throw error;
      }
      return handleServiceError('EventService.validateTargets', error);
    }
  }

  async createEvent(params: ICreateEventParams): Promise<IEvent> {
    try {
      await this.validateTargets(
        params.role,
        params.createdBy,
        params.groupIds,
        params.agentIds,
      );

      return await eventRepository.insertEvent({
        event_title: params.title,
        start_date: params.startDate,
        end_date: params.endDate,
        status: params.status,
        type: params.type,
        description: params.description,
        meeting_link: params.link ?? null,
        venue: params.venue ?? null,
        created_by: params.createdBy,
        created_by_role: params.createdByRole,
        visibility: params.visibility,
        group_ids: params.groupIds ?? [],
        agent_ids: params.agentIds ?? [],
      });
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
      const existing = await eventRepository.findById(params.eventId);
      if (
        !existing ||
        (params.role !== 'admin' && existing.created_by !== params.userId)
      ) {
        throw new EventNotFoundError();
      }

      await this.validateTargets(
        params.role,
        params.userId,
        params.groupIds,
        params.agentIds,
      );

      const updateData: IEventUpdate = {};
      if (params.title !== undefined) updateData.event_title = params.title;
      if (params.link !== undefined) updateData.meeting_link = params.link;
      if (params.venue !== undefined) updateData.venue = params.venue;
      if (params.description !== undefined)
        updateData.description = params.description;
      if (params.status !== undefined) updateData.status = params.status;
      if (params.type !== undefined) updateData.type = params.type;
      if (params.visibility !== undefined)
        updateData.visibility = params.visibility;
      if (params.startDate !== undefined)
        updateData.start_date = params.startDate;
      if (params.endDate !== undefined) updateData.end_date = params.endDate;
      if (params.groupIds !== undefined) updateData.group_ids = params.groupIds;
      if (params.agentIds !== undefined) updateData.agent_ids = params.agentIds;

      const effectiveStart = updateData.start_date ?? existing.start_date;
      const effectiveEnd =
        updateData.end_date ?? existing.end_date ?? existing.start_date;
      if (new Date(effectiveEnd) <= new Date(effectiveStart)) {
        throw new InvalidDateRangeError();
      }

      return await eventRepository.updateEvent(existing, updateData);
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
  }

  async getEvents(caller: ICaller): Promise<IEvent[]> {
    try {
      const groupScope = await scopeService.resolveGroupScope(caller);
      return groupScope === null
        ? await eventRepository.findAll()
        : await eventRepository.findVisible(caller.id, groupScope);
    } catch (error) {
      return handleServiceError('EventService.getEvents', error);
    }
  }

  async getEventById(eventId: string, caller: ICaller): Promise<IEvent | null> {
    try {
      const [event, groupScope] = await Promise.all([
        eventRepository.findById(eventId),
        scopeService.resolveGroupScope(caller),
      ]);
      return event && canRead(caller, event, groupScope) ? event : null;
    } catch (error) {
      return handleServiceError('EventService.getEventById', error);
    }
  }

  async deleteEvent(eventId: string, caller: ICaller): Promise<void> {
    try {
      const event = await this.getEventById(eventId, caller);
      if (!event) {
        throw new EventNotFoundError();
      }
      if (caller.role !== 'admin' && event.created_by !== caller.id) {
        throw new ForbiddenEventAccessError();
      }
      await eventRepository.deleteEvent(event);
    } catch (error) {
      if (
        error instanceof EventNotFoundError ||
        error instanceof ForbiddenEventAccessError
      ) {
        throw error;
      }
      return handleServiceError('EventService.deleteEvent', error);
    }
  }

  async getPublicEventById(eventId: string): Promise<IPublicEvent | null> {
    try {
      const event = await eventRepository.findById(eventId);
      if (!event || event.status === 'cancelled' || event.visibility !== 'public') {
        return null;
      }
      const creator = event.created_by
        ? await userRepository.findById(event.created_by)
        : null;

      return {
        id: event.id,
        event_title: event.event_title,
        description: event.description,
        start_date: event.start_date,
        end_date: event.end_date,
        type: event.type,
        venue: event.venue,
        meeting_link: event.meeting_link,
        created_by_name: creator?.name ?? '',
        status: event.status,
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
