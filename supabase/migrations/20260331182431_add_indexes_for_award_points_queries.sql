-- Composite index for point_configs lookup in award-points edge function
-- Query pattern: WHERE tenant_id = ? AND activity = ?
CREATE INDEX idx_point_configs_tenant_id_activity ON point_configs(tenant_id, activity);

-- Composite index for idempotency check in award-points edge function
-- Query pattern: WHERE tenant_id = ? AND subject_id = ? AND activity = ?
CREATE INDEX idx_point_transactions_tenant_subject_activity ON point_transactions(tenant_id, subject_id, activity);
