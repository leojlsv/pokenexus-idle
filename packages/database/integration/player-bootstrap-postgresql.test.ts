import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  commitPlayerBootstrap,
  createOrLoadPlayerByAccountId,
  generateUuidV7,
  type CommitPlayerBootstrapInput,
} from "../src/index";
import { runMigrations } from "../src/migrations";

const testDatabaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL is required for TASK-109 PostgreSQL integration tests");
}
const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
if (!/^pokenexus_test(?:_|$)/.test(databaseName)) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL must target pokenexus_test or pokenexus_test_*");
}

async function withClient<T>(operation: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

async function resetSchema(): Promise<void> {
  await withClient((client) => client.query("DROP SCHEMA IF EXISTS pokenexus CASCADE").then(() => undefined));
}

async function prepareSchema(): Promise<void> {
  await resetSchema();
  await runMigrations({ connectionString: testDatabaseUrl });
}

async function createPlayer(): Promise<string> {
  return withClient(async (client) => {
    const accountId = generateUuidV7();
    const playerId = generateUuidV7();
    await client.query("INSERT INTO pokenexus.accounts (account_id) VALUES ($1)", [accountId]);
    return (await createOrLoadPlayerByAccountId(client, accountId, playerId)).playerId;
  });
}

const ACCEPTED_STARTERS = [
  ["candidate:species:pokedex-bulbasaur-1:91b07648a3", ["candidate:move:growl:7d61e39e75", "candidate:move:tackle:ceab38a5be"]],
  ["candidate:species:pokedex-charmander-4:76e12e8c3b", ["candidate:move:growl:7d61e39e75", "candidate:move:scratch:5a9cb6b54e"]],
  ["candidate:species:pokedex-squirtle-7:6f5ada4df3", ["candidate:move:tackle:ceab38a5be", "candidate:move:tail-whip:24951e6804"]],
  ["candidate:species:pokedex-chikorita-152:24bd4cdb1d", ["candidate:move:growl:7d61e39e75", "candidate:move:tackle:ceab38a5be"]],
  ["candidate:species:pokedex-cyndaquil-155:f879aca845", ["candidate:move:leer:f13f8e16a9", "candidate:move:tackle:ceab38a5be"]],
  ["candidate:species:pokedex-totodile-158:f3d3f9a1f7", ["candidate:move:leer:f13f8e16a9", "candidate:move:scratch:5a9cb6b54e"]],
] as const;

function bootstrapInput(
  playerId: string,
  speciesId = "species:starter-a",
  moveIds: readonly string[] = ["move:tackle", "move:growl"],
): CommitPlayerBootstrapInput {
  return {
    playerId,
    rulesVersion: "rules:genetic-v1",
    pokemon: {
      speciesId,
      level: 1,
      ivs: { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 },
      totalExperience: 0n,
      geneticScore: 50,
      compatibleProfiles: ["Harmony", "Might"],
      birthProfile: "Harmony",
      shiny: false,
      individualizationRulesVersion: "encounter-individualization-v1",
      derivationAuthorityVersion: "authority:v1",
      derivationAuthorityKeyId: "key:v1",
      originIdentity: `player-bootstrap-starter-v1:${playerId}`,
      individualizationSnapshotIdentity: `indv1:${playerId}`,
      individualizationSnapshotCommitment: `sha256:${"a".repeat(64)}`,
      contentVersion: "player-bootstrap-prealpha-v1",
      contentHash: `sha256:${"b".repeat(64)}`,
      gameDataVersion: "game-data:test",
      selectedAbilityId: null,
      moveIds,
      initialCurrentHp: 12,
    },
    inventoryGrants: [
      { itemId: "pokenexus:item:poke-ball:v1", quantity: 50n },
      { itemId: "pokenexus:item:basic-potion:v1", quantity: 20n },
      { itemId: "pokenexus:item:revive-25:v1", quantity: 5n },
    ],
    now: new Date("2026-10-03T11:00:00.000Z"),
  };
}

beforeEach(prepareSchema);
afterAll(resetSchema);

describe("TASK-109 Player bootstrap PostgreSQL authority", () => {
  it("commits and replays the exact six accepted starter/loadout aggregates without regranting", async () => {
    for (const [speciesId, moveIds] of ACCEPTED_STARTERS) {
      const playerId = await createPlayer();
      const input = bootstrapInput(playerId, speciesId, moveIds);
      const first = await withClient((client) => commitPlayerBootstrap(client, input));
      expect(first).toMatchObject({
        status: "accepted",
        replayed: false,
        bootstrap: { starterSpeciesId: speciesId },
      });
      const replay = await withClient((client) => commitPlayerBootstrap(client, input));
      expect(replay).toEqual({ ...first, replayed: true });

      await withClient(async (client) => {
        const aggregate = await client.query<{
          pokemon_count: string;
          team_count: string;
          vitality_count: string;
          loadout_count: string;
          item_total: string;
          bootstrap_count: string;
        }>(`SELECT
          (SELECT count(*) FROM pokenexus.pokemon_instances WHERE owner_player_id = $1)::text AS pokemon_count,
          (SELECT count(*) FROM pokenexus.pokemon_teams WHERE owner_player_id = $1)::text AS team_count,
          (SELECT count(*) FROM pokenexus.pokemon_vitalities WHERE owner_player_id = $1)::text AS vitality_count,
          (SELECT count(*) FROM pokenexus.pokemon_move_loadout WHERE owner_player_id = $1)::text AS loadout_count,
          (SELECT coalesce(sum(quantity), 0) FROM pokenexus.inventory_entries WHERE player_id = $1)::text AS item_total,
          (SELECT count(*) FROM pokenexus.player_bootstraps WHERE player_id = $1)::text AS bootstrap_count`,
        [playerId]);
        expect(aggregate.rows[0]).toEqual({
          pokemon_count: "1",
          team_count: "1",
          vitality_count: "1",
          loadout_count: String(moveIds.length),
          item_total: "75",
          bootstrap_count: "1",
        });
      });
    }
  });

  it("commits starter, loadout, vitality, first Team, exact Inventory and Hunt root atomically", async () => {
    const playerId = await createPlayer();
    const first = await withClient((client) => commitPlayerBootstrap(client, bootstrapInput(playerId)));
    expect(first).toMatchObject({ status: "accepted", replayed: false });
    if (first.status !== "accepted") throw new Error("bootstrap was not accepted");

    const replay = await withClient((client) => commitPlayerBootstrap(client, bootstrapInput(playerId)));
    expect(replay).toEqual({ ...first, replayed: true });

    const conflict = await withClient((client) =>
      commitPlayerBootstrap(client, bootstrapInput(playerId, "species:starter-b")));
    expect(conflict).toMatchObject({
      status: "starter_conflict",
      bootstrap: { starterSpeciesId: "species:starter-a" },
    });

    await withClient(async (client) => {
      const counts = await client.query<{
        pokemon_count: string;
        team_count: string;
        member_count: string;
        vitality_count: string;
        loadout_count: string;
        hunt_root_count: string;
        bootstrap_count: string;
      }>(`SELECT
        (SELECT count(*) FROM pokenexus.pokemon_instances WHERE owner_player_id = $1)::text AS pokemon_count,
        (SELECT count(*) FROM pokenexus.pokemon_teams WHERE owner_player_id = $1)::text AS team_count,
        (SELECT count(*) FROM pokenexus.pokemon_team_members WHERE owner_player_id = $1)::text AS member_count,
        (SELECT count(*) FROM pokenexus.pokemon_vitalities WHERE owner_player_id = $1)::text AS vitality_count,
        (SELECT count(*) FROM pokenexus.pokemon_move_loadout WHERE owner_player_id = $1)::text AS loadout_count,
        (SELECT count(*) FROM pokenexus.player_hunt_roots WHERE player_id = $1)::text AS hunt_root_count,
        (SELECT count(*) FROM pokenexus.player_bootstraps WHERE player_id = $1)::text AS bootstrap_count`, [playerId]);
      expect(counts.rows[0]).toEqual({
        pokemon_count: "1",
        team_count: "1",
        member_count: "1",
        vitality_count: "1",
        loadout_count: "2",
        hunt_root_count: "1",
        bootstrap_count: "1",
      });

      const inventory = await client.query<{ item_id: Buffer; quantity: string }>(
        `SELECT item_id, quantity::text FROM pokenexus.inventory_entries
         WHERE player_id = $1 ORDER BY inventory_entries.quantity DESC`,
        [playerId],
      );
      expect(inventory.rows.map(({ quantity }) => quantity)).toEqual(["50", "20", "5"]);
      const vitality = await client.query<{ current_hp: number }>(
        "SELECT current_hp FROM pokenexus.pokemon_vitalities WHERE owner_player_id = $1",
        [playerId],
      );
      expect(vitality.rows[0]?.current_hp).toBe(12);
      const member = await client.query<{ slot: number; pokemon_instance_id: string }>(
        "SELECT slot, pokemon_instance_id FROM pokenexus.pokemon_team_members WHERE owner_player_id = $1",
        [playerId],
      );
      expect(member.rows[0]).toEqual({ slot: 1, pokemon_instance_id: first.bootstrap.pokemonInstanceId });
    });
  });

  it("rolls back every bootstrap aggregate if a late Inventory grant validation fails", async () => {
    const playerId = await createPlayer();
    const invalid = bootstrapInput(playerId);
    await expect(withClient((client) => commitPlayerBootstrap(client, {
      ...invalid,
      inventoryGrants: [{ itemId: "pokenexus:item:poke-ball:v1", quantity: 9_223_372_036_854_775_808n }],
    }))).rejects.toThrow();

    await withClient(async (client) => {
      for (const table of [
        "pokemon_instances",
        "pokemon_teams",
        "pokemon_vitalities",
        "inventory_entries",
        "player_hunt_roots",
        "player_bootstraps",
      ]) {
        const result = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM pokenexus.${table} WHERE ${
            table === "player_hunt_roots" || table === "player_bootstraps" || table === "inventory_entries"
              ? "player_id"
              : "owner_player_id"
          } = $1`,
          [playerId],
        );
        expect(result.rows[0]?.count, table).toBe("0");
      }
    });
  });

  it("serializes concurrent different starter choices to one winner without duplicate grants", async () => {
    const playerId = await createPlayer();
    const [left, right] = await Promise.all([
      withClient((client) => commitPlayerBootstrap(client, bootstrapInput(playerId, "species:starter-a"))),
      withClient((client) => commitPlayerBootstrap(client, bootstrapInput(playerId, "species:starter-b"))),
    ]);
    const statuses = [left.status, right.status].sort();
    expect(statuses).toEqual(["accepted", "starter_conflict"]);

    await withClient(async (client) => {
      const aggregate = await client.query<{
        bootstrap_count: string;
        pokemon_count: string;
        team_count: string;
        total_items: string;
      }>(`SELECT
        (SELECT count(*) FROM pokenexus.player_bootstraps WHERE player_id = $1)::text AS bootstrap_count,
        (SELECT count(*) FROM pokenexus.pokemon_instances WHERE owner_player_id = $1)::text AS pokemon_count,
        (SELECT count(*) FROM pokenexus.pokemon_teams WHERE owner_player_id = $1)::text AS team_count,
        (SELECT coalesce(sum(quantity), 0) FROM pokenexus.inventory_entries WHERE player_id = $1)::text AS total_items`,
      [playerId]);
      expect(aggregate.rows[0]).toEqual({
        bootstrap_count: "1",
        pokemon_count: "1",
        team_count: "1",
        total_items: "75",
      });
    });
  });
});
