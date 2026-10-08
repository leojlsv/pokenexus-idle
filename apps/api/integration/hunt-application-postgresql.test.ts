import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  canonicalPresentationJson,
  encodeOpaqueStringDbV1,
  claimPublicHuntCommandInTransaction,
  completePublicHuntCommandInTransaction,
  claimRewardResolution,
  claimRewardResolutionInTransaction,
  closePendingManualCaptureInTransaction,
  createPokemonVitalityInTransaction,
  createPendingManualCaptureIfFreeInTransaction,
  ensureAndLockPlayerHuntRoot,
  generateUuidV7,
  insertAutoCapturePolicyInTransaction,
  insertRewardCompletion,
  insertResolvedEncounterActivityInTransaction,
  loadAutomationItemUsesForEncounter,
  loadEncounterBoundary,
  loadEarliestIncompleteEncounterBoundary,
  loadEffectiveAutoPotionPolicyVersion,
  loadEffectiveAutoRevivePolicyVersion,
  loadHealingCommandByCommandId,
  loadHuntCheckpoint,
  loadHuntInputAuthority,
  loadInventory,
  loadOwnedSoloHunt,
  loadPendingManualCapture,
  loadPendingZoneSelection,
  loadPostBattleReviveAppliedByProvenance,
  loadPokeCenterHealCommand,
  loadPokemonVitality,
  loadPublicHuntCommand,
  loadResolvedEncounterActivity,
  loadRewardResolutionById,
  loadRetreatAbandonment,
  persistOwnedHuntCheckpointInTransaction,
  removeInventoryEntriesInTransaction,
  terminalizeSoloHuntInTransaction,
  withTransaction,
  withPgClient,
} from "@pokenexus/database";
import { runMigrations } from "@pokenexus/database/migrations";
import {
  advanceSoloHuntToAutomationBoundaryOrEncounterBoundaryOrCutoff,
  advanceSoloHuntToEncounterBoundaryOrCutoff,
  decodeSoloHuntCheckpoint,
  encodeSoloHuntCheckpointV4,
  ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
  GENETIC_COMBAT_RULES_VERSION_V1,
  MANAGEMENT_FIRST_COMBAT_EVENT_SCHEMA_VERSION_V1,
  MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1,
  SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V4,
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
import { hashNormalizedIntent, parseAutoPotionPolicyReplaceBody } from "../src/hunts/protocol";
import { createPresentationCursorCodec } from "../src/hunts/presentation-cursor";
import { readHuntPresentationWithConsistentSnapshot } from "../src/hunts/presentation-read";
import { publishCommittedHuntPresentation } from "../src/hunts/presentation-source";
import { FORWARD_OFFLINE_PRODUCTIVE_CAP_MS } from "../src/hunts/offline-reconciliation";
import { serializeHuntRuntimeInputsForPersistence } from "../src/hunts/runtime";
import { createTask103RealHuntAuthority } from "./hunt-real-authority-test-fixture";

const testDatabaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL is required for Hunt application PostgreSQL tests");
}
const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
if (!/^pokenexus_test(?:_|$)/.test(databaseName)) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL must target pokenexus_test or pokenexus_test_*");
}

const opaque = (value: string) => Buffer.from(encodeOpaqueStringDbV1(value));
const fixtureIndividualizationSecret = new Uint8Array(32).fill(41);
const fixtureIndividualizationKeyId =
  "key-v1:1d711813033020684aa0b66f206a8c6ede61291c5265582d5b1486b8909ab331";

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

async function settleBoundedCommand(
  execute: () => Promise<{ readonly httpStatus: number; readonly body: unknown }>,
  maxAttempts = 128,
): Promise<{ readonly httpStatus: number; readonly body: unknown }> {
  let result = await execute();
  for (let attempt = 1; result.httpStatus === 202 && attempt < maxAttempts; attempt += 1) {
    result = await execute();
  }
  if (result.httpStatus === 202) {
    throw new Error("bounded Hunt command did not settle within the test attempt budget");
  }
  return result;
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

async function addInventoryItem(playerId: string, itemId: string, quantity: bigint): Promise<void> {
  await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
    client.query(
      "INSERT INTO pokenexus.inventory_entries (player_id, item_id, quantity) VALUES ($1, $2, $3::bigint)",
      [playerId, opaque(itemId), quantity.toString()],
    ).then(() => undefined));
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
    rulesVersion: MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1,
    combatEventSchemaVersion: MANAGEMENT_FIRST_COMBAT_EVENT_SCHEMA_VERSION_V1,
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
      geneticBonuses: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
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
      compatibleProfiles: ["Harmony", "Endurance"],
      types: ["normal" as never],
      moveLoadout: ["move:enemy" as never],
    }],
    interBattleGapMs: 1_000,
    individualizationAuthority: {
      rulesVersion: ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
      authorityVersion: "authority-v1",
      keyId: fixtureIndividualizationKeyId,
      secretKey: fixtureIndividualizationSecret,
    },
  } as SoloHuntRuntimeInputs;
}

function lethalRuntimeInputs(
  inputs: SoloHuntRuntimeInputs,
  targetScope: "singleEnemy" | "allActive",
): SoloHuntRuntimeInputs {
  const enemyMove = inputs.context.moveRules["move:enemy"];
  if (!enemyMove) throw new Error("fixture enemy Move is unavailable");
  const context: ResolvedCombatContext = {
    ...inputs.context,
    moveRules: {
      ...inputs.context.moveRules,
      "move:enemy": {
        ...enemyMove,
        targetScope,
        power: 10_000,
      },
    },
  };
  return {
    ...inputs,
    context,
    team: inputs.team.map((member) => ({
      ...member,
      baseStats: { ...member.baseStats, spe: 1 },
    })),
    opponentTemplates: inputs.opponentTemplates.map((template) => ({
      ...template,
      rulesVersion: context.rulesVersion,
      baseStats: { hp: 10, atk: 200, def: 10, spa: 10, spd: 10, spe: 200 },
    })),
    interBattleGapMs: 60_000,
  };
}

function application(): {
  readonly app: HuntApplication;
  readonly runtime: () => SoloHuntRuntimeInputs;
  readonly lastPending: () => SoloHuntPendingEncounterSelection | undefined;
} {
  return applicationWithOptions();
}

