import supabaseService from '@src/services/supabase.service';
import { Database } from '@src/types/database.types';
import { IEvent } from '@src/types/event.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type EventsRow = Database['public']['Tables']['events']['Row'];
type EventsInsert = Database['public']['Tables']['events']['Insert'];
type EventsUpdate = Database['public']['Tables']['events']['Update'];
type EventGroupsRow = Database['public']['Tables']['event_groups']['Row'];
type EventGroupsInsert = Database['public']['Tables']['event_groups']['Insert'];
type EventAgentsInsert = Database['public']['Tables']['event_agents']['Insert'];

type EventWithRelationsRow = EventsRow & {
  event_groups: { group_id: string }[];
  event_agents: { user_id: string }[];
};

export type PublicEventRaw = {
  id: string;
  event_title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  type: string;
  venue: string | null;
  meeting_link: string | null;
  created_by_name: string;
  status: string;
  visibility: string;
};

/******************************************************************************
                            EventRepository
******************************************************************************/

class EventRepository {
  private mapRowWithRelationsToEvent(row: EventWithRelationsRow): IEvent {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      event_title: row.event_title,
      start_date: row.start_date,
      end_date: row.end_date,
      status: row.status,
      type: row.type,
      description: row.description,
      meeting_link: row.meeting_link,
      venue: row.venue,
      created_by: row.created_by,
      created_by_role: row.created_by_role,
      created_at: row.created_at,
      updated_at: row.updated_at,
      visibility: row.visibility,
      groupIds: (row.event_groups ?? []).map((eg) => eg.group_id),
      agentIds: (row.event_agents ?? []).map((ea) => ea.user_id),
    };
  }

  private mapInsertRowToEvent(row: EventsRow): IEvent {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      event_title: row.event_title,
      start_date: row.start_date,
      end_date: row.end_date,
      status: row.status,
      type: row.type,
      description: row.description,
      meeting_link: row.meeting_link,
      venue: row.venue,
      created_by: row.created_by,
      created_by_role: row.created_by_role,
      created_at: row.created_at,
      updated_at: row.updated_at,
      visibility: row.visibility,
      groupIds: [],
      agentIds: [],
    };
  }

  async insertEvent(data: EventsInsert, userToken: string): Promise<IEvent> {
    try {
      const response = await supabaseService.userInsert(userToken, 'events', data);

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        throw new Error('No event returned after insert');
      }

      const row = response.data[0] as unknown as EventsRow;
      return this.mapInsertRowToEvent(row);
    } catch (error) {
      return handleRepositoryError('EventRepository.insertEvent', error);
    }
  }

  async findAll(userToken: string): Promise<IEvent[]> {
    try {
      const response = await supabaseService.userSelect(
        userToken,
        'events',
        '*, event_groups(group_id), event_agents(user_id)',
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as EventWithRelationsRow[];
      return rows.map((row) => this.mapRowWithRelationsToEvent(row));
    } catch (error) {
      return handleRepositoryError('EventRepository.findAll', error);
    }
  }

  async findById(eventId: string, userToken: string): Promise<IEvent | null> {
    try {
      const response = await supabaseService.userSelect(
        userToken,
        'events',
        '*, event_groups(group_id), event_agents(user_id)',
        { id: eventId } as Partial<EventsRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const row = response.data[0] as unknown as EventWithRelationsRow;
      return this.mapRowWithRelationsToEvent(row);
    } catch (error) {
      return handleRepositoryError('EventRepository.findById', error);
    }
  }

  async updateEvent(
    eventId: string,
    data: EventsUpdate,
    userToken: string,
  ): Promise<IEvent | null> {
    try {
      const response = await supabaseService.userUpdate(
        userToken,
        'events',
        data,
        { id: eventId } as Partial<EventsRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const row = response.data[0] as unknown as EventsRow;
      return this.mapInsertRowToEvent(row);
    } catch (error) {
      return handleRepositoryError('EventRepository.updateEvent', error);
    }
  }

  async insertEventGroups(
    entries: EventGroupsInsert[],
    userToken: string,
  ): Promise<void> {
    try {
      const response = await supabaseService.userInsert(
        userToken,
        'event_groups',
        entries,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      return handleRepositoryError('EventRepository.insertEventGroups', error);
    }
  }

  async deleteEventGroupsByEventId(
    eventId: string,
    userToken: string,
  ): Promise<void> {
    try {
      const response = await supabaseService.userDelete(
        userToken,
        'event_groups',
        { event_id: eventId } as Partial<EventGroupsRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      return handleRepositoryError(
        'EventRepository.deleteEventGroupsByEventId',
        error,
      );
    }
  }

  async findGroupsByIds(
    groupIds: string[],
    userToken: string,
  ): Promise<string[]> {
    try {
      const response = await supabaseService.userSelectIn(
        userToken,
        'groups',
        'id',
        'id',
        groupIds,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as { id: string }[];
      return rows.map((r) => r.id);
    } catch (error) {
      return handleRepositoryError('EventRepository.findGroupsByIds', error);
    }
  }

  async findTrainerGroups(trainerId: string): Promise<string[]> {
    try {
      const response = await supabaseService.adminSelect(
        'group_trainers',
        'group_id',
        { trainer_id: trainerId } as Partial<
          Database['public']['Tables']['group_trainers']['Row']
        >,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as { group_id: string }[];
      return rows.map((r) => r.group_id);
    } catch (error) {
      return handleRepositoryError('EventRepository.findTrainerGroups', error);
    }
  }

  async findUsersByIdsAndRoles(
    userIds: string[],
    userToken: string,
  ): Promise<{ id: string; role: string; tenant_id: string }[]> {
    try {
      const response = await supabaseService.userSelectIn(
        userToken,
        'users',
        'id,role,tenant_id',
        'id',
        userIds,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as {
        id: string;
        role: string;
        tenant_id: string;
      }[];
      return rows;
    } catch (error) {
      return handleRepositoryError(
        'EventRepository.findUsersByIdsAndRoles',
        error,
      );
    }
  }

  async insertEventAgents(
    entries: EventAgentsInsert[],
    userToken: string,
  ): Promise<void> {
    try {
      const response = await supabaseService.userInsert(
        userToken,
        'event_agents',
        entries,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      return handleRepositoryError('EventRepository.insertEventAgents', error);
    }
  }

  async deleteEventAgentsByEventId(
    eventId: string,
    userToken: string,
  ): Promise<void> {
    try {
      const response = await supabaseService.userDelete(
        userToken,
        'event_agents',
        { event_id: eventId } as Partial<
          Database['public']['Tables']['event_agents']['Row']
        >,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      return handleRepositoryError(
        'EventRepository.deleteEventAgentsByEventId',
        error,
      );
    }
  }

  async deleteEvent(eventId: string, userToken: string): Promise<void> {
    try {
      const response = await supabaseService.userDelete(
        userToken,
        'events',
        { id: eventId } as Partial<EventsRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      return handleRepositoryError('EventRepository.deleteEvent', error);
    }
  }

  async findPublicEventById(eventId: string): Promise<PublicEventRaw | null> {
    try {
      const response = await supabaseService.adminSelectWithJoin(
        'events',
        'id, event_title, description, start_date, end_date, type, venue, meeting_link, status, visibility, users!events_created_by_fkey(name)',
        { id: eventId },
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const row = response.data[0] as unknown as {
        id: string;
        event_title: string;
        description: string | null;
        start_date: string;
        end_date: string | null;
        type: string;
        venue: string | null;
        meeting_link: string | null;
        status: string;
        visibility: string;
        users: { name: string } | null;
      };

      return {
        id: row.id,
        event_title: row.event_title,
        description: row.description,
        start_date: row.start_date,
        end_date: row.end_date,
        type: row.type,
        venue: row.venue,
        meeting_link: row.meeting_link,
        created_by_name: row.users?.name ?? '',
        status: row.status,
        visibility: row.visibility,
      };
    } catch (error) {
      return handleRepositoryError('EventRepository.findPublicEventById', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const eventRepository = new EventRepository();
export default eventRepository;
