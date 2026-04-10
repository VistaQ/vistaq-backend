CREATE POLICY "events_insert" ON events
FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'role') IN ('admin', 'master_trainer', 'trainer', 'group_leader')
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND created_by = (auth.jwt() ->> 'user_id')::UUID
);