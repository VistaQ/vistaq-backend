import { Database } from '@src/types/database.types';

/******************************************************************************
                            Raw Row Types (Repository layer only)
******************************************************************************/

type UsersRow = Database['public']['Tables']['users']['Row'];
type TenantsRow = Database['public']['Tables']['tenants']['Row'];
type AgentCodesRow = Database['public']['Tables']['agent_codes']['Row'];

/******************************************************************************
                            Derived Domain Interfaces
******************************************************************************/

export type IUser = Pick<
  UsersRow,
  | 'id'
  | 'tenant_id'
  | 'email'
  | 'name'
  | 'role'
  | 'agent_code'
  | 'location'
  | 'group_id'
  | 'phone'
  | 'agency'
  | 'status'
  | 'created_at'
  | 'updated_at'
>;

export type ITenant = Pick<TenantsRow, 'id' | 'slug' | 'name' | 'status' | 'created_at'>;

export type IAgentCode = Pick<
  AgentCodesRow,
  'id' | 'tenant_id' | 'agent_code' | 'user_id' | 'is_used' | 'created_at' | 'updated_at'
>;
