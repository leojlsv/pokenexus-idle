CREATE TABLE pokenexus.player_hunt_roots (
  player_id uuid PRIMARY KEY REFERENCES pokenexus.players(player_id),
  active_hunt_id uuid,
  recovery_ready_at timestamptz,
  current_policy_version uuid,
  policy_row_version bigint NOT NULL DEFAULT 0 CHECK (policy_row_version >= 0),
  command_sequence bigint NOT NULL DEFAULT 0 CHECK (command_sequence >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pokenexus.solo_hunts (
  hunt_id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  checkpoint_id uuid NOT NULL UNIQUE REFERENCES pokenexus.hunt_checkpoints(checkpoint_id),
  hunt_definition_id bytea NOT NULL
    CHECK (octet_length(hunt_definition_id) > 0 AND mod(octet_length(hunt_definition_id), 2) = 0),
  zone_id bytea NOT NULL
    CHECK (octet_length(zone_id) > 0 AND mod(octet_length(zone_id), 2) = 0),
  recovery_duration_ms bigint NOT NULL CHECK (recovery_duration_ms >= 0),
  started_at timestamptz NOT NULL,
  terminal_at timestamptz,
  terminal_reason text CHECK (terminal_reason IN ('retreat', 'no_living', 'opponent_victory', 'draw')),
  initial_policy_version uuid,
  row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (player_id, hunt_id),
  CHECK ((terminal_at IS NULL) = (terminal_reason IS NULL))
);

ALTER TABLE pokenexus.player_hunt_roots
  ADD CONSTRAINT player_hunt_roots_active_hunt_fk
  FOREIGN KEY (active_hunt_id) REFERENCES pokenexus.solo_hunts(hunt_id)
  DEFERRABLE INITIALLY IMMEDIATE;

CREATE UNIQUE INDEX solo_hunts_one_active_per_player_idx
  ON pokenexus.solo_hunts (player_id)
  WHERE terminal_at IS NULL;

CREATE TABLE pokenexus.hunt_input_authorities (
  hunt_id uuid PRIMARY KEY REFERENCES pokenexus.solo_hunts(hunt_id),
  player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  game_data_version bytea NOT NULL
    CHECK (octet_length(game_data_version) > 0 AND mod(octet_length(game_data_version), 2) = 0),
  rules_version bytea NOT NULL
    CHECK (octet_length(rules_version) > 0 AND mod(octet_length(rules_version), 2) = 0),
  runtime_inputs_json jsonb NOT NULL CHECK (jsonb_typeof(runtime_inputs_json) = 'object'),
  individualization_authority_version bytea,
  individualization_authority_key_id bytea,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (player_id, hunt_id),
  CHECK (
    (individualization_authority_version IS NULL AND individualization_authority_key_id IS NULL)
    OR (
      individualization_authority_version IS NOT NULL
      AND individualization_authority_key_id IS NOT NULL
      AND octet_length(individualization_authority_version) > 0
      AND mod(octet_length(individualization_authority_version), 2) = 0
      AND octet_length(individualization_authority_key_id) > 0
      AND mod(octet_length(individualization_authority_key_id), 2) = 0
    )
  )
);

CREATE TABLE pokenexus.hunt_public_commands (
  command_id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  idempotency_key uuid NOT NULL,
  command_kind text NOT NULL CHECK (command_kind IN (
    'start', 'checkpoint', 'claim', 'retreat', 'manual_capture', 'heal_item', 'policy_replace'
  )),
  intent_hash bytea NOT NULL CHECK (octet_length(intent_hash) = 32),
  intent_json jsonb NOT NULL CHECK (jsonb_typeof(intent_json) = 'object'),
  server_context_json jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(server_context_json) = 'object'),
  command_status text NOT NULL CHECK (command_status IN ('pending', 'terminal', 'gone')),
  acceptance_sequence bigint NOT NULL CHECK (acceptance_sequence > 0),
  source_hunt_id uuid REFERENCES pokenexus.solo_hunts(hunt_id),
  advancement_hunt_id uuid REFERENCES pokenexus.solo_hunts(hunt_id),
  target_logical_time_ms bigint
    CHECK (target_logical_time_ms BETWEEN 0 AND 9007199254740991),
  target_wall_clock_at timestamptz,
  claim_effects jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(claim_effects) = 'object'),
  result_http_status smallint CHECK (result_http_status BETWEEN 100 AND 599),
  result_json jsonb,
  accepted_at timestamptz NOT NULL,
  terminal_at timestamptz,
  continuation_expires_at timestamptz NOT NULL,
  tombstone_expires_at timestamptz NOT NULL,
  CHECK (
    (command_status = 'pending' AND result_http_status IS NULL AND result_json IS NULL AND terminal_at IS NULL)
    OR (command_status = 'terminal' AND result_http_status IS NOT NULL AND result_json IS NOT NULL AND terminal_at IS NOT NULL)
    OR (command_status = 'gone' AND result_http_status IS NULL AND result_json IS NULL)
  ),
  UNIQUE (player_id, idempotency_key)
);

