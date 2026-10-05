ALTER TABLE pokenexus.player_hunt_roots
  ADD COLUMN current_auto_potion_policy_version uuid,
  ADD COLUMN auto_potion_policy_row_version bigint NOT NULL DEFAULT 0 CHECK (auto_potion_policy_row_version >= 0),
  ADD COLUMN current_auto_revive_policy_version uuid,
  ADD COLUMN auto_revive_policy_row_version bigint NOT NULL DEFAULT 0 CHECK (auto_revive_policy_row_version >= 0),
  ADD CONSTRAINT player_hunt_roots_auto_potion_current_shape_ck
    CHECK ((current_auto_potion_policy_version IS NULL) = (auto_potion_policy_row_version = 0)),
  ADD CONSTRAINT player_hunt_roots_auto_revive_current_shape_ck
    CHECK ((current_auto_revive_policy_version IS NULL) = (auto_revive_policy_row_version = 0));

CREATE TABLE pokenexus.hunt_auto_potion_policies (
  policy_version uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  row_version bigint NOT NULL CHECK (row_version > 0),
  item_rule_version bytea NOT NULL
    CHECK (octet_length(item_rule_version) > 0 AND mod(octet_length(item_rule_version), 2) = 0),
  game_data_version bytea NOT NULL
    CHECK (octet_length(game_data_version) > 0 AND mod(octet_length(game_data_version), 2) = 0),
  rules_version bytea NOT NULL
    CHECK (octet_length(rules_version) > 0 AND mod(octet_length(rules_version), 2) = 0),
  enabled boolean NOT NULL,
  threshold_percent smallint NOT NULL CHECK (threshold_percent IN (90,80,70,60,50,40,30,20,10)),
  policy_json jsonb NOT NULL CHECK (jsonb_typeof(policy_json) = 'object'),
  created_at timestamptz NOT NULL,
  UNIQUE (player_id, row_version),
  UNIQUE (player_id, policy_version, row_version)
);

CREATE TABLE pokenexus.hunt_auto_revive_policies (
  policy_version uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  row_version bigint NOT NULL CHECK (row_version > 0),
  item_rule_version bytea NOT NULL
    CHECK (octet_length(item_rule_version) > 0 AND mod(octet_length(item_rule_version), 2) = 0),
  game_data_version bytea NOT NULL
    CHECK (octet_length(game_data_version) > 0 AND mod(octet_length(game_data_version), 2) = 0),
  rules_version bytea NOT NULL
    CHECK (octet_length(rules_version) > 0 AND mod(octet_length(rules_version), 2) = 0),
  enabled boolean NOT NULL,
  policy_json jsonb NOT NULL CHECK (jsonb_typeof(policy_json) = 'object'),
  created_at timestamptz NOT NULL,
  UNIQUE (player_id, row_version),
  UNIQUE (player_id, policy_version, row_version)
);

ALTER TABLE pokenexus.player_hunt_roots
  ADD CONSTRAINT player_hunt_roots_current_auto_potion_policy_fk
  FOREIGN KEY (player_id, current_auto_potion_policy_version, auto_potion_policy_row_version)
    REFERENCES pokenexus.hunt_auto_potion_policies(player_id, policy_version, row_version)
    DEFERRABLE INITIALLY IMMEDIATE,
  ADD CONSTRAINT player_hunt_roots_current_auto_revive_policy_fk
  FOREIGN KEY (player_id, current_auto_revive_policy_version, auto_revive_policy_row_version)
    REFERENCES pokenexus.hunt_auto_revive_policies(player_id, policy_version, row_version)
    DEFERRABLE INITIALLY IMMEDIATE;

CREATE TABLE pokenexus.hunt_auto_potion_policy_intervals (
  hunt_id uuid NOT NULL REFERENCES pokenexus.solo_hunts(hunt_id),
  effective_logical_time_ms bigint NOT NULL
    CHECK (effective_logical_time_ms BETWEEN 0 AND 9007199254740991),
  policy_version uuid REFERENCES pokenexus.hunt_auto_potion_policies(policy_version),
  PRIMARY KEY (hunt_id, effective_logical_time_ms)
);

CREATE TABLE pokenexus.hunt_auto_revive_policy_intervals (
  hunt_id uuid NOT NULL REFERENCES pokenexus.solo_hunts(hunt_id),
  effective_logical_time_ms bigint NOT NULL
    CHECK (effective_logical_time_ms BETWEEN 0 AND 9007199254740991),
  policy_version uuid REFERENCES pokenexus.hunt_auto_revive_policies(policy_version),
  PRIMARY KEY (hunt_id, effective_logical_time_ms)
);
