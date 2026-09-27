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
  insertAutoCapturePolicyInTransaction,
  insertInitialPolicyIntervalInTransaction,
  loadCurrentAutoCapturePolicy,
  loadEffectivePolicyVersion,
  loadEarliestHealingAdvanceBlocker,
  loadHealingCommandByCommandId,
  loadHuntCheckpoint,
  loadOwnedSoloHunt,
  loadPendingManualCapture,
  loadPlayerHuntRoot,
  loadPublicHuntCommand,
  markHealingCommandsDueForEncounterInTransaction,
  persistOwnedHuntCheckpointInTransaction,
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
      const releasedAt = Date.now();
      await first.query("COMMIT");
      const acquired = await blocked;
      if (!acquired) throw new Error("blocked Player Hunt root disappeared");
      expect(acquired.databaseNow.getTime()).toBeGreaterThanOrEqual(releasedAt - 10);
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
});
