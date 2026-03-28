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
  GROUP BY u.id, u.name, u.agent_code, u.group_id, g.name
) leaderboard;
$$ LANGUAGE sql STABLE SECURITY DEFINER;