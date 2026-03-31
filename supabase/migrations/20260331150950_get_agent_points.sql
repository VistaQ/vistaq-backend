-- Function A: summary (total + per-category totals)
-- Joins point_configs to derive category from activity, making this future-proof
-- when coaching/sales activities are added.
CREATE OR REPLACE FUNCTION get_agent_points_summary(
  p_tenant_id UUID,
  p_user_id   UUID
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_total    INT;
  v_prospect INT;
  v_sales    INT;
  v_coaching INT;
BEGIN
  SELECT
    COALESCE(SUM(pt.points), 0),
    COALESCE(SUM(pt.points) FILTER (WHERE pc.category = 'prospect'), 0),
    COALESCE(SUM(pt.points) FILTER (WHERE pc.category = 'sales'),    0),
    COALESCE(SUM(pt.points) FILTER (WHERE pc.category = 'coaching'), 0)
  INTO v_total, v_prospect, v_sales, v_coaching
  FROM public.point_transactions pt
  LEFT JOIN public.point_configs pc
    ON pc.activity   = pt.activity
   AND pc.tenant_id  = pt.tenant_id
  WHERE pt.tenant_id = p_tenant_id
    AND pt.user_id   = p_user_id;

  RETURN json_build_object(
    'total',      v_total,
    'categories', json_build_object(
      'prospect', v_prospect,
      'sales',    v_sales,
      'coaching', v_coaching
    )
  );
END;
$$;

-- Function B: paginated breakdown with prospect name and category from point_configs
CREATE OR REPLACE FUNCTION get_agent_points_breakdown(
  p_tenant_id UUID,
  p_user_id   UUID,
  p_limit     INT DEFAULT 20,
  p_offset    INT DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_rows        JSON;
  v_total_count INT;
BEGIN
  SELECT COUNT(*)
  INTO v_total_count
  FROM public.point_transactions
  WHERE tenant_id = p_tenant_id
    AND user_id   = p_user_id;

  SELECT COALESCE(json_agg(row_data), '[]'::json)
  INTO v_rows
  FROM (
    SELECT
      pt.id,
      pt.created_at           AS date,
      COALESCE(pc.category, 'prospect') AS category,
      pt.activity             AS action,
      p.prospect_name         AS subject,
      pt.points
    FROM public.point_transactions pt
    LEFT JOIN public.point_configs pc
      ON pc.activity  = pt.activity
     AND pc.tenant_id = pt.tenant_id
    LEFT JOIN public.prospects p
      ON pt.subject_type = 'prospect'
     AND pt.subject_id   = p.id
    WHERE pt.tenant_id = p_tenant_id
      AND pt.user_id   = p_user_id
    ORDER BY pt.created_at DESC
    LIMIT  p_limit
    OFFSET p_offset
  ) row_data;

  RETURN json_build_object(
    'rows',        v_rows,
    'total_count', v_total_count
  );
END;
$$;
