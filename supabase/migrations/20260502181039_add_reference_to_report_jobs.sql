-- Add a human-readable, business-meaningful identifier to report_jobs.
-- The internal UUID `id` stays as the PK for FK relationships, but the
-- `reference` becomes the public-facing identifier used in URLs, ETL
-- payloads, callbacks, and polling responses.
--
-- Format: SALES-REPORT-YYYYMMDDHHMMSSsss (UTC, ms appended for collisions
-- on rapid uploads). Example: SALES-REPORT-20260502143022873.
--
-- The UNIQUE constraint auto-creates a btree index — no separate CREATE
-- INDEX needed.
--
-- Backfill: derives a deterministic reference from each existing row's
-- created_at timestamp + a numeric offset to guarantee uniqueness for rows
-- that share a millisecond. On a freshly created remote table with no rows
-- the backfill is a no-op; locally it cleans up dev test data so the
-- subsequent NOT NULL constraint applies without error.

ALTER TABLE report_jobs
  ADD COLUMN reference TEXT;

WITH numbered AS (
  SELECT id,
         'SALES-REPORT-'
           || to_char(created_at AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSMS')
           || lpad(((row_number() OVER (ORDER BY created_at, id)) - 1)::TEXT, 3, '0')
           AS new_reference
  FROM report_jobs
  WHERE reference IS NULL
)
UPDATE report_jobs r
SET reference = n.new_reference
FROM numbered n
WHERE r.id = n.id;

ALTER TABLE report_jobs
  ALTER COLUMN reference SET NOT NULL,
  ADD CONSTRAINT report_jobs_reference_key UNIQUE (reference);
