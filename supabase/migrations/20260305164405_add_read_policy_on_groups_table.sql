ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groups_read" ON groups
FOR SELECT USING (
  CASE (auth.jwt() ->> 'role')
    -- Admin sees all groups in their tenant
    WHEN 'admin' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    -- Master trainer sees all groups in their tenant
    WHEN 'master_trainer' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    -- Trainer sees only their managed groups
    WHEN 'trainer' THEN
      id IN (
        SELECT group_id FROM group_trainers
        WHERE trainer_id = (auth.jwt() ->> 'user_id')::UUID
      )

    -- Group leader and agent see only their own group
    ELSE
      id = (
        SELECT group_id FROM users
        WHERE id = (auth.jwt() ->> 'user_id')::UUID
      )
  END
);