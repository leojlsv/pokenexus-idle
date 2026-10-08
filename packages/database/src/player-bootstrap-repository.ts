import type { Client } from "pg";
import { grantInventoryEntriesInTransaction, loadInventory } from "./inventory-repository.js";
import { encodeOpaqueStringDbV1, decodeOpaqueStringDbV1 } from "./opaque-string-db-codec.js";
import { createPokemonVitalityInTransaction } from "./pokemon-vitality-repository.js";
import { withTransaction } from "./transaction.js";
import { generateUuidV7 } from "./uuid-v7.js";

export type PlayerBootstrapDbClient = Pick<Client, "query">;

export type BootstrapGeneticProfile =
  | "Harmony"
  | "Might"
  | "Clarity"
  | "Endurance"
  | "Resilience";

export interface PlayerBootstrapPokemonConstruction {
  readonly speciesId: string;
  readonly level: 1 | 5;
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
  readonly compatibleProfiles: readonly [BootstrapGeneticProfile, BootstrapGeneticProfile];
  readonly birthProfile: BootstrapGeneticProfile;
  readonly shiny: boolean;
  readonly individualizationRulesVersion: string;
  readonly derivationAuthorityVersion: string;
  readonly derivationAuthorityKeyId: string;
  readonly originIdentity: string;
  readonly individualizationSnapshotIdentity: string;
  readonly individualizationSnapshotCommitment: string;
  readonly contentVersion: string;
  readonly contentHash: string;
  readonly gameDataVersion: string;
  readonly selectedAbilityId: string | null;
  readonly moveIds: readonly string[];
  readonly initialCurrentHp: number;
}

export interface CommitPlayerBootstrapInput {
  readonly playerId: string;
  readonly rulesVersion: string;
  readonly pokemon: PlayerBootstrapPokemonConstruction;
  readonly inventoryGrants: readonly {
    readonly itemId: string;
    readonly quantity: bigint;
  }[];
  readonly now: Date;
}

export interface PlayerBootstrapRecord {
  readonly playerId: string;
  readonly starterSpeciesId: string;
  readonly pokemonInstanceId: string;
  readonly teamId: string;
  readonly gameDataVersion: string;
  readonly rulesVersion: string;
  readonly contentVersion: string;
  readonly contentHash: string;
  readonly acceptedAt: Date;
}

export type CommitPlayerBootstrapResult =
  | { readonly status: "accepted"; readonly replayed: boolean; readonly bootstrap: PlayerBootstrapRecord }
  | { readonly status: "starter_conflict"; readonly bootstrap: PlayerBootstrapRecord }
  | { readonly status: "state_conflict"; readonly reason: "owned_pokemon" | "team" | "inventory" }
  | { readonly status: "player_not_found" };

interface BootstrapRow {
  readonly player_id: string;
  readonly starter_species_id: Buffer;
  readonly pokemon_instance_id: string;
  readonly team_id: string;
  readonly game_data_version: Buffer;
  readonly rules_version: Buffer;
  readonly content_version: Buffer;
  readonly content_hash: Buffer;
  readonly accepted_at: Date;
}

const IV_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
const PROFILES = new Set<BootstrapGeneticProfile>([
  "Harmony", "Might", "Clarity", "Endurance", "Resilience",
]);

function encode(value: string, label: string): Buffer {
  if (!value) throw new TypeError(`${label} must be non-empty`);
  return Buffer.from(encodeOpaqueStringDbV1(value));
}

function mapBootstrap(row: BootstrapRow): PlayerBootstrapRecord {
  return {
    playerId: row.player_id,
    starterSpeciesId: decodeOpaqueStringDbV1(row.starter_species_id),
    pokemonInstanceId: row.pokemon_instance_id,
    teamId: row.team_id,
    gameDataVersion: decodeOpaqueStringDbV1(row.game_data_version),
    rulesVersion: decodeOpaqueStringDbV1(row.rules_version),
    contentVersion: decodeOpaqueStringDbV1(row.content_version),
    contentHash: decodeOpaqueStringDbV1(row.content_hash),
    acceptedAt: row.accepted_at,
  };
}

