ALTER TABLE point_transactions
  ADD COLUMN subject_id UUID,
  ADD COLUMN subject_type TEXT,
  ADD CONSTRAINT subject_consistency CHECK (
    (subject_id IS NULL AND subject_type IS NULL) OR
    (subject_id IS NOT NULL AND subject_type IS NOT NULL)
  );

CREATE INDEX idx_point_transactions_subject ON point_transactions(subject_type, subject_id);