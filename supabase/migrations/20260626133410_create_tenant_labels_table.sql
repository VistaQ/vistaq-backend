CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE tenant_labels (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key        TEXT        NOT NULL,
  value      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE INDEX idx_tenant_labels_tenant ON tenant_labels (tenant_id);

CREATE TRIGGER trg_tenant_labels_updated_at
  BEFORE UPDATE ON tenant_labels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tenant_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_labels_read" ON tenant_labels
FOR SELECT USING (
  tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);
-- No insert/update/delete policies. Labels are seeded by developers via the
-- service role (RLS-bypassing). RLS denies all other authenticated writes by default.
