ALTER TABLE agent_codes ENABLE ROW LEVEL SECURITY;

-- Only admin can insert agent codes
CREATE POLICY "agent_codes_insert" ON agent_codes
FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'role') = 'admin'
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);

-- Only admin can update agent codes
CREATE POLICY "agent_codes_update" ON agent_codes
FOR UPDATE USING (
  (auth.jwt() ->> 'role') = 'admin'
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);

-- Only admin can delete agent codes
CREATE POLICY "agent_codes_delete" ON agent_codes
FOR DELETE USING (
  (auth.jwt() ->> 'role') = 'admin'
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);

-- Only admin can read agent codes (service role bypasses this for register flow)
CREATE POLICY "agent_codes_read" ON agent_codes
FOR SELECT USING (
  (auth.jwt() ->> 'role') = 'admin'
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);