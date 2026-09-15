import { describe, expect, it } from "vitest";
import {
  advanceCadence,
  cadenceParticipantKey,
  createCadenceCarry,
  createRngState,
  initializeBattle,
  resolveCombatStimulus,
  deriveSimpleDamageMoveCooldownMs,
  type BattleCombatantState,
  type BattleInitInput,
  type BattleState,
  type AbilityId,
  type CombatantId,
  type MoveId,
  type ResolvedCombatContext,
  type TypeId,
} from "./index";
import {
  calculateBaseDamage,
  calculateEffectiveStat,
  calculateFinalDamage,
  calculateStab,
  calculateTypeEffectiveness,
  compareInitiative,
  compareUtf8Bytes,
  drawUniformInteger,
} from "./combat-math";
import { resolveUseMove } from "./battle";
import { advanceTime } from "./effects";

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
      accuracy: 100,
      moveCooldownMs: 2000,
      criticalPolicy: "normal",
      makesContact: true,
    },
    swift: {
      moveId: id<MoveId>("swift"),
      typeId: id<TypeId>("normal"),
      category: "special",
      targetScope: "allEnemies",
      power: 60,
      accuracy: "always",
      moveCooldownMs: 3000,
      criticalPolicy: "normal",
    },
    thunderbolt: {
      moveId: id<MoveId>("thunderbolt"),
      typeId: id<TypeId>("electric"),
      category: "special",
      targetScope: "singleEnemy",
      power: 90,
      accuracy: 100,
      moveCooldownMs: 3500,
      criticalPolicy: "normal",
    },
    zap: {
      moveId: id<MoveId>("zap"),
      typeId: id<TypeId>("electric"),
      category: "special",
      targetScope: "singleEnemy",
      power: 50,
      accuracy: 50, // low accuracy for miss testing
      moveCooldownMs: 2000,
      criticalPolicy: "normal",
    },
  },
  abilityRules: {},
  effectRules: {},
  typeChart: {
    electric: {
      water: 2,
      ground: 0,
      grass: 0.5,
    },
    normal: {
      ghost: 0,
      rock: 0.5,
      water: 1,
      ground: 1,
    },
  },
};

function createTestBattle(): { initInput: BattleInitInput; startState: BattleState } {
  const initInput: BattleInitInput = {
    battleId: id("battle-b"),
    context,
    deterministicState: { rng: createRngState(100) },
    sides: [
      {
        sideId: id("red"),
        activeCapacity: 1,
        combatantIds: [id<CombatantId>("pika")],
        initialActiveCombatantIds: [id<CombatantId>("pika")],
      },
      {
        sideId: id("blue"),
        activeCapacity: 1,
        combatantIds: [id<CombatantId>("water-foe"), id<CombatantId>("ground-foe")],
        initialActiveCombatantIds: [id<CombatantId>("water-foe")],
      },
    ],
    combatants: [
      {
        combatantId: id<CombatantId>("pika"),
        speciesId: id("pikachu"),
        level: 20,
        baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
        ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
        types: [id("electric")],
        startingHp: 40,
        moveLoadout: [id<MoveId>("tackle"), id<MoveId>("thunderbolt"), id<MoveId>("zap"), id<MoveId>("swift")],
        initialNextActionRemainingMs: 0,
        initialMoveCooldownRemainingMs: { tackle: 0, thunderbolt: 0, zap: 0, swift: 0 },
      },
      {
        combatantId: id<CombatantId>("water-foe"),
        speciesId: id("squirtle"),
        level: 20,
        baseStats: { hp: 44, atk: 48, def: 65, spa: 50, spd: 64, spe: 43 },
        ivs: { hp: 10, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 },
        types: [id("water")],
        startingHp: 45,
        moveLoadout: [id<MoveId>("tackle")],
        initialNextActionRemainingMs: 0,
        initialMoveCooldownRemainingMs: { tackle: 0 },
      },
      {
        combatantId: id<CombatantId>("ground-foe"),
        speciesId: id("geodude"),
        level: 20,
        baseStats: { hp: 40, atk: 80, def: 100, spa: 30, spd: 30, spe: 20 },
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        types: [id("ground")],
        startingHp: 40,
        moveLoadout: [id<MoveId>("tackle")],
        initialNextActionRemainingMs: 0,
        initialMoveCooldownRemainingMs: { tackle: 0 },
      },
    ],
  };

  const initResult = initializeBattle(initInput);
  if (!initResult.accepted) throw new Error(`failed to init test battle: ${initResult.reason}`);
  return { initInput, startState: initResult.state };
}

