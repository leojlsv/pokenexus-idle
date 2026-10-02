import {
  encodeOpaqueStringDbV1,
  claimPublicHuntCommandInTransaction,
  completePublicHuntCommandInTransaction,
  claimRewardResolution,
  closePendingManualCaptureInTransaction,
  createPokemonVitalityInTransaction,
  createPendingManualCaptureIfFreeInTransaction,
  ensureAndLockPlayerHuntRoot,
  generateUuidV7,
  insertAutoCapturePolicyInTransaction,
  loadEarliestIncompleteEncounterBoundary,
  loadHealingCommandByCommandId,
  loadHuntCheckpoint,
  loadInventory,
  loadOwnedSoloHunt,
  loadPendingZoneSelection,
  loadPokeCenterHealCommand,
  loadPokemonVitality,
  loadPublicHuntCommand,
  removeInventoryEntriesInTransaction,
  terminalizeSoloHuntInTransaction,
  withTransaction,
  withPgClient,
} from "@pokenexus/database";
import { runMigrations } from "@pokenexus/database/migrations";
import {
  advanceSoloHuntToEncounterBoundaryOrCutoff,
  decodeSoloHuntCheckpointV2,
  encodeSoloHuntCheckpointV2,
  type ResolvedCombatContext,
  type SoloHuntPendingEncounterSelection,
  type SoloHuntRuntimeInputs,
} from "@pokenexus/game-core";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  HuntAuthorityUnavailableError,
  HuntApplication,
  type HuntApplicationPorts,
  type HuntRuntimeAuthorityPort,
} from "../src/hunts/application";
import { hashNormalizedIntent } from "../src/hunts/protocol";

const testDatabaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL is required for Hunt application PostgreSQL tests");
}
const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
if (!/^pokenexus_test(?:_|$)/.test(databaseName)) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL must target pokenexus_test or pokenexus_test_*");
}

const opaque = (value: string) => Buffer.from(encodeOpaqueStringDbV1(value));

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitForAdvisoryWaiter(): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const waiting = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const result = await client.query<{ waiting: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted) AS waiting",
      );
      return result.rows[0]?.waiting ?? false;
    });
    if (waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for PostgreSQL advisory-lock waiter");
}

async function resetSchema(): Promise<void> {
  await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
    client.query("DROP SCHEMA IF EXISTS pokenexus CASCADE").then(() => undefined));
}

async function prepareSchema(): Promise<void> {
  await resetSchema();
  await runMigrations({ connectionString: testDatabaseUrl });
}

async function seedPlayerTeamAndPotion(): Promise<{
  readonly playerId: string;
  readonly pokemonInstanceId: string;
  readonly teamId: string;
}> {
  return withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
    const accountId = generateUuidV7();
    const playerId = generateUuidV7();
    const pokemonInstanceId = generateUuidV7();
    const teamId = generateUuidV7();
    await client.query("INSERT INTO pokenexus.accounts (account_id) VALUES ($1)", [accountId]);
    await client.query(
      "INSERT INTO pokenexus.players (player_id, account_id) VALUES ($1, $2)",
      [playerId, accountId],
    );
    await client.query("INSERT INTO pokenexus.player_inventories (player_id) VALUES ($1)", [playerId]);
    await client.query(
      "INSERT INTO pokenexus.inventory_entries (player_id, item_id, quantity) VALUES ($1, $2, 3)",
      [playerId, opaque("item:potion")],
    );
    await client.query(
      `INSERT INTO pokenexus.pokemon_instances (
         pokemon_instance_id, owner_player_id, species_id, level, total_experience,
         iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe,
         genetic_score, genetic_profile_a, genetic_profile_b, birth_profile, expressed_profile, shiny,
         individualization_rules_version, derivation_authority_version, derivation_authority_key_id,
         origin_pending_selection_identity, individualization_snapshot_identity,
         individualization_snapshot_commitment, individualization_content_version,
         individualization_content_hash, individualization_game_data_version
       ) VALUES (
         $1,$2,$3,10,999,1,2,3,4,5,6,
         50,'Harmony','Endurance','Harmony','Harmony',false,
         $4,$5,$6,$7,$8,$9,$10,$11,$12
       )`,
      [
        pokemonInstanceId,
        playerId,
        opaque("species:player"),
        opaque("encounter-individualization-v1"),
        opaque("authority-v1"),
        opaque("key-v1:test"),
        opaque(`pending:${pokemonInstanceId}`),
        opaque(`indv1:${pokemonInstanceId}`),
        opaque(`sha256:${pokemonInstanceId}`),
        opaque("content:test"),
        opaque("sha256:content-test"),
        opaque("game-data:test"),
      ],
    );
    await client.query(
      "INSERT INTO pokenexus.pokemon_teams (team_id, owner_player_id) VALUES ($1, $2)",
      [teamId, playerId],
    );
    await client.query(
      `INSERT INTO pokenexus.pokemon_team_members (
         team_member_id, team_id, pokemon_instance_id, owner_player_id, slot
       ) VALUES ($1,$2,$3,$4,1)`,
      [generateUuidV7(), teamId, pokemonInstanceId, playerId],
    );
    return { playerId, pokemonInstanceId, teamId };
  });
}

async function addPokemonToTeam(input: {
  readonly playerId: string;
  readonly teamId: string;
  readonly slot: number;
  readonly currentHp?: number;
}): Promise<string> {
  return withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
    const pokemonInstanceId = generateUuidV7();
    await client.query(
      `INSERT INTO pokenexus.pokemon_instances (
         pokemon_instance_id, owner_player_id, species_id, level, total_experience,
         iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe,
         genetic_score, genetic_profile_a, genetic_profile_b, birth_profile, expressed_profile, shiny,
         individualization_rules_version, derivation_authority_version, derivation_authority_key_id,
         origin_pending_selection_identity, individualization_snapshot_identity,
         individualization_snapshot_commitment, individualization_content_version,
         individualization_content_hash, individualization_game_data_version
       ) VALUES (
         $1,$2,$3,10,999,1,2,3,4,5,6,
         50,'Harmony','Endurance','Harmony','Harmony',false,
         $4,$5,$6,$7,$8,$9,$10,$11,$12
       )`,
      [
        pokemonInstanceId,
        input.playerId,
        opaque("species:player"),
        opaque("encounter-individualization-v1"),
        opaque("authority-v1"),
        opaque("key-v1:test"),
        opaque(`pending:${pokemonInstanceId}`),
        opaque(`indv1:${pokemonInstanceId}`),
        opaque(`sha256:${pokemonInstanceId}`),
        opaque("content:test"),
        opaque("sha256:content-test"),
        opaque("game-data:test"),
      ],
    );
    await client.query(
      `INSERT INTO pokenexus.pokemon_team_members (
         team_member_id, team_id, pokemon_instance_id, owner_player_id, slot
       ) VALUES ($1,$2,$3,$4,$5)`,
      [generateUuidV7(), input.teamId, pokemonInstanceId, input.playerId, input.slot],
    );
    if (input.currentHp !== undefined) {
      const created = await createPokemonVitalityInTransaction(client, {
        ownerPlayerId: input.playerId,
        pokemonInstanceId,
        currentHp: input.currentHp,
        now: new Date(),
      });
      if (created.status === "not_found") throw new Error("fixture vitality ownership failed");
    }
    return pokemonInstanceId;
  });
}

function runtimeInputs(
  playerId: string,
  pokemonInstanceIds: readonly string[],
  huntDefinitionId = "hunt:test",
): SoloHuntRuntimeInputs {
  const context = {
    gameDataVersion: "game-data:test",
    rulesVersion: "rules:test",
    combatEventSchemaVersion: "events:test",
    abilityRules: {},
    effectRules: {},
    typeChart: { normal: { normal: 1 } },
    moveRules: {
      "move:player": {
        moveId: "move:player",
        typeId: "normal",
        category: "physical",
        targetScope: "singleEnemy",
        moveCooldownMs: 2_000,
        power: 1,
        accuracy: "always",
        criticalPolicy: "never",
      },
      "move:enemy": {
        moveId: "move:enemy",
        typeId: "normal",
        category: "physical",
        targetScope: "singleEnemy",
        moveCooldownMs: 2_000,
        power: 1,
        accuracy: "always",
        criticalPolicy: "never",
      },
    },
  } as unknown as ResolvedCombatContext;
  return {
    playerId: playerId as never,
    zoneId: "zone:test" as never,
    huntDefinitionId: huntDefinitionId as never,
    contentVersion: "content:test",
    contentHash: "sha256:content-test",
    context,
    team: pokemonInstanceIds.map((pokemonInstanceId) => ({
      pokemonInstanceId: pokemonInstanceId as never,
      speciesId: "species:player" as never,
      level: 10,
      baseStats: { hp: 200, atk: 20, def: 200, spa: 20, spd: 200, spe: 100 },
      ivs: { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 },
      types: ["normal" as never],
      moveLoadout: ["move:player" as never],
    })),
    encounterOptions: [{
      encounterDefinitionId: "encounter:test" as never,
      speciesId: "species:enemy" as never,
      weight: 1,
      levelBand: { min: 5, max: 5 },
      rewardEnvelope: { pokemonXpPool: 0, playerXp: null },
    }],
    opponentTemplates: [{
      encounterDefinitionId: "encounter:test" as never,
      speciesId: "species:enemy" as never,
      level: 5,
      gameDataVersion: context.gameDataVersion,
      rulesVersion: context.rulesVersion,
      baseStats: { hp: 200, atk: 20, def: 200, spa: 20, spd: 200, spe: 50 },
      ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      types: ["normal" as never],
      moveLoadout: ["move:enemy" as never],
    }],
    interBattleGapMs: 1_000,
  } as SoloHuntRuntimeInputs;
}

