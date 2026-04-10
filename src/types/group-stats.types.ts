/******************************************************************************
                        Group Stats Domain Types
******************************************************************************/

export type IGroupStats = {
  group_id: string;
  group_name: string;
  ytd_prospects: number;
  ytd_appointments_set: number;
  ytd_sales_meetings: number;
  ytd_sales_noc: number;
  ytd_sales_ace: number;
  ytd_agents_count: number;
};
