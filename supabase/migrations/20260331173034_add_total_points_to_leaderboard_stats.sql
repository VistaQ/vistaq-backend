-- Adds pre-computed total_points to both individual and group entries.
-- Uses correlated subqueries to avoid row multiplication from the existing
-- LEFT JOIN prospects aggregation.
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
          )
      ), 0) AS total_points
    FROM public.groups g
    LEFT JOIN public.users leader ON leader.id = g.leader_id AND leader.tenant_id = p_tenant_id
    JOIN public.users u ON u.group_id = g.id AND u.role IN ('agent', 'group_leader') AND u.tenant_id = p_tenant_id
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
