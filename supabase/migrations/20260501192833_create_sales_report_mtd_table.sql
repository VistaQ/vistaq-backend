CREATE TABLE sales_report_mtd (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    UUID          NOT NULL REFERENCES upload_batches(id) ON DELETE RESTRICT,
  tenant_id   UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year        SMALLINT      NOT NULL,
  month       SMALLINT      NOT NULL CHECK (month BETWEEN 1 AND 12),
  ace         NUMERIC(15,4) NOT NULL DEFAULT 0,
  noc         INT           NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT uq_mtd_tenant_user_year_month UNIQUE (tenant_id, user_id, year, month)
);

CREATE INDEX idx_mtd_tenant_user       ON sales_report_mtd (tenant_id, user_id);
CREATE INDEX idx_mtd_tenant_year_month ON sales_report_mtd (tenant_id, year, month);

CREATE TRIGGER trg_mtd_updated_at
  BEFORE UPDATE ON sales_report_mtd
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
