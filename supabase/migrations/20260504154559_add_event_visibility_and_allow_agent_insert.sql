-- Add visibility column
ALTER TABLE events
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'
  CHECK (visibility IN ('public', 'private'));

-- Partial index for public lookups
CREATE INDEX idx_events_visibility_public
  ON events(visibility) WHERE visibility = 'public';

-- Widen events_insert to include 'agent'
-- Pattern: always DROP + CREATE (no ALTER POLICY used anywhere in this repo)
DROP POLICY IF EXISTS "events_insert" ON events;

CREATE POLICY "events_insert" ON events
FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'app_role') IN ('admin', 'master_trainer', 'trainer', 'group_leader', 'agent')
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND created_by = (auth.jwt() ->> 'user_id')::UUID
);
