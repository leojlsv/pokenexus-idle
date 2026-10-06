import {
  appendHuntPresentationBattleInTransaction,
  canonicalPresentationJson,
  encodeOpaqueStringDbV1,
  generateUuidV7,
  insertHuntPresentationStreamInTransaction,
  loadHuntPresentationStream,
  sealHuntPresentationTerminalInTransaction,
  withPgClient,
  withTransaction,
  type HuntPresentationBattleWrite,
} from "@pokenexus/database";
import { runMigrations } from "@pokenexus/database/migrations";
import { describe, expect, it } from "vitest";
import { createPresentationCursorCodec } from "../src/hunts/presentation-cursor";
import { readHuntPresentationWithConsistentSnapshot } from "../src/hunts/presentation-read";

const enabled = process.env.POKENEXUS_RUN_PRESENTATION_BENCHMARK === "1";
const benchmarkDescribe = enabled ? describe : describe.skip;
const databaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;
const nowMs = 1_800_000_000_000;
const encoder = new TextEncoder();
const codec = createPresentationCursorCodec("benchmark", {
  benchmark: new Uint8Array(32).fill(71),
});

if (enabled) {
  if (!databaseUrl) throw new Error("POKENEXUS_TEST_DATABASE_URL is required for the TASK-103 benchmark");
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  if (!/^pokenexus_test(?:_|$)/u.test(databaseName)) {
    throw new Error("TASK-103 benchmark requires a disposable pokenexus_test* database");
  }
}

const dbUrl = (): string => {
  if (!databaseUrl) throw new Error("TASK-103 benchmark database is unavailable");
  return databaseUrl;
};

const opaque = (value: string): Buffer => Buffer.from(encodeOpaqueStringDbV1(value));
const bytes = (value: unknown): Uint8Array => encoder.encode(canonicalPresentationJson(value));

interface SeededHunt {
  readonly playerId: string;
  readonly huntId: string;
}

interface PageMetric {
  readonly wallMs: number;
  readonly cpuUserUs: number;
  readonly cpuSystemUs: number;
  readonly responseBytes: number;
  readonly battleCount: number;
  readonly eventCount: number;
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  readonly resumeCursor: string | null;
  readonly terminal: boolean;
}

async function resetSchema(): Promise<void> {
  await withPgClient({ connectionString: dbUrl() }, (client) =>
    client.query("DROP SCHEMA IF EXISTS pokenexus CASCADE").then(() => undefined));
  await runMigrations({ connectionString: dbUrl() });
}

async function seedHunt(): Promise<SeededHunt> {
  return withPgClient({ connectionString: dbUrl() }, async (client) => {
    const accountId = generateUuidV7();
    const playerId = generateUuidV7();
    const checkpointId = generateUuidV7();
    const huntId = generateUuidV7();
    await client.query("INSERT INTO pokenexus.accounts (account_id) VALUES ($1)", [accountId]);
    await client.query(
      "INSERT INTO pokenexus.players (player_id, account_id) VALUES ($1, $2)",
      [playerId, accountId],
    );
    await client.query(
      `INSERT INTO pokenexus.hunt_checkpoints (
         checkpoint_id, player_id, checkpoint_schema_version, game_data_version,
         rules_version, logical_time_ms, checkpoint_state_bytes, hunt_run_identity,
         logical_time_anchor_at
       ) VALUES ($1,$2,$3,$4,$5,0,$6,$7,to_timestamp($8 / 1000.0))`,
      [
        checkpointId,
        playerId,
        opaque("pokenexus.solo-hunt-checkpoint.v4"),
        opaque("game-data:benchmark"),
        opaque("rules:benchmark"),
        Buffer.from([1]),
        opaque(`hunt-run:${huntId}`),
        nowMs,
      ],
    );
    await client.query(
      `INSERT INTO pokenexus.solo_hunts (
         hunt_id, player_id, checkpoint_id, hunt_definition_id, zone_id,
         recovery_duration_ms, started_at
       ) VALUES ($1,$2,$3,$4,$5,30000,to_timestamp($6 / 1000.0))`,
      [
        huntId,
        playerId,
        checkpointId,
        opaque("hunt:benchmark"),
        opaque("zone:benchmark"),
        nowMs,
      ],
    );
    await withTransaction(client, (transaction) =>
      insertHuntPresentationStreamInTransaction(transaction, {
        playerId,
        huntId,
        inputSchemaVersion: "hunt-runtime-inputs-v4",
        checkpointSchemaVersion: "pokenexus.solo-hunt-checkpoint.v4",
        gameDataVersion: "game-data:benchmark",
        rulesVersion: "rules:benchmark",
        sourceEventSchemaVersion: "combat-source:benchmark",
        presentationSchemaVersion: "pokenexus.combat-presentation.v2",
      }));
    return { playerId, huntId };
  });
}

