CREATE TABLE group_trainers (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, trainer_id)
);

CREATE INDEX idx_group_trainers_group_id ON group_trainers(group_id);
CREATE INDEX idx_group_trainers_trainer_id ON group_trainers(trainer_id);