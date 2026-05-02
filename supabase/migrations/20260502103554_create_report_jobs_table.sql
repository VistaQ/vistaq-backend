CREATE TABLE report_jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  uploaded_by     UUID        NOT NULL REFERENCES auth.users(id),
  storage_path    TEXT        NOT NULL,
  file_name       TEXT        NOT NULL,
  report_year     SMALLINT    NOT NULL,
  report_month    SMALLINT    NOT NULL CHECK (report_month BETWEEN 1 AND 12),
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  batch_id        UUID        REFERENCES upload_batches(id) ON DELETE SET NULL,
  result          JSONB,
  error_message   TEXT,
  attempts        INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_jobs_tenant_status_created
  ON report_jobs (tenant_id, status, created_at DESC);

CREATE INDEX idx_report_jobs_status_created
  ON report_jobs (status, created_at)
  WHERE status IN ('pending', 'processing');

CREATE TRIGGER trg_report_jobs_updated_at
  BEFORE UPDATE ON report_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE report_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_jobs_read" ON report_jobs
FOR SELECT USING (
  tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND (auth.jwt() ->> 'app_role') IN ('admin', 'master_trainer', 'group_leader')
);

CREATE POLICY "report_jobs_insert" ON report_jobs
FOR INSERT WITH CHECK (
  tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND uploaded_by = (auth.jwt() ->> 'user_id')::UUID
  AND (auth.jwt() ->> 'app_role') IN ('admin', 'master_trainer', 'group_leader')
);

CREATE POLICY "report_jobs_update" ON report_jobs
FOR UPDATE USING (
  tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND (auth.jwt() ->> 'app_role') IN ('admin', 'master_trainer', 'group_leader')
);

CREATE POLICY "report_jobs_delete" ON report_jobs
FOR DELETE USING (false);
