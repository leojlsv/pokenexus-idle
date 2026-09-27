import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  commitHuntCheckpointAdvance,
  createHuntCheckpoint,
  createOrLoadPlayerByAccountId,
  generateUuidV7,
  freezeHuntCheckpointAdvance,
  loadHuntCheckpoint,
  loadHuntCheckpointAdvanceCommandByCorrelation,
  persistHuntCheckpointAdvanceProgress,
} from "../src/index";
import { runMigrations } from "../src/migrations";

const testDatabaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL is required for TASK-037 PostgreSQL integration tests");
}
const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
if (!/^pokenexus_test(?:_|$)/.test(databaseName)) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL must target pokenexus_test or pokenexus_test_*");
}

const bytes = (value: string) => new TextEncoder().encode(value);

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
  await createOrLoadPlayerByAccountId(client, accountId, playerId);
  return playerId;
}

async function seedCheckpoint(client: Client) {
  const playerId = await createPlayer(client);
  const checkpoint = await createHuntCheckpoint(client, {
    subjectPlayerId: playerId,
    huntRunIdentity: "hunt-run:task-037",
    schemaVersion: "pokenexus.solo-hunt-checkpoint.v1",
    gameDataVersion: "game-data:v3",
    rulesVersion: "rules:genetic-v1",
    logicalTimeMs: 100,
    logicalTimeAnchorAt: new Date("2026-09-26T23:20:00.000Z"),
    stateBytes: bytes("state:100"),
    now: new Date("2026-09-26T23:20:00.000Z"),
  });
  return { playerId, checkpoint };
}

afterAll(resetSchema);
beforeEach(prepareSchema);

