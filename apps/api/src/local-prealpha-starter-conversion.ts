import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { decodeOpaqueStringDbV1, encodeOpaqueStringDbV1, type PlayerBootstrapDbClient } from "@pokenexus/database";
import { allocateGeneticBudget, deriveLevelAvailableMoves, deriveMaxHpForRulesVersion, geneticBudgetForScore, selectBootstrapMoveLoadout, type GeneticProfile } from "@pokenexus/game-core";
import type { MoveEligibilityContext } from "./moves/context";
import { PLAYER_BOOTSTRAP_CONTENT_HASH_V1, PREALPHA_STARTER_LOADOUTS, PREALPHA_STARTER_LOADOUTS_V1 } from "./player/bootstrap";

// This operator is not imported by an HTTP entry point. SPEC-027 §6 limits its targets.
export const LOCAL_STARTER_CONVERSION_TARGETS = [
  { playerId: "019a7f50-0000-7000-8000-000000000101", accountId: "019a7f50-0000-7000-8000-000000000001", pokemonId: "01a11606-b8da-76b5-9e8d-b58d5defcbb5", teamId: "01a11606-b8da-76b5-9e8d-ba7db107ae01", speciesId: "candidate:species:pokedex-bulbasaur-1:91b07648a3" },
  { playerId: "019a7f50-0000-7000-8000-000000000102", accountId: "019a7f50-0000-7000-8000-000000000002", pokemonId: "01a11606-b998-70c3-afc4-5fe40d305aa7", teamId: "01a11606-b998-70c3-afc4-60186d332c8b", speciesId: "candidate:species:pokedex-cyndaquil-155:f879aca845" },
] as const;

type Row = Record<string, unknown>;
type Target = typeof LOCAL_STARTER_CONVERSION_TARGETS[number];
interface Snapshot { pokemon: Row; vitality: Row; moves: Row[] }
export interface LocalStarterConversionPlan {
  version: "local-starter-conversion-v1";
  authorizedAt: "2026-10-07T16:05:58Z";
  operationAt: string;
  before: Snapshot[];
  after: Snapshot[];
  protectedHashes: Record<string, string>;
}

