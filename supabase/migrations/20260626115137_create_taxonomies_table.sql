-- Generic, tenant-configurable lookup table backing dropdown values.
-- A single table holds every kind of configurable list, distinguished by `type`
-- (e.g. 'product', 'prospect_source', 'rejection_reason'). A new dropdown is a new
-- `type` value — no schema change required.

-- Shared updated_at trigger function (idempotent; safe to re-declare).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE taxonomies (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- tenant_id scopes every entry to one tenant; cascade removes entries when a tenant is deleted.
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- type is the category of dropdown, e.g. 'product', 'prospect_source', 'rejection_reason'.
  type       TEXT        NOT NULL,
  -- value is the display string shown in the dropdown, e.g. 'Life Insurance'.
  value      TEXT        NOT NULL,
  -- sort_order controls dropdown ordering; lower appears first.
  sort_order INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- prevents duplicate values within the same type for the same tenant; different tenants
  -- or different types may reuse the same value.
  UNIQUE (tenant_id, type, value)
);

-- optimises the primary access pattern: fetch all values of one type for one tenant.
CREATE INDEX idx_taxonomies_tenant_type ON taxonomies (tenant_id, type);

CREATE TRIGGER trg_taxonomies_updated_at
  BEFORE UPDATE ON taxonomies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE taxonomies ENABLE ROW LEVEL SECURITY;

-- Reads are open to every authenticated role within the owning tenant.
CREATE POLICY "taxonomies_read" ON taxonomies
FOR SELECT USING (
  tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);

-- Mutations are admin-only and confined to the actor's own tenant.
CREATE POLICY "taxonomies_insert" ON taxonomies
FOR INSERT WITH CHECK (
  tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND (auth.jwt() ->> 'app_role') IN ('admin')
);

CREATE POLICY "taxonomies_update" ON taxonomies
FOR UPDATE USING (
  tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND (auth.jwt() ->> 'app_role') IN ('admin')
);

CREATE POLICY "taxonomies_delete" ON taxonomies
FOR DELETE USING (
  tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND (auth.jwt() ->> 'app_role') IN ('admin')
);
