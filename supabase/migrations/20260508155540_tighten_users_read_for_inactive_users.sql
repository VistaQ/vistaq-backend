-- Drop existing users_read policy and recreate with status='active' filter on
-- all non-admin branches to hide deactivated users from non-admin reads.
-- Admin branch is unchanged so admins can still see deactivated users to reactivate them.
DROP POLICY IF EXISTS "users_read" ON public.users;

CREATE POLICY "users_read" ON public.users
FOR SELECT USING (
  CASE (auth.jwt() ->> 'app_role')
    WHEN 'admin' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID

    WHEN 'master_trainer' THEN
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
      AND role IN ('master_trainer', 'trainer', 'group_leader', 'agent')
      AND status = 'active'

    WHEN 'trainer' THEN
      group_id IN (
        SELECT group_id FROM group_trainers
        WHERE trainer_id = (auth.jwt() ->> 'user_id')::UUID
      )
      AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
      AND status = 'active'

    WHEN 'group_leader' THEN
      group_id = (auth.jwt() ->> 'group_id')::UUID
      AND status = 'active'

    WHEN 'agent' THEN
      id = (auth.jwt() ->> 'user_id')::UUID

    ELSE false
  END
);
