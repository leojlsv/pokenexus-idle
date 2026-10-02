import { describe, expect, it } from "vitest";
import {
  MANAGEMENT_FIRST_COMBAT_EVENT_SCHEMA_VERSION_V1,
  MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1,
  advanceCadence,
  applyCadenceExternalHpHeal,
  applyCadenceRevive,
  cadenceParticipantKey,
  createCadenceCarry,
  createRngState,
  initializeBattle,
  resolveCombatStimulus,
  type BattleInitInput,
  type BattleSideId,
  type CadenceCarryState,
  type CombatantId,
  type EffectId,
  type MoveId,
  type PokemonInstanceId,
  type ResolvedCombatContext,
  type TypeId,
} from "./index";
import { AUTO_POTION_COOLDOWN_MS, GLOBAL_ACTION_COOLDOWN_MS } from "./management-first-combat-rules";
import { battleEffectKey } from "./types";
import {
  deserializeReplayFixtureForTest,
  runCombatReplayFixture,
  serializeReplayFixtureForTest,
} from "./testing/replay-harness";
import type { CombatReplayFixture } from "./testing/combat-fixtures";

const id = <T extends string>(value: string) => value as T;
const playerSideId = id<BattleSideId>("player");
const wildSideId = id<BattleSideId>("wild");
const playerId = id<CombatantId>("player-active");
const reserveId = id<CombatantId>("player-reserve");
const wildId = id<CombatantId>("wild-active");
const knockoutMoveId = id<MoveId>("knockout");
const playerParticipant = {
  kind: "pokemonInstance" as const,
  identity: id<PokemonInstanceId>("pokemon-player-active"),
};
const playerParticipantKey = cadenceParticipantKey(playerParticipant);
const zeroGenetics = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

function context(forward = true): ResolvedCombatContext {
  return {
    gameDataVersion: id("data-v1"),
    rulesVersion: forward ? MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1 : id("historical-rules-v1"),
    combatEventSchemaVersion: forward
      ? MANAGEMENT_FIRST_COMBAT_EVENT_SCHEMA_VERSION_V1
      : id("historical-events-v1"),
    moveRules: {
      [knockoutMoveId]: {
        moveId: knockoutMoveId,
        typeId: id<TypeId>("normal"),
        category: "physical",
        targetScope: "singleEnemy",
        moveCooldownMs: 4_000,
        power: 100_000,
        accuracy: "always",
        criticalPolicy: "never",
      },
    },
    abilityRules: {},
    effectRules: {
      alpha: { effectId: id<EffectId>("alpha"), lifetimeScope: "cadence", stackingPolicy: "replace", durationMs: 10_000 },
      zeta: { effectId: id<EffectId>("zeta"), lifetimeScope: "battle", stackingPolicy: "replace", durationMs: 10_000 },
      dot: {
        effectId: id<EffectId>("dot"),
        lifetimeScope: "cadence",
        stackingPolicy: "replace",
        durationMs: 10_000,
        periodic: { kind: "damage", intervalMs: 1_000, magnitude: { kind: "integer", amount: 1 } },
      },
      battleDot: {
        effectId: id<EffectId>("battleDot"),
        lifetimeScope: "battle",
        stackingPolicy: "replace",
        durationMs: 10_000,
        periodic: { kind: "damage", intervalMs: 1_000, magnitude: { kind: "integer", amount: 1 } },
      },
    },
    typeChart: { normal: { normal: 1 } },
  };
}

function combatant(
  combatantId: CombatantId,
  startingHp: number,
  speed: number,
  participant = false,
  initialNextActionRemainingMs = 0,
  forward = true,
) {
  return {
    combatantId,
    speciesId: id("species") as import("@pokenexus/game-types").SpeciesId,
    level: 10,
    baseStats: { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: speed },
    ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ...(forward ? { geneticBonuses: zeroGenetics } : {}),
    types: [id<TypeId>("normal")],
    startingHp,
    moveLoadout: [knockoutMoveId],
    initialNextActionRemainingMs,
    initialMoveCooldownRemainingMs: { [knockoutMoveId]: 0 },
    ...(participant ? { cadenceParticipant: playerParticipant } : {}),
  };
}

