ALTER TABLE pokenexus.pokemon_instances
  ADD COLUMN total_experience bigint;

UPDATE pokenexus.pokemon_instances
SET total_experience = (level::bigint * level::bigint * level::bigint) - 1;

ALTER TABLE pokenexus.pokemon_instances
  ALTER COLUMN total_experience SET NOT NULL,
  ADD CONSTRAINT pokemon_instances_total_experience_range_check
    CHECK (total_experience BETWEEN 0 AND 7999999),
  ADD CONSTRAINT pokemon_instances_progression_consistency_check
    CHECK (
      total_experience >= (level::bigint * level::bigint * level::bigint) - 1
      AND (
        level = 200
        OR total_experience <
          (((level::bigint + 1) * (level::bigint + 1) * (level::bigint + 1)) - 1)
      )
    );

ALTER TABLE pokenexus.players
  ADD COLUMN player_level numeric NOT NULL DEFAULT 1,
  ADD COLUMN player_total_experience numeric NOT NULL DEFAULT 0,
  ADD CONSTRAINT players_player_level_integer_check
    CHECK (
      player_level::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND player_level >= 1
      AND scale(player_level) = 0
    ),
  ADD CONSTRAINT players_player_total_experience_integer_check
    CHECK (
      player_total_experience::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND player_total_experience >= 0
      AND scale(player_total_experience) = 0
    ),
  ADD CONSTRAINT players_progression_consistency_check
    CHECK (
      player_total_experience >= (50 * player_level * (player_level - 1))
      AND player_total_experience < (50 * (player_level + 1) * player_level)
    );

INSERT INTO pokenexus.player_inventories (player_id)
SELECT player_id
FROM pokenexus.players
ON CONFLICT (player_id) DO NOTHING;

CREATE TABLE pokenexus.inventory_entries (
  player_id uuid NOT NULL REFERENCES pokenexus.player_inventories(player_id),
  item_id bytea NOT NULL
    CHECK (octet_length(item_id) > 0 AND mod(octet_length(item_id), 2) = 0),
  quantity bigint NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (player_id, item_id)
);

CREATE TABLE pokenexus.reward_resolutions (
  resolution_id uuid PRIMARY KEY,
  subject_player_id uuid NOT NULL REFERENCES pokenexus.players(player_id),
  source_authority bytea NOT NULL
    CHECK (octet_length(source_authority) > 0 AND mod(octet_length(source_authority), 2) = 0),
  source_correlation bytea NOT NULL
    CHECK (octet_length(source_correlation) > 0 AND mod(octet_length(source_correlation), 2) = 0),
  rules_version bytea,
  game_data_version bytea,
  resolved_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    rules_version IS NULL
    OR (octet_length(rules_version) > 0 AND mod(octet_length(rules_version), 2) = 0)
  ),
  CHECK (
    game_data_version IS NULL
    OR (octet_length(game_data_version) > 0 AND mod(octet_length(game_data_version), 2) = 0)
  ),
  CHECK (rules_version IS NOT NULL OR game_data_version IS NOT NULL),
  UNIQUE (subject_player_id, source_authority, source_correlation),
  UNIQUE (resolution_id, subject_player_id)
);

CREATE TABLE pokenexus.reward_resolution_effects (
  resolution_id uuid NOT NULL,
  subject_player_id uuid NOT NULL,
  effect_ordinal integer NOT NULL CHECK (effect_ordinal >= 0),
  effect_kind text NOT NULL
    CHECK (effect_kind IN ('pokemon_xp', 'player_xp', 'item_grant')),
  pokemon_instance_id uuid,
  target_player_id uuid,
  item_id bytea,
  xp_amount numeric,
  item_quantity bigint,
  PRIMARY KEY (resolution_id, effect_ordinal),
  FOREIGN KEY (resolution_id, subject_player_id)
    REFERENCES pokenexus.reward_resolutions(resolution_id, subject_player_id),
  FOREIGN KEY (target_player_id)
    REFERENCES pokenexus.players(player_id),
  CHECK (
    item_id IS NULL
    OR (octet_length(item_id) > 0 AND mod(octet_length(item_id), 2) = 0)
  ),
  CHECK (
    xp_amount IS NULL
    OR (
      xp_amount::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND xp_amount >= 0
      AND scale(xp_amount) = 0
    )
  ),
  CHECK (
    (effect_kind = 'pokemon_xp'
      AND pokemon_instance_id IS NOT NULL
      AND target_player_id IS NULL
      AND item_id IS NULL
      AND xp_amount IS NOT NULL
      AND item_quantity IS NULL)
    OR
    (effect_kind = 'player_xp'
      AND pokemon_instance_id IS NULL
      AND target_player_id IS NOT NULL
      AND target_player_id = subject_player_id
      AND item_id IS NULL
      AND xp_amount IS NOT NULL
      AND item_quantity IS NULL)
    OR
    (effect_kind = 'item_grant'
      AND pokemon_instance_id IS NULL
      AND target_player_id IS NULL
      AND item_id IS NOT NULL
      AND xp_amount IS NULL
      AND item_quantity IS NOT NULL
      AND item_quantity > 0)
  )
);

CREATE FUNCTION pokenexus.validate_reward_effect_subject_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.effect_kind = 'pokemon_xp' THEN
    PERFORM 1
    FROM pokenexus.pokemon_instances
    WHERE owner_player_id = NEW.subject_player_id
      AND pokemon_instance_id = NEW.pokemon_instance_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pokémon XP Reward target is not owned by subject Player'
        USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER reward_effect_subject_ownership_check
BEFORE INSERT ON pokenexus.reward_resolution_effects
FOR EACH ROW
EXECUTE FUNCTION pokenexus.validate_reward_effect_subject_ownership();

CREATE UNIQUE INDEX reward_effects_unique_pokemon_xp_target
  ON pokenexus.reward_resolution_effects (resolution_id, pokemon_instance_id)
  WHERE effect_kind = 'pokemon_xp';

CREATE UNIQUE INDEX reward_effects_unique_player_xp_target
  ON pokenexus.reward_resolution_effects (resolution_id, target_player_id)
  WHERE effect_kind = 'player_xp';

CREATE UNIQUE INDEX reward_effects_unique_item_grant_target
  ON pokenexus.reward_resolution_effects (resolution_id, item_id)
  WHERE effect_kind = 'item_grant';

CREATE TABLE pokenexus.reward_completions (
  completion_id uuid PRIMARY KEY,
  resolution_id uuid NOT NULL UNIQUE REFERENCES pokenexus.reward_resolutions(resolution_id),
  completed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
