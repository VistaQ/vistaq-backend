-- Store ETL-provided ACS (Average Case Size) directly instead of computing it.
-- The ETL now emits an `ACS (YTD)` column and per-month `<MONTH> ACS` columns,
-- so persist the value on both the YTD and MTD sales-report tables.
-- The MTD FYC view is redefined to surface the stored MTD acs (appended last,
-- since CREATE OR REPLACE VIEW only permits adding new columns at the tail).

ALTER TABLE sales_report_ytd ADD COLUMN acs NUMERIC(15,4) NOT NULL DEFAULT 0;
ALTER TABLE sales_report_mtd ADD COLUMN acs NUMERIC(15,4) NOT NULL DEFAULT 0;

CREATE OR REPLACE VIEW sales_report_mtd_fyc AS
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
  ) AS fyct_mtd,
  m.acs
FROM sales_report_mtd m
JOIN sales_report_ytd y
  ON  y.tenant_id = m.tenant_id
  AND y.user_id   = m.user_id
  AND y.year      = m.year
  AND y.month     = m.month;
