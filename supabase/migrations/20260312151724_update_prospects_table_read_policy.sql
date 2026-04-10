CREATE POLICY "prospects_read" ON prospects
FOR SELECT USING (
CASE (auth.jwt() ->> 'app_role'::text)
  WHEN 'admin'::text THEN
    (tenant_id = ((auth.jwt() ->> 'tenant_id'::text))::uuid)

  WHEN 'master_trainer'::text THEN
    (tenant_id = ((auth.jwt() ->> 'tenant_id'::text))::uuid)

  WHEN 'trainer'::text THEN (
    (agent_id IN (
      SELECT users.id FROM users
      WHERE users.group_id IN (
        SELECT group_trainers.group_id FROM group_trainers
        WHERE group_trainers.trainer_id = ((auth.jwt() ->> 'user_id'::text))::uuid
      )
    ))
    AND (tenant_id = ((auth.jwt() ->> 'tenant_id'::text))::uuid)
  )

  WHEN 'group_leader'::text THEN (
    (agent_id IN (
      SELECT users.id FROM users
      WHERE users.group_id = ((auth.jwt() ->> 'group_id'::text))::uuid
    ))
    AND (tenant_id = ((auth.jwt() ->> 'tenant_id'::text))::uuid)
  )

  WHEN 'agent'::text THEN (
    (agent_id = ((auth.jwt() ->> 'user_id'::text))::uuid)
    AND (tenant_id = ((auth.jwt() ->> 'tenant_id'::text))::uuid)
  )

  ELSE false
END
);