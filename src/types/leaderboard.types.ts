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
