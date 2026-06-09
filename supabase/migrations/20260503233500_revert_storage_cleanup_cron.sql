-- Reverts the SQL-driven Storage cleanup introduced by
-- 20260503233200_schedule_cleanup_old_report_files.sql.
--
-- Why: deleting rows from `storage.objects` removes only the metadata row,
-- not the underlying object bytes in Supabase Storage's S3/disk backend.
-- The actual file bytes are released only when the Storage HTTP admin API
-- deletes the object. The pg_cron-driven cleanup therefore failed its
-- stated goal of preventing bucket bloat — it would have orphaned bytes
-- behind every "deleted" metadata row.
--
-- Replacement: a Node-side cleanup routed through `supabaseService.removeFromStorage`
-- (which calls the Storage HTTP admin API correctly), exposed as
-- `POST /api/internal/cleanup-old-report-files` and triggered by an external
-- scheduler. The original migration is left in place per the repo's
-- "don't modify applied migrations" guidance — this file undoes its effect.

-- Unschedule the cron job if registered. `cron.unschedule(name)` errors when
-- the name is unknown, so guard it.
SELECT cron.unschedule('cleanup-old-report-files')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-report-files');

-- Drop the function — it should no longer be callable from anywhere.
DROP FUNCTION IF EXISTS cleanup_old_report_files();
