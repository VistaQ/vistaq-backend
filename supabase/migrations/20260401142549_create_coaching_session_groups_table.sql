CREATE TABLE coaching_session_groups (
  session_id UUID NOT NULL REFERENCES coaching_sessions(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, group_id)
);

CREATE INDEX idx_cs_groups_session_id ON coaching_session_groups(session_id);
CREATE INDEX idx_cs_groups_group_id ON coaching_session_groups(group_id);
