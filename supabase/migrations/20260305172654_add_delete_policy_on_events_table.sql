CREATE POLICY "events_delete" ON events
FOR DELETE USING (
  (
    (auth.jwt() ->> 'role') = 'admin'
    OR created_by = (auth.jwt() ->> 'user_id')::UUID
  )
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);