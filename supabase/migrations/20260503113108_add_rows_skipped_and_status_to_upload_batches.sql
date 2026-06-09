ALTER TABLE upload_batches
  ADD COLUMN rows_skipped INT NOT NULL DEFAULT 0,
  ADD COLUMN status       TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'partial', 'failed'));
