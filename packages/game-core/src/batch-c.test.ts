import { describe, expect, it } from "vitest";
import {
  advanceCadence,
  cadenceParticipantKey,
  createCadenceCarry,
  createRngState,
  initializeBattle,
  type BattleInitInput,
  type BattleState,
  type AbilityId,
  type CombatantId,
  type EffectId,
  type MoveId,
  type CadenceCarryState,
  type CadenceParticipant,
  type NonPlayerCadenceIdentity,
  type PokemonInstanceId,
  type ResolvedCombatContext,
  type TypeId,
} from "./index";
import { resolveUseMove } from "./battle";
import { advanceTime, applyEffectInstructionsInternal } from "./effects";
import { battleEffectKey } from "./types";

const id = <T extends string>(value: string) => value as T;
const pokemonParticipant = (identity: string): CadenceParticipant => ({
  kind: "pokemonInstance",
  identity: id<PokemonInstanceId>(identity),
});
const nonPlayerParticipant = (identity: string): CadenceParticipant => ({
  kind: "nonPlayer",
  identity: id<NonPlayerCadenceIdentity>(identity),
});
const participantKey = (identity: string) => cadenceParticipantKey(pokemonParticipant(identity));

const context: ResolvedCombatContext = {
  gameDataVersion: id("data"),
  rulesVersion: id("rules"),
  combatEventSchemaVersion: id("events"),
  abilityRules: {},
  typeChart: { normal: { normal: 1 } },
  effectRules: {
    burn: {
      effectId: id<EffectId>("burn"),
      lifetimeScope: "cadence",
      stackingPolicy: "stack",
      durationMs: 10,
      maxStacks: 2,
      periodic: { kind: "damage", intervalMs: 5, magnitude: { kind: "integer", amount: 3 } },
    },
    regen: {
      effectId: id<EffectId>("regen"),
      lifetimeScope: "battle",
      stackingPolicy: "refresh",
      durationMs: 10,
      periodic: { kind: "healing", intervalMs: 5, magnitude: { kind: "integer", amount: 2 } },
    },
    replace: {
      effectId: id<EffectId>("replace"),
      lifetimeScope: "battle",
      stackingPolicy: "replace",
      durationMs: 4,
    },
    fraction: {
      effectId: id<EffectId>("fraction"),
      lifetimeScope: "cadence",
      stackingPolicy: "refresh",
      durationMs: 10,
      periodic: { kind: "healing", intervalMs: 5, magnitude: { kind: "maxHpFraction", numerator: 1, denominator: 3 } },
    },
    slow: {
      effectId: id<EffectId>("slow"),
      lifetimeScope: "battle",
      stackingPolicy: "replace",
      durationMs: 5,
      periodic: { kind: "damage", intervalMs: 10, magnitude: { kind: "integer", amount: 3 } },
    },
    hugeBurn: {
      effectId: id<EffectId>("hugeBurn"),
      lifetimeScope: "cadence",
      stackingPolicy: "stack",
      durationMs: 5,
      maxStacks: 2,
      periodic: { kind: "damage", intervalMs: 5, magnitude: { kind: "integer", amount: Number.MAX_SAFE_INTEGER } },
    },
  },
  moveRules: {
    heal: {
      moveId: id<MoveId>("heal"),
      category: "status",
      targetScope: "self",
      moveCooldownMs: 2000,
      accuracy: "always",
      effects: [{ kind: "heal", scope: "perResolvedTarget", target: "self", magnitude: { kind: "integer", amount: 4 } }],
    },
    lock: {
      moveId: id<MoveId>("lock"),
      category: "status",
      targetScope: "self",
      moveCooldownMs: 2000,
      accuracy: "always",
      effects: [{ kind: "actionLock", scope: "perResolvedTarget", target: "self", durationMs: 5, lifetimeScope: "battle" }],
    },
    burnMove: {
      moveId: id<MoveId>("burnMove"),
      category: "status",
      targetScope: "self",
      moveCooldownMs: 2000,
      accuracy: "always",
      effects: [{ kind: "applyEffect", scope: "perResolvedTarget", target: "self", effectId: id<EffectId>("burn") }],
    },
    removeMove: {
      moveId: id<MoveId>("removeMove"),
      category: "status",
      targetScope: "self",
      moveCooldownMs: 2000,
      accuracy: "always",
      effects: [{ kind: "removeEffect", scope: "perResolvedTarget", target: "self", effectId: id<EffectId>("burn") }],
    },
    purge: {
      moveId: id<MoveId>("purge"),
      typeId: id<TypeId>("normal"),
      category: "physical",
      targetScope: "singleEnemy",
      moveCooldownMs: 2000,
      power: 100000,
      accuracy: "always",
      criticalPolicy: "never",
      effects: [{ kind: "removeEffect", scope: "perResolvedTarget", target: "target", effectId: id<EffectId>("burn") }],
    },
  },
};

function input(cadence = true): BattleInitInput {
  const combatant = (combatantId: CombatantId, sideId: string, hp: number) => ({
    combatantId,
    speciesId: id("species") as import("@pokenexus/game-types").SpeciesId,
    level: 10,
    baseStats: { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 10 },
    ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    types: [id<TypeId>("normal")],
    startingHp: hp,
    moveLoadout: [id<MoveId>("heal"), id<MoveId>("lock"), id<MoveId>("burnMove"), id<MoveId>("removeMove")],
    initialNextActionRemainingMs: 0,
    initialMoveCooldownRemainingMs: { heal: 0, lock: 0, burnMove: 0, removeMove: 0 },
    ...(cadence ? { cadenceParticipant: pokemonParticipant("pokemon-" + combatantId) } : {}),
  });
  return {
    battleId: id("battle-c"),
    context,
    deterministicState: { rng: createRngState(1) },
    sides: [
      { sideId: id("one"), activeCapacity: 1, combatantIds: [id<CombatantId>("a")], initialActiveCombatantIds: [id<CombatantId>("a")] },
      { sideId: id("two"), activeCapacity: 1, combatantIds: [id<CombatantId>("b")], initialActiveCombatantIds: [id<CombatantId>("b")] },
    ],
    combatants: [combatant(id<CombatantId>("a"), "one", 20), combatant(id<CombatantId>("b"), "two", 20)],
    cadenceBindings: cadence ? {
      [participantKey("pokemon-a")]: id<CombatantId>("a"),
      [participantKey("pokemon-b")]: id<CombatantId>("b"),
    } : undefined,
  };
}

function state(): BattleState {
  const result = initializeBattle(input());
  if (!result.accepted) throw new Error(result.reason);
  return result.state;
}

