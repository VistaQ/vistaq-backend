-- Cleans up the raw xlsx files for completed report_jobs older than 30 days.
-- Each upload is at most ~10 MB and one is created per tenant per month, so
-- the bucket would otherwise accumulate roughly 120 MB/year/tenant of dead
-- bytes. This job keeps Storage in step with the audit retention.
--
-- The function:
--   1. Deletes the matching `storage.objects` rows by name (Storage's actual
--      file backend is removed by Supabase's storage layer when the row is
--      deleted via the storage admin API; for objects rows that's the
--      contract used by `removeFromStorage` and is mirrored here).
--   2. Blanks out `report_jobs.storage_path` for those rows so a future run
--      won't try to delete the same path again.
--
-- Schedule: daily at 03:00 UTC. Runs via pg_cron (already enabled by the
-- 20260502103639 migration).

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION cleanup_old_report_files()
RETURNS void AS $$
BEGIN
  WITH old_files AS (
    SELECT id, storage_path
    FROM report_jobs
    WHERE status = 'completed'
      AND storage_path <> ''
      AND created_at < now() - INTERVAL '30 days'
  )
  DELETE FROM storage.objects
  WHERE bucket_id = 'reports-raw'
    AND name IN (SELECT storage_path FROM old_files);

  -- Mark the jobs so the next run skips them. Keeps the audit row intact;
  -- only the Storage backing file is gone.
  UPDATE report_jobs
  SET storage_path = '',
      updated_at   = now()
  WHERE status = 'completed'
    AND storage_path <> ''
    AND created_at < now() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Idempotent schedule registration: unschedule first if it exists, then
-- schedule. `cron.schedule(name, ...)` does not dedupe by name on its own —
-- repeated migrations on a fresh DB would otherwise stack duplicate entries.
SELECT cron.unschedule('cleanup-old-report-files')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-report-files');

SELECT cron.schedule(
  'cleanup-old-report-files',
  '0 3 * * *',
  'SELECT cleanup_old_report_files();'
);
