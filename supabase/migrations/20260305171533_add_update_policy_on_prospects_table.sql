CREATE POLICY "prospects_update" ON prospects
FOR UPDATE USING (
  agent_id = (auth.jwt() ->> 'user_id')::UUID
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);