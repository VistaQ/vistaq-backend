-- Replace date + start_time + end_time with start_date + end_date (TIMESTAMPTZ)
ALTER TABLE coaching_sessions
  ADD COLUMN start_date TIMESTAMPTZ,
  ADD COLUMN end_date TIMESTAMPTZ;

-- Migrate existing data: compose date + time into timestamptz
UPDATE coaching_sessions
SET
  start_date = (date || 'T' || start_time || ':00+00')::TIMESTAMPTZ,
  end_date   = (date || 'T' || end_time || ':00+00')::TIMESTAMPTZ;

-- Now enforce NOT NULL
ALTER TABLE coaching_sessions
  ALTER COLUMN start_date SET NOT NULL;

-- Drop old columns
ALTER TABLE coaching_sessions
  DROP COLUMN date,
  DROP COLUMN start_time,
  DROP COLUMN end_time;
