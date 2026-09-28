import { describe, expect, it } from "vitest";
import {
  createRngState,
  initializeBattle,
  resolveCombatStimulus,
  type BattleInitInput,
  type CombatEvent,
  type CombatEventSchemaVersion,
  type CombatantId,
  type MoveId,
  type ResolvedCombatContext,
  type TypeId,
} from "@pokenexus/game-core";
import {
  COMBAT_PRESENTATION_SCHEMA_VERSION_V1,
  projectCombatPresentationBootstrapV1,
  projectCombatPresentationContinuationV1,
  type CombatPresentationBootstrapInputV1,
  type CombatPresentationBootstrapParticipantSourceV1,
  type CombatPresentationContinuationContextV1,
} from "./combat-presentation";
import { COMBAT_PRESENTATION_FIXTURE_V1 } from "./testing";

function authoritativeEvent(value: Record<string, unknown>): CombatEvent {
  return value as unknown as CombatEvent;
}

const id = <T extends string>(value: string) => value as T;

function engineFixtureInput(): BattleInitInput {
  const context: ResolvedCombatContext = {
    gameDataVersion: id("game-data-v1"),
    rulesVersion: id("rules-v1"),
    combatEventSchemaVersion: id<CombatEventSchemaVersion>("events-v1"),
    moveRules: {
      shock: {
        moveId: id<MoveId>("shock"),
        typeId: id<TypeId>("electric"),
        category: "special",
        targetScope: "singleEnemy",
        power: 40,
        accuracy: "always",
        criticalPolicy: "never",
        moveCooldownMs: 2_000,
      },
    },
    abilityRules: {},
    effectRules: {},
    typeChart: { electric: { ground: 0 } },
  };
  const baseStats = { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 };
  const ivs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  return {
    battleId: id("battle:fixture"),
    context,
    deterministicState: { rng: createRngState(1) },
    sides: [
      {
        sideId: id("side:player"),
        activeCapacity: 1,
        combatantIds: [id<CombatantId>("combatant:owned"), id<CombatantId>("combatant:owned-reserve")],
        initialActiveCombatantIds: [id<CombatantId>("combatant:owned")],
      },
      {
        sideId: id("side:wild"),
        activeCapacity: 1,
        combatantIds: [id<CombatantId>("combatant:wild")],
        initialActiveCombatantIds: [id<CombatantId>("combatant:wild")],
      },
    ],
    combatants: [
      {
        combatantId: id<CombatantId>("combatant:owned"),
        speciesId: id("species:owned"),
        level: 10,
        baseStats,
        ivs,
        types: [id<TypeId>("electric")],
        startingHp: 30,
        moveLoadout: [id<MoveId>("shock")],
        initialNextActionRemainingMs: 0,
        initialMoveCooldownRemainingMs: { shock: 0 },
      },
      {
        combatantId: id<CombatantId>("combatant:owned-reserve"),
        speciesId: id("species:owned-reserve"),
        level: 10,
        baseStats,
        ivs,
        types: [id<TypeId>("normal")],
        startingHp: 30,
        moveLoadout: [id<MoveId>("shock")],
        initialNextActionRemainingMs: 0,
        initialMoveCooldownRemainingMs: { shock: 0 },
      },
      {
        combatantId: id<CombatantId>("combatant:wild"),
        speciesId: id("species:wild"),
        level: 10,
        baseStats,
        ivs,
        types: [id<TypeId>("ground")],
        startingHp: 30,
        moveLoadout: [id<MoveId>("shock")],
        initialNextActionRemainingMs: 0,
        initialMoveCooldownRemainingMs: { shock: 0 },
      },
    ],
  };
}

