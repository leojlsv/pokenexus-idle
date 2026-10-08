import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  commitPlayerBootstrap,
  createOrLoadPlayerByAccountId,
  deleteOwnedTeamWithCreateTombstone,
  generateUuidV7,
} from "../src/index";
import { runMigrations } from "../src/migrations";

const testDatabaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("POKENEXUS_TEST_DATABASE_URL is required");
const base = new URL(testDatabaseUrl);
if (base.hostname !== "127.0.0.1" || !/^\/pokenexus_test(?:_|$)/u.test(base.pathname) || base.search || base.hash) {
  throw new Error("Seed integration requires an isolated loopback pokenexus_test database");
}
const databaseName = `pokenexus_local_prealpha_seed_${randomUUID().replaceAll("-", "")}`;
const target = new URL(testDatabaseUrl);
target.pathname = `/${databaseName}`;
const connectionString = target.href;
const seedScript = resolve(process.cwd(), "scripts/local-prealpha-seed.mjs");
const runFile = promisify(execFile);
const accountA = "019a7f50-0000-7000-8000-000000000001";
const playerA = "019a7f50-0000-7000-8000-000000000101";
const playerB = "019a7f50-0000-7000-8000-000000000102";
let created = false;

function bootstrapInput(playerId: string) {
  return {
    playerId,
    pokemon: {
      speciesId: "species:starter-a",
      level: 5,
      totalExperience: 124n,
      ivs: { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 },
      selectedAbilityId: null,
      geneticScore: 50,
      compatibleProfiles: ["Harmony", "Might"] as const,
      birthProfile: "Harmony" as const,
      shiny: false,
      individualizationRulesVersion: "rules:individualization-v1",
      derivationAuthorityVersion: "authority:test-v1",
      derivationAuthorityKeyId: "key:test-v1",
      originIdentity: "origin:test-v1",
      individualizationSnapshotIdentity: "snapshot:test-v1",
      individualizationSnapshotCommitment: "commitment:test-v1",
      contentVersion: "player-bootstrap-prealpha-v2",
      contentHash: "sha256:test-bootstrap-v2",
      gameDataVersion: "game-data:test-v1",
      moveIds: ["move:a"],
      initialCurrentHp: 20,
    },
    rulesVersion: "rules:test-v1",
    inventoryGrants: [{ itemId: "item:test", quantity: 1n }],
    now: new Date("2026-10-07T19:00:00.000Z"),
  };
}

async function withClient<T>(url: string, operation: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try { return await operation(client); } finally { await client.end(); }
}

function seed(url = connectionString) {
  return runFile(process.execPath, [seedScript], {
    env: { ...process.env, POKENEXUS_LOCAL_DATABASE_URL: url },
    timeout: 10_000,
    maxBuffer: 256 * 1024,
    windowsHide: true,
  });
}

beforeAll(async () => {
  await withClient(testDatabaseUrl, (client) => client.query(`CREATE DATABASE "${databaseName}"`));
  created = true;
});
beforeEach(async () => {
  await withClient(connectionString, (client) => client.query("DROP SCHEMA IF EXISTS pokenexus CASCADE"));
  await runMigrations({ connectionString });
});
afterAll(async () => {
  if (created) {
    await withClient(testDatabaseUrl, (client) => client.query(`DROP DATABASE "${databaseName}"`));
  }
});