function validatePokemon(pokemon: PlayerBootstrapPokemonConstruction): void {
  // Source versions bind creation baselines; bootstrap is not a general Level/XP setter.
  const validBaseline = pokemon.contentVersion === "player-bootstrap-prealpha-v1"
    ? pokemon.level === 1 && pokemon.totalExperience === 0n
    : pokemon.contentVersion === "player-bootstrap-prealpha-v2"
      && pokemon.level === 5 && pokemon.totalExperience === 124n;
  if (!validBaseline) {
    throw new Error("starter bootstrap content version, level and experience do not match an accepted baseline");
  }
  for (const key of IV_KEYS) {
    const value = pokemon.ivs[key];
    if (!Number.isSafeInteger(value) || value < 0 || value > 31) {
      throw new RangeError(`starter IV ${key} must be an integer in 0..31`);
    }
  }
  if (!Number.isSafeInteger(pokemon.geneticScore) || pokemon.geneticScore < 0 || pokemon.geneticScore > 100) {
    throw new RangeError("starter geneticScore must be an integer in 0..100");
  }
  const [left, right] = pokemon.compatibleProfiles;
  if (!PROFILES.has(left) || !PROFILES.has(right) || left === right || !pokemon.compatibleProfiles.includes(pokemon.birthProfile)) {
    throw new Error("starter compatibleProfiles/birthProfile are invalid");
  }
  if (pokemon.moveIds.length < 1 || pokemon.moveIds.length > 4 || new Set(pokemon.moveIds).size !== pokemon.moveIds.length) {
    throw new Error("starter moveIds must contain 1..4 distinct Moves");
  }
  if (!Number.isSafeInteger(pokemon.initialCurrentHp) || pokemon.initialCurrentHp <= 0) {
    throw new Error("starter initialCurrentHp must be a positive integer");
  }
  for (const [label, value] of [
    ["speciesId", pokemon.speciesId],
    ["individualizationRulesVersion", pokemon.individualizationRulesVersion],
    ["derivationAuthorityVersion", pokemon.derivationAuthorityVersion],
    ["derivationAuthorityKeyId", pokemon.derivationAuthorityKeyId],
    ["originIdentity", pokemon.originIdentity],
    ["individualizationSnapshotIdentity", pokemon.individualizationSnapshotIdentity],
    ["individualizationSnapshotCommitment", pokemon.individualizationSnapshotCommitment],
    ["contentVersion", pokemon.contentVersion],
    ["contentHash", pokemon.contentHash],
    ["gameDataVersion", pokemon.gameDataVersion],
  ] as const) {
    if (!value) throw new Error(`starter ${label} must be non-empty`);
  }
}

async function lockPlayer(client: PlayerBootstrapDbClient, playerId: string): Promise<boolean> {
  const result = await client.query(
    `SELECT player_id FROM pokenexus.players WHERE player_id = $1 FOR UPDATE`,
    [playerId],
  );
  return result.rowCount === 1;
}

async function loadBootstrap(
  client: PlayerBootstrapDbClient,
  playerId: string,
): Promise<PlayerBootstrapRecord | null> {
  const result = await client.query<BootstrapRow>(
    `SELECT player_id, starter_species_id, pokemon_instance_id, team_id,
            game_data_version, rules_version, content_version, content_hash, accepted_at
       FROM pokenexus.player_bootstraps
      WHERE player_id = $1`,
    [playerId],
  );
  return result.rows[0] ? mapBootstrap(result.rows[0]) : null;
}

async function assertEmptyCollectionAndTeams(
  client: PlayerBootstrapDbClient,
  playerId: string,
): Promise<CommitPlayerBootstrapResult | null> {
  const pokemon = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM pokenexus.pokemon_instances WHERE owner_player_id = $1`,
    [playerId],
  );
  if (BigInt(pokemon.rows[0]?.count ?? "0") !== 0n) {
    return { status: "state_conflict", reason: "owned_pokemon" };
  }
  const teams = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM pokenexus.pokemon_teams WHERE owner_player_id = $1`,
    [playerId],
  );
  if (BigInt(teams.rows[0]?.count ?? "0") !== 0n) {
    return { status: "state_conflict", reason: "team" };
  }
  return null;
}

