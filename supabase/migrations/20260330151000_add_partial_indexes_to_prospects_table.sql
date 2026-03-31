-- For prospects_added (created_at filter)
  CREATE INDEX idx_prospects_tenant_id_agent_id_created_at
    ON prospects(tenant_id, agent_id, created_at);

  -- For appointments_completed (appointment_status = 'done' is selective)
  CREATE INDEX idx_prospects_appointment_status_completed_at
    ON prospects(tenant_id, agent_id, appointment_completed_at)
    WHERE appointment_status = 'done';

  -- For sales_successful (sales_outcome = 'successful' is selective)
  CREATE INDEX idx_prospects_sales_outcome_completed_at
    ON prospects(tenant_id, agent_id, sales_completed_at)
    WHERE sales_outcome = 'successful';