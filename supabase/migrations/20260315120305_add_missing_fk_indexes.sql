-- Add standalone indexes for FK columns not covered by a leading column in existing indexes.
-- Postgres requires an index where the FK column is the leading column for efficient
-- FK enforcement (e.g. when a referenced row is deleted, Postgres scans the referencing table).
-- Composite indexes like (tenant_id, col) cannot serve this purpose.

-- groups.leader_id -> users(id): no index at all
CREATE INDEX idx_groups_leader_id ON groups(leader_id);

-- agent_codes.user_id -> users(id): no index at all
CREATE INDEX idx_agent_codes_user_id ON agent_codes(user_id);

-- events.created_by -> users(id): only covered by composite (tenant_id, created_by)
CREATE INDEX idx_events_created_by ON events(created_by);

-- users.group_id -> groups(id): only covered by composite (tenant_id, group_id)
CREATE INDEX idx_users_group_id ON users(group_id);
