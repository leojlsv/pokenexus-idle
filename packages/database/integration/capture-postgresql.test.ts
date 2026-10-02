import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  commitCaptureAttempt,
  createOrLoadPlayerByAccountId,
  generateUuidV7,
  grantInventoryEntries,
  loadInventory,
  loadPokemonVitality,
  type CaptureAttemptIntent,
} from "../src/index";
import { runMigrations } from "../src/migrations";
import { decodeOpaqueStringDbV1 } from "../src/opaque-string-db-codec";

const testDatabaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL is required for TASK-036 PostgreSQL integration tests");
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
  await withClient(async (client) => {
    await client.query("DROP SCHEMA IF EXISTS pokenexus CASCADE");
  });
}

async function prepareSchema(): Promise<void> {
  await resetSchema();
  await runMigrations({ connectionString: testDatabaseUrl });
}

async function createPlayerWithBall(client: Client): Promise<{
  readonly playerId: string;
  readonly inventoryRowVersion: bigint;
}> {
  const accountId = generateUuidV7();
  const playerId = generateUuidV7();
  await client.query("INSERT INTO pokenexus.accounts (account_id) VALUES ($1)", [accountId]);
  await createOrLoadPlayerByAccountId(client, accountId, playerId);
  const grant = await grantInventoryEntries(client, {
    playerId,
    expectedRowVersion: 0n,
    grants: [{ itemId: "item:poke-ball", quantity: 3n }],
    now: new Date("2026-09-26T19:50:00.000Z"),
  });
  if (grant.status !== "updated") throw new Error(`failed to seed Inventory: ${grant.status}`);
  return { playerId, inventoryRowVersion: grant.rowVersion };
}

function successIntent(
  playerId: string,
): CaptureAttemptIntent & { readonly initialPokemonVitalityCurrentHp: number } {
  return {
    subjectPlayerId: playerId,
    attemptCorrelation: "capture-command:test:1",
    encounterId: "encounter:test:1",
    encounterDefinitionId: "encounter-definition:test",
    speciesId: "species:test",
    level: 10,
    selectedItemId: "item:poke-ball",
    captureRulesVersion: "pokenexus.capture.post-defeat.v1",
    captureRulesSemanticsHash: "sha256:capture-test",
    contentVersion: "content-v1",
    contentHash: "sha256:content",
    encounterGameDataVersion: "game-data:historical",
    encounterRulesVersion: "rules:historical",
    creationGameDataVersion: "game-data:creation",
    creationRulesVersion: "rules:creation",
    pendingSelectionIdentity: "pending:test",
    individualizationSnapshotIdentity: "indv1:test",
    individualizationSnapshotCommitment: "sha256:snapshot",
    individualizationRulesVersion: "encounter-individualization-v1",
    derivationAuthorityVersion: "authority-v1",
    derivationAuthorityKeyId: "key-v1:test",
    baseChanceBp: 2500,
    geneticChanceBp: 2500,
    finalChanceBp: 2500,
    captureRoll: 368,
    rng: { algorithm: "xorshift32-v1", before: 1, after: 270369 },
    success: true,
    pokemon: {
      speciesId: "species:test",
      level: 10,
      ivs: { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 },
      totalExperience: 999n,
      geneticScore: 20,
      compatibleProfiles: ["Harmony", "Might"],
      birthProfile: "Harmony",
      shiny: false,
      individualizationRulesVersion: "encounter-individualization-v1",
      derivationAuthorityVersion: "authority-v1",
      derivationAuthorityKeyId: "key-v1:test",
      originPendingSelectionIdentity: "pending:test",
      individualizationSnapshotIdentity: "indv1:test",
      individualizationSnapshotCommitment: "sha256:snapshot",
      contentVersion: "content-v1",
      contentHash: "sha256:content",
      individualizationGameDataVersion: "game-data:historical",
      selectedAbilityId: "ability:normal-1",
      moveIds: ["move:two", "move:one"],
    },
    initialPokemonVitalityCurrentHp: 73,
  };
}

afterAll(resetSchema);
beforeEach(prepareSchema);

