-- Seed sales-completion point activity catalog and per-tenant default rates.
--
-- Activities are awarded by the salesPoints service after every successful
-- sales-report ingest (sync /upload, async /jobs+/complete, manual /ingest).
-- The `point_transactions.activity` CHECK constraint was already dropped in
-- migration 20260402180932 so these new activity strings flow without further
-- schema changes. The category 'sales' is picked up automatically by the
-- existing get_agent_points_summary / get_agent_points_breakdown functions.

-- 1. Catalog entries (global, shared across tenants).
INSERT INTO point_activity_types (name, category, label, subject_type) VALUES
  ('sales_noc',  'sales', 'Issuance Certificate',     'upload_batch'),
  ('sales_fyct', 'sales', 'FYCt (per RM1,000)',       'upload_batch'),
  ('sales_ace',  'sales', 'ACE (per RM1,000)',        'upload_batch')
ON CONFLICT (name) DO NOTHING;

-- 2. Default per-tenant rates (30 pts each, matching the FE default screenshot).
--    Relies on the existing UNIQUE(tenant_id, activity) constraint defined in
--    migration 20260328160755_create_point_configs_table.sql.
INSERT INTO point_configs (tenant_id, category, activity, points)
SELECT t.id, 'sales', a.activity, 30
FROM tenants t
CROSS JOIN (VALUES ('sales_noc'), ('sales_fyct'), ('sales_ace')) AS a(activity)
ON CONFLICT (tenant_id, activity) DO NOTHING;
