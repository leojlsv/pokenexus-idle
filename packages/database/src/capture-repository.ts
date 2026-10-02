import type { Client } from "pg";
import { decodeOpaqueStringDbV1, encodeOpaqueStringDbV1 } from "./opaque-string-db-codec.js";
import { removeInventoryEntriesInTransaction } from "./inventory-repository.js";
import { createPokemonVitalityInTransaction } from "./pokemon-vitality-repository.js";
import { withTransaction } from "./transaction.js";
import { generateUuidV7 } from "./uuid-v7.js";

export type CaptureDbClient = Pick<Client, "query">;

export interface CapturePokemonConstruction {
  readonly speciesId: string;
  readonly level: number;
  readonly ivs: {
    readonly hp: number;
    readonly atk: number;
    readonly def: number;
    readonly spa: number;
    readonly spd: number;
    readonly spe: number;
  };
  readonly totalExperience: bigint;
  readonly geneticScore: number;
  readonly compatibleProfiles: readonly [string, string];
  readonly birthProfile: string;
  readonly shiny: boolean;
  readonly individualizationRulesVersion: string;
  readonly derivationAuthorityVersion: string;
  readonly derivationAuthorityKeyId: string;
  readonly originPendingSelectionIdentity: string;
  readonly individualizationSnapshotIdentity: string;
  readonly individualizationSnapshotCommitment: string;
  readonly contentVersion: string;
  readonly contentHash: string;
  readonly individualizationGameDataVersion: string;
  readonly selectedAbilityId: string;
  readonly moveIds: readonly string[];
}

export interface CaptureAttemptIntent {
  readonly subjectPlayerId: string;
  readonly attemptCorrelation: string;
  readonly encounterId: string;
  readonly encounterDefinitionId: string;
  readonly speciesId: string;
  readonly level: number;
  readonly selectedItemId: string;
  readonly captureRulesVersion: string;
  readonly captureRulesSemanticsHash: string;
  readonly contentVersion: string;
  readonly contentHash: string;
  readonly encounterGameDataVersion: string;
  readonly encounterRulesVersion: string;
  readonly creationGameDataVersion: string;
  readonly creationRulesVersion: string;
  readonly pendingSelectionIdentity: string;
  readonly individualizationSnapshotIdentity: string;
  readonly individualizationSnapshotCommitment: string;
  readonly individualizationRulesVersion: string;
  readonly derivationAuthorityVersion: string;
  readonly derivationAuthorityKeyId: string;
  readonly baseChanceBp: number;
  readonly geneticChanceBp: number;
  readonly finalChanceBp: number;
  readonly captureRoll: number;
  readonly rng: {
    readonly algorithm: "xorshift32-v1";
    readonly before: number;
    readonly after: number;
  };
  readonly success: boolean;
  readonly pokemon: CapturePokemonConstruction | null;
}

export interface CaptureAttemptRecord extends CaptureAttemptIntent {
  readonly captureAttemptId: string;
  readonly createdPokemonInstanceId: string | null;
  readonly acceptedAt: Date;
}

export interface CaptureAttemptCommitInput extends CaptureAttemptIntent {
  readonly expectedInventoryRowVersion: bigint;
  readonly initialPokemonVitalityCurrentHp?: number;
  readonly now: Date;
}

export type CaptureAttemptCommitResult =
  | { readonly status: "accepted"; readonly replayed: boolean; readonly attempt: CaptureAttemptRecord }
  | { readonly status: "conflict"; readonly existingAttemptId: string }
  | { readonly status: "encounter_consumed"; readonly existingAttemptId: string }
  | { readonly status: "inventory_not_found" }
  | { readonly status: "inventory_stale"; readonly rowVersion: bigint }
  | { readonly status: "insufficient_ball"; readonly quantity: bigint };