function publicOrigin() {
  return {
    initialSides: [
      { sideId: "owned-side", combatantIds: ["owned"], activeCombatantIds: ["owned"] },
      { sideId: "wild-side", combatantIds: ["wild"], activeCombatantIds: ["wild"] },
    ],
    initialParticipants: [
      {
        combatantId: "owned",
        sideId: "owned-side",
        identity: {
          kind: "owned_pokemon",
          pokemonInstanceId: "pokemon:benchmark",
          speciesId: "species:owned",
          level: 50,
          shiny: false,
        },
        vitality: {
          visibility: "exact",
          state: "conscious",
          currentHp: 100,
          maxHp: 100,
        },
      },
      {
        combatantId: "wild",
        sideId: "wild-side",
        identity: {
          kind: "wild_pokemon",
          speciesId: "species:wild",
          level: 50,
          shiny: false,
        },
        vitality: { visibility: "hidden", state: "conscious" },
      },
    ],
  } as const;
}

function battleChunk(encounterOrdinal: number, eventCount: number): HuntPresentationBattleWrite {
  if (eventCount < 2 || eventCount > 128) throw new RangeError("benchmark event count is invalid");
  const battleId = `battle:benchmark:${encounterOrdinal}`;
  const encounterId = `encounter:benchmark:${encounterOrdinal}`;
  const events: Array<{
    readonly sequence: number;
    readonly combatTimeMs: number;
    readonly publicEvent: Record<string, unknown>;
    readonly publicBytes: Uint8Array;
    readonly privateSourceBytes: Uint8Array;
  }> = [];
  for (let sequence = 1; sequence <= eventCount; sequence += 1) {
    const combatTimeMs = sequence === 1 ? 0 : (sequence - 1) * 100;
    const publicEvent: Record<string, unknown> = sequence === 1
      ? { kind: "BattleStarted", sequence, combatTimeMs, battleId }
      : sequence === eventCount
        ? {
            kind: "BattleEnded",
            sequence,
            combatTimeMs,
            outcome: { kind: "win", winnerSideId: "owned-side" },
          }
        : {
            kind: "MoveUsed",
            sequence,
            combatTimeMs,
            actorId: "owned",
            moveId: "move:benchmark",
            targetIds: ["wild"],
          };
    events.push({
      sequence,
      combatTimeMs,
      publicEvent,
      publicBytes: bytes(publicEvent),
      privateSourceBytes: bytes(publicEvent),
    });
  }
  const origin = publicOrigin();
  return {
    encounterId,
    encounterOrdinal,
    battleId,
    battleStartedAtHuntTimeMs: (encounterOrdinal - 1) * 10_000,
    initialSides: origin.initialSides,
    initialParticipants: origin.initialParticipants,
    privateOrigin: { encounterId, battleId, benchmarkOnly: true },
    continuationContext: {
      battleId,
      sourceCombatEventSchemaVersion: "combat-source:benchmark",
      lastSequence: eventCount,
      lastCombatTimeMs: (eventCount - 1) * 100,
    },
    publicEvents: events,
  };
}

async function appendBattle(
  hunt: SeededHunt,
  encounterOrdinal: number,
  eventCount: number,
): Promise<"appended" | "unavailable"> {
  return withPgClient({ connectionString: dbUrl() }, (client) =>
    withTransaction(client, (transaction) =>
      appendHuntPresentationBattleInTransaction(
        transaction,
        hunt.playerId,
        hunt.huntId,
        battleChunk(encounterOrdinal, eventCount),
        encounterOrdinal * 10_000,
      )));
}

async function relationBytes(): Promise<bigint> {
  return withPgClient({ connectionString: dbUrl() }, async (client) => {
    const result = await client.query<{ bytes: string }>(
      `SELECT (
         pg_total_relation_size('pokenexus.hunt_presentation_streams'::regclass)
         + pg_total_relation_size('pokenexus.hunt_presentation_battles'::regclass)
         + pg_total_relation_size('pokenexus.hunt_presentation_events'::regclass)
       )::bigint::text AS bytes`,
    );
    return BigInt(result.rows[0]?.bytes ?? "0");
  });
}

