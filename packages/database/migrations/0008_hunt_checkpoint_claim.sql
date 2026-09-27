LOCK TABLE pokenexus.hunt_checkpoints IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pokenexus.hunt_checkpoints LIMIT 1) THEN
    RAISE EXCEPTION
      'TASK-037 refuses to infer Hunt identity/time anchors for pre-feature durable checkpoints';
  END IF;
END
$$;

ALTER TABLE pokenexus.hunt_checkpoints
  ADD COLUMN hunt_run_identity bytea NOT NULL
    CHECK (octet_length(hunt_run_identity) > 0
      AND mod(octet_length(hunt_run_identity), 2) = 0),
  ADD COLUMN logical_time_anchor_at timestamptz NOT NULL,
  ADD CONSTRAINT hunt_checkpoints_player_hunt_unique UNIQUE (player_id, hunt_run_identity);

CREATE TABLE pokenexus.hunt_checkpoint_advance_commands (
  command_id uuid PRIMARY KEY,
  subject_player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  checkpoint_id uuid NOT NULL REFERENCES pokenexus.hunt_checkpoints(checkpoint_id),
  command_correlation bytea NOT NULL
    CHECK (octet_length(command_correlation) > 0
      AND mod(octet_length(command_correlation), 2) = 0),
  target_logical_time_ms bigint NOT NULL
    CHECK (target_logical_time_ms BETWEEN 0 AND 9007199254740991),
  target_wall_clock_at timestamptz NOT NULL,
  base_checkpoint_row_version bigint NOT NULL CHECK (base_checkpoint_row_version >= 0),
  checkpoint_schema_version bytea NOT NULL
    CHECK (octet_length(checkpoint_schema_version) > 0
      AND mod(octet_length(checkpoint_schema_version), 2) = 0),
  game_data_version bytea NOT NULL
    CHECK (octet_length(game_data_version) > 0
      AND mod(octet_length(game_data_version), 2) = 0),
  rules_version bytea NOT NULL
    CHECK (octet_length(rules_version) > 0
      AND mod(octet_length(rules_version), 2) = 0),
  command_status text NOT NULL CHECK (command_status IN ('pending', 'advanced', 'superseded')),
  result_checkpoint_row_version bigint CHECK (result_checkpoint_row_version >= 0),
  result_logical_time_ms bigint
    CHECK (result_logical_time_ms BETWEEN 0 AND 9007199254740991),
  result_state_bytes bytea,
  accepted_at timestamptz NOT NULL,
  completed_at timestamptz,
  CHECK (
    (command_status = 'pending'
      AND result_checkpoint_row_version IS NULL
      AND result_logical_time_ms IS NULL
      AND result_state_bytes IS NULL
      AND completed_at IS NULL)
    OR
    (command_status = 'advanced'
      AND result_checkpoint_row_version IS NOT NULL
      AND result_logical_time_ms IS NOT NULL
      AND result_logical_time_ms <= target_logical_time_ms
      AND result_state_bytes IS NOT NULL
      AND completed_at IS NOT NULL)
    OR
    (command_status = 'superseded'
      AND result_checkpoint_row_version IS NOT NULL
      AND result_logical_time_ms IS NOT NULL
      AND result_logical_time_ms > target_logical_time_ms
      AND result_state_bytes IS NULL
      AND completed_at IS NOT NULL)
  ),
  UNIQUE (subject_player_id, command_correlation)
);

CREATE INDEX hunt_checkpoint_advance_commands_checkpoint_idx
  ON pokenexus.hunt_checkpoint_advance_commands (checkpoint_id, accepted_at);
