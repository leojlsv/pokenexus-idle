CREATE TABLE pokenexus.hunt_automation_item_uses (
  hunt_id uuid NOT NULL REFERENCES pokenexus.solo_hunts(hunt_id),
  player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  provenance_identity bytea NOT NULL
    CHECK (octet_length(provenance_identity) > 0 AND mod(octet_length(provenance_identity), 2) = 0),
  automation_family text NOT NULL CHECK (automation_family IN ('potion', 'revive')),
  phase text NOT NULL CHECK (phase IN ('battle', 'inter_battle', 'post_battle')),
  encounter_id bytea,
  encounter_ordinal bigint CHECK (encounter_ordinal IS NULL OR encounter_ordinal > 0),
  target_pokemon_instance_id uuid NOT NULL,
  target_combatant_id bytea,
  logical_time_ms bigint NOT NULL
    CHECK (logical_time_ms BETWEEN 0 AND 9007199254740991),
  policy_version uuid NOT NULL,
  item_id bytea NOT NULL
    CHECK (octet_length(item_id) > 0 AND mod(octet_length(item_id), 2) = 0),
  item_rule_version bytea NOT NULL
    CHECK (octet_length(item_rule_version) > 0 AND mod(octet_length(item_rule_version), 2) = 0),
  game_data_version bytea NOT NULL
    CHECK (octet_length(game_data_version) > 0 AND mod(octet_length(game_data_version), 2) = 0),
  rules_version bytea NOT NULL
    CHECK (octet_length(rules_version) > 0 AND mod(octet_length(rules_version), 2) = 0),
  magnitude_json jsonb NOT NULL CHECK (jsonb_typeof(magnitude_json) = 'object'),
  applied_hp integer NOT NULL CHECK (applied_hp > 0),
  resulting_hp integer NOT NULL CHECK (resulting_hp > 0),
  inventory_row_version_before bigint NOT NULL CHECK (inventory_row_version_before >= 0),
  inventory_row_version_after bigint NOT NULL CHECK (inventory_row_version_after > inventory_row_version_before),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (hunt_id, provenance_identity),
  FOREIGN KEY (player_id, target_pokemon_instance_id)
    REFERENCES pokenexus.pokemon_instances(owner_player_id, pokemon_instance_id),
  CHECK (
    (phase IN ('battle', 'post_battle')
      AND encounter_id IS NOT NULL
      AND encounter_ordinal IS NOT NULL
      AND target_combatant_id IS NOT NULL)
    OR
    (phase = 'inter_battle'
      AND target_combatant_id IS NULL)
  ),
  CHECK (
    encounter_id IS NULL
    OR (octet_length(encounter_id) > 0 AND mod(octet_length(encounter_id), 2) = 0)
  ),
  CHECK (
    target_combatant_id IS NULL
    OR (octet_length(target_combatant_id) > 0 AND mod(octet_length(target_combatant_id), 2) = 0)
  )
);

CREATE INDEX hunt_automation_item_uses_activity_idx
  ON pokenexus.hunt_automation_item_uses
    (hunt_id, logical_time_ms, created_at, automation_family);

CREATE TABLE pokenexus.hunt_post_battle_revive_applied (
  hunt_id uuid NOT NULL REFERENCES pokenexus.solo_hunts(hunt_id),
  player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  provenance_identity bytea NOT NULL
    CHECK (octet_length(provenance_identity) > 0 AND mod(octet_length(provenance_identity), 2) = 0),
  debit_correlation_identity bytea NOT NULL
    CHECK (octet_length(debit_correlation_identity) > 0 AND mod(octet_length(debit_correlation_identity), 2) = 0),
  fact_version smallint NOT NULL CHECK (fact_version = 1),
  hunt_run_identity bytea NOT NULL
    CHECK (octet_length(hunt_run_identity) > 0 AND mod(octet_length(hunt_run_identity), 2) = 0),
  encounter_id bytea NOT NULL
    CHECK (octet_length(encounter_id) > 0 AND mod(octet_length(encounter_id), 2) = 0),
  encounter_ordinal bigint NOT NULL CHECK (encounter_ordinal > 0),
  battle_id bytea NOT NULL
    CHECK (octet_length(battle_id) > 0 AND mod(octet_length(battle_id), 2) = 0),
  target_pokemon_instance_id uuid NOT NULL,
  target_combatant_id bytea NOT NULL
    CHECK (octet_length(target_combatant_id) > 0 AND mod(octet_length(target_combatant_id), 2) = 0),
  logical_time_ms bigint NOT NULL
    CHECK (logical_time_ms BETWEEN 0 AND 9007199254740991),
  policy_version uuid NOT NULL,
  item_id bytea NOT NULL
    CHECK (octet_length(item_id) > 0 AND mod(octet_length(item_id), 2) = 0),
  item_rule_version bytea NOT NULL
    CHECK (octet_length(item_rule_version) > 0 AND mod(octet_length(item_rule_version), 2) = 0),
  game_data_version bytea NOT NULL
    CHECK (octet_length(game_data_version) > 0 AND mod(octet_length(game_data_version), 2) = 0),
  rules_version bytea NOT NULL
    CHECK (octet_length(rules_version) > 0 AND mod(octet_length(rules_version), 2) = 0),
  revive_fraction_numerator smallint NOT NULL,
  revive_fraction_denominator smallint NOT NULL,
  applied_hp integer NOT NULL CHECK (applied_hp > 0),
  resulting_hp integer NOT NULL CHECK (resulting_hp > 0),
  resulting_readiness_json jsonb NOT NULL CHECK (jsonb_typeof(resulting_readiness_json) = 'object'),
  pending_selection_identity bytea NOT NULL
    CHECK (octet_length(pending_selection_identity) > 0 AND mod(octet_length(pending_selection_identity), 2) = 0),
  consumed_pending_selection_json jsonb NOT NULL CHECK (jsonb_typeof(consumed_pending_selection_json) = 'object'),
  completed_encounter_provenance_json jsonb NOT NULL CHECK (jsonb_typeof(completed_encounter_provenance_json) = 'object'),
  inventory_row_version_before bigint NOT NULL CHECK (inventory_row_version_before >= 0),
  inventory_row_version_after bigint NOT NULL CHECK (inventory_row_version_after > inventory_row_version_before),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (hunt_id, provenance_identity),
  UNIQUE (hunt_id, encounter_id),
  FOREIGN KEY (hunt_id, provenance_identity)
    REFERENCES pokenexus.hunt_automation_item_uses(hunt_id, provenance_identity),
  FOREIGN KEY (player_id, target_pokemon_instance_id)
    REFERENCES pokenexus.pokemon_instances(owner_player_id, pokemon_instance_id),
  CHECK (
    (revive_fraction_numerator = 1 AND revive_fraction_denominator IN (1, 2, 4))
  ),
  CHECK (debit_correlation_identity = provenance_identity)
);