describe("TASK-037 Hunt checkpoint persistence", () => {
  it("advances atomically, increments rowVersion once, and durably replays the same correlation", async () => {
    await withClient(async (client) => {
      const { playerId, checkpoint } = await seedCheckpoint(client);
      const freezeInput = {
        subjectPlayerId: playerId,
        checkpointId: checkpoint.checkpointId,
        commandCorrelation: "checkpoint-advance:1",
        targetLogicalTimeMs: 500,
        expectedCheckpointRowVersion: checkpoint.rowVersion,
        now: new Date("2026-09-26T23:21:00.000Z"),
      };
      const frozen = await freezeHuntCheckpointAdvance(client, freezeInput);
      expect(frozen).toMatchObject({ status: "accepted", replayed: false, command: { status: "pending" } });
      if (frozen.status !== "accepted") return;
      expect(frozen.command.baseCheckpointRowVersion).toBe(0n);
      expect(frozen.command.targetWallClockAt).toEqual(new Date("2026-09-26T23:20:00.400Z"));

      const input = {
        subjectPlayerId: playerId,
        checkpointId: checkpoint.checkpointId,
        commandCorrelation: "checkpoint-advance:1",
        targetLogicalTimeMs: 500,
        expectedCheckpointRowVersion: checkpoint.rowVersion,
        logicalTimeMs: 500,
        stateBytes: bytes("state:500"),
        now: new Date("2026-09-26T23:30:00.000Z"),
      };

      const first = await commitHuntCheckpointAdvance(client, input);
      expect(first).toMatchObject({ status: "accepted", replayed: false });
      if (first.status !== "accepted") return;
      expect(first.command.baseCheckpointRowVersion).toBe(0n);
      expect(first.command.status).toBe("advanced");
      expect(first.command.resultCheckpointRowVersion).toBe(1n);
      expect(first.command.resultLogicalTimeMs).toBe(500);
      expect(first.command.resultStateBytes).toEqual(bytes("state:500"));

      const stored = await loadHuntCheckpoint(client, playerId, checkpoint.checkpointId);
      expect(stored).toMatchObject({ logicalTimeMs: 500, rowVersion: 1n });
      expect(stored?.stateBytes).toEqual(bytes("state:500"));
      expect(stored?.logicalTimeAnchorAt).toEqual(new Date("2026-09-26T23:20:00.400Z"));
      expect(stored?.updatedAt).toEqual(new Date("2026-09-26T23:30:00.000Z"));

      const replay = await commitHuntCheckpointAdvance(client, input);
      expect(replay).toMatchObject({ status: "accepted", replayed: true });
      if (replay.status === "accepted") {
        expect(replay.command.commandId).toBe(first.command.commandId);
        expect(replay.command.resultStateBytes).toEqual(bytes("state:500"));
      }
      expect((await loadHuntCheckpoint(client, playerId, checkpoint.checkpointId))?.rowVersion).toBe(1n);
    });
  });

  it("persists bounded intermediate checkpoints and completes the frozen correlation only at final cutoff", async () => {
    await withClient(async (client) => {
      const { playerId, checkpoint } = await seedCheckpoint(client);
      const commandCorrelation = "checkpoint-advance:segmented";
      const frozen = await freezeHuntCheckpointAdvance(client, {
        subjectPlayerId: playerId,
        checkpointId: checkpoint.checkpointId,
        commandCorrelation,
        targetLogicalTimeMs: 500,
        expectedCheckpointRowVersion: checkpoint.rowVersion,
        now: new Date("2026-09-26T23:21:00.000Z"),
      });
      expect(frozen).toMatchObject({ status: "accepted", replayed: false, command: { status: "pending" } });
      if (frozen.status !== "accepted") return;

      const firstProgress = await persistHuntCheckpointAdvanceProgress(client, {
        subjectPlayerId: playerId,
        checkpointId: checkpoint.checkpointId,
        commandCorrelation,
        targetLogicalTimeMs: 500,
        expectedCheckpointRowVersion: 0n,
        logicalTimeMs: 250,
        stateBytes: bytes("state:250"),
        now: new Date("2026-09-26T23:21:00.100Z"),
      });
      expect(firstProgress).toMatchObject({
        status: "progressed",
        checkpoint: { logicalTimeMs: 250, rowVersion: 1n },
      });
      expect(await loadHuntCheckpointAdvanceCommandByCorrelation(
        client,
        playerId,
        commandCorrelation,
      )).toMatchObject({
        status: "pending",
        targetLogicalTimeMs: 500,
        baseCheckpointRowVersion: 0n,
      });

      const secondProgress = await persistHuntCheckpointAdvanceProgress(client, {
        subjectPlayerId: playerId,
        checkpointId: checkpoint.checkpointId,
        commandCorrelation,
        targetLogicalTimeMs: 500,
        expectedCheckpointRowVersion: 1n,
        logicalTimeMs: 400,
        stateBytes: bytes("state:400"),
        now: new Date("2026-09-26T23:21:00.200Z"),
      });
      expect(secondProgress).toMatchObject({
        status: "progressed",
        checkpoint: { logicalTimeMs: 400, rowVersion: 2n },
      });

      const completed = await commitHuntCheckpointAdvance(client, {
        subjectPlayerId: playerId,
        checkpointId: checkpoint.checkpointId,
        commandCorrelation,
        targetLogicalTimeMs: 500,
        expectedCheckpointRowVersion: 2n,
        logicalTimeMs: 500,
        stateBytes: bytes("state:500"),
        now: new Date("2026-09-26T23:21:00.300Z"),
      });
      expect(completed).toMatchObject({
        status: "accepted",
        replayed: false,
        command: {
          status: "advanced",
          baseCheckpointRowVersion: 0n,
          resultCheckpointRowVersion: 3n,
          resultLogicalTimeMs: 500,
        },
      });
      expect(await loadHuntCheckpoint(client, playerId, checkpoint.checkpointId)).toMatchObject({
        logicalTimeMs: 500,
        rowVersion: 3n,
      });
    });
  });

  it("treats changed target under the same correlation as a durable conflict", async () => {
    await withClient(async (client) => {
      const { playerId, checkpoint } = await seedCheckpoint(client);
      const base = {
        subjectPlayerId: playerId,
        checkpointId: checkpoint.checkpointId,
        commandCorrelation: "checkpoint-advance:conflict",
        targetLogicalTimeMs: 500,
        expectedCheckpointRowVersion: checkpoint.rowVersion,
        now: new Date("2026-09-26T23:21:00.000Z"),
      };
      expect(await freezeHuntCheckpointAdvance(client, base)).toMatchObject({
        status: "accepted",
        command: { status: "pending", targetLogicalTimeMs: 500 },
      });
      expect(await freezeHuntCheckpointAdvance(client, {
        ...base,
        targetLogicalTimeMs: 600,
      })).toEqual({ status: "conflict" });
      expect((await loadHuntCheckpoint(client, playerId, checkpoint.checkpointId))?.logicalTimeMs).toBe(100);
    });
  });

  it("returns stale without writing when the checkpoint rowVersion changed", async () => {
    await withClient(async (client) => {
      const { playerId, checkpoint } = await seedCheckpoint(client);
      const frozen = await freezeHuntCheckpointAdvance(client, {
        subjectPlayerId: playerId,
        checkpointId: checkpoint.checkpointId,
        commandCorrelation: "checkpoint-advance:stale",
        targetLogicalTimeMs: 500,
        expectedCheckpointRowVersion: checkpoint.rowVersion,
        now: new Date("2026-09-26T23:21:00.000Z"),
      });
      expect(frozen).toMatchObject({ status: "accepted", command: { status: "pending" } });
      await client.query(
        `UPDATE pokenexus.hunt_checkpoints
            SET logical_time_ms = 200, checkpoint_state_bytes = $3, row_version = row_version + 1
          WHERE player_id = $1 AND checkpoint_id = $2`,
        [playerId, checkpoint.checkpointId, Buffer.from(bytes("state:200"))],
      );
      const stale = await commitHuntCheckpointAdvance(client, {
        subjectPlayerId: playerId,
        checkpointId: checkpoint.checkpointId,
        commandCorrelation: "checkpoint-advance:stale",
        targetLogicalTimeMs: 500,
        expectedCheckpointRowVersion: 0n,
        logicalTimeMs: 500,
        stateBytes: bytes("state:500"),
        now: new Date("2026-09-26T23:21:00.000Z"),
      });
      expect(stale).toMatchObject({ status: "stale", checkpoint: { logicalTimeMs: 200, rowVersion: 1n } });
      expect(await loadHuntCheckpointAdvanceCommandByCorrelation(
        client,
        playerId,
        "checkpoint-advance:stale",
      )).toMatchObject({ status: "pending", targetLogicalTimeMs: 500, baseCheckpointRowVersion: 0n });
    });
  });

  it("marks a frozen target superseded when authoritative logical time already passed it", async () => {
    await withClient(async (client) => {
      const { playerId, checkpoint } = await seedCheckpoint(client);
      const frozen = await freezeHuntCheckpointAdvance(client, {
        subjectPlayerId: playerId,
        checkpointId: checkpoint.checkpointId,
        commandCorrelation: "checkpoint-advance:superseded",
        targetLogicalTimeMs: 600,
        expectedCheckpointRowVersion: checkpoint.rowVersion,
        now: new Date("2026-09-26T23:21:00.000Z"),
      });
      expect(frozen).toMatchObject({ status: "accepted", command: { status: "pending" } });
      await client.query(
        `UPDATE pokenexus.hunt_checkpoints
            SET logical_time_ms = 700, checkpoint_state_bytes = $3, row_version = row_version + 1
          WHERE player_id = $1 AND checkpoint_id = $2`,
        [playerId, checkpoint.checkpointId, Buffer.from(bytes("state:700"))],
      );
      const result = await commitHuntCheckpointAdvance(client, {
        subjectPlayerId: playerId,
        checkpointId: checkpoint.checkpointId,
        commandCorrelation: "checkpoint-advance:superseded",
        targetLogicalTimeMs: 600,
        expectedCheckpointRowVersion: 0n,
        logicalTimeMs: 600,
        stateBytes: bytes("state:600"),
        now: new Date("2026-09-26T23:21:00.000Z"),
      });
      expect(result).toMatchObject({
        status: "superseded",
        replayed: false,
        command: { status: "superseded", resultLogicalTimeMs: 700 },
      });
      const replay = await commitHuntCheckpointAdvance(client, {
        subjectPlayerId: playerId,
        checkpointId: checkpoint.checkpointId,
        commandCorrelation: "checkpoint-advance:superseded",
        targetLogicalTimeMs: 600,
        expectedCheckpointRowVersion: 1n,
        logicalTimeMs: 600,
        stateBytes: bytes("unused"),
        now: new Date("2026-09-26T23:40:00.000Z"),
      });
      expect(replay).toMatchObject({
        status: "superseded",
        replayed: true,
        command: { resultLogicalTimeMs: 700 },
      });
    });
  });

  it("serializes concurrent same-correlation commits into one accept plus one replay", async () => {
    let playerId = "";
    let checkpointId = "";
    await withClient(async (client) => {
      const seeded = await seedCheckpoint(client);
      playerId = seeded.playerId;
      checkpointId = seeded.checkpoint.checkpointId;
      const frozen = await freezeHuntCheckpointAdvance(client, {
        subjectPlayerId: playerId,
        checkpointId,
        commandCorrelation: "checkpoint-advance:concurrent",
        targetLogicalTimeMs: 500,
        expectedCheckpointRowVersion: seeded.checkpoint.rowVersion,
        now: new Date("2026-09-26T23:21:00.000Z"),
      });
      expect(frozen).toMatchObject({ status: "accepted", command: { status: "pending" } });
    });
    const input = {
      subjectPlayerId: playerId,
      checkpointId,
      commandCorrelation: "checkpoint-advance:concurrent",
      targetLogicalTimeMs: 500,
      expectedCheckpointRowVersion: 0n,
      logicalTimeMs: 500,
      stateBytes: bytes("state:500"),
      now: new Date("2026-09-26T23:21:00.000Z"),
    };
    const [left, right] = await Promise.all([
      withClient((client) => commitHuntCheckpointAdvance(client, input)),
      withClient((client) => commitHuntCheckpointAdvance(client, input)),
    ]);
    expect([left, right].every((result) => result.status === "accepted")).toBe(true);
    const accepted = [left, right].filter((result) => result.status === "accepted");
    if (accepted.every((result) => result.status === "accepted")) {
      expect(accepted.map((result) => result.replayed).sort()).toEqual([false, true]);
      expect(new Set(accepted.map((result) => result.command.commandId)).size).toBe(1);
    }
  });

  it("serializes same correlation across different checkpoints into one accept plus one conflict", async () => {
    let playerId = "";
    let firstCheckpointId = "";
    let secondCheckpointId = "";
    let schemaVersion = "";
    let gameDataVersion = "";
    let rulesVersion = "";
    await withClient(async (client) => {
      const seeded = await seedCheckpoint(client);
      playerId = seeded.playerId;
      firstCheckpointId = seeded.checkpoint.checkpointId;
      schemaVersion = seeded.checkpoint.schemaVersion;
      gameDataVersion = seeded.checkpoint.gameDataVersion;
      rulesVersion = seeded.checkpoint.rulesVersion;
      const second = await createHuntCheckpoint(client, {
        subjectPlayerId: playerId,
        huntRunIdentity: "hunt-run:task-037:second",
        schemaVersion,
        gameDataVersion,
        rulesVersion,
        logicalTimeMs: 100,
        logicalTimeAnchorAt: new Date("2026-09-26T23:20:00.000Z"),
        stateBytes: bytes("state:100:second"),
        now: new Date("2026-09-26T23:20:00.000Z"),
      });
      secondCheckpointId = second.checkpointId;
    });

    const base = {
      subjectPlayerId: playerId,
      commandCorrelation: "checkpoint-advance:cross-checkpoint:\u0000\ud800",
      targetLogicalTimeMs: 500,
      expectedCheckpointRowVersion: 0n,
      now: new Date("2026-09-26T23:21:00.000Z"),
    };
    const [left, right] = await Promise.all([
      withClient((client) => freezeHuntCheckpointAdvance(client, {
        ...base,
        checkpointId: firstCheckpointId,
      })),
      withClient((client) => freezeHuntCheckpointAdvance(client, {
        ...base,
        checkpointId: secondCheckpointId,
      })),
    ]);
    expect([left.status, right.status].sort()).toEqual(["accepted", "conflict"]);

    const accepted = left.status === "accepted" ? left : right.status === "accepted" ? right : undefined;
    expect(accepted).toBeDefined();
    if (!accepted || accepted.status !== "accepted") return;
    const acceptedCheckpointId = accepted.command.checkpointId;
    await withClient(async (client) => {
      const committed = await commitHuntCheckpointAdvance(client, {
        subjectPlayerId: playerId,
        checkpointId: acceptedCheckpointId,
        commandCorrelation: base.commandCorrelation,
        targetLogicalTimeMs: 500,
        expectedCheckpointRowVersion: 0n,
        logicalTimeMs: 500,
        stateBytes: bytes(`state:500:${acceptedCheckpointId}`),
        now: new Date("2026-09-26T23:21:00.000Z"),
      });
      expect(committed).toMatchObject({ status: "accepted", replayed: false });
    });

    await withClient(async (client) => {
      const first = await loadHuntCheckpoint(client, playerId, firstCheckpointId);
      const second = await loadHuntCheckpoint(client, playerId, secondCheckpointId);
      const advancedCount = [first, second].filter((checkpoint) => checkpoint?.logicalTimeMs === 500).length;
      expect(advancedCount).toBe(1);
    });
  });
});
