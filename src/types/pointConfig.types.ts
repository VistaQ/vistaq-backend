import { Database } from '@src/types/database.types';

type PointConfigsRow = Database['public']['Tables']['point_configs']['Row'];

export type IPointConfig = Pick<
  PointConfigsRow,
  'id' | 'activity' | 'points' | 'tenant_id' | 'created_at' | 'updated_at'
>;
