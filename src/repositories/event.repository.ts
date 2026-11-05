import { randomUUID } from 'crypto';

import { TRANSITIONAL_TENANT_ID } from '@src/constants/tenant';
import { DynamoConditionFailedError } from '@src/models/errors/dynamo.error';
import { EventNotFoundError } from '@src/models/errors/event.errors';
import { DynamoTable } from '@src/services/dynamo.service';
import type { IEvent } from '@src/types/event.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';
import { nowUtc } from '@src/utils/period';

/******************************************************************************
                            Item and input types
******************************************************************************/

interface IEventItem {
  id: string;
  event_title: string;
  start_date: string;
  end_date?: string;
  description?: string;
  meeting_link?: string;
  venue?: string;
  status: string;
  type: string;
  created_by?: string;
  created_by_role?: string;
  visibility: string;
  group_ids: string[];
  agent_ids: string[];
  created_at: string;
  updated_at: string;
}

interface IEventLinkItem {
  event_id: string;
  status: string;
  start_date: string;
}

type IEventGroupItem = IEventLinkItem & { group_id: string };
type IEventAgentItem = IEventLinkItem & { user_id: string };

const events = new DynamoTable<IEventItem>('Events');
const eventGroups = new DynamoTable<IEventGroupItem>('EventGroups');
const eventAgents = new DynamoTable<IEventAgentItem>('EventAgents');

const unique = (ids: string[]): string[] => Array.from(new Set(ids));

export interface INewEvent {
  event_title: string;
  start_date: string;
  end_date?: string | null;
  description?: string | null;
  meeting_link?: string | null;
  venue?: string | null;
  status?: string;
  type: string;
  created_by: string;
  created_by_role: string;
  visibility?: string;
  group_ids: string[];
  agent_ids: string[];
}

export interface IEventUpdate {
  event_title?: string;
  start_date?: string;
  end_date?: string | null;
  description?: string | null;
  meeting_link?: string | null;
  venue?: string | null;
  status?: string;
  type?: string;
  visibility?: string;
  group_ids?: string[];
  agent_ids?: string[];
}

const EVENT_STATUSES = ['upcoming', 'completed', 'cancelled'] as const;

function toEvent(item: IEventItem): IEvent {
  return {
    id: item.id,
    tenant_id: TRANSITIONAL_TENANT_ID,
    event_title: item.event_title,
    start_date: item.start_date,
    end_date: item.end_date ?? null,
    description: item.description ?? null,
    meeting_link: item.meeting_link ?? null,
    venue: item.venue ?? null,
    status: item.status,
    type: item.type,
    created_by: item.created_by ?? null,
    created_by_role: item.created_by_role ?? null,
    created_at: item.created_at,
    updated_at: item.updated_at,
    visibility: item.visibility,
    groupIds: item.group_ids ?? [],
    agentIds: item.agent_ids ?? [],
  };
}

function byStartDesc(a: IEvent, b: IEvent): number {
  return b.start_date.localeCompare(a.start_date);
}

/******************************************************************************
                            EventRepository
******************************************************************************/

class EventRepository {
  // The link items copy status and start_date for their index sort keys, so
  // they are rewritten whenever either changes, not only when the sets change.
  private async writeLinks(
    event: IEventItem,
    previous?: { group_ids: string[]; agent_ids: string[] },
  ): Promise<void> {
    try {
      const link = {
        event_id: event.id,
        status: event.status,
        start_date: event.start_date,
      };
      const removed = (ids: string[], next: string[]) =>
        ids.filter((id) => !next.includes(id));
      await Promise.all([
        ...removed(previous?.group_ids ?? [], event.group_ids).map((groupId) =>
          eventGroups.delete({
            event_id: event.id,
            group_id: groupId,
          }),
        ),
        ...removed(previous?.agent_ids ?? [], event.agent_ids).map((userId) =>
          eventAgents.delete({
            event_id: event.id,
            user_id: userId,
          }),
        ),
        ...event.group_ids.map((groupId) =>
          eventGroups.put({ ...link, group_id: groupId }),
        ),
        ...event.agent_ids.map((userId) =>
          eventAgents.put({ ...link, user_id: userId }),
        ),
      ]);
    } catch (error) {
      return handleRepositoryError('EventRepository.writeLinks', error);
    }
  }

