import { Database } from '@src/types/database.types';

/******************************************************************************
                            Raw Row Types (Repository layer only)
******************************************************************************/

type UsersRow = Database['public']['Tables']['users']['Row'];
type TenantsRow = Database['public']['Tables']['tenants']['Row'];
type AgentCodesRow = Database['public']['Tables']['agent_codes']['Row'];
type GroupsRow = Database['public']['Tables']['groups']['Row'];
type GroupTrainersRow = Database['public']['Tables']['group_trainers']['Row'];
type ProspectsRow = Database['public']['Tables']['prospects']['Row'];

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

export type ITenant = Pick<
  TenantsRow,
  'id' | 'slug' | 'name' | 'status' | 'created_at'
>;

export type IAgentCode = Pick<
  AgentCodesRow,
  | 'id'
  | 'tenant_id'
  | 'agent_code'
  | 'user_id'
  | 'is_used'
  | 'created_at'
  | 'updated_at'
>;

export type IGroup = Pick<
  GroupsRow,
  | 'id'
  | 'tenant_id'
  | 'name'
  | 'status'
  | 'leader_id'
  | 'created_at'
  | 'updated_at'
>;
export type IGroupTrainer = Pick<
  GroupTrainersRow,
  'group_id' | 'trainer_id' | 'created_at'
>;

export type IUserWithManagedGroups = IUser & {
  managed_group_ids: string[];
};

export type IProspect = Pick<
  ProspectsRow,
  | 'id'
  | 'tenant_id'
  | 'agent_id'
  | 'prospect_name'
  | 'prospect_email'
  | 'prospect_phone'
  | 'current_stage'
  | 'prospect_entered_at'
  | 'stage_history'
  | 'appointment_date'
  | 'appointment_start_time'
  | 'appointment_end_time'
  | 'appointment_location'
  | 'appointment_status'
  | 'appointment_completed_at'
  | 'sales_parts_completed'
  | 'products_sold'
  | 'sales_outcome'
  | 'unsuccessful_reason'
  | 'sales_completed_at'
  | 'created_at'
  | 'updated_at'
>;
