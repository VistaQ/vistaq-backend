CREATE POLICY "users_update" ON users
FOR UPDATE USING (
  CASE (auth.jwt() ->> 'role')
    -- Admin can update any user in their tenant
    WHEN 'admin' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    -- Any user can update themselves
    ELSE
      id = (auth.jwt() ->> 'user_id')::UUID
  END
);