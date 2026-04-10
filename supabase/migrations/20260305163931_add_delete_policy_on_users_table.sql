CREATE POLICY "users_delete" ON users
FOR DELETE USING (
  (auth.jwt() ->> 'role') = 'admin'
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);