async function presentationCounts(hunt: SeededHunt): Promise<{
  readonly battles: number;
  readonly events: number;
}> {
  return withPgClient({ connectionString: dbUrl() }, async (client) => {
    const result = await client.query<{ battles: string; events: string }>(
      `SELECT
         (SELECT count(*) FROM pokenexus.hunt_presentation_battles WHERE hunt_id = $1)::text AS battles,
         (SELECT count(*) FROM pokenexus.hunt_presentation_events WHERE hunt_id = $1)::text AS events`,
      [hunt.huntId],
    );
    return {
      battles: Number(result.rows[0]?.battles ?? "0"),
      events: Number(result.rows[0]?.events ?? "0"),
    };
  });
}

async function measuredPage(
  hunt: SeededHunt,
  rawCursor?: string,
  limit = 128,
): Promise<PageMetric> {
  const cpu = process.cpuUsage();
  const started = performance.now();
  const result = await withPgClient({ connectionString: dbUrl() }, (client) =>
    readHuntPresentationWithConsistentSnapshot(client, {
      playerId: hunt.playerId,
      huntId: hunt.huntId,
      cursorCodec: codec,
      nowMs,
      limit,
      ...(rawCursor ? { rawCursor } : {}),
    }));
  const wallMs = performance.now() - started;
  const used = process.cpuUsage(cpu);
  expect(result.httpStatus).toBe(200);
  const body = result.body as {
    readonly battles: readonly {
      readonly presentation: { readonly events: readonly unknown[] };
    }[];
    readonly hasMore: boolean;
    readonly nextCursor: string | null;
    readonly resumeCursor: string | null;
    readonly stream: { readonly isTerminal: boolean };
  };
  return {
    wallMs,
    cpuUserUs: used.user,
    cpuSystemUs: used.system,
    responseBytes: Buffer.byteLength(JSON.stringify(result.body)),
    battleCount: body.battles.length,
    eventCount: body.battles.reduce(
      (sum, battle) => sum + battle.presentation.events.length,
      0,
    ),
    hasMore: body.hasMore,
    nextCursor: body.nextCursor,
    resumeCursor: body.resumeCursor,
    terminal: body.stream.isTerminal,
  };
}

async function sealTerminal(hunt: SeededHunt, ordinal: number, eventCount: number): Promise<void> {
  await withPgClient({ connectionString: dbUrl() }, (client) =>
    withTransaction(client, async (transaction) => {
      await transaction.query(
        `UPDATE pokenexus.solo_hunts
            SET terminal_at = to_timestamp($3 / 1000.0), terminal_reason = 'retreat'
          WHERE player_id = $1 AND hunt_id = $2`,
        [hunt.playerId, hunt.huntId, nowMs],
      );
      await sealHuntPresentationTerminalInTransaction(
        transaction,
        hunt.playerId,
        hunt.huntId,
        ordinal * 10_000,
        "2027-01-15T08:00:00.000000+00:00",
        {
          encounterOrdinal: ordinal,
          battleId: `battle:benchmark:${ordinal}`,
          terminalEventSequence: eventCount,
          requireBattleEnded: true,
        },
      );
    }));
}

async function proveOversizeDoesNotBlockHuntProgression(): Promise<void> {
  const hunt = await seedHunt();
  const normal = battleChunk(1, 2);
  const hugeEvent = {
    kind: "MoveUsed",
    sequence: 2,
    combatTimeMs: 100,
    actorId: "owned",
    moveId: "x".repeat(250 * 1024),
    targetIds: ["wild"],
  };
  const oversized: HuntPresentationBattleWrite = {
    ...normal,
    continuationContext: {
      battleId: normal.battleId,
      sourceCombatEventSchemaVersion: "combat-source:benchmark",
      lastSequence: 2,
      lastCombatTimeMs: 100,
    },
    publicEvents: [
      normal.publicEvents[0]!,
      {
        sequence: 2,
        combatTimeMs: 100,
        publicEvent: hugeEvent,
        publicBytes: bytes(hugeEvent),
        privateSourceBytes: bytes(hugeEvent),
      },
    ],
  };
  const outcome = await withPgClient({ connectionString: dbUrl() }, (client) =>
    withTransaction(client, async (transaction) => {
      await transaction.query(
        "UPDATE pokenexus.solo_hunts SET row_version = row_version + 1 WHERE player_id = $1 AND hunt_id = $2",
        [hunt.playerId, hunt.huntId],
      );
      return appendHuntPresentationBattleInTransaction(
        transaction,
        hunt.playerId,
        hunt.huntId,
        oversized,
        100,
      );
    }));
  expect(outcome).toBe("unavailable");
  await withPgClient({ connectionString: dbUrl() }, async (client) => {
    const huntRow = await client.query<{ row_version: string }>(
      "SELECT row_version::text FROM pokenexus.solo_hunts WHERE player_id = $1 AND hunt_id = $2",
      [hunt.playerId, hunt.huntId],
    );
    expect(huntRow.rows[0]?.row_version).toBe("1");
    expect((await loadHuntPresentationStream(client, hunt.playerId, hunt.huntId))?.status)
      .toBe("unavailable");
  });
}

