import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { commitPlayerBootstrap, createOrLoadPlayerByAccountId, encodeOpaqueStringDbV1, generateUuidV7, withPgClient, type PlayerBootstrapDbClient } from "@pokenexus/database";
import { runMigrations } from "@pokenexus/database/migrations";
import { individualizeEncounter, deriveMaxHpForRulesVersion } from "@pokenexus/game-core";
import { PLAYER_BOOTSTRAP_CONTENT_HASH_V1, PREALPHA_INITIAL_INVENTORY, PREALPHA_STARTER_LOADOUTS_V1 } from "../src/player/bootstrap";
import { publishedBootstrapFixture } from "../src/player/testing/published-bootstrap";
import { applyLocalStarterConversion, checkLocalStarterConversion, prepareLocalStarterConversion, LOCAL_STARTER_CONVERSION_TARGETS } from "../src/local-prealpha-starter-conversion";

// These tests create synthetic records only inside the disposable PostgreSQL harness.
const connectionString = process.env.POKENEXUS_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Disposable test database required");
const url = new URL(connectionString);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !/^pokenexus_test(?:_|$)/u.test(url.pathname.slice(1)) || url.search || url.hash) {
  throw new Error("Conversion tests refuse non-disposable or overridden database targets");
}
async function using<T>(operation: (client: PlayerBootstrapDbClient) => Promise<T>): Promise<T> {
  return withPgClient({ connectionString: connectionString! }, operation);
}
const encode = (value: string) => Buffer.from(encodeOpaqueStringDbV1(value));
const operationAt = "2026-10-07T17:29:00.000Z";
const [a, b] = LOCAL_STARTER_CONVERSION_TARGETS;

async function allRows(client: PlayerBootstrapDbClient): Promise<Record<string, unknown>> {
  const tables = await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='pokenexus' ORDER BY tablename");
  const rows: Record<string, unknown> = {};
  for (const { tablename } of tables.rows) {
    if (!/^[a-z_]+$/u.test(tablename)) throw new Error("Unexpected test table");
    rows[tablename] = (await client.query(`SELECT to_jsonb(t)::text AS row FROM pokenexus.${tablename} t ORDER BY 1`)).rows;
  }
  return rows;
}

