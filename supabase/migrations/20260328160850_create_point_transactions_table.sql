CREATE TABLE point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity TEXT NOT NULL CHECK (activity IN (
    'prospect_created',
    'appointment_set',
    'sales_meeting',
    'sale_closed'
  )),
  points INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_point_transactions_tenant_id ON point_transactions(tenant_id);
CREATE INDEX idx_point_transactions_user_id ON point_transactions(user_id);