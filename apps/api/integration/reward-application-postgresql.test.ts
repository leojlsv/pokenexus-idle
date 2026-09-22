import {
  ITEM_QUANTITY_MAX,
  claimRewardResolution,
  createOrLoadPlayerByAccountId,
  generateUuidV7,
  grantInventoryEntries,
  loadInventory,
  loadOwnedPokemonProgression,
  loadPlayerProgression,
  loadRewardResolutionById,
  updatePlayerProgression,
  withPgClient,
} from "@pokenexus/database";
import { runMigrations } from "@pokenexus/database/migrations";
import {
  PLAYER_PROGRESSION_RULE_ID,
  POKEMON_PROGRESSION_RULE_ID,
} from "@pokenexus/game-core";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  RewardApplicationService,
  type PinnedRewardContextLoader,
} from "../src/rewards/application";

const testDatabaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL is required for Reward application PostgreSQL tests");
}
const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
if (!/^pokenexus_test(?:_|$)/.test(databaseName)) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL must target pokenexus_test or pokenexus_test_*");
}

function exactContextLoader(
  onLoad?: (rulesVersion: string | null, gameDataVersion: string | null) => void,
  lifecycle: {
    readonly pair?: "active" | "deprecated" | "unknown";
    readonly rules?: "active" | "deprecated";
    readonly gameData?: "active" | "deprecated";
  } = {},
): PinnedRewardContextLoader {
  const pairState = lifecycle.pair ?? "active";
  const rulesState = lifecycle.rules ?? "active";
  const gameDataState = lifecycle.gameData ?? "active";
  return {
    async load(envelope) {
      onLoad?.(envelope.rulesVersion, envelope.gameDataVersion);
      return {
        rulesVersion: envelope.rulesVersion,
        gameDataVersion: envelope.gameDataVersion,
        staticContextPairCompatibility:
          pairState !== "unknown" && envelope.rulesVersion !== null && envelope.gameDataVersion !== null
            ? { rulesVersion: envelope.rulesVersion, gameDataVersion: envelope.gameDataVersion }
            : null,
        staticContextPairNewOperationsAllowed:
          pairState !== "unknown" && envelope.rulesVersion !== null && envelope.gameDataVersion !== null
            ? pairState === "active"
            : null,
        rulesVersionNewOperationsAllowed: envelope.effects.some(
          ({ kind }) => kind === "pokemon_xp" || kind === "player_xp",
        ) ? rulesState === "active" : null,
        gameDataVersionNewOperationsAllowed: envelope.effects.some(({ kind }) => kind === "item_grant")
          ? gameDataState === "active"
          : null,
        progressionRules: {
          rulesVersion: envelope.rulesVersion ?? "",
          pokemonProgressionRuleId: envelope.effects.some(({ kind }) => kind === "pokemon_xp")
            ? POKEMON_PROGRESSION_RULE_ID
            : null,
          playerProgressionRuleId: envelope.effects.some(({ kind }) => kind === "player_xp")
            ? PLAYER_PROGRESSION_RULE_ID
            : null,
        },
        itemIds: new Set(
          envelope.effects.flatMap((effect) => effect.kind === "item_grant" ? [effect.itemId] : []),
        ),
      };
    },
  };
}

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

async function createPokemon(ownerPlayerId: string, level: number): Promise<string> {
  return withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
    const pokemonInstanceId = generateUuidV7();
    const totalExperience = BigInt(level) ** 3n - 1n;
    await client.query(
      `INSERT INTO pokenexus.pokemon_instances (
         pokemon_instance_id, owner_player_id, species_id, level, total_experience,
         iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe
       ) VALUES ($1, $2, $3, $4, $5::bigint, 1, 2, 3, 4, 5, 6)`,
      [pokemonInstanceId, ownerPlayerId, Buffer.from("0073007000650063006900650073003a0074006500730074", "hex"), level, totalExperience.toString()],
    );
    return pokemonInstanceId;
  });
}

async function completionCount(resolutionId: string): Promise<number> {
  return withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
    const result = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM pokenexus.reward_completions WHERE resolution_id = $1",
      [resolutionId],
    );
    return Number(result.rows[0]?.count ?? "0");
  });
}

afterAll(resetSchema);
beforeEach(prepareSchema);

