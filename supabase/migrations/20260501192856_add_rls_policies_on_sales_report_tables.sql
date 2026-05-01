ALTER TABLE upload_batches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_report_ytd  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_report_mtd  ENABLE ROW LEVEL SECURITY;

-- upload_batches: managers (group_leader/master_trainer/admin) can read+write within their tenant
CREATE POLICY "upload_batches_read" ON upload_batches
FOR SELECT USING (
  tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND (auth.jwt() ->> 'app_role') IN ('admin', 'master_trainer', 'group_leader')
);

CREATE POLICY "upload_batches_insert" ON upload_batches
FOR INSERT WITH CHECK (
  tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND uploaded_by = (auth.jwt() ->> 'user_id')::UUID
  AND (auth.jwt() ->> 'app_role') IN ('admin', 'master_trainer', 'group_leader')
);

CREATE POLICY "upload_batches_update" ON upload_batches
FOR UPDATE USING (
  tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND (auth.jwt() ->> 'app_role') IN ('admin', 'master_trainer', 'group_leader')
);

-- sales_report_ytd: managers read+write within tenant
CREATE POLICY "sales_report_ytd_read" ON sales_report_ytd
FOR SELECT USING (
  tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND (auth.jwt() ->> 'app_role') IN ('admin', 'master_trainer', 'group_leader')
);

CREATE POLICY "sales_report_ytd_insert" ON sales_report_ytd
FOR INSERT WITH CHECK (
  tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND (auth.jwt() ->> 'app_role') IN ('admin', 'master_trainer', 'group_leader')
);

CREATE POLICY "sales_report_ytd_update" ON sales_report_ytd
FOR UPDATE USING (
  tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND (auth.jwt() ->> 'app_role') IN ('admin', 'master_trainer', 'group_leader')
);

-- sales_report_mtd: identical
CREATE POLICY "sales_report_mtd_read" ON sales_report_mtd
FOR SELECT USING (
  tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND (auth.jwt() ->> 'app_role') IN ('admin', 'master_trainer', 'group_leader')
);

CREATE POLICY "sales_report_mtd_insert" ON sales_report_mtd
FOR INSERT WITH CHECK (
  tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND (auth.jwt() ->> 'app_role') IN ('admin', 'master_trainer', 'group_leader')
);

CREATE POLICY "sales_report_mtd_update" ON sales_report_mtd
FOR UPDATE USING (
  tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND (auth.jwt() ->> 'app_role') IN ('admin', 'master_trainer', 'group_leader')
);