  async insertEvent(event: INewEvent): Promise<IEvent> {
    try {
      const now = nowUtc();
      const item: IEventItem = {
        id: randomUUID(),
        event_title: event.event_title,
        start_date: event.start_date,
        ...(event.end_date && { end_date: event.end_date }),
        ...(event.description && { description: event.description }),
        ...(event.meeting_link && { meeting_link: event.meeting_link }),
        ...(event.venue && { venue: event.venue }),
        status: event.status ?? 'upcoming',
        type: event.type,
        created_by: event.created_by,
        created_by_role: event.created_by_role,
        visibility: event.visibility ?? 'private',
        group_ids: unique(event.group_ids),
        agent_ids: unique(event.agent_ids),
        created_at: now,
        updated_at: now,
      };
      await events.put(
        { ...item },
        {
          condition: 'attribute_not_exists(id)',
        },
      );
      await this.writeLinks(item);
      return toEvent(item);
    } catch (error) {
      return handleRepositoryError('EventRepository.insertEvent', error);
    }
  }

  async findById(eventId: string): Promise<IEvent | null> {
    try {
      const item = await events.get({
        id: eventId,
      });
      return item ? toEvent(item) : null;
    } catch (error) {
      return handleRepositoryError('EventRepository.findById', error);
    }
  }

  async findAll(): Promise<IEvent[]> {
    try {
      const pages = await Promise.all(
        EVENT_STATUSES.map((status) =>
          events.queryAll({
            index: 'byStatus',
            keyCondition: 'status = :status',
            values: { ':status': status },
            descending: true,
          }),
        ),
      );
      return pages.flat().map(toEvent).sort(byStartDesc);
    } catch (error) {
      return handleRepositoryError('EventRepository.findAll', error);
    }
  }

  async findVisible(userId: string, groupIds: string[]): Promise<IEvent[]> {
    try {
      const [created, agentLinks, ...groupLinks] = await Promise.all([
        events.queryAll({
          index: 'byCreator',
          keyCondition: 'created_by = :user',
          values: { ':user': userId },
        }),
        eventAgents.queryAll({
          index: 'byUser',
          keyCondition: 'user_id = :user',
          values: { ':user': userId },
        }),
        ...unique(groupIds).map((groupId) =>
          eventGroups.queryAll({
            index: 'byGroup',
            keyCondition: 'group_id = :group',
            values: { ':group': groupId },
          }),
        ),
      ]);

      const createdIds = new Set(created.map((item) => item.id));
      const linkedIds = Array.from(
        new Set(
          [...agentLinks, ...groupLinks.flat()].map((link) => link.event_id),
        ),
      ).filter((id) => !createdIds.has(id));
      const linked = linkedIds.length
        ? await events.batchGet(linkedIds.map((id) => ({ id })))
        : [];

      return [...created, ...linked].map(toEvent).sort(byStartDesc);
    } catch (error) {
      return handleRepositoryError('EventRepository.findVisible', error);
    }
  }

  async updateEvent(previous: IEvent, data: IEventUpdate): Promise<IEvent> {
    try {
      const updated = await events.updateFields(
        { id: previous.id },
        {
          ...data,
          ...(data.group_ids && { group_ids: unique(data.group_ids) }),
          ...(data.agent_ids && { agent_ids: unique(data.agent_ids) }),
        },
        { condition: 'attribute_exists(id)' },
      );
      if (!updated) {
        throw new EventNotFoundError();
      }

      const linksChanged =
        data.group_ids !== undefined ||
        data.agent_ids !== undefined ||
        updated.status !== previous.status ||
        updated.start_date !== previous.start_date;
      if (linksChanged) {
        await this.writeLinks(updated, {
          group_ids: previous.groupIds,
          agent_ids: previous.agentIds,
        });
      }
      return toEvent(updated);
    } catch (error) {
      if (
        error instanceof EventNotFoundError ||
        error instanceof DynamoConditionFailedError
      ) {
        throw new EventNotFoundError();
      }
      return handleRepositoryError('EventRepository.updateEvent', error);
    }
  }

  async deleteEvent(event: IEvent): Promise<void> {
    try {
      await Promise.all([
        ...event.groupIds.map((groupId) =>
          eventGroups.delete({
            event_id: event.id,
            group_id: groupId,
          }),
        ),
        ...event.agentIds.map((userId) =>
          eventAgents.delete({
            event_id: event.id,
            user_id: userId,
          }),
        ),
      ]);
      await events.delete({ id: event.id });
    } catch (error) {
      return handleRepositoryError('EventRepository.deleteEvent', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const eventRepository = new EventRepository();
export default eventRepository;
