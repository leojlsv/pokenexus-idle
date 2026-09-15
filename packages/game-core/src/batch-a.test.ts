import { describe, expect, it } from "vitest";
import {
  createRngState,
  cadenceParticipantKey,
  initializeBattle,
  nextRngState,
  resolveCombatStimulus,
  type AbilityId,
  type BattleInitInput,
  type CombatantId,
  type EffectId,
  type MoveId,
  type PokemonInstanceId,
  type ResolvedCombatContext,
  type TypeId,
} from "./index";
import { deriveStats, validateBattleInit } from "./validation";

const id = <T extends string>(value: string) => value as T;

const context: ResolvedCombatContext = {
  gameDataVersion: id("game-data-v1"),
  rulesVersion: id("rules-v1"),
  combatEventSchemaVersion: id("events-v1"),
  moveRules: {
    tackle: {
      moveId: id<MoveId>("tackle"),
      typeId: id<TypeId>("normal"),
      category: "physical",
      targetScope: "singleEnemy",
      power: 40,
      accuracy: "always",
      criticalPolicy: "normal",
      moveCooldownMs: 2000,
    },
  },
  abilityRules: {},
  effectRules: {},
  typeChart: {},
};

function validInput(): BattleInitInput {
  return {
    battleId: id("battle-1"),
    context,
    deterministicState: { rng: createRngState(1) },
    sides: [
      { sideId: id("red"), activeCapacity: 1, combatantIds: [id<CombatantId>("a")], initialActiveCombatantIds: [id<CombatantId>("a")] },
      { sideId: id("blue"), activeCapacity: 1, combatantIds: [id<CombatantId>("b")], initialActiveCombatantIds: [id<CombatantId>("b")] },
    ],
    combatants: [
      {
        combatantId: id<CombatantId>("a"),
        speciesId: id("species-a"),
        level: 10,
        baseStats: { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 },
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        types: [id("normal")],
        startingHp: 30,
        moveLoadout: [id<MoveId>("tackle")],
        initialNextActionRemainingMs: 4,
        initialMoveCooldownRemainingMs: { tackle: 8 },
      },
      {
        combatantId: id<CombatantId>("b"),
        speciesId: id("species-b"),
        level: 10,
        baseStats: { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 },
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        types: [id("normal")],
        startingHp: 30,
        moveLoadout: [id<MoveId>("tackle")],
        initialNextActionRemainingMs: 0,
        initialMoveCooldownRemainingMs: { tackle: 0 },
      },
    ],
  };
}