function bootstrapInput(): CombatPresentationBootstrapInputV1 {
  return {
    battleId: "battle:fixture",
    combatEventSchemaVersion: "events-v1" as CombatEventSchemaVersion,
    sides: [
      {
        sideId: "side:player",
        combatantIds: ["combatant:owned", "combatant:owned-reserve"],
        activeCombatantIds: ["combatant:owned"],
      },
      {
        sideId: "side:wild",
        combatantIds: ["combatant:wild"],
        activeCombatantIds: ["combatant:wild"],
      },
    ],
    participants: [
      {
        kind: "owned",
        combatantId: "combatant:owned",
        sideId: "side:player",
        pokemonInstanceId: "pokemon:owned",
        speciesId: "species:owned",
        level: 10,
        shiny: false,
        currentHp: 30,
        maxHp: 30,
      },
      {
        kind: "owned",
        combatantId: "combatant:owned-reserve",
        sideId: "side:player",
        pokemonInstanceId: "pokemon:owned-reserve",
        speciesId: "species:owned-reserve",
        level: 10,
        shiny: false,
        currentHp: 30,
        maxHp: 30,
      },
      {
        kind: "wild",
        combatantId: "combatant:wild",
        sideId: "side:wild",
        speciesId: "species:wild",
        level: 10,
        shiny: true,
        state: "conscious",
      },
    ],
    events: [authoritativeEvent({
      kind: "BattleStarted",
      sequence: 1,
      combatTimeMs: 0,
      battleId: "battle:fixture",
    })],
  };
}

function bootstrap() {
  return projectCombatPresentationBootstrapV1(bootstrapInput());
}

function continuation(
  context: CombatPresentationContinuationContextV1,
  events: ReadonlyArray<CombatEvent>,
) {
  return projectCombatPresentationContinuationV1({ context, events });
}

