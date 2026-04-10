import { Database } from '@src/types/database.types';

type PointActivityTypeRow = Database['public']['Tables']['point_activity_types']['Row'];

export type IPointActivityType = Pick<
  PointActivityTypeRow,
  'name' | 'category' | 'label' | 'subject_type'
>;
