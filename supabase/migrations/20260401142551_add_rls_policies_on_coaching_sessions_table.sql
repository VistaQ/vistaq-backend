ALTER TABLE coaching_sessions ENABLE ROW LEVEL SECURITY;

-- READ: admin/master_trainer see all in tenant.
-- Trainer sees sessions they created, targeting their managed groups, targeting them directly, or all-audience.
-- Group leader/agent see sessions they created, targeting their group, targeting them directly, or all-audience.
CREATE POLICY "coaching_sessions_read" ON coaching_sessions
FOR SELECT USING (
  CASE (auth.jwt() ->> 'app_role')
    WHEN 'admin' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    WHEN 'master_trainer' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    WHEN 'trainer' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
      AND (
        created_by = (auth.jwt() ->> 'user_id')::UUID
        OR id IN (
          SELECT session_id FROM coaching_session_groups
          WHERE group_id IN (
            SELECT group_id FROM group_trainers
            WHERE trainer_id = (auth.jwt() ->> 'user_id')::UUID
          )
        )
        OR id IN (
          SELECT session_id FROM coaching_session_agents
          WHERE user_id = (auth.jwt() ->> 'user_id')::UUID
        )
        OR (
          NOT EXISTS (SELECT 1 FROM coaching_session_groups WHERE session_id = coaching_sessions.id)
          AND NOT EXISTS (SELECT 1 FROM coaching_session_agents WHERE session_id = coaching_sessions.id)
        )
      )
    ELSE (
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
      AND (
        created_by = (auth.jwt() ->> 'user_id')::UUID
        OR id IN (
          SELECT session_id FROM coaching_session_groups
          WHERE group_id = (auth.jwt() ->> 'group_id')::UUID
        )
        OR id IN (
          SELECT session_id FROM coaching_session_agents
          WHERE user_id = (auth.jwt() ->> 'user_id')::UUID
        )
        OR (
          NOT EXISTS (SELECT 1 FROM coaching_session_groups WHERE session_id = coaching_sessions.id)
          AND NOT EXISTS (SELECT 1 FROM coaching_session_agents WHERE session_id = coaching_sessions.id)
        )
      )
    )
  END
);

-- INSERT: admin, master_trainer, trainer, group_leader can create sessions
CREATE POLICY "coaching_sessions_insert" ON coaching_sessions
FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'app_role') IN ('admin', 'master_trainer', 'trainer', 'group_leader')
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND created_by = (auth.jwt() ->> 'user_id')::UUID
);

-- UPDATE: admin/master_trainer can update any, trainer/group_leader can update their own
CREATE POLICY "coaching_sessions_update" ON coaching_sessions
FOR UPDATE USING (
  (
    (auth.jwt() ->> 'app_role') IN ('admin', 'master_trainer')
    OR created_by = (auth.jwt() ->> 'user_id')::UUID
  )
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);

-- DELETE: admin/master_trainer can delete any, trainer/group_leader can delete their own
CREATE POLICY "coaching_sessions_delete" ON coaching_sessions
FOR DELETE USING (
  (
    (auth.jwt() ->> 'app_role') IN ('admin', 'master_trainer')
    OR created_by = (auth.jwt() ->> 'user_id')::UUID
  )
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);
