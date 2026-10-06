import { describe, expect, it } from "vitest";
import type {
  HuntPresentationPublicEvent,
  HuntPresentationPublicHeader,
  HuntPresentationPublicIndex,
  HuntPresentationPublicPosition,
  HuntPresentationPublicStreamRecord,
} from "@pokenexus/database";
import { createPresentationCursorCodec } from "./presentation-cursor";
import {
  parseHuntPresentationQuery,
  readHuntPresentationFromPort,
  type HuntPresentationReadPort,
} from "./presentation-read";

const playerId = "0199472a-0000-7000-8000-000000000003";
const huntId = "0199472a-0000-7000-8000-000000000101";
const foreign = "0199472a-0000-7000-8000-000000000004";
const now = 1_800_000_000_000;
const codec = createPresentationCursorCodec("current", {
  current: new Uint8Array(32).fill(63),
});

function fakeHeader(ordinal: number): HuntPresentationPublicHeader {
  return {
    battleId: `battle:${ordinal}`,
    encounterId: `encounter:${ordinal}`,
    encounterOrdinal: ordinal,
    battleStartedAtHuntTimeMs: 0,
    initialSides: [
      { sideId: "owned", combatantIds: ["owned"], activeCombatantIds: ["owned"] },
      { sideId: "wild", combatantIds: ["wild"], activeCombatantIds: ["wild"] },
    ],
    initialParticipants: [
      {
        combatantId: "owned", sideId: "owned",
        identity: { kind: "owned_pokemon", pokemonInstanceId: "pokemon:owned",
          speciesId: "species:owned", level: 10, shiny: true },
        vitality: { visibility: "exact", state: "conscious", currentHp: 30, maxHp: 30 },
      },
      {
        combatantId: "wild", sideId: "wild",
        identity: { kind: "wild_pokemon", speciesId: "species:wild", level: 4, shiny: false },
        vitality: { visibility: "hidden", state: "conscious" },
      },
    ],
    publicHeaderDigest: Buffer.alloc(32),
  };
}

function fakeEvent(
  eventIndex: bigint,
  battleId: string,
  sequence: number,
  kind: "BattleStarted" | "MoveUsed" | "BattleEnded",
): HuntPresentationPublicEvent {
  return {
    eventIndex, battleId, sequence, combatTimeMs: 0,
    publicEvent: {
      kind, sequence, combatTimeMs: 0,
      ...(kind === "BattleStarted" ? { battleId } : {}),
      ...(kind === "MoveUsed" ? { actorId: "owned", moveId: "first", targetIds: ["wild"] } : {}),
      ...(kind === "BattleEnded" ? { outcome: { kind: "win", winnerSideId: "owned" } } : {}),
    },
    publicBytes: Buffer.from("{}"),
    publicPrefixDigest: Buffer.alloc(32, Number(eventIndex)),
  };
}

class FakeReadPort implements HuntPresentationReadPort {
  readonly headersByBattleId = new Map([
    ["battle:1", fakeHeader(1)],
    ["battle:2", fakeHeader(2)],
  ]);
  readonly published: HuntPresentationPublicEvent[] = [
    fakeEvent(1n, "battle:1", 1, "BattleStarted"),
    fakeEvent(2n, "battle:1", 2, "MoveUsed"),
    fakeEvent(3n, "battle:1", 3, "BattleEnded"),
    fakeEvent(4n, "battle:2", 1, "BattleStarted"),
    fakeEvent(5n, "battle:2", 2, "MoveUsed"),
  ];
  streamRecord: HuntPresentationPublicStreamRecord = {
    huntId, playerId, status: "available", publishedEventIndex: 5n,
    publicPrefixDigest: Buffer.alloc(32, 5),
    publicationGeneration: 5n,
    committedLogicalTimeMs: 4000,
    isTerminal: false, presentationTerminalRecordedAtCeilMs: null,
    inputSchemaVersion: "hunt-runtime-inputs-v2",
    checkpointSchemaVersion: "pokenexus.solo-hunt-checkpoint.v3",
    gameDataVersion: "data:v1",
    rulesVersion: "rules:v1",
    sourceEventSchemaVersion: "events:v1",
    presentationSchemaVersion: "pokenexus.combat-presentation.v1",
  };
  owned = true;
  terminalAt: Date | null = null;
  readonly windows: Array<{ after: bigint; through: bigint; limit: number }> = [];
  readonly readCount = { owned: 0, stream: 0, prefix: 0, position: 0, index: 0, header: 0, event: 0 };

