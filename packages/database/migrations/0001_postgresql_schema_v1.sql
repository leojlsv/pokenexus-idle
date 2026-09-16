CREATE SCHEMA IF NOT EXISTS pokenexus;

CREATE TABLE pokenexus.accounts (
  account_id uuid PRIMARY KEY,
  row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pokenexus.players (
  player_id uuid PRIMARY KEY,
  account_id uuid NOT NULL UNIQUE REFERENCES pokenexus.accounts(account_id),
  row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pokenexus.pokemon_instances (
  pokemon_instance_id uuid PRIMARY KEY,
  owner_player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  species_id bytea NOT NULL
    CHECK (octet_length(species_id) > 0 AND mod(octet_length(species_id), 2) = 0),
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 200),
  iv_hp smallint NOT NULL CHECK (iv_hp BETWEEN 0 AND 31),
  iv_atk smallint NOT NULL CHECK (iv_atk BETWEEN 0 AND 31),
  iv_def smallint NOT NULL CHECK (iv_def BETWEEN 0 AND 31),
  iv_spa smallint NOT NULL CHECK (iv_spa BETWEEN 0 AND 31),
  iv_spd smallint NOT NULL CHECK (iv_spd BETWEEN 0 AND 31),
  iv_spe smallint NOT NULL CHECK (iv_spe BETWEEN 0 AND 31),
  row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (owner_player_id, pokemon_instance_id)
);

CREATE TABLE pokenexus.pokemon_teams (
  team_id uuid PRIMARY KEY,
  owner_player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (owner_player_id, team_id)
);

CREATE TABLE pokenexus.pokemon_team_members (
  team_member_id uuid PRIMARY KEY,
  team_id uuid NOT NULL,
  pokemon_instance_id uuid NOT NULL,
  owner_player_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_player_id, team_id)
    REFERENCES pokenexus.pokemon_teams(owner_player_id, team_id),
  FOREIGN KEY (owner_player_id, pokemon_instance_id)
    REFERENCES pokenexus.pokemon_instances(owner_player_id, pokemon_instance_id)
);

CREATE INDEX pokemon_team_members_team_idx
  ON pokenexus.pokemon_team_members (team_id, owner_player_id);

CREATE INDEX pokemon_team_members_pokemon_idx
  ON pokenexus.pokemon_team_members (pokemon_instance_id, owner_player_id);

CREATE TABLE pokenexus.player_inventories (
  player_id uuid PRIMARY KEY REFERENCES pokenexus.players(player_id),
  row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pokenexus.hunt_checkpoints (
  checkpoint_id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  checkpoint_schema_version bytea NOT NULL
    CHECK (octet_length(checkpoint_schema_version) > 0
      AND mod(octet_length(checkpoint_schema_version), 2) = 0),
  game_data_version bytea NOT NULL
    CHECK (octet_length(game_data_version) > 0
      AND mod(octet_length(game_data_version), 2) = 0),
  rules_version bytea NOT NULL
    CHECK (octet_length(rules_version) > 0
      AND mod(octet_length(rules_version), 2) = 0),
  logical_time_ms bigint NOT NULL
    CHECK (logical_time_ms BETWEEN 0 AND 9007199254740991),
  checkpoint_state_bytes bytea NOT NULL,
  row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
