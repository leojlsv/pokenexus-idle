import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  claimPublicHuntCommandInTransaction,
  classifyHealingCommandInTransaction,
  closePendingManualCaptureInTransaction,
  completePublicHuntCommandInTransaction,
  createHealingCommandInTransaction,
  createHuntCheckpoint,
  createPendingManualCaptureIfFreeInTransaction,
  createSoloHuntInTransaction,
  ensureAndLockPlayerHuntRoot,
  insertAutoPotionPolicyInTransaction,
  insertAutoRevivePolicyInTransaction,
  insertAutoCapturePolicyInTransaction,
  insertAutomationItemUseInTransaction,
  insertInitialAutoPotionPolicyIntervalInTransaction,
  insertInitialAutoRevivePolicyIntervalInTransaction,
  insertInitialPolicyIntervalInTransaction,
  insertPostBattleReviveAppliedInTransaction,
  insertResolvedEncounterActivityInTransaction,
  insertRetreatAbandonmentInTransaction,
  loadAutomationItemUsesForEncounter,
  loadAutoPotionPolicyByVersion,
  loadAutoRevivePolicyByVersion,
  loadCurrentAutoPotionPolicy,
  loadCurrentAutoRevivePolicy,
  loadCurrentAutoCapturePolicy,
  loadEffectiveAutoPotionPolicyVersion,
  loadEffectiveAutoRevivePolicyVersion,
  loadEffectivePolicyVersion,
  loadEarliestHealingAdvanceBlocker,
  loadHealingCommandByCommandId,
  loadHuntCheckpoint,
  loadOwnedSoloHunt,
  loadPendingManualCapture,
  loadPlayerHuntRoot,
  loadPostBattleReviveAppliedByProvenance,
  loadPublicHuntCommand,
  loadResolvedEncounterActivity,
  loadResolvedEncounterActivityPage,
  loadRetreatAbandonment,
  markHealingCommandsDueForEncounterInTransaction,
  persistOwnedHuntCheckpointInTransaction,
  rebaseOwnedHuntCheckpointAnchorInTransaction,
  resolveHealingCommandInTransaction,
  supersedeOvertakenPublicHuntCommandsInTransaction,
  terminalizeSoloHuntInTransaction,
  withTransaction,
} from "../src/index";
import { runMigrations } from "../src/migrations";
import { encodeOpaqueStringDbV1 } from "../src/opaque-string-db-codec";
import { generateUuidV7 } from "../src/uuid-v7";

const testDatabaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL is required for TASK-038 PostgreSQL integration tests");
}
const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
if (!/^pokenexus_test(?:_|$)/.test(databaseName)) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL must target pokenexus_test or pokenexus_test_*");
}

const opaque = (value: string) => Buffer.from(encodeOpaqueStringDbV1(value));
const hash = (seed: number) => Uint8Array.from({ length: 32 }, (_, index) => (seed + index) & 0xff);

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

async function createPlayer(client: Client): Promise<string> {
  const accountId = generateUuidV7();
  const playerId = generateUuidV7();
  await client.query("INSERT INTO pokenexus.accounts (account_id) VALUES ($1)", [accountId]);
  await client.query(
    "INSERT INTO pokenexus.players (player_id, account_id) VALUES ($1, $2)",
    [playerId, accountId],
  );
  return playerId;
}

async function createPokemon(client: Client, playerId: string): Promise<string> {
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
      playerId,
      opaque("species:heal-target"),
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
  return pokemonInstanceId;
}

async function createHunt(client: Client, playerId: string): Promise<{ huntId: string; pokemonInstanceId: string }> {
  const pokemonInstanceId = await createPokemon(client, playerId);
  const checkpoint = await createHuntCheckpoint(client, {
    subjectPlayerId: playerId,
    huntRunIdentity: `hunt-run:${generateUuidV7()}`,
    schemaVersion: "pokenexus.solo-hunt-checkpoint.v2",
    gameDataVersion: "game-data:test",
    rulesVersion: "rules:test",
    logicalTimeMs: 0,
    logicalTimeAnchorAt: new Date("2026-09-27T12:00:00.000Z"),
    stateBytes: new TextEncoder().encode("checkpoint:test"),
    now: new Date("2026-09-27T12:00:00.000Z"),
  });
  const hunt = await withTransaction(client, async (transaction) => {
    await ensureAndLockPlayerHuntRoot(transaction, playerId);
    return createSoloHuntInTransaction(transaction, {
      playerId,
      checkpointId: checkpoint.checkpointId,
      huntDefinitionId: "hunt:test",
      zoneId: "zone:test",
      recoveryDurationMs: 1_000,
      initialPolicyVersion: null,
    });
  });
  return { huntId: hunt.huntId, pokemonInstanceId };
}

async function createHeal(
  client: Client,
  input: {
    readonly playerId: string;
    readonly huntId: string;
    readonly pokemonInstanceId: string;
    readonly idempotencyKey: string;
    readonly cutoff: number;
  },
) {
  return withTransaction(client, async (transaction) => {
    const claimed = await claimPublicHuntCommandInTransaction(transaction, {
      playerId: input.playerId,
      idempotencyKey: input.idempotencyKey,
      commandKind: "heal_item",
      intentHash: hash(input.cutoff),
      intentJson: { itemId: "item:potion", targetPokemonInstanceId: input.pokemonInstanceId },
      sourceHuntId: input.huntId,
      advancementHuntId: input.huntId,
      targetLogicalTimeMs: input.cutoff,
      targetWallClockAt: new Date("2026-09-27T12:00:00.000Z"),
    });
    if (claimed.status !== "accepted") throw new Error(`unexpected heal claim status: ${claimed.status}`);
    await createHealingCommandInTransaction(transaction, {
      commandId: claimed.command.commandId,
      playerId: input.playerId,
      sourceHuntId: input.huntId,
      itemId: "item:potion",
      targetPokemonInstanceId: input.pokemonInstanceId,
      itemRuleVersion: "item-rules:test",
      gameDataVersion: "game-data:test",
      rulesVersion: "rules:test",
      submissionCutoffLogicalTimeMs: input.cutoff,
      submissionPhase: null,
      submissionEncounterId: null,
      dueLogicalTimeMs: null,
      acceptanceSequence: claimed.command.acceptanceSequence,
    });
    return claimed.command;
  });
}

beforeEach(prepareSchema);
afterAll(resetSchema);

