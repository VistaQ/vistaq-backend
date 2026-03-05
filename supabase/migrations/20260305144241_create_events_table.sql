CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_title TEXT NOT NULL,
  date DATE NOT NULL,
  venue TEXT,
  meeting_link TEXT,
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_by_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_tenant_id ON events(tenant_id);