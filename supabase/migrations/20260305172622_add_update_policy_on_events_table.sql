CREATE POLICY "events_update" ON events
FOR UPDATE USING (
  (
    (auth.jwt() ->> 'role') = 'admin'
    OR created_by = (auth.jwt() ->> 'user_id')::UUID
  )
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);