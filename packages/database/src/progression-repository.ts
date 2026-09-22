import type { Client } from "pg";

export type ProgressionDbClient = Pick<Client, "query">;

export interface PlayerProgressionRecord {
  readonly playerId: string;
  readonly level: bigint;
  readonly totalExperience: bigint;
  readonly rowVersion: bigint;
}

export interface OwnedPokemonProgressionRecord {
  readonly pokemonInstanceId: string;
  readonly ownerPlayerId: string;
  readonly level: bigint;
  readonly totalExperience: bigint;
  readonly rowVersion: bigint;
}

interface PlayerProgressionRow {
  readonly player_id: string;
  readonly player_level: string;
  readonly player_total_experience: string;
  readonly row_version: string;
}

interface PokemonProgressionRow {
  readonly pokemon_instance_id: string;
  readonly owner_player_id: string;
  readonly level: number;
  readonly total_experience: string;
  readonly row_version: string;
}

function mapPlayer(row: PlayerProgressionRow): PlayerProgressionRecord {
  return {
    playerId: row.player_id,
    level: BigInt(row.player_level),
    totalExperience: BigInt(row.player_total_experience),
    rowVersion: BigInt(row.row_version),
  };
}

function mapPokemon(row: PokemonProgressionRow): OwnedPokemonProgressionRecord {
  return {
    pokemonInstanceId: row.pokemon_instance_id,
    ownerPlayerId: row.owner_player_id,
    level: BigInt(row.level),
    totalExperience: BigInt(row.total_experience),
    rowVersion: BigInt(row.row_version),
  };
}

export async function loadPlayerProgression(
  client: ProgressionDbClient,
  playerId: string,
  forUpdate = false,
): Promise<PlayerProgressionRecord | null> {
  const result = await client.query<PlayerProgressionRow>(
    `SELECT player_id, player_level::text, player_total_experience::text, row_version::text
     FROM pokenexus.players
     WHERE player_id = $1${forUpdate ? " FOR UPDATE" : ""}`,
    [playerId],
  );
  return result.rows[0] ? mapPlayer(result.rows[0]) : null;
}

export async function loadOwnedPokemonProgression(
  client: ProgressionDbClient,
  ownerPlayerId: string,
  pokemonInstanceId: string,
  forUpdate = false,
): Promise<OwnedPokemonProgressionRecord | null> {
  const result = await client.query<PokemonProgressionRow>(
    `SELECT pokemon_instance_id, owner_player_id, level, total_experience::text, row_version::text
     FROM pokenexus.pokemon_instances
     WHERE owner_player_id = $1 AND pokemon_instance_id = $2${forUpdate ? " FOR UPDATE" : ""}`,
    [ownerPlayerId, pokemonInstanceId],
  );
  return result.rows[0] ? mapPokemon(result.rows[0]) : null;
}

export async function updatePlayerProgression(
  client: ProgressionDbClient,
  input: {
    readonly playerId: string;
    readonly expectedRowVersion: bigint;
    readonly level: bigint;
    readonly totalExperience: bigint;
    readonly now: Date;
  },
): Promise<boolean> {
  if (input.expectedRowVersion < 0n || input.level < 1n || input.totalExperience < 0n) {
    throw new RangeError("invalid Player progression persistence value");
  }
  const result = await client.query(
    `UPDATE pokenexus.players
     SET player_level = $3::numeric,
         player_total_experience = $4::numeric,
         row_version = row_version + 1,
         updated_at = $5
     WHERE player_id = $1 AND row_version = $2::bigint`,
    [
      input.playerId,
      input.expectedRowVersion.toString(),
      input.level.toString(),
      input.totalExperience.toString(),
      input.now,
    ],
  );
  return result.rowCount === 1;
}

export async function updateOwnedPokemonProgression(
  client: ProgressionDbClient,
  input: {
    readonly ownerPlayerId: string;
    readonly pokemonInstanceId: string;
    readonly expectedRowVersion: bigint;
    readonly level: bigint;
    readonly totalExperience: bigint;
    readonly now: Date;
  },
): Promise<boolean> {
  if (
    input.expectedRowVersion < 0n
    || input.level < 1n
    || input.level > 200n
    || input.totalExperience < 0n
    || input.totalExperience > 7_999_999n
  ) {
    throw new RangeError("invalid Pokémon progression persistence value");
  }
  const result = await client.query(
    `UPDATE pokenexus.pokemon_instances
     SET level = $4::smallint,
         total_experience = $5::bigint,
         row_version = row_version + 1,
         updated_at = $6
     WHERE owner_player_id = $1
       AND pokemon_instance_id = $2
       AND row_version = $3::bigint`,
    [
      input.ownerPlayerId,
      input.pokemonInstanceId,
      input.expectedRowVersion.toString(),
      input.level.toString(),
      input.totalExperience.toString(),
      input.now,
    ],
  );
  return result.rowCount === 1;
}