describe("Combat Presentation Event Contract v1", () => {
  it("projects engine-realistic bootstrap and immunity-branch fixture segments", () => {
    const engineInput = engineFixtureInput();
    const initialized = initializeBattle(engineInput);
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    expect(initialized.events).toEqual([
      { kind: "BattleStarted", sequence: 1, combatTimeMs: 0, battleId: engineInput.battleId },
    ]);

    const started = projectCombatPresentationBootstrapV1({
      ...bootstrapInput(),
      events: initialized.events,
    });
    expect(started.envelope).toEqual(COMBAT_PRESENTATION_FIXTURE_V1.bootstrap);

    const action = resolveCombatStimulus(
      initialized.state,
      {
        kind: "useMove",
        actorId: id<CombatantId>("combatant:owned"),
        moveId: id<MoveId>("shock"),
        targetId: id<CombatantId>("combatant:wild"),
      },
      initialized.deterministicState,
    );
    expect(action.accepted).toBe(true);
    if (!action.accepted) return;
    expect(action.events.map(({ kind }) => kind)).toEqual(["MoveUsed", "MoveImmune"]);

    const immune = continuation(started.continuationContext, action.events);
    expect(immune.envelope).toEqual(COMBAT_PRESENTATION_FIXTURE_V1.continuations[0]);
  });

  it("exposes initial active-vs-reserve membership only through the battle bootstrap", () => {
    const started = bootstrap();
    expect(started.envelope.initialSides).toEqual([
      {
        sideId: "side:player",
        combatantIds: ["combatant:owned", "combatant:owned-reserve"],
        activeCombatantIds: ["combatant:owned"],
      },
      {
        sideId: "side:wild",
        combatantIds: ["combatant:wild"],
        activeCombatantIds: ["combatant:wild"],
      },
    ]);
    expect(started.envelope.events).toEqual([
      { kind: "BattleStarted", sequence: 1, combatTimeMs: 0, battleId: "battle:fixture" },
    ]);
  });

  it("prevents cross-batch owned-HP differential leakage when hidden wild damage is split into one-event batches", () => {
    const started = bootstrap();
    const moveUsed = continuation(started.continuationContext, [authoritativeEvent({
      kind: "MoveUsed",
      sequence: 2,
      combatTimeMs: 0,
      actorId: "combatant:wild",
      moveId: "move:wild",
      targetIds: ["combatant:owned"],
    })]);

    const lowDamage = continuation(moveUsed.continuationContext, [authoritativeEvent({
      kind: "DamageApplied",
      sequence: 3,
      combatTimeMs: 0,
      source: "move",
      actorId: "combatant:wild",
      moveId: "move:wild",
      targetId: "combatant:owned",
      amount: 7,
      resultingHp: 113,
    })]);
    const highDamage = continuation(moveUsed.continuationContext, [authoritativeEvent({
      kind: "DamageApplied",
      sequence: 3,
      combatTimeMs: 0,
      source: "move",
      actorId: "combatant:wild",
      moveId: "move:wild",
      targetId: "combatant:owned",
      amount: 70_007,
      resultingHp: 80_113,
    })]);

    expect(highDamage.envelope).toEqual(lowDamage.envelope);
    expect(lowDamage.envelope.events[0]).toMatchObject({
      kind: "DamageApplied",
      hpChange: { visibility: "hidden" },
    });
    const serialized = JSON.stringify([moveUsed.envelope, lowDamage.envelope]);
    expect(serialized).not.toContain("initialParticipants");
    expect(serialized).not.toContain("currentHp");
    expect(serialized).not.toContain("maxHp");
    expect(serialized).not.toContain("113");
  });

  it("ignores malicious fresh participant snapshots injected into a continuation object", () => {
    const started = bootstrap();
    const malicious = {
      context: started.continuationContext,
      participants: [{
        kind: "owned",
        combatantId: "combatant:owned",
        currentHp: 11_111,
        maxHp: 22_222,
      }],
      events: [authoritativeEvent({
        kind: "MoveUsed",
        sequence: 2,
        combatTimeMs: 0,
        actorId: "combatant:owned",
        moveId: "move:owned",
        targetIds: ["combatant:wild"],
      })],
    } as unknown as Parameters<typeof projectCombatPresentationContinuationV1>[0];
    const projected = projectCombatPresentationContinuationV1(malicious);
    const serialized = JSON.stringify(projected.envelope);
    expect(serialized).not.toContain("11111");
    expect(serialized).not.toContain("22222");
    expect(serialized).not.toContain("participants");
  });

  it("keeps wild-target HP consequences independent of hidden numeric values", () => {
    const started = bootstrap();
    const first = continuation(started.continuationContext, [authoritativeEvent({
      kind: "DamageApplied",
      sequence: 2,
      combatTimeMs: 100,
      source: "move",
      actorId: "combatant:owned",
      moveId: "move:owned",
      targetId: "combatant:wild",
      amount: 7,
      resultingHp: 13,
    })]);
    const second = continuation(started.continuationContext, [authoritativeEvent({
      kind: "DamageApplied",
      sequence: 2,
      combatTimeMs: 100,
      source: "move",
      actorId: "combatant:owned",
      moveId: "move:owned",
      targetId: "combatant:wild",
      amount: 70_001,
      resultingHp: 80_001,
    })]);
    expect(second.envelope).toEqual(first.envelope);
  });

  it("drops undeclared numeric wild vitality fields from the bootstrap projection", () => {
    const source = bootstrapInput();
    const maliciousWild = {
      kind: "wild",
      combatantId: "combatant:wild",
      sideId: "side:wild",
      speciesId: "species:wild",
      level: 10,
      shiny: false,
      state: "conscious",
      currentHp: 51_111,
      maxHp: 52_222,
      hpPercent: 97.87,
    } as unknown as CombatPresentationBootstrapParticipantSourceV1;
    const projected = projectCombatPresentationBootstrapV1({
      ...source,
      participants: [source.participants[0]!, source.participants[1]!, maliciousWild],
    });
    const wild = projected.envelope.initialParticipants.find(({ combatantId }) => combatantId === "combatant:wild");
    expect(wild).toEqual({
      combatantId: "combatant:wild",
      sideId: "side:wild",
      identity: { kind: "wild_pokemon", speciesId: "species:wild", level: 10, shiny: false },
      vitality: { visibility: "hidden", state: "conscious" },
    });
    const serialized = JSON.stringify(wild);
    expect(serialized).not.toContain("currentHp");
    expect(serialized).not.toContain("maxHp");
    expect(serialized).not.toContain("hpPercent");
  });

  it("preserves exact event HP only for explicit owned-actor to owned-target damage", () => {
    const started = bootstrap();
    const projected = continuation(started.continuationContext, [authoritativeEvent({
      kind: "DamageApplied",
      sequence: 2,
      combatTimeMs: 100,
      source: "move",
      actorId: "combatant:owned",
      moveId: "move:owned",
      targetId: "combatant:owned-reserve",
      amount: 9,
      resultingHp: 91,
    })]);
    expect(projected.envelope.events[0]).toMatchObject({
      kind: "DamageApplied",
      hpChange: { visibility: "exact", amount: 9, resultingHp: 91 },
    });
  });

  it("privacy-closes wild-source and source-ambiguous HP numerics on owned targets", () => {
    const started = bootstrap();
    const events = (amount: number, resultingHp: number): ReadonlyArray<CombatEvent> => [
      authoritativeEvent({
        kind: "DamageApplied",
        sequence: 2,
        combatTimeMs: 100,
        source: "move",
        actorId: "combatant:wild",
        moveId: "move:wild",
        targetId: "combatant:owned",
        amount,
        resultingHp,
      }),
      authoritativeEvent({
        kind: "EffectTicked",
        sequence: 3,
        combatTimeMs: 200,
        effectId: "effect:ambiguous",
        targetId: "combatant:owned",
        consequence: "damage",
        amount: amount + 1,
        resultingHp: resultingHp + 1,
      }),
      authoritativeEvent({
        kind: "HealingApplied",
        sequence: 4,
        combatTimeMs: 200,
        targetId: "combatant:owned",
        amount: amount + 2,
        resultingHp: resultingHp + 2,
      }),
    ];
    const first = continuation(started.continuationContext, events(7, 113));
    const second = continuation(started.continuationContext, events(70_007, 80_113));
    expect(second.envelope).toEqual(first.envelope);
  });

  it("preserves every canonical authoritative stat-stage code", () => {
    for (const stat of ["atk", "def", "spa", "spd", "spe"] as const) {
      const started = bootstrap();
      const projected = continuation(started.continuationContext, [authoritativeEvent({
        kind: "StatStageChanged",
        sequence: 2,
        combatTimeMs: 100,
        targetId: "combatant:wild",
        stat,
        requestedDelta: 1,
        appliedDelta: 1,
        resultingStage: 1,
      })]);
      expect(projected.envelope.events[0]).toMatchObject({ kind: "StatStageChanged", stat });
    }
  });

  it("covers every authoritative CombatEvent kind without adding a second gameplay interpretation", () => {
    const started = bootstrap();
    const cases: ReadonlyArray<CombatEvent> = [
      authoritativeEvent({ kind: "MoveUsed", sequence: 2, combatTimeMs: 1, actorId: "combatant:owned", moveId: "move:x", targetIds: ["combatant:wild"] }),
      authoritativeEvent({ kind: "MoveMissed", sequence: 2, combatTimeMs: 1, actorId: "combatant:owned", moveId: "move:x", targetId: "combatant:wild" }),
      authoritativeEvent({ kind: "MoveImmune", sequence: 2, combatTimeMs: 1, actorId: "combatant:owned", moveId: "move:x", targetId: "combatant:wild" }),
      authoritativeEvent({ kind: "CriticalHit", sequence: 2, combatTimeMs: 1, actorId: "combatant:owned", moveId: "move:x", targetId: "combatant:wild" }),
      authoritativeEvent({ kind: "DamageApplied", sequence: 2, combatTimeMs: 1, source: "move", actorId: "combatant:owned", moveId: "move:x", targetId: "combatant:wild", amount: 1, resultingHp: 1 }),
      authoritativeEvent({ kind: "CombatantKO", sequence: 2, combatTimeMs: 1, combatantId: "combatant:wild" }),
      authoritativeEvent({ kind: "CombatantActivated", sequence: 2, combatTimeMs: 1, sideId: "side:player", combatantId: "combatant:owned-reserve" }),
      authoritativeEvent({ kind: "BattleEnded", sequence: 2, combatTimeMs: 1, outcome: { kind: "win", winnerSideId: "side:player" } }),
      authoritativeEvent({ kind: "EffectApplied", sequence: 2, combatTimeMs: 1, effectId: "effect:x", targetId: "combatant:wild", stacks: 1 }),
      authoritativeEvent({ kind: "EffectUpdated", sequence: 2, combatTimeMs: 1, effectId: "effect:x", targetId: "combatant:wild", stacks: 2 }),
      authoritativeEvent({ kind: "EffectRemoved", sequence: 2, combatTimeMs: 1, effectId: "effect:x", targetId: "combatant:wild" }),
      authoritativeEvent({ kind: "EffectTicked", sequence: 2, combatTimeMs: 1, effectId: "effect:x", targetId: "combatant:wild", consequence: "damage", amount: 1, resultingHp: 1 }),
      authoritativeEvent({ kind: "HealingApplied", sequence: 2, combatTimeMs: 1, targetId: "combatant:wild", amount: 1, resultingHp: 1 }),
      authoritativeEvent({ kind: "StatStageChanged", sequence: 2, combatTimeMs: 1, targetId: "combatant:wild", stat: "def", requestedDelta: -1, appliedDelta: -1, resultingStage: -1 }),
    ];
    expect(cases.map((event) => continuation(started.continuationContext, [event]).envelope.events[0]?.kind)).toEqual([
      "MoveUsed",
      "MoveMissed",
      "MoveImmune",
      "CriticalHit",
      "DamageApplied",
      "CombatantKO",
      "CombatantActivated",
      "BattleEnded",
      "EffectApplied",
      "EffectUpdated",
      "EffectRemoved",
      "EffectTicked",
      "HealingApplied",
      "StatStageChanged",
    ]);
  });

  it("rejects malformed bootstrap bindings and non-origin bootstrap events", () => {
    const source = bootstrapInput();
    expect(() => projectCombatPresentationBootstrapV1({ ...source, events: [] })).toThrow(/begin with BattleStarted/);
    expect(() => projectCombatPresentationBootstrapV1({
      ...source,
      sides: [{
        sideId: "side:player",
        combatantIds: ["combatant:owned"],
        activeCombatantIds: ["combatant:owned-reserve"],
      }, {
        sideId: "side:wild",
        combatantIds: ["combatant:wild", "combatant:owned-reserve"],
        activeCombatantIds: ["combatant:wild"],
      }],
    })).toThrow(/active combatant is absent from side roster|participant sideId mismatch/);
  });

  it("rejects sequence gaps across continuation batches", () => {
    const started = bootstrap();
    expect(() => continuation(started.continuationContext, [authoritativeEvent({
      kind: "CombatantKO",
      sequence: 3,
      combatTimeMs: 100,
      combatantId: "combatant:wild",
    })])).toThrow(/contiguous across presentation batches/);
  });

  it("rejects decreasing combatTimeMs explicitly", () => {
    const started = bootstrap();
    const first = continuation(started.continuationContext, [authoritativeEvent({
      kind: "MoveUsed",
      sequence: 2,
      combatTimeMs: 200,
      actorId: "combatant:owned",
      moveId: "move:owned",
      targetIds: ["combatant:wild"],
    })]);
    expect(() => continuation(first.continuationContext, [authoritativeEvent({
      kind: "MoveMissed",
      sequence: 3,
      combatTimeMs: 199,
      actorId: "combatant:owned",
      moveId: "move:owned",
      targetId: "combatant:wild",
    })])).toThrow(/combatTimeMs must be monotonic/);
  });

  it("rejects a second BattleStarted in continuation", () => {
    const started = bootstrap();
    expect(() => continuation(started.continuationContext, [authoritativeEvent({
      kind: "BattleStarted",
      sequence: 2,
      combatTimeMs: 0,
      battleId: "battle:fixture",
    })])).toThrow(/one-time presentation bootstrap/);
  });

  it("keeps continuation context free of exact HP and display identities", () => {
    const started = bootstrap();
    expect(started.continuationContext.schemaVersion).toBe(COMBAT_PRESENTATION_SCHEMA_VERSION_V1);
    const serialized = JSON.stringify(started.continuationContext);
    expect(serialized).not.toContain("currentHp");
    expect(serialized).not.toContain("maxHp");
    expect(serialized).not.toContain("pokemonInstanceId");
    expect(serialized).not.toContain("speciesId");
    expect(serialized).not.toContain("level");
    expect(serialized).not.toContain("shiny");
  });
});
