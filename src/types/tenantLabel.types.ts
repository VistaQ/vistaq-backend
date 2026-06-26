import { Database } from '@src/types/database.types';

type TenantLabelsRow = Database['public']['Tables']['tenant_labels']['Row'];

export type ITenantLabel = Pick<
  TenantLabelsRow,
  'id' | 'tenant_id' | 'key' | 'value' | 'created_at' | 'updated_at'
>;