describe("TASK-036 capture persistence", () => {
  it("atomically debits one Ball, creates the exact Pokémon/loadout, increments Research, and replays once", async () => {
    await withClient(async (client) => {
      const { playerId, inventoryRowVersion } = await createPlayerWithBall(client);
      const intent = successIntent(playerId);
      const now = new Date("2026-09-26T19:50:24.000Z");

      const first = await commitCaptureAttempt(client, {
        ...intent,
        expectedInventoryRowVersion: inventoryRowVersion,
        now,
      });
      expect(first.status).toBe("accepted");
      if (first.status !== "accepted") return;
      expect(first.replayed).toBe(false);
      expect(first.attempt.createdPokemonInstanceId).toBeTruthy();
      expect(first.attempt.pokemon).toEqual(intent.pokemon);
      expect(await loadPokemonVitality(
        client,
        playerId,
        first.attempt.createdPokemonInstanceId!,
      )).toMatchObject({ currentHp: 73, rowVersion: 0n });

      const inventory = await loadInventory(client, playerId);
      expect(inventory).toMatchObject({ rowVersion: inventoryRowVersion + 1n });
      expect(inventory?.entries).toEqual([{ itemId: "item:poke-ball", quantity: 2n }]);

      const pokemon = await client.query<{
        selected_ability_id: Buffer;
        row_version: string;
        total_experience: string;
        genetic_score: number;
        shiny: boolean;
      }>(
        `SELECT selected_ability_id, row_version::text, total_experience::text, genetic_score, shiny
         FROM pokenexus.pokemon_instances WHERE pokemon_instance_id = $1`,
        [first.attempt.createdPokemonInstanceId],
      );
      expect(decodeOpaqueStringDbV1(pokemon.rows[0]!.selected_ability_id)).toBe("ability:normal-1");
      expect(pokemon.rows[0]).toMatchObject({ row_version: "0", total_experience: "999", genetic_score: 20, shiny: false });

      const research = await client.query<{ capture_count: string }>(
        `SELECT capture_count::text FROM pokenexus.species_research_counts
         WHERE owner_player_id = $1`,
        [playerId],
      );
      expect(research.rows[0]?.capture_count).toBe("1");

      await client.query(
        `UPDATE pokenexus.pokemon_instances
         SET level = 11, total_experience = 1330, row_version = row_version + 1, updated_at = $2
         WHERE pokemon_instance_id = $1`,
        [first.attempt.createdPokemonInstanceId, new Date("2026-09-26T20:00:00.000Z")],
      );

      const replay = await commitCaptureAttempt(client, {
        ...intent,
        expectedInventoryRowVersion: inventoryRowVersion,
        now,
      });
      expect(replay).toMatchObject({ status: "accepted", replayed: true });
      if (replay.status === "accepted") {
        expect(replay.attempt.captureAttemptId).toBe(first.attempt.captureAttemptId);
        expect(replay.attempt.createdPokemonInstanceId).toBe(first.attempt.createdPokemonInstanceId);
        expect(replay.attempt.pokemon).toEqual(intent.pokemon);
      }
      expect((await loadInventory(client, playerId))?.entries).toEqual([{ itemId: "item:poke-ball", quantity: 2n }]);
      expect((await client.query<{ capture_count: string }>(
        "SELECT capture_count::text FROM pokenexus.species_research_counts WHERE owner_player_id = $1",
        [playerId],
      )).rows[0]?.capture_count).toBe("1");
    });
  });

  it("treats changed successful construction under the same correlation as a conflict with no second debit", async () => {
    await withClient(async (client) => {
      const { playerId, inventoryRowVersion } = await createPlayerWithBall(client);
      const intent = successIntent(playerId);
      const now = new Date("2026-09-26T19:50:24.000Z");
      const first = await commitCaptureAttempt(client, { ...intent, expectedInventoryRowVersion: inventoryRowVersion, now });
      expect(first.status).toBe("accepted");

      const changed = await commitCaptureAttempt(client, {
        ...intent,
        pokemon: { ...intent.pokemon!, ivs: { ...intent.pokemon!.ivs, hp: 31 } },
        expectedInventoryRowVersion: inventoryRowVersion,
        now,
      });
      expect(changed).toMatchObject({ status: "conflict" });
      expect((await loadInventory(client, playerId))?.entries).toEqual([{ itemId: "item:poke-ball", quantity: 2n }]);
    });
  });

  it("persists a failed attempt after one Ball debit without creating Pokémon or Research", async () => {
    await withClient(async (client) => {
      const { playerId, inventoryRowVersion } = await createPlayerWithBall(client);
      const successful = successIntent(playerId);
      const failed: CaptureAttemptIntent = {
        ...successful,
        attemptCorrelation: "capture-command:test:failure",
        encounterId: "encounter:test:failure",
        finalChanceBp: 1,
        captureRoll: 9999,
        success: false,
        pokemon: null,
      };
      const result = await commitCaptureAttempt(client, {
        ...failed,
        expectedInventoryRowVersion: inventoryRowVersion,
        now: new Date("2026-09-26T19:50:24.000Z"),
      });
      expect(result).toMatchObject({ status: "accepted", replayed: false });
      if (result.status === "accepted") {
        expect(result.attempt.createdPokemonInstanceId).toBeNull();
        expect(result.attempt.pokemon).toBeNull();
      }
      expect((await loadInventory(client, playerId))?.entries).toEqual([{ itemId: "item:poke-ball", quantity: 2n }]);
      expect((await client.query("SELECT 1 FROM pokenexus.pokemon_instances WHERE owner_player_id = $1", [playerId])).rowCount).toBe(0);
      expect((await client.query("SELECT 1 FROM pokenexus.species_research_counts WHERE owner_player_id = $1", [playerId])).rowCount).toBe(0);
    });
  });

  it("serializes concurrent same-correlation retries into one accept plus one replay with one Ball debit", async () => {
    const seeded = await withClient(createPlayerWithBall);
    const intent = successIntent(seeded.playerId);
    const now = new Date("2026-09-26T20:20:00.000Z");
    const run = () => withClient((client) => commitCaptureAttempt(client, {
      ...intent,
      expectedInventoryRowVersion: seeded.inventoryRowVersion,
      now,
    }));

    const results = await Promise.all([run(), run()]);
    expect(results.map((result) => result.status)).toEqual(["accepted", "accepted"]);
    const accepted = results.filter((result): result is Extract<typeof result, { status: "accepted" }> =>
      result.status === "accepted");
    expect(accepted.map(({ replayed }) => replayed).sort()).toEqual([false, true]);
    expect(accepted[0]?.attempt.captureAttemptId).toBe(accepted[1]?.attempt.captureAttemptId);
    await withClient(async (client) => {
      expect((await loadInventory(client, seeded.playerId))?.entries).toEqual([
        { itemId: "item:poke-ball", quantity: 2n },
      ]);
    });
  });

  it("serializes different correlations for one EncounterId into one accept plus encounter-consumed with one Ball debit", async () => {
    const seeded = await withClient(createPlayerWithBall);
    const base = successIntent(seeded.playerId);
    const now = new Date("2026-09-26T20:21:00.000Z");
    const run = (attemptCorrelation: string) => withClient((client) => commitCaptureAttempt(client, {
      ...base,
      attemptCorrelation,
      expectedInventoryRowVersion: seeded.inventoryRowVersion,
      now,
    }));

    const results = await Promise.all([
      run("capture-command:test:race-a"),
      run("capture-command:test:race-b"),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["accepted", "encounter_consumed"]);
    await withClient(async (client) => {
      expect((await loadInventory(client, seeded.playerId))?.entries).toEqual([
        { itemId: "item:poke-ball", quantity: 2n },
      ]);
      expect((await client.query(
        "SELECT 1 FROM pokenexus.capture_attempts WHERE subject_player_id = $1",
        [seeded.playerId],
      )).rowCount).toBe(1);
    });
  });

  it("keeps stale and insufficient Inventory attempts unaccepted with zero capture side effects", async () => {
    await withClient(async (client) => {
      const { playerId, inventoryRowVersion } = await createPlayerWithBall(client);
      const intent = successIntent(playerId);
      const now = new Date("2026-09-26T20:22:00.000Z");

      expect(await commitCaptureAttempt(client, {
        ...intent,
        expectedInventoryRowVersion: inventoryRowVersion - 1n,
        now,
      })).toMatchObject({ status: "inventory_stale", rowVersion: inventoryRowVersion });

      await client.query(
        "DELETE FROM pokenexus.inventory_entries WHERE player_id = $1",
        [playerId],
      );
      expect(await commitCaptureAttempt(client, {
        ...intent,
        attemptCorrelation: "capture-command:test:insufficient",
        encounterId: "encounter:test:insufficient",
        expectedInventoryRowVersion: inventoryRowVersion,
        now,
      })).toEqual({ status: "insufficient_ball", quantity: 0n });

      expect((await client.query(
        "SELECT 1 FROM pokenexus.capture_attempts WHERE subject_player_id = $1",
        [playerId],
      )).rowCount).toBe(0);
      expect((await client.query(
        "SELECT 1 FROM pokenexus.pokemon_instances WHERE owner_player_id = $1",
        [playerId],
      )).rowCount).toBe(0);
      expect((await client.query(
        "SELECT 1 FROM pokenexus.species_research_counts WHERE owner_player_id = $1",
        [playerId],
      )).rowCount).toBe(0);
    });
  });

  it("rolls back the Ball debit if a later successful-construction write fails", async () => {
    await withClient(async (client) => {
      const { playerId, inventoryRowVersion } = await createPlayerWithBall(client);
      const intent = successIntent(playerId);
      const invalidConstruction: CaptureAttemptIntent = {
        ...intent,
        attemptCorrelation: "capture-command:test:rollback",
        encounterId: "encounter:test:rollback",
        pokemon: {
          ...intent.pokemon!,
          compatibleProfiles: ["Harmony", "UnsupportedProfile"],
        },
      };

      await expect(commitCaptureAttempt(client, {
        ...invalidConstruction,
        expectedInventoryRowVersion: inventoryRowVersion,
        now: new Date("2026-09-26T20:23:00.000Z"),
      })).rejects.toMatchObject({ code: "23514" });

      expect((await loadInventory(client, playerId))?.entries).toEqual([
        { itemId: "item:poke-ball", quantity: 3n },
      ]);
      expect((await client.query(
        "SELECT 1 FROM pokenexus.capture_attempts WHERE subject_player_id = $1",
        [playerId],
      )).rowCount).toBe(0);
      expect((await client.query(
        "SELECT 1 FROM pokenexus.pokemon_instances WHERE owner_player_id = $1",
        [playerId],
      )).rowCount).toBe(0);
      expect((await client.query(
        "SELECT 1 FROM pokenexus.species_research_counts WHERE owner_player_id = $1",
        [playerId],
      )).rowCount).toBe(0);
    });
  });
});
