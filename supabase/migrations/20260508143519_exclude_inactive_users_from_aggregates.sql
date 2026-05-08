CREATE OR REPLACE FUNCTION get_dashboard_stats(
  period_start TIMESTAMPTZ,
  p_group_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
SELECT json_build_object(
  'prospects', COUNT(*) FILTER (WHERE created_at >= period_start),
  'appointments_set', COUNT(*) FILTER (
    WHERE appointment_status IN ('scheduled', 'rescheduled', 'done')
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
FROM public.prospects
WHERE (
  p_group_id IS NULL
  OR agent_id IN (
    SELECT id FROM public.users WHERE group_id = p_group_id AND status = 'active'
  )
)
AND (
  (auth.jwt() ->> 'app_role') NOT IN ('group_leader', 'agent')
  OR agent_id = (auth.jwt() ->> 'user_id')::UUID
);
$$ LANGUAGE sql STABLE SECURITY INVOKER;

CREATE OR REPLACE FUNCTION get_group_stats()
RETURNS JSON AS $$
SELECT json_agg(group_stats ORDER BY ytd_sales_ace DESC)
FROM (
  SELECT
    g.id AS group_id,
    g.name AS group_name,
    COUNT(p.id) FILTER (
      WHERE p.created_at >= date_trunc('year', NOW())
    ) AS ytd_prospects,
    COUNT(p.id) FILTER (
      WHERE p.appointment_status IN ('scheduled', 'rescheduled', 'done')
      AND p.appointment_date >= date_trunc('year', NOW())::DATE
    ) AS ytd_appointments_set,
    COUNT(p.id) FILTER (
      WHERE p.appointment_status = 'done'
      AND COALESCE(p.appointment_completed_at, p.updated_at) >= date_trunc('year', NOW())
    ) AS ytd_sales_meetings,
    COUNT(p.id) FILTER (
      WHERE p.sales_outcome = 'successful'
      AND COALESCE(p.sales_completed_at, p.updated_at) >= date_trunc('year', NOW())
    ) AS ytd_sales_noc,
    COALESCE(SUM(
      (SELECT SUM((elem->>'amount')::NUMERIC)
       FROM jsonb_array_elements(p.products_sold) AS elem)
    ) FILTER (
      WHERE p.sales_outcome = 'successful'
      AND COALESCE(p.sales_completed_at, p.updated_at) >= date_trunc('year', NOW())
    ), 0) AS ytd_sales_ace,
    (
      SELECT COUNT(*) FROM public.users
      WHERE group_id = g.id
      AND role IN ('agent', 'group_leader')
      AND status = 'active'
    ) AS ytd_agents_count
  FROM groups g
  LEFT JOIN users u ON u.group_id = g.id AND u.status = 'active'
  LEFT JOIN prospects p ON p.agent_id = u.id
  WHERE g.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  GROUP BY g.id, g.name
) group_stats;
$$ LANGUAGE sql STABLE SECURITY INVOKER;

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
AND u.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
AND u.status = 'active';
$$ LANGUAGE sql STABLE SECURITY INVOKER;

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
  AND u.status = 'active'
  GROUP BY u.id, u.name
) agent_stats;
$$ LANGUAGE sql STABLE SECURITY INVOKER;

CREATE OR REPLACE FUNCTION get_agent_leaderboard(p_tenant_id UUID)
RETURNS JSON AS $$
SELECT json_agg(leaderboard ORDER BY total_points DESC)
FROM (
  SELECT
    u.id AS agent_id,
    u.name AS agent_name,
    u.agent_code,
    u.group_id,
    g.name AS group_name,
    COALESCE(SUM(pt.points), 0) AS total_points
  FROM public.users u
  LEFT JOIN public.groups g ON g.id = u.group_id
  LEFT JOIN public.point_transactions pt ON pt.user_id = u.id
  WHERE u.tenant_id = p_tenant_id
  AND u.role IN ('agent', 'group_leader')
  AND u.status = 'active'
  GROUP BY u.id, u.name, u.agent_code, u.group_id, g.name
) leaderboard;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_leaderboard_stats(
  p_tenant_id UUID,
  p_period_start TIMESTAMPTZ
)
RETURNS JSON AS $$
DECLARE
  v_individual JSON;
  v_groups JSON;
BEGIN
  -- Individual stats per agent/group_leader
  SELECT json_agg(individual_stats)
  INTO v_individual
  FROM (
    SELECT
      u.id AS user_id,
      u.name,
      u.agent_code,
      u.group_id,
      g.name AS group_name,
      COUNT(p.id) FILTER (WHERE p.created_at >= p_period_start) AS prospects_added,
      COUNT(p.id) FILTER (
        WHERE p.appointment_status = 'done'
        AND COALESCE(p.appointment_completed_at, p.updated_at) >= p_period_start
      ) AS appointments_completed,
      COUNT(p.id) FILTER (
        WHERE p.current_stage = 'sales'
        AND COALESCE(p.appointment_completed_at, p.updated_at) >= p_period_start
      ) AS sales_meetings,
      COUNT(p.id) FILTER (
        WHERE p.sales_outcome = 'successful'
        AND COALESCE(p.sales_completed_at, p.updated_at) >= p_period_start
      ) AS sales_successful,
      COALESCE((
        SELECT SUM(pt.points)
        FROM public.point_transactions pt
        WHERE pt.user_id   = u.id
          AND pt.tenant_id = p_tenant_id
          AND pt.created_at >= p_period_start
      ), 0) AS total_points
    FROM public.users u
    LEFT JOIN public.groups g ON g.id = u.group_id
    LEFT JOIN public.prospects p ON p.agent_id = u.id AND p.tenant_id = p_tenant_id
    WHERE u.tenant_id = p_tenant_id
      AND u.role IN ('agent', 'group_leader')
      AND u.status = 'active'
    GROUP BY u.id, u.name, u.agent_code, u.group_id, g.name
  ) individual_stats;

  -- Group aggregated stats
  SELECT json_agg(group_stats)
  INTO v_groups
  FROM (
    SELECT
      g.id AS group_id,
      g.name AS group_name,
      leader.name AS leader_name,
      COUNT(DISTINCT u.id) AS member_count,
      COUNT(p.id) FILTER (WHERE p.created_at >= p_period_start) AS prospects_added,
      COUNT(p.id) FILTER (
        WHERE p.appointment_status = 'done'
        AND COALESCE(p.appointment_completed_at, p.updated_at) >= p_period_start
      ) AS appointments_completed,
      COUNT(p.id) FILTER (
        WHERE p.current_stage = 'sales'
        AND COALESCE(p.appointment_completed_at, p.updated_at) >= p_period_start
      ) AS sales_meetings,
      COUNT(p.id) FILTER (
        WHERE p.sales_outcome = 'successful'
        AND COALESCE(p.sales_completed_at, p.updated_at) >= p_period_start
      ) AS sales_successful,
      COALESCE((
        SELECT SUM(pt.points)
        FROM public.point_transactions pt
        WHERE pt.tenant_id = p_tenant_id
          AND pt.created_at >= p_period_start
          AND pt.user_id IN (
            SELECT u2.id FROM public.users u2
            WHERE u2.group_id   = g.id
              AND u2.tenant_id  = p_tenant_id
              AND u2.role IN ('agent', 'group_leader')
              AND u2.status = 'active'
          )
      ), 0) AS total_points
    FROM public.groups g
    LEFT JOIN public.users leader ON leader.id = g.leader_id AND leader.tenant_id = p_tenant_id
    JOIN public.users u ON u.group_id = g.id AND u.role IN ('agent', 'group_leader') AND u.tenant_id = p_tenant_id AND u.status = 'active'
    LEFT JOIN public.prospects p ON p.agent_id = u.id AND p.tenant_id = p_tenant_id
    WHERE g.tenant_id = p_tenant_id
    GROUP BY g.id, g.name, leader.name
  ) group_stats;

  RETURN json_build_object(
    'individual', COALESCE(v_individual, '[]'::json),
    'groups', COALESCE(v_groups, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
