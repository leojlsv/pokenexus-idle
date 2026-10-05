import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalPresentationJson } from "@pokenexus/database";
import {
  PRODUCTION_COMBAT_GAME_DATA_VERSION_V2,
  PRODUCTION_COMBAT_RULE_CATALOG_V2,
  PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH_V2,
  type BattleId,
  type BattleSideId,
  type CombatantId,
  type CombatEvent,
  type EffectId,
  type MoveId,
} from "@pokenexus/game-core";
import { projectCombatPresentationBootstrapV2 } from "@pokenexus/game-protocol";

type EventWithoutPosition = CombatEvent extends infer Event
  ? Event extends CombatEvent ? Omit<Event, "sequence" | "combatTimeMs"> : never
  : never;

// Schema/projection coverage only: these are deliberately NOT simulated Battle
// gameplay. Their Unicode/escaped identifiers stay within the public 512-byte
// ID constraint, and MoveUsed targets contain only the two bound combatants.
const owned = `owned:${"雪".repeat(160)}` as CombatantId;
const wild = `wild:${"🔥".repeat(120)}` as CombatantId;
const moveId = `move:${"é".repeat(200)}"` as MoveId;
const effectId = `effect:${"☁".repeat(100)}` as EffectId;
const battleId = "battle:byte-budget:unicode" as BattleId;
const ownedSide = "side:owned" as BattleSideId;
const wildSide = "side:wild" as BattleSideId;

const sourceCases = [
  { kind: "BattleStarted", battleId },
  { kind: "MoveUsed", actorId: owned, moveId, targetIds: [owned, wild] },
  { kind: "MoveMissed", actorId: owned, moveId, targetId: wild },
  { kind: "MoveImmune", actorId: owned, moveId, targetId: wild },
  { kind: "CriticalHit", actorId: owned, moveId, targetId: wild },
  { kind: "DamageApplied", source: "move", actorId: owned, moveId, targetId: owned,
    amount: 17, resultingHp: 14 },
  { kind: "DamageApplied", source: "effect", targetId: wild,
    amount: 100_000, resultingHp: 1 },
  { kind: "CombatantKO", combatantId: wild },
  { kind: "CombatantRevived", combatantId: owned, amount: 7, resultingHp: 7 },
  { kind: "CombatantActivated", sideId: ownedSide, combatantId: owned },
  { kind: "BattleEnded", outcome: { kind: "win", winnerSideId: ownedSide } },
  { kind: "BattleEnded", outcome: { kind: "draw" } },
  { kind: "EffectApplied", effectId, targetId: owned, stacks: 3 },
  { kind: "EffectUpdated", effectId, targetId: wild },
  { kind: "EffectRemoved", effectId, targetId: owned },
  { kind: "EffectTicked", effectId, targetId: wild, consequence: "damage",
    amount: 18, resultingHp: 4 },
  { kind: "HealingApplied", targetId: owned, amount: 8, resultingHp: 22 },
  { kind: "StatStageChanged", targetId: owned, stat: "spa",
    requestedDelta: 2, appliedDelta: 1, resultingStage: 1 },
] satisfies readonly EventWithoutPosition[];

const coveredKinds = {
  BattleStarted: true,
  MoveUsed: true,
  MoveMissed: true,
  MoveImmune: true,
  CriticalHit: true,
  DamageApplied: true,
  CombatantKO: true,
  CombatantRevived: true,
  CombatantActivated: true,
  BattleEnded: true,
  EffectApplied: true,
  EffectUpdated: true,
  EffectRemoved: true,
  EffectTicked: true,
  HealingApplied: true,
  StatStageChanged: true,
} satisfies Record<CombatEvent["kind"], true>;

