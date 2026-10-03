CREATE TABLE pokenexus.player_bootstraps (
  player_id uuid PRIMARY KEY REFERENCES pokenexus.players(player_id),
  starter_species_id bytea NOT NULL
    CHECK (octet_length(starter_species_id) > 0 AND mod(octet_length(starter_species_id), 2) = 0),
  pokemon_instance_id uuid NOT NULL UNIQUE,
  team_id uuid NOT NULL UNIQUE,
  game_data_version bytea NOT NULL
    CHECK (octet_length(game_data_version) > 0 AND mod(octet_length(game_data_version), 2) = 0),
  rules_version bytea NOT NULL
    CHECK (octet_length(rules_version) > 0 AND mod(octet_length(rules_version), 2) = 0),
  content_version bytea NOT NULL
    CHECK (octet_length(content_version) > 0 AND mod(octet_length(content_version), 2) = 0),
  content_hash bytea NOT NULL
    CHECK (octet_length(content_hash) > 0 AND mod(octet_length(content_hash), 2) = 0),
  accepted_at timestamptz NOT NULL,
  FOREIGN KEY (player_id, pokemon_instance_id)
    REFERENCES pokenexus.pokemon_instances(owner_player_id, pokemon_instance_id),
  FOREIGN KEY (player_id, team_id)
    REFERENCES pokenexus.pokemon_teams(owner_player_id, team_id)
);
