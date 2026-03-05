CREATE POLICY "groups_update" ON groups
FOR UPDATE USING (
  (auth.jwt() ->> 'role') = 'admin'
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);