benchmarkDescribe("TASK-103 disposable PostgreSQL presentation benchmark", () => {
  it("profiles bounded producer/read paths without public route or persistent database enablement", async () => {
    await resetSchema();
    const storageBefore = await relationBytes();

    const highHistory = await seedHunt();
    for (let ordinal = 1; ordinal <= 16; ordinal += 1) {
      expect(await appendBattle(highHistory, ordinal, 16)).toBe("appended");
    }
    expect(await presentationCounts(highHistory)).toEqual({ battles: 16, events: 256 });

    const pages: PageMetric[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 4; page += 1) {
      const metric = await measuredPage(highHistory, cursor);
      pages.push(metric);
      expect(metric.responseBytes).toBeLessThanOrEqual(256 * 1024);
      expect(metric.battleCount).toBeLessThanOrEqual(4);
      expect(metric.eventCount).toBeLessThanOrEqual(128);
      cursor = metric.nextCursor ?? undefined;
    }
    expect(pages.map((page) => page.eventCount)).toEqual([64, 64, 64, 64]);
    expect(pages[3]?.hasMore).toBe(false);
    expect(pages[3]?.resumeCursor).toBeTruthy();

    const cursorStarted = performance.now();
    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      expect((await codec.verify(
        pages[0]!.nextCursor!,
        { playerId: highHistory.playerId, huntId: highHistory.huntId },
        nowMs,
      )).status).toBe("valid");
    }
    const cursorDecode1000Ms = performance.now() - cursorStarted;

    const concurrentStarted = performance.now();
    const writerResults = await Promise.all(
      Array.from({ length: 4 }, () => appendBattle(highHistory, 17, 16)),
    );
    const concurrentWriterMs = performance.now() - concurrentStarted;
    expect(writerResults).toEqual(["appended", "appended", "appended", "appended"]);
    expect(await presentationCounts(highHistory)).toEqual({ battles: 17, events: 272 });

    const frozenAfterConcurrentWrite = await measuredPage(
      highHistory,
      pages[0]!.nextCursor!,
    );
    expect(frozenAfterConcurrentWrite.eventCount).toBe(64);

    let currentCursor: string | undefined;
    let currentResume: string;
    while (true) {
      const page = await measuredPage(highHistory, currentCursor);
      if (!page.hasMore) {
        expect(page.resumeCursor).toBeTruthy();
        currentResume = page.resumeCursor!;
        break;
      }
      currentCursor = page.nextCursor ?? undefined;
    }
    await sealTerminal(highHistory, 17, 16);
    const terminalPage = await measuredPage(highHistory, currentResume);
    expect(terminalPage.terminal).toBe(true);
    expect(terminalPage.eventCount).toBe(0);
    expect(terminalPage.resumeCursor).toBeNull();

    const dense = await seedHunt();
    expect(await appendBattle(dense, 1, 128)).toBe("appended");
    const densePage = await measuredPage(dense);
    expect(densePage.eventCount).toBe(128);
    expect(densePage.battleCount).toBe(1);
    expect(densePage.responseBytes).toBeLessThanOrEqual(256 * 1024);

    await proveOversizeDoesNotBlockHuntProgression();

    const storageAfter = await relationBytes();
    const report = {
      highHistory: {
        battles: 17,
        events: 272,
        firstPage: pages[0],
        middlePage: pages[1],
        latePage: pages[3],
        frozenAfterConcurrentWrite,
        terminalPage,
      },
      dense128: densePage,
      cursorDecode1000Ms,
      concurrentWriterMs,
      storageBeforeBytes: storageBefore.toString(),
      storageAfterBytes: storageAfter.toString(),
      storageGrowthBytes: (storageAfter - storageBefore).toString(),
      environment: "disposable postgres:17-alpine via loopback/tmpfs runner",
    };
    process.stdout.write("TASK103_PRESENTATION_BENCHMARK=" + JSON.stringify(report) + "\n");
  }, 60_000);
});
