import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ITEM_QUANTITY_MAX,
  RewardResolutionConflictError,
  claimRewardResolution,
  createOrLoadPlayerByAccountId,
  generateUuidV7,
  grantInventoryEntries,
  loadInventory,
  loadOwnedPokemonProgression,
  loadPlayerProgression,
  loadRewardResolutionById,
  removeInventoryEntries,
  updateOwnedPokemonProgression,
  updatePlayerProgression,
} from "../src/index";
import {
  canonicalMigrationsDirectory,
  discoverMigrations,
  runMigrations,
} from "../src/migrations";
import { encodeOpaqueStringDbV1 } from "../src/opaque-string-db-codec";

const testDatabaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL is required for TASK-024 PostgreSQL integration tests");
}
const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
if (!/^pokenexus_test(?:_|$)/.test(databaseName)) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL must target pokenexus_test or pokenexus_test_*");
}

const temporaryDirectories: string[] = [];

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

async function migrationDirectoryThrough(count: number): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pokenexus-task024-migrations-"));
  temporaryDirectories.push(directory);
  const migrations = await discoverMigrations();
  for (const migration of migrations.slice(0, count)) {
    await writeFile(
      join(directory, migration.fileName),
      await readFile(join(canonicalMigrationsDirectory, migration.fileName)),
    );
  }
  return directory;
}

async function createPlayer(client: Client): Promise<string> {
  const accountId = generateUuidV7();
  const playerId = generateUuidV7();
  await client.query("INSERT INTO pokenexus.accounts (account_id) VALUES ($1)", [accountId]);
  const player = await createOrLoadPlayerByAccountId(client, accountId, playerId);
  return player.playerId;
}

async function createPokemon(
  client: Client,
  ownerPlayerId: string,
  level = 50,
): Promise<string> {
  const pokemonInstanceId = generateUuidV7();
  const totalExperience = BigInt(level) ** 3n - 1n;
  await client.query(
    `INSERT INTO pokenexus.pokemon_instances (
       pokemon_instance_id, owner_player_id, species_id, level, total_experience,
       iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe
     ) VALUES ($1, $2, $3, $4, $5::bigint, 1, 2, 3, 4, 5, 6)`,
    [
      pokemonInstanceId,
      ownerPlayerId,
      Buffer.from(encodeOpaqueStringDbV1("species:test")),
      level,
      totalExperience.toString(),
    ],
  );
  return pokemonInstanceId;
}

async function waitForLockWait(processId: number): Promise<void> {
  await withClient(async (observer) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const activity = await observer.query<{ wait_event_type: string | null }>(
        "SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1",
        [processId],
      );
      if (activity.rows[0]?.wait_event_type === "Lock") return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Concurrent ownership transfer did not enter a lock wait");
  });
}

