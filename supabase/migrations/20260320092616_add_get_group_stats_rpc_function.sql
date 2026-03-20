CREATE OR REPLACE FUNCTION get_group_stats()
RETURNS JSON AS $$
SELECT json_agg(group_stats ORDER BY ytd_sales_ace DESC)
FROM (
  SELECT
    g.id AS group_id,
    g.name AS group_name,
    COUNT(*) FILTER (
      WHERE p.sales_outcome = 'successful'
      AND COALESCE(p.sales_completed_at, p.updated_at) >= date_trunc('year', NOW())
    ) AS ytd_sales_noc,
    COALESCE(SUM(
      (SELECT SUM((elem->>'amount')::NUMERIC)
       FROM jsonb_array_elements(p.products_sold) AS elem)
    ) FILTER (
      WHERE p.sales_outcome = 'successful'
      AND COALESCE(p.sales_completed_at, p.updated_at) >= date_trunc('year', NOW())
    ), 0) AS ytd_sales_ace
  FROM groups g
  LEFT JOIN users u ON u.group_id = g.id
  LEFT JOIN prospects p ON p.agent_id = u.id
  WHERE g.tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
  GROUP BY g.id, g.name
) group_stats;
$$ LANGUAGE sql STABLE SECURITY INVOKER;