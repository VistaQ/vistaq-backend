export interface ICoachingSessionAttendance {
  id: string;
  session_id: string;
  agent_id: string | null;
  agent_name: string;
  agent_email: string;
  group_id: string | null;
  group_name: string | null;
  status: string;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ICoachingSession {
  id: string;
  coaching_type: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  training_mode: string;
  link: string | null;
  status: string;
  created_by: string | null;
  created_by_name: string | null;
  created_by_role: string | null;
  created_at: string;
  updated_at: string;
  targetGroupIds: string[];
  targetAgentIds: string[];
  attendance_total: number;
  attendance_joined: number;
}

export interface ICoachingSessionDetail extends ICoachingSession {
  attendance: ICoachingSessionAttendance[];
}
