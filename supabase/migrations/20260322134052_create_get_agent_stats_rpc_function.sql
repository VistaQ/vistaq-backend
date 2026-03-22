CREATE OR REPLACE FUNCTION get_agent_stats(
  p_group_id UUID,
  period_start TIMESTAMPTZ
)
RETURNS JSON AS $$
SELECT json_agg(agent_stats)
FROM (
  SELECT
    u.id AS agent_id,
    u.name AS agent_name,
    COUNT(p.id) FILTER (
      WHERE p.created_at >= period_start
    ) AS prospects,
    COUNT(p.id) FILTER (
      WHERE p.appointment_status IN ('scheduled', 'rescheduled', 'done')
      AND p.appointment_date >= period_start::DATE
    ) AS appointments_set,
    COUNT(p.id) FILTER (
      WHERE p.appointment_status = 'done'
      AND COALESCE(p.appointment_completed_at, p.updated_at) >= period_start
    ) AS sales_meetings,
    COUNT(p.id) FILTER (
      WHERE p.sales_outcome = 'successful'
      AND COALESCE(p.sales_completed_at, p.updated_at) >= period_start
    ) AS sales_noc,
    COALESCE(SUM(
      (SELECT SUM((elem->>'amount')::NUMERIC)
       FROM jsonb_array_elements(p.products_sold) AS elem)
    ) FILTER (
      WHERE p.sales_outcome = 'successful'
      AND COALESCE(p.sales_completed_at, p.updated_at) >= period_start
    ), 0) AS sales_ace
  FROM public.users u
  LEFT JOIN public.prospects p ON p.agent_id = u.id
  WHERE u.group_id = p_group_id
  AND u.role IN ('agent', 'group_leader')
  GROUP BY u.id, u.name
) agent_stats;
$$ LANGUAGE sql STABLE SECURITY INVOKER;