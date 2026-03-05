CREATE POLICY "groups_insert" ON groups
FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'role') = 'admin'
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);