describe("TASK-122 local identity seed integrity", () => {
  it("seeds exact fixture Players idempotently without granting gameplay aggregates", async () => {
    const first = JSON.parse((await seed()).stdout);
    const replay = JSON.parse((await seed()).stdout);
    expect(replay).toEqual(first);
    expect(first.players.map((row: { playerId: string }) => row.playerId)).toEqual([playerA, playerB]);
    expect(first.gameplayBootstrap).toBe("not_attempted_identity_seed_only");
    expect(first.bootstrapTeamReference).toBe("historical-after-valid-creation");
    await withClient(connectionString, async (client) => {
      const result = await client.query(`SELECT
        (SELECT count(*) FROM pokenexus.players)::text AS players,
        (SELECT count(*) FROM pokenexus.player_bootstraps)::text AS bootstraps,
        (SELECT count(*) FROM pokenexus.inventory_entries)::text AS items`);
      expect(result.rows[0]).toEqual({ players: "2", bootstraps: "0", items: "0" });
    });
  });

  it("keeps bootstrap Team provenance historical while allowing the saved Team to be deleted", async () => {
    await seed();
    const input = bootstrapInput(playerA);
    const first = await withClient(connectionString, (client) => commitPlayerBootstrap(client, input));
    expect(first).toMatchObject({ status: "accepted", replayed: false });
    if (first.status !== "accepted") throw new Error("Bootstrap was not accepted");

    await expect(withClient(connectionString, (client) => deleteOwnedTeamWithCreateTombstone(client, {
      ownerPlayerId: playerA,
      teamId: first.bootstrap.teamId,
      expectedRowVersion: 0n,
      now: new Date("2026-10-07T19:01:00.000Z"),
    }))).resolves.toEqual({ status: "deleted" });

    await withClient(connectionString, async (client) => {
      const rows = await client.query(`SELECT
        (SELECT count(*) FROM pokenexus.pokemon_teams WHERE owner_player_id = $1)::text AS team_count,
        (SELECT count(*) FROM pokenexus.player_bootstraps WHERE player_id = $1)::text AS bootstrap_count,
        (SELECT team_id FROM pokenexus.player_bootstraps WHERE player_id = $1)::text AS historical_team_id`, [playerA]);
      expect(rows.rows[0]).toEqual({
        team_count: "0",
        bootstrap_count: "1",
        historical_team_id: first.bootstrap.teamId,
      });
    });

    await expect(withClient(connectionString, (client) => commitPlayerBootstrap(client, input))).resolves.toEqual({
      ...first,
      replayed: true,
    });
  });

  it("serializes bootstrap reference creation against concurrent Team deletion", async () => {
    await seed();
    const input = bootstrapInput(playerA);
    const first = await withClient(connectionString, (client) => commitPlayerBootstrap(client, input));
    if (first.status !== "accepted") throw new Error("Bootstrap was not accepted");
    const historical = await withClient(connectionString, async (client) => {
      const result = await client.query(
        `DELETE FROM pokenexus.player_bootstraps
         WHERE player_id = $1
         RETURNING starter_species_id, pokemon_instance_id, team_id, game_data_version,
                   rules_version, content_version, content_hash, accepted_at`,
        [playerA],
      );
      return result.rows[0];
    });
    if (!historical) throw new Error("Bootstrap provenance setup row was unavailable");

    const insertClient = new Client({ connectionString });
    const deleteClient = new Client({ connectionString });
    await Promise.all([insertClient.connect(), deleteClient.connect()]);
    try {
      await insertClient.query("BEGIN");
      await insertClient.query(
        `INSERT INTO pokenexus.player_bootstraps (
           player_id, starter_species_id, pokemon_instance_id, team_id,
           game_data_version, rules_version, content_version, content_hash, accepted_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          playerA,
          historical.starter_species_id,
          historical.pokemon_instance_id,
          historical.team_id,
          historical.game_data_version,
          historical.rules_version,
          historical.content_version,
          historical.content_hash,
          historical.accepted_at,
        ],
      );

      await deleteClient.query("BEGIN");
      await deleteClient.query("SET LOCAL lock_timeout = '2s'");
      await deleteClient.query(
        "DELETE FROM pokenexus.pokemon_team_members WHERE owner_player_id = $1 AND team_id = $2",
        [playerA, first.bootstrap.teamId],
      );
      const deletion = deleteClient.query(
        "DELETE FROM pokenexus.pokemon_teams WHERE owner_player_id = $1 AND team_id = $2",
        [playerA, first.bootstrap.teamId],
      );
      expect(await Promise.race([
        deletion.then(() => "deleted"),
        new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 100)),
      ])).toBe("blocked");

      await insertClient.query("COMMIT");
      expect((await deletion).rowCount).toBe(1);
      await deleteClient.query("COMMIT");
    } catch (error) {
      await Promise.allSettled([
        insertClient.query("ROLLBACK"),
        deleteClient.query("ROLLBACK"),
      ]);
      throw error;
    } finally {
      await Promise.all([insertClient.end(), deleteClient.end()]);
    }

    await withClient(connectionString, async (client) => {
      const result = await client.query(`SELECT
        (SELECT count(*) FROM pokenexus.player_bootstraps WHERE player_id = $1)::text AS bootstrap_count,
        (SELECT count(*) FROM pokenexus.pokemon_teams WHERE owner_player_id = $1)::text AS team_count`, [playerA]);
      expect(result.rows[0]).toEqual({ bootstrap_count: "1", team_count: "0" });
    });
  });

  it("still rejects a new bootstrap row whose Team reference never existed", async () => {
    await seed();
    await expect(withClient(connectionString, (client) => client.query(
      `INSERT INTO pokenexus.player_bootstraps (
         player_id, starter_species_id, pokemon_instance_id, team_id,
         game_data_version, rules_version, content_version, content_hash, accepted_at
       ) VALUES ($1, decode('aa','hex'), $2, $3, decode('bb','hex'), decode('cc','hex'), decode('dd','hex'), decode('ee','hex'), CURRENT_TIMESTAMP)`,
      [playerA, generateUuidV7(), generateUuidV7()],
    ))).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects an existing fixture account linked to another Player without replacing it", async () => {
    const other = generateUuidV7();
    await withClient(connectionString, async (client) => {
      await client.query(`INSERT INTO pokenexus.accounts
        (account_id, auth_state, security_epoch, recovery_email_canonical, recovery_email_delivery,
         recovery_email_verified_at, activated_at)
        VALUES ($1, 'active', 0, 'prealpha-a@example.invalid', 'prealpha-a@example.invalid',
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [accountA]);
      await createOrLoadPlayerByAccountId(client, accountA, other);
    });
    await expect(seed()).rejects.toMatchObject({
      code: 1, stderr: expect.stringContaining("unexpected Player"),
    });
    await withClient(connectionString, async (client) => {
      const result = await client.query("SELECT player_id FROM pokenexus.players WHERE account_id = $1", [accountA]);
      expect(result.rows).toEqual([{ player_id: other }]);
      const counts = await client.query(`SELECT
        (SELECT count(*) FROM pokenexus.players)::text AS players,
        (SELECT count(*) FROM pokenexus.player_bootstraps)::text AS bootstraps`);
      expect(counts.rows[0]).toEqual({ players: "1", bootstraps: "0" });
      const compatibility = await client.query(`SELECT
        (SELECT count(*) FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname = 'pokenexus' AND t.relname = 'player_bootstraps'
            AND c.conname = 'player_bootstraps_player_id_team_id_fkey')::text AS fk_count,
        (SELECT count(*) FROM pg_trigger g
          JOIN pg_class t ON t.oid = g.tgrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname = 'pokenexus' AND t.relname = 'player_bootstraps'
            AND g.tgname = 'local_prealpha_bootstrap_team_reference_check'
            AND NOT g.tgisinternal)::text AS trigger_count`);
      expect(compatibility.rows[0]).toEqual({ fk_count: "1", trigger_count: "0" });
    });
  });

  it("rejects a connection-string target override before connecting or seeding", async () => {
    await expect(seed(`${connectionString}?host=outside.example.invalid`)).rejects.toMatchObject({
      code: 1, stderr: expect.stringContaining("refuses"),
    });
    await withClient(connectionString, async (client) => {
      const result = await client.query("SELECT count(*)::text AS count FROM pokenexus.accounts");
      expect(result.rows[0]?.count).toBe("0");
    });
  });
});