const playerIds = LOCAL_STARTER_CONVERSION_TARGETS.map((target) => target.playerId);
const pokemonIds = LOCAL_STARTER_CONVERSION_TARGETS.map((target) => target.pokemonId);
const encode = (value: string) => Buffer.from(encodeOpaqueStringDbV1(value));
const decode = (value: unknown) => {
  if (typeof value !== "string" || !/^\\x(?:[a-f0-9]{2})+$/u.test(value)) throw new Error("Invalid persisted opaque value");
  return decodeOpaqueStringDbV1(Buffer.from(value.slice(2), "hex"));
};
function normalize(row: Row): Row {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    key.endsWith("_at") && typeof value === "string" ? new Date(value).toISOString() : value]));
}
async function one(client: PlayerBootstrapDbClient, table: string, where: string, parameters: unknown[]): Promise<Row> {
  const result = await client.query<{ row: Row }>(`SELECT to_jsonb(t) AS row FROM pokenexus.${table} t WHERE ${where}`, parameters);
  if (result.rows.length !== 1) throw new Error(`Expected exactly one ${table} row`);
  return normalize(result.rows[0]!.row);
}
async function snapshot(client: PlayerBootstrapDbClient, target: Target): Promise<Snapshot> {
  const pokemon = await one(client, "pokemon_instances", "pokemon_instance_id=$1 AND owner_player_id=$2", [target.pokemonId, target.playerId]);
  const vitality = await one(client, "pokemon_vitalities", "pokemon_instance_id=$1 AND owner_player_id=$2", [target.pokemonId, target.playerId]);
  const moves = await client.query<{ row: Row }>("SELECT to_jsonb(t) AS row FROM pokenexus.pokemon_move_loadout t WHERE pokemon_instance_id=$1 AND owner_player_id=$2 ORDER BY slot", [target.pokemonId, target.playerId]);
  return { pokemon, vitality, moves: moves.rows.map(({ row }) => normalize(row)) };
}
async function assertQuiescent(client: PlayerBootstrapDbClient): Promise<void> {
  const tests = [
    ["solo_hunts", "player_id", "terminal_at IS NULL"],
    ["hunt_public_commands", "player_id", "command_status='pending'"],
    ["hunt_checkpoint_advance_commands", "subject_player_id", "command_status='pending'"],
    ["pokecenter_heal_commands", "player_id", "command_status='pending'"],
    ["hunt_healing_commands", "player_id", "heal_status='scheduled'"],
    ["hunt_pending_manual_captures", "player_id", "TRUE"],
  ];
  for (const [table, owner, predicate] of tests) {
    const result = await client.query(`SELECT 1 FROM pokenexus.${table} WHERE ${owner}=ANY($1::uuid[]) AND (${predicate}) LIMIT 1`, [playerIds]);
    if (result.rows.length) throw new Error(`Conversion blocked by unfinished ${table}`);
  }
  for (const target of LOCAL_STARTER_CONVERSION_TARGETS) {
    const root = await one(client, "player_hunt_roots", "player_id=$1", [target.playerId]);
    if (root.active_hunt_id !== null) throw new Error("Conversion blocked by active Hunt root");
    const player = await one(client, "players", "player_id=$1", [target.playerId]);
    const bootstrap = await one(client, "player_bootstraps", "player_id=$1", [target.playerId]);
    if (player.account_id !== target.accountId || bootstrap.pokemon_instance_id !== target.pokemonId || bootstrap.team_id !== target.teamId ||
      decode(bootstrap.starter_species_id) !== target.speciesId || decode(bootstrap.content_version) !== "player-bootstrap-prealpha-v1" ||
      decode(bootstrap.content_hash) !== PLAYER_BOOTSTRAP_CONTENT_HASH_V1) throw new Error("Conversion fixture identity mismatch");
    const member = await one(client, "pokemon_team_members", "team_id=$1 AND owner_player_id=$2", [target.teamId, target.playerId]);
    if (member.pokemon_instance_id !== target.pokemonId || member.slot !== 1) throw new Error("Conversion Team mismatch");
  }
}
async function protectedHashes(client: PlayerBootstrapDbClient): Promise<Record<string, string>> {
  const tables = await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='pokenexus' ORDER BY tablename");
  const result: Record<string, string> = {};
  for (const { tablename } of tables.rows) {
    if (!/^[a-z_]+$/u.test(tablename)) throw new Error("Unexpected table name");
    const removed = tablename === "pokemon_instances" ? ["level", "total_experience", "row_version", "updated_at"]
      : tablename === "pokemon_vitalities" ? ["current_hp", "row_version", "updated_at"] : [];
    const projection = removed.length ? "CASE WHEN pokemon_instance_id=ANY($1::uuid[]) THEN to_jsonb(t)-$2::text[] ELSE to_jsonb(t) END" : "to_jsonb(t)";
    const filter = tablename === "pokemon_move_loadout" ? " WHERE NOT(pokemon_instance_id=ANY($1::uuid[]))" : "";
    const values = removed.length ? [pokemonIds, removed] : filter ? [pokemonIds] : [];
    const rows = await client.query<{ row: string }>(`SELECT (${projection})::text AS row FROM pokenexus.${tablename} t${filter} ORDER BY 1`, values);
    result[tablename] = createHash("sha256").update(JSON.stringify(rows.rows.map(({ row }) => row))).digest("hex");
  }
  return result;
}
function expectedSnapshots(before: readonly Snapshot[], context: MoveEligibilityContext, operationAt: string): Snapshot[] {
  if (context.pair.gameDataVersion !== "game-data-core-kanto-johto-v5" || context.pair.rulesVersion !== "combat-rules-management-first-v1") throw new Error("Unexpected conversion content pair");
  if (new Date(operationAt).toISOString() !== operationAt) throw new Error("Conversion time must be canonical ISO");
  if (before.length !== 2) throw new Error("Conversion requires exactly two starters");
  const after: Snapshot[] = [];
  for (let index = 0; index < LOCAL_STARTER_CONVERSION_TARGETS.length; index++) {
    const target = LOCAL_STARTER_CONVERSION_TARGETS[index]!;
    const current = before[index]!;
    if (current.pokemon.level !== 1 || current.pokemon.total_experience !== 0 || current.pokemon.row_version !== 0 ||
      current.pokemon.pokemon_instance_id !== target.pokemonId || current.pokemon.owner_player_id !== target.playerId ||
      current.vitality.pokemon_instance_id !== target.pokemonId || current.vitality.owner_player_id !== target.playerId ||
      decode(current.pokemon.species_id) !== target.speciesId || decode(current.pokemon.individualization_content_version) !== "player-bootstrap-prealpha-v1" ||
      decode(current.pokemon.individualization_content_hash) !== PLAYER_BOOTSTRAP_CONTENT_HASH_V1 ||
      !isDeepStrictEqual(current.moves.map(({ move_id }) => decode(move_id)), PREALPHA_STARTER_LOADOUTS_V1[target.speciesId])) throw new Error("Starter baseline has drifted");
    const species = context.speciesById.get(target.speciesId);
    if (!species) throw new Error("Missing starter Species");
    const ivs = Object.fromEntries(["hp", "atk", "def", "spa", "spd", "spe"].map((key) => [key, current.pokemon[`iv_${key}`]])) as Parameters<typeof deriveMaxHpForRulesVersion>[2];
    const bonuses = allocateGeneticBudget(geneticBudgetForScore(Number(current.pokemon.genetic_score)), current.pokemon.expressed_profile as GeneticProfile);
    const hp = deriveMaxHpForRulesVersion(context.pair.rulesVersion as never, species.baseStats, ivs, 5, bonuses);
    if (!hp || !Number.isSafeInteger(current.vitality.row_version) || Number(current.vitality.row_version) < 0 || Number(current.vitality.row_version) >= Number.MAX_SAFE_INTEGER) throw new Error("Invalid derived HP or vitality version");
    const moves = PREALPHA_STARTER_LOADOUTS[target.speciesId];
    const eligible = deriveLevelAvailableMoves({ speciesId: target.speciesId, currentLevel: 5,
      learnset: context.learnsetsBySpecies.get(target.speciesId) ?? [] })
      .filter(({ moveId }) => context.productionExecutableMoveIds?.includes(moveId));
    if (!isDeepStrictEqual(selectBootstrapMoveLoadout(eligible), moves)) throw new Error("Conversion Move authority mismatch");
    after.push({
      pokemon: { ...current.pokemon, level: 5, total_experience: 124, row_version: 1, updated_at: operationAt },
      vitality: { ...current.vitality, current_hp: hp, row_version: Number(current.vitality.row_version) + 1, updated_at: operationAt },
      moves: isDeepStrictEqual(current.moves.map(({ move_id }) => decode(move_id)), moves) ? current.moves
        : moves.map((moveId, index) => ({ owner_player_id: target.playerId, pokemon_instance_id: target.pokemonId, slot: index + 1, move_id: `\\x${encode(moveId).toString("hex")}`, created_at: operationAt })),
    });
  }
  return after;
}
export async function prepareLocalStarterConversion(client: PlayerBootstrapDbClient, context: MoveEligibilityContext, operationAt: string): Promise<LocalStarterConversionPlan> {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await assertQuiescent(client);
    const before = await Promise.all(LOCAL_STARTER_CONVERSION_TARGETS.map((target) => snapshot(client, target)));
    const after = expectedSnapshots(before, context, operationAt);
    const plan: LocalStarterConversionPlan = { version: "local-starter-conversion-v1", authorizedAt: "2026-10-07T16:05:58Z", operationAt, before, after, protectedHashes: await protectedHashes(client) };
    await client.query("ROLLBACK");
    return plan;
  } catch (error) {
    return rollbackAndRethrow(client, error);
  }
}