function application(): {
  readonly app: HuntApplication;
  readonly runtime: () => SoloHuntRuntimeInputs;
  readonly lastPending: () => SoloHuntPendingEncounterSelection | undefined;
} {
  return applicationWithOptions();
}

function applicationWithOptions(options: {
  readonly ballAuthority?: {
    readonly version: string;
    readonly balls: readonly {
      readonly itemId: string;
      readonly powerQuarterUnits: number;
      readonly premium: boolean;
    }[];
  };
  readonly historicalAvailable?: () => boolean;
  readonly startRuntimeAvailable?: () => boolean;
  readonly beforeBuildStartRuntime?: () => Promise<void>;
  readonly beforeDeriveCurrentTeamMaxHp?: () => Promise<void>;
  readonly currentTeamMaxHp?: (pokemonInstanceId: string) => number;
  readonly beforeLoadPersistedRuntime?: () => Promise<void>;
  readonly automaticCapture?: HuntApplicationPorts["boundaryEffects"]["automaticCapture"];
  readonly reward?: HuntApplicationPorts["boundaryEffects"]["reward"];
} = {}): {
  readonly app: HuntApplication;
  readonly runtime: () => SoloHuntRuntimeInputs;
  readonly lastPending: () => SoloHuntPendingEncounterSelection | undefined;
} {
  let persisted: SoloHuntRuntimeInputs | null = null;
  let lastPending: SoloHuntPendingEncounterSelection | undefined;
  const ballAuthority = options.ballAuthority ?? { version: "balls:test", balls: [] };
  const authority: HuntRuntimeAuthorityPort = {
    async resolveStartSelector(huntDefinitionId) {
      return huntDefinitionId === "hunt:test" || huntDefinitionId === "hunt:alternate"
        ? {
            huntDefinitionId,
            zoneId: "zone:test",
            recoveryDurationMs: 1_000,
            gameDataVersion: "game-data:test",
            rulesVersion: "rules:test",
          }
        : null;
    },
    async buildStartRuntime({ playerId, selector, team, pendingEncounterSelection }) {
      if (options.startRuntimeAvailable && !options.startRuntimeAvailable()) {
        throw new HuntAuthorityUnavailableError("fixture start runtime unavailable");
      }
      await options.beforeBuildStartRuntime?.();
      if (team.pokemon.length === 0) throw new Error("fixture Team is empty");
      lastPending = pendingEncounterSelection;
      const effectiveHuntDefinitionId = pendingEncounterSelection?.huntDefinitionId
        ?? selector.huntDefinitionId;
      persisted = runtimeInputs(
        playerId,
        team.pokemon.map((pokemon) => pokemon.pokemonInstanceId),
        effectiveHuntDefinitionId,
      );
      return {
        inputs: persisted,
        persistedInputs: {
          schemaVersion: "hunt-runtime-inputs-v1",
          inputs: persisted,
          individualizationRequired: false,
        },
        maxHpByPokemonInstanceId: Object.fromEntries(
          team.pokemon.map((pokemon) => [
            pokemon.pokemonInstanceId,
            options.currentTeamMaxHp?.(pokemon.pokemonInstanceId) ?? 60,
          ]),
        ),
        selector: {
          ...selector,
          huntDefinitionId: effectiveHuntDefinitionId,
          gameDataVersion: pendingEncounterSelection?.gameDataVersion ?? selector.gameDataVersion,
          rulesVersion: pendingEncounterSelection?.rulesVersion ?? selector.rulesVersion,
        },
        individualizationAuthorityVersion: null,
        individualizationAuthorityKeyId: null,
      };
    },
    bindStartVitality(built, initialHpByPokemonInstanceId) {
      persisted = {
        ...built.inputs,
        initialHpByPokemonInstanceId,
      };
      return {
        ...built,
        inputs: persisted,
        persistedInputs: {
          schemaVersion: "hunt-runtime-inputs-v2",
          inputs: persisted,
          individualizationRequired: false,
        },
      };
    },
    async deriveCurrentTeamMaxHp(team) {
      await options.beforeDeriveCurrentTeamMaxHp?.();
      return Object.fromEntries(
        team.pokemon.map((pokemon) => [
          pokemon.pokemonInstanceId,
          options.currentTeamMaxHp?.(pokemon.pokemonInstanceId) ?? 60,
        ]),
      );
    },
    async loadPersistedRuntime() {
      await options.beforeLoadPersistedRuntime?.();
      if (!persisted) throw new Error("runtime fixture not initialized");
      return persisted;
    },
    async loadHistoricalEncounter(evidence) {
      if (options.historicalAvailable && !options.historicalAvailable()) {
        throw new Error("fixture historical authority unavailable");
      }
      return {
        ...evidence,
        catchRate: 120,
        reward: { pokemonXpPool: 0, playerXp: null, itemDrops: [] },
      };
    },
    async currentBallAuthority() {
      return ballAuthority;
    },
    async ballAuthority(version) {
      return version === ballAuthority.version ? ballAuthority : null;
    },
    async currentItemRule({ itemId }) {
      return itemId === "item:potion"
        ? { itemRuleVersion: "item-rules:test", useKind: "heal-hp", magnitude: { kind: "fixed", amount: 5 } }
        : null;
    },
    async itemRule({ itemId, itemRuleVersion }) {
      return itemId === "item:potion" && itemRuleVersion === "item-rules:test"
        ? { itemRuleVersion, useKind: "heal-hp", magnitude: { kind: "fixed", amount: 5 } }
        : null;
    },
    async validatePolicyReferences() {
      return { gameDataVersion: "game-data:test", accepted: true };
    },
  };
  const ports: HuntApplicationPorts = {
    authority,
    boundaryEffects: {
      automaticCapture: options.automaticCapture ?? (async () => {
        throw new Error("automatic capture is outside this fixture boundary");
      }),
      reward: options.reward ?? (async () => {
        throw new Error("reward is outside this fixture boundary");
      }),
    },
    manualCaptureEffects: {
      async attempt() {
        throw new Error("manual capture is outside this fixture boundary");
      },
    },
  };
  return {
    app: new HuntApplication(testDatabaseUrl!, ports),
    runtime() {
      if (!persisted) throw new Error("runtime fixture not initialized");
      return persisted;
    },
    lastPending() {
      return lastPending;
    },
  };
}

beforeEach(prepareSchema);
afterAll(resetSchema);

