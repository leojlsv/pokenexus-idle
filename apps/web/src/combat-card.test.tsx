import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createRngState,
  initializeBattle,
  resolveCombatStimulus,
  type BattleInitInput,
  type CombatEventSchemaVersion,
  type CombatantId,
  type EffectId,
  type MoveId,
  type ResolvedCombatContext,
  type TypeId,
} from "@pokenexus/game-core";
import {
  projectCombatPresentationBootstrapV1,
  projectCombatPresentationContinuationV1,
  type CombatPresentationBootstrapEnvelopeV1,
  type CombatPresentationContinuationEnvelopeV1,
  type CombatPresentationEventV1,
  type CombatPresentationContinuationContextV1,
} from "@pokenexus/game-protocol";
import { COMBAT_PRESENTATION_FIXTURE_V1 } from "@pokenexus/game-protocol/testing";
import {
  CARD_COMBAT_EVENT_FEED_LIMIT,
  CardCombatRenderer,
  buildCardCombatState,
  combatPresentationEventText,
} from "./combat-card";

const id = <T extends string>(value: string) => value as T;

function engineScenario(): {
  bootstrap: CombatPresentationBootstrapEnvelopeV1;
  continuations: ReadonlyArray<CombatPresentationContinuationEnvelopeV1>;
} {
  const context: ResolvedCombatContext = {
    gameDataVersion: id("data"),
    rulesVersion: id("rules"),
    combatEventSchemaVersion: id<CombatEventSchemaVersion>("events-v1"),
    abilityRules: {},
    typeChart: { normal: { normal: 1 } },
    effectRules: {
      burn: {
        effectId: id<EffectId>("burn"),
        lifetimeScope: "battle",
        stackingPolicy: "replace",
        durationMs: 1_000,
      },
    },
    moveRules: {
      mark: {
        moveId: id<MoveId>("mark"),
        category: "status",
        targetScope: "self",
        moveCooldownMs: 2_000,
        accuracy: "always",
        effects: [{
          kind: "applyEffect",
          scope: "perResolvedTarget",
          target: "self",
          effectId: id<EffectId>("burn"),
        }],
      },
      knockout: {
        moveId: id<MoveId>("knockout"),
        typeId: id<TypeId>("normal"),
        category: "physical",
        targetScope: "singleEnemy",
        moveCooldownMs: 2_000,
        power: 100_000,
        accuracy: "always",
        criticalPolicy: "never",
      },
    },
  };
  const baseStats = { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 };
  const ivs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const input: BattleInitInput = {
    battleId: id("battle:card"),
    context,
    deterministicState: { rng: createRngState(1) },
    sides: [
      {
        sideId: id("side:player"),
        activeCapacity: 1,
        combatantIds: [id<CombatantId>("owned:a"), id<CombatantId>("owned:reserve")],
        initialActiveCombatantIds: [id<CombatantId>("owned:a")],
      },
      {
        sideId: id("side:wild"),
        activeCapacity: 1,
        combatantIds: [id<CombatantId>("wild:a")],
        initialActiveCombatantIds: [id<CombatantId>("wild:a")],
      },
    ],
    combatants: [
      {
        combatantId: id<CombatantId>("owned:a"),
        speciesId: id("species:owned"),
        level: 10,
        baseStats,
        ivs,
        types: [id<TypeId>("normal")],
        startingHp: 20,
        moveLoadout: [id<MoveId>("mark")],
        initialNextActionRemainingMs: 0,
        initialMoveCooldownRemainingMs: { mark: 0 },
      },
      {
        combatantId: id<CombatantId>("owned:reserve"),
        speciesId: id("species:reserve"),
        level: 10,
        baseStats,
        ivs,
        types: [id<TypeId>("normal")],
        startingHp: 20,
        moveLoadout: [id<MoveId>("mark")],
        initialNextActionRemainingMs: 0,
        initialMoveCooldownRemainingMs: { mark: 0 },
      },
      {
        combatantId: id<CombatantId>("wild:a"),
        speciesId: id("species:wild"),
        level: 10,
        baseStats,
        ivs,
        types: [id<TypeId>("normal")],
        startingHp: 20,
        moveLoadout: [id<MoveId>("knockout")],
        initialNextActionRemainingMs: 0,
        initialMoveCooldownRemainingMs: { knockout: 0 },
      },
    ],
  };

  const initialized = initializeBattle(input);
  if (!initialized.accepted) throw new Error(initialized.reason);
  const projectedBootstrap = projectCombatPresentationBootstrapV1({
    battleId: "battle:card",
    combatEventSchemaVersion: id<CombatEventSchemaVersion>("events-v1"),
    sides: [
      {
        sideId: "side:player",
        combatantIds: ["owned:a", "owned:reserve"],
        activeCombatantIds: ["owned:a"],
      },
      {
        sideId: "side:wild",
        combatantIds: ["wild:a"],
        activeCombatantIds: ["wild:a"],
      },
    ],
    participants: [
      {
        kind: "owned",
        combatantId: "owned:a",
        sideId: "side:player",
        pokemonInstanceId: "pokemon:a",
        speciesId: "species:owned",
        level: 10,
        shiny: false,
        currentHp: 20,
        maxHp: 20,
      },
      {
        kind: "owned",
        combatantId: "owned:reserve",
        sideId: "side:player",
        pokemonInstanceId: "pokemon:reserve",
        speciesId: "species:reserve",
        level: 10,
        shiny: false,
        currentHp: 20,
        maxHp: 20,
      },
      {
        kind: "wild",
        combatantId: "wild:a",
        sideId: "side:wild",
        speciesId: "species:wild",
        level: 10,
        shiny: false,
        state: "conscious",
      },
    ],
    events: initialized.events,
  });

  const project = (
    projectionContext: CombatPresentationContinuationContextV1,
    events: Parameters<typeof projectCombatPresentationContinuationV1>[0]["events"],
  ) => projectCombatPresentationContinuationV1({ context: projectionContext, events });

  const marked = resolveCombatStimulus(
    initialized.state,
    {
      kind: "useMove",
      actorId: id<CombatantId>("owned:a"),
      moveId: id<MoveId>("mark"),
      targetId: id<CombatantId>("owned:a"),
    },
    initialized.deterministicState,
  );
  if (!marked.accepted) throw new Error(marked.reason);
  const markedProjection = project(projectedBootstrap.continuationContext, marked.events);

  const knockedOut = resolveCombatStimulus(
    marked.state,
    {
      kind: "useMove",
      actorId: id<CombatantId>("wild:a"),
      moveId: id<MoveId>("knockout"),
      targetId: id<CombatantId>("owned:a"),
    },
    marked.deterministicState,
  );
  if (!knockedOut.accepted) throw new Error(knockedOut.reason);
  const koProjection = project(markedProjection.continuationContext, knockedOut.events);

  const replacement = resolveCombatStimulus(
    knockedOut.state,
    {
      kind: "forcedReplacement",
      sideId: id("side:player"),
      combatantId: id<CombatantId>("owned:reserve"),
    },
    knockedOut.deterministicState,
  );
  if (!replacement.accepted) throw new Error(replacement.reason);
  const replacementProjection = project(koProjection.continuationContext, replacement.events);

  return {
    bootstrap: projectedBootstrap.envelope,
    continuations: [
      markedProjection.envelope,
      koProjection.envelope,
      replacementProjection.envelope,
    ],
  };
}

