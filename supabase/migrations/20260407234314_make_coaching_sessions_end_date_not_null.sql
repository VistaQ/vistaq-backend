-- Backfill any NULL end_date values with start_date + 1 hour
UPDATE coaching_sessions
SET end_date = start_date + INTERVAL '1 hour'
WHERE end_date IS NULL;

-- Enforce NOT NULL
ALTER TABLE coaching_sessions
ALTER COLUMN end_date SET NOT NULL;
