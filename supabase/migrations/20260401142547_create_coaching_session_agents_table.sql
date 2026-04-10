CREATE TABLE coaching_session_agents (
  session_id UUID NOT NULL REFERENCES coaching_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX idx_cs_agents_session_id ON coaching_session_agents(session_id);
CREATE INDEX idx_cs_agents_user_id ON coaching_session_agents(user_id);