CREATE INDEX hunt_post_battle_revive_applied_encounter_idx
  ON pokenexus.hunt_post_battle_revive_applied
    (hunt_id, encounter_ordinal, logical_time_ms);

CREATE TABLE pokenexus.hunt_retreat_abandonments (
  hunt_id uuid PRIMARY KEY REFERENCES pokenexus.solo_hunts(hunt_id),
  player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  fact_version smallint NOT NULL CHECK (fact_version = 1),
  disposition text NOT NULL CHECK (disposition = 'abandoned_by_retreat'),
  hunt_run_identity bytea NOT NULL
    CHECK (octet_length(hunt_run_identity) > 0 AND mod(octet_length(hunt_run_identity), 2) = 0),
  logical_time_ms bigint NOT NULL
    CHECK (logical_time_ms BETWEEN 0 AND 9007199254740991),
  checkpoint_id uuid NOT NULL REFERENCES pokenexus.hunt_checkpoints(checkpoint_id),
  checkpoint_row_version bigint NOT NULL CHECK (checkpoint_row_version >= 0),
  battle_id bytea,
  side_id bytea,
  combatant_id bytea,
  ko_intervention_pending boolean NOT NULL CHECK (ko_intervention_pending),
  created_at timestamptz NOT NULL,
  CHECK (
    battle_id IS NULL
    OR (octet_length(battle_id) > 0 AND mod(octet_length(battle_id), 2) = 0)
  ),
  CHECK (
    side_id IS NULL
    OR (octet_length(side_id) > 0 AND mod(octet_length(side_id), 2) = 0)
  ),
  CHECK (
    combatant_id IS NULL
    OR (octet_length(combatant_id) > 0 AND mod(octet_length(combatant_id), 2) = 0)
  ),
  CHECK (battle_id IS NOT NULL AND side_id IS NOT NULL AND combatant_id IS NOT NULL)
);

CREATE TABLE pokenexus.hunt_resolved_encounter_activity (
  hunt_id uuid NOT NULL REFERENCES pokenexus.solo_hunts(hunt_id),
  player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  schema_version text NOT NULL CHECK (schema_version = 'pokenexus.hunt-activity.v1'),
  encounter_ordinal bigint NOT NULL CHECK (encounter_ordinal > 0),
  encounter_id bytea NOT NULL
    CHECK (octet_length(encounter_id) > 0 AND mod(octet_length(encounter_id), 2) = 0),
  resolved_logical_time_ms bigint NOT NULL
    CHECK (resolved_logical_time_ms BETWEEN 0 AND 9007199254740991),
  encounter_disposition text NOT NULL CHECK (encounter_disposition IN ('victory', 'resolved_non_win')),
  activity_json jsonb NOT NULL CHECK (jsonb_typeof(activity_json) = 'object'),
  canonical_payload bytea NOT NULL CHECK (octet_length(canonical_payload) > 0),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (hunt_id, encounter_ordinal),
  UNIQUE (hunt_id, encounter_id)
);

CREATE INDEX hunt_resolved_encounter_activity_seek_idx
  ON pokenexus.hunt_resolved_encounter_activity
    (player_id, hunt_id, encounter_ordinal);
