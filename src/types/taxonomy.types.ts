import { Database } from '@src/types/database.types';

type TaxonomiesRow = Database['public']['Tables']['taxonomies']['Row'];

export type ITaxonomy = Pick<
  TaxonomiesRow,
  'id' | 'tenant_id' | 'type' | 'value' | 'sort_order' | 'created_at' | 'updated_at'
>;
