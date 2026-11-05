export interface IEvent {
  id: string;
  tenant_id: string;
  event_title: string;
  start_date: string;
  end_date: string | null;
  description: string | null;
  meeting_link: string | null;
  venue: string | null;
  status: string;
  type: string;
  created_by: string | null;
  created_by_role: string | null;
  created_at: string;
  updated_at: string;
  visibility: string;
  groupIds: string[];
  agentIds: string[];
}

export interface IPublicEvent {
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
}
