CREATE TABLE coaching_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  coaching_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  training_mode TEXT NOT NULL,
  link TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming',
  created_by UUID REFERENCES users(id),
  created_by_name TEXT,
  created_by_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coaching_sessions_tenant_id ON coaching_sessions(tenant_id);
CREATE INDEX idx_coaching_sessions_tenant_id_created_by ON coaching_sessions(tenant_id, created_by);
