-- Shared updated_at trigger function (idempotent)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE sales_report_ytd (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id            UUID          NOT NULL REFERENCES upload_batches(id) ON DELETE RESTRICT,
  tenant_id           UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year                SMALLINT      NOT NULL,
  month               SMALLINT      NOT NULL CHECK (month BETWEEN 1 AND 12),
  ace                 NUMERIC(15,4) NOT NULL DEFAULT 0,
  noc                 INT           NOT NULL DEFAULT 0,
  fyct                NUMERIC(15,4) NOT NULL DEFAULT 0,
  fyct_pct            NUMERIC(10,6) NOT NULL DEFAULT 0,
  mdrt_shortage_fyct  NUMERIC(15,4) NOT NULL DEFAULT 0,
  fyc                 NUMERIC(15,4) NOT NULL DEFAULT 0,
  fyc_pct             NUMERIC(10,6) NOT NULL DEFAULT 0,
  mdrt_shortage_fyc   NUMERIC(15,4) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT uq_ytd_tenant_user_year_month UNIQUE (tenant_id, user_id, year, month)
);

CREATE INDEX idx_ytd_tenant_user       ON sales_report_ytd (tenant_id, user_id);
CREATE INDEX idx_ytd_tenant_year_month ON sales_report_ytd (tenant_id, year, month);

CREATE TRIGGER trg_ytd_updated_at
  BEFORE UPDATE ON sales_report_ytd
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
