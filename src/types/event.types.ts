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
  | 'start_date'
  | 'end_date'
  | 'description'
  | 'meeting_link'
  | 'venue'
  | 'status'
  | 'type'
  | 'created_by'
  | 'created_by_role'
  | 'created_at'
  | 'updated_at'
> & {
  groupIds: string[];
  agentIds: string[];
};