// Compile-time gate on the FULL current source schema, including optional
// fields: adding an event kind or field requires revisiting the size envelope.
// A field's nested structure (e.g. BattleEnded.outcome) is separately covered
// by the shapes below; this is not a validation function for arbitrary input.
const sourceFieldContract = {
  BattleStarted: { kind: true, sequence: true, combatTimeMs: true, battleId: true },
  MoveUsed: { kind: true, sequence: true, combatTimeMs: true,
    actorId: true, moveId: true, targetIds: true },
  MoveMissed: { kind: true, sequence: true, combatTimeMs: true,
    actorId: true, moveId: true, targetId: true },
  MoveImmune: { kind: true, sequence: true, combatTimeMs: true,
    actorId: true, moveId: true, targetId: true },
  CriticalHit: { kind: true, sequence: true, combatTimeMs: true,
    actorId: true, moveId: true, targetId: true },
  DamageApplied: { kind: true, sequence: true, combatTimeMs: true,
    source: true, actorId: true, moveId: true, targetId: true,
    amount: true, resultingHp: true },
  CombatantKO: { kind: true, sequence: true, combatTimeMs: true, combatantId: true },
  CombatantRevived: { kind: true, sequence: true, combatTimeMs: true,
    combatantId: true, amount: true, resultingHp: true },
  CombatantActivated: { kind: true, sequence: true, combatTimeMs: true,
    sideId: true, combatantId: true },
  BattleEnded: { kind: true, sequence: true, combatTimeMs: true, outcome: true },
  EffectApplied: { kind: true, sequence: true, combatTimeMs: true,
    effectId: true, targetId: true, stacks: true },
  EffectUpdated: { kind: true, sequence: true, combatTimeMs: true,
    effectId: true, targetId: true, stacks: true },
  EffectRemoved: { kind: true, sequence: true, combatTimeMs: true,
    effectId: true, targetId: true },
  EffectTicked: { kind: true, sequence: true, combatTimeMs: true,
    effectId: true, targetId: true, consequence: true,
    amount: true, resultingHp: true },
  HealingApplied: { kind: true, sequence: true, combatTimeMs: true,
    targetId: true, amount: true, resultingHp: true },
  StatStageChanged: { kind: true, sequence: true, combatTimeMs: true,
    targetId: true, stat: true, requestedDelta: true,
    appliedDelta: true, resultingStage: true },
} satisfies {
  [K in CombatEvent["kind"]]: Record<keyof Extract<CombatEvent, { kind: K }>, true>;
};

type BattleOutcome = Extract<CombatEvent, { kind: "BattleEnded" }>["outcome"];
const outcomeFieldContract = {
  win: { kind: true, winnerSideId: true },
  draw: { kind: true },
} satisfies {
  [K in BattleOutcome["kind"]]: Record<keyof Extract<BattleOutcome, { kind: K }>, true>;
};

