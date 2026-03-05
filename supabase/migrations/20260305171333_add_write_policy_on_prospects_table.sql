CREATE POLICY "prospects_insert" ON prospects
FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'role') IN ('group_leader', 'agent')
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  AND agent_id = (auth.jwt() ->> 'user_id')::UUID
);