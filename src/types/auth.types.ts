import type { Database } from '@src/types/database.types';

/******************************************************************************
                            Raw Row Types (Repository layer only)
******************************************************************************/

type TenantsRow = Database['public']['Tables']['tenants']['Row'];
type GroupsRow = Database['public']['Tables']['groups']['Row'];
type GroupTrainersRow = Database['public']['Tables']['group_trainers']['Row'];
type ProspectsRow = Database['public']['Tables']['prospects']['Row'];

/******************************************************************************
                            Derived Domain Interfaces
******************************************************************************/

export interface IUser {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  agent_code: string | null;
  location: string | null;
  group_id: string | null;
  phone: string | null;
  agency: string | null;
  sales_target: number | null;
  fyct_target: number | null;
  fyc_target: number | null;
  created_at: string;
  updated_at: string;
}

export interface IUserContext extends IUser {
  signed_out_at?: string | null;
}

export type ITenant = Pick<
  TenantsRow,
  'id' | 'slug' | 'name' | 'status' | 'created_at'
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
