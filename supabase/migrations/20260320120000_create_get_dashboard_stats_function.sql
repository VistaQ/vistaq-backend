CREATE OR REPLACE FUNCTION get_dashboard_stats(period_start TIMESTAMPTZ)
RETURNS JSON AS $$
SELECT json_build_object(
  'prospects', COUNT(*) FILTER (WHERE created_at >= period_start),
  'appointments_set', COUNT(*) FILTER (
    WHERE appointment_status IN ('scheduled', 'rescheduled')
    AND appointment_date >= period_start::DATE
  ),
  'sales_meetings', COUNT(*) FILTER (
    WHERE appointment_status = 'done'
    AND COALESCE(appointment_completed_at, updated_at) >= period_start
  ),
  'sales_noc', COUNT(*) FILTER (
    WHERE sales_outcome = 'successful'
    AND COALESCE(sales_completed_at, updated_at) >= period_start
  ),
  'sales_ace', COALESCE(SUM(
    (SELECT SUM((elem->>'amount')::NUMERIC)
     FROM jsonb_array_elements(products_sold) AS elem)
  ) FILTER (
    WHERE sales_outcome = 'successful'
    AND COALESCE(sales_completed_at, updated_at) >= period_start
  ), 0)
)
FROM public.prospects;
$$ LANGUAGE sql STABLE SECURITY INVOKER;
