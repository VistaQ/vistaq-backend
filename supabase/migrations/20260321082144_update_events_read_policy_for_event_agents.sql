DROP POLICY "events_read" ON events;

CREATE POLICY "events_read" ON events
FOR SELECT USING (
  CASE (auth.jwt() ->> 'app_role')
    WHEN 'admin' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    WHEN 'master_trainer' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    WHEN 'trainer' THEN
      id IN (
        SELECT event_id FROM event_groups
        WHERE group_id IN (
          SELECT group_id FROM group_trainers
          WHERE trainer_id = (auth.jwt() ->> 'user_id')::UUID
        )
      )
      AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    ELSE (
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
      AND (
        id IN (
          SELECT event_id FROM event_groups
          WHERE group_id = (
            SELECT group_id FROM users
            WHERE id = (auth.jwt() ->> 'user_id')::UUID
          )
        )
        OR id IN (
          SELECT event_id FROM event_agents
          WHERE user_id = (auth.jwt() ->> 'user_id')::UUID
        )
      )
    )
  END
);