describe("TASK-024 Reward application orchestration", () => {
  it("commits multi-aggregate siblings once and replays the same Completion after response loss", async () => {
    const playerId = await createPlayer();
    const pokemonA = await createPokemon(playerId, 50);
    const pokemonB = await createPokemon(playerId, 199);
    const observedContexts: Array<[string | null, string | null]> = [];
    const claimService = new RewardApplicationService(
      testDatabaseUrl,
      exactContextLoader((rulesVersion, gameDataVersion) => observedContexts.push([rulesVersion, gameDataVersion])),
    );

    const claim = await claimService.claimResolution({
      subjectPlayerId: playerId,
      sourceAuthority: "hunt:test",
      sourceCorrelation: "outcome:atomic-1",
      rulesVersion: "rules:retained-v1",
      gameDataVersion: "game-data:retained-v1",
      effects: [
        { kind: "item_grant", itemId: "potion", quantity: 3n },
        { kind: "pokemon_xp", pokemonInstanceId: pokemonB, amount: 20_000_000_000_000_000_000n },
        { kind: "player_xp", playerId, amount: 9_223_372_036_854_775_808n },
        { kind: "pokemon_xp", pokemonInstanceId: pokemonA, amount: 10n },
        { kind: "item_grant", itemId: "poke-ball", quantity: 2n },
      ],
    });
    expect(claim.status).toBe("created");
    expect(claim.resolution.completion).toBeNull();
    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      expect(await loadPlayerProgression(client, playerId)).toMatchObject({ totalExperience: 0n, rowVersion: 0n });
      expect(await loadInventory(client, playerId)).toMatchObject({ rowVersion: 0n, entries: [] });
    });

    const service = new RewardApplicationService(
      testDatabaseUrl,
      exactContextLoader((rulesVersion, gameDataVersion) => observedContexts.push([rulesVersion, gameDataVersion])),
    );
    const results = await Promise.all([
      service.applyResolution(claim.resolution.resolutionId),
      service.applyResolution(claim.resolution.resolutionId),
    ]);
    expect(results.every(({ status }) => status === "completed")).toBe(true);
    const completions = results.filter((result) => result.status === "completed");
    expect(new Set(completions.map(({ completionId }) => completionId)).size).toBe(1);
    expect(completions.filter(({ replayed }) => !replayed)).toHaveLength(1);
    expect(await completionCount(claim.resolution.resolutionId)).toBe(1);

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const player = await loadPlayerProgression(client, playerId);
      expect(player?.totalExperience).toBe(9_223_372_036_854_775_808n);
      expect(player?.rowVersion).toBe(1n);
      const firstPokemon = await loadOwnedPokemonProgression(client, playerId, pokemonA);
      expect(firstPokemon?.totalExperience).toBe(125_009n);
      expect(firstPokemon?.rowVersion).toBe(1n);
      const cappedPokemon = await loadOwnedPokemonProgression(client, playerId, pokemonB);
      expect(cappedPokemon).toMatchObject({ level: 200n, totalExperience: 7_999_999n, rowVersion: 1n });
      const inventory = await loadInventory(client, playerId);
      expect(inventory?.rowVersion).toBe(1n);
      expect(inventory?.entries).toEqual(expect.arrayContaining([
        { itemId: "potion", quantity: 3n },
        { itemId: "poke-ball", quantity: 2n },
      ]));
      const durable = await loadRewardResolutionById(client, claim.resolution.resolutionId);
      expect(durable?.effects).toContainEqual({
        kind: "pokemon_xp",
        pokemonInstanceId: pokemonB,
        amount: 20_000_000_000_000_000_000n,
      });
    });

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const inventory = await loadInventory(client, playerId);
      if (!inventory) throw new Error("expected Inventory");
      await grantInventoryEntries(client, {
        playerId,
        expectedRowVersion: inventory.rowVersion,
        grants: [{ itemId: "unrelated", quantity: 1n }],
        now: new Date("2026-09-22T13:00:00Z"),
      });
    });
    const replay = await service.applyResolution(claim.resolution.resolutionId);
    expect(replay).toMatchObject({ status: "completed", replayed: true });
    const historicalReplay = await new RewardApplicationService(
      testDatabaseUrl,
      { async load() { throw new Error("completed historical replay must not reload context"); } },
    ).applyResolution(claim.resolution.resolutionId);
    expect(historicalReplay).toMatchObject({
      status: "completed",
      completionId: replay.status === "completed" ? replay.completionId : undefined,
      replayed: true,
    });
    const afterReplay = await withPgClient({ connectionString: testDatabaseUrl }, (client) => loadInventory(client, playerId));
    expect(afterReplay?.entries.find(({ itemId }) => itemId === "potion")?.quantity).toBe(3n);
    expect(afterReplay?.rowVersion).toBe(2n);
    expect(observedContexts.every(([rulesVersion, gameDataVersion]) =>
      rulesVersion === "rules:retained-v1" && gameDataVersion === "game-data:retained-v1")).toBe(true);
  });

  it("reloads fresh target state for the same frozen grant after unrelated progression advances", async () => {
    const playerId = await createPlayer();
    const claimService = new RewardApplicationService(testDatabaseUrl, exactContextLoader());
    const claim = await claimService.claimResolution({
      subjectPlayerId: playerId,
      sourceAuthority: "hunt:test",
      sourceCorrelation: "outcome:fresh-state",
      rulesVersion: "rules:retained-v1",
      gameDataVersion: null,
      effects: [{ kind: "player_xp", playerId, amount: 100n }],
    });
    expect(claim.resolution.completion).toBeNull();

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      expect(await updatePlayerProgression(client, {
        playerId,
        expectedRowVersion: 0n,
        level: 2n,
        totalExperience: 100n,
        now: new Date("2026-09-22T13:30:00Z"),
      })).toBe(true);
    });

    const retryService = new RewardApplicationService(testDatabaseUrl, exactContextLoader());
    expect(await retryService.applyResolution(claim.resolution.resolutionId)).toMatchObject({
      status: "completed",
      replayed: false,
    });
    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      expect(await loadPlayerProgression(client, playerId)).toMatchObject({
        level: 2n,
        totalExperience: 200n,
        rowVersion: 2n,
      });
    });
  });

  it("rolls back every sibling and Completion when one Item grant overflows", async () => {
    const playerId = await createPlayer();
    const pokemon = await createPokemon(playerId, 50);
    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      await grantInventoryEntries(client, {
        playerId,
        expectedRowVersion: 0n,
        grants: [{ itemId: "potion", quantity: ITEM_QUANTITY_MAX }],
        now: new Date("2026-09-22T13:00:00Z"),
      });
    });
    const service = new RewardApplicationService(testDatabaseUrl, exactContextLoader());
    const claim = await service.claimResolution({
      subjectPlayerId: playerId,
      sourceAuthority: "hunt:test",
      sourceCorrelation: "outcome:overflow",
      rulesVersion: "rules:retained-v1",
      gameDataVersion: "game-data:retained-v1",
      effects: [
        { kind: "player_xp", playerId, amount: 100n },
        { kind: "pokemon_xp", pokemonInstanceId: pokemon, amount: 100n },
        { kind: "item_grant", itemId: "potion", quantity: 1n },
      ],
    });
    await expect(service.applyResolution(claim.resolution.resolutionId)).rejects.toThrow(/overflow/);
    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      expect(await loadPlayerProgression(client, playerId)).toMatchObject({ totalExperience: 0n, rowVersion: 0n });
      expect(await loadOwnedPokemonProgression(client, playerId, pokemon)).toMatchObject({
        totalExperience: 124_999n,
        rowVersion: 0n,
      });
      expect(await loadInventory(client, playerId)).toMatchObject({ rowVersion: 1n });
      expect((await loadRewardResolutionById(client, claim.resolution.resolutionId))?.completion).toBeNull();
    });
  });

  it("rejects a deprecated exact pair for a brand-new mixed claim but applies its durable unresolved history", async () => {
    const playerId = await createPlayer();
    const deprecatedPairService = new RewardApplicationService(
      testDatabaseUrl,
      exactContextLoader(undefined, { pair: "deprecated" }),
    );
    const envelope = {
      subjectPlayerId: playerId,
      sourceAuthority: "hunt:test",
      sourceCorrelation: "outcome:deprecated-static-pair",
      rulesVersion: "rules:retained-v1",
      gameDataVersion: "game-data:retained-v1",
      effects: [
        { kind: "player_xp" as const, playerId, amount: 100n },
        { kind: "item_grant" as const, itemId: "potion", quantity: 1n },
      ],
    };

    await expect(deprecatedPairService.claimResolution(envelope)).rejects.toThrow(/deprecated for new authoritative operations/);
    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const resolutions = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM pokenexus.reward_resolutions
         WHERE subject_player_id = $1`,
        [playerId],
      );
      expect(resolutions.rows[0]?.count).toBe("0");
      expect(await loadPlayerProgression(client, playerId)).toMatchObject({
        totalExperience: 0n,
        rowVersion: 0n,
      });
      expect(await loadInventory(client, playerId)).toMatchObject({ rowVersion: 0n, entries: [] });
    });

    const durable = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      claimRewardResolution(client, envelope));
    expect(durable.resolution.completion).toBeNull();

    const replayedClaim = await new RewardApplicationService(testDatabaseUrl, {
      async load() { throw new Error("exact durable claim replay must not reload context"); },
    }).claimResolution(envelope);
    expect(replayedClaim).toMatchObject({
      status: "existing",
      resolution: { resolutionId: durable.resolution.resolutionId },
    });

    expect(await deprecatedPairService.applyResolution(durable.resolution.resolutionId)).toMatchObject({
      status: "completed",
      replayed: false,
    });
    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      expect(await loadPlayerProgression(client, playerId)).toMatchObject({
        totalExperience: 100n,
        rowVersion: 1n,
      });
      expect(await loadInventory(client, playerId)).toMatchObject({
        rowVersion: 1n,
        entries: [{ itemId: "potion", quantity: 1n }],
      });
      expect((await loadRewardResolutionById(client, durable.resolution.resolutionId))?.completion).not.toBeNull();
    });
  });

  it("fails closed for an unknown historical mixed pair with zero mutation or Completion", async () => {
    const playerId = await createPlayer();
    const envelope = {
      subjectPlayerId: playerId,
      sourceAuthority: "hunt:test",
      sourceCorrelation: "outcome:unknown-historical-pair",
      rulesVersion: "rules:unknown-v1",
      gameDataVersion: "game-data:unknown-v1",
      effects: [
        { kind: "player_xp" as const, playerId, amount: 100n },
        { kind: "item_grant" as const, itemId: "potion", quantity: 1n },
      ],
    };
    const durable = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      claimRewardResolution(client, envelope));

    const unknownPairService = new RewardApplicationService(
      testDatabaseUrl,
      exactContextLoader(undefined, { pair: "unknown" }),
    );
    await expect(
      unknownPairService.applyResolution(durable.resolution.resolutionId),
    ).rejects.toThrow(/exactly resolvable static-context pair/);

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      expect(await loadPlayerProgression(client, playerId)).toMatchObject({
        totalExperience: 0n,
        rowVersion: 0n,
      });
      expect(await loadInventory(client, playerId)).toMatchObject({ rowVersion: 0n, entries: [] });
      expect((await loadRewardResolutionById(client, durable.resolution.resolutionId))?.completion).toBeNull();
    });
  });

  it("separates new-use policy from retained historical resolution for single-axis rules and game data", async () => {
    const rulesPlayerId = await createPlayer();
    const rulesEnvelope = {
      subjectPlayerId: rulesPlayerId,
      sourceAuthority: "hunt:test",
      sourceCorrelation: "outcome:deprecated-rules-only",
      rulesVersion: "rules:retained-v1",
      gameDataVersion: null,
      effects: [{ kind: "player_xp" as const, playerId: rulesPlayerId, amount: 100n }],
    };
    const deprecatedRulesService = new RewardApplicationService(
      testDatabaseUrl,
      exactContextLoader(undefined, { rules: "deprecated" }),
    );
    await expect(deprecatedRulesService.claimResolution(rulesEnvelope)).rejects.toThrow(
      /rulesVersion is deprecated for new authoritative operations/,
    );
    const durableRules = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      claimRewardResolution(client, rulesEnvelope));
    expect(await deprecatedRulesService.applyResolution(durableRules.resolution.resolutionId)).toMatchObject({
      status: "completed",
      replayed: false,
    });
    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      expect(await loadPlayerProgression(client, rulesPlayerId)).toMatchObject({
        totalExperience: 100n,
        rowVersion: 1n,
      });
    });

    const itemPlayerId = await createPlayer();
    const itemEnvelope = {
      subjectPlayerId: itemPlayerId,
      sourceAuthority: "hunt:test",
      sourceCorrelation: "outcome:deprecated-game-data-only",
      rulesVersion: null,
      gameDataVersion: "game-data:retained-v1",
      effects: [{ kind: "item_grant" as const, itemId: "potion", quantity: 1n }],
    };
    const deprecatedGameDataService = new RewardApplicationService(
      testDatabaseUrl,
      exactContextLoader(undefined, { gameData: "deprecated" }),
    );
    await expect(deprecatedGameDataService.claimResolution(itemEnvelope)).rejects.toThrow(
      /gameDataVersion is deprecated for new authoritative operations/,
    );
    const durableItem = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      claimRewardResolution(client, itemEnvelope));
    expect(await deprecatedGameDataService.applyResolution(durableItem.resolution.resolutionId)).toMatchObject({
      status: "completed",
      replayed: false,
    });
    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      expect(await loadInventory(client, itemPlayerId)).toMatchObject({
        rowVersion: 1n,
        entries: [{ itemId: "potion", quantity: 1n }],
      });
    });
  });

  it("completes valid zero-applied XP without synthetic aggregate versions", async () => {
    const playerId = await createPlayer();
    const pokemon = await createPokemon(playerId, 200);
    const service = new RewardApplicationService(testDatabaseUrl, exactContextLoader());
    const claim = await service.claimResolution({
      subjectPlayerId: playerId,
      sourceAuthority: "hunt:test",
      sourceCorrelation: "outcome:zero",
      rulesVersion: "rules:retained-v1",
      gameDataVersion: null,
      effects: [
        { kind: "player_xp", playerId, amount: 0n },
        { kind: "pokemon_xp", pokemonInstanceId: pokemon, amount: 999_999_999n },
      ],
    });
    expect(await service.applyResolution(claim.resolution.resolutionId)).toMatchObject({
      status: "completed",
      replayed: false,
    });
    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      expect(await loadPlayerProgression(client, playerId)).toMatchObject({ rowVersion: 0n, totalExperience: 0n });
      expect(await loadOwnedPokemonProgression(client, playerId, pokemon)).toMatchObject({
        rowVersion: 0n,
        totalExperience: 7_999_999n,
      });
    });
  });

  it("uses fresh target state after Resolution and fails closed when Pokémon ownership changed", async () => {
    const playerId = await createPlayer();
    const otherPlayerId = await createPlayer();
    const pokemon = await createPokemon(playerId, 50);
    const service = new RewardApplicationService(testDatabaseUrl, exactContextLoader());
    const claim = await service.claimResolution({
      subjectPlayerId: playerId,
      sourceAuthority: "hunt:test",
      sourceCorrelation: "outcome:ownership-changed",
      rulesVersion: "rules:retained-v1",
      gameDataVersion: null,
      effects: [{ kind: "pokemon_xp", pokemonInstanceId: pokemon, amount: 100n }],
    });
    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      await client.query(
        "UPDATE pokenexus.pokemon_instances SET owner_player_id = $2, row_version = row_version + 1 WHERE pokemon_instance_id = $1",
        [pokemon, otherPlayerId],
      );
    });
    await expect(service.applyResolution(claim.resolution.resolutionId)).rejects.toThrow(/not owned/);
    expect(await completionCount(claim.resolution.resolutionId)).toBe(0);
    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      expect(await loadOwnedPokemonProgression(client, otherPlayerId, pokemon)).toMatchObject({
        totalExperience: 124_999n,
        rowVersion: 1n,
      });
    });
  });

  it("fails missing or incompatible pinned context before reward mutation or Completion", async () => {
    const playerId = await createPlayer();
    const envelope = {
      subjectPlayerId: playerId,
      sourceAuthority: "hunt:test",
      sourceCorrelation: "outcome:missing-context",
      rulesVersion: "rules:retained-v1",
      gameDataVersion: null,
      effects: [{ kind: "player_xp" as const, playerId, amount: 100n }],
    };
    const created = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      claimRewardResolution(client, envelope));

    const missing = new RewardApplicationService(testDatabaseUrl, {
      async load() { throw new Error("historical rules missing"); },
    });
    await expect(missing.applyResolution(created.resolution.resolutionId)).rejects.toThrow("historical rules missing");

    const incompatible = new RewardApplicationService(testDatabaseUrl, {
      async load(resolution) {
        return {
          rulesVersion: resolution.rulesVersion,
          gameDataVersion: resolution.gameDataVersion,
          staticContextPairCompatibility: null,
          staticContextPairNewOperationsAllowed: null,
          rulesVersionNewOperationsAllowed: true,
          gameDataVersionNewOperationsAllowed: null,
          progressionRules: {
            rulesVersion: resolution.rulesVersion ?? "",
            pokemonProgressionRuleId: null,
            playerProgressionRuleId: "pokenexus.player-other.v2",
          },
          itemIds: new Set<string>(),
        };
      },
    });
    await expect(incompatible.applyResolution(created.resolution.resolutionId)).rejects.toThrow(/accepted Player progression/);
    expect(await completionCount(created.resolution.resolutionId)).toBe(0);
    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      expect(await loadPlayerProgression(client, playerId)).toMatchObject({ totalExperience: 0n, rowVersion: 0n });
    });
  });
});
