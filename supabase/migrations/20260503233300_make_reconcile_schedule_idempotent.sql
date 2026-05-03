-- Re-registers the `reconcile-stale-report-jobs` cron schedule idempotently.
-- The original migration (20260502103639) called `cron.schedule(name, ...)`
-- which doesn't dedupe by name — repeated migration runs on local resets, or
-- unusual migration replay paths, would stack duplicate entries.
--
-- This migration leaves the original migration as-is (modifying applied
-- migrations is risky), and instead unschedules-then-reschedules with the
-- same name + cron expression. The applied state is unchanged for fresh DBs;
-- existing DBs converge after the next migration run.

SELECT cron.unschedule('reconcile-stale-report-jobs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-stale-report-jobs');

SELECT cron.schedule(
  'reconcile-stale-report-jobs',
  '*/5 * * * *',
  'SELECT reconcile_stale_report_jobs();'
);