describe("TASK-103 test-only canonical raw/public source byte evidence", () => {
  it("measures <=raw+128 public bytes for each supported TASK-028 event kind and Unicode sample", () => {
    const events = sourceCases.map((event, index) => ({
      ...event,
      sequence: index + 1,
      combatTimeMs: index * 100,
    })) as CombatEvent[];
    const projected = projectCombatPresentationBootstrapV2({
      battleId,
      combatEventSchemaVersion: "event-schema:test" as never,
      sides: [
        { sideId: ownedSide, combatantIds: [owned], activeCombatantIds: [owned] },
        { sideId: wildSide, combatantIds: [wild], activeCombatantIds: [wild] },
      ],
      participants: [
        { kind: "owned", combatantId: owned, sideId: ownedSide,
          pokemonInstanceId: "pokemon:owned", speciesId: "species:owned",
          level: 40, shiny: false, currentHp: 31, maxHp: 31 },
        { kind: "wild", combatantId: wild, sideId: wildSide,
          speciesId: "species:wild", level: 40, shiny: false, state: "conscious" },
      ],
      events,
    });
    expect(new Set(events.map((event) => event.kind)))
      .toEqual(new Set(Object.keys(coveredKinds)));
    expect(projected.envelope.events).toHaveLength(events.length);
    const bytes = (event: unknown) => Buffer.byteLength(canonicalPresentationJson(event), "utf8");
    const comparisons = events.map((event, index) => ({
      kind: event.kind,
      raw: bytes(event),
      public: bytes(projected.envelope.events[index]),
    }));
    for (const { kind, raw, public: publicBytes } of comparisons) {
      expect(publicBytes, `${kind}: raw=${raw}, public=${publicBytes}`)
        .toBeLessThanOrEqual(raw + 128);
    }
    expect(Buffer.byteLength(owned, "utf8")).toBeLessThanOrEqual(512);
    expect(Buffer.byteLength(wild, "utf8")).toBeLessThanOrEqual(512);
    expect(Buffer.byteLength(moveId, "utf8")).toBeLessThanOrEqual(512);
    expect(Buffer.byteLength(effectId, "utf8")).toBeLessThanOrEqual(512);
  });

  it("bounds every current event shape with worst-width API identities and pinned-v3 Move IDs", () => {
    // This is a release-conditional, test-only source-shape upper-envelope
    // check, NOT a witness of an actual 1-MiB gameplay segment. The API owns
    // the 45-byte 'hunt-run:' + UUID input and PostgreSQL owns the 36-byte
    // PokemonInstanceId. Solo Hunt encodes the ordinal and these identifiers
    // in JSON-array Combatant/Battle IDs. If either format changes, re-derive
    // these assumptions before claiming this test applies to the new release.
    expect(PRODUCTION_COMBAT_GAME_DATA_VERSION_V2).toBe("game-data-core-kanto-johto-v3");
    expect(PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH_V2)
      .toBe("sha256:6a578d7408c79b7984b5b6640be42dbbb43459f859ffe31ce79880d72d159b57");
    const profileBytes = readFileSync(resolve(
      process.cwd(), "../../packages/game-core/src/production-move-support-v2.json",
    ));
    expect("sha256:" + createHash("sha256").update(profileBytes).digest("hex"))
      .toBe(PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH_V2);
    const catalog = PRODUCTION_COMBAT_RULE_CATALOG_V2;
    expect(catalog.executableMoveIds).toHaveLength(45);
    for (const publishedId of catalog.executableMoveIds) {
      expect(publishedId).toMatch(/^candidate:move:[a-z0-9-]+:[a-f0-9]{10}$/u);
    }
    expect(Object.keys(catalog.abilityRules)).toHaveLength(0);
    expect(Object.keys(catalog.effectRules)).toHaveLength(0);
    expect(new Set(Object.values(catalog.moveRules).map((rule) => rule.targetScope)))
      .toEqual(new Set(["self", "singleEnemy", "allEnemies"]));
    const longestMove = catalog.executableMoveIds.reduce((longest, candidate) =>
      Buffer.byteLength(candidate, "utf8") > Buffer.byteLength(longest, "utf8")
        ? candidate : longest, "") as MoveId;
    expect(Buffer.byteLength(longestMove, "utf8")).toBe(38);

    const runId = "hunt-run:ffffffff-ffff-4fff-8fff-ffffffffffff";
    const instanceId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const ordinal = Number.MAX_SAFE_INTEGER;
    const maximumPlayerId = JSON.stringify([
      "soloHuntPlayer", runId, ordinal, instanceId,
    ]) as CombatantId;
    const maximumOpponentId = JSON.stringify([
      "soloHuntOpponent", runId, ordinal,
    ]) as CombatantId;
    const maximumBattleId = JSON.stringify([
      "soloHuntBattle", runId, ordinal,
    ]) as BattleId;
    expect(Buffer.byteLength(maximumPlayerId, "utf8"))
      .toBeGreaterThanOrEqual(Buffer.byteLength(maximumOpponentId, "utf8"));
    // Deliberate overestimate: the current production release has no effect
    // rules, but reserve the full public 512-byte opaque-ID allowance for its
    // union's dormant Effect* branches. All generated and released IDs above
    // are printable ASCII; untrusted arbitrary Unicode/control IDs are NOT
    // covered by this conditional calculation.
    const maximumEffectId = "e".repeat(512) as EffectId;
    // All CombatEvent numeric fields serialize as ordinary finite JS Number
    // tokens. 32 UTF-8 bytes per token exceeds the JSON representation of
    // any finite IEEE-754 Number, including scientific notation and sign.
    // Use zero as a structural placeholder and charge an independent 31-byte
    // allowance for EACH numeric field, including sequence/combatTimeMs.
    const numericWidthCeiling = 32;
    const numericPosition = { sequence: 0, combatTimeMs: 0 };
    const numericFields = (value: unknown): number => {
      if (typeof value === "number") return 1;
      if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + numericFields(item), 0);
      if (value && typeof value === "object") {
        return Object.values(value).reduce<number>((sum, item) => sum + numericFields(item), 0);
      }
      return 0;
    };
    const widestShapes = [
      { kind: "BattleStarted", battleId: maximumBattleId },
      { kind: "MoveUsed", actorId: maximumPlayerId, moveId: longestMove,
        targetIds: [maximumPlayerId] },
      { kind: "MoveMissed", actorId: maximumPlayerId, moveId: longestMove,
        targetId: maximumPlayerId },
      { kind: "MoveImmune", actorId: maximumPlayerId, moveId: longestMove,
        targetId: maximumPlayerId },
      { kind: "CriticalHit", actorId: maximumPlayerId, moveId: longestMove,
        targetId: maximumPlayerId },
      { kind: "DamageApplied", source: "move", actorId: maximumPlayerId,
        moveId: longestMove, targetId: maximumPlayerId,
        amount: 0, resultingHp: 0 },
      { kind: "DamageApplied", source: "effect", actorId: maximumPlayerId,
        moveId: longestMove, targetId: maximumPlayerId,
        amount: 0, resultingHp: 0 },
      { kind: "CombatantKO", combatantId: maximumPlayerId },
      { kind: "CombatantRevived", combatantId: maximumPlayerId,
        amount: 0, resultingHp: 0 },
      { kind: "CombatantActivated", sideId: "solo-hunt:opponent" as BattleSideId,
        combatantId: maximumPlayerId },
      { kind: "BattleEnded", outcome: { kind: "win", winnerSideId: "solo-hunt:opponent" as BattleSideId } },
      { kind: "BattleEnded", outcome: { kind: "draw" } },
      { kind: "EffectApplied", effectId: maximumEffectId,
        targetId: maximumPlayerId, stacks: 0 },
      { kind: "EffectUpdated", effectId: maximumEffectId,
        targetId: maximumPlayerId, stacks: 0 },
      { kind: "EffectRemoved", effectId: maximumEffectId, targetId: maximumPlayerId },
      { kind: "EffectTicked", effectId: maximumEffectId, targetId: maximumPlayerId,
        consequence: "healing", amount: 0, resultingHp: 0 },
      { kind: "HealingApplied", targetId: maximumPlayerId,
        amount: 0, resultingHp: 0 },
      { kind: "StatStageChanged", targetId: maximumPlayerId, stat: "spa",
        requestedDelta: 0, appliedDelta: 0, resultingStage: 0 },
    ] satisfies readonly EventWithoutPosition[];
    expect(new Set(widestShapes.map((event) => event.kind)))
      .toEqual(new Set(Object.keys(coveredKinds)));
    expect(Object.keys(sourceFieldContract).sort())
      .toEqual(Object.keys(coveredKinds).sort());
    expect(Object.keys(outcomeFieldContract).sort()).toEqual(["draw", "win"]);
    const widestRaw = Math.max(...widestShapes.map((event) => {
      const shape = { ...event, ...numericPosition };
      return Buffer.byteLength(canonicalPresentationJson(shape), "utf8")
        + (numericWidthCeiling - 1) * numericFields(shape);
    }));
    // 1 KiB per raw event is a generous upper envelope for the enumerated
    // present event fields and API/pinned-release identity lengths above.
    // TASK-028's current projection adds <=128 B per event; this is separately
    // sampled and source-reviewed, not universally proved by this fixture.
    expect(widestRaw).toBeLessThanOrEqual(1024);
    expect(128 * (2 * 1024 + 128)).toBeLessThan(1024 * 1024);
  });
});
