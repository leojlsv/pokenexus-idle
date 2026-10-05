import { describe, expect, it } from "vitest";
import type { CombatEvent, CombatEventSchemaVersion } from "@pokenexus/game-core";
import {
  projectCombatPresentationBootstrapV2,
  projectCombatPresentationContinuationV2,
  type CombatPresentationBootstrapParticipantSourceV1,
} from "@pokenexus/game-protocol";
import type {
  HuntPresentationPublicEvent,
  HuntPresentationPublicHeader,
} from "@pokenexus/database";
import { createPresentationCursorCodec } from "./presentation-cursor";
import { buildHuntPresentationPage } from "./presentation-page";
import {
  createPublicJsonPrivacyOracle,
  deny,
  object,
  type BattlePrivacyRoles,
} from "./testing/presentation-privacy-oracle";

const playerId = "0199472a-0000-7000-8000-000000000003";
const huntId = "0199472a-0000-7000-8000-000000000101";
const battleId = "battle:privacy-oracle";
const nowMs = 1_800_000_000_000;
const secretProbe = "task103-private-oracle-canary";
const codec = createPresentationCursorCodec("test", {
  test: new Uint8Array(32).fill(73),
});
const allSourceEventKinds = [
  "BattleStarted", "MoveUsed", "MoveMissed", "MoveImmune", "CriticalHit",
  "DamageApplied", "CombatantKO", "CombatantActivated", "BattleEnded",
  "CombatantRevived",
  "EffectApplied", "EffectUpdated", "EffectRemoved", "EffectTicked",
  "HealingApplied", "StatStageChanged",
] as const satisfies readonly CombatEvent["kind"][];
type UncoveredSourceKind = Exclude<CombatEvent["kind"], typeof allSourceEventKinds[number]>;
const sourceKindCoverage: [UncoveredSourceKind] extends [never] ? true : never = true;
const sourceKinds: ReadonlyMap<string, "owned" | "wild"> = new Map([
  ["owned", "owned"],
  ["owned-reserve", "owned"],
  ["wild", "wild"],
]);
const rolesByBattle: BattlePrivacyRoles = new Map([[battleId, sourceKinds]]);

function auditPublicJson(value: unknown): void {
  createPublicJsonPrivacyOracle(rolesByBattle).auditPage(value);
}

function injection(value: unknown, path: readonly (string | number)[], field: string, secret: unknown): unknown {
  const cloned = JSON.parse(JSON.stringify(value)) as unknown;
  let target = cloned;
  for (const key of path) target = objectOrArrayValue(target, key);
  object(target)[field] = secret;
  return cloned;
}

function objectOrArrayValue(value: unknown, key: string | number): unknown {
  if (Array.isArray(value)) return value[Number(key)];
  return object(value)[String(key)];
}

const forbiddenSourceFields = {
  privateOrigin: { secretProbe },
  privateContinuation: { secretProbe },
  rngSeed: secretProbe,
  genetics: { ivs: { hp: 99 } },
  individualizationKey: secretProbe,
  sourceCheckpointBytes: secretProbe,
};

function raw(value: Record<string, unknown>): CombatEvent {
  return { ...forbiddenSourceFields, ...value } as unknown as CombatEvent;
}

