-- Fix indexes to match actual read access patterns (RLS subqueries, FK cascades, repository queries).

-- =============================================================================
-- 1. Covering indexes for RLS subqueries (avoid heap fetch)
-- =============================================================================

-- RLS: SELECT session_id FROM coaching_session_groups WHERE group_id IN (...)
-- Replace single-column with covering index (matches event_groups pattern)
DROP INDEX idx_cs_groups_group_id;
CREATE INDEX idx_cs_groups_group_id_session_id ON coaching_session_groups(group_id, session_id);

-- RLS: SELECT session_id FROM coaching_session_agents WHERE user_id = ...
-- Replace single-column with covering index
DROP INDEX idx_cs_agents_user_id;
CREATE INDEX idx_cs_agents_user_id_session_id ON coaching_session_agents(user_id, session_id);

-- =============================================================================
-- 2. Drop redundant indexes (PK already covers these)
-- =============================================================================

-- PK (session_id, group_id) already has session_id as leading column
DROP INDEX idx_cs_groups_session_id;

-- PK (session_id, user_id) already has session_id as leading column
DROP INDEX idx_cs_agents_session_id;

-- =============================================================================
-- 3. Standalone FK index for cascade deletes
-- =============================================================================

-- coaching_sessions.created_by -> users(id): composite (tenant_id, created_by)
-- cannot serve FK enforcement; need created_by as leading column
CREATE INDEX idx_coaching_sessions_created_by ON coaching_sessions(created_by);

-- =============================================================================
-- 4. Composite index for attendance bulk-update query
-- =============================================================================

-- bulkUpdatePendingToDidNotAttend: WHERE session_id = ? AND status = 'pending'
CREATE INDEX idx_cs_attendance_session_id_status ON coaching_session_attendance(session_id, status);

-- The single-column idx_cs_attendance_session_id is now redundant
-- (covered by the composite above + the UNIQUE constraint on session_id, agent_id)
DROP INDEX idx_cs_attendance_session_id;