CREATE INDEX hunt_public_commands_pending_idx
  ON pokenexus.hunt_public_commands (player_id, command_status, accepted_at);

CREATE TABLE pokenexus.hunt_pending_zone_selections (
  player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  zone_id bytea NOT NULL
    CHECK (octet_length(zone_id) > 0 AND mod(octet_length(zone_id), 2) = 0),
  hunt_definition_id bytea NOT NULL
    CHECK (octet_length(hunt_definition_id) > 0 AND mod(octet_length(hunt_definition_id), 2) = 0),
  selection_json jsonb NOT NULL CHECK (jsonb_typeof(selection_json) = 'object'),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (player_id, zone_id)
);

CREATE TABLE pokenexus.hunt_auto_capture_policies (
  policy_version uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  row_version bigint NOT NULL CHECK (row_version > 0),
  ball_authority_version bytea NOT NULL
    CHECK (octet_length(ball_authority_version) > 0 AND mod(octet_length(ball_authority_version), 2) = 0),
  validation_game_data_version bytea NOT NULL
    CHECK (octet_length(validation_game_data_version) > 0 AND mod(octet_length(validation_game_data_version), 2) = 0),
  enabled boolean NOT NULL,
  policy_json jsonb NOT NULL CHECK (jsonb_typeof(policy_json) = 'object'),
  created_at timestamptz NOT NULL,
  UNIQUE (player_id, row_version)
);

ALTER TABLE pokenexus.player_hunt_roots
  ADD CONSTRAINT player_hunt_roots_current_policy_fk
  FOREIGN KEY (current_policy_version) REFERENCES pokenexus.hunt_auto_capture_policies(policy_version)
  DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE pokenexus.solo_hunts
  ADD CONSTRAINT solo_hunts_initial_policy_fk
  FOREIGN KEY (initial_policy_version) REFERENCES pokenexus.hunt_auto_capture_policies(policy_version);

CREATE TABLE pokenexus.hunt_policy_intervals (
  hunt_id uuid NOT NULL REFERENCES pokenexus.solo_hunts(hunt_id),
  effective_logical_time_ms bigint NOT NULL
    CHECK (effective_logical_time_ms BETWEEN 0 AND 9007199254740991),
  policy_version uuid REFERENCES pokenexus.hunt_auto_capture_policies(policy_version),
  PRIMARY KEY (hunt_id, effective_logical_time_ms)
);

CREATE TABLE pokenexus.hunt_pending_manual_captures (
  player_id uuid PRIMARY KEY REFERENCES pokenexus.players(player_id),
  source_hunt_id uuid NOT NULL REFERENCES pokenexus.solo_hunts(hunt_id),
  encounter_id bytea NOT NULL
    CHECK (octet_length(encounter_id) > 0 AND mod(octet_length(encounter_id), 2) = 0),
  species_id bytea NOT NULL
    CHECK (octet_length(species_id) > 0 AND mod(octet_length(species_id), 2) = 0),
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 200),
  catch_rate smallint NOT NULL CHECK (catch_rate BETWEEN 3 AND 255),
  shiny boolean NOT NULL,
  capture_evidence_json jsonb NOT NULL CHECK (jsonb_typeof(capture_evidence_json) = 'object'),
  created_at timestamptz NOT NULL,
  UNIQUE (source_hunt_id, encounter_id)
);

