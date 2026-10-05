import { describe, expect, it } from "vitest";
import type {
  HuntPresentationPublicEvent,
  HuntPresentationPublicHeader,
} from "@pokenexus/database";
import {
  createPresentationCursorCodec,
  type PresentationCursorPosition,
  type PresentationCursorSnapshot,
} from "./presentation-cursor";
import { buildHuntPresentationPage } from "./presentation-page";

const playerId = "0199472a-0000-7000-8000-000000000003";
const huntId = "0199472a-0000-7000-8000-000000000101";
const now = 1_800_000_000_000;
const codec = createPresentationCursorCodec("first", { first: new Uint8Array(32).fill(47) });

function snapshot(highwater = "5", isTerminal = false): PresentationCursorSnapshot {
  return {
    publicationGeneration: "8",
    publishedEventIndex: highwater,
    publicPrefixDigest: Buffer.alloc(32, 0x31).toString("base64url"),
    committedLogicalTimeMs: "4000",
    isTerminal,
    presentationSchemaVersion: "pokenexus.combat-presentation.v1",
    gameDataVersion: "data:v1",
    rulesVersion: "rules:v1",
    sourceCombatEventSchemaVersion: "events:v1",
  };
}

function header(ordinal: number): HuntPresentationPublicHeader {
  return {
    encounterId: `encounter:${ordinal}`,
    encounterOrdinal: ordinal,
    battleId: `battle:${ordinal}`,
    battleStartedAtHuntTimeMs: 0,
    initialSides: [
      { sideId: "owned", combatantIds: ["owned"], activeCombatantIds: ["owned"] },
      { sideId: "wild", combatantIds: ["wild"], activeCombatantIds: ["wild"] },
    ],
    initialParticipants: [
      {
        combatantId: "owned", sideId: "owned",
        identity: {
          kind: "owned_pokemon", pokemonInstanceId: "pokemon:owned",
          speciesId: "species:owned", level: 12, shiny: true,
        },
        vitality: { visibility: "exact", state: "conscious", currentHp: 30, maxHp: 30 },
      },
      {
        combatantId: "wild", sideId: "wild",
        identity: {
          kind: "wild_pokemon", speciesId: "species:wild", level: 4, shiny: false,
        },
        vitality: { visibility: "hidden", state: "conscious" },
      },
    ],
    publicHeaderDigest: Buffer.alloc(32),
  };
}

const publicHeaders = new Map([
  ["battle:1", header(1)],
  ["battle:2", header(2)],
]);

function entry(
  index: bigint,
  battleId: string,
  sequence: number,
  kind: string,
  other: Record<string, unknown> = {},
): HuntPresentationPublicEvent {
  return {
    eventIndex: index,
    battleId,
    sequence,
    combatTimeMs: 0,
    publicEvent: {
      kind, sequence, combatTimeMs: 0,
      ...(kind === "BattleStarted" ? { battleId } : {}),
      ...(kind === "BattleEnded" ? { outcome: { kind: "win", winnerSideId: "owned" } } : {}),
      ...(kind === "MoveUsed" ? { actorId: "owned", moveId: "first", targetIds: ["wild"] } : {}),
      ...other,
    },
    publicBytes: Buffer.from("{}"),
    publicPrefixDigest: Buffer.alloc(32),
  };
}

function request(input: {
  readonly events?: readonly HuntPresentationPublicEvent[];
  readonly headers?: ReadonlyMap<string, HuntPresentationPublicHeader>;
  readonly highwater?: string;
  readonly terminal?: boolean;
  readonly after?: PresentationCursorPosition;
  readonly limit?: number;
} = {}) {
  return buildHuntPresentationPage({
    cursorCodec: codec,
    playerId, huntId, nowMs: now,
    limit: input.limit ?? 64,
    snapshot: snapshot(input.highwater, input.terminal),
    after: input.after ?? { kind: "before_first" },
    headers: input.headers ?? publicHeaders,
    events: input.events ?? [],
  });
}