function applicationWithOptions(options: {
  readonly presentationSourceEnabled?: boolean;
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
  readonly beforeItemRule?: (itemId: string) => Promise<void>;
  readonly runtimeInputsTransform?: (inputs: SoloHuntRuntimeInputs) => SoloHuntRuntimeInputs;
  readonly persistedRuntimeStore?: { value: SoloHuntRuntimeInputs | null };
  readonly automaticCapture?: HuntApplicationPorts["boundaryEffects"]["automaticCapture"];
  readonly reward?: HuntApplicationPorts["boundaryEffects"]["reward"];
} = {}): {
  readonly app: HuntApplication;
  readonly runtime: () => SoloHuntRuntimeInputs;
  readonly lastPending: () => SoloHuntPendingEncounterSelection | undefined;
} {
  let persisted: SoloHuntRuntimeInputs | null = options.persistedRuntimeStore?.value ?? null;
  const setPersisted = (value: SoloHuntRuntimeInputs): SoloHuntRuntimeInputs => {
    persisted = value;
    if (options.persistedRuntimeStore) options.persistedRuntimeStore.value = value;
    return value;
  };
  let lastPending: SoloHuntPendingEncounterSelection | undefined;
  const ballAuthority = options.ballAuthority ?? { version: "balls:test", balls: [] };
  const authority: HuntRuntimeAuthorityPort = {
    async resolveStartSelector(huntDefinitionId) {
      return huntDefinitionId === "hunt:test" || huntDefinitionId === "hunt:alternate"
        ? {
            huntDefinitionId,
            zoneId: "zone:test",
            recoveryDurationMs: 30_000,
            gameDataVersion: "game-data:test",
            rulesVersion: MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1,
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
      const baseInputs = runtimeInputs(
        playerId,
        team.pokemon.map((pokemon) => pokemon.pokemonInstanceId),
        effectiveHuntDefinitionId,
      );
      const sourceInputs = options.presentationSourceEnabled
        ? {
            ...baseInputs,
            team: baseInputs.team.map((member) => {
              const original = team.pokemon.find(
                ({ pokemonInstanceId }) => pokemonInstanceId === member.pokemonInstanceId,
              );
              if (!original) throw new Error("fixture presentation Team lost original Pokémon authority");
              return { ...member, shiny: original.individualization.shiny };
            }),
          }
        : baseInputs;
      persisted = setPersisted(options.runtimeInputsTransform
        ? options.runtimeInputsTransform(sourceInputs)
        : sourceInputs);
      return {
        inputs: persisted,
        persistedInputs: {
          schemaVersion: "hunt-runtime-inputs-v1",
          inputs: persisted,
          individualizationRequired: true,
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
        individualizationAuthorityVersion: "authority-v1",
        individualizationAuthorityKeyId: fixtureIndividualizationKeyId,
      };
    },
    bindStartVitality(built, initialHpByPokemonInstanceId) {
      persisted = setPersisted({
        ...built.inputs,
        initialHpByPokemonInstanceId,
      });
      return {
        ...built,
        inputs: persisted,
        persistedInputs: {
          schemaVersion: "hunt-runtime-inputs-v2",
          inputs: persisted,
          individualizationRequired: true,
        },
      };
    },
    bindStartAutomationPolicies(built, automationPolicies) {
      persisted = setPersisted({
        ...built.inputs,
        automationPolicies,
      });
      return {
        ...built,
        inputs: persisted,
        persistedInputs: options.presentationSourceEnabled
          ? serializeHuntRuntimeInputsForPersistence(persisted) as unknown as Record<string, unknown>
          : {
              schemaVersion: "hunt-runtime-inputs-v3",
              inputs: persisted,
              individualizationRequired: true,
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
      if (itemId === "item:potion" || itemId === "item:potion-alt" || itemId === "item:potion-third") {
        return { itemRuleVersion: "item-rules:test", useKind: "heal-hp", magnitude: { kind: "fixed", amount: 5 } };
      }
      if (itemId === "item:revive") {
        return {
          itemRuleVersion: "item-rules:test",
          useKind: "revive-hp",
          magnitude: { kind: "max-hp-fraction", numerator: 1, denominator: 4 },
        };
      }
      return null;
    },
    async itemRule({ itemId, itemRuleVersion }) {
      await options.beforeItemRule?.(itemId);
      if (itemRuleVersion !== "item-rules:test") return null;
      if (itemId === "item:potion" || itemId === "item:potion-alt" || itemId === "item:potion-third") {
        return { itemRuleVersion, useKind: "heal-hp", magnitude: { kind: "fixed", amount: 5 } };
      }
      if (itemId === "item:revive") {
        return {
          itemRuleVersion,
          useKind: "revive-hp",
          magnitude: { kind: "max-hp-fraction", numerator: 1, denominator: 4 },
        };
      }
      return null;
    },
    async currentItemRuleAuthority() {
      return {
        itemRuleVersion: "item-rules:test",
        gameDataVersion: "game-data:test",
        rulesVersion: "rules:test",
      };
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
    app: new HuntApplication(testDatabaseUrl!, ports, {
      presentationSourceEnabled: options.presentationSourceEnabled,
    }),
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

describe("TASK-103 forward V4/V2 presentation on real PostgreSQL", () => {
  it("creates the V4/V2 stream atomically with Start and replays without duplicate presentation rows", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = applicationWithOptions({ presentationSourceEnabled: true });
    const startKey = generateUuidV7();
    const request = { huntDefinitionId: "hunt:test", teamId: seeded.teamId };

    const started = await harness.app.start(seeded.playerId, startKey, request);
    expect(started.httpStatus, JSON.stringify(started.body)).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;

    const first = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const stream = await client.query<{
        input_schema_version: string;
        checkpoint_schema_version: string;
        presentation_schema_version: string;
        status: string;
        published_event_index: string;
      }>(
        `SELECT input_schema_version, checkpoint_schema_version, presentation_schema_version,
                status, published_event_index::text
           FROM pokenexus.hunt_presentation_streams
          WHERE player_id = $1 AND hunt_id = $2`,
        [seeded.playerId, huntId],
      );
      const hunt = await loadOwnedSoloHunt(client, seeded.playerId, huntId);
      if (!hunt) throw new Error("missing presentation-enabled Hunt after Start");
      const checkpoint = await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId);
      if (!checkpoint) throw new Error("missing presentation-enabled checkpoint after Start");
      const events = await client.query<{
        event_index: string;
        public_event_json: Record<string, unknown>;
        public_event_bytes: Buffer;
        private_source_bytes: Buffer;
      }>(
        `SELECT event_index::text, public_event_json, public_event_bytes, private_source_bytes
           FROM pokenexus.hunt_presentation_events
          WHERE hunt_id = $1 ORDER BY event_index`,
        [huntId],
      );
      return { stream: stream.rows[0], checkpoint, events: events.rows };
    });

    expect(first.stream).toMatchObject({
      input_schema_version: "hunt-runtime-inputs-v4",
      checkpoint_schema_version: "pokenexus.solo-hunt-checkpoint.v4",
      presentation_schema_version: "pokenexus.combat-presentation.v2",
      status: "available",
    });
    expect(first.checkpoint.schemaVersion).toBe("pokenexus.solo-hunt-checkpoint.v4");
    expect(first.events.length).toBeGreaterThan(0);
    expect(first.stream?.published_event_index).toBe(String(first.events.length));
    expect(first.events[0]?.public_event_json).toMatchObject({ kind: "BattleStarted", sequence: 1 });
    expect(first.events[0]?.public_event_bytes).toEqual(Buffer.from(
      canonicalPresentationJson(first.events[0]!.public_event_json),
    ));
    expect(JSON.parse(first.events[0]!.private_source_bytes.toString("utf8"))).toMatchObject({
      kind: "BattleStarted",
      sequence: 1,
    });

    const replay = await harness.app.start(seeded.playerId, startKey, request);
    expect(replay).toEqual(started);
    const afterReplay = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query<{
        event_index: string;
        public_event_bytes: Buffer;
        private_source_bytes: Buffer;
      }>(
        `SELECT event_index::text, public_event_bytes, private_source_bytes
           FROM pokenexus.hunt_presentation_events
          WHERE hunt_id = $1 ORDER BY event_index`,
        [huntId],
      ).then(({ rows }) => rows));
    expect(afterReplay).toEqual(first.events.map((row) => ({
      event_index: row.event_index,
      public_event_bytes: row.public_event_bytes,
      private_source_bytes: row.private_source_bytes,
    })));

    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing presentation-enabled Hunt before continuation");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '10 seconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));
    const checkpointKey = generateUuidV7();
    const continued = await settleBoundedCommand(
      () => harness.app.checkpoint(seeded.playerId, checkpointKey, huntId),
    );
    expect(continued.httpStatus, JSON.stringify(continued.body)).toBe(200);
    const afterContinuation = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const rows = await client.query<{
        event_index: string;
        public_event_bytes: Buffer;
        private_source_bytes: Buffer;
      }>(
        `SELECT event_index::text, public_event_bytes, private_source_bytes
           FROM pokenexus.hunt_presentation_events
          WHERE hunt_id = $1 ORDER BY event_index`,
        [huntId],
      );
      const checkpoint = await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId);
      return { rows: rows.rows, checkpoint };
    });
    expect(afterContinuation.checkpoint?.schemaVersion).toBe("pokenexus.solo-hunt-checkpoint.v4");
    expect(afterContinuation.rows.length).toBeGreaterThan(first.events.length);

    const continuedReplay = await harness.app.checkpoint(seeded.playerId, checkpointKey, huntId);
    expect(continuedReplay).toEqual(continued);
    const afterContinuationReplay = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query<{
        event_index: string;
        public_event_bytes: Buffer;
        private_source_bytes: Buffer;
      }>(
        `SELECT event_index::text, public_event_bytes, private_source_bytes
           FROM pokenexus.hunt_presentation_events
          WHERE hunt_id = $1 ORDER BY event_index`,
        [huntId],
      ).then(({ rows }) => rows));
    expect(afterContinuationReplay).toEqual(afterContinuation.rows);

    const retreatKey = generateUuidV7();
    const terminal = await settleBoundedCommand(
      () => harness.app.retreat(seeded.playerId, retreatKey, huntId),
    );
    expect(terminal).toMatchObject({
      httpStatus: 200,
      body: { status: "terminal", terminalReason: "retreat" },
    });
    const sealed = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const stream = await client.query<{
        status: string;
        is_terminal: boolean;
        presentation_terminal_recorded_at: Date | null;
        presentation_terminal_recorded_at_ceil_ms: string | null;
        published_event_index: string;
      }>(
        `SELECT status, is_terminal, presentation_terminal_recorded_at,
                CEIL(EXTRACT(EPOCH FROM presentation_terminal_recorded_at) * 1000)::bigint::text
                  AS presentation_terminal_recorded_at_ceil_ms,
                published_event_index::text
           FROM pokenexus.hunt_presentation_streams
          WHERE player_id = $1 AND hunt_id = $2`,
        [seeded.playerId, huntId],
      );
      const events = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.hunt_presentation_events WHERE hunt_id = $1",
        [huntId],
      );
      return { stream: stream.rows[0], eventCount: events.rows[0]?.count };
    });
    expect(sealed.stream).toMatchObject({ status: "available", is_terminal: true });
    expect(sealed.stream?.presentation_terminal_recorded_at).toBeInstanceOf(Date);
    expect(sealed.stream?.published_event_index).toBe(sealed.eventCount);

    const terminalRecordedAt = sealed.stream?.presentation_terminal_recorded_at;
    if (!terminalRecordedAt) throw new Error("missing terminal presentation retention anchor");
    const cursorCodec = createPresentationCursorCodec("current", {
      current: new Uint8Array(32).fill(63),
    });
    const terminalCeilMs = sealed.stream?.presentation_terminal_recorded_at_ceil_ms;
    if (!terminalCeilMs) throw new Error("missing terminal presentation retention millisecond ceiling");
    const expiryMs = Number(BigInt(terminalCeilMs) + 30n * 24n * 60n * 60n * 1000n);
    const retained = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      readHuntPresentationWithConsistentSnapshot(client, {
        playerId: seeded.playerId,
        huntId,
        cursorCodec,
        nowMs: expiryMs - 1,
        limit: 1,
      }));
    expect(retained.httpStatus).toBe(200);
    expect((retained.body as { stream: { isTerminal: boolean } }).stream.isTerminal).toBe(true);
    const expired = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      readHuntPresentationWithConsistentSnapshot(client, {
        playerId: seeded.playerId,
        huntId,
        cursorCodec,
        nowMs: expiryMs,
        limit: 1,
      }));
    expect(expired).toEqual({ httpStatus: 410, body: { error: "presentation_expired" } });

    const terminalReplay = await harness.app.retreat(seeded.playerId, retreatKey, huntId);
    expect(terminalReplay).toEqual(terminal);
    const afterTerminalReplay = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const count = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.hunt_presentation_events WHERE hunt_id = $1",
        [huntId],
      );
      const stream = await client.query<{ presentation_terminal_recorded_at: Date | null }>(
        "SELECT presentation_terminal_recorded_at FROM pokenexus.hunt_presentation_streams WHERE hunt_id = $1",
        [huntId],
      );
      return { count: count.rows[0]?.count, terminalRecordedAt: stream.rows[0]?.presentation_terminal_recorded_at };
    });
    expect(afterTerminalReplay.count).toBe(sealed.eventCount);
    expect(afterTerminalReplay.terminalRecordedAt).toEqual(terminalRecordedAt);
  });

  it("publishes only the winning V4 checkpoint CAS and rolls back a late presentation abort", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = applicationWithOptions({
      presentationSourceEnabled: true,
      runtimeInputsTransform: (inputs) => ({
        ...inputs,
        context: {
          ...inputs.context,
          typeChart: {
            ...inputs.context.typeChart,
            normal: { ...(inputs.context.typeChart.normal ?? {}), normal: 0 },
          },
        },
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
    if (!hunt) throw new Error("missing V4 OCC Hunt fixture");

    const before = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => ({
      checkpoint: await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId),
      events: await client.query<{ event_index: string; private_source_bytes: Buffer }>(
        `SELECT e.event_index::text, e.private_source_bytes
           FROM pokenexus.hunt_presentation_events e
          WHERE e.hunt_id = $1 ORDER BY e.event_index`,
        [huntId],
      ).then(({ rows }) => rows),
    }));
    if (!before.checkpoint) throw new Error("missing V4 OCC checkpoint");
    const decoded = decodeSoloHuntCheckpoint(before.checkpoint.stateBytes);
    expect(decoded.accepted).toBe(true);
    if (!decoded.accepted) return;
    const advanced = advanceSoloHuntToAutomationBoundaryOrEncounterBoundaryOrCutoff(
      decoded.state,
      harness.runtime(),
      12_000,
      { skipInitialAutomationBoundary: true },
    );
    expect(advanced.accepted).toBe(true);
    if (!advanced.accepted) return;
    const emitted = advanced.events.filter((event) => event.kind === "combat");
    expect(emitted.length).toBeGreaterThan(0);
    const stateBytes = encodeSoloHuntCheckpointV4(advanced.state);

    const attempt = (expectedRowVersion: bigint, abortAfterPublish: boolean) =>
      withPgClient({ connectionString: testDatabaseUrl }, (client) =>
        withTransaction(client, async (transaction) => {
          const root = await ensureAndLockPlayerHuntRoot(transaction, seeded.playerId);
          if (!root) throw new Error("missing Player root for V4 OCC fixture");
          const persisted = await persistOwnedHuntCheckpointInTransaction(transaction, {
            playerId: seeded.playerId,
            checkpointId: hunt.checkpointId,
            expectedRowVersion,
            schemaVersion: "pokenexus.solo-hunt-checkpoint.v4",
            logicalTimeMs: advanced.state.logicalTimeMs,
            stateBytes,
          });
          if (persisted.status !== "updated") return persisted.status;
          await publishCommittedHuntPresentation({
            transaction,
            playerId: seeded.playerId,
            huntId,
            checkpointSchemaVersion: "pokenexus.solo-hunt-checkpoint.v4",
            committedState: advanced.state,
            inputs: harness.runtime(),
            generatedEvents: advanced.events,
          });
          if (abortAfterPublish) throw new Error("simulated post-publisher abort");
          return persisted.status;
        }));

    await expect(attempt(before.checkpoint.rowVersion, true))
      .rejects.toThrow("simulated post-publisher abort");
    const afterAbort = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => ({
      checkpoint: await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId),
      events: await client.query<{ event_index: string; private_source_bytes: Buffer }>(
        `SELECT e.event_index::text, e.private_source_bytes
           FROM pokenexus.hunt_presentation_events e
          WHERE e.hunt_id = $1 ORDER BY e.event_index`,
        [huntId],
      ).then(({ rows }) => rows),
    }));
    expect(afterAbort.checkpoint).toEqual(before.checkpoint);
    expect(afterAbort.events).toEqual(before.events);

    expect(await attempt(before.checkpoint.rowVersion, false)).toBe("updated");
    const winner = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => ({
      checkpoint: await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId),
      events: await client.query<{ event_index: string; private_source_bytes: Buffer }>(
        `SELECT e.event_index::text, e.private_source_bytes
           FROM pokenexus.hunt_presentation_events e
          WHERE e.hunt_id = $1 ORDER BY e.event_index`,
        [huntId],
      ).then(({ rows }) => rows),
    }));
    expect(winner.checkpoint?.rowVersion).toBe(before.checkpoint.rowVersion + 1n);
    expect(winner.checkpoint?.stateBytes).toEqual(stateBytes);
    expect(winner.events.slice(before.events.length).map((event) => event.private_source_bytes.toString("utf8")))
      .toEqual(emitted.map((event) => canonicalPresentationJson(event.event)));

    expect(await attempt(before.checkpoint.rowVersion, false)).toBe("stale");
    const afterLoser = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => ({
      checkpoint: await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId),
      events: await client.query<{ event_index: string; private_source_bytes: Buffer }>(
        `SELECT e.event_index::text, e.private_source_bytes
           FROM pokenexus.hunt_presentation_events e
          WHERE e.hunt_id = $1 ORDER BY e.event_index`,
        [huntId],
      ).then(({ rows }) => rows),
    }));
    expect(afterLoser).toEqual(winner);
  });

  it("keeps V4 PostgreSQL presentation bytes and checkpoint state identical across bounded 202 segmentation", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = applicationWithOptions({
      presentationSourceEnabled: true,
      runtimeInputsTransform: (inputs) => ({
        ...inputs,
        context: {
          ...inputs.context,
          typeChart: {
            ...inputs.context.typeChart,
            normal: { ...(inputs.context.typeChart.normal ?? {}), normal: 0 },
          },
        },
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
    if (!hunt) throw new Error("missing V4 segmented Hunt fixture");
    const initial = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => ({
      checkpoint: await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId),
      eventCount: await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.hunt_presentation_events WHERE hunt_id = $1",
        [huntId],
      ).then(({ rows }) => Number(rows[0]?.count ?? "0")),
    }));
    if (!initial.checkpoint) throw new Error("missing initial V4 segmented checkpoint");
    const decoded = decodeSoloHuntCheckpoint(initial.checkpoint.stateBytes);
    expect(decoded.accepted).toBe(true);
    if (!decoded.accepted) return;
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '70 seconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));
    const key = generateUuidV7();
    const first = await harness.app.checkpoint(seeded.playerId, key, huntId);
    expect(first).toMatchObject({ httpStatus: 202, body: { status: "in_progress" } });
    const targetLogicalTimeMs = Number((first.body as {
      progress: { targetLogicalTimeMs: string };
    }).progress.targetLogicalTimeMs);
    expect(Number.isSafeInteger(targetLogicalTimeMs)).toBe(true);
    const direct = advanceSoloHuntToEncounterBoundaryOrCutoff(
      decoded.state,
      harness.runtime(),
      targetLogicalTimeMs,
    );
    expect(direct.accepted).toBe(true);
    if (!direct.accepted) return;
    const expectedCombat = direct.events.filter((event) => event.kind === "combat");
    expect(expectedCombat.length).toBeGreaterThan(128);
    const completed = await settleBoundedCommand(
      () => harness.app.checkpoint(seeded.playerId, key, huntId),
      128,
    );
    expect(completed.httpStatus, JSON.stringify(completed.body)).toBe(200);

    const committed = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => ({
      checkpoint: await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId),
      events: await client.query<{ event_index: string; private_source_bytes: Buffer }>(
        `SELECT e.event_index::text, e.private_source_bytes
           FROM pokenexus.hunt_presentation_events e
          WHERE e.hunt_id = $1 ORDER BY e.event_index`,
        [huntId],
      ).then(({ rows }) => rows),
    }));
    expect(committed.checkpoint?.stateBytes).toEqual(encodeSoloHuntCheckpointV4(direct.state));
    const appended = committed.events.slice(initial.eventCount);
    expect(appended.map((event) => event.private_source_bytes.toString("utf8")))
      .toEqual(expectedCombat.map((event) => canonicalPresentationJson(event.event)));
    expect(new Set(committed.events.map((event) => event.event_index)).size).toBe(committed.events.length);
  }, 90_000);

  it("rehydrates a V4 Hunt in a fresh process and replays the same key without changing presentation bytes", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = applicationWithOptions({ presentationSourceEnabled: true });
    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(started.httpStatus, JSON.stringify(started.body)).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing hard-restart presentation Hunt");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '1 second' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    const checkpointKey = generateUuidV7();
    const runFreshProcess = (once: boolean) => {
      const result = spawnSync(process.execPath, [
        "--experimental-transform-types",
        fileURLToPath(new URL("./hunt-application-process-reload.mjs", import.meta.url)),
        JSON.stringify({ playerId: seeded.playerId, huntId, key: checkpointKey, once }),
      ], {
        cwd: process.cwd(),
        env: { ...process.env, POKENEXUS_TEST_DATABASE_URL: testDatabaseUrl },
        encoding: "utf8",
        timeout: 20_000,
        maxBuffer: 128 * 1024,
        windowsHide: true,
      });
      if (result.error || result.status !== 0 || result.signal !== null) {
        throw new Error(
          "TASK-103 hard-restart subprocess failed: " + (result.stderr || result.error?.message || result.status),
        );
      }
      return JSON.parse(result.stdout.trim()) as {
        pid: number;
        completed: { httpStatus: number; body: unknown };
        replay: { httpStatus: number; body: unknown } | null;
        calls: string[];
      };
    };

    const processIds = new Set<number>();
    let completedChild: ReturnType<typeof runFreshProcess> | null = null;
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const child = runFreshProcess(true);
      expect(child.pid).not.toBe(process.pid);
      expect(processIds.has(child.pid)).toBe(false);
      processIds.add(child.pid);
      expect([200, 202], JSON.stringify(child)).toContain(child.completed.httpStatus);
      expect(child.replay).toBeNull();
      expect(child.calls).toContain("loadPersistedRuntime");
      expect(child.calls).not.toContain("unexpected_authority_operation");
      if (child.completed.httpStatus === 200) {
        completedChild = child;
        break;
      }
    }
    expect(completedChild, "hard-restart bounded continuation did not converge").not.toBeNull();
    if (!completedChild) throw new Error("hard-restart bounded continuation did not converge");
    const firstSnapshot = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const checkpoint = await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId);
      const events = await client.query<{
        event_index: string;
        public_event_bytes: Buffer;
        private_source_bytes: Buffer;
      }>(
        `SELECT e.event_index::text, e.public_event_bytes, e.private_source_bytes
           FROM pokenexus.hunt_presentation_events e WHERE e.hunt_id = $1 ORDER BY e.event_index`,
        [huntId],
      );
      return { checkpoint, events: events.rows };
    });
    expect(firstSnapshot.checkpoint?.schemaVersion).toBe("pokenexus.solo-hunt-checkpoint.v4");

    const replayChild = runFreshProcess(false);
    expect(replayChild.pid).not.toBe(process.pid);
    expect(processIds.has(replayChild.pid)).toBe(false);
    expect(replayChild.completed).toEqual(completedChild.completed);
    expect(replayChild.replay).toEqual(completedChild.completed);
    const secondEvents = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query<{
        event_index: string;
        public_event_bytes: Buffer;
        private_source_bytes: Buffer;
      }>(
        `SELECT e.event_index::text, e.public_event_bytes, e.private_source_bytes
           FROM pokenexus.hunt_presentation_events e WHERE e.hunt_id = $1 ORDER BY e.event_index`,
        [huntId],
      ).then(({ rows }) => rows));
    expect(secondEvents).toEqual(firstSnapshot.events);
  });

  it("rehydrates a real published V4 authority in a fresh process only while the historical individualization release is retained", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const startup = await createTask103RealHuntAuthority({
      connectionString: testDatabaseUrl,
      current: "A",
      retainA: true,
    });
    const ownedSpeciesId = "candidate:species:pokedex-blastoise-9:76d65051f7";
    const ownedMoveId = "candidate:move:water-gun:797195321c";
    const huntDefinitionId = "hunt:verdant-edge:wilds";
    const publishedHunt = startup.published.huntsById.get(huntDefinitionId);
    if (!publishedHunt || !startup.published.speciesById.has(ownedSpeciesId)) {
      throw new Error("published real-authority Start fixture content is missing");
    }
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      withTransaction(client, async (transaction) => {
        const updated = await transaction.query(
          `UPDATE pokenexus.pokemon_instances
              SET species_id = $1, level = 1, total_experience = $2,
                  individualization_content_version = $3,
                  individualization_content_hash = $4,
                  individualization_game_data_version = $5
            WHERE owner_player_id = $6 AND pokemon_instance_id = $7`,
          [
            opaque(ownedSpeciesId),
            0,
            opaque(startup.published.contentVersion),
            opaque(startup.published.contentHash),
            opaque(startup.published.gameDataVersion),
            seeded.playerId,
            seeded.pokemonInstanceId,
          ],
        );
        expect(updated.rowCount).toBe(1);
        await transaction.query(
          `INSERT INTO pokenexus.pokemon_move_loadout
             (owner_player_id, pokemon_instance_id, slot, move_id)
           VALUES ($1, $2, 1, $3)`,
          [seeded.playerId, seeded.pokemonInstanceId, opaque(ownedMoveId)],
        );
      }));
    const neverEffect = async (): Promise<never> => {
      throw new Error("real-authority continuation must not cross a boundary effect");
    };
    const startupApp = new HuntApplication(testDatabaseUrl, {
      authority: startup.authority,
      boundaryEffects: { automaticCapture: neverEffect, reward: neverEffect },
      manualCaptureEffects: { attempt: neverEffect },
    }, { presentationSourceEnabled: true });
    expect(await startup.authority.resolveStartSelector(huntDefinitionId)).toMatchObject({
      huntDefinitionId,
      zoneId: publishedHunt.zoneId,
      gameDataVersion: startup.published.gameDataVersion,
      rulesVersion: GENETIC_COMBAT_RULES_VERSION_V1,
    });
    const started = await startupApp.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId,
      teamId: seeded.teamId,
    });
    expect(started.httpStatus, JSON.stringify(started.body)).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("real-authority Start did not commit a Hunt");
    const frozen = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => ({
      checkpoint: await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId),
      authority: await loadHuntInputAuthority(client, seeded.playerId, huntId),
    }));
    if (!frozen.checkpoint || !frozen.authority) throw new Error("real-authority V4 SQL authority is missing");
    expect(frozen.checkpoint.schemaVersion).toBe(SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V4);
    expect(frozen.authority.runtimeInputsJson).toMatchObject({
      schemaVersion: "hunt-runtime-inputs-v4",
      individualizationRequired: true,
    });
    expect(JSON.stringify(frozen.authority.runtimeInputsJson)).not.toContain("secretKey");
    const persistedInputs = await startup.authority.loadPersistedRuntime(
      frozen.authority,
      frozen.checkpoint.schemaVersion,
    );
    expect(persistedInputs.team[0]).toMatchObject({
      pokemonInstanceId: seeded.pokemonInstanceId,
      speciesId: ownedSpeciesId,
      shiny: false,
      level: 1,
      moveLoadout: [ownedMoveId],
    });
    expect(persistedInputs.individualizationAuthority?.keyId).toBe(startup.oldKeyId);

    const continuationKey = generateUuidV7();
    const targetLogicalTimeMs = frozen.checkpoint.logicalTimeMs + 1;
    const targetWallClockAt = new Date(frozen.checkpoint.logicalTimeAnchorAt.getTime() + 1);
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      withTransaction(client, async (transaction) => {
        const claimed = await claimPublicHuntCommandInTransaction(transaction, {
          playerId: seeded.playerId,
          idempotencyKey: continuationKey,
          commandKind: "checkpoint",
          intentHash: await hashNormalizedIntent({ huntId }),
          intentJson: { huntId },
          sourceHuntId: huntId,
          advancementHuntId: huntId,
          targetLogicalTimeMs,
          targetWallClockAt,
        });
        expect(claimed.status).toBe("accepted");
      }));

    const runRealChild = (retainA: boolean) => spawnSync(process.execPath, [
      "--experimental-transform-types",
      fileURLToPath(new URL("./hunt-real-authority-process-reload.mjs", import.meta.url)),
      JSON.stringify({ playerId: seeded.playerId, huntId, key: continuationKey, retainA }),
    ], {
      cwd: process.cwd(),
      env: { ...process.env, POKENEXUS_TEST_DATABASE_URL: testDatabaseUrl },
      encoding: "utf8",
      timeout: 20_000,
      maxBuffer: 128 * 1024,
      windowsHide: true,
    });
    const parseChild = (retainA: boolean) => {
      const result = runRealChild(retainA);
      if (result.error || result.status !== 0 || result.signal !== null) {
        throw new Error(
          `real runtime child failed (retainA=${retainA}): ${String(result.error ?? result.stderr).slice(0, 2000)}`,
        );
      }
      const child = JSON.parse(result.stdout.trim()) as {
        pid: number;
        calls: string[];
        completed: { httpStatus: number; body: unknown };
        replay: { httpStatus: number; body: unknown };
      };
      expect(child.pid).not.toBe(process.pid);
      expect(child.calls).toContain("real_loadPersistedRuntime");
      expect(child.calls).not.toContain("unexpected_new_authority");
      return child;
    };

    const denied = parseChild(false);
    expect(denied.calls).toContain("historical_release_A_missing");
    expect(denied.completed).toEqual({ httpStatus: 503, body: { error: "authority_unavailable" } });
    expect(denied.replay).toEqual(denied.completed);

    const allowed = parseChild(true);
    expect(allowed.calls).not.toContain("historical_release_A_missing");
    expect(allowed.completed.httpStatus, JSON.stringify(allowed)).toBe(200);
    expect(allowed.replay).toEqual(allowed.completed);
  }, 30_000);

  it("publishes zero-gap Battle N+1 only after Battle N reward disposition is committed", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = applicationWithOptions({
      presentationSourceEnabled: true,
      runtimeInputsTransform: (inputs) => {
        const playerMove = inputs.context.moveRules["move:player"];
        if (!playerMove) throw new Error("missing zero-gap player Move fixture");
        const context: ResolvedCombatContext = {
          ...inputs.context,
          moveRules: {
            ...inputs.context.moveRules,
            "move:player": { ...playerMove, power: 1_000 },
          },
        };
        return {
          ...inputs,
          context,
          opponentTemplates: inputs.opponentTemplates.map((template) => ({
            ...template,
            rulesVersion: context.rulesVersion,
            baseStats: { ...template.baseStats, hp: 10 },
          })),
          interBattleGapMs: 0,
        };
      },
      reward: async ({ transaction, playerId, boundary, inputs }) => {
        const durable = await claimRewardResolutionInTransaction(transaction, {
          subjectPlayerId: playerId,
          sourceAuthority: "task103:zero-gap-v4-presentation-fixture",
          sourceCorrelation: boundary.encounterId,
          gameDataVersion: inputs.context.gameDataVersion,
          rulesVersion: inputs.context.rulesVersion,
          effects: [],
        });
        if (!durable.resolution.completion) {
          await insertRewardCompletion(transaction, durable.resolution.resolutionId, new Date());
        }
        return {
          rewardResolutionId: durable.resolution.resolutionId,
          reward: { playerExperience: 0n, pokemonExperience: [], items: [] },
        };
      },
    });
    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(started.httpStatus, JSON.stringify(started.body)).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing zero-gap V4 Hunt fixture");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '500 seconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    const snapshot = () => withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const boundaries = await client.query<{
        encounter_ordinal: string;
        boundary_status: string;
        reward_resolution_id: string | null;
      }>(
        `SELECT encounter_ordinal::text, boundary_status, reward_resolution_id
           FROM pokenexus.hunt_encounter_boundaries
          WHERE hunt_id = $1 ORDER BY encounter_ordinal`,
        [huntId],
      );
      const battles = await client.query<{
        encounter_ordinal: string;
        battle_id: string;
      }>(
        `SELECT encounter_ordinal::text, battle_id
           FROM pokenexus.hunt_presentation_battles
          WHERE hunt_id = $1 ORDER BY encounter_ordinal`,
        [huntId],
      );
      return { boundaries: boundaries.rows, battles: battles.rows };
    });
    const initial = await snapshot();
    expect(initial.boundaries).toHaveLength(0);
    expect(initial.battles).toHaveLength(1);

    const checkpointKey = generateUuidV7();
    let second: Awaited<ReturnType<typeof snapshot>> | null = null;
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const response = await harness.app.checkpoint(seeded.playerId, checkpointKey, huntId);
      expect([200, 202], JSON.stringify(response.body)).toContain(response.httpStatus);
      const current = await snapshot();
      expect(current.battles[0]).toEqual(initial.battles[0]);
      if (current.battles.length >= 2) {
        expect(current.boundaries[0]).toMatchObject({
          encounter_ordinal: "1",
          boundary_status: "committed",
          reward_resolution_id: expect.any(String),
        });
        second = current;
        break;
      }
      expect(response.httpStatus).toBe(202);
    }
    if (!second) throw new Error("zero-gap V4 Battle 2 did not publish within 32 bounded steps");
    expect(second.battles.slice(0, 2).map(({ encounter_ordinal }) => encounter_ordinal))
      .toEqual(["1", "2"]);

    const ledger = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const checkpoint = await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId);
      const events = await client.query<{
        event_index: string;
        battle_id: string;
        sequence: string;
        combat_time_ms: string;
        private_source_bytes: Buffer;
      }>(
        `SELECT event_index::text, battle_id, sequence::text, combat_time_ms::text, private_source_bytes
           FROM pokenexus.hunt_presentation_events
          WHERE hunt_id = $1 ORDER BY event_index`,
        [huntId],
      );
      return { checkpoint, events: events.rows };
    });
    expect(ledger.checkpoint?.schemaVersion).toBe("pokenexus.solo-hunt-checkpoint.v4");
    const firstBattleId = second.battles[0]!.battle_id;
    const secondBattleId = second.battles[1]!.battle_id;
    const firstEndIndex = ledger.events.findLastIndex(({ battle_id }) => battle_id === firstBattleId);
    const secondStartIndex = ledger.events.findIndex(({ battle_id }) => battle_id === secondBattleId);
    expect(firstEndIndex).toBeGreaterThanOrEqual(0);
    expect(secondStartIndex).toBe(firstEndIndex + 1);
    expect(ledger.events[firstEndIndex]?.private_source_bytes.toString("utf8"))
      .toContain('"kind":"BattleEnded"');
    expect(ledger.events[secondStartIndex]).toMatchObject({
      sequence: "1",
      combat_time_ms: "0",
      battle_id: secondBattleId,
    });
    expect(ledger.events[secondStartIndex]?.private_source_bytes.toString("utf8"))
      .toContain('"kind":"BattleStarted"');
  });
});