  ownedHunt(requestPlayerId: string, requestHuntId: string) {
    this.readCount.owned++;
    return Promise.resolve(this.owned && requestPlayerId === playerId && requestHuntId === huntId
      ? { terminalAt: this.terminalAt } : null);
  }
  stream(requestPlayerId: string, requestHuntId: string) {
    this.readCount.stream++;
    return Promise.resolve(requestPlayerId === playerId && requestHuntId === huntId
      ? this.streamRecord : null);
  }
  publicPrefix(_playerId: string, _huntId: string, index: bigint) {
    this.readCount.prefix++;
    return Promise.resolve(index === 0n ? Buffer.alloc(32)
      : this.published.find((entry) => entry.eventIndex === index)?.publicPrefixDigest ?? null);
  }
  positionAt(_playerId: string, _huntId: string, index: bigint) {
    this.readCount.position++;
    const event = this.published.find((entry) => entry.eventIndex === index);
    const header = event && this.headersByBattleId.get(event.battleId);
    return Promise.resolve(event && header ? {
      eventIndex: event.eventIndex,
      encounterId: header.encounterId,
      encounterOrdinal: header.encounterOrdinal,
      battleId: event.battleId,
      sequence: event.sequence,
      combatTimeMs: event.combatTimeMs,
    } satisfies HuntPresentationPublicPosition : null);
  }
  indexWindow(_playerId: string, _huntId: string, after: bigint, through: bigint, limit: number) {
    this.readCount.index++;
    this.windows.push({ after, through, limit });
    return Promise.resolve(this.published.filter((entry) =>
      entry.eventIndex > after && entry.eventIndex <= through)
      .slice(0, limit + 1)
      .map((entry): HuntPresentationPublicIndex => ({
        eventIndex: entry.eventIndex,
        battleId: entry.battleId,
        sequence: entry.sequence,
        combatTimeMs: entry.combatTimeMs,
        publicByteLength: 100,
      })));
  }
  headers(_playerId: string, _huntId: string, battleIds: readonly string[]) {
    this.readCount.header++;
    return Promise.resolve(new Map(battleIds.flatMap((id) =>
      this.headersByBattleId.has(id) ? [[id, this.headersByBattleId.get(id)!] as const] : [])));
  }
  events(_playerId: string, _huntId: string, indices: readonly HuntPresentationPublicIndex[]) {
    this.readCount.event++;
    return Promise.resolve(indices.map((index) =>
      this.published.find((entry) => entry.eventIndex === index.eventIndex)!));
  }
  append(event: HuntPresentationPublicEvent): void {
    this.published.push(event);
    this.streamRecord = {
      ...this.streamRecord,
      publishedEventIndex: event.eventIndex,
      publicPrefixDigest: event.publicPrefixDigest,
      publicationGeneration: this.streamRecord.publicationGeneration + 1n,
      committedLogicalTimeMs: this.streamRecord.committedLogicalTimeMs + 100,
    };
  }
}

async function call(port: FakeReadPort, input: {
  readonly limit?: number;
  readonly rawCursor?: string;
  readonly nowMs?: number;
  readonly player?: string;
} = {}) {
  return readHuntPresentationFromPort(port, {
    playerId: input.player ?? playerId,
    huntId,
    cursorCodec: codec,
    nowMs: input.nowMs ?? now,
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
    ...(input.rawCursor !== undefined ? { rawCursor: input.rawCursor } : {}),
  });
}

function successPage(result: Awaited<ReturnType<typeof call>>) {
  expect(result.httpStatus).toBe(200);
  return result.body as {
    readonly battles: Array<{
      readonly presentation: { readonly battleId: string; readonly events: readonly unknown[] };
    }>;
    readonly hasMore: boolean;
    readonly nextCursor: string | null;
    readonly resumeCursor: string | null;
    readonly stream: { readonly snapshotId: string; readonly committedLogicalTimeMs: string };
  };
}