describe("TASK-009 Batch C", () => {
  it("rejects non-monotonic time atomically", () => {
    const current = state();
    const result = advanceTime(current, { rng: createRngState(1) }, 0);
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.state).toBe(current);
    expect(result.events).toEqual([]);
  });

  it("applies status effects and action locks without reviving KO", () => {
    const current = state();
    const locked = resolveUseMove(current, { kind: "useMove", actorId: id<CombatantId>("a"), moveId: id<MoveId>("lock") }, { rng: createRngState(1) });
    expect(locked.accepted, locked.accepted ? "" : locked.reason).toBe(true);
    if (!locked.accepted) return;
    expect(locked.state.combatants.a.actionLockExpiresAtMsByScope?.battle).toBe(5);
    const rejected = resolveUseMove(locked.state, { kind: "useMove", actorId: id<CombatantId>("a"), moveId: id<MoveId>("heal") }, locked.deterministicState);
    expect(rejected.accepted).toBe(false);
    const koState = { ...current, combatants: { ...current.combatants, a: { ...current.combatants.a, currentHp: 0 } } };
    const heal = resolveUseMove(koState, { kind: "useMove", actorId: id<CombatantId>("a"), moveId: id<MoveId>("heal") }, { rng: createRngState(1) });
    expect(heal.accepted).toBe(false);
  });

  it("carries scoped locks, readiness, and effects across a silent identity rebind", () => {
    const firstInput = input();
    firstInput.context = {
      ...context,
      abilityRules: {
        setup: {
          abilityId: id("setup"),
          reactions: [{
            trigger: "battleStart",
            target: "self",
            order: 1,
            effects: [
              { kind: "actionLock", lifetimeScope: "battle", durationMs: 9 },
              { kind: "actionLock", lifetimeScope: "cadence", durationMs: 5 },
              { kind: "applyEffect", effectId: id<EffectId>("burn") },
            ],
          }],
        },
      },
    };
    firstInput.combatants = firstInput.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("a")
      ? { ...combatant, abilityId: id<AbilityId>("setup") }
      : combatant);
    const first = initializeBattle(firstInput);
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    const carry = createCadenceCarry(first.state);
    expect(carry.actionLockRemainingMsByParticipant[participantKey("pokemon-a")]).toBe(5);
    expect(carry.effects[0]).toMatchObject({ applicationSequence: 1, scheduleRevision: 1 });
    const advanced = advanceCadence(carry, firstInput.context, first.deterministicState, 2);
    expect(advanced.accepted).toBe(true);
    if (!advanced.accepted) return;
    expect(advanced.cadence.actionLockRemainingMsByParticipant[participantKey("pokemon-a")]).toBe(3);
    expect(advanced.cadence.readinessByParticipant[participantKey("pokemon-a")].moveLoadout).toEqual(firstInput.combatants[0].moveLoadout);

    const nextInput = input();
    nextInput.context = firstInput.context;
    nextInput.combatants = nextInput.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("a")
      ? { ...combatant, combatantId: id<CombatantId>("a-next") }
      : combatant);
    nextInput.sides = nextInput.sides.map((side) => side.sideId === id("one")
      ? { ...side, combatantIds: [id<CombatantId>("a-next")], initialActiveCombatantIds: [id<CombatantId>("a-next")] }
      : side);
    nextInput.cadenceBindings = {
      [participantKey("pokemon-a")]: id<CombatantId>("a-next"),
      [participantKey("pokemon-b")]: id<CombatantId>("b"),
    };
    nextInput.cadenceCarry = advanced.cadence;
    const next = initializeBattle(nextInput);
    expect(next.accepted).toBe(true);
    if (!next.accepted) return;
    expect(next.events.map((event) => event.kind)).toEqual(["BattleStarted"]);
    expect(next.deterministicState).toEqual(first.deterministicState);
    expect(next.state.combatants["a-next"]).toMatchObject({ currentHp: 20, actionLockExpiresAtMsByScope: { cadence: 3 } });
    expect(next.state.effects[battleEffectKey(id<CombatantId>("a-next"), id<EffectId>("burn"))]).toMatchObject({ applicationSequence: 1, scheduleRevision: 1 });
    expect(next.state.combatants["a-next"].actionLockExpiresAtMsByScope?.battle).toBeUndefined();

    const rejected = [
      { ...nextInput, combatants: nextInput.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("a-next") ? { ...combatant, startingHp: 19 } : combatant) },
      { ...nextInput, combatants: nextInput.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("a-next") ? { ...combatant, initialNextActionRemainingMs: 1 } : combatant) },
      { ...nextInput, combatants: nextInput.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("a-next") ? { ...combatant, initialMoveCooldownRemainingMs: { ...combatant.initialMoveCooldownRemainingMs, heal: 1 } } : combatant) },
      { ...nextInput, combatants: nextInput.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("a-next") ? { ...combatant, moveLoadout: [...combatant.moveLoadout].reverse() } : combatant) },
      { ...nextInput, combatants: nextInput.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("a-next") ? { ...combatant, cadenceParticipant: { kind: "nonPlayer" as const, identity: combatant.cadenceParticipant!.identity as import("./types").NonPlayerCadenceIdentity } } : combatant) },
      { ...nextInput, cadenceBindings: { [participantKey("pokemon-a")]: id<CombatantId>("b"), [participantKey("pokemon-b")]: id<CombatantId>("b") } },
    ];
    for (const invalid of rejected) {
      const result = initializeBattle(invalid);
      expect(result.accepted).toBe(false);
      expect(result.events).toEqual([]);
      expect(result.deterministicState).toBe(invalid.deterministicState);
    }
  });

  it("extends same-scope locks, tears down battle locks, and expires cadence locks across a gap", () => {
    const firstInput = input();
    firstInput.context = {
      ...context,
      abilityRules: {
        locks: {
          abilityId: id("locks"),
          reactions: [{
            trigger: "battleStart",
            target: "self",
            order: 1,
            effects: [
              { kind: "actionLock", lifetimeScope: "battle", durationMs: 9 },
              { kind: "actionLock", lifetimeScope: "battle", durationMs: 5 },
              { kind: "actionLock", lifetimeScope: "cadence", durationMs: 5 },
            ],
          }],
        },
      },
    };
    firstInput.combatants = firstInput.combatants.map((combatant) => ({
      ...combatant,
      moveLoadout: [id<MoveId>("heal"), id<MoveId>("lock"), id<MoveId>("burnMove"), id<MoveId>("purge")],
      initialMoveCooldownRemainingMs: { heal: 0, lock: 0, burnMove: 0, purge: 0 },
      ...(combatant.combatantId === id<CombatantId>("a") ? { abilityId: id<AbilityId>("locks") } : {}),
    }));
    const first = initializeBattle(firstInput);
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    expect(first.state.combatants.a.actionLockExpiresAtMsByScope).toEqual({ battle: 9, cadence: 5 });
    const afterCadenceExpiry = advanceTime(first.state, first.deterministicState, 6);
    expect(afterCadenceExpiry.accepted).toBe(true);
    if (!afterCadenceExpiry.accepted) return;
    expect(resolveUseMove(afterCadenceExpiry.state, { kind: "useMove", actorId: id<CombatantId>("a"), moveId: id<MoveId>("heal") }, afterCadenceExpiry.deterministicState).accepted).toBe(false);
    const terminal = resolveUseMove(afterCadenceExpiry.state, { kind: "useMove", actorId: id<CombatantId>("b"), moveId: id<MoveId>("purge"), targetId: id<CombatantId>("a") }, afterCadenceExpiry.deterministicState);
    expect(terminal.accepted).toBe(true);
    if (!terminal.accepted) return;
    expect(terminal.state.status).toBe("ended");
    expect(terminal.state.combatants.a.actionLockExpiresAtMsByScope?.battle).toBeUndefined();

    const carry = createCadenceCarry(first.state);
    const expired = advanceCadence(carry, firstInput.context, first.deterministicState, 5);
    expect(expired.accepted).toBe(true);
    if (!expired.accepted) return;
    expect(expired.cadence.actionLockRemainingMsByParticipant[participantKey("pokemon-a")]).toBe(0);
    const nextInput = input();
    nextInput.combatants = nextInput.combatants.map((combatant) => ({
      ...combatant,
      moveLoadout: [id<MoveId>("heal"), id<MoveId>("lock"), id<MoveId>("burnMove"), id<MoveId>("purge")],
      initialMoveCooldownRemainingMs: { heal: 0, lock: 0, burnMove: 0, purge: 0 },
      ...(combatant.combatantId === id<CombatantId>("a") ? { combatantId: id<CombatantId>("a-next") } : {}),
    }));
    nextInput.sides = nextInput.sides.map((side) => side.sideId === id("one")
      ? { ...side, combatantIds: [id<CombatantId>("a-next")], initialActiveCombatantIds: [id<CombatantId>("a-next")] }
      : side);
    nextInput.cadenceBindings = {
      [participantKey("pokemon-a")]: id<CombatantId>("a-next"),
      [participantKey("pokemon-b")]: id<CombatantId>("b"),
    };
    nextInput.cadenceCarry = expired.cadence;
    const next = initializeBattle(nextInput);
    expect(next.accepted).toBe(true);
    if (!next.accepted) return;
    expect(resolveUseMove(next.state, { kind: "useMove", actorId: id<CombatantId>("a-next"), moveId: id<MoveId>("heal") }, next.deterministicState).accepted).toBe(true);
  });

  it("clamps huge instant integer healing before converting to a number", () => {
    const nextInput = input();
    nextInput.context = {
      ...context,
      moveRules: {
        ...context.moveRules,
        heal: {
          ...context.moveRules.heal,
          effects: [{ kind: "heal", scope: "perResolvedTarget", target: "self", magnitude: { kind: "integer", amount: Number.MAX_SAFE_INTEGER } }],
        },
      },
    };
    const initialized = initializeBattle(nextInput);
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const damaged = { ...initialized.state, combatants: { ...initialized.state.combatants, a: { ...initialized.state.combatants.a, currentHp: 1 } } };
    const result = resolveUseMove(damaged, { kind: "useMove", actorId: id<CombatantId>("a"), moveId: id<MoveId>("heal") }, initialized.deterministicState);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.state.combatants.a.currentHp).toBe(30);
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "HealingApplied", amount: 29, resultingHp: 30 }));
  });

  it("clamps huge instant rational healing before converting to a number", () => {
    const nextInput = input();
    nextInput.context = {
      ...context,
      moveRules: {
        ...context.moveRules,
        heal: {
          ...context.moveRules.heal,
          effects: [{ kind: "heal", scope: "perResolvedTarget", target: "self", magnitude: { kind: "maxHpFraction", numerator: Number.MAX_SAFE_INTEGER, denominator: 1 } }],
        },
      },
    };
    const initialized = initializeBattle(nextInput);
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const damaged = { ...initialized.state, combatants: { ...initialized.state.combatants, a: { ...initialized.state.combatants.a, currentHp: 1 } } };
    const result = resolveUseMove(damaged, { kind: "useMove", actorId: id<CombatantId>("a"), moveId: id<MoveId>("heal") }, initialized.deterministicState);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.state.combatants.a.currentHp).toBe(30);
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "HealingApplied", amount: 29, resultingHp: 30 }));
  });

  it("rejects malformed effect instructions atomically during initialization", () => {
    const malformedEffects: unknown[] = [
      "not-an-array",
      [null],
      [{ kind: "unknown", scope: "perResolvedTarget", target: "self" }],
      [{ kind: "heal", scope: "perResolvedTarget", target: "other", magnitude: { kind: "integer", amount: 1 } }],
      [{ kind: "statStage", scope: "perResolvedTarget", target: "self", stat: "hp", delta: 1 }],
      [{ kind: "heal", scope: "perResolvedTarget", target: "self", magnitude: { kind: "unknown" } }],
    ];
    for (const effects of malformedEffects) {
      const nextInput = input();
      nextInput.context = {
        ...context,
        moveRules: {
          ...context.moveRules,
          heal: { ...context.moveRules.heal, effects: effects as typeof context.moveRules.heal.effects },
        },
      };
      expect(() => initializeBattle(nextInput)).not.toThrow();
      const result = initializeBattle(nextInput);
      expect(result.accepted).toBe(false);
      expect(result.deterministicState).toBe(nextInput.deterministicState);
      expect(result.events).toEqual([]);
    }
  });

  it("persists move-applied effects through the authoritative state and later ticks", () => {
    const current = state();
    const applied = resolveUseMove(current, { kind: "useMove", actorId: id<CombatantId>("a"), moveId: id<MoveId>("burnMove") }, { rng: createRngState(1) });
    expect(applied.accepted).toBe(true);
    if (!applied.accepted) return;
    expect(applied.state.effects[battleEffectKey(id<CombatantId>("a"), id<EffectId>("burn"))]).toBeDefined();
    const advanced = advanceTime(applied.state, applied.deterministicState, 5);
    expect(advanced.accepted).toBe(true);
    if (!advanced.accepted) return;
    expect(advanced.state.combatants.a.currentHp).toBe(17);
  });

  it("uses collision-safe Battle effect tuple keys across create, update, scheduling, rebuild, and removal", () => {
    const firstTargetId = id<CombatantId>("a");
    const secondTargetId = id<CombatantId>("a:b");
    const firstEffectId = id<EffectId>("b:c");
    const secondEffectId = id<EffectId>("c");
    expect(`${firstTargetId}:${firstEffectId}`).toBe(`${secondTargetId}:${secondEffectId}`);
    const firstKey = battleEffectKey(firstTargetId, firstEffectId);
    const secondKey = battleEffectKey(secondTargetId, secondEffectId);
    expect(firstKey).not.toBe(secondKey);

    const nextInput = input(false);
    nextInput.context = {
      ...context,
      effectRules: {
        ...context.effectRules,
        [firstEffectId]: {
          effectId: firstEffectId,
          lifetimeScope: "battle",
          stackingPolicy: "refresh",
          durationMs: 10,
          periodic: { kind: "damage", intervalMs: 5, magnitude: { kind: "integer", amount: 1 } },
        },
        [secondEffectId]: {
          effectId: secondEffectId,
          lifetimeScope: "battle",
          stackingPolicy: "refresh",
          durationMs: 10,
          periodic: { kind: "damage", intervalMs: 5, magnitude: { kind: "integer", amount: 1 } },
        },
      },
    };
    nextInput.sides = nextInput.sides.map((side) => side.sideId === id("two")
      ? { ...side, combatantIds: [secondTargetId], initialActiveCombatantIds: [secondTargetId] }
      : side);
    nextInput.combatants = nextInput.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("b")
      ? { ...combatant, combatantId: secondTargetId }
      : combatant);
    const initialized = initializeBattle(nextInput);
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;

    const firstApplied = applyEffectInstructionsInternal(initialized.state, firstTargetId, undefined, [{
      kind: "applyEffect",
      scope: "perResolvedTarget",
      target: "self",
      effectId: firstEffectId,
    }]);
    const bothApplied = applyEffectInstructionsInternal(firstApplied.state, secondTargetId, undefined, [{
      kind: "applyEffect",
      scope: "perResolvedTarget",
      target: "self",
      effectId: secondEffectId,
    }]);
    expect(Object.keys(bothApplied.state.effects).sort()).toEqual([firstKey, secondKey].sort());
    expect(bothApplied.state.effects[firstKey]).toMatchObject({ targetCombatantId: firstTargetId, effectId: firstEffectId, scheduleRevision: 1 });
    expect(bothApplied.state.effects[secondKey]).toMatchObject({ targetCombatantId: secondTargetId, effectId: secondEffectId, scheduleRevision: 1 });

    const refreshed = applyEffectInstructionsInternal(bothApplied.state, firstTargetId, undefined, [{
      kind: "applyEffect",
      scope: "perResolvedTarget",
      target: "self",
      effectId: firstEffectId,
    }]);
    expect(refreshed.state.effects[firstKey]?.scheduleRevision).toBe(2);
    expect(refreshed.state.effects[secondKey]?.scheduleRevision).toBe(1);

    const scheduled = advanceTime(refreshed.state, { rng: createRngState(1) }, 5);
    expect(scheduled.accepted).toBe(true);
    if (!scheduled.accepted) return;
    expect(Object.keys(scheduled.state.effects).sort()).toEqual([firstKey, secondKey].sort());
    expect(scheduled.events.filter((event) => event.kind === "EffectTicked").map((event) => [event.targetId, event.effectId]))
      .toEqual([[firstTargetId, firstEffectId], [secondTargetId, secondEffectId]]);

    const removed = applyEffectInstructionsInternal(scheduled.state, secondTargetId, undefined, [{
      kind: "removeEffect",
      scope: "perResolvedTarget",
      target: "self",
      effectId: secondEffectId,
    }]);
    expect(removed.state.effects[firstKey]).toBeDefined();
    expect(removed.state.effects[secondKey]).toBeUndefined();
    expect(removed.events).toEqual([expect.objectContaining({ kind: "EffectRemoved", targetId: secondTargetId, effectId: secondEffectId })]);
  });

  it("executes the explicit Active Effect removal instruction", () => {
    const applied = resolveUseMove(state(), { kind: "useMove", actorId: id<CombatantId>("a"), moveId: id<MoveId>("burnMove") }, { rng: createRngState(1) });
    expect(applied.accepted).toBe(true);
    if (!applied.accepted) return;
    const ready = advanceTime(applied.state, applied.deterministicState, 2000);
    expect(ready.accepted).toBe(true);
    if (!ready.accepted) return;
    const removed = resolveUseMove(ready.state, { kind: "useMove", actorId: id<CombatantId>("a"), moveId: id<MoveId>("removeMove") }, ready.deterministicState);
    expect(removed.accepted).toBe(true);
    if (removed.accepted) expect(removed.state.effects).toEqual({});
  });

  it("removes an effect from a target KOed earlier in the same action", () => {
    const current = state();
    const withPurge: BattleState = {
      ...current,
      combatants: {
        ...current.combatants,
        a: {
          ...current.combatants.a,
          moveLoadout: [...current.combatants.a.moveLoadout, id<MoveId>("purge")],
          moveReadyAtMs: { ...current.combatants.a.moveReadyAtMs, purge: 0 },
        },
        b: { ...current.combatants.b, currentHp: 1 },
      },
      effects: {
        [battleEffectKey(id<CombatantId>("b"), id<EffectId>("burn"))]: {
          effectId: id<EffectId>("burn"),
          targetCombatantId: id<CombatantId>("b"),
          targetCadenceParticipant: pokemonParticipant("pokemon-b"),
          lifetimeScope: "cadence",
          stackingPolicy: "stack",
          applicationSequence: 1,
          scheduleRevision: 1,
          appliedAtMs: 0,
          expiresAtMs: 10,
          nextTickAtMs: 5,
          stacks: 1,
        },
      },
    };
    const result = resolveUseMove(withPurge, { kind: "useMove", actorId: id<CombatantId>("a"), moveId: id<MoveId>("purge"), targetId: id<CombatantId>("b") }, { rng: createRngState(1) });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.events.map((event) => event.kind)).toEqual(["MoveUsed", "DamageApplied", "CombatantKO", "EffectRemoved", "BattleEnded"]);
    expect(result.state.effects).toEqual({});
  });

  it("preserves HP continuity for a carried participant with no active effects", () => {
    const current = state();
    const carry = createCadenceCarry({ ...current, combatants: { ...current.combatants, a: { ...current.combatants.a, currentHp: 7 } }, effects: {} });
    const nextInput = input();
    nextInput.combatants = nextInput.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("a")
      ? { ...combatant, startingHp: 7 }
      : combatant);
    nextInput.cadenceCarry = carry;
    const next = initializeBattle(nextInput);
    expect(next.accepted).toBe(true);
    if (next.accepted) expect(next.state.combatants.a.currentHp).toBe(7);
  });

  it("is partition invariant for cadence boundaries and uses exact rational magnitudes", () => {
    const current = state();
    const withEffect: BattleState = {
      ...current,
      effects: {
        [battleEffectKey(id<CombatantId>("a"), id<EffectId>("fraction"))]: {
          effectId: id<EffectId>("fraction"),
          targetCombatantId: id<CombatantId>("a"),
          targetCadenceParticipant: pokemonParticipant("pokemon-a"),
          lifetimeScope: "cadence",
          stackingPolicy: "refresh",
          applicationSequence: 1,
          scheduleRevision: 1,
          appliedAtMs: 0,
          expiresAtMs: 10,
          nextTickAtMs: 5,
          stacks: 1,
        },
      },
      nextEffectApplicationSequence: 2,
    };
    const one = advanceCadence(createCadenceCarry(withEffect), context, { rng: createRngState(1) }, 10);
    const first = advanceCadence(createCadenceCarry(withEffect), context, { rng: createRngState(1) }, 5);
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    const two = advanceCadence(first.cadence, context, first.deterministicState, 5);
    expect(one.accepted).toBe(true);
    if (!one.accepted || !two.accepted) return;
    expect(two.cadence).toEqual(one.cadence);
    expect(one.cadence.hpByParticipant[participantKey("pokemon-a")]).toBe(30);
  });

  it("is partition invariant for Battle effect boundaries", () => {
    const current = state();
    const withEffect: BattleState = {
      ...current,
      combatants: { ...current.combatants, a: { ...current.combatants.a, currentHp: 10 } },
      effects: {
        [battleEffectKey(id<CombatantId>("a"), id<EffectId>("regen"))]: {
          effectId: id<EffectId>("regen"),
          targetCombatantId: id<CombatantId>("a"),
          lifetimeScope: "battle",
          stackingPolicy: "refresh",
          applicationSequence: 1,
          scheduleRevision: 1,
          appliedAtMs: 0,
          expiresAtMs: 10,
          nextTickAtMs: 5,
          stacks: 1,
        },
      },
    };
    const one = advanceTime(withEffect, { rng: createRngState(1) }, 10);
    const first = advanceTime(withEffect, { rng: createRngState(1) }, 5);
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    const two = advanceTime(first.state, first.deterministicState, 10);
    expect(one.accepted).toBe(true);
    if (!one.accepted || !two.accepted) return;
    expect(two.state).toEqual(one.state);
    expect([...first.events, ...two.events]).toEqual(one.events);
  });

  it("rejects malformed cadence HP and duplicate binding atomically", () => {
    const nextInput = input();
    nextInput.cadenceCarry = {
      effects: [],
      hpByParticipant: { [participantKey("pokemon-a")]: 21, [participantKey("pokemon-b")]: 20 },
      maxHpByParticipant: { [participantKey("pokemon-a")]: 20, [participantKey("pokemon-b")]: 20 },
      readinessByParticipant: {
        [participantKey("pokemon-a")]: { participant: pokemonParticipant("pokemon-a"), moveLoadout: [id<MoveId>("heal"), id<MoveId>("lock"), id<MoveId>("burnMove"), id<MoveId>("removeMove")], nextActionRemainingMs: 0, moveCooldownRemainingMs: { heal: 0, lock: 0, burnMove: 0, removeMove: 0 } },
        [participantKey("pokemon-b")]: { participant: pokemonParticipant("pokemon-b"), moveLoadout: [id<MoveId>("heal"), id<MoveId>("lock"), id<MoveId>("burnMove"), id<MoveId>("removeMove")], nextActionRemainingMs: 0, moveCooldownRemainingMs: { heal: 0, lock: 0, burnMove: 0, removeMove: 0 } },
      },
      actionLockRemainingMsByParticipant: { [participantKey("pokemon-a")]: 0, [participantKey("pokemon-b")]: 0 },
    };
    expect(initializeBattle(nextInput).accepted).toBe(false);
    nextInput.cadenceCarry = undefined;
    nextInput.cadenceBindings = { [participantKey("pokemon-a")]: id<CombatantId>("a"), [participantKey("pokemon-b")]: id<CombatantId>("a") };
    expect(initializeBattle(nextInput).accepted).toBe(false);
  });

  it("rejects malformed cadence contexts and duplicate application sequences atomically", () => {
    const carry = createCadenceCarry(state());
    const malformedContext = {
      ...context,
      effectRules: {
        ...context.effectRules,
        burn: { ...context.effectRules.burn, periodic: { ...context.effectRules.burn.periodic!, kind: "invalid" } },
      },
    } as unknown as ResolvedCombatContext;
    const malformed = advanceCadence(carry, malformedContext, { rng: createRngState(1) }, 5);
    expect(malformed.accepted).toBe(false);
    if (!malformed.accepted) {
      expect(malformed.cadence).toBe(carry);
      expect(malformed.deterministicState).toEqual({ rng: createRngState(1) });
    }

    const duplicateSequences = {
      ...carry,
      effects: [
        {
          effectId: id<EffectId>("burn"),
          targetCadenceParticipant: pokemonParticipant("pokemon-a"),
          lifetimeScope: "cadence" as const,
          stackingPolicy: "stack" as const,
          applicationSequence: 1,
          scheduleRevision: 1,
          remainingDurationMs: 10,
          remainingToNextTickMs: 5,
          stacks: 1,
        },
        {
          effectId: id<EffectId>("fraction"),
          targetCadenceParticipant: pokemonParticipant("pokemon-a"),
          lifetimeScope: "cadence" as const,
          stackingPolicy: "refresh" as const,
          applicationSequence: 1,
          scheduleRevision: 1,
          remainingDurationMs: 10,
          remainingToNextTickMs: 5,
          stacks: 1,
        },
      ],
    };
    expect(advanceCadence(duplicateSequences, context, { rng: createRngState(1) }, 5).accepted).toBe(false);
  });

  it("rejects malformed cadence readiness and participant associations before advancing any schedule", () => {
    const applied = resolveUseMove(
      state(),
      { kind: "useMove", actorId: id<CombatantId>("a"), moveId: id<MoveId>("burnMove") },
      { rng: createRngState(1) },
    );
    expect(applied.accepted).toBe(true);
    if (!applied.accepted) return;
    const base = createCadenceCarry(applied.state);
    const key = participantKey("pokemon-a");
    const readiness = base.readinessByParticipant[key];
    const rng = { rng: createRngState(77) };
    const malformed: Array<{ name: string; carry: CadenceCarryState }> = [
      {
        name: "empty loadout",
        carry: {
          ...base,
          readinessByParticipant: {
            ...base.readinessByParticipant,
            [key]: { ...readiness, moveLoadout: [], moveCooldownRemainingMs: {} },
          },
        },
      },
      {
        name: "five-Move loadout",
        carry: {
          ...base,
          readinessByParticipant: {
            ...base.readinessByParticipant,
            [key]: {
              ...readiness,
              moveLoadout: [id<MoveId>("heal"), id<MoveId>("lock"), id<MoveId>("burnMove"), id<MoveId>("removeMove"), id<MoveId>("purge")],
              moveCooldownRemainingMs: { heal: 0, lock: 0, burnMove: 2000, removeMove: 0, purge: 0 },
            },
          },
        },
      },
      {
        name: "duplicate MoveId",
        carry: {
          ...base,
          readinessByParticipant: {
            ...base.readinessByParticipant,
            [key]: { ...readiness, moveLoadout: [id<MoveId>("heal"), id<MoveId>("heal")], moveCooldownRemainingMs: { heal: 0 } },
          },
        },
      },
      {
        name: "unresolved MoveId",
        carry: {
          ...base,
          readinessByParticipant: {
            ...base.readinessByParticipant,
            [key]: { ...readiness, moveLoadout: [id<MoveId>("unknown")], moveCooldownRemainingMs: { unknown: 0 } },
          },
        },
      },
      {
        name: "missing cooldown key",
        carry: {
          ...base,
          readinessByParticipant: {
            ...base.readinessByParticipant,
            [key]: { ...readiness, moveCooldownRemainingMs: { heal: 0, lock: 0, burnMove: 2000 } },
          },
        },
      },
      {
        name: "extra cooldown key",
        carry: {
          ...base,
          readinessByParticipant: {
            ...base.readinessByParticipant,
            [key]: { ...readiness, moveCooldownRemainingMs: { ...readiness.moveCooldownRemainingMs, unknown: 0 } },
          },
        },
      },
      {
        name: "negative readiness clock",
        carry: {
          ...base,
          readinessByParticipant: {
            ...base.readinessByParticipant,
            [key]: { ...readiness, nextActionRemainingMs: -1 },
          },
        },
      },
      {
        name: "participant/key mismatch",
        carry: {
          ...base,
          readinessByParticipant: {
            ...base.readinessByParticipant,
            [key]: { ...readiness, participant: nonPlayerParticipant("pokemon-a") },
          },
        },
      },
      {
        name: "participant-map keyset mismatch",
        carry: {
          ...base,
          actionLockRemainingMsByParticipant: Object.fromEntries(
            Object.entries(base.actionLockRemainingMsByParticipant).filter(([participant]) => participant !== key),
          ) as CadenceCarryState["actionLockRemainingMsByParticipant"],
        },
      },
    ];

    for (const { name, carry } of malformed) {
      const before = JSON.stringify(carry);
      const result = advanceCadence(carry, context, rng, 5);
      expect(result.accepted, name).toBe(false);
      expect(result.cadence, name).toBe(carry);
      expect(result.deterministicState, name).toBe(rng);
      expect(result.consequences, name).toEqual([]);
      expect(JSON.stringify(carry), name).toBe(before);
    }
  });

  it("keeps identical raw cadence identity values distinct across participant kinds and replay/rebind", () => {
    const player = pokemonParticipant("shared-cadence-id");
    const nonPlayer = nonPlayerParticipant("shared-cadence-id");
    const playerKey = cadenceParticipantKey(player);
    const nonPlayerKey = cadenceParticipantKey(nonPlayer);
    expect(playerKey).not.toBe(nonPlayerKey);

    const crossKindInput = input();
    crossKindInput.combatants = crossKindInput.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("a")
      ? { ...combatant, startingHp: 7, cadenceParticipant: player }
      : { ...combatant, startingHp: 13, cadenceParticipant: nonPlayer });
    crossKindInput.cadenceBindings = {
      [playerKey]: id<CombatantId>("a"),
      [nonPlayerKey]: id<CombatantId>("b"),
    };
    const first = initializeBattle(crossKindInput);
    const replay = initializeBattle(crossKindInput);
    expect(first.accepted && replay.accepted).toBe(true);
    if (!first.accepted || !replay.accepted) return;
    expect(replay.state).toEqual(first.state);
    expect(replay.events).toEqual(first.events);

    const withEffects: BattleState = {
      ...first.state,
      effects: {
        [battleEffectKey(id<CombatantId>("a"), id<EffectId>("burn"))]: {
          effectId: id<EffectId>("burn"),
          targetCombatantId: id<CombatantId>("a"),
          targetCadenceParticipant: player,
          lifetimeScope: "cadence",
          stackingPolicy: "stack",
          applicationSequence: 1,
          scheduleRevision: 1,
          appliedAtMs: 0,
          expiresAtMs: 10,
          nextTickAtMs: 5,
          stacks: 1,
        },
        [battleEffectKey(id<CombatantId>("b"), id<EffectId>("fraction"))]: {
          effectId: id<EffectId>("fraction"),
          targetCombatantId: id<CombatantId>("b"),
          targetCadenceParticipant: nonPlayer,
          lifetimeScope: "cadence",
          stackingPolicy: "refresh",
          applicationSequence: 2,
          scheduleRevision: 1,
          appliedAtMs: 0,
          expiresAtMs: 10,
          nextTickAtMs: 5,
          stacks: 1,
        },
      },
      nextEffectApplicationSequence: 3,
    };
    const carry = createCadenceCarry(withEffects);
    expect(carry.hpByParticipant).toMatchObject({ [playerKey]: 7, [nonPlayerKey]: 13 });
    expect(carry.readinessByParticipant[playerKey].participant).toEqual(player);
    expect(carry.readinessByParticipant[nonPlayerKey].participant).toEqual(nonPlayer);
    expect(carry.effects.map((effect) => effect.targetCadenceParticipant)).toEqual([player, nonPlayer]);

    const advanced = advanceCadence(carry, context, first.deterministicState, 5);
    const replayAdvanced = advanceCadence(carry, context, first.deterministicState, 5);
    expect(replayAdvanced).toEqual(advanced);
    expect(advanced.accepted).toBe(true);
    if (!advanced.accepted) return;
    expect(advanced.cadence.hpByParticipant[playerKey]).toBe(4);
    expect(advanced.cadence.hpByParticipant[nonPlayerKey]).toBe(23);
    expect(advanced.cadence.actionLockRemainingMsByParticipant).toHaveProperty(playerKey, 0);
    expect(advanced.cadence.actionLockRemainingMsByParticipant).toHaveProperty(nonPlayerKey, 0);

    const playerNext = id<CombatantId>("player-next");
    const nonPlayerNext = id<CombatantId>("non-player-next");
    const nextInput: BattleInitInput = {
      ...crossKindInput,
      battleId: id("battle-cross-kind-next"),
      sides: crossKindInput.sides.map((side) => side.sideId === id("one")
        ? { ...side, combatantIds: [playerNext], initialActiveCombatantIds: [playerNext] }
        : { ...side, combatantIds: [nonPlayerNext], initialActiveCombatantIds: [nonPlayerNext] }),
      combatants: crossKindInput.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("a")
        ? { ...combatant, combatantId: playerNext, startingHp: 4 }
        : { ...combatant, combatantId: nonPlayerNext, startingHp: 23 }),
      cadenceBindings: { [playerKey]: playerNext, [nonPlayerKey]: nonPlayerNext },
      cadenceCarry: advanced.cadence,
    };
    const rebound = initializeBattle(nextInput);
    expect(rebound.accepted).toBe(true);
    if (!rebound.accepted) return;
    expect(rebound.state.combatants[playerNext].currentHp).toBe(4);
    expect(rebound.state.combatants[nonPlayerNext].currentHp).toBe(23);
    expect(rebound.state.effects[battleEffectKey(playerNext, id<EffectId>("burn"))]?.targetCadenceParticipant).toEqual(player);
    expect(rebound.state.effects[battleEffectKey(nonPlayerNext, id<EffectId>("fraction"))]?.targetCadenceParticipant).toEqual(nonPlayer);

    const incompatible = {
      ...nextInput,
      combatants: nextInput.combatants.map((combatant) => combatant.combatantId === nonPlayerNext
        ? { ...combatant, cadenceParticipant: player }
        : combatant),
    };
    const rejected = initializeBattle(incompatible);
    expect(rejected.accepted).toBe(false);
    expect(rejected.events).toEqual([]);
    expect(rejected.deterministicState).toBe(incompatible.deterministicState);
  });

  it("resolves periodic boundaries tick-before-expiry and suppresses KO-target ticks", () => {
    const current = state();
    const withEffect: BattleState = {
      ...current,
      effects: {
        [battleEffectKey(id<CombatantId>("a"), id<EffectId>("regen"))]: {
          effectId: id<EffectId>("regen"),
          targetCombatantId: id<CombatantId>("a"),
          lifetimeScope: "battle",
          stackingPolicy: "refresh",
          applicationSequence: 1,
          scheduleRevision: 1,
          appliedAtMs: 0,
          expiresAtMs: 5,
          nextTickAtMs: 5,
          stacks: 1,
        },
      },
      nextEffectApplicationSequence: 2,
    };
    const result = advanceTime(withEffect, { rng: createRngState(1) }, 5);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.events.map((event) => event.kind)).toEqual(["EffectTicked", "HealingApplied", "EffectRemoved"]);
    expect(result.state.effects).toEqual({});
  });

  it("expires a cadence effect when its already-KO target reaches a tick boundary", () => {
    const current = state();
    const withEffect: BattleState = {
      ...current,
      combatants: { ...current.combatants, a: { ...current.combatants.a, currentHp: 0 } },
      effects: {
        [battleEffectKey(id<CombatantId>("a"), id<EffectId>("burn"))]: {
          effectId: id<EffectId>("burn"),
          targetCombatantId: id<CombatantId>("a"),
          targetCadenceParticipant: pokemonParticipant("pokemon-a"),
          lifetimeScope: "cadence",
          stackingPolicy: "stack",
          applicationSequence: 1,
          scheduleRevision: 1,
          appliedAtMs: 0,
          expiresAtMs: 5,
          nextTickAtMs: 5,
          stacks: 1,
        },
      },
      nextEffectApplicationSequence: 2,
    };
    const result = advanceCadence(createCadenceCarry(withEffect), context, { rng: createRngState(1) }, 10);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.cadence.effects).toEqual([]);
    expect(result.consequences.map((consequence) => consequence.kind)).toEqual(["expiry"]);
  });

  it("expires before a first tick when interval exceeds duration", () => {
    const current = state();
    const withEffect: BattleState = {
      ...current,
      effects: {
        [battleEffectKey(id<CombatantId>("a"), id<EffectId>("slow"))]: {
          effectId: id<EffectId>("slow"),
          targetCombatantId: id<CombatantId>("a"),
          lifetimeScope: "battle",
          stackingPolicy: "replace",
          applicationSequence: 1,
          scheduleRevision: 1,
          appliedAtMs: 0,
          expiresAtMs: 5,
          nextTickAtMs: 10,
          stacks: 1,
        },
      },
      nextEffectApplicationSequence: 2,
    };
    const result = advanceTime(withEffect, { rng: createRngState(1) }, 10);
    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.events.map((event) => event.kind)).toEqual(["EffectRemoved"]);
      expect(result.state.combatants.a.currentHp).toBe(20);
    }
  });

  it("orders same-time cadence consequences independently of input effect order", () => {
    const current = state();
    const withEffects: BattleState = {
      ...current,
      combatants: { ...current.combatants, a: { ...current.combatants.a, currentHp: 10 } },
      effects: {
        [battleEffectKey(id<CombatantId>("a"), id<EffectId>("burn"))]: {
          effectId: id<EffectId>("burn"),
          targetCombatantId: id<CombatantId>("a"),
          targetCadenceParticipant: pokemonParticipant("pokemon-a"),
          lifetimeScope: "cadence",
          stackingPolicy: "stack",
          applicationSequence: 1,
          scheduleRevision: 1,
          appliedAtMs: 0,
          expiresAtMs: 5,
          nextTickAtMs: 5,
          stacks: 1,
        },
        [battleEffectKey(id<CombatantId>("a"), id<EffectId>("fraction"))]: {
          effectId: id<EffectId>("fraction"),
          targetCombatantId: id<CombatantId>("a"),
          targetCadenceParticipant: pokemonParticipant("pokemon-a"),
          lifetimeScope: "cadence",
          stackingPolicy: "refresh",
          applicationSequence: 2,
          scheduleRevision: 1,
          appliedAtMs: 0,
          expiresAtMs: 5,
          nextTickAtMs: 5,
          stacks: 1,
        },
      },
      nextEffectApplicationSequence: 3,
    };
    const first = advanceCadence(createCadenceCarry(withEffects), context, { rng: createRngState(1) }, 5);
    const reversed = advanceCadence({ ...createCadenceCarry(withEffects), effects: [...createCadenceCarry(withEffects).effects].reverse() }, context, { rng: createRngState(1) }, 5);
    expect(first).toEqual(reversed);
    expect(first.accepted && first.cadence.hpByParticipant[participantKey("pokemon-a")]).toBe(17);
  });

  it("orders same-sequence boundaries by UTF-8 EffectId bytes", () => {
    const privateUseId = id<EffectId>("\uE000");
    const supplementaryId = id<EffectId>("\u{10000}");
    const utf8Context: ResolvedCombatContext = {
      ...context,
      effectRules: {
        ...context.effectRules,
        [privateUseId]: { effectId: privateUseId, lifetimeScope: "battle", stackingPolicy: "replace", durationMs: 5, periodic: { kind: "healing", intervalMs: 5, magnitude: { kind: "integer", amount: 1 } } },
        [supplementaryId]: { effectId: supplementaryId, lifetimeScope: "battle", stackingPolicy: "replace", durationMs: 5, periodic: { kind: "healing", intervalMs: 5, magnitude: { kind: "integer", amount: 1 } } },
      },
    };
    const current = state();
    const ordered: BattleState = {
      ...current,
      context: utf8Context,
      combatants: { ...current.combatants, a: { ...current.combatants.a, currentHp: 10 } },
      effects: {
        [battleEffectKey(id<CombatantId>("a"), privateUseId)]: { effectId: privateUseId, targetCombatantId: id<CombatantId>("a"), lifetimeScope: "battle", stackingPolicy: "replace", applicationSequence: 1, scheduleRevision: 1, appliedAtMs: 0, expiresAtMs: 5, nextTickAtMs: 5, stacks: 1 },
        [battleEffectKey(id<CombatantId>("a"), supplementaryId)]: { effectId: supplementaryId, targetCombatantId: id<CombatantId>("a"), lifetimeScope: "battle", stackingPolicy: "replace", applicationSequence: 1, scheduleRevision: 1, appliedAtMs: 0, expiresAtMs: 5, nextTickAtMs: 5, stacks: 1 },
      },
    };
    const result = advanceTime(ordered, { rng: createRngState(1) }, 5);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.events.filter((event) => event.kind === "EffectTicked").map((event) => event.effectId)).toEqual([privateUseId, supplementaryId]);
  });

  it("clamps huge stacked periodic magnitudes before converting to numbers", () => {
    const carry = {
      effects: [{
        effectId: id<EffectId>("hugeBurn"),
        targetCadenceParticipant: pokemonParticipant("pokemon-a"),
        lifetimeScope: "cadence" as const,
        stackingPolicy: "stack" as const,
        applicationSequence: 1,
        scheduleRevision: 1,
        remainingDurationMs: 5,
        remainingToNextTickMs: 5,
        stacks: 2,
      }],
      hpByParticipant: { [participantKey("pokemon-a")]: 20 },
      maxHpByParticipant: { [participantKey("pokemon-a")]: 20 },
      readinessByParticipant: { [participantKey("pokemon-a")]: { participant: pokemonParticipant("pokemon-a"), moveLoadout: [id<MoveId>("heal"), id<MoveId>("lock"), id<MoveId>("burnMove"), id<MoveId>("removeMove")], nextActionRemainingMs: 0, moveCooldownRemainingMs: { heal: 0, lock: 0, burnMove: 0, removeMove: 0 } } },
      actionLockRemainingMsByParticipant: { [participantKey("pokemon-a")]: 0 },
    };
    const result = advanceCadence(carry, context, { rng: createRngState(1) }, 5);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.cadence.hpByParticipant[participantKey("pokemon-a")]).toBe(0);
    expect(result.consequences).toContainEqual({ kind: "damage", targetCadenceParticipant: pokemonParticipant("pokemon-a"), effectId: id<EffectId>("hugeBurn"), amount: 20, resultingHp: 0 });
  });

  it("rejects the next Battle after a cadence DoT KOs its continuing participant", () => {
    const current = state();
    const damaged = { ...current, combatants: { ...current.combatants, a: { ...current.combatants.a, currentHp: 2 } } };
    const cadence = advanceCadence(createCadenceCarry({
      ...damaged,
      effects: {
        [battleEffectKey(id<CombatantId>("a"), id<EffectId>("burn"))]: {
          effectId: id<EffectId>("burn"),
          targetCombatantId: id<CombatantId>("a"),
          targetCadenceParticipant: pokemonParticipant("pokemon-a"),
          lifetimeScope: "cadence",
          stackingPolicy: "stack",
          applicationSequence: 1,
          scheduleRevision: 1,
          appliedAtMs: 0,
          expiresAtMs: 10,
          nextTickAtMs: 5,
          stacks: 1,
        },
      },
      nextEffectApplicationSequence: 2,
    }), context, { rng: createRngState(1) }, 5);
    expect(cadence.accepted).toBe(true);
    if (!cadence.accepted) return;
    const nextInput = input();
    nextInput.cadenceCarry = cadence.cadence;
    expect(initializeBattle(nextInput).accepted).toBe(false);
  });

  it("carries cadence effects and applies deterministic inter-battle damage", () => {
    const current = state();
    const withEffect: BattleState = {
      ...current,
      effects: {
        [battleEffectKey(id<CombatantId>("a"), id<EffectId>("burn"))]: {
          effectId: id<EffectId>("burn"),
          targetCombatantId: id<CombatantId>("a"),
          targetCadenceParticipant: pokemonParticipant("pokemon-a"),
          lifetimeScope: "cadence",
          stackingPolicy: "stack",
          applicationSequence: 1,
          scheduleRevision: 1,
          appliedAtMs: 0,
          expiresAtMs: 10,
          nextTickAtMs: 5,
          stacks: 1,
        },
      },
      nextEffectApplicationSequence: 2,
    };
    const carry = createCadenceCarry(withEffect);
    const result = advanceCadence(carry, context, { rng: createRngState(1) }, 5);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.cadence.hpByParticipant[participantKey("pokemon-a")]).toBe(17);
    expect(result.cadence.effects[0].remainingDurationMs).toBe(5);
  });

});
