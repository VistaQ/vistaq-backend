ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read" ON users
FOR SELECT USING (
  CASE (auth.jwt() ->> 'role')
    -- Admin sees all users in their tenant
    WHEN 'admin' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    -- Master trainer sees master_trainer, trainer, group_leader, agent
    WHEN 'master_trainer' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
      AND role IN ('master_trainer', 'trainer', 'group_leader', 'agent')

    -- Trainer sees members of their managed groups
    WHEN 'trainer' THEN
      group_id IN (
        SELECT group_id FROM group_trainers
        WHERE trainer_id = (auth.jwt() ->> 'user_id')::UUID
      )

    -- Group leader sees their group members
    WHEN 'group_leader' THEN
      group_id = (
        SELECT group_id FROM users
        WHERE id = (auth.jwt() ->> 'user_id')::UUID
      )

    -- Agent sees only themselves
    WHEN 'agent' THEN
      id = (auth.jwt() ->> 'user_id')::UUID

    ELSE false
  END
);