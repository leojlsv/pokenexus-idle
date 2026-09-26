CREATE TABLE pokenexus.capture_attempts (
  capture_attempt_id uuid PRIMARY KEY,
  subject_player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  attempt_correlation bytea NOT NULL
    CHECK (octet_length(attempt_correlation) > 0 AND mod(octet_length(attempt_correlation), 2) = 0),
  encounter_id bytea NOT NULL
    CHECK (octet_length(encounter_id) > 0 AND mod(octet_length(encounter_id), 2) = 0),
  encounter_definition_id bytea NOT NULL
    CHECK (octet_length(encounter_definition_id) > 0 AND mod(octet_length(encounter_definition_id), 2) = 0),
  species_id bytea NOT NULL
    CHECK (octet_length(species_id) > 0 AND mod(octet_length(species_id), 2) = 0),
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 200),
  selected_item_id bytea NOT NULL
    CHECK (octet_length(selected_item_id) > 0 AND mod(octet_length(selected_item_id), 2) = 0),
  capture_rules_version bytea NOT NULL
    CHECK (octet_length(capture_rules_version) > 0 AND mod(octet_length(capture_rules_version), 2) = 0),
  capture_rules_semantics_hash bytea NOT NULL
    CHECK (octet_length(capture_rules_semantics_hash) > 0 AND mod(octet_length(capture_rules_semantics_hash), 2) = 0),
  content_version bytea NOT NULL
    CHECK (octet_length(content_version) > 0 AND mod(octet_length(content_version), 2) = 0),
  content_hash bytea NOT NULL
    CHECK (octet_length(content_hash) > 0 AND mod(octet_length(content_hash), 2) = 0),
  encounter_game_data_version bytea NOT NULL
    CHECK (octet_length(encounter_game_data_version) > 0 AND mod(octet_length(encounter_game_data_version), 2) = 0),
  encounter_rules_version bytea NOT NULL
    CHECK (octet_length(encounter_rules_version) > 0 AND mod(octet_length(encounter_rules_version), 2) = 0),
  creation_game_data_version bytea NOT NULL
    CHECK (octet_length(creation_game_data_version) > 0 AND mod(octet_length(creation_game_data_version), 2) = 0),
  creation_rules_version bytea NOT NULL
    CHECK (octet_length(creation_rules_version) > 0 AND mod(octet_length(creation_rules_version), 2) = 0),
  pending_selection_identity bytea NOT NULL
    CHECK (octet_length(pending_selection_identity) > 0 AND mod(octet_length(pending_selection_identity), 2) = 0),
  individualization_snapshot_identity bytea NOT NULL
    CHECK (octet_length(individualization_snapshot_identity) > 0 AND mod(octet_length(individualization_snapshot_identity), 2) = 0),
  individualization_snapshot_commitment bytea NOT NULL
    CHECK (octet_length(individualization_snapshot_commitment) > 0 AND mod(octet_length(individualization_snapshot_commitment), 2) = 0),
  individualization_rules_version bytea NOT NULL
    CHECK (octet_length(individualization_rules_version) > 0 AND mod(octet_length(individualization_rules_version), 2) = 0),
  derivation_authority_version bytea NOT NULL
    CHECK (octet_length(derivation_authority_version) > 0 AND mod(octet_length(derivation_authority_version), 2) = 0),
  derivation_authority_key_id bytea NOT NULL
    CHECK (octet_length(derivation_authority_key_id) > 0 AND mod(octet_length(derivation_authority_key_id), 2) = 0),
  base_chance_bp smallint NOT NULL CHECK (base_chance_bp BETWEEN 0 AND 10000),
  genetic_chance_bp smallint NOT NULL CHECK (genetic_chance_bp BETWEEN 0 AND 10000),
  final_chance_bp smallint NOT NULL CHECK (final_chance_bp BETWEEN 0 AND 9999),
  capture_roll smallint NOT NULL CHECK (capture_roll BETWEEN 0 AND 9999),
  rng_algorithm text NOT NULL CHECK (rng_algorithm = 'xorshift32-v1'),
  rng_state_before bigint NOT NULL CHECK (rng_state_before BETWEEN 1 AND 4294967295),
  rng_state_after bigint NOT NULL CHECK (rng_state_after BETWEEN 1 AND 4294967295),
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure')),
  selected_ability_id bytea,
  created_pokemon_instance_id uuid,
  accepted_at timestamptz NOT NULL,
  CHECK (
    selected_ability_id IS NULL
    OR (octet_length(selected_ability_id) > 0 AND mod(octet_length(selected_ability_id), 2) = 0)
  ),
  CHECK (
    (outcome = 'success' AND selected_ability_id IS NOT NULL AND created_pokemon_instance_id IS NOT NULL)
    OR (outcome = 'failure' AND selected_ability_id IS NULL AND created_pokemon_instance_id IS NULL)
  ),
  UNIQUE (subject_player_id, attempt_correlation),
  UNIQUE (encounter_id),
  FOREIGN KEY (subject_player_id, created_pokemon_instance_id)
    REFERENCES pokenexus.pokemon_instances(owner_player_id, pokemon_instance_id)
);

