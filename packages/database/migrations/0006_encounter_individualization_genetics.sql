LOCK TABLE pokenexus.pokemon_instances IN ACCESS EXCLUSIVE MODE;
LOCK TABLE pokenexus.hunt_checkpoints IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pokenexus.pokemon_instances LIMIT 1) THEN
    RAISE EXCEPTION
      'TASK-097 refuses to fabricate Genetics/Shiny/provenance for pre-feature pokemon_instances rows';
  END IF;

  IF EXISTS (SELECT 1 FROM pokenexus.hunt_checkpoints LIMIT 1) THEN
    RAISE EXCEPTION
      'TASK-097 refuses to individualize pre-feature durable Hunt checkpoints under new rules';
  END IF;
END
$$;

ALTER TABLE pokenexus.pokemon_instances
  ADD COLUMN genetic_score smallint NOT NULL,
  ADD COLUMN genetic_profile_a text NOT NULL,
  ADD COLUMN genetic_profile_b text NOT NULL,
  ADD COLUMN birth_profile text NOT NULL,
  ADD COLUMN expressed_profile text NOT NULL,
  ADD COLUMN shiny boolean NOT NULL,
  ADD COLUMN individualization_rules_version bytea NOT NULL,
  ADD COLUMN derivation_authority_version bytea NOT NULL,
  ADD COLUMN derivation_authority_key_id bytea NOT NULL,
  ADD COLUMN origin_pending_selection_identity bytea NOT NULL,
  ADD COLUMN individualization_snapshot_identity bytea NOT NULL,
  ADD COLUMN individualization_snapshot_commitment bytea NOT NULL,
  ADD COLUMN individualization_content_version bytea NOT NULL,
  ADD COLUMN individualization_content_hash bytea NOT NULL,
  ADD COLUMN individualization_game_data_version bytea NOT NULL,
  ADD CONSTRAINT pokemon_instances_genetic_score_check
    CHECK (genetic_score BETWEEN 0 AND 100),
  ADD CONSTRAINT pokemon_instances_genetic_profiles_check
    CHECK (
      genetic_profile_a IN ('Harmony', 'Might', 'Clarity', 'Endurance', 'Resilience')
      AND genetic_profile_b IN ('Harmony', 'Might', 'Clarity', 'Endurance', 'Resilience')
      AND genetic_profile_a <> genetic_profile_b
      AND birth_profile IN (genetic_profile_a, genetic_profile_b)
      AND expressed_profile IN (genetic_profile_a, genetic_profile_b)
      AND (
        (shiny AND genetic_score BETWEEN 95 AND 100)
        OR expressed_profile = birth_profile
      )
    ),
  ADD CONSTRAINT pokemon_instances_individualization_rules_version_shape_check
    CHECK (
      octet_length(individualization_rules_version) > 0
      AND mod(octet_length(individualization_rules_version), 2) = 0
    ),
  ADD CONSTRAINT pokemon_instances_derivation_authority_version_shape_check
    CHECK (
      octet_length(derivation_authority_version) > 0
      AND mod(octet_length(derivation_authority_version), 2) = 0
    ),
  ADD CONSTRAINT pokemon_instances_derivation_authority_key_id_shape_check
    CHECK (
      octet_length(derivation_authority_key_id) > 0
      AND mod(octet_length(derivation_authority_key_id), 2) = 0
    ),
  ADD CONSTRAINT pokemon_instances_origin_pending_selection_identity_shape_check
    CHECK (
      octet_length(origin_pending_selection_identity) > 0
      AND mod(octet_length(origin_pending_selection_identity), 2) = 0
    ),
  ADD CONSTRAINT pokemon_instances_individualization_snapshot_identity_shape_check
    CHECK (
      octet_length(individualization_snapshot_identity) > 0
      AND mod(octet_length(individualization_snapshot_identity), 2) = 0
    ),
  ADD CONSTRAINT pokemon_instances_individualization_snapshot_commitment_shape_check
    CHECK (
      octet_length(individualization_snapshot_commitment) > 0
      AND mod(octet_length(individualization_snapshot_commitment), 2) = 0
    ),
  ADD CONSTRAINT pokemon_instances_individualization_content_version_shape_check
    CHECK (
      octet_length(individualization_content_version) > 0
      AND mod(octet_length(individualization_content_version), 2) = 0
    ),
  ADD CONSTRAINT pokemon_instances_individualization_content_hash_shape_check
    CHECK (
      octet_length(individualization_content_hash) > 0
      AND mod(octet_length(individualization_content_hash), 2) = 0
    ),
  ADD CONSTRAINT pokemon_instances_individualization_game_data_version_shape_check
    CHECK (
      octet_length(individualization_game_data_version) > 0
      AND mod(octet_length(individualization_game_data_version), 2) = 0
    ),
  ADD CONSTRAINT pokemon_instances_individualization_snapshot_identity_unique
    UNIQUE (individualization_snapshot_identity);
