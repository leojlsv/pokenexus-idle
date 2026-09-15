import { describe, expect, it } from "vitest";
import {
  cadenceParticipantKey,
  createRngState,
  initializeBattle,
  resolveCombatStimulus,
  type BattleInitInput,
  type AbilityId,
  type CombatantId,
  type EffectId,
  type MoveId,
  type ResolvedCombatContext,
  type TypeId,
} from "./index";
import { resolveUseMove } from "./battle";
import { advanceTime } from "./effects";
import { battleEffectKey } from "./types";

const id = <T extends string>(value: string) => value as T;
const moveId = id<MoveId>("knockout");
const context: ResolvedCombatContext = {
  gameDataVersion: id("data"),
  rulesVersion: id("rules"),
  combatEventSchemaVersion: id("events"),
  effectRules: {},
  abilityRules: {},
  typeChart: { normal: { normal: 1 } },
  moveRules: {
    knockout: {
      moveId,
      typeId: id<TypeId>("normal"),
      category: "physical",
      targetScope: "singleEnemy",
      moveCooldownMs: 2000,
      power: 100000,
      accuracy: "always",
      criticalPolicy: "never",
    },
  },
};

function battle(withReserve = false): BattleInitInput {
  const combatant = (combatantId: CombatantId, hp: number, speed = 10) => ({
    combatantId,
    speciesId: id("species") as import("@pokenexus/game-types").SpeciesId,
    level: 10,
    baseStats: { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: speed },
    ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    types: [id<TypeId>("normal")],
    startingHp: hp,
    moveLoadout: [moveId],
    initialNextActionRemainingMs: 0,
    initialMoveCooldownRemainingMs: { knockout: 0 },
  });
  const a = id<CombatantId>("a");
  const b = id<CombatantId>("b");
  const c = id<CombatantId>("c");
  return {
    battleId: id("batch-d"),
    context,
    deterministicState: { rng: createRngState(1) },
    sides: [
      { sideId: id("one"), activeCapacity: 1, combatantIds: withReserve ? [a, c] : [a], initialActiveCombatantIds: [a] },
      { sideId: id("two"), activeCapacity: 1, combatantIds: [b], initialActiveCombatantIds: [b] },
    ],
    combatants: [combatant(a, 30), combatant(b, 1, withReserve ? 20 : 10), ...(withReserve ? [combatant(c, 30)] : [])],
  };
}

