import {
  createOrLoadPlayerByAccountId,
  encodeOpaqueStringDbV1,
  generateUuidV7,
  loadOwnedPokemon,
  loadOwnedPokemonProgression,
  updateOwnedPokemonProgression,
  withPgClient,
} from "@pokenexus/database";
import { runMigrations } from "@pokenexus/database/migrations";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  MoveEligibilityApplicationService,
  createPgMoveLoadoutRepository,
  type MoveLoadoutRepository,
} from "../src/moves/application";
import {
  MOVE_ELIGIBILITY_RULE_ARTIFACT_ID,
  MOVE_ELIGIBILITY_RULE_SEMANTICS_HASH,
  type MoveEligibilityContext,
} from "../src/moves/context";

const testDatabaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL is required for TASK-089 PostgreSQL integration tests");
}
const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
if (!/^pokenexus_test(?:_|$)/.test(databaseName)) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL must target pokenexus_test or pokenexus_test_*");
}

const NOW = new Date("2026-09-22T19:00:00.000Z");

async function resetSchema(): Promise<void> {
  await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
    await client.query("DROP SCHEMA IF EXISTS pokenexus CASCADE");
  });
}

async function prepareSchema(): Promise<void> {
  await resetSchema();
  await runMigrations({ connectionString: testDatabaseUrl });
}

async function createPlayer(): Promise<string> {
  return withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
    const accountId = generateUuidV7();
    const playerId = generateUuidV7();
    await client.query("INSERT INTO pokenexus.accounts (account_id) VALUES ($1)", [accountId]);
    return (await createOrLoadPlayerByAccountId(client, accountId, playerId)).playerId;
  });
}

async function createPokemon(
  ownerPlayerId: string,
  level = 10,
  speciesId = "species:test",
): Promise<string> {
  return withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
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
        Buffer.from(encodeOpaqueStringDbV1(speciesId)),
        level,
        totalExperience.toString(),
      ],
    );
    return pokemonInstanceId;
  });
}

function exactContext(): MoveEligibilityContext {
  const rows = [
    ["move:level-10", 10],
    ["move:level-7", 7],
    ["move:level-5", 5],
    ["move:level-1", 1],
    ["move:later", 20],
  ] as const;
  return {
    pair: { gameDataVersion: "game-data:test-v2", rulesVersion: "rules:test-v1" },
    rules: {
      rulesVersion: "rules:test-v1",
      moveEligibilityRuleArtifactId: MOVE_ELIGIBILITY_RULE_ARTIFACT_ID,
      moveEligibilityRuleSemanticsHash: MOVE_ELIGIBILITY_RULE_SEMANTICS_HASH,
    },
    speciesIds: new Set(["species:test"]),
    moveIds: new Set(rows.map(([moveId]) => moveId)),
    learnsetsBySpecies: new Map([[
      "species:test",
      rows.map(([moveId, level]) => ({
        speciesId: "species:test" as never,
        moveId: moveId as never,
        sourceGeneration: 8,
        sourceGame: "test",
        method: "level-up" as const,
        level,
        machineIdentifier: null,
        sourceRecordIds: ["source:test"],
      })),
    ]]),
  };
}

function contextLoader() {
  return { async loadForNewOperation() { return exactContext(); } };
}

afterAll(resetSchema);
beforeEach(prepareSchema);

