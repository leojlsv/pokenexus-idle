import type { Client } from "pg";
import { decodeOpaqueStringDbV1, encodeOpaqueStringDbV1 } from "./opaque-string-db-codec.js";
import { withTransaction } from "./transaction.js";
import { generateUuidV7 } from "./uuid-v7.js";

export type CollectionTeamDbClient = Pick<Client, "query">;

export interface PokemonIvs {
  readonly hp: number;
  readonly atk: number;
  readonly def: number;
  readonly spa: number;
  readonly spd: number;
  readonly spe: number;
}

export type PokemonMoveLoadout =
  | { readonly state: "uninitialized"; readonly moveIds: readonly [] }
  | { readonly state: "selected"; readonly moveIds: readonly string[] };

export interface OwnedPokemonRecord {
  readonly pokemonInstanceId: string;
  readonly ownerPlayerId: string;
  readonly speciesId: string;
  readonly level: number;
  readonly ivs: PokemonIvs;
  readonly selectedAbilityId: string | null;
  readonly moveLoadout: PokemonMoveLoadout;
  readonly rowVersion: bigint;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OwnedPokemonSummary {
  readonly pokemonInstanceId: string;
  readonly ownerPlayerId: string;
  readonly speciesId: string;
  readonly level: number;
  readonly selectedAbilityId: string | null;
  readonly rowVersion: bigint;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OwnedTeamRecord {
  readonly teamId: string;
  readonly ownerPlayerId: string;
  readonly pokemonInstanceIds: readonly string[];
  readonly rowVersion: bigint;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OwnedTeamSummary {
  readonly teamId: string;
  readonly ownerPlayerId: string;
  readonly rowVersion: bigint;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OwnedPokemonPage {
  readonly items: readonly OwnedPokemonSummary[];
  readonly nextAfterPokemonInstanceId: string | null;
}

export interface OwnedTeamPage {
  readonly teams: readonly OwnedTeamSummary[];
  readonly nextAfterTeamId: string | null;
}

export type TeamCreateCommandResult =
  | {
      readonly status: "accepted";
      readonly teamId: string;
      readonly rowVersion: bigint;
      readonly replay: boolean;
    }
  | { readonly status: "idempotency_gone" }
  | { readonly status: "team_limit_reached" }
  | { readonly status: "rate_limited"; readonly retryAfterSeconds: number }
  | { readonly status: "not_found" };

export type OccMutationResult =
  | { readonly status: "updated"; readonly rowVersion: bigint }
  | { readonly status: "stale"; readonly rowVersion: bigint }
  | { readonly status: "not_found" };

type OccRejectionResult = Exclude<OccMutationResult, { readonly status: "updated" }>;

export type TeamRosterReplaceResult =
  | OccMutationResult
  | { readonly status: "invalid_member"; readonly pokemonInstanceId: string };

export type TeamDeleteResult =
  | { readonly status: "deleted" }
  | { readonly status: "stale"; readonly rowVersion: bigint }
  | { readonly status: "not_found" };

interface PokemonAggregateRow {
  readonly pokemon_instance_id: string;
  readonly owner_player_id: string;
  readonly species_id: Buffer;
  readonly level: number;
  readonly iv_hp: number;
  readonly iv_atk: number;
  readonly iv_def: number;
  readonly iv_spa: number;
  readonly iv_spd: number;
  readonly iv_spe: number;
  readonly selected_ability_id: Buffer | null;
  readonly row_version: string;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly slot: number | null;
  readonly move_id: Buffer | null;
}

interface PokemonSummaryRow {
  readonly pokemon_instance_id: string;
  readonly owner_player_id: string;
  readonly species_id: Buffer;
  readonly level: number;
  readonly selected_ability_id: Buffer | null;
  readonly row_version: string;
  readonly created_at: Date;
  readonly updated_at: Date;
}

interface TeamAggregateRow {
  readonly team_id: string;
  readonly owner_player_id: string;
  readonly row_version: string;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly slot: number | null;
  readonly pokemon_instance_id: string | null;
}

interface TeamSummaryRow {
  readonly team_id: string;
  readonly owner_player_id: string;
  readonly row_version: string;
  readonly created_at: Date;
  readonly updated_at: Date;
}

interface TeamCreateCommandRow {
  readonly team_id: string | null;
  readonly deleted_at: Date | null;
}

const TEAM_LIVE_LIMIT = 6n;
const TEAM_CREATE_ROLLING_LIMIT = 64n;
const TEAM_CREATE_TOMBSTONE_COMPACTION_BATCH = 256;

function assertNonNegativeRowVersion(rowVersion: bigint): void {
  if (rowVersion < 0n) {
    throw new Error("expectedRowVersion must be non-negative");
  }
}

function encodeRequiredOpaqueId(value: string, label: string): Buffer {
  if (value.length === 0) {
    throw new Error(`${label} must be a non-empty opaque identifier`);
  }
  return Buffer.from(encodeOpaqueStringDbV1(value));
}

function decodeRequiredOpaqueId(value: Buffer, label: string): string {
  if (value.byteLength === 0) {
    throw new Error(`Persisted ${label} must be a non-empty opaque identifier`);
  }
  return decodeOpaqueStringDbV1(value);
}

function validateMoveIds(moveIds: readonly string[]): readonly Buffer[] {
  if (moveIds.length < 1 || moveIds.length > 4) {
    throw new Error("Selected Move Loadout must contain 1..4 MoveIds");
  }
  if (new Set(moveIds).size !== moveIds.length) {
    throw new Error("Selected Move Loadout cannot contain a duplicate MoveId");
  }
  return moveIds.map((moveId) => encodeRequiredOpaqueId(moveId, "MoveId"));
}

function validateRoster(pokemonInstanceIds: readonly string[]): void {
  if (pokemonInstanceIds.length > 6) {
    throw new Error("Saved Team roster must contain 0..6 PokemonInstanceIds");
  }
  if (new Set(pokemonInstanceIds).size !== pokemonInstanceIds.length) {
    throw new Error("Saved Team roster cannot contain a duplicate PokemonInstanceId");
  }
}

function assertPageLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("page limit must be an integer between 1 and 100");
  }
}

function mapPokemonSummary(row: PokemonSummaryRow): OwnedPokemonSummary {
  return {
    pokemonInstanceId: row.pokemon_instance_id,
    ownerPlayerId: row.owner_player_id,
    speciesId: decodeRequiredOpaqueId(row.species_id, "SpeciesId"),
    level: row.level,
    selectedAbilityId:
      row.selected_ability_id === null
        ? null
        : decodeRequiredOpaqueId(row.selected_ability_id, "AbilityId"),
    rowVersion: BigInt(row.row_version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPokemonAggregate(rows: readonly PokemonAggregateRow[]): OwnedPokemonRecord | null {
  const first = rows[0];
  if (!first) {
    return null;
  }
  const moveIds: string[] = [];
  for (const row of rows) {
    if (row.slot === null || row.move_id === null) {
      if (row.slot !== null || row.move_id !== null) {
        throw new Error("Persisted Move Loadout has an incomplete slot row");
      }
      continue;
    }
    if (row.slot !== moveIds.length + 1) {
      throw new Error("Persisted Move Loadout is not dense from slot 1");
    }
    moveIds.push(decodeRequiredOpaqueId(row.move_id, "MoveId"));
  }
  if (moveIds.length > 4) {
    throw new Error("Persisted Move Loadout exceeds four slots");
  }
  return {
    pokemonInstanceId: first.pokemon_instance_id,
    ownerPlayerId: first.owner_player_id,
    speciesId: decodeRequiredOpaqueId(first.species_id, "SpeciesId"),
    level: first.level,
    ivs: {
      hp: first.iv_hp,
      atk: first.iv_atk,
      def: first.iv_def,
      spa: first.iv_spa,
      spd: first.iv_spd,
      spe: first.iv_spe,
    },
    selectedAbilityId:
      first.selected_ability_id === null
        ? null
        : decodeRequiredOpaqueId(first.selected_ability_id, "AbilityId"),
    moveLoadout:
      moveIds.length === 0
        ? { state: "uninitialized", moveIds: [] }
        : { state: "selected", moveIds },
    rowVersion: BigInt(first.row_version),
    createdAt: first.created_at,
    updatedAt: first.updated_at,
  };
}

function mapTeamSummary(row: TeamSummaryRow): OwnedTeamSummary {
  return {
    teamId: row.team_id,
    ownerPlayerId: row.owner_player_id,
    rowVersion: BigInt(row.row_version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTeamAggregate(rows: readonly TeamAggregateRow[]): OwnedTeamRecord | null {
  const first = rows[0];
  if (!first) {
    return null;
  }
  const pokemonInstanceIds: string[] = [];
  for (const row of rows) {
    if (row.slot === null || row.pokemon_instance_id === null) {
      if (row.slot !== null || row.pokemon_instance_id !== null) {
        throw new Error("Persisted Team roster has an incomplete slot row");
      }
      continue;
    }
    if (row.slot !== pokemonInstanceIds.length + 1) {
      throw new Error("Persisted Team roster is not dense from slot 1");
    }
    pokemonInstanceIds.push(row.pokemon_instance_id);
  }
  if (pokemonInstanceIds.length > 6 || new Set(pokemonInstanceIds).size !== pokemonInstanceIds.length) {
    throw new Error("Persisted Team roster violates cardinality or uniqueness");
  }
  return {
    teamId: first.team_id,
    ownerPlayerId: first.owner_player_id,
    pokemonInstanceIds,
    rowVersion: BigInt(first.row_version),
    createdAt: first.created_at,
    updatedAt: first.updated_at,
  };
}

async function lockOwnedPokemonVersion(
  client: CollectionTeamDbClient,
  ownerPlayerId: string,
  pokemonInstanceId: string,
): Promise<bigint | null> {
  const result = await client.query<{ row_version: string }>(
    `SELECT row_version
     FROM pokenexus.pokemon_instances
     WHERE owner_player_id = $1 AND pokemon_instance_id = $2
     FOR UPDATE`,
    [ownerPlayerId, pokemonInstanceId],
  );
  return result.rows[0] ? BigInt(result.rows[0].row_version) : null;
}

async function lockOwnedTeamVersion(
  client: CollectionTeamDbClient,
  ownerPlayerId: string,
  teamId: string,
): Promise<bigint | null> {
  const result = await client.query<{ row_version: string }>(
    `SELECT row_version
     FROM pokenexus.pokemon_teams
     WHERE owner_player_id = $1 AND team_id = $2
     FOR UPDATE`,
    [ownerPlayerId, teamId],
  );
  return result.rows[0] ? BigInt(result.rows[0].row_version) : null;
}

async function lockPlayerForTeamCommand(
  client: CollectionTeamDbClient,
  ownerPlayerId: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT player_id
     FROM pokenexus.players
     WHERE player_id = $1
     FOR UPDATE`,
    [ownerPlayerId],
  );
  return result.rowCount === 1;
}

async function compactExpiredTeamCreateTombstones(
  client: CollectionTeamDbClient,
  now: Date,
): Promise<void> {
  await client.query(
    `DELETE FROM pokenexus.team_create_commands target
     USING (
       SELECT player_id, idempotency_key
       FROM pokenexus.team_create_commands
       WHERE team_id IS NULL
         AND deleted_at <= $1::timestamptz - interval '30 days'
       ORDER BY deleted_at, player_id, idempotency_key
       LIMIT $2
     ) expired
     WHERE target.player_id = expired.player_id
       AND target.idempotency_key = expired.idempotency_key`,
    [now, TEAM_CREATE_TOMBSTONE_COMPACTION_BATCH],
  );
}

function classifyLockedVersion(current: bigint | null, expected: bigint): OccRejectionResult | null {
  if (current === null) {
    return { status: "not_found" };
  }
  if (current !== expected) {
    return { status: "stale", rowVersion: current };
  }
  return null;
}

export async function loadOwnedPokemon(
  client: CollectionTeamDbClient,
  ownerPlayerId: string,
  pokemonInstanceId: string,
): Promise<OwnedPokemonRecord | null> {
  const result = await client.query<PokemonAggregateRow>(
    `SELECT p.pokemon_instance_id, p.owner_player_id, p.species_id, p.level,
            p.iv_hp, p.iv_atk, p.iv_def, p.iv_spa, p.iv_spd, p.iv_spe,
            p.selected_ability_id, p.row_version, p.created_at, p.updated_at,
            l.slot, l.move_id
     FROM pokenexus.pokemon_instances p
     LEFT JOIN pokenexus.pokemon_move_loadout l
       ON l.owner_player_id = p.owner_player_id
      AND l.pokemon_instance_id = p.pokemon_instance_id
     WHERE p.owner_player_id = $1 AND p.pokemon_instance_id = $2
     ORDER BY l.slot`,
    [ownerPlayerId, pokemonInstanceId],
  );
  return mapPokemonAggregate(result.rows);
}

export async function listOwnedPokemon(
  client: CollectionTeamDbClient,
  ownerPlayerId: string,
): Promise<readonly OwnedPokemonSummary[]> {
  const result = await client.query<PokemonSummaryRow>(
    `SELECT pokemon_instance_id, owner_player_id, species_id, level, selected_ability_id,
            row_version, created_at, updated_at
     FROM pokenexus.pokemon_instances
     WHERE owner_player_id = $1`,
    [ownerPlayerId],
  );
  return result.rows.map(mapPokemonSummary);
}

export async function listOwnedPokemonPage(
  client: CollectionTeamDbClient,
  input: {
    readonly ownerPlayerId: string;
    readonly afterPokemonInstanceId: string | null;
    readonly limit: number;
  },
): Promise<OwnedPokemonPage> {
  assertPageLimit(input.limit);
  const result = await client.query<PokemonSummaryRow>(
    `SELECT pokemon_instance_id, owner_player_id, species_id, level, selected_ability_id,
            row_version, created_at, updated_at
     FROM pokenexus.pokemon_instances
     WHERE owner_player_id = $1
       AND ($2::uuid IS NULL OR pokemon_instance_id > $2::uuid)
     ORDER BY pokemon_instance_id
     LIMIT $3`,
    [input.ownerPlayerId, input.afterPokemonInstanceId, input.limit + 1],
  );
  const items = result.rows.slice(0, input.limit).map(mapPokemonSummary);
  return {
    items,
    nextAfterPokemonInstanceId:
      result.rows.length > input.limit ? items[items.length - 1]?.pokemonInstanceId ?? null : null,
  };
}

/** Persists a caller-authorized selected Ability; this repository validates structure, not static eligibility. */
export async function setOwnedPokemonSelectedAbility(
  client: CollectionTeamDbClient,
  input: {
    readonly ownerPlayerId: string;
    readonly pokemonInstanceId: string;
    readonly expectedRowVersion: bigint;
    readonly selectedAbilityId: string | null;
    readonly now: Date;
  },
): Promise<OccMutationResult> {
  assertNonNegativeRowVersion(input.expectedRowVersion);
  const encodedAbility =
    input.selectedAbilityId === null
      ? null
      : encodeRequiredOpaqueId(input.selectedAbilityId, "selectedAbilityId");
  return withTransaction(client, async (transaction) => {
    const current = await lockOwnedPokemonVersion(
      transaction,
      input.ownerPlayerId,
      input.pokemonInstanceId,
    );
    const rejected = classifyLockedVersion(current, input.expectedRowVersion);
    if (rejected) return rejected;
    const updated = await transaction.query<{ row_version: string }>(
      `UPDATE pokenexus.pokemon_instances
       SET selected_ability_id = $4, row_version = row_version + 1, updated_at = $5
       WHERE owner_player_id = $1 AND pokemon_instance_id = $2 AND row_version = $3
       RETURNING row_version`,
      [
        input.ownerPlayerId,
        input.pokemonInstanceId,
        input.expectedRowVersion.toString(),
        encodedAbility,
        input.now,
      ],
    );
    if (!updated.rows[0]) throw new Error("Locked Pokémon OCC update unexpectedly failed");
    return { status: "updated", rowVersion: BigInt(updated.rows[0].row_version) };
  });
}

/** Persists a caller-authorized Move Loadout; this repository validates structure, not Move eligibility. */
export async function replaceOwnedPokemonMoveLoadout(
  client: CollectionTeamDbClient,
  input: {
    readonly ownerPlayerId: string;
    readonly pokemonInstanceId: string;
    readonly expectedRowVersion: bigint;
    readonly moveIds: readonly string[];
    readonly now: Date;
  },
): Promise<OccMutationResult> {
  assertNonNegativeRowVersion(input.expectedRowVersion);
  const encodedMoves = validateMoveIds(input.moveIds);
  return withTransaction(client, async (transaction) => {
    const current = await lockOwnedPokemonVersion(
      transaction,
      input.ownerPlayerId,
      input.pokemonInstanceId,
    );
    const rejected = classifyLockedVersion(current, input.expectedRowVersion);
    if (rejected) return rejected;

    await transaction.query(
      `DELETE FROM pokenexus.pokemon_move_loadout
       WHERE owner_player_id = $1 AND pokemon_instance_id = $2`,
      [input.ownerPlayerId, input.pokemonInstanceId],
    );
    for (let index = 0; index < encodedMoves.length; index += 1) {
      await transaction.query(
        `INSERT INTO pokenexus.pokemon_move_loadout (
           owner_player_id, pokemon_instance_id, slot, move_id, created_at
         ) VALUES ($1, $2, $3, $4, $5)`,
        [
          input.ownerPlayerId,
          input.pokemonInstanceId,
          index + 1,
          encodedMoves[index],
          input.now,
        ],
      );
    }
    const updated = await transaction.query<{ row_version: string }>(
      `UPDATE pokenexus.pokemon_instances
       SET row_version = row_version + 1, updated_at = $4
       WHERE owner_player_id = $1 AND pokemon_instance_id = $2 AND row_version = $3
       RETURNING row_version`,
      [
        input.ownerPlayerId,
        input.pokemonInstanceId,
        input.expectedRowVersion.toString(),
        input.now,
      ],
    );
    if (!updated.rows[0]) throw new Error("Locked Pokémon OCC update unexpectedly failed");
    return { status: "updated", rowVersion: BigInt(updated.rows[0].row_version) };
  });
}

export async function createOwnedTeam(
  client: CollectionTeamDbClient,
  ownerPlayerId: string,
  now: Date,
): Promise<OwnedTeamSummary> {
  const teamId = generateUuidV7();
  const result = await client.query<TeamSummaryRow>(
    `INSERT INTO pokenexus.pokemon_teams (
       team_id, owner_player_id, row_version, created_at, updated_at
     ) VALUES ($1, $2, 0, $3, $3)
     RETURNING team_id, owner_player_id, row_version, created_at, updated_at`,
    [teamId, ownerPlayerId, now],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Team creation did not return the created aggregate");
  return mapTeamSummary(row);
}

export async function createOwnedTeamIdempotent(
  client: CollectionTeamDbClient,
  input: {
    readonly ownerPlayerId: string;
    readonly idempotencyKey: string;
    readonly now: Date;
  },
): Promise<TeamCreateCommandResult> {
  return withTransaction(client, async (transaction) => {
    await compactExpiredTeamCreateTombstones(transaction, input.now);
    if (!(await lockPlayerForTeamCommand(transaction, input.ownerPlayerId))) {
      return { status: "not_found" };
    }

    const replay = await transaction.query<TeamCreateCommandRow>(
      `SELECT team_id, deleted_at
       FROM pokenexus.team_create_commands
       WHERE player_id = $1 AND idempotency_key = $2`,
      [input.ownerPlayerId, input.idempotencyKey],
    );
    const replayRow = replay.rows[0];
    if (replayRow) {
      if (replayRow.team_id !== null) {
        return { status: "accepted", teamId: replayRow.team_id, rowVersion: 0n, replay: true };
      }
      if (replayRow.deleted_at === null) {
        throw new Error("Persisted Team create tombstone is missing deleted_at");
      }
      return { status: "idempotency_gone" };
    }

    const issuance = await transaction.query<{ accepted_count: string; retry_at: Date | null }>(
      `SELECT count(*)::text AS accepted_count,
              min(accepted_at) + interval '24 hours' AS retry_at
       FROM pokenexus.team_create_commands
       WHERE player_id = $1
         AND accepted_at > $2::timestamptz - interval '24 hours'`,
      [input.ownerPlayerId, input.now],
    );
    const issuanceRow = issuance.rows[0];
    if (!issuanceRow) throw new Error("Team create issuance query returned no aggregate row");
    if (BigInt(issuanceRow.accepted_count) >= TEAM_CREATE_ROLLING_LIMIT) {
      if (issuanceRow.retry_at === null) {
        throw new Error("Rate-limited Team create is missing retry_at");
      }
      const retryAfterSeconds = Math.max(
        1,
        Math.min(86_400, Math.ceil((issuanceRow.retry_at.getTime() - input.now.getTime()) / 1_000)),
      );
      return { status: "rate_limited", retryAfterSeconds };
    }

    const liveTeams = await transaction.query<{ live_count: string }>(
      `SELECT count(*)::text AS live_count
       FROM pokenexus.pokemon_teams
       WHERE owner_player_id = $1`,
      [input.ownerPlayerId],
    );
    const liveCount = liveTeams.rows[0];
    if (!liveCount) throw new Error("Team live-count query returned no aggregate row");
    if (BigInt(liveCount.live_count) >= TEAM_LIVE_LIMIT) {
      return { status: "team_limit_reached" };
    }

    const teamId = generateUuidV7();
    const created = await transaction.query<{ team_id: string; row_version: string }>(
      `INSERT INTO pokenexus.pokemon_teams (
         team_id, owner_player_id, row_version, created_at, updated_at
       ) VALUES ($1, $2, 0, $3, $3)
       RETURNING team_id, row_version`,
      [teamId, input.ownerPlayerId, input.now],
    );
    const createdRow = created.rows[0];
    if (!createdRow) throw new Error("Team creation did not return the created aggregate");

    await transaction.query(
      `INSERT INTO pokenexus.team_create_commands (
         player_id, idempotency_key, team_id, accepted_at
       ) VALUES ($1, $2, $3, $4)`,
      [input.ownerPlayerId, input.idempotencyKey, teamId, input.now],
    );

    return {
      status: "accepted",
      teamId: createdRow.team_id,
      rowVersion: BigInt(createdRow.row_version),
      replay: false,
    };
  });
}

export async function loadOwnedTeam(
  client: CollectionTeamDbClient,
  ownerPlayerId: string,
  teamId: string,
): Promise<OwnedTeamRecord | null> {
  const result = await client.query<TeamAggregateRow>(
    `SELECT t.team_id, t.owner_player_id, t.row_version, t.created_at, t.updated_at,
            m.slot, m.pokemon_instance_id
     FROM pokenexus.pokemon_teams t
     LEFT JOIN pokenexus.pokemon_team_members m
       ON m.owner_player_id = t.owner_player_id AND m.team_id = t.team_id
     WHERE t.owner_player_id = $1 AND t.team_id = $2
     ORDER BY m.slot`,
    [ownerPlayerId, teamId],
  );
  return mapTeamAggregate(result.rows);
}

export async function listOwnedTeams(
  client: CollectionTeamDbClient,
  ownerPlayerId: string,
): Promise<readonly OwnedTeamSummary[]> {
  const result = await client.query<TeamSummaryRow>(
    `SELECT team_id, owner_player_id, row_version, created_at, updated_at
     FROM pokenexus.pokemon_teams
     WHERE owner_player_id = $1`,
    [ownerPlayerId],
  );
  return result.rows.map(mapTeamSummary);
}

export async function listOwnedTeamsPage(
  client: CollectionTeamDbClient,
  input: {
    readonly ownerPlayerId: string;
    readonly afterTeamId: string | null;
    readonly limit: number;
  },
): Promise<OwnedTeamPage> {
  assertPageLimit(input.limit);
  const result = await client.query<TeamSummaryRow>(
    `SELECT team_id, owner_player_id, row_version, created_at, updated_at
     FROM pokenexus.pokemon_teams
     WHERE owner_player_id = $1
       AND ($2::uuid IS NULL OR team_id > $2::uuid)
     ORDER BY team_id
     LIMIT $3`,
    [input.ownerPlayerId, input.afterTeamId, input.limit + 1],
  );
  const teams = result.rows.slice(0, input.limit).map(mapTeamSummary);
  return {
    teams,
    nextAfterTeamId: result.rows.length > input.limit ? teams[teams.length - 1]?.teamId ?? null : null,
  };
}

export async function replaceOwnedTeamRoster(
  client: CollectionTeamDbClient,
  input: {
    readonly ownerPlayerId: string;
    readonly teamId: string;
    readonly expectedRowVersion: bigint;
    readonly pokemonInstanceIds: readonly string[];
    readonly now: Date;
  },
): Promise<TeamRosterReplaceResult> {
  assertNonNegativeRowVersion(input.expectedRowVersion);
  validateRoster(input.pokemonInstanceIds);
  return withTransaction(client, async (transaction) => {
    const current = await lockOwnedTeamVersion(transaction, input.ownerPlayerId, input.teamId);
    const rejected = classifyLockedVersion(current, input.expectedRowVersion);
    if (rejected) return rejected;

    if (input.pokemonInstanceIds.length > 0) {
      const owned = await transaction.query<{ pokemon_instance_id: string }>(
        `SELECT pokemon_instance_id
         FROM pokenexus.pokemon_instances
         WHERE owner_player_id = $1 AND pokemon_instance_id = ANY($2::uuid[])`,
        [input.ownerPlayerId, input.pokemonInstanceIds],
      );
      const ownedIds = new Set(owned.rows.map(({ pokemon_instance_id }) => pokemon_instance_id));
      const invalid = input.pokemonInstanceIds.find((id) => !ownedIds.has(id));
      if (invalid) return { status: "invalid_member", pokemonInstanceId: invalid };
    }

    await transaction.query(
      "DELETE FROM pokenexus.pokemon_team_members WHERE owner_player_id = $1 AND team_id = $2",
      [input.ownerPlayerId, input.teamId],
    );
    for (let index = 0; index < input.pokemonInstanceIds.length; index += 1) {
      await transaction.query(
        `INSERT INTO pokenexus.pokemon_team_members (
           team_member_id, team_id, pokemon_instance_id, owner_player_id, slot, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          generateUuidV7(),
          input.teamId,
          input.pokemonInstanceIds[index],
          input.ownerPlayerId,
          index + 1,
          input.now,
        ],
      );
    }
    const updated = await transaction.query<{ row_version: string }>(
      `UPDATE pokenexus.pokemon_teams
       SET row_version = row_version + 1, updated_at = $4
       WHERE owner_player_id = $1 AND team_id = $2 AND row_version = $3
       RETURNING row_version`,
      [input.ownerPlayerId, input.teamId, input.expectedRowVersion.toString(), input.now],
    );
    if (!updated.rows[0]) throw new Error("Locked Team OCC update unexpectedly failed");
    return { status: "updated", rowVersion: BigInt(updated.rows[0].row_version) };
  });
}

export async function deleteOwnedTeam(
  client: CollectionTeamDbClient,
  input: {
    readonly ownerPlayerId: string;
    readonly teamId: string;
    readonly expectedRowVersion: bigint;
  },
): Promise<TeamDeleteResult> {
  assertNonNegativeRowVersion(input.expectedRowVersion);
  return withTransaction(client, async (transaction) => {
    const current = await lockOwnedTeamVersion(transaction, input.ownerPlayerId, input.teamId);
    const rejected = classifyLockedVersion(current, input.expectedRowVersion);
    if (rejected) return rejected;
    await transaction.query(
      "DELETE FROM pokenexus.pokemon_team_members WHERE owner_player_id = $1 AND team_id = $2",
      [input.ownerPlayerId, input.teamId],
    );
    const deleted = await transaction.query(
      `DELETE FROM pokenexus.pokemon_teams
       WHERE owner_player_id = $1 AND team_id = $2 AND row_version = $3`,
      [input.ownerPlayerId, input.teamId, input.expectedRowVersion.toString()],
    );
    if (deleted.rowCount !== 1) throw new Error("Locked Team OCC delete unexpectedly failed");
    return { status: "deleted" };
  });
}

export async function deleteOwnedTeamWithCreateTombstone(
  client: CollectionTeamDbClient,
  input: {
    readonly ownerPlayerId: string;
    readonly teamId: string;
    readonly expectedRowVersion: bigint;
    readonly now: Date;
  },
): Promise<TeamDeleteResult> {
  assertNonNegativeRowVersion(input.expectedRowVersion);
  return withTransaction(client, async (transaction) => {
    await compactExpiredTeamCreateTombstones(transaction, input.now);
    if (!(await lockPlayerForTeamCommand(transaction, input.ownerPlayerId))) {
      return { status: "not_found" };
    }
    const current = await lockOwnedTeamVersion(transaction, input.ownerPlayerId, input.teamId);
    const rejected = classifyLockedVersion(current, input.expectedRowVersion);
    if (rejected) return rejected;
    await transaction.query(
      `UPDATE pokenexus.team_create_commands
       SET team_id = NULL, deleted_at = $3
       WHERE player_id = $1 AND team_id = $2 AND deleted_at IS NULL`,
      [input.ownerPlayerId, input.teamId, input.now],
    );
    await transaction.query(
      "DELETE FROM pokenexus.pokemon_team_members WHERE owner_player_id = $1 AND team_id = $2",
      [input.ownerPlayerId, input.teamId],
    );
    const deleted = await transaction.query(
      `DELETE FROM pokenexus.pokemon_teams
       WHERE owner_player_id = $1 AND team_id = $2 AND row_version = $3`,
      [input.ownerPlayerId, input.teamId, input.expectedRowVersion.toString()],
    );
    if (deleted.rowCount !== 1) throw new Error("Locked Team OCC delete unexpectedly failed");
    return { status: "deleted" };
  });
}