describe("SPEC-017 isolated authenticated projection reader (no HTTP exposure)", () => {
  it("accepts only limit/cursor, rejects duplicates, and preserves the cursor-bound limit", () => {
    expect(parseHuntPresentationQuery(new URLSearchParams())).toEqual({});
    expect(parseHuntPresentationQuery(new URLSearchParams("limit=64&cursor=abc")))
      .toEqual({ limit: 64, rawCursor: "abc" });
    for (const invalid of [
      "limit=0", "limit=01", "limit=129", "limit=-1", "limit=1.0",
      "limit=1&limit=2", "cursor=a&cursor=b", "unsupported=true", "cursor=",
      "cursor=a.b", "cursor=a%3D", "cursor=%C3%A9",
    ]) expect(parseHuntPresentationQuery(new URLSearchParams(invalid))).toBeNull();
  });

  it("freezes every next page, then promotes only after a matching prefix for resume", async () => {
    const store = new FakeReadPort();
    const first = successPage(await call(store, { limit: 2 }));
    expect(first).toMatchObject({ hasMore: true, resumeCursor: null });
    expect(first.battles[0]!.presentation.events).toHaveLength(2);
    const frozenId = first.stream.snapshotId;
    store.append(fakeEvent(6n, "battle:2", 3, "BattleEnded"));
    const second = successPage(await call(store, { rawCursor: first.nextCursor! }));
    expect(second.stream.snapshotId).toBe(frozenId);
    expect(second.stream.committedLogicalTimeMs).toBe("4000");
    expect(second.battles.flatMap((battle) => battle.presentation.events)).toHaveLength(2);
    expect(store.windows.at(-1)).toEqual({ after: 2n, through: 5n, limit: 2 });
    const third = successPage(await call(store, { rawCursor: second.nextCursor! }));
    expect(third.hasMore).toBe(false);
    expect(third.nextCursor).toBeNull();
    expect(third.resumeCursor).not.toBeNull();
    expect(third.battles[0]!.presentation.events).toHaveLength(1);
    const promoted = successPage(await call(store, { rawCursor: third.resumeCursor! }));
    expect(promoted.stream.snapshotId).not.toBe(frozenId);
    expect(promoted.stream.committedLogicalTimeMs).toBe("4100");
    expect(promoted.battles[0]!.presentation.events).toHaveLength(1);
    expect(store.windows.at(-1)).toEqual({ after: 5n, through: 6n, limit: 2 });
    expect((successPage(await call(store, { rawCursor: first.nextCursor! })))
      .stream.snapshotId).toBe(frozenId);
  });

  it("never bypasses ownership, validates cursor signatures and TTL before reading events", async () => {
    const store = new FakeReadPort();
    store.owned = false;
    expect(await call(store, { rawCursor: "invalid" }))
      .toEqual({ httpStatus: 404, body: { error: "not_found" } });
    expect(store.readCount.stream).toBe(0);
    store.owned = true;
    expect(await call(store, { rawCursor: "invalid" }))
      .toEqual({ httpStatus: 400, body: { error: "invalid_request" } });
    expect(store.readCount.index).toBe(0);
    const first = successPage(await call(store, { limit: 1 }));
    expect(await call(store, { rawCursor: first.nextCursor!, limit: 2 }))
      .toEqual({ httpStatus: 400, body: { error: "invalid_request" } });
    expect(await call(store, { rawCursor: first.nextCursor!, player: foreign }))
      .toEqual({ httpStatus: 404, body: { error: "not_found" } });
    expect(await call(store, { rawCursor: first.nextCursor!, nowMs: now + 15 * 60 * 1000 }))
      .toEqual({ httpStatus: 410, body: { error: "cursor_expired" } });
  });

  it("validates an owned Hunt cursor before exposing presentation retention or unavailable state", async () => {
    const unavailable = new FakeReadPort();
    unavailable.streamRecord = { ...unavailable.streamRecord, status: "unavailable" };
    expect(await call(unavailable, { rawCursor: "invalid" }))
      .toEqual({ httpStatus: 400, body: { error: "invalid_request" } });

    const expiredPresentation = new FakeReadPort();
    expiredPresentation.terminalAt = new Date(now - 1000);
    expiredPresentation.streamRecord = {
      ...expiredPresentation.streamRecord,
      isTerminal: true,
      presentationTerminalRecordedAtCeilMs: BigInt(now - 30 * 24 * 60 * 60 * 1000),
    };
    expect(await call(expiredPresentation, { rawCursor: "invalid" }))
      .toEqual({ httpStatus: 400, body: { error: "invalid_request" } });

    const source = new FakeReadPort();
    const first = successPage(await call(source, { limit: 1 }));
    unavailable.streamRecord = { ...unavailable.streamRecord, status: "unavailable" };
    expect(await call(unavailable, {
      rawCursor: first.nextCursor!,
      nowMs: now + 15 * 60 * 1000,
    })).toEqual({ httpStatus: 410, body: { error: "cursor_expired" } });
  });

  it("returns snapshot_changed when a prior signed prefix is no longer retained or authentic", async () => {
    const store = new FakeReadPort();
    const first = successPage(await call(store, { limit: 2 }));
    store.published[4] = { ...store.published[4]!, publicPrefixDigest: Buffer.alloc(32, 0x42) };
    expect(await call(store, { rawCursor: first.nextCursor! }))
      .toEqual({ httpStatus: 409, body: { error: "snapshot_changed" } });
  });

  it("rejects a signed cursor whose stored historical position has changed without changing the tail digest", async () => {
    const store = new FakeReadPort();
    const first = successPage(await call(store, { limit: 3 }));
    expect(first.nextCursor).not.toBeNull();
    // A changed historical sequence can preserve the stored last prefix digest;
    // the subsequent page starts at Battle 2 and otherwise looks locally valid.
    store.published[2] = { ...store.published[2]!, sequence: 4 };
    expect(await call(store, { rawCursor: first.nextCursor! }))
      .toEqual({ httpStatus: 409, body: { error: "snapshot_changed" } });
  });

  it("checks the signed position even for an empty active-Hunt resume poll", async () => {
    const store = new FakeReadPort();
    const first = successPage(await call(store, { limit: 5 }));
    expect(first.hasMore).toBe(false);
    expect(first.resumeCursor).not.toBeNull();
    expect((await call(store, { rawCursor: first.resumeCursor! })).httpStatus).toBe(200);
    store.published[4] = { ...store.published[4]!, combatTimeMs: 1 };
    expect(await call(store, { rawCursor: first.resumeCursor! }))
      .toEqual({ httpStatus: 409, body: { error: "snapshot_changed" } });
  });

  it("checks Encounter and Battle identity as well as event sequence at a cursor boundary", async () => {
    const variants: Array<(store: FakeReadPort) => void> = [
      (store) => { store.headersByBattleId.set("battle:1", {
        ...store.headersByBattleId.get("battle:1")!, encounterId: "encounter:forged",
      }); },
      (store) => { store.headersByBattleId.set("battle:1", {
        ...store.headersByBattleId.get("battle:1")!, encounterOrdinal: 9,
      }); },
      (store) => { store.published[2] = { ...store.published[2]!, battleId: "battle:2" }; },
      (store) => { store.published.splice(2, 1); },
    ];
    for (const mutate of variants) {
      const store = new FakeReadPort();
      const first = successPage(await call(store, { limit: 3 }));
      mutate(store);
      expect(await call(store, { rawCursor: first.nextCursor! }))
        .toEqual({ httpStatus: 409, body: { error: "snapshot_changed" } });
    }
  });

  it("uses the presentation seal date for the 30-day retention window and never serves an unsealed terminal Hunt", async () => {
    const store = new FakeReadPort();
    store.terminalAt = new Date(now - 1000);
    expect(await call(store))
      .toEqual({ httpStatus: 503, body: { error: "presentation_temporarily_unavailable" } });
    store.streamRecord = {
      ...store.streamRecord, isTerminal: true,
      presentationTerminalRecordedAtCeilMs: BigInt(now - 30 * 24 * 60 * 60 * 1000),
    };
    expect((await call(store, { nowMs: now - 1 })).httpStatus).toBe(200);
    expect(await call(store))
      .toEqual({ httpStatus: 410, body: { error: "presentation_expired" } });
    store.streamRecord = {
      ...store.streamRecord,
      presentationTerminalRecordedAtCeilMs: BigInt(now - 30 * 24 * 60 * 60 * 1000 + 1),
    };
    expect((await call(store)).httpStatus).toBe(200);
    store.streamRecord = { ...store.streamRecord, status: "unavailable" };
    expect(await call(store))
      .toEqual({ httpStatus: 410, body: { error: "presentation_unavailable" } });
  });

  it("fails closed on an unsupported legacy presentation authority tuple without reconstruction", async () => {
    const store = new FakeReadPort();
    store.streamRecord = {
      ...store.streamRecord,
      inputSchemaVersion: "hunt-runtime-inputs-v1",
      checkpointSchemaVersion: "pokenexus.solo-hunt-checkpoint.v2",
      presentationSchemaVersion: "pokenexus.combat-presentation.v1",
    };
    expect(await call(store)).toEqual({
      httpStatus: 410,
      body: { error: "presentation_unavailable" },
    });
    expect(store.readCount.index).toBe(0);
  });

  it("does not expire early when the PostgreSQL terminal anchor has fractional milliseconds", async () => {
    const retentionMs = 30 * 24 * 60 * 60 * 1000;
    for (const anchorFractionMicroseconds of [1, 999]) {
      const store = new FakeReadPort();
      store.terminalAt = new Date(now - retentionMs);
      const exactAnchorUs = BigInt(now - retentionMs) * 1000n
        + BigInt(anchorFractionMicroseconds);
      store.streamRecord = {
        ...store.streamRecord,
        isTerminal: true,
        presentationTerminalRecordedAtCeilMs: (exactAnchorUs + 999n) / 1000n,
      };
      // At whole-millisecond now, the exact deadline remains 1µs or 999µs ahead.
      expect(exactAnchorUs + BigInt(retentionMs) * 1000n - BigInt(now) * 1000n)
        .toBe(BigInt(anchorFractionMicroseconds));
      expect((await call(store, { nowMs: now })).httpStatus).toBe(200);
      expect(await call(store, { nowMs: now + 1 })).toEqual({
        httpStatus: 410, body: { error: "presentation_expired" },
      });
    }
  });

  it("uses 720 elapsed UTC hours across a daylight-saving offset change", async () => {
    const retentionMs = 30 * 24 * 60 * 60 * 1000;
    const firstInstant = Date.parse("2026-11-01T01:30:00-04:00");
    const secondInstant = Date.parse("2026-11-01T01:30:00-05:00");
    expect(secondInstant - firstInstant).toBe(60 * 60 * 1000);
    for (const anchoredMs of [firstInstant, secondInstant]) {
      const store = new FakeReadPort();
      store.terminalAt = new Date(anchoredMs);
      store.streamRecord = {
        ...store.streamRecord,
        isTerminal: true,
        presentationTerminalRecordedAtCeilMs: BigInt(anchoredMs),
      };
      expect((await call(store, { nowMs: anchoredMs + retentionMs - 1 })).httpStatus).toBe(200);
      expect(await call(store, { nowMs: anchoredMs + retentionMs })).toEqual({
        httpStatus: 410, body: { error: "presentation_expired" },
      });
    }
  });

  it("polls the signed before-first sentinel without fabricating a Battle", async () => {
    const store = new FakeReadPort();
    store.published.splice(0);
    store.streamRecord = {
      ...store.streamRecord, publishedEventIndex: 0n,
      publicPrefixDigest: Buffer.alloc(32),
    };
    const empty = successPage(await call(store));
    expect(empty).toMatchObject({ hasMore: false, battles: [], nextCursor: null });
    expect(empty.resumeCursor).not.toBeNull();
    store.append(fakeEvent(1n, "battle:1", 1, "BattleStarted"));
    const resumed = successPage(await call(store, { rawCursor: empty.resumeCursor! }));
    expect(resumed.battles[0]!.presentation.battleId).toBe("battle:1");
    expect(resumed.battles[0]!.presentation.events).toHaveLength(1);
  });

  it("fails closed rather than returning a wild HP disclosure in a stored public header", async () => {
    const store = new FakeReadPort();
    const original = store.headersByBattleId.get("battle:1")!;
    store.headersByBattleId.set("battle:1", {
      ...original,
      initialParticipants: [
        { combatantId: "wild", sideId: "wild",
          identity: { kind: "wild_pokemon", speciesId: "species:wild", level: 4, shiny: false },
          vitality: { visibility: "exact", currentHp: 44, maxHp: 50 } },
      ],
    });
    expect(await call(store, { limit: 1 }))
      .toEqual({ httpStatus: 410, body: { error: "presentation_unavailable" } });
  });

  it("bounds full-JSON page shrinking logarithmically when a large valid header exceeds the response ceiling", async () => {
    const store = new FakeReadPort();
    const base = fakeHeader(1);
    const wildTargets = [
      `wild-a:${"a".repeat(480)}`,
      `wild-b:${"b".repeat(480)}`,
    ];
    const fillers = Array.from({ length: 200 }, (_, index) => ({
      combatantId: `filler:${index}`,
      sideId: "wild",
      identity: {
        kind: "wild_pokemon", speciesId: `species:${"s".repeat(300)}`,
        level: 4, shiny: false,
      },
      vitality: { visibility: "hidden", state: "conscious" },
    }));
    const wildParticipants = wildTargets.map((id) => ({
      combatantId: id,
      sideId: "wild",
      identity: { kind: "wild_pokemon", speciesId: "species:wild", level: 4, shiny: false },
      vitality: { visibility: "hidden", state: "conscious" },
    }));
    const expanded: HuntPresentationPublicHeader = {
      ...base,
      initialParticipants: [...(base.initialParticipants as readonly unknown[]),
        ...wildParticipants, ...fillers],
      initialSides: [
        (base.initialSides as readonly unknown[])[0],
        {
          sideId: "wild",
          combatantIds: ["wild", ...wildTargets, ...fillers.map((candidate) => candidate.combatantId)],
          activeCombatantIds: ["wild"],
        },
      ],
    };
    store.headersByBattleId.set("battle:1", expanded);
    store.published.splice(0);
    for (let sequence = 1; sequence <= 128; sequence += 1) {
      const started = sequence === 1;
      store.published.push({
        eventIndex: BigInt(sequence),
        battleId: "battle:1",
        sequence,
        combatTimeMs: 0,
        publicEvent: started
          ? { kind: "BattleStarted", battleId: "battle:1", sequence, combatTimeMs: 0 }
          : {
              kind: "MoveUsed", sequence, combatTimeMs: 0, actorId: "owned",
              moveId: "m".repeat(500), targetIds: wildTargets,
            },
        publicBytes: Buffer.from("{}"),
        publicPrefixDigest: Buffer.alloc(32, sequence),
      });
    }
    store.streamRecord = {
      ...store.streamRecord,
      publishedEventIndex: 128n,
      publicPrefixDigest: store.published[127]!.publicPrefixDigest,
    };
    let signatures = 0;
    const measuredCodec = {
      issue: async (...args: Parameters<typeof codec.issue>) => {
        signatures += 1;
        return codec.issue(...args);
      },
      verify: (...args: Parameters<typeof codec.verify>) => codec.verify(...args),
    };
    const result = await readHuntPresentationFromPort(store, {
      playerId, huntId, cursorCodec: measuredCodec, nowMs: now, limit: 128,
    });
    const page = successPage(result);
    expect(page.hasMore).toBe(true);
    expect(page.battles[0]!.presentation.events.length).toBeGreaterThan(0);
    expect(page.battles[0]!.presentation.events.length).toBeLessThan(128);
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(256 * 1024);
    expect(signatures).toBeLessThanOrEqual(9);
  });
});
