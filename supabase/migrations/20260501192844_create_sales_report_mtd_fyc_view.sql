CREATE VIEW sales_report_mtd_fyc AS
SELECT
  m.id,
  m.tenant_id,
  m.user_id,
  m.year,
  m.month,
  m.ace,
  m.noc,
  y.fyc  - LAG(y.fyc,  1, 0) OVER (
    PARTITION BY y.tenant_id, y.user_id, y.year ORDER BY y.month
  ) AS fyc_mtd,
  y.fyct - LAG(y.fyct, 1, 0) OVER (
    PARTITION BY y.tenant_id, y.user_id, y.year ORDER BY y.month
  ) AS fyct_mtd
FROM sales_report_mtd m
JOIN sales_report_ytd y
  ON  y.tenant_id = m.tenant_id
  AND y.user_id   = m.user_id
  AND y.year      = m.year
  AND y.month     = m.month;