interface CaptureAttemptRow {
  readonly capture_attempt_id: string;
  readonly subject_player_id: string;
  readonly attempt_correlation: Buffer;
  readonly encounter_id: Buffer;
  readonly encounter_definition_id: Buffer;
  readonly species_id: Buffer;
  readonly level: number;
  readonly selected_item_id: Buffer;
  readonly capture_rules_version: Buffer;
  readonly capture_rules_semantics_hash: Buffer;
  readonly content_version: Buffer;
  readonly content_hash: Buffer;
  readonly encounter_game_data_version: Buffer;
  readonly encounter_rules_version: Buffer;
  readonly creation_game_data_version: Buffer;
  readonly creation_rules_version: Buffer;
  readonly pending_selection_identity: Buffer;
  readonly individualization_snapshot_identity: Buffer;
  readonly individualization_snapshot_commitment: Buffer;
  readonly individualization_rules_version: Buffer;
  readonly derivation_authority_version: Buffer;
  readonly derivation_authority_key_id: Buffer;
  readonly base_chance_bp: number;
  readonly genetic_chance_bp: number;
  readonly final_chance_bp: number;
  readonly capture_roll: number;
  readonly rng_algorithm: "xorshift32-v1";
  readonly rng_state_before: string;
  readonly rng_state_after: string;
  readonly outcome: "success" | "failure";
  readonly selected_ability_id: Buffer | null;
  readonly created_pokemon_instance_id: string | null;
  readonly accepted_at: Date;
}

interface MoveRow { readonly slot: number; readonly move_id: Buffer }

interface CaptureConstructionRow {
  readonly iv_hp: number;
  readonly iv_atk: number;
  readonly iv_def: number;
  readonly iv_spa: number;
  readonly iv_spd: number;
  readonly iv_spe: number;
  readonly initial_total_experience: string;
  readonly genetic_score: number;
  readonly genetic_profile_a: string;
  readonly genetic_profile_b: string;
  readonly birth_profile: string;
  readonly shiny: boolean;
  readonly selected_ability_id: Buffer;
}

function encode(value: string, label: string): Buffer {
  if (value.length === 0) throw new Error(`${label} must be non-empty`);
  return Buffer.from(encodeOpaqueStringDbV1(value));
}

function decode(value: Buffer): string {
  return decodeOpaqueStringDbV1(value);
}

