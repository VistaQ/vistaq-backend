CREATE POLICY "groups_delete" ON groups
FOR DELETE USING (
  (auth.jwt() ->> 'role') = 'admin'
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);