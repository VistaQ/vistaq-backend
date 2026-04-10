CREATE TABLE event_agents (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX idx_event_agents_event_id ON event_agents(event_id);
CREATE INDEX idx_event_agents_user_id ON event_agents(user_id);