function assertInt(value: number, min: number, max: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer in ${min}..${max}`);
  }
}

function validateIntent(input: CaptureAttemptIntent): void {
  assertInt(input.level, 1, 200, "level");
  assertInt(input.baseChanceBp, 0, 10_000, "baseChanceBp");
  assertInt(input.geneticChanceBp, 0, 10_000, "geneticChanceBp");
  assertInt(input.finalChanceBp, 0, 9_999, "finalChanceBp");
  assertInt(input.captureRoll, 0, 9_999, "captureRoll");
  assertInt(input.rng.before, 1, 0xffffffff, "rng.before");
  assertInt(input.rng.after, 1, 0xffffffff, "rng.after");
  const required = [
    input.subjectPlayerId,
    input.attemptCorrelation,
    input.encounterId,
    input.encounterDefinitionId,
    input.speciesId,
    input.selectedItemId,
    input.captureRulesVersion,
    input.captureRulesSemanticsHash,
    input.contentVersion,
    input.contentHash,
    input.encounterGameDataVersion,
    input.encounterRulesVersion,
    input.creationGameDataVersion,
    input.creationRulesVersion,
    input.pendingSelectionIdentity,
    input.individualizationSnapshotIdentity,
    input.individualizationSnapshotCommitment,
    input.individualizationRulesVersion,
    input.derivationAuthorityVersion,
    input.derivationAuthorityKeyId,
  ];
  if (required.some((value) => value.length === 0)) throw new Error("capture attempt contains an empty identity");
  if (input.success !== (input.captureRoll < input.finalChanceBp)) {
    throw new Error("capture success does not match frozen roll/chance");
  }
  if (input.success !== (input.pokemon !== null)) throw new Error("successful capture requires Pokémon construction only");
  if (!input.pokemon) return;
  if (input.pokemon.speciesId !== input.speciesId || input.pokemon.level !== input.level) {
    throw new Error("Pokémon construction target does not match capture target");
  }
  if (input.pokemon.originPendingSelectionIdentity !== input.pendingSelectionIdentity
    || input.pokemon.individualizationSnapshotIdentity !== input.individualizationSnapshotIdentity
    || input.pokemon.individualizationSnapshotCommitment !== input.individualizationSnapshotCommitment
    || input.pokemon.individualizationRulesVersion !== input.individualizationRulesVersion
    || input.pokemon.derivationAuthorityVersion !== input.derivationAuthorityVersion
    || input.pokemon.derivationAuthorityKeyId !== input.derivationAuthorityKeyId) {
    throw new Error("Pokémon construction individualization lineage mismatch");
  }
  if (input.pokemon.selectedAbilityId.length === 0) throw new Error("successful capture requires selectedAbilityId");
  if (input.pokemon.moveIds.length < 1 || input.pokemon.moveIds.length > 4 || new Set(input.pokemon.moveIds).size !== input.pokemon.moveIds.length) {
    throw new Error("successful capture requires 1..4 distinct bootstrap Moves");
  }
}

async function loadMoves(client: CaptureDbClient, captureAttemptId: string): Promise<readonly string[]> {
  const rows = await client.query<MoveRow>(
    `SELECT slot, move_id FROM pokenexus.capture_attempt_moves
     WHERE capture_attempt_id = $1 ORDER BY slot`,
    [captureAttemptId],
  );
  return rows.rows.map((row) => decode(row.move_id));
}

async function loadCaptureConstruction(
  client: CaptureDbClient,
  attempt: CaptureAttemptRow,
  moveIds: readonly string[],
): Promise<CapturePokemonConstruction> {
  const result = await client.query<CaptureConstructionRow>(
    `SELECT iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe,
            initial_total_experience::text, genetic_score, genetic_profile_a, genetic_profile_b,
            birth_profile, shiny, selected_ability_id
     FROM pokenexus.capture_attempt_constructions
     WHERE capture_attempt_id = $1`,
    [attempt.capture_attempt_id],
  );
  const row = result.rows[0];
  if (!row) throw new Error("successful capture attempt is missing its immutable construction snapshot");
  return {
    speciesId: decode(attempt.species_id),
    level: attempt.level,
    ivs: {
      hp: row.iv_hp,
      atk: row.iv_atk,
      def: row.iv_def,
      spa: row.iv_spa,
      spd: row.iv_spd,
      spe: row.iv_spe,
    },
    totalExperience: BigInt(row.initial_total_experience),
    geneticScore: row.genetic_score,
    compatibleProfiles: [row.genetic_profile_a, row.genetic_profile_b],
    birthProfile: row.birth_profile,
    shiny: row.shiny,
    individualizationRulesVersion: decode(attempt.individualization_rules_version),
    derivationAuthorityVersion: decode(attempt.derivation_authority_version),
    derivationAuthorityKeyId: decode(attempt.derivation_authority_key_id),
    originPendingSelectionIdentity: decode(attempt.pending_selection_identity),
    individualizationSnapshotIdentity: decode(attempt.individualization_snapshot_identity),
    individualizationSnapshotCommitment: decode(attempt.individualization_snapshot_commitment),
    contentVersion: decode(attempt.content_version),
    contentHash: decode(attempt.content_hash),
    individualizationGameDataVersion: decode(attempt.encounter_game_data_version),
    selectedAbilityId: decode(row.selected_ability_id),
    moveIds: [...moveIds],
  };
}

async function mapAttempt(client: CaptureDbClient, row: CaptureAttemptRow): Promise<CaptureAttemptRecord> {
  const moveIds = await loadMoves(client, row.capture_attempt_id);
  const pokemon = row.outcome === "success"
    ? await loadCaptureConstruction(client, row, moveIds)
    : null;
  return {
    captureAttemptId: row.capture_attempt_id,
    subjectPlayerId: row.subject_player_id,
    attemptCorrelation: decode(row.attempt_correlation),
    encounterId: decode(row.encounter_id),
    encounterDefinitionId: decode(row.encounter_definition_id),
    speciesId: decode(row.species_id),
    level: row.level,
    selectedItemId: decode(row.selected_item_id),
    captureRulesVersion: decode(row.capture_rules_version),
    captureRulesSemanticsHash: decode(row.capture_rules_semantics_hash),
    contentVersion: decode(row.content_version),
    contentHash: decode(row.content_hash),
    encounterGameDataVersion: decode(row.encounter_game_data_version),
    encounterRulesVersion: decode(row.encounter_rules_version),
    creationGameDataVersion: decode(row.creation_game_data_version),
    creationRulesVersion: decode(row.creation_rules_version),
    pendingSelectionIdentity: decode(row.pending_selection_identity),
    individualizationSnapshotIdentity: decode(row.individualization_snapshot_identity),
    individualizationSnapshotCommitment: decode(row.individualization_snapshot_commitment),
    individualizationRulesVersion: decode(row.individualization_rules_version),
    derivationAuthorityVersion: decode(row.derivation_authority_version),
    derivationAuthorityKeyId: decode(row.derivation_authority_key_id),
    baseChanceBp: row.base_chance_bp,
    geneticChanceBp: row.genetic_chance_bp,
    finalChanceBp: row.final_chance_bp,
    captureRoll: row.capture_roll,
    rng: { algorithm: row.rng_algorithm, before: Number(row.rng_state_before), after: Number(row.rng_state_after) },
    success: row.outcome === "success",
    pokemon,
    createdPokemonInstanceId: row.created_pokemon_instance_id,
    acceptedAt: row.accepted_at,
  };
}

async function loadAttemptByCorrelation(
  client: CaptureDbClient,
  subjectPlayerId: string,
  attemptCorrelation: string,
  lock = false,
): Promise<CaptureAttemptRecord | null> {
  const result = await client.query<CaptureAttemptRow>(
    `SELECT * FROM pokenexus.capture_attempts
     WHERE subject_player_id = $1 AND attempt_correlation = $2${lock ? " FOR UPDATE" : ""}`,
    [subjectPlayerId, encode(attemptCorrelation, "attemptCorrelation")],
  );
  return result.rows[0] ? mapAttempt(client, result.rows[0]) : null;
}

export async function loadCaptureAttemptByCorrelation(
  client: CaptureDbClient,
  subjectPlayerId: string,
  attemptCorrelation: string,
): Promise<CaptureAttemptRecord | null> {
  if (subjectPlayerId.length === 0) throw new Error("subjectPlayerId must be non-empty");
  if (attemptCorrelation.length === 0) throw new Error("attemptCorrelation must be non-empty");
  return loadAttemptByCorrelation(client, subjectPlayerId, attemptCorrelation);
}

async function loadAttemptByEncounter(client: CaptureDbClient, encounterId: string): Promise<CaptureAttemptRecord | null> {
  const result = await client.query<CaptureAttemptRow>(
    `SELECT * FROM pokenexus.capture_attempts WHERE encounter_id = $1`,
    [encode(encounterId, "encounterId")],
  );
  return result.rows[0] ? mapAttempt(client, result.rows[0]) : null;
}

function comparable(record: CaptureAttemptRecord | CaptureAttemptIntent): unknown {
  const pokemon = record.pokemon;
  return {
    subjectPlayerId: record.subjectPlayerId,
    attemptCorrelation: record.attemptCorrelation,
    encounterId: record.encounterId,
    encounterDefinitionId: record.encounterDefinitionId,
    speciesId: record.speciesId,
    level: record.level,
    selectedItemId: record.selectedItemId,
    captureRulesVersion: record.captureRulesVersion,
    captureRulesSemanticsHash: record.captureRulesSemanticsHash,
    contentVersion: record.contentVersion,
    contentHash: record.contentHash,
    encounterGameDataVersion: record.encounterGameDataVersion,
    encounterRulesVersion: record.encounterRulesVersion,
    creationGameDataVersion: record.creationGameDataVersion,
    creationRulesVersion: record.creationRulesVersion,
    pendingSelectionIdentity: record.pendingSelectionIdentity,
    individualizationSnapshotIdentity: record.individualizationSnapshotIdentity,
    individualizationSnapshotCommitment: record.individualizationSnapshotCommitment,
    individualizationRulesVersion: record.individualizationRulesVersion,
    derivationAuthorityVersion: record.derivationAuthorityVersion,
    derivationAuthorityKeyId: record.derivationAuthorityKeyId,
    baseChanceBp: record.baseChanceBp,
    geneticChanceBp: record.geneticChanceBp,
    finalChanceBp: record.finalChanceBp,
    captureRoll: record.captureRoll,
    rng: record.rng,
    success: record.success,
    pokemon: pokemon && {
      speciesId: pokemon.speciesId,
      level: pokemon.level,
      ivs: pokemon.ivs,
      totalExperience: pokemon.totalExperience.toString(),
      geneticScore: pokemon.geneticScore,
      compatibleProfiles: pokemon.compatibleProfiles,
      birthProfile: pokemon.birthProfile,
      shiny: pokemon.shiny,
      individualizationRulesVersion: pokemon.individualizationRulesVersion,
      derivationAuthorityVersion: pokemon.derivationAuthorityVersion,
      derivationAuthorityKeyId: pokemon.derivationAuthorityKeyId,
      originPendingSelectionIdentity: pokemon.originPendingSelectionIdentity,
      individualizationSnapshotIdentity: pokemon.individualizationSnapshotIdentity,
      individualizationSnapshotCommitment: pokemon.individualizationSnapshotCommitment,
      contentVersion: pokemon.contentVersion,
      contentHash: pokemon.contentHash,
      individualizationGameDataVersion: pokemon.individualizationGameDataVersion,
      selectedAbilityId: pokemon.selectedAbilityId,
      moveIds: pokemon.moveIds,
    },
  };
}

function sameIntent(record: CaptureAttemptRecord, input: CaptureAttemptIntent): boolean {
  return JSON.stringify(comparable(record)) === JSON.stringify(comparable(input));
}

async function lockPlayerForCaptureAttempt(
  client: CaptureDbClient,
  subjectPlayerId: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT player_id
     FROM pokenexus.players
     WHERE player_id = $1
     FOR UPDATE`,
    [subjectPlayerId],
  );
  return result.rowCount === 1;
}