CREATE TABLE pokenexus.hunt_encounter_boundaries (
  hunt_id uuid NOT NULL REFERENCES pokenexus.solo_hunts(hunt_id),
  encounter_id bytea NOT NULL
    CHECK (octet_length(encounter_id) > 0 AND mod(octet_length(encounter_id), 2) = 0),
  encounter_ordinal bigint NOT NULL CHECK (encounter_ordinal > 0),
  completed_logical_time_ms bigint NOT NULL
    CHECK (completed_logical_time_ms BETWEEN 0 AND 9007199254740991),
  policy_version uuid REFERENCES pokenexus.hunt_auto_capture_policies(policy_version),
  boundary_status text NOT NULL CHECK (boundary_status IN ('frozen', 'capture_committed', 'reward_committed', 'committed')),
  reward_rng_json jsonb NOT NULL CHECK (jsonb_typeof(reward_rng_json) = 'object'),
  capture_rng_json jsonb CHECK (capture_rng_json IS NULL OR jsonb_typeof(capture_rng_json) = 'object'),
  pre_reward_inventory_row_version bigint CHECK (pre_reward_inventory_row_version >= 0),
  reward_resolution_id uuid REFERENCES pokenexus.reward_resolutions(resolution_id),
  automatic_disposition text CHECK (automatic_disposition IN ('attempt', 'no_eligible_ball', 'disabled')),
  selected_item_id bytea,
  automatic_attempt_correlation bytea,
  automatic_capture_success boolean,
  automatic_capture_shiny boolean,
  manual_disposition text CHECK (manual_disposition IN ('created_pending', 'blocked_existing', 'not_applicable')),
  created_at timestamptz NOT NULL,
  committed_at timestamptz,
  PRIMARY KEY (hunt_id, encounter_id),
  CHECK (
    selected_item_id IS NULL
    OR (octet_length(selected_item_id) > 0 AND mod(octet_length(selected_item_id), 2) = 0)
  ),
  CHECK (
    automatic_attempt_correlation IS NULL
    OR (octet_length(automatic_attempt_correlation) > 0 AND mod(octet_length(automatic_attempt_correlation), 2) = 0)
  )
);

CREATE TABLE pokenexus.hunt_healing_commands (
  command_id uuid PRIMARY KEY REFERENCES pokenexus.hunt_public_commands(command_id),
  player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  source_hunt_id uuid NOT NULL REFERENCES pokenexus.solo_hunts(hunt_id),
  item_id bytea NOT NULL
    CHECK (octet_length(item_id) > 0 AND mod(octet_length(item_id), 2) = 0),
  target_pokemon_instance_id uuid NOT NULL,
  item_rule_version bytea NOT NULL
    CHECK (octet_length(item_rule_version) > 0 AND mod(octet_length(item_rule_version), 2) = 0),
  game_data_version bytea NOT NULL
    CHECK (octet_length(game_data_version) > 0 AND mod(octet_length(game_data_version), 2) = 0),
  rules_version bytea NOT NULL
    CHECK (octet_length(rules_version) > 0 AND mod(octet_length(rules_version), 2) = 0),
  submission_cutoff_logical_time_ms bigint NOT NULL
    CHECK (submission_cutoff_logical_time_ms BETWEEN 0 AND 9007199254740991),
  submission_phase text CHECK (submission_phase IS NULL OR submission_phase IN ('battle', 'inter_battle')),
  submission_encounter_id bytea,
  due_logical_time_ms bigint
    CHECK (due_logical_time_ms BETWEEN 0 AND 9007199254740991),
  acceptance_sequence bigint NOT NULL CHECK (acceptance_sequence > 0),
  heal_status text NOT NULL CHECK (heal_status IN ('scheduled', 'applied', 'not_applied')),
  result_reason text CHECK (result_reason IN ('target_ineligible', 'insufficient_item', 'hunt_terminal')),
  healed_hp integer CHECK (healed_hp >= 0),
  resolved_at timestamptz,
  FOREIGN KEY (player_id, target_pokemon_instance_id)
    REFERENCES pokenexus.pokemon_instances(owner_player_id, pokemon_instance_id),
  CHECK (
    submission_encounter_id IS NULL
    OR (octet_length(submission_encounter_id) > 0 AND mod(octet_length(submission_encounter_id), 2) = 0)
  ),
  CHECK (
    (heal_status = 'scheduled' AND result_reason IS NULL AND healed_hp IS NULL AND resolved_at IS NULL)
    OR (heal_status = 'applied' AND result_reason IS NULL AND healed_hp IS NOT NULL AND healed_hp > 0 AND resolved_at IS NOT NULL)
    OR (heal_status = 'not_applied' AND result_reason IS NOT NULL AND healed_hp = 0 AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX hunt_healing_commands_due_idx
  ON pokenexus.hunt_healing_commands
    (source_hunt_id, heal_status, due_logical_time_ms, acceptance_sequence);
