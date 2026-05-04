import { Database } from '@src/types/database.types';

type AgentCodeRow = Database['public']['Tables']['agent_codes']['Row'];

export type IAgentCode = Pick<
  AgentCodeRow,
  'agent_code' | 'is_used' | 'created_at' | 'updated_at'
>;
