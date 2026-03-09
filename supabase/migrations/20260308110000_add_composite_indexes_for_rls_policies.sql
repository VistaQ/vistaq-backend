-- Composite indexes to support multi-condition RLS policy WHERE clauses.
-- Single-column indexes exist but cannot cover both predicates simultaneously,
-- forcing Postgres to index-scan on one column then filter on the other.

-- users: master_trainer branch — tenant_id = ... AND role IN (...)
CREATE INDEX idx_users_tenant_id_role ON users(tenant_id, role);

-- users: trainer branch — group_id IN (...) AND tenant_id = ...
-- Also covers the bare group_id lookup (group_leader/agent/else branches)
CREATE INDEX idx_users_tenant_id_group_id ON users(tenant_id, group_id);

-- prospects: trainer + group_leader branches — group_id IN/= ... AND tenant_id = ...
CREATE INDEX idx_prospects_tenant_id_group_id ON prospects(tenant_id, group_id);

-- prospects: agent branch — agent_id = ... AND tenant_id = ...
CREATE INDEX idx_prospects_tenant_id_agent_id ON prospects(tenant_id, agent_id);

-- group_trainers: covering index — SELECT group_id FROM group_trainers WHERE trainer_id = ...
-- Avoids heap fetch by including group_id in the index
DROP INDEX idx_group_trainers_trainer_id;
CREATE INDEX idx_group_trainers_trainer_id_group_id ON group_trainers(trainer_id, group_id);

-- event_groups: covering index — SELECT event_id FROM event_groups WHERE group_id IN (...)
-- Avoids heap fetch by including event_id in the index
DROP INDEX idx_event_groups_group_id;
CREATE INDEX idx_event_groups_group_id_event_id ON event_groups(group_id, event_id);

-- events: update + delete policies — (created_by = ... OR app_role = 'admin') AND tenant_id = ...
-- The created_by branch needs (tenant_id, created_by) to avoid a full tenant scan
CREATE INDEX idx_events_tenant_id_created_by ON events(tenant_id, created_by);