async function insertPokemon(
  client: PlayerBootstrapDbClient,
  input: CommitPlayerBootstrapInput,
  pokemonInstanceId: string,
): Promise<void> {
  const pokemon = input.pokemon;
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
       $1, $2, $3, $26,
       $4, $5, $6, $7, $8, $9,
       $27, $10,
       $11, $12, $13, $14, $14, $15,
       $16, $17, $18, $19, $20, $21, $22, $23, $24,
       0, $25, $25
     )`,
    [
      pokemonInstanceId,
      input.playerId,
      encode(pokemon.speciesId, "speciesId"),
      pokemon.ivs.hp,
      pokemon.ivs.atk,
      pokemon.ivs.def,
      pokemon.ivs.spa,
      pokemon.ivs.spd,
      pokemon.ivs.spe,
      pokemon.selectedAbilityId === null ? null : encode(pokemon.selectedAbilityId, "selectedAbilityId"),
      pokemon.geneticScore,
      profileA,
      profileB,
      pokemon.birthProfile,
      pokemon.shiny,
      encode(pokemon.individualizationRulesVersion, "individualizationRulesVersion"),
      encode(pokemon.derivationAuthorityVersion, "derivationAuthorityVersion"),
      encode(pokemon.derivationAuthorityKeyId, "derivationAuthorityKeyId"),
      encode(pokemon.originIdentity, "originIdentity"),
      encode(pokemon.individualizationSnapshotIdentity, "individualizationSnapshotIdentity"),
      encode(pokemon.individualizationSnapshotCommitment, "individualizationSnapshotCommitment"),
      encode(pokemon.contentVersion, "contentVersion"),
      encode(pokemon.contentHash, "contentHash"),
      encode(pokemon.gameDataVersion, "gameDataVersion"),
      input.now,
      pokemon.level,
      pokemon.totalExperience.toString(),
    ],
  );
  for (let index = 0; index < pokemon.moveIds.length; index += 1) {
    await client.query(
      `INSERT INTO pokenexus.pokemon_move_loadout (
         owner_player_id, pokemon_instance_id, slot, move_id, created_at
       ) VALUES ($1, $2, $3, $4, $5)`,
      [input.playerId, pokemonInstanceId, index + 1, encode(pokemon.moveIds[index]!, "moveId"), input.now],
    );
  }
}

export async function commitPlayerBootstrapInTransaction(
  client: PlayerBootstrapDbClient,
  input: CommitPlayerBootstrapInput,
): Promise<CommitPlayerBootstrapResult> {
  validatePokemon(input.pokemon);
  encode(input.rulesVersion, "rulesVersion");
  if (input.inventoryGrants.length === 0) throw new Error("starter bootstrap requires Inventory grants");
  if (!(await lockPlayer(client, input.playerId))) return { status: "player_not_found" };

  const existing = await loadBootstrap(client, input.playerId);
  if (existing) {
    return existing.starterSpeciesId === input.pokemon.speciesId
      ? { status: "accepted", replayed: true, bootstrap: existing }
      : { status: "starter_conflict", bootstrap: existing };
  }

  const collectionConflict = await assertEmptyCollectionAndTeams(client, input.playerId);
  if (collectionConflict) return collectionConflict;
  const inventory = await loadInventory(client, input.playerId, true);
  if (!inventory || inventory.rowVersion !== 0n || inventory.entries.length !== 0) {
    return { status: "state_conflict", reason: "inventory" };
  }

  const pokemonInstanceId = generateUuidV7();
  const teamId = generateUuidV7();
  await insertPokemon(client, input, pokemonInstanceId);
  const vitality = await createPokemonVitalityInTransaction(client, {
    ownerPlayerId: input.playerId,
    pokemonInstanceId,
    currentHp: input.pokemon.initialCurrentHp,
    now: input.now,
  });
  if (vitality.status !== "created") throw new Error("starter bootstrap failed to create vitality atomically");

  await client.query(
    `INSERT INTO pokenexus.pokemon_teams (
       team_id, owner_player_id, row_version, created_at, updated_at
     ) VALUES ($1, $2, 0, $3, $3)`,
    [teamId, input.playerId, input.now],
  );
  await client.query(
    `INSERT INTO pokenexus.pokemon_team_members (
       team_member_id, team_id, pokemon_instance_id, owner_player_id, created_at, slot
     ) VALUES ($1, $2, $3, $4, $5, 1)`,
    [generateUuidV7(), teamId, pokemonInstanceId, input.playerId, input.now],
  );

  const inventoryResult = await grantInventoryEntriesInTransaction(client, {
    playerId: input.playerId,
    expectedRowVersion: inventory.rowVersion,
    grants: input.inventoryGrants,
    now: input.now,
  });
  if (inventoryResult.status !== "updated") {
    throw new Error(`starter bootstrap Inventory grant failed atomically: ${inventoryResult.status}`);
  }

  await client.query(
    `INSERT INTO pokenexus.player_hunt_roots (player_id, created_at, updated_at)
     VALUES ($1, $2, $2)
     ON CONFLICT (player_id) DO NOTHING`,
    [input.playerId, input.now],
  );
  await client.query(
    `INSERT INTO pokenexus.player_bootstraps (
       player_id, starter_species_id, pokemon_instance_id, team_id,
       game_data_version, rules_version, content_version, content_hash, accepted_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.playerId,
      encode(input.pokemon.speciesId, "speciesId"),
      pokemonInstanceId,
      teamId,
      encode(input.pokemon.gameDataVersion, "gameDataVersion"),
      encode(input.rulesVersion, "rulesVersion"),
      encode(input.pokemon.contentVersion, "contentVersion"),
      encode(input.pokemon.contentHash, "contentHash"),
      input.now,
    ],
  );
  const stored = await loadBootstrap(client, input.playerId);
  if (!stored) throw new Error("starter bootstrap disappeared after insert");
  return { status: "accepted", replayed: false, bootstrap: stored };
}

export async function commitPlayerBootstrap(
  client: PlayerBootstrapDbClient,
  input: CommitPlayerBootstrapInput,
): Promise<CommitPlayerBootstrapResult> {
  return withTransaction(client, (transaction) => commitPlayerBootstrapInTransaction(transaction, input));
}