describe("TASK-038 HuntApplication PostgreSQL healing lifecycle", () => {
  it("TASK-122 rejects foreign Team Start and foreign Hunt mutations without changing gameplay state", async () => {
    const owner = await seedPlayerTeamAndPotion();
    const other = await seedPlayerTeamAndPotion();
    const harness = application();
    const started = await harness.app.start(owner.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test", teamId: owner.teamId,
    });
    expect(started.httpStatus, JSON.stringify(started.body)).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      withTransaction(client, (transaction) => ensureAndLockPlayerHuntRoot(transaction, other.playerId)));
    const snapshot = () => withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const result: Record<string, unknown> = {};
      for (const table of [
        "player_hunt_roots", "solo_hunts", "hunt_checkpoints", "hunt_input_authorities",
        "player_inventories", "inventory_entries", "pokemon_instances", "pokemon_vitalities",
      ]) {
        const rows = await client.query(`SELECT coalesce(
          jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb
        ) AS rows FROM pokenexus.${table} t`);
        result[table] = rows.rows[0]?.rows;
      }
      return result;
    });
    const before = await snapshot();
    const startKey = generateUuidV7();
    const checkpointKey = generateUuidV7();
    const retreatKey = generateUuidV7();
    const commands = [
      () => harness.app.start(other.playerId, startKey, { huntDefinitionId: "hunt:test", teamId: owner.teamId }),
      () => harness.app.checkpoint(other.playerId, checkpointKey, huntId),
      () => harness.app.retreat(other.playerId, retreatKey, huntId),
    ];
    for (const command of commands) {
      expect(await command()).toMatchObject({ httpStatus: 404, body: { error: "not_found" } });
      expect(await command()).toMatchObject({ httpStatus: 404, body: { error: "not_found" } });
    }
    expect(await snapshot()).toEqual(before);
  });

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
    expect(started.httpStatus, JSON.stringify(started.body)).toBe(200);
    expect(harness.runtime().initialHpByPokemonInstanceId)
      .toEqual({ [seeded.pokemonInstanceId]: 17 });
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '1 millisecond' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.pokemon_vitalities SET current_hp = 50, row_version = row_version + 1 WHERE owner_player_id = $1 AND pokemon_instance_id = $2",
        [seeded.playerId, seeded.pokemonInstanceId],
      ).then(() => undefined));

    const retreatKey = generateUuidV7();
    const retreat = await settleBoundedCommand(
      () => harness.app.retreat(seeded.playerId, retreatKey, huntId),
    );
    expect(retreat).toMatchObject({
      httpStatus: 200,
      body: {
        status: "terminal",
        terminalReason: "retreat",
        recoveryReadyAt: expect.any(String),
      },
    });
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadRetreatAbandonment(client, { playerId: seeded.playerId, huntId }))).toBeNull();
    const recoveryReadyAt = (retreat.body as { recoveryReadyAt: string }).recoveryReadyAt;
    const terminalCheckpoint = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!terminalCheckpoint) throw new Error("missing terminal vitality checkpoint");
    const terminalState = decodeSoloHuntCheckpoint(terminalCheckpoint.stateBytes);
    expect(terminalState.accepted).toBe(true);
    if (!terminalState.accepted) return;
    const terminalActivation = terminalState.state.currentEncounter?.participantActivations.find(
      ({ pokemonInstanceId }) => pokemonInstanceId === seeded.pokemonInstanceId,
    );
    if (!terminalActivation || !terminalState.state.currentEncounter) {
      throw new Error("missing terminal active Pokémon provenance");
    }
    const terminalHp = terminalState.state.currentEncounter.battle.combatants[
      terminalActivation.combatantId
    ]?.currentHp;
    expect(terminalHp).toEqual(expect.any(Number));
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPokemonVitality(client, seeded.playerId, seeded.pokemonInstanceId)))
      .toMatchObject({ currentHp: terminalHp, rowVersion: 2n });

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
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '1 millisecond' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    const retreatKey = generateUuidV7();
    expect((await settleBoundedCommand(
      () => harness.app.retreat(seeded.playerId, retreatKey, huntId),
    )).httpStatus).toBe(200);
    expect(await harness.app.healAtPokeCenter(
      seeded.playerId,
      centerKey,
      { teamId: seeded.teamId },
    )).toEqual({ httpStatus: 409, body: { error: "hunt_active" } });
    const terminalVitality = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPokemonVitality(client, seeded.playerId, seeded.pokemonInstanceId));
    expect(terminalVitality?.rowVersion).toBe(1n);
    expect(terminalVitality?.currentHp).toBeGreaterThanOrEqual(0);
    expect(terminalVitality?.currentHp).toBeLessThanOrEqual(17);

    expect((await harness.app.healAtPokeCenter(
      seeded.playerId,
      generateUuidV7(),
      { teamId: seeded.teamId },
    )).httpStatus).toBe(200);
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPokemonVitality(client, seeded.playerId, seeded.pokemonInstanceId)))
      .toMatchObject({ currentHp: 60, rowVersion: 2n });
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
    expect(started.httpStatus, JSON.stringify(started.body)).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '10 seconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    const checkpointKey = generateUuidV7();
    const terminal = await settleBoundedCommand(
      () => harness.app.checkpoint(seeded.playerId, checkpointKey, huntId),
    );
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
    const decoded = decodeSoloHuntCheckpoint(checkpoint.stateBytes);
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
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '1 millisecond' WHERE checkpoint_id = $1",
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
        const retreatKey = generateUuidV7();
        const retreat = settleBoundedCommand(
          () => harness.app.retreat(seeded.playerId, retreatKey, huntId),
        );
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
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '1 millisecond' WHERE checkpoint_id = $1",
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
        const retreatKey = generateUuidV7();
        const retreat = settleBoundedCommand(
          () => harness.app.retreat(seeded.playerId, retreatKey, huntId),
        );
        await control.query("SELECT pg_advisory_unlock(108001)");

        expect(await center).toEqual({ httpStatus: 409, body: { error: "hunt_active" } });
        expect((await retreat).httpStatus).toBe(200);
        expect(await harness.app.healAtPokeCenter(
          seeded.playerId,
          centerKey,
          { teamId: seeded.teamId },
        )).toEqual({ httpStatus: 409, body: { error: "hunt_active" } });
        const terminalCheckpoint = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
          loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
        if (!terminalCheckpoint) throw new Error("missing concurrent terminal checkpoint");
        const terminalState = decodeSoloHuntCheckpoint(terminalCheckpoint.stateBytes);
        expect(terminalState.accepted).toBe(true);
        if (!terminalState.accepted) return;
        const terminalActivation = terminalState.state.currentEncounter?.participantActivations.find(
          ({ pokemonInstanceId }) => pokemonInstanceId === seeded.pokemonInstanceId,
        );
        if (!terminalActivation || !terminalState.state.currentEncounter) {
          throw new Error("missing concurrent terminal active Pokémon provenance");
        }
        const terminalHp = terminalState.state.currentEncounter.battle.combatants[
          terminalActivation.combatantId
        ]?.currentHp;
        expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
          loadPokemonVitality(client, seeded.playerId, seeded.pokemonInstanceId)))
          .toMatchObject({ currentHp: terminalHp, rowVersion: 1n });
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
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '1 millisecond' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      );
    });

    const retreatKey = generateUuidV7();
    const retreat = await settleBoundedCommand(
      () => harness.app.retreat(seeded.playerId, retreatKey, huntId),
    );
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
    const firstDecoded = decodeSoloHuntCheckpoint(firstCheckpoint.stateBytes);
    if (!firstDecoded.accepted || !firstDecoded.state.pendingEncounterSelection) {
      throw new Error("first Hunt lacks a pending selection");
    }
    const originalPending = firstDecoded.state.pendingEncounterSelection;

    const retreatKey = generateUuidV7();
    const retreat = await settleBoundedCommand(
      () => harness.app.retreat(seeded.playerId, retreatKey, firstHuntId),
    );
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
    const secondDecoded = decodeSoloHuntCheckpoint(secondCheckpoint.stateBytes);
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
    const retreatKey = generateUuidV7();
    const retreat = await settleBoundedCommand(
      () => harness.app.retreat(seeded.playerId, retreatKey, firstHuntId),
    );
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

  it("batches an active-Hunt Capture policy prelude without changing its prospective boundary", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    const initial = await harness.app.replaceAutoCapturePolicy(seeded.playerId, generateUuidV7(), {
      expectedRowVersion: "0",
      enabled: false,
      balls: [],
      rules: [],
    });
    expect(initial).toMatchObject({ httpStatus: 200, body: { policy: { rowVersion: "1", enabled: false } } });

    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(started.httpStatus).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing active Capture policy Hunt fixture");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '200 milliseconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    const key = generateUuidV7();
    let attempts = 0;
    let replaced: Awaited<ReturnType<typeof harness.app.replaceAutoCapturePolicy>> | null = null;
    for (; attempts < 8; attempts += 1) {
      replaced = await harness.app.replaceAutoCapturePolicy(seeded.playerId, key, {
        expectedRowVersion: "1",
        enabled: false,
        balls: [],
        rules: [],
      });
      if (replaced.httpStatus !== 202) break;
    }
    expect(replaced).toMatchObject({
      httpStatus: 200,
      body: {
        policy: { rowVersion: "2", enabled: false },
        effectiveAt: { huntId, logicalTimeMs: expect.any(String) },
      },
    });
    expect(attempts + 1).toBeLessThanOrEqual(2);
  });

  it("settles a routine Capture policy replacement across roughly seven seconds of Hunt lag within two requests", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    expect(await harness.app.replaceAutoCapturePolicy(seeded.playerId, generateUuidV7(), {
      expectedRowVersion: "0",
      enabled: false,
      balls: [],
      rules: [],
    })).toMatchObject({ httpStatus: 200, body: { policy: { rowVersion: "1" } } });

    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing seven-second policy benchmark Hunt fixture");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '7 seconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    const key = generateUuidV7();
    let attempts = 0;
    let replaced: Awaited<ReturnType<typeof harness.app.replaceAutoCapturePolicy>> | null = null;
    for (; attempts < 16; attempts += 1) {
      replaced = await harness.app.replaceAutoCapturePolicy(seeded.playerId, key, {
        expectedRowVersion: "1",
        enabled: false,
        balls: [],
        rules: [],
      });
      if (replaced.httpStatus !== 202) break;
    }
    expect(replaced?.httpStatus).toBe(200);
    expect(attempts + 1).toBeLessThanOrEqual(2);
  });

  it("TASK-122 saves disabled Auto-Potion configuration and replays without spending Inventory", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    const inventory = () => withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadInventory(client, seeded.playerId));
    const before = await inventory();
    const key = generateUuidV7();
    const input = parseAutoPotionPolicyReplaceBody(JSON.stringify({
      expectedRowVersion: "0", enabled: false, thresholdPercent: 50,
      orderedItems: [{ itemId: "item:potion", autoUseEnabled: true, minimumReserve: "2" }],
    }));
    const saved = await harness.app.replaceAutoPotionPolicy(seeded.playerId, key, input);
    expect(saved).toMatchObject({ httpStatus: 200, body: { policy: {
      policyVersion: expect.any(String), rowVersion: "1", enabled: false,
      thresholdPercent: 50, orderedItems: input.orderedItems,
    }, effectiveAt: null } });
    expect(await harness.app.replaceAutoPotionPolicy(seeded.playerId, key, input)).toEqual(saved);
    expect(await harness.app.getAutoPotionPolicy(seeded.playerId)).toMatchObject({
      httpStatus: 200, body: { rowVersion: "1", enabled: false, thresholdPercent: 50, orderedItems: input.orderedItems },
    });
    expect(await inventory()).toEqual(before);

    for (const [expectedRowVersion, enabled, orderedItems] of [
      ["1", false, []],
      ["2", true, input.orderedItems],
      ["3", false, input.orderedItems],
    ] as const) {
      const result = await harness.app.replaceAutoPotionPolicy(seeded.playerId, generateUuidV7(), {
        expectedRowVersion, enabled, thresholdPercent: 30, orderedItems,
      });
      expect(result).toMatchObject({ httpStatus: 200, body: { policy: {
        rowVersion: (BigInt(expectedRowVersion) + 1n).toString(), enabled, thresholdPercent: 30, orderedItems,
      }, effectiveAt: null } });
      expect(await inventory()).toEqual(before);
    }
  });

  it("rejects automation minimum reserve above currently owned quantity and accepts the exact owned bound", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    await addInventoryItem(seeded.playerId, "item:revive", 5n);
    await addInventoryItem(seeded.playerId, "item:poke-ball", 2n);
    const harness = applicationWithOptions({
      ballAuthority: {
        version: "balls:test",
        balls: [{ itemId: "item:poke-ball", powerQuarterUnits: 4, premium: false }],
      },
    });

    expect(await harness.app.replaceAutoPotionPolicy(
      seeded.playerId,
      generateUuidV7(),
      {
        expectedRowVersion: "0",
        enabled: true,
        thresholdPercent: 50,
        orderedItems: [{ itemId: "item:potion", autoUseEnabled: true, minimumReserve: "4" }],
      },
    )).toEqual({ httpStatus: 422, body: { error: "automation_policy_invalid" } });
    expect(await harness.app.getAutoPotionPolicy(seeded.playerId)).toMatchObject({
      httpStatus: 200,
      body: { rowVersion: "0", policyVersion: null },
    });

    expect(await harness.app.replaceAutoRevivePolicy(
      seeded.playerId,
      generateUuidV7(),
      {
        expectedRowVersion: "0",
        enabled: true,
        orderedItems: [{ itemId: "item:revive", autoUseEnabled: true, minimumReserve: "6" }],
      },
    )).toEqual({ httpStatus: 422, body: { error: "automation_policy_invalid" } });
    expect(await harness.app.getAutoRevivePolicy(seeded.playerId)).toMatchObject({
      httpStatus: 200,
      body: { rowVersion: "0", policyVersion: null },
    });

    expect(await harness.app.replaceAutoCapturePolicy(
      seeded.playerId,
      generateUuidV7(),
      {
        expectedRowVersion: "0",
        enabled: false,
        balls: [{ itemId: "item:poke-ball", autoUseEnabled: true, minimumReserve: "3" }],
        rules: [],
      },
    )).toEqual({ httpStatus: 422, body: { error: "auto_capture_policy_invalid" } });
    expect(await harness.app.getAutoCapturePolicy(seeded.playerId)).toMatchObject({
      httpStatus: 200,
      body: { rowVersion: "0", policyVersion: null },
    });

    expect(await harness.app.replaceAutoPotionPolicy(
      seeded.playerId,
      generateUuidV7(),
      {
        expectedRowVersion: "0",
        enabled: true,
        thresholdPercent: 50,
        orderedItems: [{ itemId: "item:potion", autoUseEnabled: true, minimumReserve: "3" }],
      },
    )).toMatchObject({ httpStatus: 200, body: { policy: { rowVersion: "1" } } });
    expect(await harness.app.replaceAutoRevivePolicy(
      seeded.playerId,
      generateUuidV7(),
      {
        expectedRowVersion: "0",
        enabled: true,
        orderedItems: [{ itemId: "item:revive", autoUseEnabled: true, minimumReserve: "5" }],
      },
    )).toMatchObject({ httpStatus: 200, body: { policy: { rowVersion: "1" } } });
    expect(await harness.app.replaceAutoCapturePolicy(
      seeded.playerId,
      generateUuidV7(),
      {
        expectedRowVersion: "0",
        enabled: false,
        balls: [{ itemId: "item:poke-ball", autoUseEnabled: true, minimumReserve: "2" }],
        rules: [],
      },
    )).toMatchObject({ httpStatus: 200, body: { policy: { rowVersion: "1" } } });
  });

  it("persists Potion/Revive policies with exact no-saved sentinels, OCC, and Start-pinned authority", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();

    expect(await harness.app.getAutoPotionPolicy(seeded.playerId)).toEqual({
      httpStatus: 200,
      body: {
        policyVersion: null,
        rowVersion: "0",
        enabled: false,
        thresholdPercent: null,
        orderedItems: [],
      },
    });
    expect(await harness.app.getAutoRevivePolicy(seeded.playerId)).toEqual({
      httpStatus: 200,
      body: {
        policyVersion: null,
        rowVersion: "0",
        enabled: false,
        orderedItems: [],
      },
    });

    const potion = await harness.app.replaceAutoPotionPolicy(
      seeded.playerId,
      generateUuidV7(),
      {
        expectedRowVersion: "0",
        enabled: true,
        thresholdPercent: 50,
        orderedItems: [{ itemId: "item:potion", autoUseEnabled: true, minimumReserve: "2" }],
      },
    );
    expect(potion).toMatchObject({
      httpStatus: 200,
      body: {
        policy: {
          policyVersion: expect.any(String),
          rowVersion: "1",
          itemRuleVersion: "item-rules:test",
          gameDataVersion: "game-data:test",
          rulesVersion: "rules:test",
          enabled: true,
          thresholdPercent: 50,
          orderedItems: [{ itemId: "item:potion", autoUseEnabled: true, minimumReserve: "2" }],
        },
        effectiveAt: null,
      },
    });
    const potionPolicy = (potion.body as { policy: { policyVersion: string } }).policy;

    expect(await harness.app.replaceAutoPotionPolicy(
      seeded.playerId,
      generateUuidV7(),
      {
        expectedRowVersion: "0",
        enabled: false,
        thresholdPercent: 40,
        orderedItems: [],
      },
    )).toEqual({ httpStatus: 409, body: { error: "stale" } });

    const revive = await harness.app.replaceAutoRevivePolicy(
      seeded.playerId,
      generateUuidV7(),
      {
        expectedRowVersion: "0",
        enabled: true,
        orderedItems: [{ itemId: "item:revive", autoUseEnabled: true, minimumReserve: "0" }],
      },
    );
    expect(revive).toMatchObject({
      httpStatus: 200,
      body: {
        policy: {
          policyVersion: expect.any(String),
          rowVersion: "1",
          itemRuleVersion: "item-rules:test",
          gameDataVersion: "game-data:test",
          rulesVersion: "rules:test",
          enabled: true,
          orderedItems: [{ itemId: "item:revive", autoUseEnabled: true, minimumReserve: "0" }],
        },
        effectiveAt: null,
      },
    });
    const revivePolicy = (revive.body as { policy: { policyVersion: string } }).policy;

    expect(await harness.app.getAutoPotionPolicy(seeded.playerId)).toMatchObject({
      httpStatus: 200,
      body: { policyVersion: potionPolicy.policyVersion, rowVersion: "1", enabled: true },
    });
    expect(await harness.app.getAutoRevivePolicy(seeded.playerId)).toMatchObject({
      httpStatus: 200,
      body: { policyVersion: revivePolicy.policyVersion, rowVersion: "1", enabled: true },
    });

    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(started.httpStatus, JSON.stringify(started.body)).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    const checkpoint = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!checkpoint) throw new Error("missing Hunt checkpoint fixture");
    const decoded = decodeSoloHuntCheckpoint(checkpoint.stateBytes);
    expect(decoded.accepted).toBe(true);
    if (!decoded.accepted) return;
    expect(decoded.state.automationPolicies).toEqual({
      capture: { policyVersion: null, rowVersion: "0", enabled: false },
      potion: {
        policyVersion: potionPolicy.policyVersion,
        rowVersion: "1",
        enabled: true,
        thresholdPercent: 50,
        orderedItems: [{ itemId: "item:potion", autoUseEnabled: true, minimumReserve: "2" }],
      },
      revive: {
        policyVersion: revivePolicy.policyVersion,
        rowVersion: "1",
        enabled: true,
        orderedItems: [{ itemId: "item:revive", autoUseEnabled: true, minimumReserve: "0" }],
      },
    });
  });

  it("reconciles an active Hunt to one frozen cutoff before applying a Potion policy prospectively", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    const initial = await harness.app.replaceAutoPotionPolicy(
      seeded.playerId,
      generateUuidV7(),
      {
        expectedRowVersion: "0",
        enabled: false,
        thresholdPercent: 90,
        orderedItems: [{ itemId: "item:potion", autoUseEnabled: true, minimumReserve: "0" }],
      },
    );
    expect(initial.httpStatus).toBe(200);
    const initialVersion = (initial.body as { policy: { policyVersion: string } }).policy.policyVersion;

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
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '200 milliseconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    const key = generateUuidV7();
    let replaced: Awaited<ReturnType<typeof harness.app.replaceAutoPotionPolicy>> | null = null;
    let replaceAttempts = 0;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      replaceAttempts += 1;
      replaced = await harness.app.replaceAutoPotionPolicy(
        seeded.playerId,
        key,
        {
          expectedRowVersion: "1",
          enabled: true,
          thresholdPercent: 30,
          orderedItems: [{ itemId: "item:potion", autoUseEnabled: true, minimumReserve: "1" }],
        },
      );
      if (replaced.httpStatus === 200) break;
      expect(replaced.httpStatus).toBe(202);
    }
    expect(replaced).toMatchObject({
      httpStatus: 200,
      body: {
        policy: {
          policyVersion: expect.any(String),
          rowVersion: "2",
          enabled: true,
          thresholdPercent: 30,
        },
        effectiveAt: { huntId, logicalTimeMs: expect.any(String) },
      },
    });
    expect(replaceAttempts).toBeLessThanOrEqual(2);
    const result = replaced!.body as {
      policy: { policyVersion: string };
      effectiveAt: { huntId: string; logicalTimeMs: string };
    };
    const effectiveLogicalTimeMs = Number(result.effectiveAt.logicalTimeMs);
    expect(effectiveLogicalTimeMs).toBeGreaterThan(0);

    const intervalAuthority = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => ({
      before: await loadEffectiveAutoPotionPolicyVersion(client, huntId, effectiveLogicalTimeMs - 1),
      at: await loadEffectiveAutoPotionPolicyVersion(client, huntId, effectiveLogicalTimeMs),
      reviveAt: await loadEffectiveAutoRevivePolicyVersion(client, huntId, effectiveLogicalTimeMs),
      checkpoint: await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId),
      command: await loadPublicHuntCommand(client, seeded.playerId, key),
    }));
    expect(intervalAuthority.before).toBe(initialVersion);
    expect(intervalAuthority.at).toBe(result.policy.policyVersion);
    expect(intervalAuthority.reviveAt).toBeNull();
    expect(intervalAuthority.checkpoint?.logicalTimeMs).toBe(effectiveLogicalTimeMs);
    expect(intervalAuthority.command).toMatchObject({
      status: "terminal",
      targetLogicalTimeMs: effectiveLogicalTimeMs,
      targetWallClockAt: expect.any(Date),
    });
  });

  it("keeps a concurrent Potion policy edit prospective against an already-frozen Hunt advancement", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      createPokemonVitalityInTransaction(client, {
        ownerPlayerId: seeded.playerId,
        pokemonInstanceId: seeded.pokemonInstanceId,
        currentHp: 17,
        now: new Date(),
      }));
    const runtimeEntered = deferred();
    const releaseRuntime = deferred();
    let pauseRuntime = false;
    const harness = applicationWithOptions({
      beforeLoadPersistedRuntime: async () => {
        if (!pauseRuntime) return;
        pauseRuntime = false;
        runtimeEntered.resolve();
        await releaseRuntime.promise;
      },
    });
    const initial = await harness.app.replaceAutoPotionPolicy(
      seeded.playerId,
      generateUuidV7(),
      {
        expectedRowVersion: "0",
        enabled: false,
        thresholdPercent: 90,
        orderedItems: [{ itemId: "item:potion", autoUseEnabled: true, minimumReserve: "0" }],
      },
    );
    expect(initial.httpStatus).toBe(200);
    const initialVersion = (initial.body as { policy: { policyVersion: string } }).policy.policyVersion;

    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(started.httpStatus).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing concurrent policy Hunt fixture");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '200 milliseconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    pauseRuntime = true;
    const checkpointKey = generateUuidV7();
    const frozenAdvance = harness.app.checkpoint(seeded.playerId, checkpointKey, huntId);
    await runtimeEntered.promise;

    const policyKey = generateUuidV7();
    let replacement: Awaited<ReturnType<typeof harness.app.replaceAutoPotionPolicy>> | null = null;
    let replacementAttempts = 0;
    for (let attempt = 0; attempt < 32; attempt += 1) {
      replacementAttempts += 1;
      replacement = await harness.app.replaceAutoPotionPolicy(
        seeded.playerId,
        policyKey,
        {
          expectedRowVersion: "1",
          enabled: true,
          thresholdPercent: 90,
          orderedItems: [{ itemId: "item:potion", autoUseEnabled: true, minimumReserve: "0" }],
        },
      );
      if (replacement.httpStatus !== 202) break;
    }
    expect(replacement).toMatchObject({
      httpStatus: 200,
      body: {
        policy: { rowVersion: "2", enabled: true, policyVersion: expect.any(String) },
        effectiveAt: { huntId, logicalTimeMs: expect.any(String) },
      },
    });
    expect(replacementAttempts).toBeLessThanOrEqual(8);
    releaseRuntime.resolve();
    const overtaken = await frozenAdvance;
    expect([200, 202, 409]).toContain(overtaken.httpStatus);

    const policyResult = replacement!.body as {
      policy: { policyVersion: string };
      effectiveAt: { huntId: string; logicalTimeMs: string };
    };
    const effectiveLogicalTimeMs = Number(policyResult.effectiveAt.logicalTimeMs);
    const durable = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => ({
      before: effectiveLogicalTimeMs > 0
        ? await loadEffectiveAutoPotionPolicyVersion(client, huntId, effectiveLogicalTimeMs - 1)
        : null,
      at: await loadEffectiveAutoPotionPolicyVersion(client, huntId, effectiveLogicalTimeMs),
      uses: await loadAutomationItemUsesForEncounter(client, {
        playerId: seeded.playerId,
        huntId,
        encounterOrdinal: 1,
      }),
      inventory: await loadInventory(client, seeded.playerId),
    }));
    if (effectiveLogicalTimeMs > 0) expect(durable.before).toBe(initialVersion);
    expect(durable.at).toBe(policyResult.policy.policyVersion);
    expect(durable.uses).toEqual([]);
    expect(durable.inventory?.entries.find(({ itemId }) => itemId === "item:potion")?.quantity).toBe(3n);
  });

  it("joins a pending policy target when Hunt advancement freezes after the policy command", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = application();
    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing policy-first Hunt fixture");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '500 milliseconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));
    const checkpoint = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!checkpoint) throw new Error("missing policy-first checkpoint fixture");

    const policyIntent = {
      policyFamily: "potion",
      expectedRowVersion: "0",
      enabled: false,
      thresholdPercent: 90,
      orderedItems: [{ itemId: "item:potion", autoUseEnabled: true, minimumReserve: "0" }],
    };
    const policyTargetLogicalTimeMs = checkpoint.logicalTimeMs + 200;
    const policyTargetWallClockAt = new Date(checkpoint.logicalTimeAnchorAt.getTime() + 200);
    const policyKey = generateUuidV7();
    const policyIntentHash = await hashNormalizedIntent(policyIntent);
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, seeded.playerId);
        if (!root) throw new Error("missing policy-first Player Hunt root");
        const claimed = await claimPublicHuntCommandInTransaction(transaction, {
          playerId: seeded.playerId,
          idempotencyKey: policyKey,
          commandKind: "policy_replace",
          intentHash: policyIntentHash,
          intentJson: policyIntent,
          advancementHuntId: huntId,
          targetLogicalTimeMs: policyTargetLogicalTimeMs,
          targetWallClockAt: policyTargetWallClockAt,
        });
        expect(claimed.status).toBe("accepted");
      }));

    const syncKey = generateUuidV7();
    const advanced = await harness.app.checkpoint(seeded.playerId, syncKey, huntId);
    expect([200, 202]).toContain(advanced.httpStatus);
    const syncCommand = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPublicHuntCommand(client, seeded.playerId, syncKey));
    expect(syncCommand?.targetLogicalTimeMs).toBe(policyTargetLogicalTimeMs);
    expect(syncCommand?.targetWallClockAt?.getTime()).toBe(policyTargetWallClockAt.getTime());
  });

  it("reselects Auto-Potion fallback from locked Inventory after a snapshot race while honoring minimumReserve", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    await addInventoryItem(seeded.playerId, "item:potion-alt", 1n);
    await addInventoryItem(seeded.playerId, "item:potion-third", 1n);
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      createPokemonVitalityInTransaction(client, {
        ownerPlayerId: seeded.playerId,
        pokemonInstanceId: seeded.pokemonInstanceId,
        currentHp: 17,
        now: new Date(),
      }));

    let raceArmed = false;
    let racedInventory = false;
    const harness = applicationWithOptions({
      beforeItemRule: async (itemId) => {
        if (!raceArmed || racedInventory || itemId !== "item:potion-alt") return;
        racedInventory = true;
        await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
          const inventory = await loadInventory(client, seeded.playerId);
          if (!inventory) throw new Error("missing Inventory race fixture");
          const removed = await withTransaction(client, (transaction) =>
            removeInventoryEntriesInTransaction(transaction, {
              playerId: seeded.playerId,
              expectedRowVersion: inventory.rowVersion,
              removals: [{ itemId: "item:potion-alt", quantity: 1n }],
              now: new Date(),
            }));
          expect(removed.status).toBe("updated");
        });
      },
    });
    expect(await harness.app.replaceAutoPotionPolicy(
      seeded.playerId,
      generateUuidV7(),
      {
        expectedRowVersion: "0",
        enabled: true,
        thresholdPercent: 90,
        orderedItems: [
          { itemId: "item:potion", autoUseEnabled: true, minimumReserve: "3" },
          { itemId: "item:potion-alt", autoUseEnabled: true, minimumReserve: "0" },
          { itemId: "item:potion-third", autoUseEnabled: true, minimumReserve: "0" },
        ],
      },
    )).toMatchObject({ httpStatus: 200, body: { policy: { rowVersion: "1", enabled: true } } });

    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(started.httpStatus).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Auto-Potion fallback Hunt");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '100 milliseconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    raceArmed = true;
    const key = generateUuidV7();
    let uses = [] as Awaited<ReturnType<typeof loadAutomationItemUsesForEncounter>>;
    for (let attempt = 0; attempt < 16 && uses.length === 0; attempt += 1) {
      const result = await harness.app.checkpoint(seeded.playerId, key, huntId);
      expect([200, 202]).toContain(result.httpStatus);
      uses = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
        loadAutomationItemUsesForEncounter(client, {
          playerId: seeded.playerId,
          huntId,
          encounterOrdinal: 1,
        }));
    }

    expect(racedInventory).toBe(true);
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatchObject({
      automationFamily: "potion",
      phase: "battle",
      itemId: "item:potion-third",
    });
    const inventory = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadInventory(client, seeded.playerId));
    expect(inventory?.entries.find(({ itemId }) => itemId === "item:potion")?.quantity).toBe(3n);
    expect(inventory?.entries.find(({ itemId }) => itemId === "item:potion-alt")).toBeUndefined();
    expect(inventory?.entries.find(({ itemId }) => itemId === "item:potion-third")).toBeUndefined();
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
    let checkpointImmediatelyBeforeFailure = before;
    let failed: { readonly httpStatus: number; readonly body: unknown } | null = null;
    for (let attempt = 0; attempt < 128; attempt += 1) {
      const immediatelyBefore = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
        loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
      if (!immediatelyBefore) throw new Error("missing checkpoint before unavailable boundary");
      const result = await harness.app.checkpoint(seeded.playerId, key, huntId);
      if (result.httpStatus === 202) continue;
      checkpointImmediatelyBeforeFailure = immediatelyBefore;
      failed = result;
      break;
    }
    expect(failed).toEqual({ httpStatus: 503, body: { error: "authority_unavailable" } });
    const afterFailure = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => ({
      checkpoint: await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId),
      boundary: await loadEarliestIncompleteEncounterBoundary(client, huntId),
    }));
    expect(afterFailure.checkpoint?.rowVersion).toBe(checkpointImmediatelyBeforeFailure.rowVersion);
    expect(afterFailure.checkpoint?.logicalTimeMs).toBe(checkpointImmediatelyBeforeFailure.logicalTimeMs);
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
      pendingManualCapture: await loadPendingManualCapture(client, seeded.playerId),
    }));
    expect(afterRetry.checkpoint?.rowVersion).toBeGreaterThan(before.rowVersion);
    expect(afterRetry.boundary).toMatchObject({
      status: "frozen",
      automaticDisposition: "disabled",
      manualDisposition: "not_applicable",
    });
    expect(afterRetry.pendingManualCapture).toBeNull();
  });

  it("freezes one exact 8h forward return target across retry and a different advance key without early anchor rebase", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const harness = applicationWithOptions({
      reward: async () => {
        const durable = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
          claimRewardResolution(client, {
            subjectPlayerId: seeded.playerId,
            sourceAuthority: "pokenexus.solo-hunt.encounter-completion.v1",
            sourceCorrelation: "reward:offline-frozen-pair",
            rulesVersion: "rules:test",
            gameDataVersion: "game-data:test",
            effects: [{ kind: "player_xp", playerId: seeded.playerId, amount: 1n }],
          }));
        return {
          rewardResolutionId: durable.resolution.resolutionId,
          reward: {
            playerExperience: 1n,
            pokemonExperience: [],
            items: [],
          },
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
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '12 hours' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));
    const before = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!before) throw new Error("missing checkpoint fixture");

    const firstKey = generateUuidV7();
    expect(await harness.app.checkpoint(seeded.playerId, firstKey, huntId)).toMatchObject({ httpStatus: 202 });
    const firstCommand = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPublicHuntCommand(client, seeded.playerId, firstKey));
    expect(firstCommand?.targetLogicalTimeMs).toBe(before.logicalTimeMs + FORWARD_OFFLINE_PRODUCTIVE_CAP_MS);
    expect(firstCommand?.targetWallClockAt).not.toBeNull();
    const partial = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!partial || !firstCommand?.targetWallClockAt) throw new Error("missing frozen return fixture");
    expect(partial.logicalTimeMs).toBeLessThan(firstCommand.targetLogicalTimeMs!);
    expect(partial.logicalTimeAnchorAt.getTime()).toBeLessThan(firstCommand.targetWallClockAt.getTime());

    expect(await harness.app.checkpoint(seeded.playerId, firstKey, huntId)).toMatchObject({ httpStatus: 202 });
    const retried = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPublicHuntCommand(client, seeded.playerId, firstKey));
    expect(retried?.targetLogicalTimeMs).toBe(firstCommand.targetLogicalTimeMs);
    expect(retried?.targetWallClockAt?.getTime()).toBe(firstCommand.targetWallClockAt.getTime());

    const secondKey = generateUuidV7();
    expect(await harness.app.claim(seeded.playerId, secondKey, huntId)).toMatchObject({ httpStatus: 202 });
    const joined = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPublicHuntCommand(client, seeded.playerId, secondKey));
    expect(joined?.targetLogicalTimeMs).toBe(firstCommand.targetLogicalTimeMs);
    expect(joined?.targetWallClockAt?.getTime()).toBe(firstCommand.targetWallClockAt.getTime());
    const stillPartial = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    expect(stillPartial?.logicalTimeAnchorAt.getTime()).toBeLessThan(firstCommand.targetWallClockAt.getTime());
  });

  it("uses full sub-8h elapsed time for a forward return target", async () => {
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
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '2 hours' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));
    const before = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!before) throw new Error("missing checkpoint fixture");

    const key = generateUuidV7();
    expect(await harness.app.checkpoint(seeded.playerId, key, huntId)).toMatchObject({ httpStatus: 202 });
    const command = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPublicHuntCommand(client, seeded.playerId, key));
    if (!command?.targetLogicalTimeMs) throw new Error("missing frozen target");
    const elapsed = command.targetLogicalTimeMs - before.logicalTimeMs;
    expect(elapsed).toBeGreaterThanOrEqual(2 * 60 * 60 * 1000);
    expect(elapsed).toBeLessThan(2 * 60 * 60 * 1000 + 5_000);
    expect(elapsed).toBeLessThan(FORWARD_OFFLINE_PRODUCTIVE_CAP_MS);
  });

  it("fails closed before command acceptance when a forward checkpoint anchor is in the future", async () => {
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
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() + interval '1 second' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));
    const before = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!before) throw new Error("missing checkpoint fixture");

    const key = generateUuidV7();
    expect(await harness.app.checkpoint(seeded.playerId, key, huntId))
      .toEqual({ httpStatus: 503, body: { error: "authority_unavailable" } });
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPublicHuntCommand(client, seeded.playerId, key))).toBeNull();
    const after = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    expect(after?.rowVersion).toBe(before.rowVersion);
    expect(after?.logicalTimeMs).toBe(before.logicalTimeMs);
    expect(after?.logicalTimeAnchorAt.getTime()).toBe(before.logicalTimeAnchorAt.getTime());
  });

  it("skips a logically complete pending return and joins the next still-active frozen return", async () => {
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

    const completeKey = generateUuidV7();
    const activeKey = generateUuidV7();
    let activeTarget = 0;
    let activeReturnAt: Date | null = null;
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, seeded.playerId);
        if (!root) throw new Error("missing Player Hunt root");
        await transaction.query(
          "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = $2 WHERE checkpoint_id = $1",
          [hunt.checkpointId, root.databaseNow],
        );
        const complete = await claimPublicHuntCommandInTransaction(transaction, {
          playerId: seeded.playerId,
          idempotencyKey: completeKey,
          commandKind: "checkpoint",
          intentHash: await hashNormalizedIntent({ huntId }),
          intentJson: { huntId },
          sourceHuntId: huntId,
          advancementHuntId: huntId,
          targetLogicalTimeMs: checkpoint.logicalTimeMs,
          targetWallClockAt: root.databaseNow,
        });
        expect(complete.status).toBe("accepted");
        activeTarget = checkpoint.logicalTimeMs + 5_000;
        activeReturnAt = new Date(root.databaseNow.getTime() + 5_000);
        const active = await claimPublicHuntCommandInTransaction(transaction, {
          playerId: seeded.playerId,
          idempotencyKey: activeKey,
          commandKind: "claim",
          intentHash: await hashNormalizedIntent({ huntId }),
          intentJson: { huntId },
          sourceHuntId: huntId,
          advancementHuntId: huntId,
          targetLogicalTimeMs: activeTarget,
          targetWallClockAt: activeReturnAt,
        });
        expect(active.status).toBe("accepted");
      }));

    const joinedKey = generateUuidV7();
    await harness.app.checkpoint(seeded.playerId, joinedKey, huntId);
    const joined = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPublicHuntCommand(client, seeded.playerId, joinedKey));
    expect(joined?.targetLogicalTimeMs).toBe(activeTarget);
    expect(joined?.targetWallClockAt?.getTime()).toBe(activeReturnAt?.getTime());
  });

  it("rebases a completed capped forward return to its frozen DB-time anchor so excess cannot be claimed again", async () => {
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

    const cappedKey = generateUuidV7();
    const joinedKey = generateUuidV7();
    let frozenReturnAt: Date | null = null;
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, seeded.playerId);
        if (!root) throw new Error("missing Player Hunt root");
        frozenReturnAt = root.databaseNow;
        await transaction.query(
          "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = $2::timestamptz - interval '4 hours' WHERE checkpoint_id = $1",
          [hunt.checkpointId, root.databaseNow],
        );
        const claimed = await claimPublicHuntCommandInTransaction(transaction, {
          playerId: seeded.playerId,
          idempotencyKey: cappedKey,
          commandKind: "checkpoint",
          intentHash: await hashNormalizedIntent({ huntId }),
          intentJson: { huntId },
          sourceHuntId: huntId,
          advancementHuntId: huntId,
          targetLogicalTimeMs: checkpoint.logicalTimeMs,
          targetWallClockAt: root.databaseNow,
        });
        expect(claimed.status).toBe("accepted");
        const joined = await claimPublicHuntCommandInTransaction(transaction, {
          playerId: seeded.playerId,
          idempotencyKey: joinedKey,
          commandKind: "claim",
          intentHash: await hashNormalizedIntent({ huntId }),
          intentJson: { huntId },
          sourceHuntId: huntId,
          advancementHuntId: huntId,
          targetLogicalTimeMs: checkpoint.logicalTimeMs,
          targetWallClockAt: root.databaseNow,
        });
        expect(joined.status).toBe("accepted");
      }));

    expect(await settleBoundedCommand(
      () => harness.app.checkpoint(seeded.playerId, cappedKey, huntId),
    )).toMatchObject({ httpStatus: 200 });
    const rebased = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!rebased || !frozenReturnAt) throw new Error("missing rebased checkpoint");
    expect(rebased.logicalTimeAnchorAt.getTime()).toBe(frozenReturnAt.getTime());
    expect((await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPublicHuntCommand(client, seeded.playerId, joinedKey)))?.status).toBe("pending");

    const nextKey = generateUuidV7();
    await harness.app.checkpoint(seeded.playerId, nextKey, huntId);
    const next = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPublicHuntCommand(client, seeded.playerId, nextKey));
    if (!next?.targetLogicalTimeMs) throw new Error("missing subsequent target");
    expect(next.targetLogicalTimeMs - rebased.logicalTimeMs).toBeLessThan(60_000);
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
    let boundary = null as Awaited<ReturnType<typeof loadEarliestIncompleteEncounterBoundary>>;
    for (let attempt = 0; attempt < 128 && boundary === null; attempt += 1) {
      const frozen = await harness.app.checkpoint(seeded.playerId, key, huntId);
      expect(frozen.httpStatus).toBe(202);
      boundary = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
        loadEarliestIncompleteEncounterBoundary(client, huntId));
    }
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
    let frozenBeforeAttempt = null as Awaited<ReturnType<typeof loadEarliestIncompleteEncounterBoundary>>;
    for (let attempt = 0; attempt < 128 && frozenBeforeAttempt === null; attempt += 1) {
      expect((await harness.app.checkpoint(seeded.playerId, key, huntId)).httpStatus).toBe(202);
      frozenBeforeAttempt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
        loadEarliestIncompleteEncounterBoundary(client, huntId));
    }
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
    let captureCommitted = null as Awaited<ReturnType<typeof loadEarliestIncompleteEncounterBoundary>>;
    for (let attempt = 0; attempt < 128; attempt += 1) {
      expect((await harness.app.claim(seeded.playerId, claimKey, huntId)).httpStatus).toBe(202);
      captureCommitted = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
        loadEarliestIncompleteEncounterBoundary(client, huntId));
      if (captureCommitted?.status === "capture_committed") break;
    }
    expect(captureCommitted).toMatchObject({
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
    let rewardCommitted = null as Awaited<ReturnType<typeof loadEarliestIncompleteEncounterBoundary>>;
    for (let attempt = 0; attempt < 128; attempt += 1) {
      const checkpointStage = await harness.app.checkpoint(seeded.playerId, checkpointKey, huntId);
      expect(checkpointStage).toMatchObject({ httpStatus: 202 });
      rewardCommitted = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
        loadEarliestIncompleteEncounterBoundary(client, huntId));
      if (rewardCommitted?.status === "reward_committed") break;
    }
    expect(rewardCommitted).toMatchObject({ status: "reward_committed" });
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
    const firstRetreatKey = generateUuidV7();
    expect(await settleBoundedCommand(
      () => harness.app.retreat(seeded.playerId, firstRetreatKey, firstHuntId),
    ))
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

  it("lets Retreat win an exact KO-intervention automation tie with durable abandonment and zero Revive spend", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    await addInventoryItem(seeded.playerId, "item:revive", 1n);
    const harness = applicationWithOptions({
      runtimeInputsTransform: (inputs) => lethalRuntimeInputs(inputs, "singleEnemy"),
    });
    expect(await harness.app.replaceAutoRevivePolicy(
      seeded.playerId,
      generateUuidV7(),
      {
        expectedRowVersion: "0",
        enabled: true,
        orderedItems: [{ itemId: "item:revive", autoUseEnabled: true, minimumReserve: "0" }],
      },
    )).toMatchObject({ httpStatus: 200, body: { policy: { enabled: true, rowVersion: "1" } } });

    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(started.httpStatus, JSON.stringify(started.body)).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing Retreat tie Hunt fixture");
    const checkpoint = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!checkpoint) throw new Error("missing Retreat tie checkpoint");
    const decoded = decodeSoloHuntCheckpoint(checkpoint.stateBytes);
    expect(decoded.accepted).toBe(true);
    if (!decoded.accepted) return;

    const predicted = advanceSoloHuntToAutomationBoundaryOrEncounterBoundaryOrCutoff(
      decoded.state,
      harness.runtime(),
      10_000,
      { skipInitialAutomationBoundary: true },
    );
    expect(predicted.accepted, predicted.accepted ? undefined : predicted.reason).toBe(true);
    if (!predicted.accepted) return;
    expect(predicted.stopReason).toBe("automationBoundary");
    const predictedEncounter = predicted.state.currentEncounter;
    const predictedIntervention = predictedEncounter?.battle.koInterventionPending ?? null;
    expect(predictedIntervention).not.toBeNull();
    if (!predictedEncounter || !predictedIntervention) throw new Error("missing predicted KO intervention");
    const tieLogicalTimeMs = predicted.state.logicalTimeMs;

    const retreatKey = generateUuidV7();
    const intent = { huntId };
    const intentHash = await hashNormalizedIntent(intent);
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      withTransaction(client, async (transaction) => {
        const targetWallClockAt = new Date(
          checkpoint.logicalTimeAnchorAt.getTime() + (tieLogicalTimeMs - checkpoint.logicalTimeMs),
        );
        const claimed = await claimPublicHuntCommandInTransaction(transaction, {
          playerId: seeded.playerId,
          idempotencyKey: retreatKey,
          commandKind: "retreat",
          intentHash,
          intentJson: intent,
          sourceHuntId: huntId,
          advancementHuntId: huntId,
          targetLogicalTimeMs: tieLogicalTimeMs,
          targetWallClockAt,
        });
        expect(claimed.status).toBe("accepted");
      }));

    const terminal = await settleBoundedCommand(
      () => harness.app.retreat(seeded.playerId, retreatKey, huntId),
    );
    expect(terminal).toMatchObject({
      httpStatus: 200,
      body: { status: "terminal", terminalReason: "retreat", recoveryReadyAt: expect.any(String) },
    });

    const durable = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const persistedCheckpoint = await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId);
      if (!persistedCheckpoint) throw new Error("missing persisted Retreat tie checkpoint");
      const persisted = decodeSoloHuntCheckpoint(persistedCheckpoint.stateBytes);
      const terminalHunt = await loadOwnedSoloHunt(client, seeded.playerId, huntId);
      const root = await ensureAndLockPlayerHuntRoot(client, seeded.playerId);
      return {
        persisted,
        abandonment: await loadRetreatAbandonment(client, { playerId: seeded.playerId, huntId }),
        uses: await loadAutomationItemUsesForEncounter(client, {
          playerId: seeded.playerId,
          huntId,
          encounterOrdinal: 1,
        }),
        inventory: await loadInventory(client, seeded.playerId),
        terminalHunt,
        root,
      };
    });
    expect(durable.persisted.accepted).toBe(true);
    if (!durable.persisted.accepted) throw new Error("persisted Retreat tie checkpoint is invalid");
    expect(durable.persisted.state.logicalTimeMs).toBe(tieLogicalTimeMs);
    expect(durable.persisted.state.currentEncounter?.battle.koInterventionPending).toEqual(predictedIntervention);
    expect(durable.persisted.state.currentEncounter?.battle.battleId).toBe(predictedEncounter.battle.battleId);
    expect(durable.abandonment).toMatchObject({
      disposition: "abandoned_by_retreat",
      logicalTimeMs: tieLogicalTimeMs,
      battleId: predictedEncounter.battle.battleId,
      sideId: predictedIntervention.sideId,
      combatantId: predictedIntervention.combatantId,
      koInterventionPending: true,
    });
    expect(durable.uses).toEqual([]);
    expect(durable.inventory?.entries.find(({ itemId }) => itemId === "item:revive")?.quantity).toBe(1n);
    expect(durable.terminalHunt?.terminalReason).toBe("retreat");
    expect(durable.terminalHunt?.terminalAt).not.toBeNull();
    expect(durable.root?.recoveryReadyAt).not.toBeNull();
    expect(durable.root!.recoveryReadyAt!.getTime() - durable.terminalHunt!.terminalAt!.getTime()).toBe(30_000);
  });

  it("commits D-F16 post-Battle Revive atomically and exactly once across rollback, response loss, and restart", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    await addInventoryItem(seeded.playerId, "item:revive", 1n);
    const persistedRuntimeStore: { value: SoloHuntRuntimeInputs | null } = { value: null };
    const createHarness = () => applicationWithOptions({
      presentationSourceEnabled: true,
      persistedRuntimeStore,
      runtimeInputsTransform: (inputs) => lethalRuntimeInputs(inputs, "allActive"),
    });
    let harness = createHarness();

    expect(await harness.app.replaceAutoRevivePolicy(
      seeded.playerId,
      generateUuidV7(),
      {
        expectedRowVersion: "0",
        enabled: true,
        orderedItems: [{ itemId: "item:revive", autoUseEnabled: true, minimumReserve: "0" }],
      },
    )).toMatchObject({ httpStatus: 200, body: { policy: { enabled: true, rowVersion: "1" } } });

    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(started.httpStatus, JSON.stringify(started.body)).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing D-F16 Hunt fixture");
    const presentedBattles = () => withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query<{ encounter_ordinal: string; battle_id: string }>(
        `SELECT encounter_ordinal::text, battle_id
           FROM pokenexus.hunt_presentation_battles
          WHERE hunt_id = $1 ORDER BY encounter_ordinal`,
        [huntId],
      ).then(({ rows }) => rows));
    const initialBattles = await presentedBattles();
    expect(initialBattles).toHaveLength(1);
    expect(initialBattles[0]?.encounter_ordinal).toBe("1");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '10 seconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    const pendingBefore = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadPendingZoneSelection(client, { playerId: seeded.playerId, zoneId: "zone:test" }));
    expect(pendingBefore).not.toBeNull();
    if (!pendingBefore) throw new Error("missing pre-commit D-F16 pending selection");

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      await client.query(`
        CREATE FUNCTION pokenexus.test_task110_fail_post_battle_revive() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'TASK-110 injected post-Battle Revive failure';
        END;
        $$
      `);
      await client.query(`
        CREATE TRIGGER test_task110_fail_post_battle_revive
        BEFORE INSERT ON pokenexus.hunt_post_battle_revive_applied
        FOR EACH ROW EXECUTE FUNCTION pokenexus.test_task110_fail_post_battle_revive()
      `);
    });

    const checkpointKey = generateUuidV7();
    let beforeFailure: {
      checkpoint: Awaited<ReturnType<typeof loadHuntCheckpoint>>;
      inventory: Awaited<ReturnType<typeof loadInventory>>;
      pending: Awaited<ReturnType<typeof loadPendingZoneSelection>>;
    } | null = null;
    let failed: Awaited<ReturnType<typeof harness.app.checkpoint>> | null = null;
    for (let attempt = 0; attempt < 64; attempt += 1) {
      beforeFailure = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => ({
        checkpoint: await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId),
        inventory: await loadInventory(client, seeded.playerId),
        pending: await loadPendingZoneSelection(client, { playerId: seeded.playerId, zoneId: "zone:test" }),
      }));
      failed = await harness.app.checkpoint(seeded.playerId, checkpointKey, huntId);
      if (failed.httpStatus === 503) break;
      expect(failed.httpStatus).toBe(202);
    }
    expect(failed).toEqual({ httpStatus: 503, body: { error: "authority_unavailable" } });
    if (!beforeFailure?.checkpoint || !beforeFailure.inventory) throw new Error("missing pre-failure D-F16 state");

    const rolledBack = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => ({
      checkpoint: await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId),
      inventory: await loadInventory(client, seeded.playerId),
      pending: await loadPendingZoneSelection(client, { playerId: seeded.playerId, zoneId: "zone:test" }),
      genericCount: await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.hunt_automation_item_uses WHERE player_id = $1 AND hunt_id = $2",
        [seeded.playerId, huntId],
      ),
      dedicatedCount: await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.hunt_post_battle_revive_applied WHERE player_id = $1 AND hunt_id = $2",
        [seeded.playerId, huntId],
      ),
    }));
    expect(rolledBack.checkpoint?.rowVersion).toBe(beforeFailure.checkpoint.rowVersion);
    expect(rolledBack.checkpoint?.logicalTimeMs).toBe(beforeFailure.checkpoint.logicalTimeMs);
    expect(rolledBack.checkpoint?.stateBytes).toEqual(beforeFailure.checkpoint.stateBytes);
    expect(rolledBack.inventory).toEqual(beforeFailure.inventory);
    expect(rolledBack.pending).toEqual(beforeFailure.pending);
    expect(rolledBack.genericCount.rows[0]?.count).toBe("0");
    expect(rolledBack.dedicatedCount.rows[0]?.count).toBe("0");
    expect(await presentedBattles()).toEqual(initialBattles);

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      await client.query("DROP TRIGGER test_task110_fail_post_battle_revive ON pokenexus.hunt_post_battle_revive_applied");
      await client.query("DROP FUNCTION pokenexus.test_task110_fail_post_battle_revive()");
    });

    harness = createHarness();
    let resolvedState: ReturnType<typeof decodeSoloHuntCheckpoint> | null = null;
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const continued = await harness.app.checkpoint(seeded.playerId, checkpointKey, huntId);
      expect([200, 202]).toContain(continued.httpStatus);
      const checkpoint = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
        loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
      if (!checkpoint) throw new Error("missing post-restart D-F16 checkpoint");
      const decoded = decodeSoloHuntCheckpoint(checkpoint.stateBytes);
      if (
        decoded.accepted
        && decoded.state.completedEncounters.some(({ completionKind }) => completionKind === "resolved_non_win")
      ) {
        resolvedState = decoded;
        break;
      }
    }
    expect(resolvedState?.accepted).toBe(true);
    if (!resolvedState?.accepted) throw new Error("D-F16 did not resolve after restart");
    const resolvedEvidence = resolvedState.state.completedEncounters.find(
      ({ completionKind }) => completionKind === "resolved_non_win",
    );
    expect(resolvedEvidence).toBeDefined();
    if (!resolvedEvidence) throw new Error("missing resolved_non_win evidence");
    expect(resolvedState.state.currentEncounter).toBeUndefined();
    expect(resolvedState.state.pendingEncounterSelection).toBeUndefined();
    expect("rewardSourceIdentity" in resolvedEvidence).toBe(false);
    expect("rewardEnvelope" in resolvedEvidence).toBe(false);

    const committed = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const inventory = await loadInventory(client, seeded.playerId);
      const pending = await loadPendingZoneSelection(client, { playerId: seeded.playerId, zoneId: "zone:test" });
      const uses = await loadAutomationItemUsesForEncounter(client, {
        playerId: seeded.playerId,
        huntId,
        encounterOrdinal: resolvedEvidence.encounterOrdinal,
      });
      const dedicated = uses[0]
        ? await loadPostBattleReviveAppliedByProvenance(client, {
            playerId: seeded.playerId,
            huntId,
            provenanceIdentity: uses[0].provenanceIdentity,
          })
        : null;
      return { inventory, pending, uses, dedicated };
    });
    expect(committed.inventory?.entries.find(({ itemId }) => itemId === "item:revive")).toBeUndefined();
    expect(committed.pending).toBeNull();
    expect(committed.uses).toHaveLength(1);
    expect(committed.uses[0]).toMatchObject({
      automationFamily: "revive",
      phase: "post_battle",
      itemId: "item:revive",
      encounterId: resolvedEvidence.encounterId,
      encounterOrdinal: resolvedEvidence.encounterOrdinal,
    });
    expect(committed.dedicated).toMatchObject({
      encounterId: resolvedEvidence.encounterId,
      encounterOrdinal: resolvedEvidence.encounterOrdinal,
      itemId: "item:revive",
      pendingSelectionIdentity: pendingBefore.selectionJson.pendingSelectionIdentity,
    });
    expect(committed.dedicated?.consumedPendingSelectionJson).toEqual(pendingBefore.selectionJson);
    const completedProvenance = resolvedState.state.completedEncounterProvenance.find(
      ({ encounterId }) => encounterId === resolvedEvidence.encounterId,
    );
    expect(completedProvenance).toBeDefined();
    expect(completedProvenance?.consumedPendingEncounterSelection).toEqual(pendingBefore.selectionJson);
    expect(committed.dedicated?.completedEncounterProvenanceJson).toEqual(completedProvenance);

    const presentationBeforeReplay = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const stream = await client.query<{
        input_schema_version: string;
        checkpoint_schema_version: string;
        presentation_schema_version: string;
      }>(
        `SELECT input_schema_version, checkpoint_schema_version, presentation_schema_version
           FROM pokenexus.hunt_presentation_streams
          WHERE player_id = $1 AND hunt_id = $2`,
        [seeded.playerId, huntId],
      );
      const events = await client.query<{ count: string; revived: string }>(
        `SELECT count(*)::text AS count,
                count(*) FILTER (WHERE public_event_json->>'kind' = 'CombatantRevived')::text AS revived
           FROM pokenexus.hunt_presentation_events WHERE hunt_id = $1`,
        [huntId],
      );
      const checkpoint = await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId);
      return { stream: stream.rows[0], events: events.rows[0], checkpoint };
    });
    expect(presentationBeforeReplay.stream).toEqual({
      input_schema_version: "hunt-runtime-inputs-v4",
      checkpoint_schema_version: "pokenexus.solo-hunt-checkpoint.v4",
      presentation_schema_version: "pokenexus.combat-presentation.v2",
    });
    expect(presentationBeforeReplay.checkpoint?.schemaVersion).toBe("pokenexus.solo-hunt-checkpoint.v4");
    expect(presentationBeforeReplay.events?.revived).toBe("0");

    const replayHarness = createHarness();
    const beforeReplayInventory = committed.inventory;
    await replayHarness.app.checkpoint(seeded.playerId, checkpointKey, huntId);
    const afterReplay = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => ({
      inventory: await loadInventory(client, seeded.playerId),
      uses: await loadAutomationItemUsesForEncounter(client, {
        playerId: seeded.playerId,
        huntId,
        encounterOrdinal: resolvedEvidence.encounterOrdinal,
      }),
    }));
    expect(afterReplay.inventory?.rowVersion).toBe(beforeReplayInventory?.rowVersion);
    expect(afterReplay.inventory?.entries).toEqual(beforeReplayInventory?.entries);
    expect(afterReplay.uses).toHaveLength(1);
    const presentationAfterReplayCount = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.hunt_presentation_events WHERE hunt_id = $1",
        [huntId],
      ).then(({ rows }) => rows[0]?.count));
    expect(presentationAfterReplayCount).toBe(presentationBeforeReplay.events?.count);
    expect(await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadEarliestIncompleteEncounterBoundary(client, huntId))).toBeNull();

    // D-F16 publication gate: Battle N+1 must not appear from BattleEnded(draw)
    // or a rolled-back post-Battle Revive attempt. Only after the durable
    // resolved_non_win + PostBattleReviveApplied + consumed-selection commit
    // may a later command admit the next zero-gap Battle.
    expect(await presentedBattles()).toEqual(initialBattles);
    const afterDurableResolution = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!afterDurableResolution) throw new Error("missing durable D-F16 checkpoint");
    const durableState = decodeSoloHuntCheckpoint(afterDurableResolution.stateBytes);
    expect(durableState.accepted).toBe(true);
    if (!durableState.accepted) return;
    const nextBattle = advanceSoloHuntToEncounterBoundaryOrCutoff(
      durableState.state,
      replayHarness.runtime(),
      durableState.state.logicalTimeMs + 60_000,
    );
    expect(nextBattle.accepted).toBe(true);
    if (!nextBattle.accepted) return;
    expect(nextBattle.events.some((entry) => entry.kind === "combat"
      && entry.event.kind === "BattleStarted"
      && entry.event.battleId !== initialBattles[0]?.battle_id)).toBe(true);
  });

  it("counts a successful in-Battle Auto-Revive KO in the sealed Hunt activity", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    await addInventoryItem(seeded.playerId, "item:revive", 1n);
    const harness = applicationWithOptions({
      presentationSourceEnabled: true,
      runtimeInputsTransform: (inputs) => {
        const playerMove = inputs.context.moveRules["move:player"];
        const enemyMove = inputs.context.moveRules["move:enemy"];
        if (!playerMove || !enemyMove) throw new Error("missing activity fixture Moves");
        const context: ResolvedCombatContext = {
          ...inputs.context,
          moveRules: {
            ...inputs.context.moveRules,
            "move:player": {
              ...playerMove,
              power: 1_000,
            },
            "move:enemy": {
              ...enemyMove,
              power: 10_000,
              moveCooldownMs: 60_000,
            },
          },
        };
        return {
          ...inputs,
          context,
          team: inputs.team.map((member) => ({
            ...member,
            baseStats: { ...member.baseStats, spe: 1 },
          })),
          opponentTemplates: inputs.opponentTemplates.map((template) => ({
            ...template,
            rulesVersion: context.rulesVersion,
            baseStats: { hp: 10, atk: 200, def: 10, spa: 10, spd: 10, spe: 200 },
          })),
          interBattleGapMs: 60_000,
        };
      },
      reward: async ({ transaction }) => {
        const durable = await claimRewardResolutionInTransaction(transaction, {
            subjectPlayerId: seeded.playerId,
            sourceAuthority: "pokenexus.solo-hunt.encounter-completion.v1",
            sourceCorrelation: "reward:activity-battle-revive",
            rulesVersion: "rules:test",
            gameDataVersion: "game-data:test",
            effects: [],
          });
        if (!durable.resolution.completion) {
          await insertRewardCompletion(transaction, durable.resolution.resolutionId, new Date());
        }
        return {
          rewardResolutionId: durable.resolution.resolutionId,
          reward: { playerExperience: 0n, pokemonExperience: [], items: [] },
        };
      },
    });
    expect(await harness.app.replaceAutoRevivePolicy(
      seeded.playerId,
      generateUuidV7(),
      {
        expectedRowVersion: "0",
        enabled: true,
        orderedItems: [{ itemId: "item:revive", autoUseEnabled: true, minimumReserve: "0" }],
      },
    )).toMatchObject({ httpStatus: 200, body: { policy: { enabled: true } } });

    const started = await harness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(started.httpStatus).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;
    const hunt = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      loadOwnedSoloHunt(client, seeded.playerId, huntId));
    if (!hunt) throw new Error("missing activity Auto-Revive Hunt fixture");
    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      client.query(
        "UPDATE pokenexus.hunt_checkpoints SET logical_time_anchor_at = transaction_timestamp() - interval '500 seconds' WHERE checkpoint_id = $1",
        [hunt.checkpointId],
      ).then(() => undefined));

    const checkpointKey = generateUuidV7();
    let activity: Awaited<ReturnType<typeof loadResolvedEncounterActivity>> = null;
    let reviveUse: Awaited<ReturnType<typeof loadAutomationItemUsesForEncounter>>[number] | undefined;
    for (let attempt = 0; attempt < 128 && activity === null; attempt += 1) {
      const result = await harness.app.checkpoint(seeded.playerId, checkpointKey, huntId);
      if (result.httpStatus === 503) {
        const diagnostic = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
          const checkpoint = await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId);
          const decoded = checkpoint ? decodeSoloHuntCheckpoint(checkpoint.stateBytes) : null;
          const boundary = await loadEarliestIncompleteEncounterBoundary(client, huntId);
          const latestEvidence = decoded?.accepted ? decoded.state.completedEncounters.at(-1) : undefined;
          const committedBoundary = latestEvidence
            ? await loadEncounterBoundary(client, huntId, latestEvidence.encounterId)
            : null;
          const reward = committedBoundary?.rewardResolutionId
            ? await loadRewardResolutionById(client, committedBoundary.rewardResolutionId)
            : null;
          const uses = await loadAutomationItemUsesForEncounter(client, {
            playerId: seeded.playerId,
            huntId,
            encounterOrdinal: 1,
          });
          return {
            attempt,
            logicalTimeMs: checkpoint?.logicalTimeMs ?? null,
            decoded: decoded?.accepted ? {
              completedEncounters: decoded.state.completedEncounters,
              currentBattleStatus: decoded.state.currentEncounter?.battle.status ?? null,
              currentBattleOutcome: decoded.state.currentEncounter?.battleOutcome ?? null,
            } : null,
            boundary,
            committedBoundary,
            reward: reward ? {
              resolutionId: reward.resolutionId,
              completion: reward.completion,
              effects: reward.effects,
            } : null,
            uses,
          };
        });
        throw new Error(
          "activity fixture authority unavailable: "
          + JSON.stringify(diagnostic, (_, value) => typeof value === "bigint" ? value.toString() : value),
        );
      }
      expect([200, 202], JSON.stringify(result.body)).toContain(result.httpStatus);
      const uses = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
        loadAutomationItemUsesForEncounter(client, {
          playerId: seeded.playerId,
          huntId,
          encounterOrdinal: 1,
        }));
      reviveUse = uses.find(({ automationFamily, phase }) =>
        automationFamily === "revive" && phase === "battle");
      if (reviveUse?.encounterId) {
        activity = await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
          loadResolvedEncounterActivity(client, {
            playerId: seeded.playerId,
            huntId,
            encounterId: reviveUse!.encounterId!,
          }));
      }
    }

    expect(reviveUse).toMatchObject({
      automationFamily: "revive",
      phase: "battle",
      itemId: "item:revive",
      encounterOrdinal: 1,
    });
    if (!activity) {
      const diagnostic = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
        const checkpoint = await loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId);
        const terminalHunt = await loadOwnedSoloHunt(client, seeded.playerId, huntId);
        const decoded = checkpoint ? decodeSoloHuntCheckpoint(checkpoint.stateBytes) : null;
        return {
          logicalTimeMs: checkpoint?.logicalTimeMs ?? null,
          terminalReason: terminalHunt?.terminalReason ?? null,
          completedEncounters: decoded?.accepted ? decoded.state.completedEncounters : null,
          currentBattleStatus: decoded?.accepted
            ? decoded.state.currentEncounter?.battle.status ?? null
            : null,
          currentBattleOutcome: decoded?.accepted
            ? decoded.state.currentEncounter?.battleOutcome ?? null
            : null,
        };
      });
      throw new Error("activity fixture did not resolve: " + JSON.stringify(diagnostic));
    }
    expect(activity?.activityJson).toMatchObject({
      encounterDisposition: "victory",
      consumedItems: [{ itemId: "item:revive", quantity: "1" }],
      koSummary: [
        { side: "player", count: 1 },
        { side: "opponent", count: 1 },
      ],
      reviveSummary: [{
        phase: "battle",
        targetPokemonInstanceId: seeded.pokemonInstanceId,
        itemId: "item:revive",
      }],
    });
    const presentation = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const events = await client.query<{ public_event_json: Record<string, unknown> }>(
        `SELECT public_event_json FROM pokenexus.hunt_presentation_events
          WHERE hunt_id = $1 ORDER BY event_index`,
        [huntId],
      );
      const stream = await client.query<{ presentation_schema_version: string }>(
        "SELECT presentation_schema_version FROM pokenexus.hunt_presentation_streams WHERE hunt_id = $1",
        [huntId],
      );
      return { events: events.rows.map(({ public_event_json }) => public_event_json), stream: stream.rows[0] };
    });
    expect(presentation.stream?.presentation_schema_version).toBe("pokenexus.combat-presentation.v2");
    const revived = presentation.events.filter((event) => event.kind === "CombatantRevived");
    expect(revived).toHaveLength(1);
    expect(revived[0]).toMatchObject({
      kind: "CombatantRevived",
      hpChange: { visibility: "exact", amount: 15, resultingHp: 15 },
    });
  });

  it("pages immutable Hunt activity without duplicates across reconnect and enforces the 64-record bound", async () => {
    const seeded = await seedPlayerTeamAndPotion();
    const firstHarness = application();
    const started = await firstHarness.app.start(seeded.playerId, generateUuidV7(), {
      huntDefinitionId: "hunt:test",
      teamId: seeded.teamId,
    });
    expect(started.httpStatus).toBe(200);
    const huntId = (started.body as { activeHunt: { huntId: string } }).activeHunt.huntId;

    await withPgClient({ connectionString: testDatabaseUrl }, (client) =>
      withTransaction(client, async (transaction) => {
        for (let encounterOrdinal = 1; encounterOrdinal <= 3; encounterOrdinal += 1) {
          const inserted = await insertResolvedEncounterActivityInTransaction(transaction, {
            playerId: seeded.playerId,
            huntId,
            encounterOrdinal,
            encounterId: `encounter:activity-page:${encounterOrdinal}`,
            resolvedLogicalTimeMs: encounterOrdinal * 100,
            encounterDisposition: "victory",
            activityJson: {
              schemaVersion: "pokenexus.hunt-activity.v1",
              encounterOrdinal,
              encounterId: `encounter:activity-page:${encounterOrdinal}`,
            },
          });
          expect(inserted.status).toBe("inserted");
        }
      }));

    const firstPage = await firstHarness.app.getActivity(seeded.playerId, huntId, null, 2);
    expect(firstPage).toEqual({
      httpStatus: 200,
      body: {
        schemaVersion: "pokenexus.hunt-activity-page.v1",
        huntId,
        records: [
          {
            schemaVersion: "pokenexus.hunt-activity.v1",
            encounterOrdinal: 1,
            encounterId: "encounter:activity-page:1",
          },
          {
            schemaVersion: "pokenexus.hunt-activity.v1",
            encounterOrdinal: 2,
            encounterId: "encounter:activity-page:2",
          },
        ],
        nextCursor: "2",
      },
    });

    const restartedHarness = application();
    const secondPage = await restartedHarness.app.getActivity(seeded.playerId, huntId, 2, 2);
    expect(secondPage).toEqual({
      httpStatus: 200,
      body: {
        schemaVersion: "pokenexus.hunt-activity-page.v1",
        huntId,
        records: [{
          schemaVersion: "pokenexus.hunt-activity.v1",
          encounterOrdinal: 3,
          encounterId: "encounter:activity-page:3",
        }],
        nextCursor: null,
      },
    });
    expect(await restartedHarness.app.getActivity(seeded.playerId, huntId, null, 64)).toMatchObject({
      httpStatus: 200,
      body: { records: expect.arrayContaining([
        expect.objectContaining({ encounterOrdinal: 1 }),
        expect.objectContaining({ encounterOrdinal: 2 }),
        expect.objectContaining({ encounterOrdinal: 3 }),
      ]), nextCursor: null },
    });
    expect(await restartedHarness.app.getActivity(seeded.playerId, huntId, null, 65))
      .toEqual({ httpStatus: 400, body: { error: "invalid_request" } });
  });

  it("durably rejects manual Potion commands for forward Hunts without scheduling or mutating healing state", async () => {
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
    const before = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => ({
      checkpoint: await loadHuntCheckpoint(client, seeded.playerId, hunt!.checkpointId),
      inventory: await loadInventory(client, seeded.playerId),
    }));
    if (!before.checkpoint || !before.inventory) throw new Error("missing forward Hunt fixture state");

    const healKey = generateUuidV7();
    const firstHeal = await app.useItem(seeded.playerId, healKey, huntId, {
      itemId: "item:potion",
      targetPokemonInstanceId: seeded.pokemonInstanceId,
    });
    expect(firstHeal).toEqual({ httpStatus: 422, body: { error: "hunt_item_not_supported" } });
    expect(await app.useItem(seeded.playerId, healKey, huntId, {
      itemId: "item:potion",
      targetPokemonInstanceId: seeded.pokemonInstanceId,
    })).toEqual(firstHeal);

    const after = await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const command = await loadPublicHuntCommand(client, seeded.playerId, healKey);
      if (!command) throw new Error("missing rejected heal command");
      return {
        command,
        healing: await loadHealingCommandByCommandId(client, command.commandId),
        checkpoint: await loadHuntCheckpoint(client, seeded.playerId, hunt!.checkpointId),
        inventory: await loadInventory(client, seeded.playerId),
      };
    });
    expect(after.command).toMatchObject({
      status: "terminal",
      commandKind: "heal_item",
      resultHttpStatus: 422,
      resultJson: { error: "hunt_item_not_supported" },
    });
    expect(after.healing).toBeNull();
    expect(after.checkpoint?.rowVersion).toBe(before.checkpoint.rowVersion);
    expect(after.checkpoint?.logicalTimeMs).toBe(before.checkpoint.logicalTimeMs);
    expect(after.inventory?.rowVersion).toBe(before.inventory.rowVersion);
    expect(after.inventory?.entries).toEqual(before.inventory.entries);
  });
});