CREATE TABLE pokenexus.capture_attempt_moves (
  capture_attempt_id uuid NOT NULL REFERENCES pokenexus.capture_attempts(capture_attempt_id),
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 4),
  move_id bytea NOT NULL
    CHECK (octet_length(move_id) > 0 AND mod(octet_length(move_id), 2) = 0),
  PRIMARY KEY (capture_attempt_id, slot),
  UNIQUE (capture_attempt_id, move_id)
);

CREATE TABLE pokenexus.capture_attempt_constructions (
  capture_attempt_id uuid PRIMARY KEY REFERENCES pokenexus.capture_attempts(capture_attempt_id),
  pokemon_instance_id uuid NOT NULL,
  owner_player_id uuid NOT NULL,
  iv_hp smallint NOT NULL CHECK (iv_hp BETWEEN 0 AND 31),
  iv_atk smallint NOT NULL CHECK (iv_atk BETWEEN 0 AND 31),
  iv_def smallint NOT NULL CHECK (iv_def BETWEEN 0 AND 31),
  iv_spa smallint NOT NULL CHECK (iv_spa BETWEEN 0 AND 31),
  iv_spd smallint NOT NULL CHECK (iv_spd BETWEEN 0 AND 31),
  iv_spe smallint NOT NULL CHECK (iv_spe BETWEEN 0 AND 31),
  initial_total_experience bigint NOT NULL CHECK (initial_total_experience BETWEEN 0 AND 7999999),
  genetic_score smallint NOT NULL CHECK (genetic_score BETWEEN 0 AND 100),
  genetic_profile_a text NOT NULL,
  genetic_profile_b text NOT NULL,
  birth_profile text NOT NULL,
  shiny boolean NOT NULL,
  selected_ability_id bytea NOT NULL
    CHECK (octet_length(selected_ability_id) > 0 AND mod(octet_length(selected_ability_id), 2) = 0),
  CHECK (
    genetic_profile_a IN ('Harmony', 'Might', 'Clarity', 'Endurance', 'Resilience')
    AND genetic_profile_b IN ('Harmony', 'Might', 'Clarity', 'Endurance', 'Resilience')
    AND genetic_profile_a <> genetic_profile_b
    AND birth_profile IN (genetic_profile_a, genetic_profile_b)
  ),
  FOREIGN KEY (owner_player_id, pokemon_instance_id)
    REFERENCES pokenexus.pokemon_instances(owner_player_id, pokemon_instance_id)
);

CREATE TABLE pokenexus.species_research_counts (
  owner_player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  species_id bytea NOT NULL
    CHECK (octet_length(species_id) > 0 AND mod(octet_length(species_id), 2) = 0),
  capture_count bigint NOT NULL CHECK (capture_count > 0),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (owner_player_id, species_id)
);