beforeEach(async () => {
  await using((client) => client.query("DROP SCHEMA IF EXISTS pokenexus CASCADE"));
  await runMigrations({ connectionString: connectionString! });
  const fixture = await publishedBootstrapFixture();
  await using(async (client) => {
    for (const target of LOCAL_STARTER_CONVERSION_TARGETS) {
      await client.query("INSERT INTO pokenexus.accounts(account_id) VALUES($1)", [target.accountId]);
      await createOrLoadPlayerByAccountId(client, target.accountId, target.playerId);
      const compatibleProfiles = await fixture.profileAuthority.resolve({ ...fixture.context.pair, speciesId: target.speciesId });
      if (!compatibleProfiles) throw new Error("Missing test profiles");
      const individual = individualizeEncounter({ pendingSelectionIdentity: `player-bootstrap-starter-v1:${target.playerId}`,
        speciesId: target.speciesId as never, level: 1, compatibleProfiles, authority: fixture.individualization });
      const maxHp = deriveMaxHpForRulesVersion(fixture.context.pair.rulesVersion as never,
        fixture.context.speciesById.get(target.speciesId)!.baseStats, individual.ivs, 1, individual.birthGeneticBonuses)!;
      const ids = new Map<string, string>();
      const remapped: PlayerBootstrapDbClient = { query: (async (sql: string, values: unknown[] = []) => {
        if (sql.includes("INSERT INTO pokenexus.pokemon_instances")) ids.set(String(values[0]), target.pokemonId);
        if (sql.includes("INSERT INTO pokenexus.pokemon_teams")) ids.set(String(values[0]), target.teamId);
        return client.query(sql, values.map((value) => typeof value === "string" ? ids.get(value) ?? value : value));
      }) as PlayerBootstrapDbClient["query"] };
      await commitPlayerBootstrap(remapped, { playerId: target.playerId, rulesVersion: fixture.context.pair.rulesVersion,
        now: new Date("2026-10-07T16:05:58.000Z"), inventoryGrants: PREALPHA_INITIAL_INVENTORY,
        pokemon: { speciesId: target.speciesId, level: 1, totalExperience: 0n, ivs: individual.ivs,
          geneticScore: individual.geneticScore, compatibleProfiles: individual.compatibleProfiles,
          birthProfile: individual.birthProfile, shiny: individual.shiny,
          individualizationRulesVersion: individual.individualizationRulesVersion,
          derivationAuthorityVersion: individual.derivationAuthorityVersion, derivationAuthorityKeyId: individual.derivationAuthorityKeyId,
          originIdentity: individual.pendingSelectionIdentity, individualizationSnapshotIdentity: individual.individualizationSnapshotIdentity,
          individualizationSnapshotCommitment: individual.individualizationSnapshotCommitment,
          contentVersion: "player-bootstrap-prealpha-v1", contentHash: PLAYER_BOOTSTRAP_CONTENT_HASH_V1,
          gameDataVersion: fixture.context.pair.gameDataVersion, selectedAbilityId: null,
          moveIds: PREALPHA_STARTER_LOADOUTS_V1[target.speciesId], initialCurrentHp: maxHp },
      });
    }
    await client.query("UPDATE pokenexus.pokemon_vitalities SET current_hp=0,row_version=9 WHERE pokemon_instance_id=$1", [a.pokemonId]);
    await client.query("UPDATE pokenexus.inventory_entries SET quantity=18 WHERE player_id=$1 AND item_id=$2", [a.playerId, encode("pokenexus:item:basic-potion:v1")]);
    await client.query("UPDATE pokenexus.player_inventories SET row_version=3 WHERE player_id=$1", [a.playerId]);
    await client.query(`INSERT INTO pokenexus.hunt_pending_zone_selections(player_id,zone_id,hunt_definition_id,selection_json,updated_at)
      VALUES($1,$2,$3,$4,$5)`, [a.playerId, encode("test-zone"), encode("test-hunt"),
      JSON.stringify({ retained: "test-only-selection" }), new Date("2026-10-07T16:05:58.000Z")]);
    await client.query(`INSERT INTO pokenexus.pokecenter_heal_commands(command_id,player_id,idempotency_key,team_id,command_status,result_http_status,result_json,terminal_at)
      VALUES($1,$2,$3,$4,'terminal',200,$5,$6)`, [generateUuidV7(), b.playerId, generateUuidV7(), b.teamId,
      JSON.stringify({ retained: "test-only-historical-command" }), new Date("2026-10-07T16:05:58.000Z")]);
  });
});
afterAll(async () => { await using((client) => client.query("DROP SCHEMA IF EXISTS pokenexus CASCADE")); });