describe("TASK-009 Batch B: Combat Arithmetic & Legality", () => {
  it("derives published simple-damage cooldowns with the exact Power/PP curve", () => {
    expect(deriveSimpleDamageMoveCooldownMs(60, 20)).toBe(3500);
    expect(deriveSimpleDamageMoveCooldownMs(120, 10)).toBe(8800);
    expect([30, 29, 20, 19, 10, 9, 5, 4, 1].map((pp) => deriveSimpleDamageMoveCooldownMs(60, pp)))
      .toEqual([2800, 2900, 3500, 3700, 4800, 5000, 6000, 6000, 6000]);
    expect(deriveSimpleDamageMoveCooldownMs(1, 30)).toBe(2000);
    expect(deriveSimpleDamageMoveCooldownMs(1000, 20)).toBe(10000);
    expect(deriveSimpleDamageMoveCooldownMs(Number.MAX_SAFE_INTEGER, 20)).toBe(10000);
    expect(deriveSimpleDamageMoveCooldownMs(0, 20)).toBeUndefined();
    expect(deriveSimpleDamageMoveCooldownMs(60, 0)).toBeUndefined();
  });

  describe("Stat stages and effective stats", () => {
    it("calculates effective stats with clamping in [-6..+6]", () => {
      // S = 100
      expect(calculateEffectiveStat(100, 0)).toBe(100);
      expect(calculateEffectiveStat(100, 1)).toBe(150);
      expect(calculateEffectiveStat(100, 2)).toBe(200);
      expect(calculateEffectiveStat(100, 6)).toBe(400);
      expect(calculateEffectiveStat(100, 7)).toBe(400); // clamped to +6

      expect(calculateEffectiveStat(100, -1)).toBe(66); // floor(100 * 2 / 3) = 66
      expect(calculateEffectiveStat(100, -2)).toBe(50); // floor(100 * 2 / 4) = 50
      expect(calculateEffectiveStat(100, -6)).toBe(25); // floor(100 * 2 / 8) = 25
      expect(calculateEffectiveStat(100, -7)).toBe(25); // clamped to -6
    });

    it("orders same-time initiative by Speed then CombatantId UTF-8 byte order", () => {
      const c1 = {
        combatantId: id<CombatantId>("alpha"),
        sideId: id("red"),
        speciesId: id("s"),
        level: 10,
        types: [],
        maxHp: 100,
        derivedStats: { hp: 100, atk: 50, def: 50, spa: 50, spd: 50, spe: 100 },
        currentHp: 100,
        moveLoadout: [],
        nextActionAtMs: 0,
        moveReadyAtMs: {},
        stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      } as BattleCombatantState;

      const c2 = {
        combatantId: id<CombatantId>("beta"),
        sideId: id("blue"),
        speciesId: id("s"),
        level: 10,
        types: [],
        maxHp: 100,
        derivedStats: { hp: 100, atk: 50, def: 50, spa: 50, spd: 50, spe: 100 },
        currentHp: 100,
        moveLoadout: [],
        nextActionAtMs: 0,
        moveReadyAtMs: {},
        stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      } as BattleCombatantState;

      const c3 = {
        combatantId: id<CombatantId>("gamma"),
        sideId: id("blue"),
        speciesId: id("s"),
        level: 10,
        types: [],
        maxHp: 100,
        derivedStats: { hp: 100, atk: 50, def: 50, spa: 50, spd: 50, spe: 120 },
        currentHp: 100,
        moveLoadout: [],
        nextActionAtMs: 0,
        moveReadyAtMs: {},
        stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      } as BattleCombatantState;

      // c3 is faster
      expect(compareInitiative(c3, c1)).toBeLessThan(0);
      expect(compareInitiative(c1, c3)).toBeGreaterThan(0);

      // c1 vs c2 have same speed: "alpha" < "beta" so c1 comes first
      expect(compareInitiative(c1, c2)).toBeLessThan(0);
      expect(compareInitiative(c2, c1)).toBeGreaterThan(0);

      const nonBmp = { ...c1, combatantId: id<CombatantId>("𐀀") };
      const bmp = { ...c2, combatantId: id<CombatantId>("") };
      expect(compareUtf8Bytes(bmp.combatantId, nonBmp.combatantId)).toBeLessThan(0);
      expect(compareInitiative(bmp, nonBmp)).toBeLessThan(0);
    });

    it("maps the non-zero xorshift32 domain without modulo bias", () => {
      const fullDomainDraw = drawUniformInteger({ rng: createRngState(1) }, 1, 0xffffffff);
      expect(fullDomainDraw.value).toBe(270369);
      const binaryDraw = drawUniformInteger({ rng: createRngState(1) }, 0, 1);
      expect(binaryDraw.value).toBe(0);
      expect(binaryDraw.nextState.rng.state).toBe(270369);
    });
  });

  describe("Base damage, STAB, Type effectiveness, and Rounding", () => {
    it("computes exact integer base damage", () => {
      // L=50, P=90, A=100, D=100
      // levelFactor = floor(100/5) + 2 = 22
      // scaled = floor(22 * 90 * 100 / 100) = 1980
      // baseDamage = floor(1980 / 50) + 2 = 39 + 2 = 41
      const base = calculateBaseDamage(50, 90, 100, 100);
      expect(base).toBe(41n);
    });

    it("applies STAB (3/2) and Type Effectiveness correctly", () => {
      const stab = calculateStab(id<TypeId>("electric"), [id<TypeId>("electric"), id<TypeId>("steel")]);
      expect(stab).toEqual({ num: 3n, den: 2n });

      const nonStab = calculateStab(id<TypeId>("normal"), [id<TypeId>("electric")]);
      expect(nonStab).toEqual({ num: 1n, den: 1n });

      const superEff = calculateTypeEffectiveness(id<TypeId>("electric"), [id<TypeId>("water")], context.typeChart);
      if ("error" in superEff) throw new Error(superEff.error);
      expect(superEff).toEqual({ num: 2n, den: 1n, isImmune: false });

      const notVeryEff = calculateTypeEffectiveness(id<TypeId>("electric"), [id<TypeId>("grass")], context.typeChart);
      if ("error" in notVeryEff) throw new Error(notVeryEff.error);
      expect(notVeryEff).toEqual({ num: 1n, den: 2n, isImmune: false });

      const dualType = calculateTypeEffectiveness(
        id<TypeId>("electric"),
        [id<TypeId>("water"), id<TypeId>("grass")],
        context.typeChart,
      );
      if ("error" in dualType) throw new Error(dualType.error);
      expect(dualType).toEqual({ num: 2n, den: 2n, isImmune: false });
      expect(calculateFinalDamage(40n, { num: 1n, den: 1n }, dualType, false, 100)).toBe(40);

      const immune = calculateTypeEffectiveness(id<TypeId>("electric"), [id<TypeId>("ground")], context.typeChart);
      if ("error" in immune) throw new Error(immune.error);
      expect(immune.isImmune).toBe(true);
      expect(immune.num).toBe(0n);

      const missing = calculateTypeEffectiveness(id<TypeId>("electric"), [id<TypeId>("fire")], context.typeChart);
      expect("error" in missing ? missing.error : "").toContain("entry is missing");
    });

    it("computes final damage with rational rounding and minimum damage rule", () => {
      // baseDamage=40, stab=3/2, eff=2/1, crit=no, variance=100 -> 40 * 1.5 * 2 = 120
      const d1 = calculateFinalDamage(40n, { num: 3n, den: 2n }, { num: 2n, den: 1n }, false, 100);
      expect(d1).toBe(120);

      // If immune, damage is exactly 0
      const dImmune = calculateFinalDamage(40n, { num: 1n, den: 1n }, { num: 0n, den: 1n }, false, 100);
      expect(dImmune).toBe(0);

      // If calculated damage < 1 (but non-zero/non-immune), finalDamage is max(1, floor(modified))
      const dMin = calculateFinalDamage(1n, { num: 1n, den: 1n }, { num: 1n, den: 2n }, false, 85);
      // 1 * 1/2 * 85/100 = 85/200 = 0 -> clamped to 1
      expect(dMin).toBe(1);
    });
  });

  describe("resolveUseMove execution", () => {
    it("applies the multiplied dual-type effectiveness through the authoritative resolver", () => {
      const { initInput } = createTestBattle();
      const dualTypeInput: BattleInitInput = {
        ...initInput,
        context: {
          ...context,
          moveRules: {
            ...context.moveRules,
            thunderbolt: { ...context.moveRules.thunderbolt, accuracy: "always", criticalPolicy: "never" },
          },
        },
        combatants: initInput.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("water-foe")
          ? { ...combatant, types: [id<TypeId>("water"), id<TypeId>("grass")] }
          : combatant),
      };
      const initialized = initializeBattle(dualTypeInput);
      expect(initialized.accepted).toBe(true);
      if (!initialized.accepted) return;
      const result = resolveCombatStimulus(
        initialized.state,
        { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: id<MoveId>("thunderbolt"), targetId: id<CombatantId>("water-foe") },
        { rng: createRngState(1) },
      );
      expect(result.accepted).toBe(true);
      if (!result.accepted) return;
      expect(result.events).toContainEqual(expect.objectContaining({
        kind: "DamageApplied",
        source: "move",
        moveId: id<MoveId>("thunderbolt"),
        targetId: id<CombatantId>("water-foe"),
        amount: 21,
        resultingHp: 24,
      }));
      expect(result.deterministicState).toEqual(drawUniformInteger({ rng: createRngState(1) }, 85, 100).nextState);
    });

    it("freezes direct-hit offense before an earlier target reaction mutates the actor", () => {
      const { initInput } = createTestBattle();
      const firstTargetId = id<CombatantId>("first-target");
      const secondTargetId = id<CombatantId>("second-target");
      const reactionAbilityId = id<AbilityId>("boost-attacker-after-hit");
      const waterTemplate = initInput.combatants.find((combatant) => combatant.combatantId === id<CombatantId>("water-foe"))!;
      const freezeInput: BattleInitInput = {
        ...initInput,
        context: {
          ...context,
          moveRules: {
            ...context.moveRules,
            swift: { ...context.moveRules.swift, accuracy: "always", criticalPolicy: "never" },
          },
          abilityRules: {
            [reactionAbilityId]: {
              abilityId: reactionAbilityId,
              reactions: [{
                trigger: "afterDirectDamageTaken",
                target: "counterpart",
                order: 1,
                effects: [{ kind: "statStage", stat: "spa", delta: 6 }],
              }],
            },
          },
        },
        sides: [
          { ...initInput.sides[0], combatantIds: [id<CombatantId>("pika")], initialActiveCombatantIds: [id<CombatantId>("pika")] },
          {
            ...initInput.sides[1],
            activeCapacity: 2,
            combatantIds: [firstTargetId, secondTargetId],
            initialActiveCombatantIds: [firstTargetId, secondTargetId],
          },
        ],
        combatants: [
          {
            ...initInput.combatants[0],
            moveLoadout: [id<MoveId>("swift")],
            initialMoveCooldownRemainingMs: { swift: 0 },
          },
          {
            ...waterTemplate,
            combatantId: firstTargetId,
            abilityId: reactionAbilityId,
            initialNextActionRemainingMs: 9999,
          },
          {
            ...waterTemplate,
            combatantId: secondTargetId,
            initialNextActionRemainingMs: 9999,
          },
        ],
      };
      const initialized = initializeBattle(freezeInput);
      expect(initialized.accepted).toBe(true);
      if (!initialized.accepted) return;

      const actorBefore = initialized.state.combatants.pika;
      const targetBefore = initialized.state.combatants[secondTargetId];
      const frozenOffense = calculateEffectiveStat(actorBefore.derivedStats.spa, actorBefore.stages.spa);
      const frozenDefense = calculateEffectiveStat(targetBefore.derivedStats.spd, targetBefore.stages.spd);
      const baseDamage = calculateBaseDamage(actorBefore.level, context.moveRules.swift.power!, frozenOffense, frozenDefense);
      const stab = calculateStab(context.moveRules.swift.typeId, actorBefore.types);
      const effectiveness = calculateTypeEffectiveness(context.moveRules.swift.typeId, targetBefore.types, context.typeChart);
      if ("error" in effectiveness) throw new Error(effectiveness.error);
      const rng = { rng: createRngState(100) };
      const firstVariance = drawUniformInteger(rng, 85, 100);
      const secondVariance = drawUniformInteger(firstVariance.nextState, 85, 100);
      const expectedFrozenSecondDamage = calculateFinalDamage(baseDamage, stab, effectiveness, false, secondVariance.value);
      const mutatedOffense = calculateEffectiveStat(actorBefore.derivedStats.spa, 6);
      const mutatedBaseDamage = calculateBaseDamage(actorBefore.level, context.moveRules.swift.power!, mutatedOffense, frozenDefense);
      const incorrectlyMutableSecondDamage = calculateFinalDamage(mutatedBaseDamage, stab, effectiveness, false, secondVariance.value);
      expect(incorrectlyMutableSecondDamage).not.toBe(expectedFrozenSecondDamage);

      const first = resolveCombatStimulus(
        initialized.state,
        { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: id<MoveId>("swift") },
        rng,
      );
      const replay = resolveCombatStimulus(
        initialized.state,
        { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: id<MoveId>("swift") },
        rng,
      );
      expect(first.accepted && replay.accepted).toBe(true);
      if (!first.accepted || !replay.accepted) return;
      const directEvents = first.events.filter((event) => event.kind === "DamageApplied");
      expect(directEvents.map((event) => event.targetId)).toEqual([firstTargetId, secondTargetId]);
      expect(directEvents[1]).toMatchObject({ amount: expectedFrozenSecondDamage, targetId: secondTargetId });
      expect(first.events.filter((event) => event.kind === "DamageApplied" || event.kind === "StatStageChanged").map((event) => event.kind))
        .toEqual(["DamageApplied", "StatStageChanged", "DamageApplied"]);
      expect(first.state.combatants.pika.stages.spa).toBe(6);
      expect(first.deterministicState).toEqual(secondVariance.nextState);
      expect(replay).toEqual(first);
    });

    it("caps MAX_SAFE_INTEGER direct power against target HP without throwing and replays atomically", () => {
      const { initInput } = createTestBattle();
      const hugeMoveId = id<MoveId>("max-power");
      const hugeInput: BattleInitInput = {
        ...initInput,
        context: {
          ...context,
          moveRules: {
            ...context.moveRules,
            [hugeMoveId]: {
              moveId: hugeMoveId,
              typeId: id<TypeId>("normal"),
              category: "physical",
              targetScope: "singleEnemy",
              power: Number.MAX_SAFE_INTEGER,
              accuracy: "always",
              moveCooldownMs: 10000,
              criticalPolicy: "never",
            },
          },
        },
        combatants: initInput.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("pika")
          ? { ...combatant, moveLoadout: [hugeMoveId], initialMoveCooldownRemainingMs: { [hugeMoveId]: 0 } }
          : combatant),
      };
      const initialized = initializeBattle(hugeInput);
      expect(initialized.accepted).toBe(true);
      if (!initialized.accepted) return;
      const rng = { rng: createRngState(123) };
      const beforeState = JSON.stringify(initialized.state);
      const run = () => resolveCombatStimulus(
        initialized.state,
        { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: hugeMoveId, targetId: id<CombatantId>("water-foe") },
        rng,
      );
      expect(run).not.toThrow();
      const first = run();
      const replay = run();
      expect(first.accepted && replay.accepted).toBe(true);
      if (!first.accepted || !replay.accepted) return;
      expect(first.events).toContainEqual(expect.objectContaining({
        kind: "DamageApplied",
        source: "move",
        moveId: hugeMoveId,
        targetId: id<CombatantId>("water-foe"),
        amount: 45,
        resultingHp: 0,
      }));
      expect(first.deterministicState).toEqual(drawUniformInteger(rng, 85, 100).nextState);
      expect(replay).toEqual(first);
      expect(JSON.stringify(initialized.state)).toBe(beforeState);
      expect(initialized.state.combatants["water-foe"].currentHp).toBe(45);
      expect(rng).toEqual({ rng: createRngState(123) });
    });

    it("resolves all-enemy targets in UTF-8 order with per-target RNG and deterministic replay", () => {
      const { initInput } = createTestBattle();
      const pikaParticipant = {
        kind: "pokemonInstance" as const,
        identity: id("pika-instance") as import("@pokenexus/game-types").PokemonInstanceId,
      };
      const pikaParticipantKey = cadenceParticipantKey(pikaParticipant);
      const multiInput: BattleInitInput = {
        ...initInput,
        sides: initInput.sides.map((side) => side.sideId === id("blue")
          ? { ...side, activeCapacity: 2, initialActiveCombatantIds: [id<CombatantId>("water-foe"), id<CombatantId>("ground-foe")] }
          : side),
        combatants: initInput.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("pika")
          ? { ...combatant, cadenceParticipant: pikaParticipant }
          : combatant),
        cadenceBindings: { [pikaParticipantKey]: id<CombatantId>("pika") },
      };
      const firstInit = initializeBattle(multiInput);
      const secondInit = initializeBattle(multiInput);
      expect(firstInit.accepted && secondInit.accepted).toBe(true);
      if (!firstInit.accepted || !secondInit.accepted) return;
      const rng = { rng: createRngState(100) };
      const first = resolveUseMove(firstInit.state, { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: id<MoveId>("swift") }, rng);
      const second = resolveUseMove(secondInit.state, { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: id<MoveId>("swift") }, rng);
      expect(first.accepted && second.accepted).toBe(true);
      if (!first.accepted || !second.accepted) return;
      expect(first.events.filter((event) => event.kind === "DamageApplied").map((event) => event.targetId))
        .toEqual([id<CombatantId>("ground-foe"), id<CombatantId>("water-foe")]);
      let expected = rng;
      for (let index = 0; index < 2; index += 1) {
        expected = drawUniformInteger(expected, 1, 16).nextState;
        expected = drawUniformInteger(expected, 85, 100).nextState;
      }
      expect(first.deterministicState).toEqual(expected);
      expect(second.events).toEqual(first.events);
      expect(second.state).toEqual(first.state);
      expect(second.deterministicState).toEqual(first.deterministicState);
      const firstCarry = createCadenceCarry(first.state);
      expect(createCadenceCarry(second.state)).toEqual(firstCarry);
      expect(firstCarry).toMatchObject({
        hpByParticipant: { [pikaParticipantKey]: first.state.combatants.pika.currentHp },
        readinessByParticipant: { [pikaParticipantKey]: { participant: pikaParticipant, moveLoadout: [id<MoveId>("tackle"), id<MoveId>("thunderbolt"), id<MoveId>("zap"), id<MoveId>("swift")] } },
      });
    });

    it("carries non-zero GCD and a long Move cooldown through an explicit cadence gap and CombatantId rebind", () => {
      const { initInput } = createTestBattle();
      const finisherId = id<MoveId>("finisher");
      const participant = {
        kind: "pokemonInstance" as const,
        identity: id("pika-carry") as import("@pokenexus/game-types").PokemonInstanceId,
      };
      const key = cadenceParticipantKey(participant);
      const firstInput: BattleInitInput = {
        ...initInput,
        context: {
          ...context,
          moveRules: {
            ...context.moveRules,
            finisher: {
              moveId: finisherId,
              typeId: id<TypeId>("normal"),
              category: "physical",
              targetScope: "singleEnemy",
              power: 100000,
              accuracy: "always",
              criticalPolicy: "never",
              moveCooldownMs: 8000,
            },
          },
        },
        sides: [
          { ...initInput.sides[0], combatantIds: [id<CombatantId>("pika")], initialActiveCombatantIds: [id<CombatantId>("pika")] },
          { ...initInput.sides[1], combatantIds: [id<CombatantId>("water-foe")], initialActiveCombatantIds: [id<CombatantId>("water-foe")] },
        ],
        combatants: initInput.combatants
          .filter((combatant) => combatant.combatantId !== id<CombatantId>("ground-foe"))
          .map((combatant) => combatant.combatantId === id<CombatantId>("pika")
            ? {
              ...combatant,
              moveLoadout: [finisherId],
              initialMoveCooldownRemainingMs: { finisher: 0 },
              cadenceParticipant: participant,
            }
            : { ...combatant, startingHp: 1 }),
        cadenceBindings: { [key]: id<CombatantId>("pika") },
      };

      const initialized = initializeBattle(firstInput);
      expect(initialized.accepted).toBe(true);
      if (!initialized.accepted) return;
      const terminal = resolveUseMove(
        initialized.state,
        { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: finisherId, targetId: id<CombatantId>("water-foe") },
        initialized.deterministicState,
      );
      expect(terminal.accepted).toBe(true);
      if (!terminal.accepted) return;
      expect(terminal.state.status).toBe("ended");

      const carry = createCadenceCarry(terminal.state);
      expect(carry.readinessByParticipant[key]).toMatchObject({
        participant,
        nextActionRemainingMs: 2000,
        moveCooldownRemainingMs: { finisher: 8000 },
      });
      const advanced = advanceCadence(carry, firstInput.context, terminal.deterministicState, 750);
      expect(advanced.accepted).toBe(true);
      if (!advanced.accepted) return;
      expect(advanced.cadence.readinessByParticipant[key]).toMatchObject({
        participant,
        nextActionRemainingMs: 1250,
        moveCooldownRemainingMs: { finisher: 7250 },
      });

      const nextCombatantId = id<CombatantId>("pika-next");
      const nextInput: BattleInitInput = {
        ...firstInput,
        battleId: id("battle-b-next"),
        sides: firstInput.sides.map((side) => side.sideId === id("red")
          ? { ...side, combatantIds: [nextCombatantId], initialActiveCombatantIds: [nextCombatantId] }
          : side),
        combatants: firstInput.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("pika")
          ? {
            ...combatant,
            combatantId: nextCombatantId,
            startingHp: advanced.cadence.hpByParticipant[key],
            initialNextActionRemainingMs: 1250,
            initialMoveCooldownRemainingMs: { finisher: 7250 },
          }
          : combatant),
        cadenceBindings: { [key]: nextCombatantId },
        cadenceCarry: advanced.cadence,
        deterministicState: terminal.deterministicState,
      };
      const next = initializeBattle(nextInput);
      expect(next.accepted).toBe(true);
      if (!next.accepted) return;
      expect(next.state.combatants[nextCombatantId].nextActionAtMs).toBe(1250);
      expect(next.state.combatants[nextCombatantId].moveReadyAtMs.finisher).toBe(7250);
      expect(next.deterministicState).toEqual(terminal.deterministicState);
    });

    it("applies and clamps resolver stat-stage effects, which reset in a new Battle", () => {
      const { initInput } = createTestBattle();
      const boostId = id<MoveId>("boost");
      const dropId = id<MoveId>("drop");
      const statInput: BattleInitInput = {
        ...initInput,
        context: {
          ...context,
          moveRules: {
            ...context.moveRules,
            boost: { moveId: boostId, category: "status", targetScope: "self", moveCooldownMs: 2000, accuracy: "always", effects: [{ kind: "statStage", scope: "perResolvedTarget", target: "self", stat: "atk", delta: 7 }] },
            drop: { moveId: dropId, category: "status", targetScope: "self", moveCooldownMs: 2000, accuracy: "always", effects: [{ kind: "statStage", scope: "perResolvedTarget", target: "self", stat: "atk", delta: -20 }] },
          },
        },
        combatants: initInput.combatants.map((combatant) => combatant.combatantId === id<CombatantId>("pika")
          ? { ...combatant, moveLoadout: [boostId, dropId], initialMoveCooldownRemainingMs: { boost: 0, drop: 0 } }
          : { ...combatant, initialNextActionRemainingMs: 9999 }),
      };
      const initialized = initializeBattle(statInput);
      expect(initialized.accepted).toBe(true);
      if (!initialized.accepted) return;
      const increased = resolveUseMove(initialized.state, { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: boostId }, initialized.deterministicState);
      expect(increased.accepted).toBe(true);
      if (!increased.accepted) return;
      expect(increased.state.combatants.pika.stages.atk).toBe(6);
      const advanced = advanceTime(increased.state, increased.deterministicState, 2000);
      expect(advanced.accepted).toBe(true);
      if (!advanced.accepted) return;
      const decreased = resolveUseMove(advanced.state, { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: dropId }, advanced.deterministicState);
      expect(decreased.accepted).toBe(true);
      if (!decreased.accepted) return;
      expect(decreased.state.combatants.pika.stages.atk).toBe(-6);
      const reset = initializeBattle(statInput);
      expect(reset.accepted && reset.state.combatants.pika.stages.atk).toBe(0);
    });

    it("executes a valid damaging move, consuming accuracy, crit, and variance RNG", () => {
      const { startState } = createTestBattle();
      const detState = { rng: createRngState(100) };

      const result = resolveUseMove(
        startState,
        { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: id<MoveId>("thunderbolt"), targetId: id<CombatantId>("water-foe") },
        detState,
      );

      expect(result.accepted).toBe(true);
      if (!result.accepted) return;

      expect(result.events.map((e) => e.kind)).toContain("MoveUsed");
      expect(result.events.map((e) => e.kind)).toContain("DamageApplied");

      // State is updated
      const pika = result.state.combatants.pika;
      const foe = result.state.combatants["water-foe"];
      expect(pika.nextActionAtMs).toBe(2000);
      expect(pika.moveReadyAtMs.thunderbolt).toBe(3500);
      expect(foe.currentHp).toBeLessThan(50);
      const afterAccuracy = drawUniformInteger(detState, 1, 100).nextState;
      const afterCrit = drawUniformInteger(afterAccuracy, 1, 16).nextState;
      expect(result.deterministicState).toEqual(drawUniformInteger(afterCrit, 85, 100).nextState);
    });

    it("consumes only variance RNG for always-hit direct moves with fixed critical policy", () => {
      for (const criticalPolicy of ["never", "always"] as const) {
        const { initInput } = createTestBattle();
        const initialized = initializeBattle({
          ...initInput,
          context: {
            ...context,
            moveRules: {
              ...context.moveRules,
              tackle: { ...context.moveRules.tackle, accuracy: "always", criticalPolicy },
            },
          },
        });
        expect(initialized.accepted).toBe(true);
        if (!initialized.accepted) return;
        const rng = { rng: createRngState(100) };
        const result = resolveUseMove(initialized.state, { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: id<MoveId>("tackle"), targetId: id<CombatantId>("water-foe") }, rng);
        expect(result.accepted).toBe(true);
        if (!result.accepted) return;
        expect(result.deterministicState).toEqual(drawUniformInteger(rng, 85, 100).nextState);
        expect(result.events.some((event) => event.kind === "CriticalHit")).toBe(criticalPolicy === "always");
      }
    });

    it("resolves both critical and non-critical branches under normal critical policy", () => {
      const run = (seed: number) => {
        const { initInput } = createTestBattle();
        const initialized = initializeBattle({
          ...initInput,
          context: {
            ...context,
            moveRules: {
              ...context.moveRules,
              tackle: { ...context.moveRules.tackle, accuracy: "always", criticalPolicy: "normal" },
            },
          },
        });
        expect(initialized.accepted).toBe(true);
        if (!initialized.accepted) throw new Error(initialized.reason);
        return resolveUseMove(
          initialized.state,
          { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: id<MoveId>("tackle"), targetId: id<CombatantId>("water-foe") },
          { rng: createRngState(seed) },
        );
      };

      const critical = run(1);
      const nonCritical = run(2);
      expect(critical.accepted && nonCritical.accepted).toBe(true);
      if (!critical.accepted || !nonCritical.accepted) return;
      expect(critical.events.some((event) => event.kind === "CriticalHit")).toBe(true);
      expect(nonCritical.events.some((event) => event.kind === "CriticalHit")).toBe(false);
      expect(critical.deterministicState).toEqual(
        drawUniformInteger(drawUniformInteger({ rng: createRngState(1) }, 1, 16).nextState, 85, 100).nextState,
      );
      expect(nonCritical.deterministicState).toEqual(
        drawUniformInteger(drawUniformInteger({ rng: createRngState(2) }, 1, 16).nextState, 85, 100).nextState,
      );
    });

    it("handles immunity with MoveImmune event and no crit/variance RNG draw", () => {
      const { startState } = createTestBattle();
      // Replace active enemy with ground-foe
      const modState = {
        ...startState,
        sides: [
          startState.sides[0],
          { ...startState.sides[1], activeCombatantIds: [id<CombatantId>("ground-foe")] },
        ],
      };

      const detState = { rng: createRngState(100) };
      const result = resolveUseMove(
        modState,
        { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: id<MoveId>("thunderbolt"), targetId: id<CombatantId>("ground-foe") },
        detState,
      );

      expect(result.accepted).toBe(true);
      if (!result.accepted) return;

      const eventKinds = result.events.map((e) => e.kind);
      expect(eventKinds).toEqual(["MoveUsed", "MoveImmune"]);

      // Target HP unaffected
      expect(result.state.combatants["ground-foe"].currentHp).toBe(40);
      expect(result.deterministicState).toEqual(drawUniformInteger(detState, 1, 100).nextState);
    });

    it("handles miss, emitting MoveMissed and advancing cooldowns without crit/variance draws", () => {
      const { startState } = createTestBattle();
      // Seed that causes accuracy roll (50%) to fail
      // Let's test with zap
      const detState = { rng: createRngState(1) };
      const result = resolveUseMove(
        startState,
        { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: id<MoveId>("zap"), targetId: id<CombatantId>("water-foe") },
        detState,
      );

      expect(result.accepted).toBe(true);
      if (!result.accepted) return;

      expect(result.events.map((e) => e.kind)).toEqual(["MoveUsed", "MoveMissed"]);
      expect(result.state.combatants.pika.nextActionAtMs).toBe(2000);
      expect(result.state.combatants.pika.moveReadyAtMs.zap).toBe(2000);
      expect(result.state.combatants["water-foe"].currentHp).toBe(45);
      expect(result.deterministicState).toEqual(drawUniformInteger(detState, 1, 100).nextState);
    });

    it("rejects intent atomically when actor is on global cooldown or move is on cooldown", () => {
      const { startState } = createTestBattle();
      const detState = { rng: createRngState(1) };

      // Set actor on GCD
      const busyState = {
        ...startState,
        combatants: {
          ...startState.combatants,
          pika: { ...startState.combatants.pika, nextActionAtMs: 1000 },
        },
      };

      const res1 = resolveUseMove(
        busyState,
        { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: id<MoveId>("tackle"), targetId: id<CombatantId>("water-foe") },
        detState,
      );

      expect(res1.accepted).toBe(false);
      if (res1.accepted) return;
      expect(res1.reason).toContain("global action cooldown");
      expect(res1.state).toEqual(busyState);
      expect(res1.deterministicState).toEqual(detState);
      expect(res1.events).toEqual([]);
    });

    it("rejects a cooling Move atomically while GCD is ready and permits another ready Move", () => {
      const { startState } = createTestBattle();
      const detState = { rng: createRngState(100) };
      const used = resolveUseMove(
        startState,
        { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: id<MoveId>("swift") },
        detState,
      );
      expect(used.accepted).toBe(true);
      if (!used.accepted) return;
      const readyState = {
        ...used.state,
        combatTimeMs: 2000,
        combatants: {
          ...used.state.combatants,
          "water-foe": { ...used.state.combatants["water-foe"], nextActionAtMs: 2001 },
        },
      };
      const cooling = resolveUseMove(
        readyState,
        { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: id<MoveId>("swift") },
        used.deterministicState,
      );
      expect(cooling.accepted).toBe(false);
      if (!cooling.accepted) {
        expect(cooling.state).toBe(readyState);
        expect(cooling.deterministicState).toBe(used.deterministicState);
        expect(cooling.events).toEqual([]);
      }
      const alternate = resolveUseMove(
        readyState,
        { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: id<MoveId>("tackle"), targetId: id<CombatantId>("water-foe") },
        used.deterministicState,
      );
      expect(alternate.accepted).toBe(true);
    });

    it("rejects a slower submitted intent when a faster single-target actor is eligible", () => {
      const { startState } = createTestBattle();
      const detState = { rng: createRngState(1) };
      const result = resolveUseMove(
        startState,
        { kind: "useMove", actorId: id<CombatantId>("water-foe"), moveId: id<MoveId>("tackle"), targetId: id<CombatantId>("pika") },
        detState,
      );

      expect(result.accepted).toBe(false);
      if (result.accepted) return;
      expect(result.reason).toContain("does not have initiative");
      expect(result.state).toBe(startState);
      expect(result.deterministicState).toEqual(detState);
      expect(result.events).toEqual([]);
    });

    it("rejects intent atomically on illegal targets", () => {
      const { startState } = createTestBattle();
      const detState = { rng: createRngState(1) };

      // Target self on singleEnemy move
      const res = resolveUseMove(
        startState,
        { kind: "useMove", actorId: id<CombatantId>("pika"), moveId: id<MoveId>("tackle"), targetId: id<CombatantId>("pika") },
        detState,
      );

      expect(res.accepted).toBe(false);
      if (res.accepted) return;
      expect(res.reason).toContain("living active enemy");
      expect(res.deterministicState).toEqual(detState);
      expect(res.events).toEqual([]);
    });
  });
});