afterAll(async () => {
  await resetSchema();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

beforeEach(prepareSchema);

describe("TASK-024 migration", () => {
  it("backfills existing Pokémon floors, Player baseline and Inventory roots", async () => {
    await resetSchema();
    const through0003 = await migrationDirectoryThrough(3);
    await runMigrations({ connectionString: testDatabaseUrl, migrationsDirectory: through0003 });

    const { playerId, pokemonId } = await withClient(async (client) => {
      const accountId = generateUuidV7();
      const playerId = generateUuidV7();
      const pokemonId = generateUuidV7();
      await client.query("INSERT INTO pokenexus.accounts (account_id) VALUES ($1)", [accountId]);
      await client.query("INSERT INTO pokenexus.players (player_id, account_id) VALUES ($1, $2)", [playerId, accountId]);
      await client.query(
        `INSERT INTO pokenexus.pokemon_instances (
           pokemon_instance_id, owner_player_id, species_id, level,
           iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe
         ) VALUES ($1, $2, $3, 50, 1, 2, 3, 4, 5, 6)`,
        [pokemonId, playerId, Buffer.from(encodeOpaqueStringDbV1("species:legacy"))],
      );
      return { playerId, pokemonId };
    });

    await runMigrations({ connectionString: testDatabaseUrl });
    await withClient(async (client) => {
      const pokemon = await client.query<{ level: number; total_experience: string }>(
        "SELECT level, total_experience::text FROM pokenexus.pokemon_instances WHERE pokemon_instance_id = $1",
        [pokemonId],
      );
      expect(pokemon.rows[0]).toEqual({ level: 50, total_experience: "124999" });
      const player = await client.query<{ player_level: string; player_total_experience: string }>(
        "SELECT player_level::text, player_total_experience::text FROM pokenexus.players WHERE player_id = $1",
        [playerId],
      );
      expect(player.rows[0]).toEqual({ player_level: "1", player_total_experience: "0" });
      const inventory = await client.query("SELECT player_id FROM pokenexus.player_inventories WHERE player_id = $1", [playerId]);
      expect(inventory.rowCount).toBe(1);
    });
  });

  it("enforces lossless progression and Reward effect shape constraints", async () => {
    await withClient(async (client) => {
      const playerId = await createPlayer(client);
      await expect(client.query(
        "UPDATE pokenexus.players SET player_level = 2, player_total_experience = 0 WHERE player_id = $1",
        [playerId],
      )).rejects.toMatchObject({ code: "23514" });
      await client.query(
        `UPDATE pokenexus.players
         SET player_level = $2::numeric, player_total_experience = $3::numeric
         WHERE player_id = $1`,
        [playerId, "1000000000000", "49999999999950000000000000"],
      );
      const exact = await client.query<{ player_level: string; player_total_experience: string }>(
        "SELECT player_level::text, player_total_experience::text FROM pokenexus.players WHERE player_id = $1",
        [playerId],
      );
      expect(exact.rows[0]).toEqual({
        player_level: "1000000000000",
        player_total_experience: "49999999999950000000000000",
      });

      const resolutionId = generateUuidV7();
      await client.query(
        `INSERT INTO pokenexus.reward_resolutions (
           resolution_id, subject_player_id, source_authority, source_correlation, rules_version
         ) VALUES ($1, $2, $3, $4, $5)`,
        [
          resolutionId,
          playerId,
          Buffer.from(encodeOpaqueStringDbV1("source:test")),
          Buffer.from(encodeOpaqueStringDbV1("correlation:test")),
          Buffer.from(encodeOpaqueStringDbV1("rules:test")),
        ],
      );
      await expect(client.query(
        `INSERT INTO pokenexus.reward_resolution_effects (
           resolution_id, subject_player_id, effect_ordinal, effect_kind, xp_amount
         ) VALUES ($1, $2, 0, 'player_xp', 1)`,
        [resolutionId, playerId],
      )).rejects.toMatchObject({ code: "23514" });
      await expect(client.query(
        `INSERT INTO pokenexus.reward_resolution_effects (
           resolution_id, subject_player_id, effect_ordinal, effect_kind, item_id
         ) VALUES ($1, $2, 1, 'item_grant', $3)`,
        [resolutionId, playerId, Buffer.from(encodeOpaqueStringDbV1("item:test"))],
      )).rejects.toMatchObject({ code: "23514" });
    });
  });
});

describe("TASK-024 Inventory persistence", () => {
  it("grants/removes atomically with one root version bump and exact bigint bounds", async () => {
    await withClient(async (client) => {
      const playerId = await createPlayer(client);
      const first = await grantInventoryEntries(client, {
        playerId,
        expectedRowVersion: 0n,
        grants: [
          { itemId: "item:a", quantity: ITEM_QUANTITY_MAX - 1n },
          { itemId: "item:b", quantity: 2n },
        ],
        now: new Date("2026-09-22T12:00:00Z"),
      });
      expect(first).toEqual({ status: "updated", rowVersion: 1n });

      const toMax = await grantInventoryEntries(client, {
        playerId,
        expectedRowVersion: 1n,
        grants: [{ itemId: "item:a", quantity: 1n }],
        now: new Date("2026-09-22T12:01:00Z"),
      });
      expect(toMax).toEqual({ status: "updated", rowVersion: 2n });

      const overflow = await grantInventoryEntries(client, {
        playerId,
        expectedRowVersion: 2n,
        grants: [
          { itemId: "item:a", quantity: 1n },
          { itemId: "item:c", quantity: 5n },
        ],
        now: new Date("2026-09-22T12:02:00Z"),
      });
      expect(overflow).toEqual({ status: "overflow", itemId: "item:a" });
      expect(await loadInventory(client, playerId)).toMatchObject({ rowVersion: 2n });
      expect((await loadInventory(client, playerId))?.entries.some(({ itemId }) => itemId === "item:c")).toBe(false);

      const insufficient = await removeInventoryEntries(client, {
        playerId,
        expectedRowVersion: 2n,
        removals: [{ itemId: "item:b", quantity: 3n }],
        now: new Date("2026-09-22T12:03:00Z"),
      });
      expect(insufficient).toEqual({ status: "insufficient", itemId: "item:b", quantity: 2n });

      const removed = await removeInventoryEntries(client, {
        playerId,
        expectedRowVersion: 2n,
        removals: [{ itemId: "item:b", quantity: 2n }],
        now: new Date("2026-09-22T12:04:00Z"),
      });
      expect(removed).toEqual({ status: "updated", rowVersion: 3n });
      const inventory = await loadInventory(client, playerId);
      expect(inventory?.entries.find(({ itemId }) => itemId === "item:b")).toBeUndefined();

      const stale = await grantInventoryEntries(client, {
        playerId,
        expectedRowVersion: 2n,
        grants: [{ itemId: "item:d", quantity: 1n }],
        now: new Date("2026-09-22T12:05:00Z"),
      });
      expect(stale).toEqual({ status: "stale", rowVersion: 3n });
    });
  });

  it("keeps stale Player, Pokémon and Inventory writes inert", async () => {
    await withClient(async (client) => {
      const playerId = await createPlayer(client);
      const pokemonInstanceId = await createPokemon(client, playerId);
      expect(await updatePlayerProgression(client, {
        playerId,
        expectedRowVersion: 1n,
        level: 2n,
        totalExperience: 100n,
        now: new Date("2026-09-22T12:10:00Z"),
      })).toBe(false);
      expect(await updateOwnedPokemonProgression(client, {
        ownerPlayerId: playerId,
        pokemonInstanceId,
        expectedRowVersion: 1n,
        level: 51n,
        totalExperience: 132_650n,
        now: new Date("2026-09-22T12:10:00Z"),
      })).toBe(false);
      expect(await grantInventoryEntries(client, {
        playerId,
        expectedRowVersion: 1n,
        grants: [{ itemId: "item:stale", quantity: 1n }],
        now: new Date("2026-09-22T12:10:00Z"),
      })).toEqual({ status: "stale", rowVersion: 0n });
      expect(await loadPlayerProgression(client, playerId)).toMatchObject({
        level: 1n,
        totalExperience: 0n,
        rowVersion: 0n,
      });
      expect(await loadOwnedPokemonProgression(client, playerId, pokemonInstanceId)).toMatchObject({
        level: 50n,
        totalExperience: 124_999n,
        rowVersion: 0n,
      });
      expect(await loadInventory(client, playerId)).toMatchObject({ rowVersion: 0n, entries: [] });
    });
  });
});

describe("TASK-024 immutable Reward Resolution", () => {
  it("rolls the whole claim back when failure is injected between parent and effects", async () => {
    await withClient(async (client) => {
      const playerId = await createPlayer(client);
      await expect(claimRewardResolution(client, {
        subjectPlayerId: playerId,
        sourceAuthority: "source:failure",
        sourceCorrelation: "outcome:1",
        rulesVersion: "rules:v1",
        gameDataVersion: null,
        effects: [{ kind: "player_xp", playerId, amount: 1n }],
      }, {
        afterParentInserted: () => { throw new Error("injected claim failure"); },
      })).rejects.toThrow("injected claim failure");
      const rows = await client.query(
        "SELECT resolution_id FROM pokenexus.reward_resolutions WHERE subject_player_id = $1",
        [playerId],
      );
      expect(rows.rowCount).toBe(0);
    });
  });

  it("converges concurrent identical claims and rejects a changed frozen envelope", async () => {
    const seeded = await withClient(async (client) => {
      const playerId = await createPlayer(client);
      const pokemonInstanceId = await createPokemon(client, playerId);
      return { playerId, pokemonInstanceId };
    });
    const envelope = {
      subjectPlayerId: seeded.playerId,
      sourceAuthority: "source:race",
      sourceCorrelation: "outcome:race-1",
      rulesVersion: "rules:v1",
      gameDataVersion: "data:v1",
      effects: [
        { kind: "pokemon_xp" as const, pokemonInstanceId: seeded.pokemonInstanceId, amount: 20_000_000_000_000_000_000n },
        { kind: "player_xp" as const, playerId: seeded.playerId, amount: 9_223_372_036_854_775_808n },
      ],
    };
    const claims = await Promise.all([
      withClient((client) => claimRewardResolution(client, envelope)),
      withClient((client) => claimRewardResolution(client, envelope)),
    ]);
    expect(new Set(claims.map(({ resolution }) => resolution.resolutionId)).size).toBe(1);
    expect(new Set(claims.map(({ status }) => status)).has("created")).toBe(true);
    expect(claims[0].resolution.effects).toEqual(claims[1].resolution.effects);
    expect(claims[0].resolution.effects).toContainEqual({
      kind: "player_xp",
      playerId: seeded.playerId,
      amount: 9_223_372_036_854_775_808n,
    });

    await expect(withClient((client) => claimRewardResolution(client, {
      ...envelope,
      effects: [
        { kind: "pokemon_xp" as const, pokemonInstanceId: seeded.pokemonInstanceId, amount: 20_000_000_000_000_000_001n },
        { kind: "player_xp" as const, playerId: seeded.playerId, amount: 9_223_372_036_854_775_808n },
      ],
    }))).rejects.toBeInstanceOf(RewardResolutionConflictError);
    await expect(withClient((client) => claimRewardResolution(client, {
      ...envelope,
      rulesVersion: "rules:v2",
    }))).rejects.toBeInstanceOf(RewardResolutionConflictError);
  });

  it("canonicalizes caller effect order using exact opaque identity bytes", async () => {
    await withClient(async (client) => {
      const playerId = await createPlayer(client);
      const first = await claimRewardResolution(client, {
        subjectPlayerId: playerId,
        sourceAuthority: "source:opaque",
        sourceCorrelation: "outcome:opaque",
        rulesVersion: null,
        gameDataVersion: "data:v1",
        effects: [
          { kind: "item_grant", itemId: "é", quantity: 1n },
          { kind: "item_grant", itemId: "e\u0301", quantity: 2n },
        ],
      });
      const replay = await claimRewardResolution(client, {
        subjectPlayerId: playerId,
        sourceAuthority: "source:opaque",
        sourceCorrelation: "outcome:opaque",
        rulesVersion: null,
        gameDataVersion: "data:v1",
        effects: [
          { kind: "item_grant", itemId: "e\u0301", quantity: 2n },
          { kind: "item_grant", itemId: "é", quantity: 1n },
        ],
      });
      expect(replay.status).toBe("existing");
      expect(replay.resolution.resolutionId).toBe(first.resolution.resolutionId);
    });
  });

  it("enforces subject ownership at resolution time without freezing later ownership", async () => {
    await withClient(async (client) => {
      const owner = await createPlayer(client);
      const other = await createPlayer(client);
      const pokemonInstanceId = await createPokemon(client, owner);
      await expect(claimRewardResolution(client, {
        subjectPlayerId: other,
        sourceAuthority: "source:ownership",
        sourceCorrelation: "outcome:other",
        rulesVersion: "rules:v1",
        gameDataVersion: null,
        effects: [{ kind: "pokemon_xp", pokemonInstanceId, amount: 1n }],
      })).rejects.toMatchObject({ code: "23503" });

      const valid = await claimRewardResolution(client, {
        subjectPlayerId: owner,
        sourceAuthority: "source:ownership",
        sourceCorrelation: "outcome:owner",
        rulesVersion: "rules:v1",
        gameDataVersion: null,
        effects: [{ kind: "pokemon_xp", pokemonInstanceId, amount: 1n }],
      });
      await client.query(
        "UPDATE pokenexus.pokemon_instances SET owner_player_id = $2 WHERE pokemon_instance_id = $1",
        [pokemonInstanceId, other],
      );
      expect((await loadRewardResolutionById(client, valid.resolution.resolutionId))?.effects).toHaveLength(1);
    });
  });

  it("serializes a durable ownership proof against concurrent Pokémon transfer", async () => {
    const seeded = await withClient(async (client) => {
      const owner = await createPlayer(client);
      const other = await createPlayer(client);
      const pokemonInstanceId = await createPokemon(client, owner);
      return { owner, other, pokemonInstanceId };
    });
    const claimClient = new Client({ connectionString: testDatabaseUrl });
    const transferClient = new Client({ connectionString: testDatabaseUrl });
    await Promise.all([claimClient.connect(), transferClient.connect()]);
    let claimCommitted = false;
    try {
      const resolutionId = generateUuidV7();
      await claimClient.query("BEGIN");
      await claimClient.query(
        `INSERT INTO pokenexus.reward_resolutions (
           resolution_id, subject_player_id, source_authority, source_correlation, rules_version
         ) VALUES ($1, $2, $3, $4, $5)`,
        [
          resolutionId,
          seeded.owner,
          Buffer.from(encodeOpaqueStringDbV1("source:ownership-race")),
          Buffer.from(encodeOpaqueStringDbV1("outcome:ownership-race")),
          Buffer.from(encodeOpaqueStringDbV1("rules:v1")),
        ],
      );
      await claimClient.query(
        `INSERT INTO pokenexus.reward_resolution_effects (
           resolution_id, subject_player_id, effect_ordinal, effect_kind,
           pokemon_instance_id, xp_amount
         ) VALUES ($1, $2, 0, 'pokemon_xp', $3, 1)`,
        [resolutionId, seeded.owner, seeded.pokemonInstanceId],
      );

      const transferPid = await transferClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      const transfer = transferClient.query(
        "UPDATE pokenexus.pokemon_instances SET owner_player_id = $2 WHERE pokemon_instance_id = $1",
        [seeded.pokemonInstanceId, seeded.other],
      );
      await waitForLockWait(transferPid.rows[0]!.pid);
      await claimClient.query("COMMIT");
      claimCommitted = true;
      await expect(transfer).resolves.toMatchObject({ rowCount: 1 });

      const durable = await loadRewardResolutionById(transferClient, resolutionId);
      expect(durable?.subjectPlayerId).toBe(seeded.owner);
      const currentOwner = await transferClient.query<{ owner_player_id: string }>(
        "SELECT owner_player_id FROM pokenexus.pokemon_instances WHERE pokemon_instance_id = $1",
        [seeded.pokemonInstanceId],
      );
      expect(currentOwner.rows[0]?.owner_player_id).toBe(seeded.other);
    } finally {
      if (!claimCommitted) await claimClient.query("ROLLBACK").catch(() => undefined);
      await Promise.all([claimClient.end(), transferClient.end()]);
    }
  });
});
