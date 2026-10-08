import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  commitPlayerBootstrap, createOrLoadPlayerByAccountId, decodeOpaqueStringDbV1, generateUuidV7, withPgClient,
  type CommitPlayerBootstrapInput,
} from "@pokenexus/database";
import { runMigrations } from "@pokenexus/database/migrations";
import {
  allocateGeneticBudget, deriveMaxHpForRulesVersion, evaluatePokemonXpGrant,
  geneticBudgetForScore, POKEMON_PROGRESSION_RULE_ID,
} from "@pokenexus/game-core";
import { PREALPHA_STARTER_LOADOUTS } from "../src/player/bootstrap";
import { publishedBootstrapFixture, publishedBootstrapService } from "../src/player/testing/published-bootstrap";

const databaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("POKENEXUS_TEST_DATABASE_URL is required");
const target = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !/^pokenexus_test(?:_|$)/u.test(target.pathname.slice(1))) {
  throw new Error("Starter Level-5 tests require a disposable loopback test database");
}
const connectionString: string = databaseUrl;

beforeAll(async () => {
  await withPgClient({ connectionString }, (client) => client.query("DROP SCHEMA IF EXISTS pokenexus CASCADE"));
  await runMigrations({ connectionString });
});
afterAll(async () => {
  await withPgClient({ connectionString }, (client) => client.query("DROP SCHEMA IF EXISTS pokenexus CASCADE"));
});

describe("Human-approved starter Level-5 bootstrap against the real pinned catalog", () => {
  it.each(Object.entries(PREALPHA_STARTER_LOADOUTS))("creates and replays %s with coherent level, XP, HP and ordered Moves", async (speciesId, moveIds) => {
    const playerId = await withPgClient({ connectionString }, async (client) => {
      const accountId = generateUuidV7();
      await client.query("INSERT INTO pokenexus.accounts (account_id) VALUES ($1)", [accountId]);
      return (await createOrLoadPlayerByAccountId(client, accountId, generateUuidV7())).playerId;
    });
    const constructions: CommitPlayerBootstrapInput[] = [];
    const service = await publishedBootstrapService({
      commit(input) {
        constructions.push(input);
        return withPgClient({ connectionString }, (client) => commitPlayerBootstrap(client, input));
      },
    });
    const request = { playerId, starterSpeciesId: speciesId, now: new Date("2026-10-07T15:33:21Z") };
    const first = await service.bootstrap(request);
    expect(first).toMatchObject({ status: "accepted", replayed: false,
      bootstrap: { contentVersion: "player-bootstrap-prealpha-v2" } });
    const construction = constructions[0]!.pokemon;
    const { context } = await publishedBootstrapFixture();
    expect(construction.initialCurrentHp).toBe(deriveMaxHpForRulesVersion(
      context.pair.rulesVersion as never, context.speciesById.get(speciesId)!.baseStats,
      construction.ivs, 5,
      allocateGeneticBudget(geneticBudgetForScore(construction.geneticScore), construction.birthProfile),
    ));
    const snapshot = () => withPgClient({ connectionString }, async (client) => {
      const pokemon = await client.query(`SELECT p.level,p.total_experience::text AS xp,p.row_version::text AS version,
        v.current_hp,u.player_level::text AS player_level,u.player_total_experience::text AS player_xp
        FROM pokenexus.pokemon_instances p JOIN pokenexus.pokemon_vitalities v USING(pokemon_instance_id)
        JOIN pokenexus.players u ON u.player_id=p.owner_player_id WHERE p.owner_player_id=$1`, [playerId]);
      const moves = await client.query("SELECT move_id FROM pokenexus.pokemon_move_loadout WHERE owner_player_id=$1 ORDER BY slot", [playerId]);
      const inventory = await client.query("SELECT quantity::text FROM pokenexus.inventory_entries WHERE player_id=$1 ORDER BY inventory_entries.quantity DESC", [playerId]);
      const teams = await client.query("SELECT slot FROM pokenexus.pokemon_team_members WHERE owner_player_id=$1", [playerId]);
      return { pokemon: pokemon.rows, moves: moves.rows, inventory: inventory.rows, teams: teams.rows };
    });
    const before = await snapshot();
    expect(before.pokemon).toEqual([{ level: 5, xp: "124", version: "0", current_hp: construction.initialCurrentHp, player_level: "1", player_xp: "0" }]);
    expect(before.moves.map((row: { move_id: Uint8Array }) => decodeOpaqueStringDbV1(row.move_id))).toEqual(moveIds);
    expect(construction.moveIds).toEqual(moveIds);
    expect(before.inventory).toEqual([{ quantity: "50" }, { quantity: "20" }, { quantity: "5" }]);
    expect(before.teams).toEqual([{ slot: 1 }]);
    expect(await service.bootstrap(request)).toEqual({ ...first, replayed: true });
    expect(await snapshot()).toEqual(before);
    expect(evaluatePokemonXpGrant({ ruleId: POKEMON_PROGRESSION_RULE_ID,
      current: { level: 5n, totalExperience: 124n }, xpAmount: 91n,
    })).toMatchObject({ level: 6n, totalExperience: 215n });
  });
});
