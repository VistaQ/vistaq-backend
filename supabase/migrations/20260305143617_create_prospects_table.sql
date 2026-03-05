CREATE TABLE prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES users(id),
  group_id UUID REFERENCES groups(id),

  current_stage TEXT NOT NULL DEFAULT 'prospect' CHECK (current_stage IN ('prospect', 'appointment', 'sales')),
  stage_history JSONB NOT NULL DEFAULT '[]',

  prospect_name TEXT NOT NULL,
  prospect_email TEXT,
  prospect_phone TEXT,
  prospect_entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  appointment_date DATE,
  appointment_start_time TIME,
  appointment_end_time TIME,
  appointment_location TEXT,
  appointment_status TEXT CHECK (appointment_status IN ('scheduled', 'completed', 'cancelled')),
  appointment_completed_at TIMESTAMPTZ,

  sales_parts_completed JSONB DEFAULT '[]',
  products_sold JSONB DEFAULT '[]',
  sales_outcome TEXT CHECK (sales_outcome IN ('successful', 'unsuccessful')),
  unsuccessful_reason TEXT,
  sales_completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prospects_tenant_id ON prospects(tenant_id);
CREATE INDEX idx_prospects_agent_id ON prospects(agent_id);