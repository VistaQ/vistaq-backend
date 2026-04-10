import { Database } from '@src/types/database.types';

/******************************************************************************
                        Raw Row Types (Repository layer only)
******************************************************************************/

type CoachingSessionAttendanceRow =
  Database['public']['Tables']['coaching_session_attendance']['Row'];

/******************************************************************************
                        Derived Domain Interfaces
******************************************************************************/

export type ICoachingSessionAttendance = Pick<
  CoachingSessionAttendanceRow,
  | 'id'
  | 'session_id'
  | 'agent_id'
  | 'agent_name'
  | 'agent_email'
  | 'group_id'
  | 'group_name'
  | 'status'
  | 'joined_at'
  | 'created_at'
  | 'updated_at'
>;

type CoachingSessionsRow =
  Database['public']['Tables']['coaching_sessions']['Row'];

export type ICoachingSession = Pick<
  CoachingSessionsRow,
  | 'id'
  | 'tenant_id'
  | 'coaching_type'
  | 'title'
  | 'description'
  | 'start_date'
  | 'end_date'
  | 'training_mode'
  | 'link'
  | 'status'
  | 'created_by'
  | 'created_by_name'
  | 'created_by_role'
  | 'created_at'
  | 'updated_at'
> & {
  targetGroupIds: string[];
  targetAgentIds: string[];
  attendance: ICoachingSessionAttendance[];
};
