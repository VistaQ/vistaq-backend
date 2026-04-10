CREATE TABLE coaching_session_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES coaching_sessions(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES users(id),
  agent_name TEXT NOT NULL,
  agent_email TEXT NOT NULL,
  group_id UUID,
  group_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, agent_id)
);

CREATE INDEX idx_cs_attendance_session_id ON coaching_session_attendance(session_id);
CREATE INDEX idx_cs_attendance_agent_id ON coaching_session_attendance(agent_id);
