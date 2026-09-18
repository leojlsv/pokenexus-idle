LOCK TABLE pokenexus.pokemon_team_members IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pokenexus.pokemon_team_members LIMIT 1) THEN
    RAISE EXCEPTION
      'TASK-020 cannot assign Team slots while unordered pokemon_team_members rows exist';
  END IF;
END
$$;

ALTER TABLE pokenexus.pokemon_instances
  ADD COLUMN selected_ability_id bytea,
  ADD CONSTRAINT pokemon_instances_selected_ability_shape_check
    CHECK (
      selected_ability_id IS NULL
      OR (
        octet_length(selected_ability_id) > 0
        AND mod(octet_length(selected_ability_id), 2) = 0
      )
    );

CREATE TABLE pokenexus.pokemon_move_loadout (
  owner_player_id uuid NOT NULL,
  pokemon_instance_id uuid NOT NULL,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 4),
  move_id bytea NOT NULL
    CHECK (octet_length(move_id) > 0 AND mod(octet_length(move_id), 2) = 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pokemon_instance_id, slot),
  UNIQUE (pokemon_instance_id, move_id),
  FOREIGN KEY (owner_player_id, pokemon_instance_id)
    REFERENCES pokenexus.pokemon_instances(owner_player_id, pokemon_instance_id)
);

ALTER TABLE pokenexus.pokemon_team_members
  ADD COLUMN slot smallint NOT NULL,
  ADD CONSTRAINT pokemon_team_members_slot_check CHECK (slot BETWEEN 1 AND 6),
  ADD CONSTRAINT pokemon_team_members_team_slot_unique UNIQUE (team_id, slot),
  ADD CONSTRAINT pokemon_team_members_team_pokemon_unique UNIQUE (team_id, pokemon_instance_id);
