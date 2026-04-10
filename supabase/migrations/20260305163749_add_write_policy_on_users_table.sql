CREATE POLICY "users_insert" ON users
FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'role') = 'admin'
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);