function battle(options: {
  forward?: boolean;
  playerHp?: number;
  wildHp?: number;
  reserve?: boolean;
  playerNextActionMs?: number;
} = {}): BattleInitInput {
  const forward = options.forward ?? true;
  const player = combatant(playerId, options.playerHp ?? 10, 10, true, options.playerNextActionMs ?? 0, forward);
  const wild = combatant(wildId, options.wildHp ?? 30, 20, false, 0, forward);
  const reserve = combatant(reserveId, 30, 5, false, 0, forward);
  return {
    battleId: id("management-first-battle"),
    context: context(forward),
    deterministicState: { rng: createRngState(7) },
    sides: [
      {
        sideId: playerSideId,
        activeCapacity: 1,
        combatantIds: options.reserve ? [playerId, reserveId] : [playerId],
        initialActiveCombatantIds: [playerId],
      },
      { sideId: wildSideId, activeCapacity: 1, combatantIds: [wildId], initialActiveCombatantIds: [wildId] },
    ],
    combatants: [player, ...(options.reserve ? [reserve] : []), wild],
    cadenceBindings: { [playerParticipantKey]: playerId },
    ...(forward ? { koInterventionSideId: playerSideId } : {}),
  };
}

describe("TASK-107 management-first combat/cadence primitives", () => {
  it("applies Auto-Potion healing at the current boundary, consumes only GCD readiness, and carries the 5s cooldown", () => {
    const initialized = initializeBattle(battle({ playerHp: 10, playerNextActionMs: 3_000 }));
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;

    const advanced = resolveCombatStimulus(initialized.state, { kind: "advanceTime", toMs: 1_000 }, initialized.deterministicState);
    expect(advanced.accepted).toBe(true);
    if (!advanced.accepted) return;
    const moveReadinessBefore = advanced.state.combatants[playerId].moveReadyAtMs;

    const nonNormalized = resolveCombatStimulus(advanced.state, {
      kind: "externalHpHeal",
      targetId: playerId,
      actionOwnerId: playerId,
      magnitude: { kind: "maxHpFraction", numerator: 2, denominator: 8 },
      provenanceId: "auto-potion:non-normalized",
    }, advanced.deterministicState);
    expect(nonNormalized).toMatchObject({ accepted: false, reason: "external HP heal magnitude is invalid", events: [] });
    expect(nonNormalized.state).toBe(advanced.state);

    const healed = resolveCombatStimulus(advanced.state, {
      kind: "externalHpHeal",
      targetId: playerId,
      actionOwnerId: playerId,
      magnitude: { kind: "maxHpFraction", numerator: 1, denominator: 4 },
      provenanceId: "auto-potion:encounter-1:use-1",
    }, advanced.deterministicState);

    expect(healed.accepted).toBe(true);
    if (!healed.accepted) return;
    expect(healed.events).toEqual([
      expect.objectContaining({ kind: "HealingApplied", targetId: playerId, amount: 7, resultingHp: 17, combatTimeMs: 1_000 }),
    ]);
    expect(healed.state.combatants[playerId].nextActionAtMs).toBe(5_000);
    expect(healed.state.combatants[playerId].moveReadyAtMs).toEqual(moveReadinessBefore);
    expect(healed.state.combatants[playerId].autoPotionReadyAtMs).toBe(1_000 + AUTO_POTION_COOLDOWN_MS);

    const repeated = resolveCombatStimulus(healed.state, {
      kind: "externalHpHeal",
      targetId: playerId,
      actionOwnerId: playerId,
      magnitude: { kind: "integer", amount: 1 },
      provenanceId: "auto-potion:encounter-1:use-2",
    }, healed.deterministicState);
    expect(repeated).toMatchObject({ accepted: false, reason: "external HP heal cooldown is active", events: [] });

    const carry = createCadenceCarry(healed.state);
    expect(carry.readinessByParticipant[playerParticipantKey].autoPotionCooldownRemainingMs).toBe(AUTO_POTION_COOLDOWN_MS);
    const gap = advanceCadence(carry, healed.state.context, healed.deterministicState, 2_000);
    expect(gap.accepted).toBe(true);
    if (!gap.accepted) return;
    expect(gap.cadence.readinessByParticipant[playerParticipantKey].autoPotionCooldownRemainingMs).toBe(3_000);
  });

  it("orders same-boundary damage before Potion eligibility and never revives through externalHpHeal", () => {
    const initialized = initializeBattle(battle({ playerHp: 1 }));
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;

    const ko = resolveCombatStimulus(initialized.state, {
      kind: "useMove",
      actorId: wildId,
      moveId: knockoutMoveId,
      targetId: playerId,
    }, initialized.deterministicState);
    expect(ko.accepted).toBe(true);
    if (!ko.accepted) return;
    expect(ko.state.koInterventionPending).toEqual({ sideId: playerSideId, combatantId: playerId });

    const potion = resolveCombatStimulus(ko.state, {
      kind: "externalHpHeal",
      targetId: playerId,
      actionOwnerId: playerId,
      magnitude: { kind: "maxHpFraction", numerator: 1, denominator: 4 },
      provenanceId: "auto-potion:after-ko",
    }, ko.deterministicState);
    expect(potion).toMatchObject({ accepted: false, reason: "KO intervention is pending", events: [] });
    expect(potion.state?.combatants[playerId].currentHp).toBe(0);
  });

  it("pauses exact Player KO for Revive, emits deterministic cleanup bytes, and preserves Move readiness", () => {
    const initialized = initializeBattle(battle({ playerHp: 1, reserve: true }));
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;

    const dirty = {
      ...initialized.state,
      combatants: {
        ...initialized.state.combatants,
        [playerId]: {
          ...initialized.state.combatants[playerId],
          stages: { atk: 2, def: -1, spa: 0, spd: 3, spe: -2 },
          actionLockExpiresAtMsByScope: { battle: 9_000, cadence: 10_000 },
          autoPotionReadyAtMs: 3_500,
        },
      },
      effects: {
        [battleEffectKey(playerId, id<EffectId>("alpha"))]: {
          effectId: id<EffectId>("alpha"), targetCombatantId: playerId, targetCadenceParticipant: playerParticipant,
          lifetimeScope: "cadence" as const, stackingPolicy: "replace" as const, applicationSequence: 2, scheduleRevision: 1,
          appliedAtMs: 0, expiresAtMs: 10_000, stacks: 1,
        },
        [battleEffectKey(playerId, id<EffectId>("zeta"))]: {
          effectId: id<EffectId>("zeta"), targetCombatantId: playerId,
          lifetimeScope: "battle" as const, stackingPolicy: "replace" as const, applicationSequence: 1, scheduleRevision: 1,
          appliedAtMs: 0, expiresAtMs: 10_000, stacks: 1,
        },
      },
    };
    const ko = resolveCombatStimulus(dirty, {
      kind: "useMove", actorId: wildId, moveId: knockoutMoveId, targetId: playerId,
    }, initialized.deterministicState);
    expect(ko.accepted).toBe(true);
    if (!ko.accepted) return;
    expect(ko.state.replacementPendingSideIds).toEqual([]);
    expect(ko.state.sides.find((side) => side.sideId === playerSideId)?.activeCombatantIds).toContain(playerId);
    expect(ko.state.koInterventionPending).toEqual({ sideId: playerSideId, combatantId: playerId });
    const moveReadyAtBefore = ko.state.combatants[playerId].moveReadyAtMs;

    const revived = resolveCombatStimulus(ko.state, {
      kind: "koInterventionDecision",
      sideId: playerSideId,
      combatantId: playerId,
      decision: "revive",
      reviveFraction: { numerator: 1, denominator: 4 },
      provenanceId: "auto-revive:encounter-1:use-1",
    }, ko.deterministicState);
    expect(revived.accepted).toBe(true);
    if (!revived.accepted) return;

    expect(revived.events.map((event) => event.kind)).toEqual([
      "CombatantRevived",
      "EffectRemoved",
      "EffectRemoved",
      "StatStageChanged",
      "StatStageChanged",
      "StatStageChanged",
      "StatStageChanged",
    ]);
    expect(revived.events.slice(1, 3)).toEqual([
      expect.objectContaining({ kind: "EffectRemoved", effectId: id<EffectId>("zeta") }),
      expect.objectContaining({ kind: "EffectRemoved", effectId: id<EffectId>("alpha") }),
    ]);
    expect(revived.events.filter((event) => event.kind === "StatStageChanged")).toMatchObject([
      { stat: "atk", requestedDelta: -2, appliedDelta: -2, resultingStage: 0 },
      { stat: "def", requestedDelta: 1, appliedDelta: 1, resultingStage: 0 },
      { stat: "spd", requestedDelta: -3, appliedDelta: -3, resultingStage: 0 },
      { stat: "spe", requestedDelta: 2, appliedDelta: 2, resultingStage: 0 },
    ]);
    expect(revived.state.combatants[playerId]).toMatchObject({
      currentHp: 7,
      stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      nextActionAtMs: GLOBAL_ACTION_COOLDOWN_MS,
    });
    expect(revived.state.combatants[playerId].actionLockExpiresAtMsByScope).toBeUndefined();
    expect(revived.state.combatants[playerId].moveReadyAtMs).toEqual(moveReadyAtBefore);
    expect(revived.state.combatants[playerId].autoPotionReadyAtMs).toBe(3_500);
    expect(revived.state.effects).toEqual({});
    expect(revived.state.koInterventionPending).toBeNull();
  });

  it("seals simultaneous all-KO as draw without opening KO intervention", () => {
    const initialized = initializeBattle(battle({ playerHp: 1, wildHp: 1 }));
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const withDots = {
      ...initialized.state,
      effects: {
        [battleEffectKey(playerId, id<EffectId>("dot"))]: {
          effectId: id<EffectId>("dot"), targetCombatantId: playerId, targetCadenceParticipant: playerParticipant,
          lifetimeScope: "cadence" as const, stackingPolicy: "replace" as const, applicationSequence: 1, scheduleRevision: 1,
          appliedAtMs: 0, expiresAtMs: 10_000, nextTickAtMs: 1_000, stacks: 1,
        },
        [battleEffectKey(wildId, id<EffectId>("battleDot"))]: {
          effectId: id<EffectId>("battleDot"), targetCombatantId: wildId,
          lifetimeScope: "battle" as const, stackingPolicy: "replace" as const, applicationSequence: 2, scheduleRevision: 1,
          appliedAtMs: 0, expiresAtMs: 10_000, nextTickAtMs: 1_000, stacks: 1,
        },
      },
    };
    const ended = resolveCombatStimulus(withDots, { kind: "advanceTime", toMs: 1_000 }, initialized.deterministicState);
    expect(ended.accepted).toBe(true);
    if (!ended.accepted) return;
    expect(ended.state.status).toBe("ended");
    expect(ended.state.koInterventionPending).toBeNull();
    expect(ended.events.at(-1)).toMatchObject({ kind: "BattleEnded", outcome: { kind: "draw" } });
  });

  it("stops timed-effect advancement exactly at a newly opened KO intervention boundary", () => {
    const initialized = initializeBattle(battle({ playerHp: 1 }));
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const withDot = {
      ...initialized.state,
      effects: {
        [battleEffectKey(playerId, id<EffectId>("dot"))]: {
          effectId: id<EffectId>("dot"), targetCombatantId: playerId, targetCadenceParticipant: playerParticipant,
          lifetimeScope: "cadence" as const, stackingPolicy: "replace" as const, applicationSequence: 1, scheduleRevision: 1,
          appliedAtMs: 0, expiresAtMs: 10_000, nextTickAtMs: 1_000, stacks: 1,
        },
      },
    };
    const result = resolveCombatStimulus(withDot, { kind: "advanceTime", toMs: 5_000 }, initialized.deterministicState);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.state.combatTimeMs).toBe(1_000);
    expect(result.state.koInterventionPending).toEqual({ sideId: playerSideId, combatantId: playerId });
    expect(result.events.map((event) => event.kind)).toEqual(["EffectTicked", "DamageApplied", "CombatantKO"]);
  });

  it("declining KO intervention resumes the historical replacement lifecycle at the same timestamp", () => {
    const initialized = initializeBattle(battle({ playerHp: 1, reserve: true }));
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const ko = resolveCombatStimulus(initialized.state, {
      kind: "useMove", actorId: wildId, moveId: knockoutMoveId, targetId: playerId,
    }, initialized.deterministicState);
    expect(ko.accepted).toBe(true);
    if (!ko.accepted) return;
    const declined = resolveCombatStimulus(ko.state, {
      kind: "koInterventionDecision", sideId: playerSideId, combatantId: playerId, decision: "decline",
    }, ko.deterministicState);
    expect(declined.accepted).toBe(true);
    if (!declined.accepted) return;
    expect(declined.state.combatTimeMs).toBe(ko.state.combatTimeMs);
    expect(declined.state.koInterventionPending).toBeNull();
    expect(declined.state.replacementPendingSideIds).toEqual([playerSideId]);
    expect(declined.events).toEqual([]);
  });

  it("applies inter-Battle Potion healing with its own 5s cooldown and GCD cost", () => {
    const carry: CadenceCarryState = {
      effects: [],
      hpByParticipant: { [playerParticipantKey]: 10 },
      maxHpByParticipant: { [playerParticipantKey]: 30 },
      readinessByParticipant: {
        [playerParticipantKey]: {
          participant: playerParticipant,
          moveLoadout: [knockoutMoveId],
          nextActionRemainingMs: 1_500,
          moveCooldownRemainingMs: { [knockoutMoveId]: 4_000 },
          autoPotionCooldownRemainingMs: 0,
        },
      },
      actionLockRemainingMsByParticipant: { [playerParticipantKey]: 0 },
    };
    const result = applyCadenceExternalHpHeal(carry, playerParticipant, {
      kind: "maxHpFraction", numerator: 1, denominator: 4,
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result).toMatchObject({ amount: 7, resultingHp: 17 });
    expect(result.cadence.readinessByParticipant[playerParticipantKey]).toMatchObject({
      nextActionRemainingMs: 3_500,
      moveCooldownRemainingMs: { [knockoutMoveId]: 4_000 },
      autoPotionCooldownRemainingMs: AUTO_POTION_COOLDOWN_MS,
    });
  });

  it("applies inter-Battle Potion/Revive cadence transitions without mutating a sealed Battle transcript", () => {
    const base: CadenceCarryState = {
      effects: [{
        effectId: id<EffectId>("alpha"), targetCadenceParticipant: playerParticipant, lifetimeScope: "cadence",
        stackingPolicy: "replace", applicationSequence: 1, scheduleRevision: 1, remainingDurationMs: 8_000, stacks: 1,
      }],
      hpByParticipant: { [playerParticipantKey]: 0 },
      maxHpByParticipant: { [playerParticipantKey]: 30 },
      readinessByParticipant: {
        [playerParticipantKey]: {
          participant: playerParticipant,
          moveLoadout: [knockoutMoveId],
          nextActionRemainingMs: 1_500,
          moveCooldownRemainingMs: { [knockoutMoveId]: 4_000 },
          autoPotionCooldownRemainingMs: 0,
        },
      },
      actionLockRemainingMsByParticipant: { [playerParticipantKey]: 900 },
    };
    const sealedEvents = Object.freeze([{ kind: "BattleEnded", sequence: 99, combatTimeMs: 5_000, outcome: { kind: "draw" as const } }]);
    const sealedBytes = JSON.stringify(sealedEvents);

    const revived = applyCadenceRevive(base, playerParticipant, 7);
    expect(revived.accepted).toBe(true);
    if (!revived.accepted) return;
    expect(revived.cadence.hpByParticipant[playerParticipantKey]).toBe(7);
    expect(revived.cadence.effects).toEqual([]);
    expect(revived.cadence.actionLockRemainingMsByParticipant[playerParticipantKey]).toBe(0);
    expect(revived.cadence.readinessByParticipant[playerParticipantKey]).toMatchObject({
      nextActionRemainingMs: 1_500 + GLOBAL_ACTION_COOLDOWN_MS,
      moveCooldownRemainingMs: { [knockoutMoveId]: 4_000 },
      autoPotionCooldownRemainingMs: 0,
    });
    expect(JSON.stringify(sealedEvents)).toBe(sealedBytes);
  });

  it("keeps historical Battles byte-shaped and rejects forward-only stimuli", () => {
    const initialized = initializeBattle(battle({ forward: false }));
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    expect(Object.prototype.hasOwnProperty.call(initialized.state, "koInterventionSideId")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(initialized.state, "koInterventionPending")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(initialized.state.combatants[playerId], "autoPotionReadyAtMs")).toBe(false);

    const attempted = resolveCombatStimulus(initialized.state, {
      kind: "externalHpHeal", targetId: playerId, actionOwnerId: playerId,
      magnitude: { kind: "integer", amount: 1 }, provenanceId: "historical-forbidden",
    }, initialized.deterministicState);
    expect(attempted).toMatchObject({ accepted: false, reason: "external interventions are not enabled for this rules version", events: [] });
    expect(attempted.state).toBe(initialized.state);
  });

  it("keeps direct, segmented, and JSON-rehydrated forward execution equivalent", () => {
    const initialize = () => {
      const result = initializeBattle(battle({ playerHp: 10 }));
      if (!result.accepted) throw new Error(result.reason);
      return result;
    };
    const runPotionAtOneSecond = () => {
      const initial = initialize();
      const atOneSecond = resolveCombatStimulus(initial.state, { kind: "advanceTime", toMs: 1_000 }, initial.deterministicState);
      if (!atOneSecond.accepted) throw new Error(atOneSecond.reason);
      const potion = resolveCombatStimulus(atOneSecond.state, {
        kind: "externalHpHeal", targetId: playerId, actionOwnerId: playerId,
        magnitude: { kind: "maxHpFraction", numerator: 1, denominator: 4 }, provenanceId: "replay:potion-1",
      }, atOneSecond.deterministicState);
      if (!potion.accepted) throw new Error(potion.reason);
      return potion;
    };

    const directSource = runPotionAtOneSecond();
    const direct = resolveCombatStimulus(directSource.state, { kind: "advanceTime", toMs: 6_000 }, directSource.deterministicState);
    expect(direct.accepted).toBe(true);
    if (!direct.accepted) return;

    const segmentedSource = runPotionAtOneSecond();
    const firstSegment = resolveCombatStimulus(segmentedSource.state, { kind: "advanceTime", toMs: 3_000 }, segmentedSource.deterministicState);
    expect(firstSegment.accepted).toBe(true);
    if (!firstSegment.accepted) return;
    const segmented = resolveCombatStimulus(firstSegment.state, { kind: "advanceTime", toMs: 6_000 }, firstSegment.deterministicState);
    expect(segmented.accepted).toBe(true);
    if (!segmented.accepted) return;

    const rehydratedSource = runPotionAtOneSecond();
    const rehydratedState = JSON.parse(JSON.stringify(rehydratedSource.state)) as typeof rehydratedSource.state;
    const rehydratedDeterministicState = JSON.parse(JSON.stringify(rehydratedSource.deterministicState)) as typeof rehydratedSource.deterministicState;
    const rehydrated = resolveCombatStimulus(rehydratedState, { kind: "advanceTime", toMs: 6_000 }, rehydratedDeterministicState);
    expect(rehydrated.accepted).toBe(true);
    if (!rehydrated.accepted) return;

    expect(segmented.state).toEqual(direct.state);
    expect(rehydrated.state).toEqual(direct.state);
    expect(segmented.deterministicState).toEqual(direct.deterministicState);
    expect(rehydrated.deterministicState).toEqual(direct.deterministicState);
    expect(createCadenceCarry(segmented.state)).toEqual(createCadenceCarry(direct.state));
    expect(createCadenceCarry(rehydrated.state)).toEqual(createCadenceCarry(direct.state));
  });

  it("rehydrates an exact pending KO intervention before deterministic revive or decline", () => {
    const initialized = initializeBattle(battle({ playerHp: 1, reserve: true }));
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const pending = resolveCombatStimulus(initialized.state, {
      kind: "useMove", actorId: wildId, moveId: knockoutMoveId, targetId: playerId,
    }, initialized.deterministicState);
    expect(pending.accepted).toBe(true);
    if (!pending.accepted) return;
    expect(pending.state.koInterventionPending).toEqual({ sideId: playerSideId, combatantId: playerId });

    const rehydratedState = JSON.parse(JSON.stringify(pending.state)) as typeof pending.state;
    const rehydratedDeterministicState = JSON.parse(
      JSON.stringify(pending.deterministicState),
    ) as typeof pending.deterministicState;
    const reviveStimulus = {
      kind: "koInterventionDecision" as const,
      sideId: playerSideId,
      combatantId: playerId,
      decision: "revive" as const,
      reviveFraction: { numerator: 1, denominator: 4 } as const,
      provenanceId: "replay:revive:rehydrated",
    };
    const directRevive = resolveCombatStimulus(
      pending.state,
      reviveStimulus,
      pending.deterministicState,
    );
    const rehydratedRevive = resolveCombatStimulus(
      rehydratedState,
      reviveStimulus,
      rehydratedDeterministicState,
    );
    expect(rehydratedRevive).toEqual(directRevive);
    expect(rehydratedRevive).toMatchObject({
      accepted: true,
      state: { koInterventionPending: null },
      events: [expect.objectContaining({ kind: "CombatantRevived", combatantId: playerId })],
    });

    const declineStimulus = {
      kind: "koInterventionDecision" as const,
      sideId: playerSideId,
      combatantId: playerId,
      decision: "decline" as const,
    };
    const directDecline = resolveCombatStimulus(
      pending.state,
      declineStimulus,
      pending.deterministicState,
    );
    const rehydratedDecline = resolveCombatStimulus(
      JSON.parse(JSON.stringify(pending.state)) as typeof pending.state,
      declineStimulus,
      JSON.parse(JSON.stringify(pending.deterministicState)) as typeof pending.deterministicState,
    );
    expect(rehydratedDecline).toEqual(directDecline);
    expect(rehydratedDecline).toMatchObject({
      accepted: true,
      state: { koInterventionPending: null, replacementPendingSideIds: [playerSideId] },
      events: [],
    });
  });

  it("replays the versioned external action bytes deterministically", () => {
    const fixture: CombatReplayFixture = {
      fixtureId: "task-107-management-first-external-action",
      initialBattle: battle({ playerHp: 10 }),
      stimuli: [
        { kind: "advanceTime", toMs: 1_000 },
        {
          kind: "externalHpHeal",
          targetId: playerId,
          actionOwnerId: playerId,
          magnitude: { kind: "maxHpFraction", numerator: 1, denominator: 4 },
          provenanceId: "replay:auto-potion:1",
        },
        { kind: "advanceTime", toMs: 6_000 },
      ],
    };
    const encoded = serializeReplayFixtureForTest(fixture);
    const first = runCombatReplayFixture(deserializeReplayFixtureForTest(encoded));
    const second = runCombatReplayFixture(deserializeReplayFixtureForTest(encoded));
    expect(first).toEqual(second);
    expect(first.transcript.contextRef).toMatchObject({
      rulesVersion: MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1,
      combatEventSchemaVersion: MANAGEMENT_FIRST_COMBAT_EVENT_SCHEMA_VERSION_V1,
    });
    expect(first.transcript.flattenedEvents).toContainEqual(expect.objectContaining({
      kind: "HealingApplied",
      targetId: playerId,
      amount: 7,
      resultingHp: 17,
    }));
    expect(first.transcript.finalCadenceCarry?.readinessByParticipant[playerParticipantKey])
      .toMatchObject({ autoPotionCooldownRemainingMs: 0 });
  });

  it("replays a pending KO intervention through Revive deterministically", () => {
    const fixture: CombatReplayFixture = {
      fixtureId: "task-107-management-first-ko-revive",
      initialBattle: battle({ playerHp: 1, reserve: true }),
      stimuli: [
        { kind: "useMove", actorId: wildId, moveId: knockoutMoveId, targetId: playerId },
        {
          kind: "koInterventionDecision",
          sideId: playerSideId,
          combatantId: playerId,
          decision: "revive",
          reviveFraction: { numerator: 1, denominator: 4 },
          provenanceId: "replay:auto-revive:1",
        },
      ],
    };
    const encoded = serializeReplayFixtureForTest(fixture);
    const first = runCombatReplayFixture(deserializeReplayFixtureForTest(encoded));
    const second = runCombatReplayFixture(deserializeReplayFixtureForTest(encoded));
    expect(first).toEqual(second);
    expect(first.transcript.flattenedEvents).toContainEqual(expect.objectContaining({
      kind: "CombatantRevived",
      combatantId: playerId,
    }));
  });
});
