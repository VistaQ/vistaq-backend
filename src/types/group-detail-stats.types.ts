import { IDashboardPeriodStats } from '@src/types/dashboard.types';

/******************************************************************************
                        Group Detail Stats Domain Types
******************************************************************************/

export type IGroupDetailStats = {
  group_id: string;
  group_name: string;
  ytd: IDashboardPeriodStats;
  mtd: Omit<IDashboardPeriodStats, 'agents_count'>;
};
