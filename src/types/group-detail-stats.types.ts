import { IDashboardPeriodStats } from '@src/types/dashboard.types';

/******************************************************************************
                        Group Detail Stats Domain Types
******************************************************************************/

export type IAgentStats = {
  agent_id: string;
  agent_name: string;
  ytd_prospects: number;
  ytd_appointments_set: number;
  ytd_sales_meetings: number;
  ytd_sales_noc: number;
  ytd_sales_ace: number;
  mtd_prospects: number;
  mtd_appointments_set: number;
  mtd_sales_meetings: number;
  mtd_sales_noc: number;
  mtd_sales_ace: number;
};

export type IGroupDetailStats = {
  group_id: string;
  group_name: string;
  ytd: IDashboardPeriodStats;
  mtd: Omit<IDashboardPeriodStats, 'agents_count'>;
  agents: IAgentStats[];
};
