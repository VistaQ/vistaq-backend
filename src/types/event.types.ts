import { Database } from '@src/types/database.types';

/******************************************************************************
                        Raw Row Types (Repository layer only)
******************************************************************************/

type EventsRow = Database['public']['Tables']['events']['Row'];

/******************************************************************************
                        Derived Domain Interfaces
******************************************************************************/

export type IEvent = Pick<
  EventsRow,
  | 'id'
  | 'tenant_id'
  | 'event_title'
  | 'date'
  | 'description'
  | 'meeting_link'
  | 'venue'
  | 'created_by'
  | 'created_by_role'
  | 'created_at'
  | 'updated_at'
>;
