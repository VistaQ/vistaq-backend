CREATE TABLE upload_batches (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  uploaded_by  UUID        NOT NULL REFERENCES auth.users(id),
  year         SMALLINT    NOT NULL,
  month        SMALLINT    NOT NULL CHECK (month BETWEEN 1 AND 12),
  file_name    TEXT        NOT NULL,
  rows_loaded  INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_batches_tenant_year_month ON upload_batches (tenant_id, year, month);
