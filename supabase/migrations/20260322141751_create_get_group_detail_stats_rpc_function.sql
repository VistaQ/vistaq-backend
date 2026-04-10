CREATE OR REPLACE FUNCTION get_group_detail_stats(
  p_group_id UUID,
  period_start TIMESTAMPTZ
)
RETURNS JSON AS $$
SELECT json_build_object(
  'prospects', COUNT(p.id) FILTER (
    WHERE p.created_at >= period_start
  ),
  'appointments_set', COUNT(p.id) FILTER (
    WHERE p.appointment_status IN ('scheduled', 'rescheduled', 'done')
    AND p.appointment_date >= period_start::DATE
  ),
  'sales_meetings', COUNT(p.id) FILTER (
    WHERE p.appointment_status = 'done'
    AND COALESCE(p.appointment_completed_at, p.updated_at) >= period_start
  ),
  'sales_noc', COUNT(p.id) FILTER (
    WHERE p.sales_outcome = 'successful'
    AND COALESCE(p.sales_completed_at, p.updated_at) >= period_start
  ),
  'sales_ace', COALESCE(SUM(
    (SELECT SUM((elem->>'amount')::NUMERIC)
     FROM jsonb_array_elements(p.products_sold) AS elem)
  ) FILTER (
    WHERE p.sales_outcome = 'successful'
    AND COALESCE(p.sales_completed_at, p.updated_at) >= period_start
  ), 0)
)
FROM public.users u
LEFT JOIN public.prospects p ON p.agent_id = u.id
WHERE u.group_id = p_group_id
AND u.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID;
$$ LANGUAGE sql STABLE SECURITY INVOKER;
