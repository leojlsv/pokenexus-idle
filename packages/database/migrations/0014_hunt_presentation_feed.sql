-- SPEC-017: this is an additive, server-private source and privacy-projected
-- read model. No public route or automatic backfill is enabled by migration.
CREATE TABLE pokenexus.hunt_presentation_streams (
  hunt_id uuid PRIMARY KEY REFERENCES pokenexus.solo_hunts(hunt_id),
  player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  input_schema_version text NOT NULL CHECK (input_schema_version <> ''),
  checkpoint_schema_version text NOT NULL CHECK (checkpoint_schema_version <> ''),
  game_data_version text NOT NULL CHECK (game_data_version <> ''),
  rules_version text NOT NULL CHECK (rules_version <> ''),
  source_event_schema_version text NOT NULL CHECK (source_event_schema_version <> ''),
  presentation_schema_version text NOT NULL
    CHECK (presentation_schema_version IN (
      'pokenexus.combat-presentation.v1',
      'pokenexus.combat-presentation.v2'
    )),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'unavailable')),
  unavailable_reason text,
  published_event_index bigint NOT NULL DEFAULT 0 CHECK (published_event_index >= 0),
  public_prefix_digest bytea NOT NULL DEFAULT decode(repeat('00', 32), 'hex')
    CHECK (octet_length(public_prefix_digest) = 32),
  private_prefix_digest bytea NOT NULL DEFAULT decode(repeat('00', 32), 'hex')
    CHECK (octet_length(private_prefix_digest) = 32),
  publication_generation bigint NOT NULL DEFAULT 0 CHECK (publication_generation >= 0),
  committed_logical_time_ms bigint NOT NULL DEFAULT 0
    CHECK (committed_logical_time_ms BETWEEN 0 AND 9007199254740991),
  is_terminal boolean NOT NULL DEFAULT false,
  presentation_terminal_recorded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (player_id, hunt_id),
  FOREIGN KEY (player_id, hunt_id)
    REFERENCES pokenexus.solo_hunts(player_id, hunt_id),
  CHECK ((status = 'unavailable') = (unavailable_reason IS NOT NULL)),
  CHECK ((is_terminal) = (presentation_terminal_recorded_at IS NOT NULL)),
  CHECK ((status = 'available') OR (octet_length(unavailable_reason) BETWEEN 1 AND 128))
);

CREATE TABLE pokenexus.hunt_presentation_battles (
  hunt_id uuid NOT NULL REFERENCES pokenexus.hunt_presentation_streams(hunt_id),
  encounter_ordinal bigint NOT NULL CHECK (encounter_ordinal > 0),
  encounter_id text NOT NULL CHECK (encounter_id <> ''),
  battle_id text NOT NULL CHECK (battle_id <> ''),
  battle_started_at_hunt_time_ms bigint NOT NULL
    CHECK (battle_started_at_hunt_time_ms BETWEEN 0 AND 9007199254740991),
  initial_sides_json jsonb NOT NULL CHECK (jsonb_typeof(initial_sides_json) = 'array'),
  initial_participants_json jsonb NOT NULL CHECK (jsonb_typeof(initial_participants_json) = 'array'),
  public_header_digest bytea NOT NULL CHECK (octet_length(public_header_digest) = 32),
  private_origin_json jsonb NOT NULL CHECK (jsonb_typeof(private_origin_json) = 'object'),
  private_continuation_context_json jsonb NOT NULL
    CHECK (jsonb_typeof(private_continuation_context_json) = 'object'),
  private_origin_digest bytea NOT NULL CHECK (octet_length(private_origin_digest) = 32),
  private_continuation_context_digest bytea NOT NULL
    CHECK (octet_length(private_continuation_context_digest) = 32),
  PRIMARY KEY (hunt_id, encounter_ordinal),
  UNIQUE (hunt_id, encounter_id),
  UNIQUE (hunt_id, battle_id)
);

CREATE TABLE pokenexus.hunt_presentation_events (
  hunt_id uuid NOT NULL,
  event_index bigint NOT NULL CHECK (event_index > 0),
  battle_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  combat_time_ms bigint NOT NULL CHECK (combat_time_ms >= 0),
  public_event_json jsonb NOT NULL CHECK (jsonb_typeof(public_event_json) = 'object'),
  public_event_bytes bytea NOT NULL CHECK (octet_length(public_event_bytes) > 0),
  private_source_bytes bytea NOT NULL CHECK (octet_length(private_source_bytes) > 0),
  private_source_digest bytea NOT NULL CHECK (octet_length(private_source_digest) = 32),
  private_prefix_digest bytea NOT NULL CHECK (octet_length(private_prefix_digest) = 32),
  public_prefix_digest bytea NOT NULL CHECK (octet_length(public_prefix_digest) = 32),
  PRIMARY KEY (hunt_id, event_index),
  UNIQUE (hunt_id, battle_id, sequence),
  FOREIGN KEY (hunt_id, battle_id)
    REFERENCES pokenexus.hunt_presentation_battles(hunt_id, battle_id)
);
