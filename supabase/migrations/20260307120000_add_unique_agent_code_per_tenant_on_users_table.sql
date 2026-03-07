ALTER TABLE users
  ADD CONSTRAINT users_agent_code_tenant_id_unique UNIQUE (tenant_id, agent_code);