async function insertPokemon(
  client: CaptureDbClient,
  ownerPlayerId: string,
  pokemon: CapturePokemonConstruction,
  pokemonInstanceId: string,
  now: Date,
): Promise<void> {
  const [profileA, profileB] = pokemon.compatibleProfiles;
  await client.query(
    `INSERT INTO pokenexus.pokemon_instances (
       pokemon_instance_id, owner_player_id, species_id, level,
       iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe,
       total_experience, selected_ability_id,
       genetic_score, genetic_profile_a, genetic_profile_b, birth_profile, expressed_profile, shiny,
       individualization_rules_version, derivation_authority_version, derivation_authority_key_id,
       origin_pending_selection_identity, individualization_snapshot_identity,
       individualization_snapshot_commitment, individualization_content_version,
       individualization_content_hash, individualization_game_data_version,
       row_version, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4,
       $5, $6, $7, $8, $9, $10,
       $11, $12,
       $13, $14, $15, $16, $16, $17,
       $18, $19, $20, $21, $22, $23, $24, $25, $26,
       0, $27, $27
     )`,
    [
      pokemonInstanceId,
      ownerPlayerId,
      encode(pokemon.speciesId, "pokemon.speciesId"),
      pokemon.level,
      pokemon.ivs.hp,
      pokemon.ivs.atk,
      pokemon.ivs.def,
      pokemon.ivs.spa,
      pokemon.ivs.spd,
      pokemon.ivs.spe,
      pokemon.totalExperience.toString(),
      encode(pokemon.selectedAbilityId, "pokemon.selectedAbilityId"),
      pokemon.geneticScore,
      profileA,
      profileB,
      pokemon.birthProfile,
      pokemon.shiny,
      encode(pokemon.individualizationRulesVersion, "pokemon.individualizationRulesVersion"),
      encode(pokemon.derivationAuthorityVersion, "pokemon.derivationAuthorityVersion"),
      encode(pokemon.derivationAuthorityKeyId, "pokemon.derivationAuthorityKeyId"),
      encode(pokemon.originPendingSelectionIdentity, "pokemon.originPendingSelectionIdentity"),
      encode(pokemon.individualizationSnapshotIdentity, "pokemon.individualizationSnapshotIdentity"),
      encode(pokemon.individualizationSnapshotCommitment, "pokemon.individualizationSnapshotCommitment"),
      encode(pokemon.contentVersion, "pokemon.contentVersion"),
      encode(pokemon.contentHash, "pokemon.contentHash"),
      encode(pokemon.individualizationGameDataVersion, "pokemon.individualizationGameDataVersion"),
      now,
    ],
  );
  for (let index = 0; index < pokemon.moveIds.length; index += 1) {
    await client.query(
      `INSERT INTO pokenexus.pokemon_move_loadout (owner_player_id, pokemon_instance_id, slot, move_id, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [ownerPlayerId, pokemonInstanceId, index + 1, encode(pokemon.moveIds[index]!, "pokemon.moveId"), now],
    );
  }
}

async function incrementSpeciesResearch(
  client: CaptureDbClient,
  ownerPlayerId: string,
  speciesId: string,
  now: Date,
): Promise<void> {
  await client.query(
    `INSERT INTO pokenexus.species_research_counts (owner_player_id, species_id, capture_count, updated_at)
     VALUES ($1, $2, 1, $3)
     ON CONFLICT (owner_player_id, species_id)
     DO UPDATE SET capture_count = pokenexus.species_research_counts.capture_count + 1, updated_at = EXCLUDED.updated_at`,
    [ownerPlayerId, encode(speciesId, "speciesId"), now],
  );
}

async function insertAttempt(
  client: CaptureDbClient,
  input: CaptureAttemptIntent,
  captureAttemptId: string,
  pokemonInstanceId: string | null,
  now: Date,
): Promise<void> {
  await client.query(
    `INSERT INTO pokenexus.capture_attempts (
       capture_attempt_id, subject_player_id, attempt_correlation, encounter_id, encounter_definition_id,
       species_id, level, selected_item_id, capture_rules_version, capture_rules_semantics_hash,
       content_version, content_hash, encounter_game_data_version, encounter_rules_version,
       creation_game_data_version, creation_rules_version, pending_selection_identity,
       individualization_snapshot_identity, individualization_snapshot_commitment,
       individualization_rules_version, derivation_authority_version, derivation_authority_key_id,
       base_chance_bp, genetic_chance_bp, final_chance_bp, capture_roll,
       rng_algorithm, rng_state_before, rng_state_after, outcome, selected_ability_id,
       created_pokemon_instance_id, accepted_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
       $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33
     )`,
    [
      captureAttemptId,
      input.subjectPlayerId,
      encode(input.attemptCorrelation, "attemptCorrelation"),
      encode(input.encounterId, "encounterId"),
      encode(input.encounterDefinitionId, "encounterDefinitionId"),
      encode(input.speciesId, "speciesId"),
      input.level,
      encode(input.selectedItemId, "selectedItemId"),
      encode(input.captureRulesVersion, "captureRulesVersion"),
      encode(input.captureRulesSemanticsHash, "captureRulesSemanticsHash"),
      encode(input.contentVersion, "contentVersion"),
      encode(input.contentHash, "contentHash"),
      encode(input.encounterGameDataVersion, "encounterGameDataVersion"),
      encode(input.encounterRulesVersion, "encounterRulesVersion"),
      encode(input.creationGameDataVersion, "creationGameDataVersion"),
      encode(input.creationRulesVersion, "creationRulesVersion"),
      encode(input.pendingSelectionIdentity, "pendingSelectionIdentity"),
      encode(input.individualizationSnapshotIdentity, "individualizationSnapshotIdentity"),
      encode(input.individualizationSnapshotCommitment, "individualizationSnapshotCommitment"),
      encode(input.individualizationRulesVersion, "individualizationRulesVersion"),
      encode(input.derivationAuthorityVersion, "derivationAuthorityVersion"),
      encode(input.derivationAuthorityKeyId, "derivationAuthorityKeyId"),
      input.baseChanceBp,
      input.geneticChanceBp,
      input.finalChanceBp,
      input.captureRoll,
      input.rng.algorithm,
      input.rng.before,
      input.rng.after,
      input.success ? "success" : "failure",
      input.pokemon ? encode(input.pokemon.selectedAbilityId, "selectedAbilityId") : null,
      pokemonInstanceId,
      now,
    ],
  );
  if (input.pokemon) {
    await client.query(
      `INSERT INTO pokenexus.capture_attempt_constructions (
         capture_attempt_id, pokemon_instance_id, owner_player_id,
         iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe,
         initial_total_experience, genetic_score, genetic_profile_a, genetic_profile_b,
         birth_profile, shiny, selected_ability_id
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
       )`,
      [
        captureAttemptId,
        pokemonInstanceId,
        input.subjectPlayerId,
        input.pokemon.ivs.hp,
        input.pokemon.ivs.atk,
        input.pokemon.ivs.def,
        input.pokemon.ivs.spa,
        input.pokemon.ivs.spd,
        input.pokemon.ivs.spe,
        input.pokemon.totalExperience.toString(),
        input.pokemon.geneticScore,
        input.pokemon.compatibleProfiles[0],
        input.pokemon.compatibleProfiles[1],
        input.pokemon.birthProfile,
        input.pokemon.shiny,
        encode(input.pokemon.selectedAbilityId, "construction selectedAbilityId"),
      ],
    );
    for (let index = 0; index < input.pokemon.moveIds.length; index += 1) {
      await client.query(
        `INSERT INTO pokenexus.capture_attempt_moves (capture_attempt_id, slot, move_id) VALUES ($1, $2, $3)`,
        [captureAttemptId, index + 1, encode(input.pokemon.moveIds[index]!, "capture moveId")],
      );
    }
  }
}

export async function commitCaptureAttemptInTransaction(
  client: CaptureDbClient,
  input: CaptureAttemptCommitInput,
): Promise<CaptureAttemptCommitResult> {
  validateIntent(input);
  if (!await lockPlayerForCaptureAttempt(client, input.subjectPlayerId)) {
    return { status: "inventory_not_found" };
  }
  const replay = await loadAttemptByCorrelation(client, input.subjectPlayerId, input.attemptCorrelation, true);
  if (replay) {
    return sameIntent(replay, input)
      ? { status: "accepted", replayed: true, attempt: replay }
      : { status: "conflict", existingAttemptId: replay.captureAttemptId };
  }
  const consumed = await loadAttemptByEncounter(client, input.encounterId);
  if (consumed) return { status: "encounter_consumed", existingAttemptId: consumed.captureAttemptId };

  const debit = await removeInventoryEntriesInTransaction(client, {
    playerId: input.subjectPlayerId,
    expectedRowVersion: input.expectedInventoryRowVersion,
    removals: [{ itemId: input.selectedItemId, quantity: 1n }],
    now: input.now,
  });
  if (debit.status === "not_found") return { status: "inventory_not_found" };
  if (debit.status === "stale") return { status: "inventory_stale", rowVersion: debit.rowVersion };
  if (debit.status === "insufficient") return { status: "insufficient_ball", quantity: debit.quantity };
  if (debit.status !== "updated") throw new Error(`unexpected Inventory debit result: ${debit.status}`);

  const captureAttemptId = generateUuidV7();
  const pokemonInstanceId = input.pokemon ? generateUuidV7() : null;
  if (input.pokemon && pokemonInstanceId) {
    if (
      !Number.isSafeInteger(input.initialPokemonVitalityCurrentHp)
      || input.initialPokemonVitalityCurrentHp === undefined
      || input.initialPokemonVitalityCurrentHp <= 0
    ) {
      throw new Error("successful capture requires positive initial Pokémon vitality HP");
    }
    await insertPokemon(client, input.subjectPlayerId, input.pokemon, pokemonInstanceId, input.now);
    const vitality = await createPokemonVitalityInTransaction(client, {
      ownerPlayerId: input.subjectPlayerId,
      pokemonInstanceId,
      currentHp: input.initialPokemonVitalityCurrentHp,
      now: input.now,
    });
    if (vitality.status !== "created") {
      throw new Error("successful capture failed to create Pokémon vitality atomically");
    }
    await incrementSpeciesResearch(client, input.subjectPlayerId, input.speciesId, input.now);
  }
  await insertAttempt(client, input, captureAttemptId, pokemonInstanceId, input.now);
  const stored = await loadAttemptByCorrelation(client, input.subjectPlayerId, input.attemptCorrelation);
  if (!stored) throw new Error("capture attempt disappeared after insert");
  return { status: "accepted", replayed: false, attempt: stored };
}

export async function commitCaptureAttempt(
  client: CaptureDbClient,
  input: CaptureAttemptCommitInput,
): Promise<CaptureAttemptCommitResult> {
  return withTransaction(client, (transaction) => commitCaptureAttemptInTransaction(transaction, input));
}
