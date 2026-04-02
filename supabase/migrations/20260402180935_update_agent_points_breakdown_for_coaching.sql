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
      COALESCE(
        p.prospect_name,
        cs.title
      )                       AS subject,
      pt.points
    FROM public.point_transactions pt
    LEFT JOIN public.point_configs pc
      ON pc.activity  = pt.activity
     AND pc.tenant_id = pt.tenant_id
    LEFT JOIN public.prospects p
      ON pt.subject_type = 'prospect'
     AND pt.subject_id::UUID = p.id
    LEFT JOIN public.coaching_session_attendance csa
      ON pt.subject_type = 'coaching_session'
     AND pt.subject_id::UUID = csa.id
    LEFT JOIN public.coaching_sessions cs
      ON csa.session_id = cs.id
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
