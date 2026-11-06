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

export interface ICaller {
  id: string;
  role: string;
  group_id: string | null;
}

export interface IGroup {
  id: string;
  tenant_id: string;
  name: string;
  status: string;
  leader_id: string | null;
  created_at: string;
  updated_at: string;
}

export type IUserWithManagedGroups = IUser & {
  managed_group_ids: string[];
};

export interface IStageEntry {
  stage: string;
  enteredAt: string;
}

export interface IProductSold {
  productName: string;
  amount: number;
}

export interface IProspect {
  id: string;
  tenant_id: string;
  agent_id: string;
  prospect_name: string;
  prospect_email: string | null;
  prospect_phone: string | null;
  current_stage: string;
  prospect_entered_at: string;
  stage_history: IStageEntry[];
  appointment_date: string | null;
  appointment_start_time: string | null;
  appointment_end_time: string | null;
  appointment_location: string | null;
  appointment_status: string | null;
  appointment_completed_at: string | null;
  sales_parts_completed: string[] | null;
  products_sold: IProductSold[] | null;
  sales_outcome: string | null;
  unsuccessful_reason: string | null;
  sales_completed_at: string | null;
  created_at: string;
  updated_at: string;
}