describe("Bounded A/B conversion on disposable PostgreSQL", () => {
  it("applies both once, verifies protected rows and replays without any DML", async () => {
    const { context } = await publishedBootstrapFixture();
    await using(async (client) => {
      const plan = await prepareLocalStarterConversion(client, context, operationAt);
      expect(await applyLocalStarterConversion(client, plan, context)).toBe("applied");
      await checkLocalStarterConversion(client, plan, context);
      const after = await allRows(client);
      const statements: string[] = [];
      const monitored: PlayerBootstrapDbClient = { query: (async (sql: string, values?: unknown[]) => {
        statements.push(sql); return client.query(sql, values);
      }) as PlayerBootstrapDbClient["query"] };
      expect(await applyLocalStarterConversion(monitored, plan, context)).toBe("replayed");
      expect(statements.filter((sql) => /^\s*(UPDATE|DELETE|INSERT)\b/u.test(sql))).toEqual([]);
      expect(await allRows(client)).toEqual(after);
      expect((await client.query("SELECT level,total_experience::text AS xp,row_version::text AS version FROM pokenexus.pokemon_instances ORDER BY pokemon_instance_id")).rows)
        .toEqual([{ level: 5, xp: "124", version: "1" }, { level: 5, xp: "124", version: "1" }]);
    });
  });

  it("rolls A back when a late B write fails", async () => {
    const { context } = await publishedBootstrapFixture();
    await using(async (client) => {
      const plan = await prepareLocalStarterConversion(client, context, operationAt);
      const before = await allRows(client);
      const injected: PlayerBootstrapDbClient = { query: (async (sql: string, values?: unknown[]) => {
        if (sql.startsWith("UPDATE pokenexus.pokemon_instances") && values?.[0] === b.pokemonId) throw new Error("late B test failure");
        return client.query(sql, values);
      }) as PlayerBootstrapDbClient["query"] };
      await expect(applyLocalStarterConversion(injected, plan, context)).rejects.toThrow("late B test failure");
      expect(await allRows(client)).toEqual(before);
    });
  });

  it("recovers a lost COMMIT acknowledgement using the same frozen plan and a new connection", async () => {
    const { context } = await publishedBootstrapFixture();
    const plan = await using((client) => prepareLocalStarterConversion(client, context, operationAt));
    await using(async (client) => {
      const injected: PlayerBootstrapDbClient = { query: (async (sql: string, values?: unknown[]) => {
        const result = await client.query(sql, values);
        if (sql === "COMMIT") throw new Error("test-only lost commit acknowledgement");
        return result;
      }) as PlayerBootstrapDbClient["query"] };
      await expect(applyLocalStarterConversion(injected, plan, context)).rejects.toThrow(/lost commit acknowledgement/);
    });
    await using(async (client) => {
      await checkLocalStarterConversion(client, plan, context);
      const beforeReplay = await allRows(client);
      expect(await applyLocalStarterConversion(client, plan, context)).toBe("replayed");
      expect(await allRows(client)).toEqual(beforeReplay);
    });
  });

  it("preserves transaction and rollback errors together", async () => {
    const { context } = await publishedBootstrapFixture();
    await using(async (client) => {
      const plan = await prepareLocalStarterConversion(client, context, operationAt);
      const first = new Error("transaction test failure");
      const second = new Error("rollback test failure");
      const injected: PlayerBootstrapDbClient = { query: (async (sql: string, values?: unknown[]) => {
        if (sql.startsWith("UPDATE")) throw first;
        if (sql === "ROLLBACK") throw second;
        return client.query(sql, values);
      }) as PlayerBootstrapDbClient["query"] };
      try { await expect(applyLocalStarterConversion(injected, plan, context)).rejects.toMatchObject({ errors: [first, second], cause: second }); }
      finally { await client.query("ROLLBACK"); }
    });
  });

  it.each(["root", "protected-table"])("rejects concurrent %s locks without waiting or changing rows", async (kind) => {
    const { context } = await publishedBootstrapFixture();
    await using(async (client) => {
      const plan = await prepareLocalStarterConversion(client, context, operationAt);
      const before = await allRows(client);
      await using(async (writer) => {
        await writer.query("BEGIN");
        try {
          if (kind === "root") await writer.query("SELECT player_id FROM pokenexus.player_hunt_roots WHERE player_id=$1 FOR UPDATE", [b.playerId]);
          else await writer.query("LOCK TABLE pokenexus.pokecenter_heal_commands IN ROW EXCLUSIVE MODE");
          await expect(applyLocalStarterConversion(client, plan, context)).rejects.toMatchObject({ code: "55P03" });
        } finally { await writer.query("ROLLBACK"); }
      });
      expect(await allRows(client)).toEqual(before);
    });
  });

  it.each(["pending", "terminal"])("rejects a %s PokéCenter command inserted after planning", async (status) => {
    const { context } = await publishedBootstrapFixture();
    await using(async (client) => {
      const plan = await prepareLocalStarterConversion(client, context, operationAt);
      await client.query(`INSERT INTO pokenexus.pokecenter_heal_commands(command_id,player_id,idempotency_key,team_id,command_status,result_http_status,result_json,terminal_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [generateUuidV7(), b.playerId, generateUuidV7(), b.teamId, status,
        status === "terminal" ? 200 : null, status === "terminal" ? "{}" : null, status === "terminal" ? new Date(operationAt) : null]);
      const before = await allRows(client);
      await expect(applyLocalStarterConversion(client, plan, context)).rejects.toThrow(status === "pending" ? /unfinished/ : /Protected state differs/);
      expect(await allRows(client)).toEqual(before);
    });
  });

  it("sees protected-state changes committed after row locking and before the table freeze", async () => {
    const { context } = await publishedBootstrapFixture();
    await using(async (client) => {
      const plan = await prepareLocalStarterConversion(client, context, operationAt);
      let injected = false;
      const interleaved: PlayerBootstrapDbClient = { query: (async (sql: string, values?: unknown[]) => {
        if (sql.startsWith("LOCK TABLE") && !injected) {
          injected = true;
          await using((writer) => writer.query("UPDATE pokenexus.pokecenter_heal_commands SET result_json=$1 WHERE player_id=$2",
            [JSON.stringify({ retained: "test-only-concurrent-terminal-result" }), b.playerId]));
        }
        return client.query(sql, values);
      }) as PlayerBootstrapDbClient["query"] };
      await expect(applyLocalStarterConversion(interleaved, plan, context)).rejects.toThrow(/Protected state differs/);
      expect(injected).toBe(true);
      expect((await client.query("SELECT level,total_experience::text AS xp FROM pokenexus.pokemon_instances ORDER BY pokemon_instance_id")).rows)
        .toEqual([{ level: 1, xp: "0" }, { level: 1, xp: "0" }]);
    });
  });

  it.each(["hp", "xp", "moves", "inventory", "missing-root", "identity", "partial"])("rejects %s drift without modifying either starter", async (kind) => {
    const { context } = await publishedBootstrapFixture();
    await using(async (client) => {
      const plan = await prepareLocalStarterConversion(client, context, operationAt);
      if (kind === "hp") await client.query("UPDATE pokenexus.pokemon_vitalities SET current_hp=1 WHERE pokemon_instance_id=$1", [a.pokemonId]);
      if (kind === "xp") await client.query("UPDATE pokenexus.pokemon_instances SET total_experience=1 WHERE pokemon_instance_id=$1", [a.pokemonId]);
      if (kind === "moves") await client.query("DELETE FROM pokenexus.pokemon_move_loadout WHERE pokemon_instance_id=$1 AND slot=2", [a.pokemonId]);
      if (kind === "inventory") await client.query("UPDATE pokenexus.inventory_entries SET quantity=17 WHERE player_id=$1 AND item_id=$2", [a.playerId, encode("pokenexus:item:basic-potion:v1")]);
      if (kind === "missing-root") await client.query("DELETE FROM pokenexus.player_hunt_roots WHERE player_id=$1", [a.playerId]);
      if (kind === "identity") await client.query("UPDATE pokenexus.player_bootstraps SET content_hash=$2 WHERE player_id=$1", [a.playerId, encode("sha256:wrong")]);
      if (kind === "partial") await client.query("UPDATE pokenexus.pokemon_instances SET level=5,total_experience=124,row_version=1 WHERE pokemon_instance_id=$1", [a.pokemonId]);
      const before = await allRows(client);
      await expect(applyLocalStarterConversion(client, plan, context)).rejects.toThrow();
      expect(await allRows(client)).toEqual(before);
    });
  });

  it("rejects an altered plan before SQL, and refuses replay after subsequent damage/progress", async () => {
    const { context } = await publishedBootstrapFixture();
    await using(async (client) => {
      const plan = await prepareLocalStarterConversion(client, context, operationAt);
      const altered = structuredClone(plan);
      altered.after[0]!.vitality.current_hp = 999;
      await expect(applyLocalStarterConversion(client, altered, context)).rejects.toThrow(/plan disagrees/);
      await applyLocalStarterConversion(client, plan, context);
      await client.query("UPDATE pokenexus.pokemon_vitalities SET current_hp=1,row_version=row_version+1 WHERE pokemon_instance_id=$1", [a.pokemonId]);
      await client.query("UPDATE pokenexus.pokemon_instances SET total_experience=125,row_version=row_version+1 WHERE pokemon_instance_id=$1", [a.pokemonId]);
      const before = await allRows(client);
      await expect(applyLocalStarterConversion(client, plan, context)).rejects.toThrow(/baseline differs/);
      expect(await allRows(client)).toEqual(before);
    });
  });
});
