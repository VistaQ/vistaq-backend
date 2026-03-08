-- Fix infinite recursion in RLS policies caused by self-referential subqueries
-- on the users table (SELECT group_id FROM users WHERE ...).
--
-- PostgreSQL detects the self-reference at planning time and raises
-- "infinite recursion detected in policy for relation users" regardless of
-- which CASE branch would be taken at runtime.
--
-- Fix:
--  1. Inject group_id into the JWT via the custom access token hook.
--  2. Replace all "SELECT group_id FROM users WHERE id = user_id" subqueries
--     in policies with (auth.jwt() ->> 'group_id')::UUID — a pure JWT claim
--     lookup with no recursive table read.

-- =============================================================================
-- Step 1 — Update access token hook to inject group_id
-- =============================================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
  claims jsonb;
  user_app_role text;
  user_tenant_id uuid;
  user_id uuid;
  user_group_id uuid;
BEGIN
  user_id := (event ->> 'user_id')::uuid;

  SELECT role, tenant_id, group_id
  INTO user_app_role, user_tenant_id, user_group_id
  FROM public.users
  WHERE id = user_id;

  -- If no matching row was found, all variables remain NULL.
  -- Return the event unchanged rather than injecting null claims.
  IF user_app_role IS NULL THEN
    RETURN event;
  END IF;

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{app_role}',  to_jsonb(user_app_role));
  claims := jsonb_set(claims, '{tenant_id}', to_jsonb(user_tenant_id));
  claims := jsonb_set(claims, '{user_id}',   to_jsonb(user_id));
  -- Use 'null'::jsonb (JSON null) as fallback so jsonb_set doesn't receive
  -- SQL NULL, which would silently collapse the entire claims object to NULL.
  claims := jsonb_set(claims, '{group_id}',  COALESCE(to_jsonb(user_group_id), 'null'::jsonb));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================================================
-- Step 2 — Rebuild policies that contained the recursive subquery
-- =============================================================================

-- Users — read
DROP POLICY IF EXISTS "users_read" ON users;

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
      AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    WHEN 'group_leader' THEN
      group_id = (auth.jwt() ->> 'group_id')::UUID

    WHEN 'agent' THEN
      id = (auth.jwt() ->> 'user_id')::UUID

    ELSE false
  END
);

-- Groups — read
DROP POLICY IF EXISTS "groups_read" ON groups;

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
      id = (auth.jwt() ->> 'group_id')::UUID
      AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  END
);

-- Prospects — read
DROP POLICY IF EXISTS "prospects_read" ON prospects;

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
      group_id = (auth.jwt() ->> 'group_id')::UUID
      AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    WHEN 'agent' THEN
      agent_id = (auth.jwt() ->> 'user_id')::UUID
      AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    ELSE false
  END
);

-- Events — read
DROP POLICY IF EXISTS "events_read" ON events;

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
        WHERE group_id = (auth.jwt() ->> 'group_id')::UUID
      )
      AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  END
);
