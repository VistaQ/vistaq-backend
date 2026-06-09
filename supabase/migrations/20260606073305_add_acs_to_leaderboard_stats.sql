-- Extend get_leaderboard_stats to also surface ACS (Average Case Size = ACE / NOC)
-- per user and per group, alongside the existing ACE / FYC / FYCt metrics.
-- NOC is threaded through the `sales` CTE (from sales_report_mtd_fyc for MTD and
-- sales_report_ytd for YTD). Individual ACS = ace / noc; group ACS = SUM(ace) / SUM(noc).
-- NOC = 0 yields ACS = 0 via NULLIF + COALESCE. Quotient is raw FLOAT8 (no rounding).
-- Signature is unchanged, so this is a plain CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION get_leaderboard_stats(
  p_tenant_id    UUID,
  p_period_start TIMESTAMPTZ,
  p_period       TEXT DEFAULT 'mtd'
)
RETURNS JSON AS $$
DECLARE
  v_year       SMALLINT := EXTRACT(YEAR  FROM p_period_start)::SMALLINT;
  v_month      SMALLINT := EXTRACT(MONTH FROM p_period_start)::SMALLINT;
  v_individual JSON;
  v_groups     JSON;
BEGIN
  -- Individual stats per agent/group_leader
  WITH sales AS (
    SELECT
      s.user_id,
      COALESCE(s.ace,  0)::FLOAT8 AS ace,
      COALESCE(s.fyc,  0)::FLOAT8 AS fyc,
      COALESCE(s.fyct, 0)::FLOAT8 AS fyct,
      COALESCE(s.noc,  0)::FLOAT8 AS noc
    FROM (
      -- MTD branch
      SELECT user_id, ace, fyc_mtd AS fyc, fyct_mtd AS fyct, noc
      FROM   public.sales_report_mtd_fyc
      WHERE  p_period = 'mtd'
        AND  tenant_id = p_tenant_id
        AND  year  = v_year
        AND  month = v_month
      UNION ALL
      -- YTD branch: latest month row per user for the current year
      SELECT user_id, ace, fyc, fyct, noc FROM (
        SELECT DISTINCT ON (user_id) user_id, ace, fyc, fyct, noc
        FROM   public.sales_report_ytd
        WHERE  p_period = 'ytd'
          AND  tenant_id = p_tenant_id
          AND  year = v_year
        ORDER  BY user_id, month DESC
      ) ytd_latest
    ) s
  )
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
      ), 0) AS total_points,
      COALESCE(MAX(s.ace),  0) AS ace,
      COALESCE(MAX(s.fyc),  0) AS fyc,
      COALESCE(MAX(s.fyct), 0) AS fyct,
      COALESCE(MAX(s.ace) / NULLIF(MAX(s.noc), 0), 0) AS acs
    FROM public.users u
    LEFT JOIN public.groups g ON g.id = u.group_id
    LEFT JOIN public.prospects p ON p.agent_id = u.id AND p.tenant_id = p_tenant_id
    LEFT JOIN sales s ON s.user_id = u.id
    WHERE u.tenant_id = p_tenant_id
      AND u.role IN ('agent', 'group_leader')
      AND u.status = 'active'
    GROUP BY u.id, u.name, u.agent_code, u.group_id, g.name
  ) individual_stats;

  -- Group aggregated stats
  WITH sales AS (
    SELECT
      s.user_id,
      COALESCE(s.ace,  0)::FLOAT8 AS ace,
      COALESCE(s.fyc,  0)::FLOAT8 AS fyc,
      COALESCE(s.fyct, 0)::FLOAT8 AS fyct,
      COALESCE(s.noc,  0)::FLOAT8 AS noc
    FROM (
      SELECT user_id, ace, fyc_mtd AS fyc, fyct_mtd AS fyct, noc
      FROM   public.sales_report_mtd_fyc
      WHERE  p_period = 'mtd'
        AND  tenant_id = p_tenant_id
        AND  year  = v_year
        AND  month = v_month
      UNION ALL
      SELECT user_id, ace, fyc, fyct, noc FROM (
        SELECT DISTINCT ON (user_id) user_id, ace, fyc, fyct, noc
        FROM   public.sales_report_ytd
        WHERE  p_period = 'ytd'
          AND  tenant_id = p_tenant_id
          AND  year = v_year
        ORDER  BY user_id, month DESC
      ) ytd_latest
    ) s
  ),
  group_sales AS (
    SELECT
      u.group_id,
      SUM(s.ace)  AS ace,
      SUM(s.fyc)  AS fyc,
      SUM(s.fyct) AS fyct,
      SUM(s.noc)  AS noc
    FROM   public.users u
    JOIN   sales s ON s.user_id = u.id
    WHERE  u.tenant_id = p_tenant_id
      AND  u.status = 'active'
      AND  u.role IN ('agent', 'group_leader')
    GROUP  BY u.group_id
  )
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
      ), 0) AS total_points,
      COALESCE(MAX(gs.ace),  0) AS ace,
      COALESCE(MAX(gs.fyc),  0) AS fyc,
      COALESCE(MAX(gs.fyct), 0) AS fyct,
      COALESCE(MAX(gs.ace) / NULLIF(MAX(gs.noc), 0), 0) AS acs
    FROM public.groups g
    LEFT JOIN public.users leader ON leader.id = g.leader_id AND leader.tenant_id = p_tenant_id
    JOIN public.users u ON u.group_id = g.id AND u.role IN ('agent', 'group_leader') AND u.tenant_id = p_tenant_id AND u.status = 'active'
    LEFT JOIN public.prospects p ON p.agent_id = u.id AND p.tenant_id = p_tenant_id
    LEFT JOIN group_sales gs ON gs.group_id = g.id
    WHERE g.tenant_id = p_tenant_id
    GROUP BY g.id, g.name, leader.name
  ) group_stats;

  RETURN json_build_object(
    'individual', COALESCE(v_individual, '[]'::json),
    'groups', COALESCE(v_groups, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