describe("SPEC-017 isolated public-only Hunt page assembly (not an enabled HTTP route)", () => {
  it("retains authentic bootstrap schemas and zero-gap cross-Battle ordering with one next cursor", async () => {
    const events = [
      entry(1n, "battle:1", 1, "BattleStarted"),
      entry(2n, "battle:1", 2, "MoveUsed"),
      entry(3n, "battle:1", 3, "BattleEnded"),
      entry(4n, "battle:2", 1, "BattleStarted"),
    ];
    const result = await request({ events });
    expect(result).toMatchObject({
      huntId,
      presentationSchemaVersion: "pokenexus.combat-presentation.v1",
      sourceCombatEventSchemaVersion: "events:v1",
      stream: { committedLogicalTimeMs: "4000", isTerminal: false },
      hasMore: true,
      resumeCursor: null,
    });
    expect(result.battles.map((battle) =>
      [battle.encounterOrdinal, battle.battleStartedAtHuntTimeMs,
        battle.presentation.kind, battle.presentation.events.length])).toEqual([
      [1, "0", "bootstrap", 3],
      [2, "0", "bootstrap", 1],
    ]);
    expect(result.battles[0]!.presentation).toMatchObject({
      initialParticipants: expect.arrayContaining([
        expect.objectContaining({ vitality: { visibility: "hidden", state: "conscious" } }),
      ]),
    });
    const cursor = await codec.verify(result.nextCursor!, { playerId, huntId }, now + 1);
    expect(cursor).toMatchObject({
      status: "valid",
      cursor: {
        purpose: "next",
        snapshot: { publishedEventIndex: "5", publicationGeneration: "8" },
        position: {
          kind: "event", eventIndex: "4", battleId: "battle:2", lastSequence: 1,
        },
      },
    });
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(256 * 1024);
  });

  it("uses continuation without a repeated HP origin, and issues resume only when at the end", async () => {
    const result = await request({
      events: [entry(2n, "battle:1", 2, "MoveUsed")],
      highwater: "2",
      after: {
        kind: "event", eventIndex: "1", encounterOrdinal: 1,
        encounterId: "encounter:1", battleId: "battle:1",
        lastSequence: 1, lastCombatTimeMs: 0,
      },
    });
    expect(result.battles[0]!.presentation).toEqual({
      kind: "continuation",
      schemaVersion: "pokenexus.combat-presentation.v1",
      sourceCombatEventSchemaVersion: "events:v1",
      battleId: "battle:1",
      events: [entry(2n, "battle:1", 2, "MoveUsed").publicEvent],
    });
    expect(result).toMatchObject({ hasMore: false, nextCursor: null });
    expect((await codec.verify(result.resumeCursor!, { playerId, huntId }, now + 1)))
      .toMatchObject({ status: "valid", cursor: { purpose: "resume", position: { eventIndex: "2" } } });
  });

  it("supports an empty active polling sentinel but emits no cursor for an exhausted terminal Hunt", async () => {
    const empty = await request({ highwater: "0" });
    expect(empty.battles).toEqual([]);
    expect(empty.hasMore).toBe(false);
    expect(empty.nextCursor).toBeNull();
    expect((await codec.verify(empty.resumeCursor!, { playerId, huntId }, now)))
      .toMatchObject({ status: "valid", cursor: { position: { kind: "before_first" } } });
    const terminal = await request({
      highwater: "1", terminal: true,
      events: [entry(1n, "battle:1", 1, "BattleStarted")],
    });
    expect(terminal).toMatchObject({
      hasMore: false,
      nextCursor: null,
      resumeCursor: null,
      stream: { isTerminal: true },
    });
  });

  it("fails closed on wild exact-HP bootstrap, including extra forbidden private fields", async () => {
    const original = header(1);
    const participants = original.initialParticipants as readonly Record<string, unknown>[];
    const tampered: HuntPresentationPublicHeader = {
      ...original,
      initialParticipants: participants.map((candidate) =>
        (candidate as { combatantId?: string }).combatantId === "wild"
          ? { ...(candidate as object), vitality: { visibility: "exact", currentHp: 42, maxHp: 90 } }
          : candidate,
      ),
    };
    await expect(request({
      events: [entry(1n, "battle:1", 1, "BattleStarted")],
      headers: new Map([["battle:1", tampered]]),
    })).rejects.toThrow(/invalid/u);
    const withGenetics: HuntPresentationPublicHeader = {
      ...original,
      initialParticipants: participants.map((candidate) =>
        (candidate as { combatantId?: string }).combatantId === "wild"
          ? { ...(candidate as object), genetics: { hp: 31 } }
          : candidate,
      ),
    };
    await expect(request({
      events: [entry(1n, "battle:1", 1, "BattleStarted")],
      headers: new Map([["battle:1", withGenetics]]),
    })).rejects.toThrow(/invalid/u);
  });

  it("never accepts unmasked wild-source damage or exact HP in time-zero effect/healing events", async () => {
    const cases = [
      entry(2n, "battle:1", 2, "DamageApplied", {
        source: "move", actorId: "wild", targetId: "owned",
        hpChange: { visibility: "exact", amount: 11, resultingHp: 19 },
      }),
      entry(2n, "battle:1", 2, "DamageApplied", {
        source: "move", actorId: "owned", targetId: "wild",
        hpChange: { visibility: "exact", amount: 11, resultingHp: 19 },
      }),
      entry(2n, "battle:1", 2, "HealingApplied", {
        targetId: "owned", hpChange: { visibility: "exact", amount: 5, resultingHp: 30 },
      }),
      entry(2n, "battle:1", 2, "EffectTicked", {
        targetId: "owned", effectId: "effect:1", consequence: "healing",
        hpChange: { visibility: "exact", amount: 5, resultingHp: 30 },
      }),
    ];
    for (const event of cases) {
      await expect(request({
        highwater: "2",
        after: {
          kind: "event", eventIndex: "1", encounterOrdinal: 1,
          encounterId: "encounter:1", battleId: "battle:1",
          lastSequence: 1, lastCombatTimeMs: 0,
        },
        events: [event],
      })).rejects.toThrow(/invalid/u);
    }
  });

  it("rejects unknown or reordered events, wrong continuation identity and empty pages before highwater", async () => {
    await expect(request({ events: [entry(2n, "battle:1", 2, "MoveUsed")] }))
      .rejects.toThrow(/invalid/u);
    await expect(request({ events: [entry(1n, "battle:1", 1, "BattleStarted", { rngSeed: "private" })] }))
      .rejects.toThrow(/invalid/u);
    await expect(request({ events: [] }))
      .rejects.toThrow(/invalid/u);
    await expect(request({ events: [entry(1n, "battle:1", 1, "MoveUsed")] }))
      .rejects.toThrow(/invalid/u);
  });
});
