CREATE TABLE pokenexus.team_create_commands (
  player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  idempotency_key uuid NOT NULL,
  team_id uuid,
  accepted_at timestamptz NOT NULL,
  deleted_at timestamptz,
  PRIMARY KEY (player_id, idempotency_key),
  FOREIGN KEY (player_id, team_id)
    REFERENCES pokenexus.pokemon_teams(owner_player_id, team_id),
  CHECK (
    (team_id IS NOT NULL AND deleted_at IS NULL)
    OR
    (team_id IS NULL AND deleted_at IS NOT NULL AND deleted_at >= accepted_at)
  )
);

CREATE UNIQUE INDEX team_create_commands_live_team_unique
  ON pokenexus.team_create_commands (team_id)
  WHERE team_id IS NOT NULL;

CREATE INDEX team_create_commands_player_accepted_idx
  ON pokenexus.team_create_commands (player_id, accepted_at);

CREATE INDEX team_create_commands_deleted_idx
  ON pokenexus.team_create_commands (deleted_at)
  WHERE team_id IS NULL;
