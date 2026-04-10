CREATE POLICY "prospects_delete" ON prospects
FOR DELETE USING (
  (
    agent_id = (auth.jwt() ->> 'user_id')::UUID
    OR (auth.jwt() ->> 'role') = 'admin'
  )
  AND tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
);