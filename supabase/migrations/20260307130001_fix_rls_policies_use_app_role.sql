-- Drop all existing policies and recreate them using app_role instead of role.
-- The 'role' JWT claim is reserved by Supabase (always 'authenticated') —
-- app_role carries the actual application-level role injected by the custom access token hook.

-- =============================================================================
-- Users
-- =============================================================================

DROP POLICY IF EXISTS "users_read"   ON users;
DROP POLICY IF EXISTS "users_insert" ON users;
DROP POLICY IF EXISTS "users_update" ON users;
DROP POLICY IF EXISTS "users_delete" ON users;

CREATE POLICY "users_read" ON users
FOR SELECT USING (
  CASE (auth.jwt() ->> 'app_role')
    WHEN 'admin' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    WHEN 'master_trainer' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
      AND role IN ('master_trainer', 'trainer', 'group_leader', 'agent')

    WHEN 'trainer' THEN
      group_id IN (
        SELECT group_id FROM group_trainers
        WHERE trainer_id = (auth.jwt() ->> 'user_id')::UUID
      )

    WHEN 'group_leader' THEN
      group_id = (
        SELECT group_id FROM users
        WHERE id = (auth.jwt() ->> 'user_id')::UUID
      )

    WHEN 'agent' THEN
      id = (auth.jwt() ->> 'user_id')::UUID

    ELSE false
  END
);

CREATE POLICY "users_insert" ON users
FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'app_role') = 'admin'
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);

CREATE POLICY "users_update" ON users
FOR UPDATE USING (
  CASE (auth.jwt() ->> 'app_role')
    WHEN 'admin' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
    ELSE
      id = (auth.jwt() ->> 'user_id')::UUID
  END
);

CREATE POLICY "users_delete" ON users
FOR DELETE USING (
  (auth.jwt() ->> 'app_role') = 'admin'
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);

-- =============================================================================
-- Groups
-- =============================================================================

DROP POLICY IF EXISTS "groups_read"   ON groups;
DROP POLICY IF EXISTS "groups_insert" ON groups;
DROP POLICY IF EXISTS "groups_update" ON groups;
DROP POLICY IF EXISTS "groups_delete" ON groups;

CREATE POLICY "groups_read" ON groups
FOR SELECT USING (
  CASE (auth.jwt() ->> 'app_role')
    WHEN 'admin' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    WHEN 'master_trainer' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    WHEN 'trainer' THEN
      id IN (
        SELECT group_id FROM group_trainers
        WHERE trainer_id = (auth.jwt() ->> 'user_id')::UUID
      )

    ELSE
      id = (
        SELECT group_id FROM users
        WHERE id = (auth.jwt() ->> 'user_id')::UUID
      )
  END
);

CREATE POLICY "groups_insert" ON groups
FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'app_role') = 'admin'
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);

CREATE POLICY "groups_update" ON groups
FOR UPDATE USING (
  (auth.jwt() ->> 'app_role') = 'admin'
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);

CREATE POLICY "groups_delete" ON groups
FOR DELETE USING (
  (auth.jwt() ->> 'app_role') = 'admin'
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);

-- =============================================================================
-- Prospects
-- =============================================================================

DROP POLICY IF EXISTS "prospects_read"   ON prospects;
DROP POLICY IF EXISTS "prospects_insert" ON prospects;
DROP POLICY IF EXISTS "prospects_update" ON prospects;
DROP POLICY IF EXISTS "prospects_delete" ON prospects;

CREATE POLICY "prospects_read" ON prospects
FOR SELECT USING (
  CASE (auth.jwt() ->> 'app_role')
    WHEN 'admin' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    WHEN 'master_trainer' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    WHEN 'trainer' THEN
      group_id IN (
        SELECT group_id FROM group_trainers
        WHERE trainer_id = (auth.jwt() ->> 'user_id')::UUID
      )
      AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    WHEN 'group_leader' THEN
      group_id = (
        SELECT group_id FROM users
        WHERE id = (auth.jwt() ->> 'user_id')::UUID
      )
      AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    WHEN 'agent' THEN
      agent_id = (auth.jwt() ->> 'user_id')::UUID
      AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    ELSE false
  END
);

CREATE POLICY "prospects_insert" ON prospects
FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'app_role') IN ('group_leader', 'agent')
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND agent_id = (auth.jwt() ->> 'user_id')::UUID
);

CREATE POLICY "prospects_update" ON prospects
FOR UPDATE USING (
  agent_id = (auth.jwt() ->> 'user_id')::UUID
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);

CREATE POLICY "prospects_delete" ON prospects
FOR DELETE USING (
  (
    agent_id = (auth.jwt() ->> 'user_id')::UUID
    OR (auth.jwt() ->> 'app_role') = 'admin'
  )
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);

-- =============================================================================
-- Events
-- =============================================================================

DROP POLICY IF EXISTS "events_read"   ON events;
DROP POLICY IF EXISTS "events_insert" ON events;
DROP POLICY IF EXISTS "events_update" ON events;
DROP POLICY IF EXISTS "events_delete" ON events;

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

CREATE POLICY "events_insert" ON events
FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'app_role') IN ('admin', 'master_trainer', 'trainer', 'group_leader')
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND created_by = (auth.jwt() ->> 'user_id')::UUID
);

CREATE POLICY "events_update" ON events
FOR UPDATE USING (
  (
    (auth.jwt() ->> 'app_role') = 'admin'
    OR created_by = (auth.jwt() ->> 'user_id')::UUID
  )
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);

CREATE POLICY "events_delete" ON events
FOR DELETE USING (
  (
    (auth.jwt() ->> 'app_role') = 'admin'
    OR created_by = (auth.jwt() ->> 'user_id')::UUID
  )
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);

-- =============================================================================
-- Agent Codes
-- =============================================================================

DROP POLICY IF EXISTS "agent_codes_read"   ON agent_codes;
DROP POLICY IF EXISTS "agent_codes_insert" ON agent_codes;
DROP POLICY IF EXISTS "agent_codes_update" ON agent_codes;
DROP POLICY IF EXISTS "agent_codes_delete" ON agent_codes;

CREATE POLICY "agent_codes_read" ON agent_codes
FOR SELECT USING (
  (auth.jwt() ->> 'app_role') = 'admin'
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);

CREATE POLICY "agent_codes_insert" ON agent_codes
FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'app_role') = 'admin'
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);

CREATE POLICY "agent_codes_update" ON agent_codes
FOR UPDATE USING (
  (auth.jwt() ->> 'app_role') = 'admin'
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);

CREATE POLICY "agent_codes_delete" ON agent_codes
FOR DELETE USING (
  (auth.jwt() ->> 'app_role') = 'admin'
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);