describe("TASK-038 Hunt orchestration persistence", () => {
  it("serializes concurrent same-key first delivery into one durable command and exact replay", async () => {
    const playerId = await withClient(createPlayer);
    const idempotencyKey = generateUuidV7();
    const input = {
      playerId,
      idempotencyKey,
      commandKind: "checkpoint" as const,
      intentHash: hash(1),
      intentJson: { huntId: "hunt:logical" },
    };

    const [left, right] = await Promise.all([
      withClient((client) => withTransaction(client, (transaction) =>
        claimPublicHuntCommandInTransaction(transaction, input))),
      withClient((client) => withTransaction(client, (transaction) =>
        claimPublicHuntCommandInTransaction(transaction, input))),
    ]);

    expect([left.status, right.status].sort()).toEqual(["accepted", "pending"]);
    expect(left.command.commandId).toBe(right.command.commandId);
    expect(new Set([left.command.acceptanceSequence, right.command.acceptanceSequence])).toEqual(new Set([1n]));

    const accepted = left.status === "accepted" ? left : right;
    await withClient((client) => withTransaction(client, (transaction) =>
      completePublicHuntCommandInTransaction(transaction, accepted.command.commandId, 200, { ok: true })));
    const replay = await withClient((client) => withTransaction(client, (transaction) =>
      claimPublicHuntCommandInTransaction(transaction, input)));
    expect(replay).toMatchObject({ status: "terminal", replayed: true, command: { resultHttpStatus: 200 } });

    const conflict = await withClient((client) => withTransaction(client, (transaction) =>
      claimPublicHuntCommandInTransaction(transaction, { ...input, intentHash: hash(2) })));
    expect(conflict.status).toBe("conflict");
  });

  it("keeps the terminal result for the continuation window, then retains only a correlation tombstone", async () => {
    const playerId = await withClient(createPlayer);
    const idempotencyKey = generateUuidV7();
    const input = {
      playerId,
      idempotencyKey,
      commandKind: "checkpoint" as const,
      intentHash: hash(31),
      intentJson: { huntId: "hunt:retention" },
    };
    const accepted = await withClient((client) => withTransaction(client, (transaction) =>
      claimPublicHuntCommandInTransaction(transaction, input)));
    if (accepted.status !== "accepted") throw new Error("retention fixture command was not accepted");
    await withClient((client) => withTransaction(client, (transaction) =>
      completePublicHuntCommandInTransaction(transaction, accepted.command.commandId, 200, { retained: true })));

    const terminal = await withClient((client) => loadPublicHuntCommand(client, playerId, idempotencyKey));
    if (!terminal?.terminalAt) throw new Error("retention fixture command did not terminalize");
    expect(terminal.status).toBe("terminal");
    expect(terminal.resultJson).toEqual({ retained: true });
    expect(terminal.continuationExpiresAt.getTime() - terminal.terminalAt.getTime())
      .toBe(30 * 24 * 60 * 60 * 1_000);
    expect(terminal.tombstoneExpiresAt.getTime() - terminal.terminalAt.getTime())
      .toBe(60 * 24 * 60 * 60 * 1_000);

    await withClient((client) => client.query(
      "UPDATE pokenexus.hunt_public_commands SET continuation_expires_at = clock_timestamp() - interval '1 millisecond' WHERE command_id = $1",
      [terminal.commandId],
    ).then(() => undefined));
    const gone = await withClient((client) => withTransaction(client, (transaction) =>
      claimPublicHuntCommandInTransaction(transaction, input)));
    expect(gone).toMatchObject({
      status: "gone",
      replayed: true,
      command: {
        commandId: terminal.commandId,
        resultHttpStatus: null,
        resultJson: null,
      },
    });

    const conflict = await withClient((client) => withTransaction(client, (transaction) =>
      claimPublicHuntCommandInTransaction(transaction, { ...input, intentHash: hash(32) })));
    expect(conflict.status).toBe("conflict");
  });

  it("never resurrects an expired pending correlation through completion or eager supersession", async () => {
    const seeded = await withClient(async (client) => {
      const playerId = await createPlayer(client);
      return { playerId, ...(await createHunt(client, playerId)) };
    });
    const completionKey = generateUuidV7();
    const completionInput = {
      playerId: seeded.playerId,
      idempotencyKey: completionKey,
      commandKind: "checkpoint" as const,
      intentHash: hash(41),
      intentJson: { huntId: seeded.huntId },
      sourceHuntId: seeded.huntId,
      advancementHuntId: seeded.huntId,
      targetLogicalTimeMs: 10,
    };
    const acceptedCompletion = await withClient((client) => withTransaction(client, (transaction) =>
      claimPublicHuntCommandInTransaction(transaction, completionInput)));
    if (acceptedCompletion.status !== "accepted") throw new Error("completion expiry fixture not accepted");
    await withClient((client) => client.query(
      "UPDATE pokenexus.hunt_public_commands SET continuation_expires_at = clock_timestamp() - interval '1 millisecond' WHERE command_id = $1",
      [acceptedCompletion.command.commandId],
    ).then(() => undefined));
    const completed = await withClient((client) => withTransaction(client, (transaction) =>
      completePublicHuntCommandInTransaction(transaction, acceptedCompletion.command.commandId, 200, { ok: true })));
    expect(completed).toMatchObject({
      status: "gone",
      resultHttpStatus: null,
      resultJson: null,
      terminalAt: null,
    });

    const supersededKey = generateUuidV7();
    const acceptedSuperseded = await withClient((client) => withTransaction(client, (transaction) =>
      claimPublicHuntCommandInTransaction(transaction, {
        ...completionInput,
        idempotencyKey: supersededKey,
        intentHash: hash(42),
        targetLogicalTimeMs: 1,
      })));
    if (acceptedSuperseded.status !== "accepted") throw new Error("supersession expiry fixture not accepted");
    await withClient((client) => client.query(
      "UPDATE pokenexus.hunt_public_commands SET continuation_expires_at = clock_timestamp() - interval '1 millisecond' WHERE command_id = $1",
      [acceptedSuperseded.command.commandId],
    ).then(() => undefined));
    const supersededCount = await withClient((client) => withTransaction(client, (transaction) =>
      supersedeOvertakenPublicHuntCommandsInTransaction(transaction, {
        playerId: seeded.playerId,
        huntId: seeded.huntId,
        committedLogicalTimeMs: 2,
      })));
    expect(supersededCount).toBe(0);
    expect(await withClient((client) =>
      loadPublicHuntCommand(client, seeded.playerId, supersededKey))).toMatchObject({
      status: "gone",
      resultHttpStatus: null,
      resultJson: null,
    });
  });

  it("samples serialized serverNow only after acquiring the Player-wide lock", async () => {
    const playerId = await withClient(async (client) => {
      const id = await createPlayer(client);
      await withTransaction(client, (transaction) => ensureAndLockPlayerHuntRoot(transaction, id));
      return id;
    });
    const first = new Client({ connectionString: testDatabaseUrl });
    const second = new Client({ connectionString: testDatabaseUrl });
    await Promise.all([first.connect(), second.connect()]);
    try {
      await first.query("BEGIN");
      await ensureAndLockPlayerHuntRoot(first, playerId);
      await second.query("BEGIN");
      const blocked = ensureAndLockPlayerHuntRoot(second, playerId);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const releaseSample = await first.query<{ database_now: Date }>(
        "SELECT clock_timestamp() AS database_now",
      );
      const releasedAt = releaseSample.rows[0]?.database_now;
      if (!releasedAt) throw new Error("failed to sample PostgreSQL release time");
      await first.query("COMMIT");
      const acquired = await blocked;
      if (!acquired) throw new Error("blocked Player Hunt root disappeared");
      expect(acquired.databaseNow.getTime()).toBeGreaterThanOrEqual(releasedAt.getTime());
      await second.query("COMMIT");
    } finally {
      await Promise.allSettled([
        first.query("ROLLBACK"),
        second.query("ROLLBACK"),
      ]);
      await Promise.all([first.end(), second.end()]);
    }
  });

  it("serializes policy writers so one expected rowVersion wins and the stale writer cannot activate", async () => {
    const playerId = await withClient(async (client) => {
      const id = await createPlayer(client);
      await withTransaction(client, (transaction) => ensureAndLockPlayerHuntRoot(transaction, id));
      return id;
    });
    const input = {
      playerId,
      expectedRowVersion: 0n,
      ballAuthorityVersion: "balls:test",
      validationGameDataVersion: "game-data:test",
      enabled: true,
      policyJson: { enabled: true, balls: [], rules: [] },
      effectiveHuntId: null,
      effectiveLogicalTimeMs: null,
    };

    const [left, right] = await Promise.all([
      withClient((client) => withTransaction(client, (transaction) =>
        insertAutoCapturePolicyInTransaction(transaction, input))),
      withClient((client) => withTransaction(client, (transaction) =>
        insertAutoCapturePolicyInTransaction(transaction, input))),
    ]);
    expect([left.status, right.status].sort()).toEqual(["accepted", "stale"]);
    const current = await withClient((client) => loadCurrentAutoCapturePolicy(client, playerId));
    expect(current?.rowVersion).toBe(1n);
    expect((await withClient((client) => loadPlayerHuntRoot(client, playerId)))?.policyRowVersion).toBe(1n);
  });

  it("replaces a same-boundary policy interval deterministically while preserving OCC", async () => {
    const seeded = await withClient(async (client) => {
      const playerId = await createPlayer(client);
      const hunt = await createHunt(client, playerId);
      await withTransaction(client, async (transaction) => {
        await insertInitialPolicyIntervalInTransaction(transaction, hunt.huntId, null);
      });
      return { playerId, ...hunt };
    });

    const first = await withClient((client) => withTransaction(client, (transaction) =>
      insertAutoCapturePolicyInTransaction(transaction, {
        playerId: seeded.playerId,
        expectedRowVersion: 0n,
        ballAuthorityVersion: "balls:test",
        validationGameDataVersion: "game-data:test",
        enabled: true,
        policyJson: { enabled: true, balls: [], rules: [] },
        effectiveHuntId: seeded.huntId,
        effectiveLogicalTimeMs: 0,
      })));
    expect(first.status).toBe("accepted");
    if (first.status !== "accepted") return;
    expect(await withClient((client) => loadEffectivePolicyVersion(client, seeded.huntId, 0)))
      .toBe(first.policy.policyVersion);

    const second = await withClient((client) => withTransaction(client, (transaction) =>
      insertAutoCapturePolicyInTransaction(transaction, {
        playerId: seeded.playerId,
        expectedRowVersion: 1n,
        ballAuthorityVersion: "balls:test",
        validationGameDataVersion: "game-data:test",
        enabled: false,
        policyJson: { enabled: false, balls: [], rules: [] },
        effectiveHuntId: seeded.huntId,
        effectiveLogicalTimeMs: 0,
      })));
    expect(second.status).toBe("accepted");
    if (second.status !== "accepted") return;
    expect(await withClient((client) => loadEffectivePolicyVersion(client, seeded.huntId, 0)))
      .toBe(second.policy.policyVersion);

    const stale = await withClient((client) => withTransaction(client, (transaction) =>
      insertAutoCapturePolicyInTransaction(transaction, {
        playerId: seeded.playerId,
        expectedRowVersion: 1n,
        ballAuthorityVersion: "balls:test",
        validationGameDataVersion: "game-data:test",
        enabled: true,
        policyJson: { enabled: true, balls: [], rules: [] },
        effectiveHuntId: seeded.huntId,
        effectiveLogicalTimeMs: 0,
      })));
    expect(stale).toEqual({ status: "stale", rowVersion: 2n });
  });

  it("exposes exact no-saved roots and accepts the first independent Potion/Revive policy versions at rowVersion 1", async () => {
    const playerId = await withClient(async (client) => {
      const id = await createPlayer(client);
      await withTransaction(client, (transaction) => ensureAndLockPlayerHuntRoot(transaction, id));
      return id;
    });
    const initialRoot = await withClient((client) => loadPlayerHuntRoot(client, playerId));
    expect(initialRoot).toMatchObject({
      currentAutoPotionPolicyVersion: null,
      autoPotionPolicyRowVersion: 0n,
      currentAutoRevivePolicyVersion: null,
      autoRevivePolicyRowVersion: 0n,
    });
    expect(await withClient((client) => loadCurrentAutoPotionPolicy(client, playerId))).toBeNull();
    expect(await withClient((client) => loadCurrentAutoRevivePolicy(client, playerId))).toBeNull();

    const potion = await withClient((client) => withTransaction(client, (transaction) =>
      insertAutoPotionPolicyInTransaction(transaction, {
        playerId,
        expectedRowVersion: 0n,
        itemRuleVersion: "item-rules:test",
        gameDataVersion: "game-data:test",
        rulesVersion: "rules:test",
        enabled: true,
        thresholdPercent: 50,
        policyJson: {
          enabled: true,
          thresholdPercent: 50,
          orderedItems: [{ itemId: "item:potion", autoUseEnabled: true, minimumReserve: "2" }],
        },
        effectiveHuntId: null,
        effectiveLogicalTimeMs: null,
      })));
    const revive = await withClient((client) => withTransaction(client, (transaction) =>
      insertAutoRevivePolicyInTransaction(transaction, {
        playerId,
        expectedRowVersion: 0n,
        itemRuleVersion: "item-rules:test",
        gameDataVersion: "game-data:test",
        rulesVersion: "rules:test",
        enabled: true,
        policyJson: {
          enabled: true,
          orderedItems: [{ itemId: "item:revive-25", autoUseEnabled: true, minimumReserve: "1" }],
        },
        effectiveHuntId: null,
        effectiveLogicalTimeMs: null,
      })));
    expect(potion.status).toBe("accepted");
    expect(revive.status).toBe("accepted");
    if (potion.status !== "accepted" || revive.status !== "accepted") return;
    expect(potion.policy).toMatchObject({
      rowVersion: 1n,
      itemRuleVersion: "item-rules:test",
      gameDataVersion: "game-data:test",
      rulesVersion: "rules:test",
      enabled: true,
      thresholdPercent: 50,
    });
    expect(revive.policy).toMatchObject({
      rowVersion: 1n,
      itemRuleVersion: "item-rules:test",
      gameDataVersion: "game-data:test",
      rulesVersion: "rules:test",
      enabled: true,
    });
    expect(await withClient((client) => loadPlayerHuntRoot(client, playerId))).toMatchObject({
      currentAutoPotionPolicyVersion: potion.policy.policyVersion,
      autoPotionPolicyRowVersion: 1n,
      currentAutoRevivePolicyVersion: revive.policy.policyVersion,
      autoRevivePolicyRowVersion: 1n,
    });
  });

  it("binds current Potion/Revive policy pointers to the same Player and exact OCC rowVersion", async () => {
    const [leftPlayerId, rightPlayerId] = await withClient(async (client) => {
      const left = await createPlayer(client);
      const right = await createPlayer(client);
      await withTransaction(client, async (transaction) => {
        await ensureAndLockPlayerHuntRoot(transaction, left);
        await ensureAndLockPlayerHuntRoot(transaction, right);
      });
      return [left, right] as const;
    });

    const rightPotion = await withClient((client) => withTransaction(client, (transaction) =>
      insertAutoPotionPolicyInTransaction(transaction, {
        playerId: rightPlayerId,
        expectedRowVersion: 0n,
        itemRuleVersion: "item-rules:test",
        gameDataVersion: "game-data:test",
        rulesVersion: "rules:test",
        enabled: true,
        thresholdPercent: 50,
        policyJson: { enabled: true, thresholdPercent: 50, orderedItems: [] },
        effectiveHuntId: null,
        effectiveLogicalTimeMs: null,
      })));
    const rightRevive = await withClient((client) => withTransaction(client, (transaction) =>
      insertAutoRevivePolicyInTransaction(transaction, {
        playerId: rightPlayerId,
        expectedRowVersion: 0n,
        itemRuleVersion: "item-rules:test",
        gameDataVersion: "game-data:test",
        rulesVersion: "rules:test",
        enabled: true,
        policyJson: { enabled: true, orderedItems: [] },
        effectiveHuntId: null,
        effectiveLogicalTimeMs: null,
      })));
    expect(rightPotion.status).toBe("accepted");
    expect(rightRevive.status).toBe("accepted");
    if (rightPotion.status !== "accepted" || rightRevive.status !== "accepted") return;

    await expect(withClient((client) => client.query(
      `UPDATE pokenexus.player_hunt_roots
          SET current_auto_potion_policy_version = $2, auto_potion_policy_row_version = 1
        WHERE player_id = $1`,
      [leftPlayerId, rightPotion.policy.policyVersion],
    ))).rejects.toMatchObject({ code: "23503" });
    await expect(withClient((client) => client.query(
      `UPDATE pokenexus.player_hunt_roots
          SET current_auto_revive_policy_version = $2, auto_revive_policy_row_version = 1
        WHERE player_id = $1`,
      [leftPlayerId, rightRevive.policy.policyVersion],
    ))).rejects.toMatchObject({ code: "23503" });

    const leftPotion = await withClient((client) => withTransaction(client, (transaction) =>
      insertAutoPotionPolicyInTransaction(transaction, {
        playerId: leftPlayerId,
        expectedRowVersion: 0n,
        itemRuleVersion: "item-rules:test",
        gameDataVersion: "game-data:test",
        rulesVersion: "rules:test",
        enabled: true,
        thresholdPercent: 50,
        policyJson: { enabled: true, thresholdPercent: 50, orderedItems: [] },
        effectiveHuntId: null,
        effectiveLogicalTimeMs: null,
      })));
    const leftRevive = await withClient((client) => withTransaction(client, (transaction) =>
      insertAutoRevivePolicyInTransaction(transaction, {
        playerId: leftPlayerId,
        expectedRowVersion: 0n,
        itemRuleVersion: "item-rules:test",
        gameDataVersion: "game-data:test",
        rulesVersion: "rules:test",
        enabled: true,
        policyJson: { enabled: true, orderedItems: [] },
        effectiveHuntId: null,
        effectiveLogicalTimeMs: null,
      })));
    expect(leftPotion.status).toBe("accepted");
    expect(leftRevive.status).toBe("accepted");
    if (leftPotion.status !== "accepted" || leftRevive.status !== "accepted") return;

    await expect(withClient((client) => client.query(
      `UPDATE pokenexus.player_hunt_roots
          SET auto_potion_policy_row_version = 2
        WHERE player_id = $1`,
      [leftPlayerId],
    ))).rejects.toMatchObject({ code: "23503" });
    await expect(withClient((client) => client.query(
      `UPDATE pokenexus.player_hunt_roots
          SET auto_revive_policy_row_version = 2
        WHERE player_id = $1`,
      [leftPlayerId],
    ))).rejects.toMatchObject({ code: "23503" });

    expect(await withClient((client) => loadCurrentAutoPotionPolicy(client, leftPlayerId)))
      .toMatchObject({ policyVersion: leftPotion.policy.policyVersion, rowVersion: 1n });
    expect(await withClient((client) => loadCurrentAutoRevivePolicy(client, leftPlayerId)))
      .toMatchObject({ policyVersion: leftRevive.policy.policyVersion, rowVersion: 1n });
  });

  it("keeps Potion and Revive OCC independent while serializing concurrent writers through the Player Hunt root", async () => {
    const playerId = await withClient(async (client) => {
      const id = await createPlayer(client);
      await withTransaction(client, (transaction) => ensureAndLockPlayerHuntRoot(transaction, id));
      return id;
    });
    const potionInput = {
      playerId,
      expectedRowVersion: 0n,
      itemRuleVersion: "item-rules:test",
      gameDataVersion: "game-data:test",
      rulesVersion: "rules:test",
      enabled: true,
      thresholdPercent: 60,
      policyJson: { enabled: true, thresholdPercent: 60, orderedItems: [] },
      effectiveHuntId: null,
      effectiveLogicalTimeMs: null,
    };
    const reviveInput = {
      playerId,
      expectedRowVersion: 0n,
      itemRuleVersion: "item-rules:test",
      gameDataVersion: "game-data:test",
      rulesVersion: "rules:test",
      enabled: false,
      policyJson: { enabled: false, orderedItems: [] },
      effectiveHuntId: null,
      effectiveLogicalTimeMs: null,
    };
    const [potion, revive] = await Promise.all([
      withClient((client) => withTransaction(client, (transaction) =>
        insertAutoPotionPolicyInTransaction(transaction, potionInput))),
      withClient((client) => withTransaction(client, (transaction) =>
        insertAutoRevivePolicyInTransaction(transaction, reviveInput))),
    ]);
    expect(potion.status).toBe("accepted");
    expect(revive.status).toBe("accepted");
    expect(await withClient((client) => loadPlayerHuntRoot(client, playerId))).toMatchObject({
      autoPotionPolicyRowVersion: 1n,
      autoRevivePolicyRowVersion: 1n,
    });

    const [left, right] = await Promise.all([
      withClient((client) => withTransaction(client, (transaction) =>
        insertAutoPotionPolicyInTransaction(transaction, { ...potionInput, expectedRowVersion: 1n }))),
      withClient((client) => withTransaction(client, (transaction) =>
        insertAutoPotionPolicyInTransaction(transaction, { ...potionInput, expectedRowVersion: 1n }))),
    ]);
    expect([left.status, right.status].sort()).toEqual(["accepted", "stale"]);
    expect(await withClient((client) => loadPlayerHuntRoot(client, playerId))).toMatchObject({
      autoPotionPolicyRowVersion: 2n,
      autoRevivePolicyRowVersion: 1n,
    });
  });

  it("retains immutable Potion/Revive versions and applies each family's active-Hunt interval prospectively", async () => {
    const seeded = await withClient(async (client) => {
      const playerId = await createPlayer(client);
      const hunt = await createHunt(client, playerId);
      await withTransaction(client, async (transaction) => {
        await insertInitialAutoPotionPolicyIntervalInTransaction(transaction, hunt.huntId, null);
        await insertInitialAutoRevivePolicyIntervalInTransaction(transaction, hunt.huntId, null);
      });
      return { playerId, ...hunt };
    });

    const firstPotion = await withClient((client) => withTransaction(client, (transaction) =>
      insertAutoPotionPolicyInTransaction(transaction, {
        playerId: seeded.playerId,
        expectedRowVersion: 0n,
        itemRuleVersion: "item-rules:v1",
        gameDataVersion: "game-data:test",
        rulesVersion: "rules:test",
        enabled: true,
        thresholdPercent: 70,
        policyJson: { enabled: true, thresholdPercent: 70, orderedItems: [] },
        effectiveHuntId: seeded.huntId,
        effectiveLogicalTimeMs: 500,
      })));
    const firstRevive = await withClient((client) => withTransaction(client, (transaction) =>
      insertAutoRevivePolicyInTransaction(transaction, {
        playerId: seeded.playerId,
        expectedRowVersion: 0n,
        itemRuleVersion: "item-rules:v1",
        gameDataVersion: "game-data:test",
        rulesVersion: "rules:test",
        enabled: true,
        policyJson: { enabled: true, orderedItems: [] },
        effectiveHuntId: seeded.huntId,
        effectiveLogicalTimeMs: 700,
      })));
    expect(firstPotion.status).toBe("accepted");
    expect(firstRevive.status).toBe("accepted");
    if (firstPotion.status !== "accepted" || firstRevive.status !== "accepted") return;
    expect(await withClient((client) => loadEffectiveAutoPotionPolicyVersion(client, seeded.huntId, 499))).toBeNull();
    expect(await withClient((client) => loadEffectiveAutoPotionPolicyVersion(client, seeded.huntId, 500)))
      .toBe(firstPotion.policy.policyVersion);
    expect(await withClient((client) => loadEffectiveAutoRevivePolicyVersion(client, seeded.huntId, 699))).toBeNull();
    expect(await withClient((client) => loadEffectiveAutoRevivePolicyVersion(client, seeded.huntId, 700)))
      .toBe(firstRevive.policy.policyVersion);

    const secondPotion = await withClient((client) => withTransaction(client, (transaction) =>
      insertAutoPotionPolicyInTransaction(transaction, {
        playerId: seeded.playerId,
        expectedRowVersion: 1n,
        itemRuleVersion: "item-rules:v2",
        gameDataVersion: "game-data:test",
        rulesVersion: "rules:test",
        enabled: false,
        thresholdPercent: 30,
        policyJson: { enabled: false, thresholdPercent: 30, orderedItems: [] },
        effectiveHuntId: seeded.huntId,
        effectiveLogicalTimeMs: 900,
      })));
    expect(secondPotion.status).toBe("accepted");
    if (secondPotion.status !== "accepted") return;
    expect(await withClient((client) => loadAutoPotionPolicyByVersion(
      client,
      seeded.playerId,
      firstPotion.policy.policyVersion,
    ))).toMatchObject({
      policyVersion: firstPotion.policy.policyVersion,
      rowVersion: 1n,
      itemRuleVersion: "item-rules:v1",
      thresholdPercent: 70,
      enabled: true,
    });
    expect(await withClient((client) => loadAutoRevivePolicyByVersion(
      client,
      seeded.playerId,
      firstRevive.policy.policyVersion,
    ))).toMatchObject({
      policyVersion: firstRevive.policy.policyVersion,
      rowVersion: 1n,
      itemRuleVersion: "item-rules:v1",
      enabled: true,
    });
    expect(await withClient((client) => loadEffectiveAutoPotionPolicyVersion(client, seeded.huntId, 899)))
      .toBe(firstPotion.policy.policyVersion);
    expect(await withClient((client) => loadEffectiveAutoPotionPolicyVersion(client, seeded.huntId, 900)))
      .toBe(secondPotion.policy.policyVersion);

    const stale = await withClient((client) => withTransaction(client, (transaction) =>
      insertAutoRevivePolicyInTransaction(transaction, {
        playerId: seeded.playerId,
        expectedRowVersion: 0n,
        itemRuleVersion: "item-rules:v2",
        gameDataVersion: "game-data:test",
        rulesVersion: "rules:test",
        enabled: false,
        policyJson: { enabled: false, orderedItems: [] },
        effectiveHuntId: seeded.huntId,
        effectiveLogicalTimeMs: 900,
      })));
    expect(stale).toEqual({ status: "stale", rowVersion: 1n });
    expect(await withClient((client) => loadEffectiveAutoRevivePolicyVersion(client, seeded.huntId, 900)))
      .toBe(firstRevive.policy.policyVersion);
  });

  it("moves the logical anchor with checkpoint time and anchors recovery to that terminal boundary", async () => {
    const seeded = await withClient(async (client) => {
      const playerId = await createPlayer(client);
      return { playerId, ...(await createHunt(client, playerId)) };
    });
    const hunt = await withClient((client) => loadOwnedSoloHunt(client, seeded.playerId, seeded.huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    const before = await withClient((client) => loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!before) throw new Error("missing checkpoint fixture");

    const advanced = await withClient((client) => withTransaction(client, async (transaction) => {
      await ensureAndLockPlayerHuntRoot(transaction, seeded.playerId);
      return persistOwnedHuntCheckpointInTransaction(transaction, {
        playerId: seeded.playerId,
        checkpointId: hunt.checkpointId,
        expectedRowVersion: before.rowVersion,
        schemaVersion: before.schemaVersion,
        logicalTimeMs: 100,
        stateBytes: before.stateBytes,
      });
    }));
    expect(advanced.status).toBe("updated");

    const after = await withClient((client) => loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!after) throw new Error("missing advanced checkpoint");
    expect(after.logicalTimeMs).toBe(100);
    expect(after.logicalTimeAnchorAt.getTime() - before.logicalTimeAnchorAt.getTime()).toBe(100);

    const terminal = await withClient((client) => withTransaction(client, (transaction) =>
      terminalizeSoloHuntInTransaction(transaction, {
        playerId: seeded.playerId,
        huntId: seeded.huntId,
        terminalReason: "retreat",
        recoveryDurationMs: 1_000,
      })));
    expect(terminal.hunt.terminalAt?.getTime()).toBe(after.logicalTimeAnchorAt.getTime());
    expect(terminal.recoveryReadyAt.getTime()).toBe(after.logicalTimeAnchorAt.getTime() + 1_000);
  });

  it("treats an unclassified heal cutoff as an advancement fence, then hands it to its Encounter boundary", async () => {
    const seeded = await withClient(async (client) => {
      const playerId = await createPlayer(client);
      return { playerId, ...(await createHunt(client, playerId)) };
    });
    const heal = await withClient((client) => createHeal(client, {
      ...seeded,
      idempotencyKey: generateUuidV7(),
      cutoff: 100,
    }));

    const atCutoff = await withClient((client) => loadEarliestHealingAdvanceBlocker(client, {
      huntId: seeded.huntId,
      logicalTimeMs: 100,
    }));
    expect(atCutoff).toMatchObject({
      commandId: heal.commandId,
      submissionPhase: null,
      submissionCutoffLogicalTimeMs: 100,
      dueLogicalTimeMs: null,
    });

    await withClient((client) => withTransaction(client, (transaction) =>
      classifyHealingCommandInTransaction(transaction, {
        commandId: heal.commandId,
        submissionPhase: "battle",
        submissionEncounterId: "encounter:one",
        dueLogicalTimeMs: null,
      })));
    expect(await withClient((client) => loadEarliestHealingAdvanceBlocker(client, {
      huntId: seeded.huntId,
      logicalTimeMs: 500,
    }))).toBeNull();

    await withClient((client) => withTransaction(client, (transaction) =>
      markHealingCommandsDueForEncounterInTransaction(transaction, {
        huntId: seeded.huntId,
        encounterId: "encounter:one",
        dueLogicalTimeMs: 450,
      })));
    expect(await withClient((client) => loadEarliestHealingAdvanceBlocker(client, {
      huntId: seeded.huntId,
      logicalTimeMs: 500,
    }))).toMatchObject({ commandId: heal.commandId, dueLogicalTimeMs: 450 });
  });

  it("orders multiple healing fences by boundary then acceptance sequence", async () => {
    const seeded = await withClient(async (client) => {
      const playerId = await createPlayer(client);
      return { playerId, ...(await createHunt(client, playerId)) };
    });
    const first = await withClient((client) => createHeal(client, {
      ...seeded,
      idempotencyKey: generateUuidV7(),
      cutoff: 200,
    }));
    const second = await withClient((client) => createHeal(client, {
      ...seeded,
      idempotencyKey: generateUuidV7(),
      cutoff: 200,
    }));
    expect(first.acceptanceSequence).toBeLessThan(second.acceptanceSequence);
    expect(await withClient((client) => loadEarliestHealingAdvanceBlocker(client, {
      huntId: seeded.huntId,
      logicalTimeMs: 200,
    }))).toMatchObject({ commandId: first.commandId });

    await withClient((client) => withTransaction(client, async (transaction) => {
      await classifyHealingCommandInTransaction(transaction, {
        commandId: first.commandId,
        submissionPhase: "inter_battle",
        submissionEncounterId: null,
        dueLogicalTimeMs: 200,
      });
      await resolveHealingCommandInTransaction(transaction, {
        commandId: first.commandId,
        outcome: "applied",
        reason: null,
        healedHp: 1,
      });
      await completePublicHuntCommandInTransaction(transaction, first.commandId, 200, { applied: true });
    }));
    expect(await withClient((client) => loadEarliestHealingAdvanceBlocker(client, {
      huntId: seeded.huntId,
      logicalTimeMs: 200,
    }))).toMatchObject({ commandId: second.commandId });
  });

  it("resolves scheduled-heal domain state after transport expiry while keeping the public key gone", async () => {
    const seeded = await withClient(async (client) => {
      const playerId = await createPlayer(client);
      return { playerId, ...(await createHunt(client, playerId)) };
    });
    const idempotencyKey = generateUuidV7();
    const heal = await withClient((client) => createHeal(client, {
      ...seeded,
      idempotencyKey,
      cutoff: 200,
    }));
    await withClient((client) => client.query(
      "UPDATE pokenexus.hunt_public_commands SET continuation_expires_at = clock_timestamp() - interval '1 millisecond' WHERE command_id = $1",
      [heal.commandId],
    ).then(() => undefined));

    const completed = await withClient((client) => withTransaction(client, async (transaction) => {
      await classifyHealingCommandInTransaction(transaction, {
        commandId: heal.commandId,
        submissionPhase: "inter_battle",
        submissionEncounterId: null,
        dueLogicalTimeMs: 200,
      });
      await resolveHealingCommandInTransaction(transaction, {
        commandId: heal.commandId,
        outcome: "applied",
        reason: null,
        healedHp: 5,
      });
      return completePublicHuntCommandInTransaction(transaction, heal.commandId, 200, {
        outcome: "applied",
        healedHp: 5,
      });
    }));
    expect(completed).toMatchObject({ status: "gone", resultHttpStatus: null, resultJson: null });
    expect(await withClient((client) => loadHealingCommandByCommandId(client, heal.commandId)))
      .toMatchObject({ status: "applied", resultReason: null, healedHp: 5 });

    const replay = await withClient((client) => withTransaction(client, (transaction) =>
      claimPublicHuntCommandInTransaction(transaction, {
        playerId: seeded.playerId,
        idempotencyKey,
        commandKind: "heal_item",
        intentHash: hash(200),
        intentJson: { itemId: "item:potion", targetPokemonInstanceId: seeded.pokemonInstanceId },
        sourceHuntId: seeded.huntId,
        advancementHuntId: seeded.huntId,
      })));
    expect(replay.status).toBe("gone");
  });

  it("rolls back pending-capture closure and public command completion as one transaction", async () => {
    const seeded = await withClient(async (client) => {
      const playerId = await createPlayer(client);
      return { playerId, ...(await createHunt(client, playerId)) };
    });
    const idempotencyKey = generateUuidV7();
    const command = await withClient((client) => withTransaction(client, async (transaction) => {
      const claimed = await claimPublicHuntCommandInTransaction(transaction, {
        playerId: seeded.playerId,
        idempotencyKey,
        commandKind: "manual_capture",
        intentHash: hash(7),
        intentJson: { encounterId: "encounter:pending", decision: "skip" },
        sourceHuntId: seeded.huntId,
        advancementHuntId: seeded.huntId,
      });
      if (claimed.status !== "accepted") throw new Error(`unexpected command status: ${claimed.status}`);
      await createPendingManualCaptureIfFreeInTransaction(transaction, {
        playerId: seeded.playerId,
        sourceHuntId: seeded.huntId,
        encounterId: "encounter:pending",
        speciesId: "species:pending",
        level: 10,
        catchRate: 120,
        shiny: false,
        captureEvidenceJson: { evidence: true },
      });
      return claimed.command;
    }));

    await expect(withClient((client) => withTransaction(client, async (transaction) => {
      expect(await closePendingManualCaptureInTransaction(transaction, {
        playerId: seeded.playerId,
        sourceHuntId: seeded.huntId,
        encounterId: "encounter:pending",
      })).toBe(true);
      await completePublicHuntCommandInTransaction(transaction, command.commandId, 200, { skipped: true });
      throw new Error("inject rollback after composed effects");
    }))).rejects.toThrow(/inject rollback/);

    expect(await withClient((client) => loadPendingManualCapture(client, seeded.playerId))).toMatchObject({
      sourceHuntId: seeded.huntId,
      encounterId: "encounter:pending",
    });
    expect(await withClient((client) => loadPublicHuntCommand(client, seeded.playerId, idempotencyKey))).toMatchObject({
      status: "pending",
      resultHttpStatus: null,
    });
  });

  it("rebases a Hunt checkpoint wall-clock anchor with explicit OCC and rejects a stale repeat", async () => {
    const seeded = await withClient(async (client) => {
      const playerId = await createPlayer(client);
      return { playerId, ...(await createHunt(client, playerId)) };
    });
    const hunt = await withClient((client) => loadOwnedSoloHunt(client, seeded.playerId, seeded.huntId));
    if (!hunt) throw new Error("missing Hunt fixture");
    const before = await withClient((client) => loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!before) throw new Error("missing checkpoint fixture");
    const targetAnchor = new Date("2026-09-28T03:00:00.000Z");

    const first = await withClient((client) => withTransaction(client, (transaction) =>
      rebaseOwnedHuntCheckpointAnchorInTransaction(transaction, {
        playerId: seeded.playerId,
        checkpointId: hunt.checkpointId,
        expectedRowVersion: before.rowVersion,
        expectedLogicalTimeMs: before.logicalTimeMs,
        logicalTimeAnchorAt: targetAnchor,
      })));
    expect(first).toEqual({ status: "updated", rowVersion: before.rowVersion + 1n });
    expect((await withClient((client) => loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId)))
      ?.logicalTimeAnchorAt.toISOString()).toBe(targetAnchor.toISOString());

    const stale = await withClient((client) => withTransaction(client, (transaction) =>
      rebaseOwnedHuntCheckpointAnchorInTransaction(transaction, {
        playerId: seeded.playerId,
        checkpointId: hunt.checkpointId,
        expectedRowVersion: before.rowVersion,
        expectedLogicalTimeMs: before.logicalTimeMs,
        logicalTimeAnchorAt: new Date("2026-09-29T03:00:00.000Z"),
      })));
    expect(stale).toMatchObject({
      status: "stale",
      rowVersion: before.rowVersion + 1n,
      logicalTimeMs: before.logicalTimeMs,
    });
  });

  it("rolls back a newly accepted healing command together with its domain record", async () => {
    const seeded = await withClient(async (client) => {
      const playerId = await createPlayer(client);
      return { playerId, ...(await createHunt(client, playerId)) };
    });
    const idempotencyKey = generateUuidV7();
    let commandId = "";
    await expect(withClient((client) => withTransaction(client, async (transaction) => {
      const claimed = await claimPublicHuntCommandInTransaction(transaction, {
        playerId: seeded.playerId,
        idempotencyKey,
        commandKind: "heal_item",
        intentHash: hash(9),
        intentJson: { itemId: "item:potion" },
        sourceHuntId: seeded.huntId,
        advancementHuntId: seeded.huntId,
      });
      if (claimed.status !== "accepted") throw new Error(`unexpected command status: ${claimed.status}`);
      commandId = claimed.command.commandId;
      await createHealingCommandInTransaction(transaction, {
        commandId,
        playerId: seeded.playerId,
        sourceHuntId: seeded.huntId,
        itemId: "item:potion",
        targetPokemonInstanceId: seeded.pokemonInstanceId,
        itemRuleVersion: "item-rules:test",
        gameDataVersion: "game-data:test",
        rulesVersion: "rules:test",
        submissionCutoffLogicalTimeMs: 10,
        submissionPhase: null,
        submissionEncounterId: null,
        dueLogicalTimeMs: null,
        acceptanceSequence: claimed.command.acceptanceSequence,
      });
      throw new Error("inject heal rollback");
    }))).rejects.toThrow(/inject heal rollback/);

    expect(await withClient((client) => loadPublicHuntCommand(client, seeded.playerId, idempotencyKey))).toBeNull();
    expect(await withClient((client) => loadHealingCommandByCommandId(client, commandId))).toBeNull();
    expect((await withClient((client) => loadPlayerHuntRoot(client, seeded.playerId)))?.commandSequence).toBe(0n);
  });

  it("persists immutable post-Battle Revive, Retreat, and bounded Hunt activity provenance", async () => {
    const seeded = await withClient(async (client) => {
      const playerId = await createPlayer(client);
      return { playerId, ...(await createHunt(client, playerId)) };
    });
    const hunt = await withClient((client) => loadOwnedSoloHunt(client, seeded.playerId, seeded.huntId));
    if (!hunt) throw new Error("missing provenance Hunt fixture");
    const checkpoint = await withClient((client) =>
      loadHuntCheckpoint(client, seeded.playerId, hunt.checkpointId));
    if (!checkpoint) throw new Error("missing provenance checkpoint fixture");
    const provenanceIdentity = "automation:post-battle-revive:1";
    const policyVersion = generateUuidV7();
    const encounterId = "encounter:resolved-non-win:1";
    const itemUse = {
      playerId: seeded.playerId,
      huntId: seeded.huntId,
      provenanceIdentity,
      automationFamily: "revive" as const,
      phase: "post_battle" as const,
      encounterId,
      encounterOrdinal: 1,
      targetPokemonInstanceId: seeded.pokemonInstanceId,
      targetCombatantId: "combatant:player:1",
      logicalTimeMs: 1250,
      policyVersion,
      itemId: "item:revive",
      itemRuleVersion: "item-rules:test",
      gameDataVersion: "game-data:test",
      rulesVersion: "rules:test",
      magnitudeJson: { kind: "max-hp-fraction", numerator: 1, denominator: 4 },
      appliedHp: 15,
      resultingHp: 15,
      inventoryRowVersionBefore: 7n,
      inventoryRowVersionAfter: 8n,
    };
    const postBattle = {
      playerId: seeded.playerId,
      huntId: seeded.huntId,
      provenanceIdentity,
      debitCorrelationIdentity: provenanceIdentity,
      huntRunIdentity: "hunt-run:post-battle-revive:test",
      encounterId,
      encounterOrdinal: 1,
      battleId: "battle:resolved-non-win:1",
      targetPokemonInstanceId: seeded.pokemonInstanceId,
      targetCombatantId: "combatant:player:1",
      logicalTimeMs: 1250,
      policyVersion,
      itemId: "item:revive",
      itemRuleVersion: "item-rules:test",
      gameDataVersion: "game-data:test",
      rulesVersion: "rules:test",
      reviveFractionNumerator: 1 as const,
      reviveFractionDenominator: 4 as const,
      appliedHp: 15,
      resultingHp: 15,
      resultingReadinessJson: { nextActionRemainingMs: 3000, moveCooldownRemainingMs: { first: 500 } },
      pendingSelectionIdentity: "pending:resolved-non-win:1",
      consumedPendingSelectionJson: {
        pendingSelectionIdentity: "pending:resolved-non-win:1",
        speciesId: "species:test",
      },
      completedEncounterProvenanceJson: {
        encounterId,
        encounterOrdinal: 1,
        terminalEventSequence: 9,
      },
      inventoryRowVersionBefore: 7n,
      inventoryRowVersionAfter: 8n,
    };
    const activityJson = {
      schemaVersion: "pokenexus.hunt-activity.v1",
      encounterOrdinal: 1,
      encounterId,
      resolvedAtHuntTimeMs: 1250,
      encounterDisposition: "resolved_non_win",
      consumedItems: [{ itemId: "item:revive", quantity: "1" }],
    };

    const inserted = await withClient((client) => withTransaction(client, async (transaction) => {
      expect(await insertAutomationItemUseInTransaction(transaction, itemUse))
        .toMatchObject({ status: "inserted" });
      const revive = await insertPostBattleReviveAppliedInTransaction(transaction, postBattle);
      const activity = await insertResolvedEncounterActivityInTransaction(transaction, {
        playerId: seeded.playerId,
        huntId: seeded.huntId,
        encounterOrdinal: 1,
        encounterId,
        resolvedLogicalTimeMs: 1250,
        encounterDisposition: "resolved_non_win",
        activityJson,
      });
      const retreat = await insertRetreatAbandonmentInTransaction(transaction, {
        playerId: seeded.playerId,
        huntId: seeded.huntId,
        huntRunIdentity: "hunt-run:post-battle-revive:test",
        logicalTimeMs: 1250,
        checkpointId: checkpoint.checkpointId,
        checkpointRowVersion: checkpoint.rowVersion,
        battleId: "battle:resolved-non-win:1",
        sideId: "side:player",
        combatantId: "combatant:player",
        koInterventionPending: true,
      });
      return { revive, activity, retreat };
    }));
    expect(inserted).toMatchObject({
      revive: { status: "inserted" },
      activity: { status: "inserted" },
      retreat: { status: "inserted" },
    });

    expect(await withClient((client) => loadPostBattleReviveAppliedByProvenance(client, {
      playerId: seeded.playerId,
      huntId: seeded.huntId,
      provenanceIdentity,
    }))).toMatchObject({
      huntRunIdentity: "hunt-run:post-battle-revive:test",
      encounterId,
      reviveFractionNumerator: 1,
      reviveFractionDenominator: 4,
      pendingSelectionIdentity: "pending:resolved-non-win:1",
      inventoryRowVersionBefore: 7n,
      inventoryRowVersionAfter: 8n,
    });
    expect(await withClient((client) => loadAutomationItemUsesForEncounter(client, {
      playerId: seeded.playerId,
      huntId: seeded.huntId,
      encounterOrdinal: 1,
    }))).toHaveLength(1);
    expect(await withClient((client) => loadRetreatAbandonment(client, {
      playerId: seeded.playerId,
      huntId: seeded.huntId,
    }))).toMatchObject({
      disposition: "abandoned_by_retreat",
      logicalTimeMs: 1250,
      battleId: "battle:resolved-non-win:1",
      sideId: "side:player",
      combatantId: "combatant:player",
      koInterventionPending: true,
    });

    const exactRetry = await withClient((client) => withTransaction(client, async (transaction) => ({
      revive: await insertPostBattleReviveAppliedInTransaction(transaction, postBattle),
      activity: await insertResolvedEncounterActivityInTransaction(transaction, {
        playerId: seeded.playerId,
        huntId: seeded.huntId,
        encounterOrdinal: 1,
        encounterId,
        resolvedLogicalTimeMs: 1250,
        encounterDisposition: "resolved_non_win",
        activityJson,
      }),
      retreat: await insertRetreatAbandonmentInTransaction(transaction, {
        playerId: seeded.playerId,
        huntId: seeded.huntId,
        huntRunIdentity: "hunt-run:post-battle-revive:test",
        logicalTimeMs: 1250,
        checkpointId: checkpoint.checkpointId,
        checkpointRowVersion: checkpoint.rowVersion,
        battleId: "battle:resolved-non-win:1",
        sideId: "side:player",
        combatantId: "combatant:player",
        koInterventionPending: true,
      }),
    })));
    expect(exactRetry).toMatchObject({
      revive: { status: "existing" },
      activity: { status: "existing" },
      retreat: { status: "existing" },
    });
    await expect(withClient((client) => withTransaction(client, (transaction) =>
      insertPostBattleReviveAppliedInTransaction(transaction, {
        ...postBattle,
        resultingHp: 16,
      })))).rejects.toThrow(/different immutable envelope/);
    await expect(withClient((client) => withTransaction(client, (transaction) =>
      insertResolvedEncounterActivityInTransaction(transaction, {
        playerId: seeded.playerId,
        huntId: seeded.huntId,
        encounterOrdinal: 1,
        encounterId,
        resolvedLogicalTimeMs: 1250,
        encounterDisposition: "resolved_non_win",
        activityJson: { ...activityJson, resolvedAtHuntTimeMs: 1251 },
      })))).rejects.toThrow(/different immutable payload/);
    await expect(withClient((client) => withTransaction(client, (transaction) =>
      insertRetreatAbandonmentInTransaction(transaction, {
        playerId: seeded.playerId,
        huntId: seeded.huntId,
        huntRunIdentity: "hunt-run:post-battle-revive:test",
        logicalTimeMs: 1251,
        checkpointId: checkpoint.checkpointId,
        checkpointRowVersion: checkpoint.rowVersion,
        battleId: "battle:resolved-non-win:1",
        sideId: "side:player",
        combatantId: "combatant:player",
        koInterventionPending: true,
      })))).rejects.toThrow(/different immutable envelope/);

    const page = await withClient((client) => loadResolvedEncounterActivityPage(client, {
      playerId: seeded.playerId,
      huntId: seeded.huntId,
      afterEncounterOrdinal: null,
      limit: 64,
    }));
    expect(page).toMatchObject({
      hasMore: false,
      records: [{ encounterOrdinal: 1, encounterId, encounterDisposition: "resolved_non_win" }],
    });
    await expect(withClient((client) => loadResolvedEncounterActivityPage(client, {
      playerId: seeded.playerId,
      huntId: seeded.huntId,
      afterEncounterOrdinal: null,
      limit: 65,
    }))).rejects.toThrow(/1\.\.64/);
  });

  it("rolls back automation provenance/activity atomically and anchors forward recovery to terminal transaction time", async () => {
    const seeded = await withClient(async (client) => {
      const playerId = await createPlayer(client);
      return { playerId, ...(await createHunt(client, playerId)) };
    });
    const policyVersion = generateUuidV7();
    const provenanceIdentity = "automation:rollback:1";
    await expect(withClient((client) => withTransaction(client, async (transaction) => {
      await insertAutomationItemUseInTransaction(transaction, {
        playerId: seeded.playerId,
        huntId: seeded.huntId,
        provenanceIdentity,
        automationFamily: "revive",
        phase: "post_battle",
        encounterId: "encounter:rollback:1",
        encounterOrdinal: 1,
        targetPokemonInstanceId: seeded.pokemonInstanceId,
        targetCombatantId: "combatant:rollback:1",
        logicalTimeMs: 2000,
        policyVersion,
        itemId: "item:revive",
        itemRuleVersion: "item-rules:test",
        gameDataVersion: "game-data:test",
        rulesVersion: "rules:test",
        magnitudeJson: { kind: "max-hp-fraction", numerator: 1, denominator: 4 },
        appliedHp: 10,
        resultingHp: 10,
        inventoryRowVersionBefore: 0n,
        inventoryRowVersionAfter: 1n,
      });
      await insertPostBattleReviveAppliedInTransaction(transaction, {
        playerId: seeded.playerId,
        huntId: seeded.huntId,
        provenanceIdentity,
        debitCorrelationIdentity: provenanceIdentity,
        huntRunIdentity: "hunt-run:rollback",
        encounterId: "encounter:rollback:1",
        encounterOrdinal: 1,
        battleId: "battle:rollback:1",
        targetPokemonInstanceId: seeded.pokemonInstanceId,
        targetCombatantId: "combatant:rollback:1",
        logicalTimeMs: 2000,
        policyVersion,
        itemId: "item:revive",
        itemRuleVersion: "item-rules:test",
        gameDataVersion: "game-data:test",
        rulesVersion: "rules:test",
        reviveFractionNumerator: 1,
        reviveFractionDenominator: 4,
        appliedHp: 10,
        resultingHp: 10,
        resultingReadinessJson: { nextActionRemainingMs: 3000 },
        pendingSelectionIdentity: "pending:rollback:1",
        consumedPendingSelectionJson: { pendingSelectionIdentity: "pending:rollback:1" },
        completedEncounterProvenanceJson: { encounterId: "encounter:rollback:1" },
        inventoryRowVersionBefore: 0n,
        inventoryRowVersionAfter: 1n,
      });
      await insertResolvedEncounterActivityInTransaction(transaction, {
        playerId: seeded.playerId,
        huntId: seeded.huntId,
        encounterOrdinal: 1,
        encounterId: "encounter:rollback:1",
        resolvedLogicalTimeMs: 2000,
        encounterDisposition: "resolved_non_win",
        activityJson: { encounterId: "encounter:rollback:1" },
      });
      throw new Error("inject automation provenance rollback");
    }))).rejects.toThrow(/inject automation provenance rollback/);
    expect(await withClient((client) => loadPostBattleReviveAppliedByProvenance(client, {
      playerId: seeded.playerId,
      huntId: seeded.huntId,
      provenanceIdentity,
    }))).toBeNull();
    expect(await withClient((client) => loadResolvedEncounterActivity(client, {
      playerId: seeded.playerId,
      huntId: seeded.huntId,
      encounterId: "encounter:rollback:1",
    }))).toBeNull();
    expect(await withClient((client) => loadAutomationItemUsesForEncounter(client, {
      playerId: seeded.playerId,
      huntId: seeded.huntId,
      encounterOrdinal: 1,
    }))).toEqual([]);

    const terminalAt = new Date("2026-09-28T10:15:30.000Z");
    const terminal = await withClient((client) => withTransaction(client, async (transaction) => {
      await ensureAndLockPlayerHuntRoot(transaction, seeded.playerId);
      return terminalizeSoloHuntInTransaction(transaction, {
        playerId: seeded.playerId,
        huntId: seeded.huntId,
        terminalReason: "retreat",
        recoveryDurationMs: 30_000,
        terminalAt,
      });
    }));
    expect(terminal.hunt.terminalAt?.toISOString()).toBe(terminalAt.toISOString());
    expect(terminal.recoveryReadyAt.toISOString())
      .toBe(new Date(terminalAt.getTime() + 30_000).toISOString());
  });

  it("samples forward terminal time at terminalization and derives the full 30-second recovery from it", async () => {
    const seeded = await withClient(async (client) => {
      const playerId = await createPlayer(client);
      return { playerId, ...(await createHunt(client, playerId)) };
    });

    const result = await withClient((client) => withTransaction(client, async (transaction) => {
      const root = await ensureAndLockPlayerHuntRoot(transaction, seeded.playerId);
      if (!root) throw new Error("missing forward terminal-time root");
      await transaction.query("SELECT pg_sleep(0.05)");
      const terminal = await terminalizeSoloHuntInTransaction(transaction, {
        playerId: seeded.playerId,
        huntId: seeded.huntId,
        terminalReason: "retreat",
        recoveryDurationMs: 30_000,
        terminalAt: "database_clock",
      });
      return { rootSample: root.databaseNow, terminal };
    }));

    expect(result.terminal.hunt.terminalAt).not.toBeNull();
    expect(result.terminal.hunt.terminalAt!.getTime() - result.rootSample.getTime()).toBeGreaterThanOrEqual(40);
    expect(result.terminal.recoveryReadyAt.getTime() - result.terminal.hunt.terminalAt!.getTime()).toBe(30_000);
  });
});
