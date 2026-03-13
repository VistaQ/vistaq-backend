import loggingService from '@src/services/logging.service';
import supabaseService from '@src/services/supabase.service';
import { Database } from '@src/types/database.types';
import { IEvent } from '@src/types/event.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type EventsRow = Database['public']['Tables']['events']['Row'];
type EventsInsert = Database['public']['Tables']['events']['Insert'];
type EventsUpdate = Database['public']['Tables']['events']['Update'];
type EventGroupsRow = Database['public']['Tables']['event_groups']['Row'];
type EventGroupsInsert = Database['public']['Tables']['event_groups']['Insert'];

/******************************************************************************
                            EventRepository
******************************************************************************/

class EventRepository {
  private mapRowToEvent(row: EventsRow): IEvent {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      event_title: row.event_title,
      date: row.date,
      description: row.description,
      meeting_link: row.meeting_link,
      venue: row.venue,
      created_by: row.created_by,
      created_by_role: row.created_by_role,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async insertEvent(data: EventsInsert, userToken: string): Promise<IEvent> {
    try {
      loggingService.info('EventRepository.insertEvent called');

      const response = await supabaseService.userInsert(userToken, 'events', data);

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        throw new Error('No event returned after insert');
      }

      const row = response.data[0] as unknown as EventsRow;
      return this.mapRowToEvent(row);
    } catch (error) {
      return handleRepositoryError('EventRepository.insertEvent', error);
    }
  }

  async findAll(userToken: string): Promise<IEvent[]> {
    try {
      loggingService.info('EventRepository.findAll called');

      const response = await supabaseService.userSelect(userToken, 'events', '*');

      if (response.error) {
        throw new Error(response.error.message);
      }

      const rows = (response.data ?? []) as unknown as EventsRow[];
      return rows.map((row) => this.mapRowToEvent(row));
    } catch (error) {
      return handleRepositoryError('EventRepository.findAll', error);
    }
  }

  async findById(eventId: string, userToken: string): Promise<IEvent | null> {
    try {
      loggingService.info('EventRepository.findById called', { eventId });

      const response = await supabaseService.userSelect(
        userToken,
        'events',
        '*',
        { id: eventId } as Partial<EventsRow>,
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const row = response.data[0] as unknown as EventsRow;
      return this.mapRowToEvent(row);
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
      loggingService.info('EventRepository.updateEvent called', { eventId });

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
      return this.mapRowToEvent(row);
    } catch (error) {
      return handleRepositoryError('EventRepository.updateEvent', error);
    }
  }

  async insertEventGroups(
    entries: EventGroupsInsert[],
    userToken: string,
  ): Promise<void> {
    try {
      loggingService.info('EventRepository.insertEventGroups called', {
        count: entries.length,
      });

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
      loggingService.info('EventRepository.deleteEventGroupsByEventId called', {
        eventId,
      });

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
      loggingService.info('EventRepository.findGroupsByIds called', {
        count: groupIds.length,
      });

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
      loggingService.info('EventRepository.findTrainerGroups called', {
        trainerId,
      });

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
}

/******************************************************************************
                                Export
******************************************************************************/

export const eventRepository = new EventRepository();
export default eventRepository;