describe("Card combat renderer foundation", () => {
  it("renders accepted bootstrap fixture with exact owned HP and non-numeric wild vitality", () => {
    const html = renderToStaticMarkup(
      <CardCombatRenderer
        bootstrap={COMBAT_PRESENTATION_FIXTURE_V1.bootstrap}
        continuations={COMBAT_PRESENTATION_FIXTURE_V1.continuations}
      />,
    );
    expect(html).toContain("HP 30 / 30");
    expect(html).toContain("HP hidden · Conscious");
    expect(html).not.toMatch(/species:wild[^<]*(?:HP )?\d+\s*\/\s*\d+/);
    expect(html).toContain("Combat events");
    expect(html).toContain("is immune to shock");
    expect(html).toContain('aria-live="polite"');
  });

  it("uses engine-produced effect, KO and replacement events without recomputing outcomes", () => {
    const scenario = engineScenario();
    const state = buildCardCombatState(scenario.bootstrap, scenario.continuations);
    const owned = state.participants.find(({ combatantId }) => combatantId === "owned:a");
    const reserve = state.participants.find(({ combatantId }) => combatantId === "owned:reserve");
    const wild = state.participants.find(({ combatantId }) => combatantId === "wild:a");

    expect(owned).toMatchObject({
      active: false,
      vitality: { visibility: "unavailable", state: "ko" },
      effects: [{ effectId: "burn", stacks: 1 }],
    });
    expect(reserve).toMatchObject({ active: true, vitality: { visibility: "exact", state: "conscious" } });
    expect(wild?.vitality).toEqual({ visibility: "hidden", state: "conscious" });
    expect(state.eventFeed.some((entry) => entry.includes("was knocked out"))).toBe(true);
    expect(state.eventFeed.some((entry) => entry.includes("became active"))).toBe(true);
  });

  it("privacy-closes hidden HP event text", () => {
    const hidden: CombatPresentationEventV1 = {
      kind: "DamageApplied",
      sequence: 2,
      combatTimeMs: 10,
      source: "move",
      actorId: "wild:a",
      moveId: "secret",
      targetId: "owned:a",
      hpChange: { visibility: "hidden" },
    };
    expect(combatPresentationEventText(hidden)).toBe("owned:a took damage.");
    expect(combatPresentationEventText(hidden)).not.toMatch(/\d/);
  });

  it("can resynchronize owned current HP from a later explicitly exact consequence after hidden damage", () => {
    const bootstrap = COMBAT_PRESENTATION_FIXTURE_V1.bootstrap;
    const continuation: CombatPresentationContinuationEnvelopeV1 = {
      kind: "continuation",
      schemaVersion: bootstrap.schemaVersion,
      sourceCombatEventSchemaVersion: bootstrap.sourceCombatEventSchemaVersion,
      battleId: bootstrap.battleId,
      events: [
        {
          kind: "DamageApplied",
          sequence: 2,
          combatTimeMs: 10,
          source: "move",
          actorId: "combatant:wild",
          moveId: "hidden-hit",
          targetId: "combatant:owned",
          hpChange: { visibility: "hidden" },
        },
        {
          kind: "DamageApplied",
          sequence: 3,
          combatTimeMs: 20,
          source: "move",
          actorId: "combatant:owned-reserve",
          moveId: "owned-hit",
          targetId: "combatant:owned",
          hpChange: { visibility: "exact", amount: 3, resultingHp: 21 },
        },
      ],
    };
    const state = buildCardCombatState(bootstrap, [continuation]);
    expect(state.participants.find(({ combatantId }) => combatantId === "combatant:owned")?.vitality).toEqual({
      visibility: "exact",
      state: "conscious",
      currentHp: 21,
      maxHp: 30,
    });
  });

  it("does not derive KO from exact resultingHp before authoritative CombatantKO arrives", () => {
    const bootstrap = COMBAT_PRESENTATION_FIXTURE_V1.bootstrap;
    const exactZero: CombatPresentationContinuationEnvelopeV1 = {
      kind: "continuation",
      schemaVersion: bootstrap.schemaVersion,
      sourceCombatEventSchemaVersion: bootstrap.sourceCombatEventSchemaVersion,
      battleId: bootstrap.battleId,
      events: [{
        kind: "DamageApplied",
        sequence: 2,
        combatTimeMs: 10,
        source: "move",
        actorId: "combatant:owned-reserve",
        moveId: "owned-hit",
        targetId: "combatant:owned",
        hpChange: { visibility: "exact", amount: 30, resultingHp: 0 },
      }],
    };
    const beforeKo = buildCardCombatState(bootstrap, [exactZero]);
    expect(beforeKo.participants.find(({ combatantId }) => combatantId === "combatant:owned")?.vitality).toEqual({
      visibility: "exact",
      state: "conscious",
      currentHp: 0,
      maxHp: 30,
    });

    const ko: CombatPresentationContinuationEnvelopeV1 = {
      kind: "continuation",
      schemaVersion: bootstrap.schemaVersion,
      sourceCombatEventSchemaVersion: bootstrap.sourceCombatEventSchemaVersion,
      battleId: bootstrap.battleId,
      events: [{ kind: "CombatantKO", sequence: 3, combatTimeMs: 10, combatantId: "combatant:owned" }],
    };
    const afterKo = buildCardCombatState(bootstrap, [exactZero, ko]);
    expect(afterKo.participants.find(({ combatantId }) => combatantId === "combatant:owned")?.vitality).toEqual({
      visibility: "unavailable",
      state: "ko",
    });
  });

  it("rejects continuations for a different battle/schema binding", () => {
    const bootstrap = COMBAT_PRESENTATION_FIXTURE_V1.bootstrap;
    const bad = {
      ...COMBAT_PRESENTATION_FIXTURE_V1.continuations[0],
      battleId: "other:battle",
    } as CombatPresentationContinuationEnvelopeV1;
    expect(() => buildCardCombatState(bootstrap, [bad])).toThrow(/binding mismatch/);
  });

  it("formats every TASK-028 event kind deterministically", () => {
    const events: ReadonlyArray<CombatPresentationEventV1> = [
      { kind: "BattleStarted", sequence: 1, combatTimeMs: 0, battleId: "b" },
      { kind: "MoveUsed", sequence: 2, combatTimeMs: 0, actorId: "a", moveId: "m", targetIds: ["b"] },
      { kind: "MoveMissed", sequence: 3, combatTimeMs: 0, actorId: "a", moveId: "m", targetId: "b" },
      { kind: "MoveImmune", sequence: 4, combatTimeMs: 0, actorId: "a", moveId: "m", targetId: "b" },
      { kind: "CriticalHit", sequence: 5, combatTimeMs: 0, actorId: "a", moveId: "m", targetId: "b" },
      { kind: "DamageApplied", sequence: 6, combatTimeMs: 0, source: "move", actorId: "a", moveId: "m", targetId: "b", hpChange: { visibility: "hidden" } },
      { kind: "CombatantKO", sequence: 7, combatTimeMs: 0, combatantId: "b" },
      { kind: "CombatantActivated", sequence: 8, combatTimeMs: 0, sideId: "s", combatantId: "c" },
      { kind: "BattleEnded", sequence: 9, combatTimeMs: 0, outcome: { kind: "draw" } },
      { kind: "EffectApplied", sequence: 10, combatTimeMs: 0, effectId: "e", targetId: "a", stacks: 1 },
      { kind: "EffectUpdated", sequence: 11, combatTimeMs: 0, effectId: "e", targetId: "a", stacks: 2 },
      { kind: "EffectRemoved", sequence: 12, combatTimeMs: 0, effectId: "e", targetId: "a" },
      { kind: "EffectTicked", sequence: 13, combatTimeMs: 0, effectId: "e", targetId: "a", consequence: "damage", hpChange: { visibility: "hidden" } },
      { kind: "HealingApplied", sequence: 14, combatTimeMs: 0, targetId: "a", hpChange: { visibility: "hidden" } },
      { kind: "StatStageChanged", sequence: 15, combatTimeMs: 0, targetId: "a", stat: "atk", requestedDelta: 1, appliedDelta: 1, resultingStage: 1 },
    ];
    expect(events.map(combatPresentationEventText)).toHaveLength(events.length);
    expect(events.map(combatPresentationEventText).every((entry) => entry.length > 0)).toBe(true);
  });

  it("bounds the DOM event history for low-spec operation", () => {
    const bootstrap = COMBAT_PRESENTATION_FIXTURE_V1.bootstrap;
    const events: CombatPresentationEventV1[] = Array.from(
      { length: CARD_COMBAT_EVENT_FEED_LIMIT + 20 },
      (_, index) => ({
        kind: "MoveUsed",
        sequence: index + 2,
        combatTimeMs: index,
        actorId: "combatant:owned",
        moveId: `move:${index}`,
        targetIds: ["combatant:wild"],
      }),
    );
    const state = buildCardCombatState(bootstrap, [{
      kind: "continuation",
      schemaVersion: bootstrap.schemaVersion,
      sourceCombatEventSchemaVersion: bootstrap.sourceCombatEventSchemaVersion,
      battleId: bootstrap.battleId,
      events,
    }]);
    expect(state.eventFeed).toHaveLength(CARD_COMBAT_EVENT_FEED_LIMIT);
    expect(state.eventFeed[0]).toContain("move:20");
    expect(state.eventFeed.at(-1)).toContain(`move:${CARD_COMBAT_EVENT_FEED_LIMIT + 19}`);
  });

  it("uses authoritative initialSides roster order rather than initialParticipants array order", () => {
    const original = COMBAT_PRESENTATION_FIXTURE_V1.bootstrap;
    const reordered: CombatPresentationBootstrapEnvelopeV1 = {
      ...original,
      initialSides: original.initialSides.map((side) => side.sideId === "side:player"
        ? { ...side, combatantIds: ["combatant:owned-reserve", "combatant:owned"] }
        : side),
      initialParticipants: [
        original.initialParticipants[0],
        original.initialParticipants[1],
        original.initialParticipants[2],
      ],
    };
    const state = buildCardCombatState(reordered);
    expect(
      state.participants
        .filter(({ sideId }) => sideId === "side:player")
        .map(({ combatantId }) => combatantId),
    ).toEqual(["combatant:owned-reserve", "combatant:owned"]);
  });

  it("keeps aria-labelledby relationships unique across multiple Card instances", () => {
    const bootstrap = COMBAT_PRESENTATION_FIXTURE_V1.bootstrap;
    const html = renderToStaticMarkup(<>
      <CardCombatRenderer bootstrap={bootstrap} />
      <CardCombatRenderer bootstrap={bootstrap} />
    </>);

    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    const labelledBy = [...html.matchAll(/\baria-labelledby="([^"]+)"/g)].map((match) => match[1]);
    expect(labelledBy).toHaveLength((bootstrap.initialSides.length + 1) * 2);
    expect(new Set(ids).size).toBe(ids.length);
    for (const reference of labelledBy) {
      expect(ids.filter((id) => id === reference)).toHaveLength(1);
    }
    expect(html.match(/aria-live="polite"/g)).toHaveLength(2);
    expect(html.match(/<ol>/g)).toHaveLength(2);
  });
});