async function rollbackAndRethrow(client: PlayerBootstrapDbClient, error: unknown): Promise<never> {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    throw new AggregateError([error, rollbackError], "Conversion transaction and rollback both failed", { cause: rollbackError });
  }
  throw error;
}

function validatePlan(plan: LocalStarterConversionPlan, context: MoveEligibilityContext): void {
  if (plan.version !== "local-starter-conversion-v1" || plan.authorizedAt !== "2026-10-07T16:05:58Z" || plan.before.length !== 2 || plan.after.length !== 2) throw new Error("Invalid frozen conversion plan");
  if (!isDeepStrictEqual(expectedSnapshots(plan.before, context, plan.operationAt), plan.after)) throw new Error("Conversion plan disagrees with accepted baseline");
}

export async function checkLocalStarterConversion(client: PlayerBootstrapDbClient, plan: LocalStarterConversionPlan, context: MoveEligibilityContext): Promise<void> {
  validatePlan(plan, context);
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await assertQuiescent(client);
    const current = await Promise.all(LOCAL_STARTER_CONVERSION_TARGETS.map((target) => snapshot(client, target)));
    if (!isDeepStrictEqual(current, plan.after) || !isDeepStrictEqual(await protectedHashes(client), plan.protectedHashes)) {
      throw new Error("Conversion verification differs from frozen plan");
    }
    await client.query("ROLLBACK");
  } catch (error) {
    return rollbackAndRethrow(client, error);
  }
}

