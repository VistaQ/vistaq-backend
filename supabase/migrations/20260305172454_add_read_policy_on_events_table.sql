ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_read" ON events
FOR SELECT USING (
  CASE (auth.jwt() ->> 'role')
    -- Admin sees all events in their tenant
    WHEN 'admin' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    -- Master trainer sees all events in their tenant
    WHEN 'master_trainer' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    -- Trainer sees events their managed groups are part of
    WHEN 'trainer' THEN
      id IN (
        SELECT event_id FROM event_groups
        WHERE group_id IN (
          SELECT group_id FROM group_trainers
          WHERE trainer_id = (auth.jwt() ->> 'user_id')::UUID
        )
      )
      AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    -- Group leader and agent see events their group is part of
    ELSE
      id IN (
        SELECT event_id FROM event_groups
        WHERE group_id = (
          SELECT group_id FROM users
          WHERE id = (auth.jwt() ->> 'user_id')::UUID
        )
      )
      AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  END
);