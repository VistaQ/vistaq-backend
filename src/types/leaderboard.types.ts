import { Database } from './database.types';

type LeaderboardFunction = Database['public']['Functions']['get_agent_leaderboard'];

export type ILeaderboardEntry = {
  agent_id: string;
  agent_name: string;
  agent_code: string;
  group_id: string | null;
  group_name: string | null;
  total_points: number;
};

export type { LeaderboardFunction };

export type ILeaderboardStatsIndividual = {
  user_id: string;
  name: string;
  agent_code: string;
  group_id: string | null;
  group_name: string | null;
  prospects_added: number;
  appointments_completed: number;
  sales_meetings: number;
  sales_successful: number;
  total_points: number;
};

export type ILeaderboardStatsGroup = {
  group_id: string;
  group_name: string;
  leader_name: string | null;
  member_count: number;
  prospects_added: number;
  appointments_completed: number;
  sales_meetings: number;
  sales_successful: number;
  total_points: number;
};

export type ILeaderboardStats = {
  period: 'mtd' | 'ytd';
  generated_at: string;
  individual: ILeaderboardStatsIndividual[];
  groups: ILeaderboardStatsGroup[];
};
