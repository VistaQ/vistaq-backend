import { Database } from '@src/types/database.types';

type AgentCodeRow = Database['public']['Tables']['agent_codes']['Row'];

export type IAgentCode = Pick<
  AgentCodeRow,
  'agent_code' | 'is_used' | 'user_id' | 'created_at' | 'updated_at'
>;
