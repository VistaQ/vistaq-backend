CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION reconcile_stale_report_jobs()
RETURNS void AS $$
BEGIN
  UPDATE report_jobs
  SET status        = 'failed',
      error_message = 'ETL processing timed out (no callback received within 5 min)',
      updated_at    = now()
  WHERE status IN ('pending', 'processing')
    AND created_at < now() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule(
  'reconcile-stale-report-jobs',
  '*/5 * * * *',
  'SELECT reconcile_stale_report_jobs();'
);
