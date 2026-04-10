ALTER TABLE prospects
  DROP CONSTRAINT IF EXISTS prospects_appointment_status_check,
  ADD CONSTRAINT prospects_appointment_status_check
    CHECK (appointment_status IN ('not_done', 'scheduled', 'rescheduled', 'kiv', 'done', 'declined'));

ALTER TABLE prospects
  DROP CONSTRAINT IF EXISTS prospects_sales_outcome_check,
  ADD CONSTRAINT prospects_sales_outcome_check
    CHECK (sales_outcome IN ('successful', 'kiv', 'unsuccessful'));
