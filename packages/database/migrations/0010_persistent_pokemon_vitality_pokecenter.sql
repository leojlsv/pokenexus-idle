CREATE TABLE pokenexus.pokemon_vitalities (
  owner_player_id uuid NOT NULL,
  pokemon_instance_id uuid NOT NULL,
  current_hp integer NOT NULL CHECK (current_hp >= 0),
  row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner_player_id, pokemon_instance_id),
  FOREIGN KEY (owner_player_id, pokemon_instance_id)
    REFERENCES pokenexus.pokemon_instances(owner_player_id, pokemon_instance_id)
);

CREATE TABLE pokenexus.pokecenter_heal_commands (
  command_id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  idempotency_key uuid NOT NULL,
  team_id uuid NOT NULL,
  command_status text NOT NULL CHECK (command_status IN ('pending', 'terminal')),
  result_http_status smallint CHECK (result_http_status BETWEEN 100 AND 599),
  result_json jsonb,
  accepted_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  terminal_at timestamptz,
  UNIQUE (player_id, idempotency_key),
  CHECK (
    (command_status = 'pending'
      AND result_http_status IS NULL
      AND result_json IS NULL
      AND terminal_at IS NULL)
    OR
    (command_status = 'terminal'
      AND result_http_status IS NOT NULL
      AND result_json IS NOT NULL
      AND terminal_at IS NOT NULL)
  )
);