describe("TASK-009 Batch A", () => {
  it("advances the explicit xorshift32 state deterministically", () => {
    expect(nextRngState(createRngState(1))).toEqual({ algorithm: "xorshift32-v1", state: 270369 });
  });

  it("constructs validated battle state without consuming RNG", () => {
    const input = validInput();
    const result = initializeBattle(input);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.deterministicState).toEqual(input.deterministicState);
    expect(result.events).toEqual([{ kind: "BattleStarted", battleId: input.battleId, sequence: 1, combatTimeMs: 0 }]);
    expect(result.state.combatants.a.maxHp).toBe(30);
    expect(result.state.combatants.a.currentHp).toBe(30);
    expect(result.state.combatants.a.nextActionAtMs).toBe(4);
    expect(result.state.combatants.a.moveReadyAtMs.tackle).toBe(8);
    expect(result.state.combatants.a.stages).toEqual({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  });

  it("rejects malformed readiness atomically", () => {
    const input = validInput();
    input.combatants[0].initialMoveCooldownRemainingMs = {};
    const result = initializeBattle(input);
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.deterministicState).toEqual(input.deterministicState);
    expect(result.events).toEqual([]);
    expect(result.reason).toContain("readiness keys");
  });

  it("round-trips reserved CombatantId values as own keys and resolves actions without prototype mutation", () => {
    const reservedCombatantId = id<CombatantId>("__proto__");
    const input = validInput();
    input.context = {
      ...context,
      typeChart: { normal: { normal: 1 } },
      moveRules: {
        tackle: { ...context.moveRules.tackle, criticalPolicy: "never" },
      },
    };
    input.sides = input.sides.map((side) => side.sideId === id("red")
      ? { ...side, combatantIds: [reservedCombatantId], initialActiveCombatantIds: [reservedCombatantId] }
      : side);
    input.combatants = input.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("a")
      ? { ...combatant, combatantId: reservedCombatantId, initialNextActionRemainingMs: 0, initialMoveCooldownRemainingMs: { tackle: 0 } }
      : combatant);

    const initialized = initializeBattle(input);
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    expect(Object.getPrototypeOf(initialized.state.combatants)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(initialized.state.combatants, reservedCombatantId)).toBe(true);
    expect(Object.keys(initialized.state.combatants).sort()).toEqual(["__proto__", "b"].sort());
    expect(initialized.state.combatants[reservedCombatantId].combatantId).toBe(reservedCombatantId);
    expect(Object.getPrototypeOf(initialized.state.combatants[reservedCombatantId].moveReadyAtMs)).toBeNull();

    const result = resolveCombatStimulus(
      initialized.state,
      { kind: "useMove", actorId: reservedCombatantId, moveId: id<MoveId>("tackle"), targetId: id<CombatantId>("b") },
      initialized.deterministicState,
    );
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(Object.getPrototypeOf(result.state.combatants)).toBeNull();
    expect(result.state.combatants[reservedCombatantId].nextActionAtMs).toBe(2000);
    expect(result.state.combatants[reservedCombatantId].moveReadyAtMs.tackle).toBe(2000);
  });

  it("does not resolve inherited reserved-name catalog entries", () => {
    const inheritedMoveId = id<MoveId>("constructor");
    const inheritedAbilityId = id<AbilityId>("constructor");
    const inheritedEffectId = id<EffectId>("constructor");
    const inheritedTypeId = id<TypeId>("constructor");

    const moveInput = validInput();
    moveInput.context = {
      ...context,
      moveRules: Object.create({
        constructor: { ...context.moveRules.tackle, moveId: inheritedMoveId },
      }) as ResolvedCombatContext["moveRules"],
    };
    moveInput.combatants[0].moveLoadout = [inheritedMoveId];
    moveInput.combatants[0].initialMoveCooldownRemainingMs = Object.fromEntries([[inheritedMoveId, 0]]);
    expect(initializeBattle(moveInput)).toMatchObject({ accepted: false, reason: "unresolved move: constructor" });

    const abilityInput = validInput();
    abilityInput.context = {
      ...context,
      abilityRules: Object.create({
        constructor: { abilityId: inheritedAbilityId, reactions: [] },
      }) as ResolvedCombatContext["abilityRules"],
    };
    abilityInput.combatants[0].abilityId = inheritedAbilityId;
    expect(initializeBattle(abilityInput)).toMatchObject({ accepted: false, reason: "unresolved ability: constructor" });

    const effectMoveId = id<MoveId>("effect-carrier");
    const effectInput = validInput();
    effectInput.context = {
      ...context,
      moveRules: {
        ...context.moveRules,
        [effectMoveId]: {
          moveId: effectMoveId,
          category: "status",
          targetScope: "self",
          moveCooldownMs: 2000,
          accuracy: "always",
          effects: [{ kind: "applyEffect", scope: "perResolvedTarget", target: "self", effectId: inheritedEffectId }],
        },
      },
      effectRules: Object.create({
        constructor: { effectId: inheritedEffectId, lifetimeScope: "battle", stackingPolicy: "replace", durationMs: 10 },
      }) as ResolvedCombatContext["effectRules"],
    };
    effectInput.combatants[0].moveLoadout = [effectMoveId];
    effectInput.combatants[0].initialMoveCooldownRemainingMs = { [effectMoveId]: 0 };
    expect(initializeBattle(effectInput)).toMatchObject({ accepted: false, reason: "effect-carrier: unresolved effect: constructor" });

    const typeInput = validInput();
    typeInput.context = {
      ...context,
      moveRules: {
        tackle: { ...context.moveRules.tackle, typeId: inheritedTypeId, criticalPolicy: "never" },
      },
      typeChart: Object.create({ constructor: { normal: 1 } }) as ResolvedCombatContext["typeChart"],
    };
    typeInput.combatants[0].initialNextActionRemainingMs = 0;
    typeInput.combatants[0].initialMoveCooldownRemainingMs = { tackle: 0 };
    const typeInitialized = initializeBattle(typeInput);
    expect(typeInitialized.accepted).toBe(true);
    if (!typeInitialized.accepted) return;
    const typeResult = resolveCombatStimulus(
      typeInitialized.state,
      { kind: "useMove", actorId: id<CombatantId>("a"), moveId: id<MoveId>("tackle"), targetId: id<CombatantId>("b") },
      typeInitialized.deterministicState,
    );
    expect(typeResult).toMatchObject({ accepted: false, reason: "type chart row is missing: constructor" });
  });

  it("accepts owned reserved-name Move/Ability/Effect/Type IDs and resolves them through the authoritative path", () => {
    const reservedMoveId = id<MoveId>("__proto__");
    const reservedAbilityId = id<AbilityId>("constructor");
    const reservedEffectId = id<EffectId>("__proto__");
    const attackTypeId = id<TypeId>("__proto__");
    const defenseTypeId = id<TypeId>("constructor");
    const input = validInput();
    input.context = {
      ...context,
      moveRules: Object.fromEntries([
        [reservedMoveId, {
          moveId: reservedMoveId,
          typeId: attackTypeId,
          category: "physical" as const,
          targetScope: "singleEnemy" as const,
          power: 40,
          accuracy: "always" as const,
          criticalPolicy: "never" as const,
          moveCooldownMs: 2000,
          effects: [{ kind: "applyEffect" as const, scope: "perResolvedTarget" as const, target: "self" as const, effectId: reservedEffectId }],
        }],
        [id<MoveId>("tackle"), context.moveRules.tackle],
      ]),
      abilityRules: Object.fromEntries([[
        reservedAbilityId,
        {
          abilityId: reservedAbilityId,
          reactions: [{ trigger: "battleStart" as const, target: "self" as const, order: 1, effects: [{ kind: "statStage" as const, stat: "atk" as const, delta: 1 }] }],
        },
      ]]),
      effectRules: Object.fromEntries([[
        reservedEffectId,
        { effectId: reservedEffectId, lifetimeScope: "battle" as const, stackingPolicy: "replace" as const, durationMs: 10 },
      ]]),
      typeChart: Object.fromEntries([[
        attackTypeId,
        Object.fromEntries([[defenseTypeId, 1 as const]]),
      ]]),
    };
    input.combatants = input.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("a")
      ? {
        ...combatant,
        types: [attackTypeId],
        abilityId: reservedAbilityId,
        moveLoadout: [reservedMoveId],
        initialNextActionRemainingMs: 0,
        initialMoveCooldownRemainingMs: Object.fromEntries([[reservedMoveId, 0]]),
      }
      : { ...combatant, types: [defenseTypeId] });

    const initialized = initializeBattle(input);
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    expect(initialized.state.combatants.a.stages.atk).toBe(1);
    expect(Object.prototype.hasOwnProperty.call(initialized.state.combatants.a.moveReadyAtMs, reservedMoveId)).toBe(true);

    const result = resolveCombatStimulus(
      initialized.state,
      { kind: "useMove", actorId: id<CombatantId>("a"), moveId: reservedMoveId, targetId: id<CombatantId>("b") },
      initialized.deterministicState,
    );
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "EffectApplied", effectId: reservedEffectId, targetId: id<CombatantId>("a") }));
  });

  it("compares opaque MoveId readiness keys structurally instead of delimiter-joining them", () => {
    const moveA = id<MoveId>("a");
    const moveBNullC = id<MoveId>("b\0c");
    const collidingKeyA = id<MoveId>("a\0b");
    const collidingKeyB = id<MoveId>("c");
    const input = validInput();
    input.context = {
      ...context,
      moveRules: {
        ...context.moveRules,
        [moveA]: { ...context.moveRules.tackle, moveId: moveA },
        [moveBNullC]: { ...context.moveRules.tackle, moveId: moveBNullC },
      },
    };
    input.combatants[0].moveLoadout = [moveA, moveBNullC];
    input.combatants[0].initialMoveCooldownRemainingMs = { [moveA]: 1, [moveBNullC]: 2 };
    expect(initializeBattle(input).accepted).toBe(true);

    const malformed = validInput();
    malformed.context = input.context;
    malformed.combatants[0].moveLoadout = [moveA, moveBNullC];
    malformed.combatants[0].initialMoveCooldownRemainingMs = { [collidingKeyA]: 1, [collidingKeyB]: 2 };
    expect([moveA, moveBNullC].join("\0")).toBe([collidingKeyA, collidingKeyB].join("\0"));
    const rejected = initializeBattle(malformed);
    expect(rejected.accepted).toBe(false);
    if (!rejected.accepted) {
      expect(rejected.reason).toContain("readiness keys");
      expect(rejected.deterministicState).toBe(malformed.deterministicState);
      expect(rejected.events).toEqual([]);
    }
  });

  it("requires an exact cadence identity rebind", () => {
    const input = validInput();
    const participant = {
      kind: "pokemonInstance",
      identity: id<PokemonInstanceId>("pokemon-instance-1"),
    } as const;
    input.combatants[0].cadenceParticipant = participant;
    expect(validateBattleInit(input)).toContain("cadence participant");
    input.cadenceBindings = { [cadenceParticipantKey(participant)]: id<CombatantId>("a") };
    expect(validateBattleInit(input)).toBeUndefined();
  });

  it("rejects invalid cadence participant kind or empty identity before initialization", () => {
    for (const cadenceParticipant of [
      { kind: "unsupported", identity: "stable" },
      { kind: "pokemonInstance", identity: "" },
    ]) {
      const input = validInput();
      input.combatants[0].cadenceParticipant = cadenceParticipant as never;
      const result = initializeBattle(input);
      expect(result.accepted).toBe(false);
      expect(result.events).toEqual([]);
      expect(result.deterministicState).toBe(input.deterministicState);
    }
  });

  it("fails closed for unsupported context versions and unresolved moves", () => {
    const input = validInput();
    input.context = { ...context, rulesVersion: id("") };
    expect(validateBattleInit(input)).toContain("rulesVersion");
    input.context = context;
    input.combatants[0].moveLoadout = [id<MoveId>("unknown")];
    expect(validateBattleInit(input)).toContain("unresolved move");
  });

  it("rejects side members not present in combatants", () => {
    const input = validInput();
    input.sides[0].combatantIds = [id<CombatantId>("unknown")];
    input.sides[0].initialActiveCombatantIds = [id<CombatantId>("unknown")];
    expect(validateBattleInit(input)).toContain("unknown combatant");
  });

  it("rejects combatants that no side owns", () => {
    const input = validInput();
    const unowned = { ...input.combatants[0], combatantId: id<CombatantId>("unowned") };
    expect(validateBattleInit({ ...input, combatants: [...input.combatants, unowned] })).toContain("not owned");
  });

  it("uses exact integer arithmetic and rejects unsafe derived stats", () => {
    const exactStats = deriveStats(
      { hp: Number.MAX_SAFE_INTEGER, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      { hp: 31, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      1,
    );
    expect(exactStats?.hp).toBe(180143985094831);

    const input = validInput();
    input.combatants[0].baseStats = {
      hp: Number.MAX_SAFE_INTEGER,
      atk: 0,
      def: 0,
      spa: 0,
      spd: 0,
      spe: 0,
    };
    input.combatants[0].level = 200;
    expect(validateBattleInit(input)).toContain("derived stats invalid");
  });

  it("accepts only the inclusive combat level domain 1..200", () => {
    const input = validInput();
    input.combatants[0].level = 1;
    input.combatants[0].startingHp = 11;
    expect(validateBattleInit(input)).toBeUndefined();
    input.combatants[0].level = 200;
    expect(validateBattleInit(input)).toBeUndefined();
    input.combatants[0].level = 0;
    expect(validateBattleInit(input)).toContain("level invalid");
    input.combatants[0].level = 201;
    expect(validateBattleInit(input)).toContain("level invalid");
    input.combatants[0].level = 1.5;
    expect(validateBattleInit(input)).toContain("level invalid");
  });
});