describe("TASK-089 PostgreSQL Move eligibility orchestration", () => {
  it("bootstraps dense deterministic slots once and never rewrites an already-selected loadout", async () => {
    const ownerPlayerId = await createPlayer();
    const pokemonInstanceId = await createPokemon(ownerPlayerId);
    const service = new MoveEligibilityApplicationService(
      createPgMoveLoadoutRepository(testDatabaseUrl),
      contextLoader(),
    );

    await expect(service.bootstrapMoveLoadout({
      ownerPlayerId,
      pokemonInstanceId,
      now: NOW,
    })).resolves.toEqual({
      status: "updated",
      rowVersion: 1n,
      moveIds: ["move:level-10", "move:level-7", "move:level-5", "move:level-1"],
    });

    const afterFirst = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedPokemon(client, ownerPlayerId, pokemonInstanceId));
    expect(afterFirst?.moveLoadout).toEqual({
      state: "selected",
      moveIds: ["move:level-10", "move:level-7", "move:level-5", "move:level-1"],
    });
    expect(afterFirst?.rowVersion).toBe(1n);

    await expect(service.bootstrapMoveLoadout({
      ownerPlayerId,
      pokemonInstanceId,
      now: new Date("2026-09-22T19:01:00.000Z"),
    })).resolves.toEqual({
      status: "already_selected",
      rowVersion: 1n,
      moveIds: ["move:level-10", "move:level-7", "move:level-5", "move:level-1"],
    });
    const afterSecond = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedPokemon(client, ownerPlayerId, pokemonInstanceId));
    expect(afterSecond).toMatchObject({ rowVersion: 1n, moveLoadout: afterFirst?.moveLoadout });
  });

  it("treats foreign ownership as not found and performs no Move mutation", async () => {
    const ownerPlayerId = await createPlayer();
    const foreignPlayerId = await createPlayer();
    const pokemonInstanceId = await createPokemon(ownerPlayerId);
    const service = new MoveEligibilityApplicationService(
      createPgMoveLoadoutRepository(testDatabaseUrl),
      contextLoader(),
    );

    await expect(service.replaceMoveLoadout({
      ownerPlayerId: foreignPlayerId,
      pokemonInstanceId,
      expectedRowVersion: 0n,
      moveIds: ["move:level-1"],
      now: NOW,
    })).resolves.toEqual({ status: "not_found" });

    const owned = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedPokemon(client, ownerPlayerId, pokemonInstanceId));
    expect(owned).toMatchObject({
      rowVersion: 0n,
      moveLoadout: { state: "uninitialized", moveIds: [] },
    });
  });

  it("shared Pokémon OCC rejects eligibility derived before a concurrent Level change without hidden retry", async () => {
    const ownerPlayerId = await createPlayer();
    const pokemonInstanceId = await createPokemon(ownerPlayerId, 10);
    const baseRepository = createPgMoveLoadoutRepository(testDatabaseUrl);
    let progressionWon = false;
    const racingRepository: MoveLoadoutRepository = {
      loadOwnedPokemon: (owner, pokemon) => baseRepository.loadOwnedPokemon(owner, pokemon),
      async replaceOwnedPokemonMoveLoadout(input) {
        if (!progressionWon) {
          progressionWon = true;
          await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
            expect(await updateOwnedPokemonProgression(client, {
              ownerPlayerId,
              pokemonInstanceId,
              expectedRowVersion: input.expectedRowVersion,
              level: 11n,
              totalExperience: 11n ** 3n - 1n,
              now: new Date("2026-09-22T19:00:30.000Z"),
            })).toBe(true);
          });
        }
        return baseRepository.replaceOwnedPokemonMoveLoadout(input);
      },
    };
    const service = new MoveEligibilityApplicationService(racingRepository, contextLoader());

    await expect(service.replaceMoveLoadout({
      ownerPlayerId,
      pokemonInstanceId,
      expectedRowVersion: 0n,
      moveIds: ["move:level-10"],
      now: NOW,
    })).resolves.toEqual({ status: "stale", rowVersion: 1n });

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      expect(await loadOwnedPokemonProgression(client, ownerPlayerId, pokemonInstanceId)).toMatchObject({
        level: 11n,
        rowVersion: 1n,
      });
      expect(await loadOwnedPokemon(client, ownerPlayerId, pokemonInstanceId)).toMatchObject({
        rowVersion: 1n,
        moveLoadout: { state: "uninitialized", moveIds: [] },
      });
    });
  });

  it("a later Level change leaves an already-selected loadout byte-for-byte ordered and only bumps shared OCC", async () => {
    const ownerPlayerId = await createPlayer();
    const pokemonInstanceId = await createPokemon(ownerPlayerId, 10);
    const service = new MoveEligibilityApplicationService(
      createPgMoveLoadoutRepository(testDatabaseUrl),
      contextLoader(),
    );
    await service.replaceMoveLoadout({
      ownerPlayerId,
      pokemonInstanceId,
      expectedRowVersion: 0n,
      moveIds: ["move:level-5", "move:level-1"],
      now: NOW,
    });

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      expect(await updateOwnedPokemonProgression(client, {
        ownerPlayerId,
        pokemonInstanceId,
        expectedRowVersion: 1n,
        level: 11n,
        totalExperience: 11n ** 3n - 1n,
        now: new Date("2026-09-22T19:02:00.000Z"),
      })).toBe(true);
      expect(await loadOwnedPokemon(client, ownerPlayerId, pokemonInstanceId)).toMatchObject({
        level: 11,
        rowVersion: 2n,
        moveLoadout: { state: "selected", moveIds: ["move:level-5", "move:level-1"] },
      });
    });
  });
});