export async function applyLocalStarterConversion(client: PlayerBootstrapDbClient, plan: LocalStarterConversionPlan, context: MoveEligibilityContext): Promise<"applied" | "replayed"> {
  validatePlan(plan, context);
  await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='20s'");
    const roots = await client.query("SELECT player_id FROM pokenexus.player_hunt_roots WHERE player_id=ANY($1::uuid[]) ORDER BY player_id FOR UPDATE NOWAIT", [playerIds]);
    if (roots.rows.length !== 2) throw new Error("Required Hunt root is absent");
    await client.query("SELECT player_id FROM pokenexus.players WHERE player_id=ANY($1::uuid[]) ORDER BY player_id FOR UPDATE NOWAIT", [playerIds]);
    await client.query("SELECT team_id FROM pokenexus.pokemon_teams WHERE team_id=ANY($1::uuid[]) ORDER BY team_id FOR UPDATE NOWAIT", [LOCAL_STARTER_CONVERSION_TARGETS.map(({ teamId }) => teamId)]);
    await client.query("SELECT pokemon_instance_id FROM pokenexus.pokemon_instances WHERE pokemon_instance_id=ANY($1::uuid[]) ORDER BY pokemon_instance_id FOR UPDATE NOWAIT", [pokemonIds]);
    await client.query("SELECT pokemon_instance_id FROM pokenexus.pokemon_vitalities WHERE pokemon_instance_id=ANY($1::uuid[]) ORDER BY pokemon_instance_id FOR UPDATE NOWAIT", [pokemonIds]);
    // Freeze protected tables before establishing the comparison snapshot. Row locks alone do not protect command/history inserts.
    const tables = await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='pokenexus' ORDER BY tablename");
    if (!tables.rows.length || tables.rows.some(({ tablename }) => !/^[a-z_]+$/u.test(tablename))) throw new Error("Unexpected protected tables");
    await client.query(`LOCK TABLE ${tables.rows.map(({ tablename }) => `pokenexus.${tablename}`).join(",")} IN SHARE ROW EXCLUSIVE MODE NOWAIT`);
    await assertQuiescent(client);
    if (!isDeepStrictEqual(await protectedHashes(client), plan.protectedHashes)) throw new Error("Protected state differs from frozen plan");
    const current = await Promise.all(LOCAL_STARTER_CONVERSION_TARGETS.map((target) => snapshot(client, target)));
    if (isDeepStrictEqual(current, plan.after)) { await client.query("ROLLBACK"); return "replayed"; }
    if (!isDeepStrictEqual(current, plan.before)) throw new Error("Conversion baseline differs from frozen plan");
    for (let index = 0; index < LOCAL_STARTER_CONVERSION_TARGETS.length; index++) {
      const target = LOCAL_STARTER_CONVERSION_TARGETS[index]!;
      const expected = plan.after[index]!;
      const pokemonWrite = await client.query("UPDATE pokenexus.pokemon_instances SET level=5,total_experience=124,row_version=row_version+1,updated_at=$3 WHERE pokemon_instance_id=$1 AND owner_player_id=$2 AND level=1 AND total_experience=0 AND row_version=$4", [target.pokemonId, target.playerId, plan.operationAt, plan.before[index]!.pokemon.row_version]);
      const vitalityWrite = await client.query("UPDATE pokenexus.pokemon_vitalities SET current_hp=$3,row_version=row_version+1,updated_at=$4 WHERE pokemon_instance_id=$1 AND owner_player_id=$2 AND row_version=$5", [target.pokemonId, target.playerId, expected.vitality.current_hp, plan.operationAt, plan.before[index]!.vitality.row_version]);
      if (pokemonWrite.rowCount !== 1 || vitalityWrite.rowCount !== 1) throw new Error("Conversion OCC update failed");
      if (!isDeepStrictEqual(plan.before[index]!.moves, expected.moves)) {
        await client.query("DELETE FROM pokenexus.pokemon_move_loadout WHERE pokemon_instance_id=$1 AND owner_player_id=$2", [target.pokemonId, target.playerId]);
        for (const row of expected.moves) await client.query("INSERT INTO pokenexus.pokemon_move_loadout (owner_player_id,pokemon_instance_id,slot,move_id,created_at) VALUES ($1,$2,$3,$4,$5)", [target.playerId, target.pokemonId, row.slot, encode(decode(row.move_id)), plan.operationAt]);
      }
    }
    if (!isDeepStrictEqual(await Promise.all(LOCAL_STARTER_CONVERSION_TARGETS.map((target) => snapshot(client, target))), plan.after) ||
      !isDeepStrictEqual(await protectedHashes(client), plan.protectedHashes)) throw new Error("Conversion postconditions failed");
    await client.query("COMMIT");
    return "applied";
  } catch (error) {
    return rollbackAndRethrow(client, error);
  }
}