function sourceEvents(): CombatEvent[] {
  const cases: Record<string, unknown>[] = [
    { kind: "BattleStarted", battleId },
    { kind: "MoveUsed", actorId: "owned", moveId: "move:a", targetIds: ["wild"] },
    { kind: "MoveMissed", actorId: "owned", moveId: "move:a", targetId: "wild" },
    { kind: "MoveImmune", actorId: "owned", moveId: "move:a", targetId: "wild" },
    { kind: "CriticalHit", actorId: "owned", moveId: "move:a", targetId: "wild" },
    { kind: "DamageApplied", source: "move", actorId: "owned", moveId: "move:a", targetId: "wild", amount: 11, resultingHp: 21 },
    { kind: "DamageApplied", source: "move", actorId: "wild", moveId: "move:b", targetId: "owned", amount: 13, resultingHp: 24 },
    { kind: "DamageApplied", source: "move", actorId: "owned", moveId: "move:a", targetId: "owned-reserve", amount: 7, resultingHp: 73 },
    { kind: "DamageApplied", source: "effect", targetId: "owned", amount: 3, resultingHp: 21 },
    { kind: "CombatantKO", combatantId: "wild" },
    { kind: "CombatantRevived", combatantId: "owned", amount: 25, resultingHp: 25 },
    { kind: "CombatantActivated", sideId: "side:owned", combatantId: "owned-reserve" },
    { kind: "EffectApplied", effectId: "effect:a", targetId: "wild", stacks: 1 },
    { kind: "EffectUpdated", effectId: "effect:a", targetId: "owned", stacks: 2 },
    { kind: "EffectRemoved", effectId: "effect:a", targetId: "wild" },
    { kind: "EffectTicked", effectId: "effect:a", targetId: "wild", consequence: "damage", amount: 9, resultingHp: 12 },
    { kind: "EffectTicked", effectId: "effect:a", targetId: "owned", consequence: "healing", amount: 4, resultingHp: 25 },
    { kind: "HealingApplied", targetId: "wild", amount: 5, resultingHp: 17 },
    { kind: "HealingApplied", targetId: "owned", amount: 5, resultingHp: 30 },
    { kind: "StatStageChanged", targetId: "wild", stat: "def", requestedDelta: -1, appliedDelta: -1, resultingStage: -1 },
    { kind: "BattleEnded", outcome: { kind: "win", winnerSideId: "side:owned" } },
  ];
  return cases.map((event, index) => raw({
    ...event, sequence: index + 1, combatTimeMs: index * 100,
  }));
}

async function publicFixture() {
  const events = sourceEvents();
  const sides = [
    { sideId: "side:owned", combatantIds: ["owned", "owned-reserve"], activeCombatantIds: ["owned"] },
    { sideId: "side:wild", combatantIds: ["wild"], activeCombatantIds: ["wild"] },
  ];
  const bootstrap = projectCombatPresentationBootstrapV2({
    battleId,
    combatEventSchemaVersion: "events:v1" as CombatEventSchemaVersion,
    sides,
    participants: [
      { kind: "owned", combatantId: "owned", sideId: "side:owned", pokemonInstanceId: "owned:one",
        speciesId: "species:owned", level: 12, shiny: true, currentHp: 37, maxHp: 100 },
      { kind: "owned", combatantId: "owned-reserve", sideId: "side:owned", pokemonInstanceId: "owned:two",
        speciesId: "species:owned-reserve", level: 11, shiny: false, currentHp: 80, maxHp: 100 },
      { kind: "wild", combatantId: "wild", sideId: "side:wild",
        speciesId: "species:wild", level: 9, shiny: false, state: "conscious",
        currentHp: 123_111, maxHp: 456_222, hpRatio: 0.27, genetics: { ivs: { hp: 99 } },
      } as unknown as CombatPresentationBootstrapParticipantSourceV1,
    ],
    events: events.slice(0, 1),
  });
  const later = projectCombatPresentationContinuationV2({
    context: bootstrap.continuationContext,
    events: events.slice(1),
  });
  const publicEvents = [...bootstrap.envelope.events, ...later.envelope.events];
  const rows: HuntPresentationPublicEvent[] = publicEvents.map((event, index) => ({
    eventIndex: BigInt(index + 1),
    battleId,
    sequence: event.sequence,
    combatTimeMs: event.combatTimeMs,
    publicEvent: event,
    publicBytes: Buffer.from(JSON.stringify(event)),
    publicPrefixDigest: Buffer.alloc(32, index + 1),
  }));
  const header: HuntPresentationPublicHeader = {
    battleId, encounterId: "encounter:privacy-oracle", encounterOrdinal: 1,
    battleStartedAtHuntTimeMs: 0,
    initialSides: bootstrap.envelope.initialSides,
    initialParticipants: bootstrap.envelope.initialParticipants,
    publicHeaderDigest: Buffer.alloc(32),
  };
  const args = {
    cursorCodec: codec, playerId, huntId, nowMs,
    limit: rows.length,
    snapshot: {
      publicationGeneration: "1",
      publishedEventIndex: String(rows.length),
      publicPrefixDigest: Buffer.alloc(32).toString("base64url"),
      committedLogicalTimeMs: "1900",
      isTerminal: false,
      presentationSchemaVersion: "pokenexus.combat-presentation.v2" as const,
      gameDataVersion: "game-data:v1",
      rulesVersion: "rules:v1",
      sourceCombatEventSchemaVersion: "events:v1",
    },
    headers: new Map([[battleId, header]]),
  };
  const full = await buildHuntPresentationPage({
    ...args, after: { kind: "before_first" }, events: rows,
  });
  const first = await buildHuntPresentationPage({
    ...args, after: { kind: "before_first" }, events: rows.slice(0, 1),
  });
  const checked = await codec.verify(first.nextCursor!, { playerId, huntId }, nowMs);
  if (checked.status !== "valid") deny();
  const next = await buildHuntPresentationPage({
    ...args, after: checked.cursor.position, events: rows.slice(1),
  });
  return { full, first, next, events };
}