describe("TASK-038 HuntApplication PostgreSQL healing lifecycle", () => {
  it("TASK-108 pins damaged vitality, writes terminal HP, and PokéCenter heals during recovery without replay churn", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      createPokemonVitalityInTransaction(client, {
        ownerPlayerId: seeded.playerId,
        pokemonInstanceId: seeded.pokemonInstanceId,
        currentHp: 17,
        now: new Date(),
      }));

    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(started.httpStatus).toBe(200);
    expect(harness.runtime().initialHpByPokemonInstanceId)
      .toEqual({ [seeded.pokemonInstanceId]: 17 });
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() + interval '1 second' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.pokemon_vitalities SET current_hp = 50, row_version = row_version + 1 WHERE owner_player_id = $1 AND pokemon_instance_id = $2",
        [seeded.playerId, seeded.pokemonInstanceId],
      ).then(() => undefined));

    const retreat = await harness.app.retreat(seeded.playerId, generateUuidV7(), huntId);
    expect(retreat).toMatchObject({
      httpStatus: 200,
      body: {
        status: "terminal",
        terminalReason: "retreat",
        recoveryReadyAt: expect.any(String),
      },
    });
    const recoveryReadyAt = (retreat.body as { recoveryReadyAt: string }).recoveryReadyAt;
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPokemonVitality(client, seeded.playerId, seeded.pokemonInstanceId)))
      .toMatchObject({ currentHp: 17, rowVersion: 2n });

    const centerKey = generateUuidV7();
    const healed = await harness.app.healAtPokeCenter(
      seeded.playerId,
      centerKey,
      { teamId: seeded.teamId },
    );
    expect(healed).toMatchObject({
      httpStatus: 200,
      body: {
        teamId: seeded.teamId,
        recoveryReadyAt: expect.any(String),
        vitality: [{
          pokemonInstanceId: seeded.pokemonInstanceId,
          currentHp: 60,
          maxHp: 60,
          vitality: "conscious",
          vitalityRowVersion: "3",
        }],
      },
    });
    expect((healed.body as { recoveryReadyAt: string }).recoveryReadyAt).toBe(recoveryReadyAt);
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPokemonVitality(client, seeded.playerId, seeded.pokemonInstanceId)))
      .toMatchObject({ currentHp: 60, rowVersion: 3n });

    expect(await harness.app.healAtPokeCenter(
      seeded.playerId,
      centerKey,
      { teamId: seeded.teamId },
    )).toEqual(healed);
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPokemonVitality(client, seeded.playerId, seeded.pokemonInstanceId)))
      .toMatchObject({ currentHp: 60, rowVersion: 3n });

    const noOp = await harness.app.healAtPokeCenter(
      seeded.playerId,
      generateUuidV7(),
      { teamId: seeded.teamId },
    );
    expect(noOp.httpStatus).toBe(200);
    expect((noOp.body as { recoveryReadyAt: string }).recoveryReadyAt).toBe(recoveryReadyAt);
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPokemonVitality(client, seeded.playerId, seeded.pokemonInstanceId)))
      .toMatchObject({ currentHp: 60, rowVersion: 3n });
  });

  it("TASK-108 durably rejects PokéCenter while a Hunt is active and replay cannot bypass the rejection", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      createPokemonVitalityInTransaction(client, {
        ownerPlayerId: seeded.playerId,
        pokemonInstanceId: seeded.pokemonInstanceId,
        currentHp: 17,
        now: new Date(),
      }));

    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    const centerKey = generateUuidV7();
    expect(await harness.app.healAtPokeCenter(
      seeded.playerId,
      centerKey,
      { teamId: seeded.teamId },
    )).toEqual({ httpStatus: 409, body: { error: "hunt_active" } });
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPokemonVitality(client, seeded.playerId, seeded.pokemonInstanceId)))
      .toMatchObject({ currentHp: 17, rowVersion: 0n });

    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() + interval '1 second' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    expect((await harness.app.retreat(
      seeded.playerId,
      generateUuidV7(),
      huntId,
    )).httpStatus).toBe(200);
    expect(await harness.app.healAtPokeCenter(
      seeded.playerId,
      centerKey,
      { teamId: seeded.teamId },
    )).toEqual({ httpStatus: 409, body: { error: "hunt_active" } });
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPokemonVitality(client, seeded.playerId, seeded.pokemonInstanceId)))
      .toMatchObject({ currentHp: 17, rowVersion: 0n });

    expect((await harness.app.healAtPokeCenter(
      seeded.playerId,
      generateUuidV7(),
      { teamId: seeded.teamId },
    )).httpStatus).toBe(200);
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPokemonVitality(client, seeded.playerId, seeded.pokemonInstanceId)))
      .toMatchObject({ currentHp: 60, rowVersion: 1n });
  });

  it("TASK-108 rejects an all-KO Team at Start without reviving it", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      createPokemonVitalityInTransaction(client, {
        ownerPlayerId: seeded.playerId,
        pokemonInstanceId: seeded.pokemonInstanceId,
        currentHp: 0,
        now: new Date(),
      }));

    expect(await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    })).toEqual({ httpStatus: 422, body: { error: "hunt_not_admissible" } });
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPokemonVitality(client, seeded.playerId, seeded.pokemonInstanceId)))
      .toMatchObject({ currentHp: 0, rowVersion: 0n });
  });

  it("TASK-108 persists no_living final HP and recovery atomically", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      createPokemonVitalityInTransaction(client, {
        ownerPlayerId: seeded.playerId,
        pokemonInstanceId: seeded.pokemonInstanceId,
        currentHp: 1,
        now: new Date(),
      }));

    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(started.httpStatus).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '10 seconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    const terminal = await harness.app.checkpoint(seeded.playerId, generateUuidV7(), huntId);
    expect(terminal).toMatchObject({
      httpStatus: 200,
      body: {
        activeHunt: null,
      },
    });
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPokemonVitality(client, seeded.playerId, seeded.pokemonInstanceId)))
      .toMatchObject({ currentHp: 0, rowVersion: 1n });
    const terminalHunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    expect(terminalHunt?.terminalReason).toBe("no_living");
    expect(terminalHunt?.terminalAt).not.toBeNull();
    const root = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      ensureAndLockPlayerHuntRoot(client, seeded.playerId));
    expect(root?.activeHuntId).toBeNull();
    expect(root?.recoveryReadyAt).not.toBeNull();
  });

  it("TASK-108 starts from the first living Team member when the Leader is KO", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      createPokemonVitalityInTransaction(client, {
        ownerPlayerId: seeded.playerId,
        pokemonInstanceId: seeded.pokemonInstanceId,
        currentHp: 0,
        now: new Date(),
      }));
    const reserveId = await addPokemonToTeam({
      playerId: seeded.playerId,
      teamId: seeded.teamId,
      slot: 2,
      currentHp: 23,
    });

    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(started.httpStatus).toBe(200);
    expect(harness.runtime().initialHpByPokemonInstanceId).toEqual({
      [seeded.pokemonInstanceId]: 0,
      [reserveId]: 23,
    });

    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    const checkpoint = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!checkpoint) throw new Error("missing Hunt checkpoint fixture");
    const decoded = decodeSoloHuntCheckpointV2(checkpoint.stateBytes);
    expect(decoded.accepted).toBe(true);
    if (!decoded.accepted || !decoded.state.currentEncounter) return;
    const playerSide = decoded.state.currentEncounter.battle.sides[0];
    const activeId = playerSide?.activeCombatantIds[0];
    const active = activeId
      ? decoded.state.currentEncounter.battle.combatants[activeId]
      : undefined;
    expect(active?.cadenceParticipant).toEqual({
      kind: "pokemonInstance",
      identity: reserveId,
    });
    expect(active?.currentHp).toBe(23);
  });

  it("TASK-108 clamps persisted HP to authoritative max before Start pins it", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      createPokemonVitalityInTransaction(client, {
        ownerPlayerId: seeded.playerId,
        pokemonInstanceId: seeded.pokemonInstanceId,
        currentHp: 70,
        now: new Date(),
      }));

    expect((await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    })).httpStatus).toBe(200);
    expect(harness.runtime().initialHpByPokemonInstanceId)
      .toEqual({ [seeded.pokemonInstanceId]: 60 });
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPokemonVitality(client, seeded.playerId, seeded.pokemonInstanceId)))
      .toMatchObject({ currentHp: 60, rowVersion: 1n });
  });

  it("TASK-108 PokéCenter revives KO, replays exactly, conflicts on rebound, and keeps absent Team self-scoped", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      createPokemonVitalityInTransaction(client, {
        ownerPlayerId: seeded.playerId,
        pokemonInstanceId: seeded.pokemonInstanceId,
        currentHp: 0,
        now: new Date(),
      }));

    const key = generateUuidV7();
    const healed = await harness.app.healAtPokeCenter(seeded.playerId, key, { teamId: seeded.teamId });
    expect(healed).toMatchObject({
      httpStatus: 200,
      body: {
        teamId: seeded.teamId,
        vitality: [{
          pokemonInstanceId: seeded.pokemonInstanceId,
          currentHp: 60,
          maxHp: 60,
          vitality: "conscious",
          vitalityRowVersion: "1",
        }],
      },
    });
    expect(await harness.app.healAtPokeCenter(seeded.playerId, key, { teamId: seeded.teamId }))
      .toEqual(healed);
    expect(await harness.app.healAtPokeCenter(seeded.playerId, key, { teamId: generateUuidV7() }))
      .toEqual({ httpStatus: 409, body: { error: "correlation_conflict" } });

    const absentTeamId = generateUuidV7();
    const absentKey = generateUuidV7();
    const absent = await harness.app.healAtPokeCenter(
      seeded.playerId,
      absentKey,
      { teamId: absentTeamId },
    );
    expect(absent).toEqual({ httpStatus: 404, body: { error: "not_found" } });
    expect(await harness.app.healAtPokeCenter(
      seeded.playerId,
      absentKey,
      { teamId: absentTeamId },
    )).toEqual(absent);

    const foreign = await seedPlayerTeamAndPotion();
    const foreignResult = await harness.app.healAtPokeCenter(
      seeded.playerId,
      generateUuidV7(),
      { teamId: foreign.teamId },
    );
    expect(foreignResult).toEqual({ httpStatus: 404, body: { error: "not_found" } });
  });

  it("TASK-108 rolls back PokéCenter claim and HP mutation when max-HP authority fails", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = applicationWithOptions({
      beforeDeriveCurrentTeamMaxHp: async () => {
        throw new Error("fixture authority unavailable");
      },
    });
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      createPokemonVitalityInTransaction(client, {
        ownerPlayerId: seeded.playerId,
        pokemonInstanceId: seeded.pokemonInstanceId,
        currentHp: 17,
        now: new Date(),
      }));

    const key = generateUuidV7();
    expect(await harness.app.healAtPokeCenter(seeded.playerId, key, { teamId: seeded.teamId }))
      .toEqual({ httpStatus: 503, body: { error: "authority_unavailable" } });
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPokemonVitality(client, seeded.playerId, seeded.pokemonInstanceId)))
      .toMatchObject({ currentHp: 17, rowVersion: 0n });
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPokeCenterHealCommand(client, seeded.playerId, key))).toBeNull();
  });

  it("TASK-108 serializes Center-before-Start so Start pins the healed HP", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      createPokemonVitalityInTransaction(client, {
        ownerPlayerId: seeded.playerId,
        pokemonInstanceId: seeded.pokemonInstanceId,
        currentHp: 17,
        now: new Date(),
      }));
    const centerHasRoot = deferred();
    const releaseCenter = deferred();
    const harness = applicationWithOptions({
      beforeDeriveCurrentTeamMaxHp: async () => {
        centerHasRoot.resolve();
        await releaseCenter.promise;
      },
    });

    const center = harness.app.healAtPokeCenter(
      seeded.playerId,
      generateUuidV7(),
      { teamId: seeded.teamId },
    );
    await centerHasRoot.promise;
    const start = harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    releaseCenter.resolve();

    expect((await center).httpStatus).toBe(200);
    expect((await start).httpStatus).toBe(200);
    expect(harness.runtime().initialHpByPokemonInstanceId)
      .toEqual({ [seeded.pokemonInstanceId]: 60 });
  });

  it("TASK-108 serializes Start-before-Center so Center durably rejects the active Hunt", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      createPokemonVitalityInTransaction(client, {
        ownerPlayerId: seeded.playerId,
        pokemonInstanceId: seeded.pokemonInstanceId,
        currentHp: 17,
        now: new Date(),
      }));
    const startHasRoot = deferred();
    const releaseStart = deferred();
    const harness = applicationWithOptions({
      beforeBuildStartRuntime: async () => {
        startHasRoot.resolve();
        await releaseStart.promise;
      },
    });

    const start = harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    await startHasRoot.promise;
    const centerKey = generateUuidV7();
    const center = harness.app.healAtPokeCenter(
      seeded.playerId,
      centerKey,
      { teamId: seeded.teamId },
    );
    releaseStart.resolve();

    expect((await start).httpStatus).toBe(200);
    expect(await center).toEqual({ httpStatus: 409, body: { error: "hunt_active" } });
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPokemonVitality(client, seeded.playerId, seeded.pokemonInstanceId)))
      .toMatchObject({ currentHp: 17, rowVersion: 0n });
    expect(await harness.app.healAtPokeCenter(
      seeded.playerId,
      centerKey,
      { teamId: seeded.teamId },
    )).toEqual({ httpStatus: 409, body: { error: "hunt_active" } });
  });

  it("TASK-108 serializes terminal-before-Center so Center heals during the resulting recovery", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      createPokemonVitalityInTransaction(client, {
        ownerPlayerId: seeded.playerId,
        pokemonInstanceId: seeded.pokemonInstanceId,
        currentHp: 17,
        now: new Date(),
      }));
    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() + interval '1 second' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    await withPgClient({ connectionString: testDatabaseUrl }, async (control) => {
      await control.query(`
        CREATE FUNCTION pokenexus.test_task108_block_terminal_center() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM pg_advisory_xact_lock(108002);
          RETURN NEW;
        END;
        $$
      `);
      await control.query(`
        CREATE TRIGGER test_task108_block_terminal_center
        BEFORE UPDATE OF terminal_at ON pokenexus.solo_hunts
        FOR EACH ROW
        WHEN (OLD.terminal_at IS NULL AND NEW.terminal_at IS NOT NULL)
        EXECUTE FUNCTION pokenexus.test_task108_block_terminal_center()
      `);
      await control.query("SELECT pg_advisory_lock(108002)");
      try {
        const retreat = harness.app.retreat(seeded.playerId, generateUuidV7(), huntId);
        await waitForAdvisoryWaiter();
        const center = harness.app.healAtPokeCenter(
          seeded.playerId,
          generateUuidV7(),
          { teamId: seeded.teamId },
        );
        await control.query("SELECT pg_advisory_unlock(108002)");

        const terminal = await retreat;
        const healed = await center;
        expect(terminal).toMatchObject({
          httpStatus: 200,
          body: { status: "terminal", terminalReason: "retreat", recoveryReadyAt: expect.any(String) },
        });
        expect(healed).toMatchObject({
          httpStatus: 200,
          body: {
            recoveryReadyAt: (terminal.body as { recoveryReadyAt: string }).recoveryReadyAt,
            vitality: [{ currentHp: 60, maxHp: 60, vitality: "conscious" }],
          },
        });
      } finally {
        await control.query("SELECT pg_advisory_unlock(108002)");
        await control.query(
          "DROP TRIGGER IF EXISTS test_task108_block_terminal_center ON pokenexus.solo_hunts",
        );
        await control.query("DROP FUNCTION IF EXISTS pokenexus.test_task108_block_terminal_center()");
      }
    });
  });

  it("TASK-108 serializes Center-before-terminal so the active-Hunt rejection stays durable", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      createPokemonVitalityInTransaction(client, {
        ownerPlayerId: seeded.playerId,
        pokemonInstanceId: seeded.pokemonInstanceId,
        currentHp: 17,
        now: new Date(),
      }));
    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() + interval '1 second' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    await withPgClient({ connectionString: testDatabaseUrl }, async (control) => {
      await control.query(`
        CREATE FUNCTION pokenexus.test_task108_block_center_terminal() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM pg_advisory_xact_lock(108001);
          RETURN NEW;
        END;
        $$
      `);
      await control.query(`
        CREATE TRIGGER test_task108_block_center_terminal
        BEFORE UPDATE ON pokenexus.pokecenter_heal_commands
        FOR EACH ROW EXECUTE FUNCTION pokenexus.test_task108_block_center_terminal()
      `);
      await control.query("SELECT pg_advisory_lock(108001)");
      try {
        const centerKey = generateUuidV7();
        const center = harness.app.healAtPokeCenter(
          seeded.playerId,
          centerKey,
          { teamId: seeded.teamId },
        );
        await waitForAdvisoryWaiter();
        const retreat = harness.app.retreat(seeded.playerId, generateUuidV7(), huntId);
        await control.query("SELECT pg_advisory_unlock(108001)");

        expect(await center).toEqual({ httpStatus: 409, body: { error: "hunt_active" } });
        expect((await retreat).httpStatus).toBe(200);
        expect(await harness.app.healAtPokeCenter(
          seeded.playerId,
          centerKey,
          { teamId: seeded.teamId },
        )).toEqual({ httpStatus: 409, body: { error: "hunt_active" } });
        expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
          loadPokemonVitality(client, seeded.playerId, seeded.pokemonInstanceId)))
          .toMatchObject({ currentHp: 17, rowVersion: 0n });
      } finally {
        await control.query("SELECT pg_advisory_unlock(108001)");
        await control.query(
          "DROP TRIGGER IF EXISTS test_task108_block_center_terminal ON pokenexus.pokecenter_heal_commands",
        );
        await control.query("DROP FUNCTION IF EXISTS pokenexus.test_task108_block_center_terminal()");
      }
    });
  });

  it("TASK-108 lets a historical v1 Hunt terminalize without vitality rows, then cuts over after terminal", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(started.httpStatus).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      await client.query(
        `UPDATE pokenexus.hunt_input_authorities
            SET runtime_inputs_json = jsonb_set(
              runtime_inputs_json #- '{inputs,initialHpByPokemonInstanceId}',
              '{schemaVersion}',
              '"hunt-runtime-inputs-v1"'::jsonb
            )
          WHERE player_id = $1 AND hunt_id = $2`,
        [seeded.playerId, huntId],
      );
      await client.query(
        "DELETE FROM pokenexus.pokemon_vitalities WHERE owner_player_id = $1 AND pokemon_instance_id = $2",
        [seeded.playerId, seeded.pokemonInstanceId],
      );
      await client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() + interval '1 second' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      );
    });

    const retreat = await harness.app.retreat(seeded.playerId, generateUuidV7(), huntId);
    expect(retreat).toMatchObject({
      httpStatus: 200,
      body: { status: "terminal", terminalReason: "retreat" },
    });
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPokemonVitality(client, seeded.playerId, seeded.pokemonInstanceId))).toBeNull();

    const healed = await harness.app.healAtPokeCenter(
      seeded.playerId,
      generateUuidV7(),
      { teamId: seeded.teamId },
    );
    expect(healed).toMatchObject({
      httpStatus: 200,
      body: {
        vitality: [{
          pokemonInstanceId: seeded.pokemonInstanceId,
          currentHp: 60,
          maxHp: 60,
          vitality: "conscious",
          vitalityRowVersion: "0",
        }],
      },
    });
  });

  it("reuses the exact unresolved same-Zone selection across retreat and a different HuntDefinition restart", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    const firstStart = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(firstStart.httpStatus).toBe(200);
    const firstHuntId = (firstStart.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const firstHunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, firstHuntId));
    if (!firstHunt) throw new Error("missing first Hunt");
    const firstCheckpoint = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, firstHunt.checkpointId));
    if (!firstCheckpoint) throw new Error("missing first checkpoint");
    const firstDecoded = decodeSoloHuntCheckpointV2(firstCheckpoint.stateBytes);
    if (!firstDecoded.accepted || !firstDecoded.state.pendingEncounterSelection) {
      throw new Error("first Hunt lacks a pending selection");
    }
    const originalPending = firstDecoded.state.pendingEncounterSelection;

    const retreat = await harness.app.retreat(seeded.playerId, generateUuidV7(), firstHuntId);
    expect(retreat).toMatchObject({ httpStatus: 200, body: { status: "terminal", terminalReason: "retreat" } });
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPendingZoneSelection(client, { playerId: seeded.playerId, zoneId: "zone:test" })))
      .toMatchObject({ huntDefinitionId: "hunt:test" });

    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.player_hunt_roots SET recovery_ready_at = transaction_timestamp() - interval '1 millisecond' WHERE player_id = $1",
        [seeded.playerId],
      ).then(() => undefined));

    const secondStart = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:alternate",
      teamId: seeded.teamId,
    });
    expect(secondStart.httpStatus).toBe(200);
    expect(harness.lastPending()?.pendingSelectionIdentity).toBe(originalPending.pendingSelectionIdentity);
    expect(harness.lastPending()).toMatchObject({
      huntDefinitionId: "hunt:test",
      speciesId: originalPending.speciesId,
      level: originalPending.level,
      gameDataVersion: originalPending.gameDataVersion,
      rulesVersion: originalPending.rulesVersion,
      contentVersion: originalPending.contentVersion,
      contentHash: originalPending.contentHash,
    });
    expect((secondStart.body as { activeHunt: { huntDefinitionId: string } }).activeHunt.huntDefinitionId)
      .toBe("hunt:test");

    const secondHuntId = (secondStart.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const secondHunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, secondHuntId));
    if (!secondHunt) throw new Error("missing second Hunt");
    const secondCheckpoint = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, secondHunt.checkpointId));
    if (!secondCheckpoint) throw new Error("missing second checkpoint");
    const secondDecoded = decodeSoloHuntCheckpointV2(secondCheckpoint.stateBytes);
    if (!secondDecoded.accepted) throw new Error("second checkpoint did not decode");
    expect(secondDecoded.state.pendingEncounterSelection?.pendingSelectionIdentity)
      .toBe(originalPending.pendingSelectionIdentity);
    expect(secondDecoded.state.currentEncounter?.selection).toEqual(firstDecoded.state.currentEncounter?.selection);
  });

  it("returns an existing Player-wide manual pending decision in a successful new start response", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    const firstStart = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    const firstHuntId = (firstStart.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const retreat = await harness.app.retreat(seeded.playerId, generateUuidV7(), firstHuntId);
    expect(retreat.httpStatus).toBe(200);

    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      withTransaction(client, async (transaction) => {
        const created = await createPendingManualCaptureIfFreeInTransaction(transaction, {
          playerId: seeded.playerId,
          sourceHuntId: firstHuntId,
          encounterId: "encounter:prior-manual",
          speciesId: "species:enemy",
          level: 5,
          catchRate: 120,
          shiny: false,
          captureEvidenceJson: { fixture: true },
        });
        expect(created).toBe("created");
      }));
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.player_hunt_roots SET recovery_ready_at = transaction_timestamp() - interval '1 millisecond' WHERE player_id = $1",
        [seeded.playerId],
      ).then(() => undefined));

    const secondStart = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(secondStart).toMatchObject({
      httpStatus: 200,
      body: {
        activeHunt: { status: "active" },
        pendingManualCapture: {
          sourceHuntId: firstHuntId,
          encounterId: "encounter:prior-manual",
          speciesId: "species:enemy",
          level: 5,
          catchRate: 120,
          shiny: false,
          captureOptions: [],
        },
        recoveryReadyAt: null,
      },
    });
  });

  it("rolls back a newly claimed start command when frozen runtime authority is unavailable, then accepts the exact retry", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    let available = false;
    const harness = applicationWithOptions({ startRuntimeAvailable: () => available });
    const key = generateUuidV7();
    const body = { huntDefinitionId: "hunt:test", teamId: seeded.teamId };

    expect(await harness.app.start(seeded.playerId, key, body))
      .toEqual({ httpStatus: 503, body: { error: "authority_unavailable" } });
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPublicHuntCommand(client, seeded.playerId, key))).toBeNull();

    available = true;
    const retry = await harness.app.start(seeded.playerId, key, body);
    expect(retry).toMatchObject({ httpStatus: 200, body: { activeHunt: { status: "active" } } });
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPublicHuntCommand(client, seeded.playerId, key))).toMatchObject({
      status: "terminal",
      resultHttpStatus: 200,
    });
  });

  it("returns correlation_conflict for a same start key rebound to different intent", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    const key = generateUuidV7();
    expect(await harness.app.start(seeded.playerId, key, {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    })).toMatchObject({ httpStatus: 200 });
    expect(await harness.app.start(seeded.playerId, key, {
      huntDefinitionId: "hunt:alternate",
      teamId: seeded.teamId,
    })).toEqual({ httpStatus: 409, body: { error: "correlation_conflict" } });
  });

  it("persists and returns only canonical saved auto-capture policy fields", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    const replaced = await harness.app.replaceAutoCapturePolicy(
      seeded.playerId,
      generateUuidV7(),
      {
        expectedRowVersion: "0",
        enabled: false,
        lossWarningAcknowledgement: "auto_capture_irreversible_loss_v1",
        balls: [],
        rules: [],
      },
    );
    expect(replaced.httpStatus).toBe(200);
    const saved = (replaced.body as { policy: Record<string, unknown> }).policy;
    expect(saved).toMatchObject({
      policyVersion: expect.any(String),
      ballAuthorityVersion: "balls:test",
      rowVersion: "1",
      enabled: false,
      balls: [],
      rules: [],
    });
    expect(saved).not.toHaveProperty("expectedRowVersion");
    expect(saved).not.toHaveProperty("lossWarningAcknowledgement");

    const read = await harness.app.getAutoCapturePolicy(seeded.playerId);
    expect(read.httpStatus).toBe(200);
    expect(read.body).toMatchObject({
      policyVersion: saved.policyVersion,
      ballAuthorityVersion: "balls:test",
      rowVersion: "1",
      enabled: false,
      balls: [],
      rules: [],
    });
    expect(read.body as Record<string, unknown>).not.toHaveProperty("expectedRowVersion");
    expect(read.body as Record<string, unknown>).not.toHaveProperty("lossWarningAcknowledgement");
  });

  it("does not activate policy when its public lease expires after freeze but before the effect transaction", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    let expireKey: string | null = null;
    const harness = applicationWithOptions({
      beforeLoadPersistedRuntime: async () => {
        if (!expireKey) return;
        const key = expireKey;
        expireKey = null;
        await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
          client.query(
            "UPDATE pokenexus.hunt_public_commands SET continuation_expires_at = clock_timestamp() - interval '1 millisecond' WHERE player_id = $1 AND idempotency_key = $2::uuid",
            [seeded.playerId, key],
          ).then(() => undefined));
      },
    });
    expect(await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    })).toMatchObject({ httpStatus: 200 });

    const policyKey = generateUuidV7();
    expireKey = policyKey;
    expect(await harness.app.replaceAutoCapturePolicy(
      seeded.playerId,
      policyKey,
      {
        expectedRowVersion: "0",
        enabled: false,
        lossWarningAcknowledgement: "auto_capture_irreversible_loss_v1",
        balls: [],
        rules: [],
      },
    )).toEqual({ httpStatus: 410, body: { error: "idempotency_gone" } });

    const root = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query<{ policy_row_version: string }>(
        "SELECT policy_row_version::text FROM pokenexus.player_hunt_roots WHERE player_id = $1",
        [seeded.playerId],
      ).then(({ rows }) => rows[0]));
    expect(root?.policy_row_version).toBe("0");
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPublicHuntCommand(client, seeded.playerId, policyKey))).toMatchObject({
      status: "gone",
      resultHttpStatus: null,
      resultJson: null,
    });
  });

  it("does not persist an ordinary Hunt advancement segment when its public lease expires after freeze", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    let expireKey: string | null = null;
    const harness = applicationWithOptions({
      beforeLoadPersistedRuntime: async () => {
        if (!expireKey) return;
        const key = expireKey;
        expireKey = null;
        await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
          client.query(
            "UPDATE pokenexus.hunt_public_commands SET continuation_expires_at = clock_timestamp() - interval '1 millisecond' WHERE player_id = $1 AND idempotency_key = $2::uuid",
            [seeded.playerId, key],
          ).then(() => undefined));
      },
    });
    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '500 seconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));
    const before = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!before) throw new Error("missing checkpoint fixture");

    const key = generateUuidV7();
    expireKey = key;
    expect(await harness.app.checkpoint(seeded.playerId, key, huntId))
      .toEqual({ httpStatus: 410, body: { error: "idempotency_gone" } });
    const after = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    expect(after?.rowVersion).toBe(before.rowVersion);
    expect(after?.logicalTimeMs).toBe(before.logicalTimeMs);
  });

  it("rolls back completed-Encounter checkpoint advancement when boundary authority is unavailable", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    let historicalAvailable = true;
    const harness = applicationWithOptions({
      historicalAvailable: () => historicalAvailable,
    });
    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(started.httpStatus).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '500 seconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));
    const before = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!before) throw new Error("missing checkpoint fixture");

    historicalAvailable = false;
    const key = generateUuidV7();
    expect(await harness.app.checkpoint(seeded.playerId, key, huntId))
      .toEqual({ httpStatus: 503, body: { error: "authority_unavailable" } });
    const afterFailure = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => ({
      checkpoint: await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId),
      boundary: await loadEarliestIncompleteEncounterBoundary(client, huntId),
    }));
    expect(afterFailure.checkpoint?.rowVersion).toBe(before.rowVersion);
    expect(afterFailure.checkpoint?.logicalTimeMs).toBe(before.logicalTimeMs);
    expect(afterFailure.boundary).toBeNull();

    historicalAvailable = true;
    const retry = await harness.app.checkpoint(seeded.playerId, key, huntId);
    expect(retry).toMatchObject({
      httpStatus: 202,
      body: {
        status: "in_progress",
        progress: {
          logicalTimeMs: expect.any(String),
          targetLogicalTimeMs: expect.any(String),
        },
      },
    });
    const afterRetry = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => ({
      checkpoint: await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId),
      boundary: await loadEarliestIncompleteEncounterBoundary(client, huntId),
    }));
    expect(afterRetry.checkpoint?.rowVersion).toBeGreaterThan(before.rowVersion);
    expect(afterRetry.boundary).toMatchObject({ status: "frozen", automaticDisposition: "disabled" });
  });

  it("selects automatic capture from the locked Inventory at decision time, not an earlier boundary rowVersion", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      await client.query(
        "INSERT INTO pokenexus.inventory_entries (player_id, item_id, quantity) VALUES ($1, $2, 1)",
        [seeded.playerId, opaque("item:poke-ball")],
      );
      await withTransaction(client, async (transaction) => {
        await ensureAndLockPlayerHuntRoot(transaction, seeded.playerId);
        const policy = await insertAutoCapturePolicyInTransaction(transaction, {
          playerId: seeded.playerId,
          expectedRowVersion: 0n,
          ballAuthorityVersion: "balls:test",
          validationGameDataVersion: "game-data:test",
          enabled: true,
          policyJson: {
            enabled: true,
            balls: [{ itemId: "item:poke-ball", autoUseEnabled: true, minimumReserve: "0" }],
            rules: [{ when: {}, selectedItemId: "item:poke-ball" }],
          },
          effectiveHuntId: null,
          effectiveLogicalTimeMs: null,
        });
        expect(policy.status).toBe("accepted");
      });
    });
    let automaticCalls = 0;
    const harness = applicationWithOptions({
      ballAuthority: {
        version: "balls:test",
        balls: [{ itemId: "item:poke-ball", powerQuarterUnits: 4, premium: false }],
      },
      automaticCapture: async () => {
        automaticCalls += 1;
        return { status: "accepted", success: false, shiny: false };
      },
      reward: async () => ({
        rewardResolutionId: generateUuidV7(),
        reward: { playerExperience: 0n, pokemonExperience: [], items: [] },
      }),
    });
    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(started.httpStatus).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '500 seconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    const key = generateUuidV7();
    const frozen = await harness.app.checkpoint(seeded.playerId, key, huntId);
    expect(frozen.httpStatus).toBe(202);
    const boundary = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadEarliestIncompleteEncounterBoundary(client, huntId));
    expect(boundary).toMatchObject({ status: "frozen", automaticDisposition: null });
    expect(boundary?.preRewardInventoryRowVersion).toBeNull();

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const inventory = await loadInventory(client, seeded.playerId);
      if (!inventory) throw new Error("missing Inventory fixture");
      const removed = await withTransaction(client, (transaction) =>
        removeInventoryEntriesInTransaction(transaction, {
          playerId: seeded.playerId,
          expectedRowVersion: inventory.rowVersion,
          removals: [{ itemId: "item:poke-ball", quantity: 1n }],
          now: new Date(),
        }));
      expect(removed.status).toBe("updated");
    });

    const captureStage = await harness.app.checkpoint(seeded.playerId, key, huntId);
    expect(captureStage.httpStatus).toBe(202);
    expect(automaticCalls).toBe(0);
    const decided = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const current = await loadEarliestIncompleteEncounterBoundary(client, huntId);
      const inventory = await loadInventory(client, seeded.playerId);
      return { current, inventory };
    });
    expect(decided.current).toMatchObject({
      status: "capture_committed",
      automaticDisposition: "no_eligible_ball",
      selectedItemId: null,
    });
    expect(decided.current?.preRewardInventoryRowVersion).toBe(decided.inventory?.rowVersion);
  });

  it("retries the same frozen automatic opportunity after authority outage without publishing the decision early", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      await client.query(
        "INSERT INTO pokenexus.inventory_entries (player_id, item_id, quantity) VALUES ($1, $2, 1)",
        [seeded.playerId, opaque("item:poke-ball")],
      );
      await withTransaction(client, async (transaction) => {
        await ensureAndLockPlayerHuntRoot(transaction, seeded.playerId);
        const policy = await insertAutoCapturePolicyInTransaction(transaction, {
          playerId: seeded.playerId,
          expectedRowVersion: 0n,
          ballAuthorityVersion: "balls:test",
          validationGameDataVersion: "game-data:test",
          enabled: true,
          policyJson: {
            enabled: true,
            balls: [{ itemId: "item:poke-ball", autoUseEnabled: true, minimumReserve: "0" }],
            rules: [{ when: {}, selectedItemId: "item:poke-ball" }],
          },
          effectiveHuntId: null,
          effectiveLogicalTimeMs: null,
        });
        expect(policy.status).toBe("accepted");
      });
    });

    const attempts: Array<{
      readonly selectedItemId: string;
      readonly expectedInventoryRowVersion: bigint;
      readonly captureRng: unknown;
    }> = [];
    const harness = applicationWithOptions({
      ballAuthority: {
        version: "balls:test",
        balls: [{ itemId: "item:poke-ball", powerQuarterUnits: 4, premium: false }],
      },
      automaticCapture: async (input) => {
        attempts.push({
          selectedItemId: input.selectedItemId,
          expectedInventoryRowVersion: input.expectedInventoryRowVersion,
          captureRng: input.captureRng,
        });
        return attempts.length === 1
          ? { status: "authority_unavailable" }
          : { status: "accepted", success: false, shiny: false };
      },
      reward: async () => ({
        rewardResolutionId: generateUuidV7(),
        reward: { playerExperience: 0n, pokemonExperience: [], items: [] },
      }),
    });
    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '500 seconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    const key = generateUuidV7();
    expect((await harness.app.checkpoint(seeded.playerId, key, huntId)).httpStatus).toBe(202);
    const frozenBeforeAttempt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadEarliestIncompleteEncounterBoundary(client, huntId));
    expect(frozenBeforeAttempt).toMatchObject({ status: "frozen", automaticDisposition: null });

    expect(await harness.app.checkpoint(seeded.playerId, key, huntId))
      .toEqual({ httpStatus: 503, body: { error: "authority_unavailable" } });
    const afterOutage = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadEarliestIncompleteEncounterBoundary(client, huntId));
    expect(afterOutage).toMatchObject({
      status: "frozen",
      automaticDisposition: null,
      selectedItemId: null,
      automaticCaptureSuccess: null,
    });
    expect(attempts).toHaveLength(1);

    const retry = await harness.app.checkpoint(seeded.playerId, key, huntId);
    expect(retry.httpStatus).toBe(202);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    const committed = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadEarliestIncompleteEncounterBoundary(client, huntId));
    expect(committed).toMatchObject({
      status: "capture_committed",
      automaticDisposition: "attempt",
      selectedItemId: "item:poke-ball",
      automaticCaptureSuccess: false,
    });
  });

  it("keeps automatic-capture and reward claim effects owned by the command that commits each stage", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      await client.query(
        "INSERT INTO pokenexus.inventory_entries (player_id, item_id, quantity) VALUES ($1, $2, 1)",
        [seeded.playerId, opaque("item:poke-ball")],
      );
      await withTransaction(client, async (transaction) => {
        await ensureAndLockPlayerHuntRoot(transaction, seeded.playerId);
        const policy = await insertAutoCapturePolicyInTransaction(transaction, {
          playerId: seeded.playerId,
          expectedRowVersion: 0n,
          ballAuthorityVersion: "balls:test",
          validationGameDataVersion: "game-data:test",
          enabled: true,
          policyJson: {
            enabled: true,
            balls: [{ itemId: "item:poke-ball", autoUseEnabled: true, minimumReserve: "0" }],
            rules: [{ when: {}, selectedItemId: "item:poke-ball" }],
          },
          effectiveHuntId: null,
          effectiveLogicalTimeMs: null,
        });
        expect(policy.status).toBe("accepted");
      });
    });
    const harness = applicationWithOptions({
      ballAuthority: {
        version: "balls:test",
        balls: [{ itemId: "item:poke-ball", powerQuarterUnits: 4, premium: false }],
      },
      automaticCapture: async () => ({ status: "accepted", success: true, shiny: false }),
      reward: async () => {
        const durable = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
          claimRewardResolution(client, {
            subjectPlayerId: seeded.playerId,
            sourceAuthority: "pokenexus.solo-hunt.encounter-completion.v1",
            sourceCorrelation: "reward:claim-stage-ownership",
            rulesVersion: "rules:test",
            gameDataVersion: "game-data:test",
            effects: [{ kind: "player_xp", playerId: seeded.playerId, amount: 7n }],
          }));
        return {
          rewardResolutionId: durable.resolution.resolutionId,
          reward: { playerExperience: 7n, pokemonExperience: [], items: [] },
        };
      },
    });
    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '500 seconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    const claimKey = generateUuidV7();
    expect((await harness.app.claim(seeded.playerId, claimKey, huntId)).httpStatus).toBe(202);
    expect((await harness.app.claim(seeded.playerId, claimKey, huntId)).httpStatus).toBe(202);
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadEarliestIncompleteEncounterBoundary(client, huntId))).toMatchObject({
        status: "capture_committed",
        automaticDisposition: "attempt",
        automaticCaptureSuccess: true,
      });
    const afterCapture = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPublicHuntCommand(client, seeded.playerId, claimKey));
    expect(afterCapture?.claimEffects).toMatchObject({
      playerExperience: "0",
      automaticCaptureSummary: {
        attempts: "1",
        successes: "1",
        failures: "0",
      },
    });

    const checkpointKey = generateUuidV7();
    const checkpointStage = await harness.app.checkpoint(seeded.playerId, checkpointKey, huntId);
    expect(checkpointStage).toMatchObject({ httpStatus: 202 });
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadEarliestIncompleteEncounterBoundary(client, huntId))).toMatchObject({ status: "reward_committed" });
    const afterRewardByOtherCommand = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPublicHuntCommand(client, seeded.playerId, claimKey));
    expect(afterRewardByOtherCommand?.claimEffects).toEqual(afterCapture?.claimEffects);
  });

  it("does not turn concurrent continuation of the same pending checkpoint key into command_superseded", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '500 seconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    const key = generateUuidV7();
    const [left, right] = await Promise.all([
      harness.app.checkpoint(seeded.playerId, key, huntId),
      harness.app.checkpoint(seeded.playerId, key, huntId),
    ]);
    for (const result of [left, right]) {
      expect(result).toMatchObject({
        httpStatus: 202,
        body: {
          status: "in_progress",
          progress: {
            logicalTimeMs: expect.any(String),
            targetLogicalTimeMs: expect.any(String),
          },
        },
      });
    }
    const durable = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPublicHuntCommand(client, seeded.playerId, key));
    expect(durable?.status).toBe("pending");
  });

  it.each(["draw", "opponent_victory"] as const)(
    "converges pending retreat onto public no_living from persisted %s without advancing terminal Hunt",
    async (legacyReason) => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    const checkpoint = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!checkpoint) throw new Error("missing checkpoint fixture");

    const key = generateUuidV7();
    const intent = { huntId };
    const intentHash = await hashNormalizedIntent(intent);
    let expectedRecoveryReadyAt: Date | null = null;
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, seeded.playerId);
        if (!root) throw new Error("missing Player Hunt root");
        const claimed = await claimPublicHuntCommandInTransaction(transaction, {
          playerId: seeded.playerId,
          idempotencyKey: key,
          commandKind: "retreat",
          intentHash,
          intentJson: intent,
          sourceHuntId: huntId,
          advancementHuntId: huntId,
          targetLogicalTimeMs: checkpoint.logicalTimeMs + 100,
          targetWallClockAt: root.databaseNow,
        });
        expect(claimed.status).toBe("accepted");
        const terminal = await terminalizeSoloHuntInTransaction(transaction, {
          playerId: seeded.playerId,
          huntId,
          terminalReason: legacyReason,
          recoveryDurationMs: hunt.recoveryDurationMs,
        });
        expectedRecoveryReadyAt = terminal.recoveryReadyAt;
      }));

    const beforeRetry = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.player_hunt_roots SET recovery_ready_at = transaction_timestamp() - interval '1 millisecond' WHERE player_id = $1",
        [seeded.playerId],
      ).then(() => undefined));
    const newerStart = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(newerStart).toMatchObject({ httpStatus: 200, body: { activeHunt: { status: "active" } } });

    const retry = await harness.app.retreat(seeded.playerId, key, huntId);
    expect(retry).toMatchObject({
      httpStatus: 200,
      body: {
        status: "terminal",
        terminalReason: "no_living",
        recoveryReadyAt: expectedRecoveryReadyAt?.toISOString(),
      },
    });
    expect(await harness.app.retreat(seeded.playerId, key, huntId)).toEqual(retry);
    const legacyTerminal = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    expect(legacyTerminal?.terminalReason).toBe(legacyReason);
    expect(legacyTerminal?.terminalAt).not.toBeNull();
    const afterRetry = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    expect(afterRetry?.rowVersion).toBe(beforeRetry?.rowVersion);
    expect(afterRetry?.logicalTimeMs).toBe(beforeRetry?.logicalTimeMs);
  });

  it("does not rewrite a historical completed retreat command carrying a legacy terminal payload", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    const checkpoint = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!checkpoint) throw new Error("missing checkpoint fixture");
    const key = generateUuidV7();
    const intent = { huntId };
    const intentHash = await hashNormalizedIntent(intent);
    let historicalBody: {
      status: "terminal";
      terminalReason: "draw";
      recoveryReadyAt: string;
    } | null = null;
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, seeded.playerId);
        if (!root) throw new Error("missing Player Hunt root");
        const claimed = await claimPublicHuntCommandInTransaction(transaction, {
          playerId: seeded.playerId,
          idempotencyKey: key,
          commandKind: "retreat",
          intentHash,
          intentJson: intent,
          sourceHuntId: huntId,
          advancementHuntId: huntId,
          targetLogicalTimeMs: checkpoint.logicalTimeMs + 100,
          targetWallClockAt: root.databaseNow,
        });
        if (claimed.status !== "accepted") throw new Error("expected first claim");
        const terminal = await terminalizeSoloHuntInTransaction(transaction, {
          playerId: seeded.playerId,
          huntId,
          terminalReason: "draw",
          recoveryDurationMs: hunt.recoveryDurationMs,
        });
        historicalBody = {
          status: "terminal",
          terminalReason: "draw",
          recoveryReadyAt: terminal.recoveryReadyAt.toISOString(),
        };
        await completePublicHuntCommandInTransaction(
          transaction, claimed.command.commandId, 200, historicalBody,
        );
      }));

    const replay = await harness.app.retreat(seeded.playerId, key, huntId);
    expect(replay).toEqual({ httpStatus: 200, body: historicalBody });
    expect(await harness.app.retreat(seeded.playerId, key, huntId)).toEqual(replay);
    const persisted = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPublicHuntCommand(client, seeded.playerId, key));
    expect(persisted?.resultJson).toEqual(historicalBody);
    expect(persisted?.status).toBe("terminal");
  });

  it("finalizes an old pending checkpoint against its terminal Hunt even after a newer Hunt starts", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    const oldStart = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    const oldHuntId = (oldStart.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const oldHunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, oldHuntId));
    if (!oldHunt) throw new Error("missing old Hunt fixture");
    const oldCheckpoint = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, oldHunt.checkpointId));
    if (!oldCheckpoint) throw new Error("missing old checkpoint fixture");

    const oldKey = generateUuidV7();
    const oldIntent = { huntId: oldHuntId };
    const oldIntentHash = await hashNormalizedIntent(oldIntent);
    let expectedRecoveryReadyAt: Date | null = null;
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, seeded.playerId);
        if (!root) throw new Error("missing Player Hunt root");
        const claimed = await claimPublicHuntCommandInTransaction(transaction, {
          playerId: seeded.playerId,
          idempotencyKey: oldKey,
          commandKind: "checkpoint",
          intentHash: oldIntentHash,
          intentJson: oldIntent,
          sourceHuntId: oldHuntId,
          advancementHuntId: oldHuntId,
          targetLogicalTimeMs: oldCheckpoint.logicalTimeMs + 100,
          targetWallClockAt: root.databaseNow,
        });
        expect(claimed.status).toBe("accepted");
        const terminal = await terminalizeSoloHuntInTransaction(transaction, {
          playerId: seeded.playerId,
          huntId: oldHuntId,
          terminalReason: "opponent_victory",
          recoveryDurationMs: oldHunt.recoveryDurationMs,
        });
        expectedRecoveryReadyAt = terminal.recoveryReadyAt;
      }));

    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.player_hunt_roots SET recovery_ready_at = transaction_timestamp() - interval '1 millisecond' WHERE player_id = $1",
        [seeded.playerId],
      ).then(() => undefined));
    const newerStart = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(newerStart).toMatchObject({ httpStatus: 200, body: { activeHunt: { status: "active" } } });
    const newerHuntId = (newerStart.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    expect(newerHuntId).not.toBe(oldHuntId);

    const oldRetry = await harness.app.checkpoint(seeded.playerId, oldKey, oldHuntId);
    expect(oldRetry).toEqual({
      httpStatus: 200,
      body: {
        activeHunt: null,
        pendingManualCapture: null,
        recoveryReadyAt: expectedRecoveryReadyAt?.toISOString(),
      },
    });
    expect((await harness.app.getState(seeded.playerId)).body).toMatchObject({
      activeHunt: { huntId: newerHuntId, status: "active" },
      recoveryReadyAt: null,
    });
  });

  it("projects only Player-wide manual pending decisions that existed no later than the terminal Hunt", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    const firstStart = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    const firstHuntId = (firstStart.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    expect(await harness.app.retreat(seeded.playerId, generateUuidV7(), firstHuntId))
      .toMatchObject({ httpStatus: 200, body: { status: "terminal" } });
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      withTransaction(client, async (transaction) => {
        const created = await createPendingManualCaptureIfFreeInTransaction(transaction, {
          playerId: seeded.playerId,
          sourceHuntId: firstHuntId,
          encounterId: "encounter:older-manual",
          speciesId: "species:enemy",
          level: 5,
          catchRate: 120,
          shiny: false,
          captureEvidenceJson: { fixture: "older" },
        });
        expect(created).toBe("created");
      }));
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.player_hunt_roots SET recovery_ready_at = clock_timestamp() - interval '1 millisecond' WHERE player_id = $1",
        [seeded.playerId],
      ).then(() => undefined));

    const secondStart = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    const secondHuntId = (secondStart.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const secondHunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, secondHuntId));
    if (!secondHunt) throw new Error("missing second Hunt fixture");
    const secondCheckpoint = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, secondHunt.checkpointId));
    if (!secondCheckpoint) throw new Error("missing second checkpoint fixture");

    const visibleKey = generateUuidV7();
    const futureKey = generateUuidV7();
    const intent = { huntId: secondHuntId };
    const intentHash = await hashNormalizedIntent(intent);
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, seeded.playerId);
        if (!root) throw new Error("missing Player Hunt root");
        for (const idempotencyKey of [visibleKey, futureKey]) {
          const claimed = await claimPublicHuntCommandInTransaction(transaction, {
            playerId: seeded.playerId,
            idempotencyKey,
            commandKind: "checkpoint",
            intentHash,
            intentJson: intent,
            sourceHuntId: secondHuntId,
            advancementHuntId: secondHuntId,
            targetLogicalTimeMs: secondCheckpoint.logicalTimeMs + 100,
            targetWallClockAt: root.databaseNow,
          });
          expect(claimed.status).toBe("accepted");
        }
        await terminalizeSoloHuntInTransaction(transaction, {
          playerId: seeded.playerId,
          huntId: secondHuntId,
          terminalReason: "draw",
          recoveryDurationMs: secondHunt.recoveryDurationMs,
        });
      }));

    expect(await harness.app.checkpoint(seeded.playerId, visibleKey, secondHuntId)).toMatchObject({
      httpStatus: 200,
      body: {
        activeHunt: null,
        pendingManualCapture: {
          sourceHuntId: firstHuntId,
          encounterId: "encounter:older-manual",
        },
      },
    });

    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      withTransaction(client, async (transaction) => {
        await closePendingManualCaptureInTransaction(transaction, {
          playerId: seeded.playerId,
          sourceHuntId: firstHuntId,
          encounterId: "encounter:older-manual",
        });
        await transaction.query(
          "UPDATE pokenexus.player_hunt_roots SET recovery_ready_at = clock_timestamp() - interval '1 millisecond' WHERE player_id = $1",
          [seeded.playerId],
        );
      }));
    const thirdStart = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    const thirdHuntId = (thirdStart.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      withTransaction(client, async (transaction) => {
        const created = await createPendingManualCaptureIfFreeInTransaction(transaction, {
          playerId: seeded.playerId,
          sourceHuntId: thirdHuntId,
          encounterId: "encounter:future-manual",
          speciesId: "species:enemy",
          level: 5,
          catchRate: 120,
          shiny: false,
          captureEvidenceJson: { fixture: "future" },
        });
        expect(created).toBe("created");
      }));

    expect(await harness.app.checkpoint(seeded.playerId, futureKey, secondHuntId)).toMatchObject({
      httpStatus: 200,
      body: {
        activeHunt: null,
        pendingManualCapture: null,
      },
    });
  });

  it("cannot advance another command past an accepted heal cutoff before classifying that heal", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const { app } = application();
    const started = await app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(started.httpStatus).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    expect(hunt).not.toBeNull();
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '100 milliseconds' WHERE checkpoint_id = $1",
        [hunt!.checkpointId],
      ));

    const healKey = generateUuidV7();
    const firstHeal = await app.useItem(seeded.playerId, healKey, huntId, {
      itemId: "item:potion",
      targetPokemonInstanceId: seeded.pokemonInstanceId,
    });
    expect(firstHeal).toMatchObject({ httpStatus: 202, body: { status: "in_progress" } });

    const before = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const command = await loadPublicHuntCommand(client, seeded.playerId, healKey);
      if (!command) throw new Error("missing heal command");
      const healing = await loadHealingCommandByCommandId(client, command.commandId);
      const checkpoint = await loadHuntCheckpoint(client, seeded.playerId, hunt!.checkpointId);
      return { command, healing, checkpoint };
    });
    expect(before.healing).toMatchObject({
      submissionPhase: null,
      dueLogicalTimeMs: null,
      submissionCutoffLogicalTimeMs: before.checkpoint!.logicalTimeMs,
    });

    const checkpointResult = await app.checkpoint(
      seeded.playerId,
      generateUuidV7(),
      huntId,
    );
    expect(checkpointResult).toMatchObject({ httpStatus: 202, body: { status: "in_progress" } });

    const after = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => ({
      healing: await loadHealingCommandByCommandId(client, before.command.commandId),
      checkpoint: await loadHuntCheckpoint(client, seeded.playerId, hunt!.checkpointId),
    }));
    expect(after.healing).toMatchObject({
      submissionPhase: "battle",
      dueLogicalTimeMs: null,
      submissionEncounterId: expect.any(String),
    });
    expect(after.checkpoint?.logicalTimeMs).toBe(before.checkpoint?.logicalTimeMs);
  });

  it("resolves at most one due heal per invocation and drains same-boundary heals in acceptance order", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(started.httpStatus).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    const checkpoint = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!checkpoint) throw new Error("missing Hunt checkpoint fixture");
    const decoded = decodeSoloHuntCheckpointV2(checkpoint.stateBytes);
    expect(decoded.accepted).toBe(true);
    if (!decoded.accepted) return;
    const bounded = advanceSoloHuntToEncounterBoundaryOrCutoff(decoded.state, harness.runtime(), 200_000);
    expect(bounded.accepted).toBe(true);
    if (!bounded.accepted || !bounded.state.interBattle) return;

    const hpKeys = Object.keys(bounded.state.interBattle.cadence.hpByParticipant);
    const targetKey = hpKeys.find((key) => key.includes(seeded.pokemonInstanceId));
    if (!targetKey) throw new Error("fixture target is missing from inter-Battle cadence");
    const maxHp = bounded.state.interBattle.cadence.maxHpByParticipant[targetKey];
    const currentHp = bounded.state.interBattle.cadence.hpByParticipant[targetKey];
    if (maxHp === undefined || currentHp === undefined || maxHp <= 1 || currentHp <= 0) {
      throw new Error("fixture target lacks a living HP range");
    }
    const damagedState = {
      ...bounded.state,
      interBattle: {
        ...bounded.state.interBattle,
        cadence: {
          ...bounded.state.interBattle.cadence,
          hpByParticipant: {
            ...bounded.state.interBattle.cadence.hpByParticipant,
            [targetKey]: Math.max(1, Math.min(currentHp, maxHp - 10)),
          },
        },
      },
    };
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        `UPDATE pokenexus.hunt_checkpoints
            SET logical_time_ms = $2,
                checkpoint_state_bytes = $3,
                logical_time_anchor_at = transaction_timestamp() + interval '1 second',
                row_version = row_version + 1,
                updated_at = transaction_timestamp()
          WHERE checkpoint_id = $1`,
        [hunt.checkpointId, damagedState.logicalTimeMs, Buffer.from(encodeSoloHuntCheckpointV2(damagedState))],
      ));

    const firstKey = generateUuidV7();
    const secondKey = generateUuidV7();
    expect(await harness.app.useItem(seeded.playerId, firstKey, huntId, {
      itemId: "item:potion",
      targetPokemonInstanceId: seeded.pokemonInstanceId,
    })).toMatchObject({ httpStatus: 202, body: { status: "in_progress" } });
    expect(await harness.app.useItem(seeded.playerId, secondKey, huntId, {
      itemId: "item:potion",
      targetPokemonInstanceId: seeded.pokemonInstanceId,
    })).toMatchObject({ httpStatus: 202, body: { status: "in_progress" } });

    const afterSecondAcceptance = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const firstCommand = await loadPublicHuntCommand(client, seeded.playerId, firstKey);
      const secondCommand = await loadPublicHuntCommand(client, seeded.playerId, secondKey);
      if (!firstCommand || !secondCommand) throw new Error("missing healing commands");
      return {
        firstCommand,
        secondCommand,
        firstHeal: await loadHealingCommandByCommandId(client, firstCommand.commandId),
        secondHeal: await loadHealingCommandByCommandId(client, secondCommand.commandId),
      };
    });
    expect(afterSecondAcceptance.firstCommand.status).toBe("terminal");
    expect(afterSecondAcceptance.firstHeal?.status).toBe("applied");
    expect(afterSecondAcceptance.secondCommand.status).toBe("pending");
    expect(afterSecondAcceptance.secondHeal).toMatchObject({ status: "scheduled", submissionPhase: null });

    expect(await harness.app.useItem(seeded.playerId, secondKey, huntId, {
      itemId: "item:potion",
      targetPokemonInstanceId: seeded.pokemonInstanceId,
    })).toMatchObject({ httpStatus: 202, body: { status: "in_progress" } });
    const classifiedSecond = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const command = await loadPublicHuntCommand(client, seeded.playerId, secondKey);
      if (!command) throw new Error("missing second heal command");
      return loadHealingCommandByCommandId(client, command.commandId);
    });
    expect(classifiedSecond).toMatchObject({ status: "scheduled", submissionPhase: "inter_battle" });

    const resolvedSecond = await harness.app.useItem(seeded.playerId, secondKey, huntId, {
      itemId: "item:potion",
      targetPokemonInstanceId: seeded.pokemonInstanceId,
    });
    expect(resolvedSecond.httpStatus).toBe(200);
    const finalSecond = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const command = await loadPublicHuntCommand(client, seeded.playerId, secondKey);
      if (!command) throw new Error("missing second heal command");
      return loadHealingCommandByCommandId(client, command.commandId);
    });
    expect(finalSecond?.status).toBe("applied");
  });
});
