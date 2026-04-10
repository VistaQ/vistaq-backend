ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prospects_read" ON prospects
FOR SELECT USING (
  CASE (auth.jwt() ->> 'role')
    -- Admin sees all prospects in their tenant
    WHEN 'admin' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    -- Master trainer sees all prospects in their tenant
    WHEN 'master_trainer' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    -- Trainer sees prospects of their managed groups
    WHEN 'trainer' THEN
      group_id IN (
        SELECT group_id FROM group_trainers
        WHERE trainer_id = (auth.jwt() ->> 'user_id')::UUID
      )
      AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    -- Group leader sees prospects of their group
    WHEN 'group_leader' THEN
      group_id = (
        SELECT group_id FROM users
        WHERE id = (auth.jwt() ->> 'user_id')::UUID
      )
      AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    -- Agent sees only their own prospects
    WHEN 'agent' THEN
      agent_id = (auth.jwt() ->> 'user_id')::UUID
      AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    ELSE false
  END
);