describe("TASK-103 independent public JSON privacy oracle (synthetic read-side only)", () => {
  it("audits each emitted CombatEvent variant and both bootstrap and signed continuation", async () => {
    const { full, first, next, events } = await publicFixture();
    expect(sourceKindCoverage).toBe(true);
    const fullJson = JSON.parse(JSON.stringify(full)) as unknown;
    const firstJson = JSON.parse(JSON.stringify(first)) as unknown;
    const nextJson = JSON.parse(JSON.stringify(next)) as unknown;
    const seen = events.map((event) => event.kind);
    expect(new Set(seen)).toEqual(new Set(allSourceEventKinds));
    expect([fullJson, firstJson, nextJson].every((page) =>
      !JSON.stringify(page).includes(secretProbe))).toBe(true);
    auditPublicJson(fullJson);
    const signedPageOracle = createPublicJsonPrivacyOracle(rolesByBattle);
    signedPageOracle.auditPage(firstJson);
    signedPageOracle.auditPage(nextJson);
    expect(first.battles[0]?.presentation.kind).toBe("bootstrap");
    expect(next.battles[0]?.presentation.kind).toBe("continuation");
    expect(next.battles[0]?.presentation.events.length).toBe(events.length - 1);
    expect(next.stream.snapshotId).toBe(first.stream.snapshotId);
    const fullEvents = full.battles[0]?.presentation.events ?? [];
    expect(fullEvents.map((event) => [event.kind, event.sequence, event.combatTimeMs]))
      .toEqual(events.map((event) => [event.kind, event.sequence, event.combatTimeMs]));
    const ownDamage = fullEvents.find((event) =>
      event.kind === "DamageApplied" && event.targetId === "owned-reserve");
    expect(ownDamage?.kind === "DamageApplied"
      && ownDamage.hpChange.visibility === "exact").toBe(true);
    const publicStatStage = fullEvents.find((event) => event.kind === "StatStageChanged");
    expect(publicStatStage?.kind === "StatStageChanged"
      && publicStatStage.requestedDelta === -1
      && publicStatStage.appliedDelta === -1
      && publicStatStage.resultingStage === -1).toBe(true);
  });

  it("proves the oracle rejects injected private fields at every nested boundary and sensitive event", async () => {
    const { full } = await publicFixture();
    const page = JSON.parse(JSON.stringify(full)) as unknown;
    const bases: Array<readonly (string | number)[]> = [
      [], ["stream"], ["battles", 0], ["battles", 0, "presentation"],
      ["battles", 0, "presentation", "initialSides", 0],
      ["battles", 0, "presentation", "initialParticipants", 0],
      ["battles", 0, "presentation", "initialParticipants", 0, "identity"],
      ["battles", 0, "presentation", "initialParticipants", 0, "vitality"],
      ["battles", 0, "presentation", "initialParticipants", 2, "identity"],
      ["battles", 0, "presentation", "initialParticipants", 2, "vitality"],
      ["battles", 0, "presentation", "events", 19, "outcome"],
    ];
    for (const path of bases) {
      expect(() => auditPublicJson(injection(page, path, "privateOrigin", secretProbe)))
        .toThrow("Independent public JSON privacy oracle rejected the envelope");
    }
    for (const [path, field] of [
      [["stream"], "snapshotId"],
      [["battles", 0], "encounterId"],
      [["battles", 0, "presentation"], "battleId"],
      [["battles", 0, "presentation", "initialSides", 0], "combatantIds"],
      [["battles", 0, "presentation", "initialParticipants", 0, "identity"], "speciesId"],
      [["battles", 0, "presentation", "initialParticipants", 0, "vitality"], "currentHp"],
      [["battles", 0, "presentation", "events", 19, "outcome"], "winnerSideId"],
      [["battles", 0, "presentation", "events", 18], "requestedDelta"],
    ] as const) {
      expect(() => auditPublicJson(injection(page, path, field, { privateOrigin: secretProbe })))
        .toThrow("Independent public JSON privacy oracle rejected the envelope");
    }
    for (let i = 0; i < full.battles[0]!.presentation.events.length; i += 1) {
      const eventPath = ["battles", 0, "presentation", "events", i];
      expect(() => auditPublicJson(injection(page, eventPath, "rngSeed", secretProbe)))
        .toThrow("Independent public JSON privacy oracle rejected the envelope");
      const event = full.battles[0]!.presentation.events[i]!;
      if ("hpChange" in event && event.hpChange.visibility === "hidden") {
        expect(() => auditPublicJson(injection(page,
          [...eventPath, "hpChange"], "resultingHp", 999_991)))
          .toThrow("Independent public JSON privacy oracle rejected the envelope");
      }
    }
    const wildVitality = [
      "battles", 0, "presentation", "initialParticipants", 2, "vitality",
    ];
    expect(() => auditPublicJson(injection(page, wildVitality, "currentHp", 999_992)))
      .toThrow("Independent public JSON privacy oracle rejected the envelope");
    const damageIndex = full.battles[0]!.presentation.events.findIndex((event) =>
      event.kind === "DamageApplied" && event.targetId === "owned");
    expect(damageIndex).toBeGreaterThanOrEqual(0);
    const mutated = injection(page, [
      "battles", 0, "presentation", "events", damageIndex, "hpChange",
    ], "visibility", "exact");
    expect(() => auditPublicJson(mutated))
      .toThrow("Independent public JSON privacy oracle rejected the envelope");
    const relabeled = JSON.parse(JSON.stringify(page)) as {
      battles: Array<{ presentation: { initialParticipants: Array<{
        identity: Record<string, unknown>; vitality: Record<string, unknown>;
      }> } }>;
    };
    const wild = relabeled.battles[0]!.presentation.initialParticipants[2]!;
    wild.identity = { ...wild.identity, kind: "owned_pokemon", pokemonInstanceId: "forged:owned" };
    wild.vitality = {
      visibility: "exact", state: "conscious", currentHp: 999_992, maxHp: 999_993,
    };
    expect(() => auditPublicJson(relabeled))
      .toThrow("Independent public JSON privacy oracle rejected the envelope");
    expect(() => auditPublicJson(injection(page, [
      "battles", 0, "presentation", "events", 1,
    ], "kind", "UnknownPrivateCombatEvent")))
      .toThrow("Independent public JSON privacy oracle rejected the envelope");
  });

  it("fails closed on an orphan continuation, duplicate bootstrap or foreign Battle role authority", async () => {
    const { full, next } = await publicFixture();
    const fullJson = JSON.parse(JSON.stringify(full)) as unknown;
    const nextJson = JSON.parse(JSON.stringify(next)) as unknown;
    expect(() => createPublicJsonPrivacyOracle(rolesByBattle).auditPage(nextJson))
      .toThrow("Independent public JSON privacy oracle rejected the envelope");
    const replayOracle = createPublicJsonPrivacyOracle(rolesByBattle);
    replayOracle.auditPage(fullJson);
    expect(() => replayOracle.auditPage(fullJson))
      .toThrow("Independent public JSON privacy oracle rejected the envelope");
    expect(() => auditPublicJson(injection(fullJson, [
      "battles", 0, "presentation",
    ], "battleId", "battle:foreign")))
      .toThrow("Independent public JSON privacy oracle rejected the envelope");
    const forgedRoles: BattlePrivacyRoles = new Map([[battleId, new Map([
      ["owned", "owned"], ["owned-reserve", "owned"], ["wild", "owned"],
    ])]]);
    expect(() => createPublicJsonPrivacyOracle(forgedRoles).auditPage(fullJson))
      .toThrow("Independent public JSON privacy oracle rejected the envelope");
    expect(() => auditPublicJson(injection(fullJson, [
      "battles", 0, "presentation", "events", 5,
    ], "targetId", "combatant:not-in-private-origin")))
      .toThrow("Independent public JSON privacy oracle rejected the envelope");
  });
});