describe("TASK-009 Batch D", () => {
  it("ends a winning KO with BattleEnded as the final event", () => {
    const initialized = initializeBattle(battle());
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const result = resolveUseMove(initialized.state, { kind: "useMove", actorId: id<CombatantId>("a"), moveId, targetId: id<CombatantId>("b") }, initialized.deterministicState);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.state.status).toBe("ended");
    expect(result.events.at(-1)).toMatchObject({ kind: "BattleEnded", outcome: { kind: "win", winnerSideId: id("one") } });
  });

  it("requires an explicit legal replacement before actions or time can continue", () => {
    const reserveIdentity = id("cadence-c") as import("@pokenexus/game-types").PokemonInstanceId;
    const reserveParticipant = { kind: "pokemonInstance" as const, identity: reserveIdentity };
    const reserveParticipantKey = cadenceParticipantKey(reserveParticipant);
    const input = battle(true);
    input.context = {
      ...context,
      effectRules: { cadence: { effectId: id<EffectId>("cadence"), lifetimeScope: "cadence", stackingPolicy: "replace", durationMs: 50 } },
      abilityRules: {
        reserveStart: {
          abilityId: id("reserveStart"),
          reactions: [{ trigger: "battleStart", target: "self", order: 1, effects: [{ kind: "statStage", stat: "atk", delta: 1 }] }],
        },
      },
    };
    const initialized = initializeBattle({
      ...input,
      combatants: input.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("c")
        ? {
          ...combatant,
          startingHp: 7,
          initialNextActionRemainingMs: 42,
          initialMoveCooldownRemainingMs: { knockout: 84 },
          abilityId: id<AbilityId>("reserveStart"),
          cadenceParticipant: reserveParticipant,
        }
        : combatant),
      cadenceBindings: { [reserveParticipantKey]: id<CombatantId>("c") },
      cadenceCarry: {
        effects: [{ effectId: id<EffectId>("cadence"), targetCadenceParticipant: reserveParticipant, lifetimeScope: "cadence", stackingPolicy: "replace", applicationSequence: 1, scheduleRevision: 1, remainingDurationMs: 50, stacks: 1 }],
        hpByParticipant: { [reserveParticipantKey]: 7 },
        maxHpByParticipant: { [reserveParticipantKey]: 30 },
        readinessByParticipant: { [reserveParticipantKey]: { participant: reserveParticipant, moveLoadout: [moveId], nextActionRemainingMs: 42, moveCooldownRemainingMs: { knockout: 84 } } },
        actionLockRemainingMsByParticipant: { [reserveParticipantKey]: 0 },
      },
    });
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const ko = resolveUseMove(initialized.state, { kind: "useMove", actorId: id<CombatantId>("b"), moveId, targetId: id<CombatantId>("a") }, initialized.deterministicState);
    expect(ko.accepted).toBe(true);
    if (!ko.accepted) return;
    expect(ko.state.replacementPendingSideIds).toEqual([id("one")]);
    expect(resolveUseMove(ko.state, { kind: "useMove", actorId: id<CombatantId>("b"), moveId, targetId: id<CombatantId>("a") }, ko.deterministicState).accepted).toBe(false);
    expect(advanceTime(ko.state, ko.deterministicState, 1).accepted).toBe(false);
    expect(resolveCombatStimulus(ko.state, { kind: "forcedReplacement", sideId: id("one"), combatantId: id<CombatantId>("b") }, ko.deterministicState).accepted).toBe(false);
    const reserve = ko.state.combatants.c;
    const reserveEffectKey = battleEffectKey(id<CombatantId>("c"), id<EffectId>("cadence"));
    const reserveEffect = ko.state.effects[reserveEffectKey];
    const replacement = resolveCombatStimulus(ko.state, { kind: "forcedReplacement", sideId: id("one"), combatantId: id<CombatantId>("c") }, ko.deterministicState);
    expect(replacement.accepted).toBe(true);
    if (replacement.accepted) {
      expect(replacement.state.replacementPendingSideIds).toEqual([]);
      expect(replacement.events).toEqual([expect.objectContaining({ kind: "CombatantActivated", combatantId: id<CombatantId>("c") })]);
      expect(replacement.state.combatants.c).toEqual(reserve);
      expect(replacement.state.effects[reserveEffectKey]).toEqual(reserveEffect);
    }
  });

  it("runs living active battle-start reactions in frozen initiative order", () => {
    const input = battle();
    input.context = {
      ...context,
      abilityRules: {
        slowStart: {
          abilityId: id("slowStart"),
          reactions: [{ trigger: "battleStart", target: "self", order: 1, effects: [{ kind: "heal", magnitude: { kind: "integer", amount: 1 } }] }],
        },
        fastStart: {
          abilityId: id("fastStart"),
          reactions: [{ trigger: "battleStart", target: "self", order: 1, effects: [{ kind: "heal", magnitude: { kind: "integer", amount: 2 } }] }],
        },
      },
    };
    const initialized = initializeBattle({ ...input, combatants: input.combatants.map((combatant, index) =>
      index === 0
        ? { ...combatant, startingHp: 1, abilityId: id<AbilityId>("slowStart") }
        : { ...combatant, startingHp: 1, baseStats: { ...combatant.baseStats, spe: 100 }, abilityId: id<AbilityId>("fastStart") }) });
    expect(initialized.accepted).toBe(true);
    if (initialized.accepted) {
      expect(initialized.events.map((event) => event.kind)).toEqual(["BattleStarted", "HealingApplied", "HealingApplied"]);
      expect(initialized.events.filter((event) => event.kind === "HealingApplied").map((event) => [event.targetId, event.amount])).toEqual([[id<CombatantId>("b"), 2], [id<CombatantId>("a"), 1]]);
      expect(initialized.state.combatants.a.currentHp).toBe(2);
    }
  });

  it("does not let a faster action-locked combatant block a slower eligible actor", () => {
    const input = battle();
    input.context = {
      ...context,
      abilityRules: {
        lockStart: {
          abilityId: id("lockStart"),
          reactions: [{ trigger: "battleStart", target: "self", order: 1, effects: [{ kind: "actionLock", lifetimeScope: "battle", durationMs: 5 }] }],
        },
      },
    };
    const initialized = initializeBattle({
      ...input,
      combatants: input.combatants.map((combatant, index) => index === 0
        ? combatant
        : { ...combatant, baseStats: { ...combatant.baseStats, spe: 100 }, abilityId: id<AbilityId>("lockStart") }),
    });
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const locked = resolveUseMove(initialized.state, { kind: "useMove", actorId: id<CombatantId>("b"), moveId, targetId: id<CombatantId>("a") }, initialized.deterministicState);
    expect(locked.accepted).toBe(false);
    const slower = resolveUseMove(initialized.state, { kind: "useMove", actorId: id<CombatantId>("a"), moveId, targetId: id<CombatantId>("b") }, initialized.deterministicState);
    expect(slower.accepted).toBe(true);
  });

  it("rejects unsupported ability reaction semantics during initialization", () => {
    const input = battle();
    input.context = {
      ...context,
      abilityRules: {
        invalid: {
          abilityId: id("invalid"),
          reactions: [{ trigger: "battleStart", target: "counterpart", order: 1, effects: [] }],
        },
      },
    };
    expect(initializeBattle({ ...input, combatants: input.combatants.map((combatant, index) =>
      index === 0 ? { ...combatant, abilityId: id<AbilityId>("invalid") } : combatant) }).accepted).toBe(false);
  });

  it("rejects malformed ability heals and duplicate authored reaction order", () => {
    const input = battle();
    input.context = {
      ...context,
      abilityRules: {
        invalid: {
          abilityId: id("invalid"),
          reactions: [
            { trigger: "battleStart", target: "self", order: 1, effects: [{ kind: "heal", magnitude: { kind: "integer", amount: 0 } }] },
            { trigger: "battleStart", target: "self", order: 1, effects: [] },
          ],
        },
      },
    };
    expect(initializeBattle({ ...input, combatants: input.combatants.map((combatant, index) =>
      index === 0 ? { ...combatant, abilityId: id<AbilityId>("invalid") } : combatant) }).accepted).toBe(false);
  });

  it("rejects a non-boolean contact tag before emitting events or consuming RNG", () => {
    const input = battle();
    input.context = {
      ...context,
      moveRules: {
        knockout: { ...context.moveRules.knockout, makesContact: "yes" as unknown as boolean },
      },
    };
    const result = initializeBattle(input);
    expect(result.accepted).toBe(false);
    expect(result.events).toEqual([]);
    expect(result.deterministicState).toBe(input.deterministicState);
  });

  it("rejects unbound cadence ability effects before startup or direct-hit events", () => {
    const cadenceEffect = {
      effectId: id<EffectId>("cadence"),
      lifetimeScope: "cadence" as const,
      stackingPolicy: "replace" as const,
      durationMs: 5,
    };
    const startup = battle();
    startup.context = {
      ...context,
      effectRules: { cadence: cadenceEffect },
      abilityRules: { startup: { abilityId: id("startup"), reactions: [{ trigger: "battleStart", target: "self", order: 1, effects: [{ kind: "applyEffect", effectId: id("cadence") }] }] } },
    };
    const startupResult = initializeBattle({ ...startup, combatants: startup.combatants.map((combatant, index) =>
      index === 0 ? { ...combatant, abilityId: id<AbilityId>("startup") } : combatant) });
    expect(startupResult.accepted).toBe(false);
    expect(startupResult.events).toEqual([]);

    const direct = battle();
    direct.context = {
      ...context,
      effectRules: { cadence: cadenceEffect },
      abilityRules: { direct: { abilityId: id("direct"), reactions: [{ trigger: "afterDirectDamageDealt", target: "self", order: 1, effects: [{ kind: "applyEffect", effectId: id("cadence") }] }] } },
    };
    const initialized = initializeBattle({ ...direct, combatants: direct.combatants.map((combatant, index) =>
      index === 0 ? { ...combatant, abilityId: id<AbilityId>("direct") } : combatant) });
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const action = resolveUseMove(initialized.state, { kind: "useMove", actorId: id<CombatantId>("a"), moveId, targetId: id<CombatantId>("b") }, initialized.deterministicState);
    expect(action.accepted).toBe(false);
    if (!action.accepted) expect(action.events).toEqual([]);
  });

  it("does not validate unreachable contact cadence reactions for a non-contact move", () => {
    const input = battle();
    input.context = {
      ...context,
      effectRules: { cadence: { effectId: id<EffectId>("cadence"), lifetimeScope: "cadence", stackingPolicy: "replace", durationMs: 5 } },
      abilityRules: {
        contact: {
          abilityId: id("contact"),
          reactions: [
            { trigger: "afterDirectDamageDealt", target: "self", order: 1, effects: [{ kind: "statStage", stat: "atk", delta: 1 }] },
            { trigger: "afterContactDealt", target: "self", order: 1, effects: [{ kind: "actionLock", durationMs: 5, lifetimeScope: "battle" }] },
            { trigger: "afterContactDealt", target: "self", order: 2, effects: [{ kind: "applyEffect", effectId: id<EffectId>("cadence") }] },
          ],
        },
      },
    };
    const initialized = initializeBattle({ ...input, combatants: input.combatants.map((combatant, index) =>
      index === 0 ? { ...combatant, abilityId: id<AbilityId>("contact") } : combatant) });
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const action = resolveUseMove(initialized.state, { kind: "useMove", actorId: id<CombatantId>("a"), moveId, targetId: id<CombatantId>("b") }, initialized.deterministicState);
    expect(action.accepted).toBe(true);
    if (!action.accepted) return;
    expect(action.events.map((event) => event.kind)).toEqual(["MoveUsed", "DamageApplied", "CombatantKO", "StatStageChanged", "BattleEnded"]);
    expect(action.state.combatants.a.actionLockExpiresAtMsByScope).toBeUndefined();
  });

  it("does not validate unreachable direct or contact cadence reactions against an immune target", () => {
    const input = battle();
    input.context = {
      ...context,
      effectRules: { cadence: { effectId: id<EffectId>("cadence"), lifetimeScope: "cadence", stackingPolicy: "replace", durationMs: 5 } },
      typeChart: { normal: { normal: 1, immune: 0 } },
      moveRules: { knockout: { ...context.moveRules.knockout, makesContact: true } },
      abilityRules: {
        direct: {
          abilityId: id("direct"),
          reactions: [{ trigger: "afterDirectDamageDealt", target: "self", order: 1, effects: [{ kind: "applyEffect", effectId: id<EffectId>("cadence") }] }],
        },
        contact: {
          abilityId: id("contact"),
          reactions: [{ trigger: "afterContactReceived", target: "self", order: 1, effects: [{ kind: "applyEffect", effectId: id<EffectId>("cadence") }] }],
        },
      },
    };
    const initialized = initializeBattle({
      ...input,
      combatants: input.combatants.map((combatant, index) => index === 0
        ? { ...combatant, abilityId: id<AbilityId>("direct") }
        : { ...combatant, types: [id<TypeId>("immune")], abilityId: id<AbilityId>("contact") }),
    });
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const action = resolveUseMove(initialized.state, { kind: "useMove", actorId: id<CombatantId>("a"), moveId, targetId: id<CombatantId>("b") }, initialized.deterministicState);
    expect(action.accepted).toBe(true);
    if (!action.accepted) return;
    expect(action.events.map((event) => event.kind)).toEqual(["MoveUsed", "MoveImmune"]);
    expect(action.deterministicState).toBe(initialized.deterministicState);
  });

  it("allows a source reaction to remove an effect from the counterpart it KOed", () => {
    const input = battle();
    input.context = {
      ...context,
      effectRules: { marker: { effectId: id<EffectId>("marker"), lifetimeScope: "battle", stackingPolicy: "replace", durationMs: 5 } },
      abilityRules: {
        cleanup: {
          abilityId: id("cleanup"),
          reactions: [{ trigger: "afterDirectDamageDealt", target: "counterpart", order: 1, effects: [{ kind: "removeEffect", effectId: id<EffectId>("marker") }] }],
        },
        target: {
          abilityId: id("target"),
          reactions: [
            { trigger: "battleStart", target: "self", order: 1, effects: [{ kind: "applyEffect", effectId: id<EffectId>("marker") }] },
            { trigger: "afterDirectDamageTaken", target: "self", order: 1, effects: [{ kind: "statStage", stat: "def", delta: 1 }] },
            { trigger: "afterContactReceived", target: "self", order: 1, effects: [{ kind: "heal", magnitude: { kind: "integer", amount: 1 } }] }],
        },
      },
    };
    const initialized = initializeBattle({ ...input, combatants: input.combatants.map((combatant, index) =>
      index === 0 ? { ...combatant, abilityId: id<AbilityId>("cleanup") } : { ...combatant, abilityId: id<AbilityId>("target") }) });
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    expect(initialized.state.effects[battleEffectKey(id<CombatantId>("b"), id<EffectId>("marker"))]).toBeDefined();
    const result = resolveUseMove(initialized.state, { kind: "useMove", actorId: id<CombatantId>("a"), moveId, targetId: id<CombatantId>("b") }, initialized.deterministicState);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.events.map((event) => event.kind)).toEqual(["MoveUsed", "DamageApplied", "CombatantKO", "EffectRemoved", "BattleEnded"]);
  });

  it("resolves a complete same-boundary mutual DoT batch before declaring a draw", () => {
    const input = battle();
    input.context = {
      ...context,
      effectRules: {
        dot: { effectId: id<EffectId>("dot"), lifetimeScope: "battle", stackingPolicy: "replace", durationMs: 10, periodic: { kind: "damage", intervalMs: 5, magnitude: { kind: "integer", amount: 1 } } },
      },
      abilityRules: {
        dotStart: {
          abilityId: id("dotStart"),
          reactions: [{ trigger: "battleStart", target: "self", order: 1, effects: [{ kind: "applyEffect", effectId: id<EffectId>("dot") }] }],
        },
      },
    };
    const initialized = initializeBattle({
      ...input,
      combatants: input.combatants.map((combatant) => ({ ...combatant, startingHp: 1, abilityId: id<AbilityId>("dotStart") })),
    });
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const result = advanceTime(initialized.state, initialized.deterministicState, 100);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.state.combatTimeMs).toBe(5);
    expect(result.events.filter((event) => event.kind === "CombatantKO")).toHaveLength(2);
    expect(result.events.at(-1)).toMatchObject({ kind: "BattleEnded", outcome: { kind: "draw" } });
  });

  it("stops time at the first replacement boundary and preserves later schedules", () => {
    const input = battle(true);
    input.context = {
      ...context,
      effectRules: {
        dot: { effectId: id<EffectId>("dot"), lifetimeScope: "battle", stackingPolicy: "replace", durationMs: 20, periodic: { kind: "damage", intervalMs: 5, magnitude: { kind: "integer", amount: 30 } } },
      },
      abilityRules: {
        dotStart: {
          abilityId: id("dotStart"),
          reactions: [{ trigger: "battleStart", target: "self", order: 1, effects: [{ kind: "applyEffect", effectId: id<EffectId>("dot") }] }],
        },
      },
    };
    const initialized = initializeBattle({
      ...input,
      combatants: input.combatants.map((combatant, index) => index === 0 ? { ...combatant, abilityId: id<AbilityId>("dotStart") } : combatant),
    });
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const result = advanceTime(initialized.state, initialized.deterministicState, 100);
    expect(result.accepted && result.state.combatTimeMs).toBe(5);
    expect(result.accepted && result.state.replacementPendingSideIds).toEqual([id("one")]);
    if (!result.accepted) return;
    expect(result.events.every((event) => event.combatTimeMs <= 5)).toBe(true);
    expect(result.state.effects[battleEffectKey(id<CombatantId>("a"), id<EffectId>("dot"))]?.nextTickAtMs).toBe(10);
  });

  it("tears down battle effects without post-end cleanup events while retaining cadence effects", () => {
    const cadenceIdentity = id("cadence-a") as import("@pokenexus/game-types").PokemonInstanceId;
    const cadenceParticipant = { kind: "pokemonInstance" as const, identity: cadenceIdentity };
    const input = battle();
    input.context = {
      ...context,
      effectRules: {
        battle: { effectId: id<EffectId>("battle"), lifetimeScope: "battle", stackingPolicy: "replace", durationMs: 99 },
        cadence: { effectId: id<EffectId>("cadence"), lifetimeScope: "cadence", stackingPolicy: "replace", durationMs: 99 },
      },
      abilityRules: {
        setup: {
          abilityId: id("setup"),
          reactions: [{
            trigger: "battleStart",
            target: "self",
            order: 1,
            effects: [{ kind: "applyEffect", effectId: id<EffectId>("battle") }, { kind: "applyEffect", effectId: id<EffectId>("cadence") }],
          }],
        },
      },
    };
    const initialized = initializeBattle({
      ...input,
      combatants: input.combatants.map((combatant, index) => index === 0
        ? { ...combatant, abilityId: id<AbilityId>("setup"), cadenceParticipant }
        : combatant),
      cadenceBindings: { [cadenceParticipantKey(cadenceParticipant)]: id<CombatantId>("a") },
    });
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const result = resolveUseMove(initialized.state, { kind: "useMove", actorId: id<CombatantId>("a"), moveId, targetId: id<CombatantId>("b") }, initialized.deterministicState);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.state.effects[battleEffectKey(id<CombatantId>("a"), id<EffectId>("battle"))]).toBeUndefined();
    expect(result.state.effects[battleEffectKey(id<CombatantId>("a"), id<EffectId>("cadence"))]).toBeDefined();
    expect(result.events.some((event) => event.kind === "EffectRemoved" && event.effectId === id<EffectId>("battle"))).toBe(false);
    expect(result.events.at(-1)?.kind).toBe("BattleEnded");
  });

  it("orders direct/contact reactions without recursively triggering ability reactions", () => {
    const input = battle();
    input.context = {
      ...context,
      moveRules: { knockout: { ...context.moveRules.knockout, power: 1, makesContact: true } },
      abilityRules: {
        attacker: {
          abilityId: id("attacker"),
          reactions: [
            { trigger: "afterDirectDamageDealt", target: "self", order: 1, effects: [{ kind: "statStage", stat: "atk", delta: 1 }] },
            { trigger: "afterDirectDamageDealt", target: "self", order: 2, effects: [{ kind: "statStage", stat: "def", delta: 1 }] },
            { trigger: "afterContactDealt", target: "self", order: 1, effects: [{ kind: "heal", magnitude: { kind: "integer", amount: 1 } }] },
          ],
        },
        defender: {
          abilityId: id("defender"),
          reactions: [
            { trigger: "afterDirectDamageTaken", target: "self", order: 1, effects: [{ kind: "statStage", stat: "def", delta: -1 }] },
            { trigger: "afterContactReceived", target: "self", order: 1, effects: [{ kind: "heal", magnitude: { kind: "integer", amount: 1 } }] },
          ],
        },
      },
    };
    const initialized = initializeBattle({ ...input, combatants: input.combatants.map((combatant, index) =>
      index === 0 ? { ...combatant, abilityId: id<AbilityId>("attacker") } : { ...combatant, startingHp: 30, abilityId: id<AbilityId>("defender") }) });
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const result = resolveUseMove(initialized.state, { kind: "useMove", actorId: id<CombatantId>("a"), moveId, targetId: id<CombatantId>("b") }, initialized.deterministicState);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.events.map((event) => event.kind)).toEqual(["MoveUsed", "DamageApplied", "StatStageChanged", "StatStageChanged", "HealingApplied", "StatStageChanged", "HealingApplied"]);
    expect(result.events.filter((event) => event.kind === "StatStageChanged").map((event) => event.targetId)).toEqual([id<CombatantId>("a"), id<CombatantId>("a"), id<CombatantId>("b")]);
    expect(result.events.filter((event) => event.kind === "StatStageChanged").map((event) => event.stat)).toEqual(["atk", "def", "def"]);
  });

  it("ends before replacement when the winner also has a fillable active vacancy", () => {
    const applyDotMoveId = id<MoveId>("apply-dot");
    const input = battle(true);
    input.context = {
      ...context,
      moveRules: {
        ...context.moveRules,
        "apply-dot": {
          moveId: applyDotMoveId,
          category: "status",
          targetScope: "self",
          moveCooldownMs: 2000,
          accuracy: "always",
          effects: [{ kind: "applyEffect", scope: "perResolvedTarget", target: "self", effectId: id<EffectId>("dot") }],
        },
      },
      effectRules: {
        dot: { effectId: id<EffectId>("dot"), lifetimeScope: "battle", stackingPolicy: "replace", durationMs: 10, periodic: { kind: "damage", intervalMs: 5, magnitude: { kind: "integer", amount: 1 } } },
      },
    };
    const initialized = initializeBattle({
      ...input,
      combatants: input.combatants.map((combatant) => ({
        ...combatant,
        startingHp: combatant.combatantId === id<CombatantId>("c") ? combatant.startingHp : 1,
        moveLoadout: [moveId, applyDotMoveId],
        initialMoveCooldownRemainingMs: { knockout: 0, "apply-dot": 0 },
      })),
    });
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const bAppliesDot = resolveUseMove(initialized.state, { kind: "useMove", actorId: id<CombatantId>("b"), moveId: applyDotMoveId }, initialized.deterministicState);
    expect(bAppliesDot.accepted).toBe(true);
    if (!bAppliesDot.accepted) return;
    const aAppliesDot = resolveUseMove(bAppliesDot.state, { kind: "useMove", actorId: id<CombatantId>("a"), moveId: applyDotMoveId }, bAppliesDot.deterministicState);
    expect(aAppliesDot.accepted).toBe(true);
    if (!aAppliesDot.accepted) return;
    const result = advanceTime(aAppliesDot.state, aAppliesDot.deterministicState, 100);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.state.status).toBe("ended");
    expect(result.state.replacementPendingSideIds).toEqual([]);
    expect(result.events.at(-1)).toMatchObject({ kind: "BattleEnded", outcome: { kind: "win", winnerSideId: id("one") } });
    const replacement = resolveCombatStimulus(result.state, { kind: "forcedReplacement", sideId: id("one"), combatantId: id<CombatantId>("c") }, result.deterministicState);
    expect(replacement.accepted).toBe(false);
    if (!replacement.accepted) {
      expect(replacement.state).toBe(result.state);
      expect(replacement.events).toEqual([]);
    }
  });
});
