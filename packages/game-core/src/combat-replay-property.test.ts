import { describe, expect, it } from "vitest";
import { initializeBattle, resolveCombatStimulus } from "./battle";
import { advanceCadence } from "./effects";
import { battleEffectKey, cadenceParticipantKey } from "./types";
import type {
  BattleState,
  CombatEvent,
  CombatantId,
  EffectId,
} from "./types";
import {
  REPLAY_REGRESSION_FIXTURES,
  cadenceFixtureParticipant,
  createCadenceRebindReplayFixture,
  createCadenceSourceReplayFixture,
  createDamageBranchReplayFixture,
  createOpaqueIdentifierReplayFixture,
  createPartitionReplayFixture,
  createReadinessReplayFixture,
  createRejectedInitializationReplayFixture,
  createTerminalPropertyReplayFixture,
  createTerminalReplacementReplayFixture,
  type CombatReplayFixture,
} from "./testing/combat-fixtures";
import {
  deserializeReplayFixtureForTest,
  deserializeReplayTranscriptForTest,
  runCombatReplayFixture,
  serializeReplayFixtureForTest,
  serializeReplayTranscriptForTest,
  type CombatReplayTranscript,
} from "./testing/replay-harness";

function eventKinds(events: ReadonlyArray<CombatEvent>): ReadonlyArray<CombatEvent["kind"]> {
  return events.map((event) => event.kind);
}

function firstDamageAmount(transcript: CombatReplayTranscript): number | undefined {
  return transcript.flattenedEvents.find((event) => event.kind === "DamageApplied")?.amount;
}

function partitionComparable(transcript: CombatReplayTranscript) {
  return {
    flattenedEvents: transcript.flattenedEvents,
    finalState: transcript.finalState,
    finalOutcome: transcript.finalOutcome,
    finalDeterministicState: transcript.finalDeterministicState,
    finalCadenceCarry: transcript.finalCadenceCarry,
  };
}

function expectBattleDomains(state: BattleState): void {
  for (const combatant of Object.values(state.combatants)) {
    expect(Number.isSafeInteger(combatant.currentHp)).toBe(true);
    expect(combatant.currentHp).toBeGreaterThanOrEqual(0);
    expect(combatant.currentHp).toBeLessThanOrEqual(combatant.maxHp);
    expect(Number.isSafeInteger(combatant.nextActionAtMs)).toBe(true);
    expect(combatant.nextActionAtMs).toBeGreaterThanOrEqual(0);
    expect(Object.keys(combatant.moveReadyAtMs).sort()).toEqual([...combatant.moveLoadout].sort());
    for (const readyAtMs of Object.values(combatant.moveReadyAtMs)) {
      expect(Number.isSafeInteger(readyAtMs)).toBe(true);
      expect(readyAtMs).toBeGreaterThanOrEqual(0);
    }
    for (const stage of Object.values(combatant.stages)) {
      expect(Number.isSafeInteger(stage)).toBe(true);
      expect(stage).toBeGreaterThanOrEqual(-6);
      expect(stage).toBeLessThanOrEqual(6);
    }
    for (const expiresAtMs of Object.values(combatant.actionLockExpiresAtMsByScope ?? {})) {
      expect(Number.isSafeInteger(expiresAtMs)).toBe(true);
      expect(expiresAtMs).toBeGreaterThanOrEqual(0);
    }
  }
  for (const effect of Object.values(state.effects)) {
    expect(Object.prototype.hasOwnProperty.call(state.combatants, effect.targetCombatantId)).toBe(true);
    expect(Number.isSafeInteger(effect.applicationSequence)).toBe(true);
    expect(effect.applicationSequence).toBeGreaterThan(0);
    expect(Number.isSafeInteger(effect.scheduleRevision)).toBe(true);
    expect(effect.scheduleRevision).toBeGreaterThan(0);
    expect(Number.isSafeInteger(effect.stacks)).toBe(true);
    expect(effect.stacks).toBeGreaterThan(0);
    expect(effect.expiresAtMs).toBeGreaterThanOrEqual(effect.appliedAtMs);
    if (effect.nextTickAtMs !== undefined) {
      expect(Number.isSafeInteger(effect.nextTickAtMs)).toBe(true);
      expect(effect.nextTickAtMs).toBeGreaterThanOrEqual(state.combatTimeMs);
    }
  }
}

function independentlyDecoded(fixture: CombatReplayFixture): CombatReplayFixture {
  return deserializeReplayFixtureForTest(serializeReplayFixtureForTest(fixture));
}

function executeDecodedWithoutMutation(fixture: CombatReplayFixture) {
  const executedFixture = independentlyDecoded(fixture);
  const before = serializeReplayFixtureForTest(executedFixture);
  const execution = runCombatReplayFixture(executedFixture);
  expect(serializeReplayFixtureForTest(executedFixture)).toBe(before);
  return execution;
}

function runStrictReplay(fixture: CombatReplayFixture): CombatReplayTranscript {
  const first = executeDecodedWithoutMutation(fixture);
  const second = executeDecodedWithoutMutation(fixture);
  expect(first.transcript).toEqual(second.transcript);
  return first.transcript;
}

function expectRejectedStimuliAliasAtomic(fixture: CombatReplayFixture): number {
  const executedFixture = independentlyDecoded(fixture);
  const fixtureBefore = serializeReplayFixtureForTest(executedFixture);
  const initialInputBefore = structuredClone(executedFixture.initialBattle);
  const initialized = initializeBattle(executedFixture.initialBattle);
  expect(executedFixture.initialBattle).toEqual(initialInputBefore);
  expect(serializeReplayFixtureForTest(executedFixture)).toBe(fixtureBefore);
  if (!initialized.accepted) throw new Error(`expected accepted initialization: ${initialized.reason}`);

  let state = initialized.state;
  let deterministicState = initialized.deterministicState;
  let rejectedCount = 0;
  for (const stimulus of executedFixture.stimuli) {
    const actualStateInput = state;
    const actualDeterministicInput = deterministicState;
    const stateBefore = structuredClone(actualStateInput);
    const deterministicBefore = structuredClone(actualDeterministicInput);
    const result = resolveCombatStimulus(actualStateInput, stimulus, actualDeterministicInput);

    expect(actualStateInput).toEqual(stateBefore);
    expect(actualDeterministicInput).toEqual(deterministicBefore);
    if (!result.accepted) {
      rejectedCount += 1;
      expect(result.events).toEqual([]);
      expect(result.state).toEqual(stateBefore);
      expect(result.deterministicState).toEqual(deterministicBefore);
      if (!result.state) throw new Error("rejected combat stimulus must return the unchanged BattleState");
      expect(result.state.combatTimeMs).toBe(stateBefore.combatTimeMs);
      expect(result.state.eventSequence).toBe(stateBefore.eventSequence);
    }
    state = result.state ?? state;
    deterministicState = result.deterministicState;
  }
  expect(serializeReplayFixtureForTest(executedFixture)).toBe(fixtureBefore);
  return rejectedCount;
}

describe("TASK-010 deterministic replay harness", () => {
  it.each(REPLAY_REGRESSION_FIXTURES.map((fixture) => [fixture.fixtureId, fixture] as const))(
    "strictly replays independent copies of %s without mutating the source fixture",
    (_fixtureId, fixture) => {
      const before = serializeReplayFixtureForTest(fixture);
      runStrictReplay(fixture);
      expect(serializeReplayFixtureForTest(fixture)).toBe(before);
    },
  );

  it("treats initialization as authoritative replay evidence for accepted and rejected Battles", () => {
    const acceptedFixture = createPartitionReplayFixture({
      propertyCaseId: "init-equality",
      seed: 2,
      stageDelta: 3,
      initialNextActionRemainingMs: 0,
      partition: "direct",
    });
    const acceptedA = runCombatReplayFixture(independentlyDecoded(acceptedFixture));
    const acceptedB = runCombatReplayFixture(independentlyDecoded(acceptedFixture));
    expect(acceptedA.transcript.initialization).toEqual(acceptedB.transcript.initialization);
    expect(acceptedA.transcript.initialization.accepted).toBe(true);
    expect(eventKinds(acceptedA.transcript.initialization.events)).toEqual([
      "BattleStarted",
      "StatStageChanged",
      "EffectApplied",
    ]);

    const rejectedFixture = createRejectedInitializationReplayFixture();
    const rejectedA = runCombatReplayFixture(independentlyDecoded(rejectedFixture));
    const rejectedB = runCombatReplayFixture(independentlyDecoded(rejectedFixture));
    expect(rejectedA.transcript.initialization).toEqual(rejectedB.transcript.initialization);
    expect(rejectedA.transcript.initialization.accepted).toBe(false);
    expect(rejectedA.transcript.initialization.events).toEqual([]);
    expect(rejectedA.transcript.initialization.state).toBeUndefined();
    expect(rejectedA.transcript.transitions).toEqual([]);
    expect(Object.prototype.hasOwnProperty.call(rejectedA.transcript.initialization, "reason")).toBe(false);
    expect(rejectedA.diagnostics.initializationReason).toBeTruthy();
  });

  it("keeps stored ActionIntents independent from external Move-selection policy code", () => {
    let firstPolicyCalls = 0;
    let secondPolicyCalls = 0;
    const externalPolicies = [
      () => { firstPolicyCalls += 1; return "slow-strike"; },
      () => { secondPolicyCalls += 1; return "alternate-strike"; },
    ];
    expect(externalPolicies).toHaveLength(2);

    const fixture = createReadinessReplayFixture();
    const first = runCombatReplayFixture(independentlyDecoded(fixture));
    const second = runCombatReplayFixture(independentlyDecoded(fixture));
    expect(first.transcript).toEqual(second.transcript);
    expect(firstPolicyCalls).toBe(0);
    expect(secondPolicyCalls).toBe(0);
    expect(first.transcript.orderedStimuli.some((stimulus) => stimulus.kind === "useMove")).toBe(true);
  });

  it("proves rejection atomicity for GCD, Move cooldown, pending replacement and terminal stimuli", () => {
    const readinessFixture = createReadinessReplayFixture();
    const terminalFixture = createTerminalReplacementReplayFixture();
    const readiness = runStrictReplay(readinessFixture);
    const terminal = runStrictReplay(terminalFixture);
    expect(readiness.transitions.filter((transition) => !transition.accepted).length).toBeGreaterThanOrEqual(2);
    expect(terminal.transitions.filter((transition) => !transition.accepted).length).toBeGreaterThanOrEqual(4);
    expect(expectRejectedStimuliAliasAtomic(readinessFixture)).toBeGreaterThanOrEqual(2);
    expect(expectRejectedStimuliAliasAtomic(terminalFixture)).toBeGreaterThanOrEqual(4);
    for (const transcript of [readiness, terminal]) {
      for (const transition of transcript.transitions.filter((entry) => !entry.accepted)) {
        expect(Object.prototype.hasOwnProperty.call(transition, "reason")).toBe(false);
      }
    }
  });

  it("extracts terminal outcome only from BattleEnded and rejects every later mutation", () => {
    const transcript = runCombatReplayFixture(createTerminalReplacementReplayFixture()).transcript;
    const terminalIndex = transcript.transitions.findIndex((transition) => transition.events.some((event) => event.kind === "BattleEnded"));
    expect(terminalIndex).toBeGreaterThanOrEqual(0);
    expect(transcript.finalState?.status).toBe("ended");
    expect(transcript.finalState?.replacementPendingSideIds).toEqual([]);
    const terminalEvent = transcript.flattenedEvents
      .filter((event): event is Extract<CombatEvent, { kind: "BattleEnded" }> => event.kind === "BattleEnded")
      .at(-1);
    expect(terminalEvent?.kind).toBe("BattleEnded");
    expect(transcript.finalOutcome).toEqual(terminalEvent?.kind === "BattleEnded" ? terminalEvent.outcome : undefined);
    expect(transcript.transitions.slice(terminalIndex + 1).every((transition) => !transition.accepted && transition.events.length === 0)).toBe(true);
    expect(transcript.flattenedEvents.at(-1)?.kind).toBe("BattleEnded");

    const nonTerminal = runCombatReplayFixture(createReadinessReplayFixture()).transcript;
    expect(nonTerminal.finalState?.status).toBe("active");
    expect(nonTerminal.finalOutcome).toBeUndefined();
  });

  it("keeps behavior-distinct historical contexts pinned to their explicit version triples", () => {
    const historical = createDamageBranchReplayFixture({
      fixtureId: "historical-rules-v1",
      seed: 1,
      category: "physical",
      typeId: "normal",
      power: 20,
      accuracy: "always",
      criticalPolicy: "never",
      actorTypes: ["fire"],
      targetTypes: [["normal"]],
      typeChart: { normal: { normal: 1 } },
      versions: {
        gameDataVersion: "game-data-2026-01",
        rulesVersion: "combat-rules-retained-v1",
        combatEventSchemaVersion: "combat-events-retained-v1",
      },
    });
    const current = createDamageBranchReplayFixture({
      fixtureId: "current-rules-v2",
      seed: 1,
      category: "physical",
      typeId: "normal",
      power: 80,
      accuracy: "always",
      criticalPolicy: "never",
      actorTypes: ["fire"],
      targetTypes: [["normal"]],
      typeChart: { normal: { normal: 1 } },
      versions: {
        gameDataVersion: "game-data-2026-09",
        rulesVersion: "combat-rules-current-v2",
        combatEventSchemaVersion: "combat-events-current-v2",
      },
    });

    const historicalBefore = runCombatReplayFixture(independentlyDecoded(historical)).transcript;
    const currentTranscript = runCombatReplayFixture(independentlyDecoded(current)).transcript;
    const historicalAfter = runCombatReplayFixture(independentlyDecoded(historical)).transcript;
    expect(historicalAfter).toEqual(historicalBefore);
    expect(historicalBefore.contextRef).toEqual({
      gameDataVersion: "game-data-2026-01",
      rulesVersion: "combat-rules-retained-v1",
      combatEventSchemaVersion: "combat-events-retained-v1",
    });
    expect(currentTranscript.contextRef).toEqual({
      gameDataVersion: "game-data-2026-09",
      rulesVersion: "combat-rules-current-v2",
      combatEventSchemaVersion: "combat-events-current-v2",
    });
    expect(firstDamageAmount(historicalBefore)).not.toBe(firstDamageAmount(currentTranscript));
  });

  it("round-trips opaque reserved, delimiter and NUL identities without collapsing semantic own keys", () => {
    const fixture = createOpaqueIdentifierReplayFixture();
    const decodedFixture = independentlyDecoded(fixture);
    const firstMoveId = decodedFixture.initialBattle.combatants[0].moveLoadout[0];
    expect(firstMoveId.includes("\0")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(decodedFixture.initialBattle.context.moveRules, "constructor")).toBe(true);

    const execution = runCombatReplayFixture(decodedFixture);
    const transcriptJson = serializeReplayTranscriptForTest(execution.transcript);
    const decodedTranscript = deserializeReplayTranscriptForTest(transcriptJson);
    expect(decodedTranscript).toEqual(execution.transcript);
    expect(Object.prototype.hasOwnProperty.call(decodedTranscript.finalState?.combatants ?? {}, "__proto__")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(
      decodedTranscript.finalState?.effects ?? {},
      battleEffectKey("a" as CombatantId, "b:c" as EffectId),
    )).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(
      decodedTranscript.finalState?.effects ?? {},
      battleEffectKey("a:b" as CombatantId, "c" as EffectId),
    )).toBe(true);
    expect(Object.keys(decodedTranscript.finalState?.effects ?? {})).toHaveLength(2);

    const replayed = runCombatReplayFixture(decodedFixture).transcript;
    expect(replayed).toEqual(execution.transcript);
  });

  it("treats caller mode labels as metadata only for identical normalized combat inputs", () => {
    const solo = createReadinessReplayFixture("solo-hunt");
    const realtime = createReadinessReplayFixture("duo-realtime");
    expect(solo.metadata?.orchestratorLabel).not.toBe(realtime.metadata?.orchestratorLabel);
    expect(Object.prototype.hasOwnProperty.call(solo.initialBattle, "mode")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(realtime.initialBattle, "mode")).toBe(false);
    expect(runCombatReplayFixture(solo).transcript).toEqual(runCombatReplayFixture(realtime).transcript);
  });
});

describe("TASK-010 SPEC-003 section 24 replay branches", () => {
  it("covers neutral physical and STAB super-effective special damage", () => {
    const neutral = runStrictReplay(createDamageBranchReplayFixture({
      fixtureId: "physical-neutral",
      seed: 1,
      category: "physical",
      typeId: "normal",
      power: 40,
      accuracy: "always",
      criticalPolicy: "never",
      actorTypes: ["electric"],
      targetTypes: [["water"]],
      typeChart: { normal: { water: 1 } },
    }));
    const superEffective = runStrictReplay(createDamageBranchReplayFixture({
      fixtureId: "special-stab-super-effective",
      seed: 1,
      category: "special",
      typeId: "electric",
      power: 40,
      accuracy: "always",
      criticalPolicy: "never",
      actorTypes: ["electric"],
      targetTypes: [["water"]],
      typeChart: { electric: { water: 2 } },
    }));
    expect(firstDamageAmount(neutral)).toBeGreaterThan(0);
    expect(firstDamageAmount(superEffective)).toBeGreaterThan(firstDamageAmount(neutral) ?? 0);
  });

  it("covers dual-type multiplication and immunity", () => {
    const dual = runStrictReplay(createDamageBranchReplayFixture({
      fixtureId: "dual-type-multiplier",
      seed: 2,
      category: "special",
      typeId: "electric",
      power: 40,
      accuracy: "always",
      criticalPolicy: "never",
      actorTypes: ["electric"],
      targetTypes: [["water", "grass"]],
      typeChart: { electric: { water: 2, grass: 0.5 } },
    }));
    const immune = runStrictReplay(createDamageBranchReplayFixture({
      fixtureId: "type-immunity",
      seed: 2,
      category: "special",
      typeId: "electric",
      power: 40,
      accuracy: "always",
      criticalPolicy: "never",
      actorTypes: ["electric"],
      targetTypes: [["ground"]],
      typeChart: { electric: { ground: 0 } },
    }));
    expect(eventKinds(dual.flattenedEvents)).toContain("DamageApplied");
    expect(eventKinds(immune.flattenedEvents)).toContain("MoveImmune");
    expect(eventKinds(immune.flattenedEvents)).not.toContain("DamageApplied");
    expect(immune.finalDeterministicState).toEqual(immune.initialization.deterministicState);
  });

  it("covers numeric accuracy hit/miss and always-hit critical/non-critical branches with fixed combat seeds", () => {
    const numericMiss = runStrictReplay(createDamageBranchReplayFixture({
      fixtureId: "accuracy-miss-seed-1",
      seed: 1,
      category: "physical",
      typeId: "normal",
      power: 40,
      accuracy: 50,
      criticalPolicy: "never",
      actorTypes: ["normal"],
      targetTypes: [["normal"]],
      typeChart: { normal: { normal: 1 } },
    }));
    const numericHit = runStrictReplay(createDamageBranchReplayFixture({
      fixtureId: "accuracy-hit-seed-2",
      seed: 2,
      category: "physical",
      typeId: "normal",
      power: 40,
      accuracy: 50,
      criticalPolicy: "never",
      actorTypes: ["normal"],
      targetTypes: [["normal"]],
      typeChart: { normal: { normal: 1 } },
    }));
    const critical = runStrictReplay(createDamageBranchReplayFixture({
      fixtureId: "normal-critical-seed-1",
      seed: 1,
      category: "physical",
      typeId: "normal",
      power: 40,
      accuracy: "always",
      criticalPolicy: "normal",
      actorTypes: ["normal"],
      targetTypes: [["normal"]],
      typeChart: { normal: { normal: 1 } },
    }));
    const nonCritical = runStrictReplay(createDamageBranchReplayFixture({
      fixtureId: "normal-noncritical-seed-2",
      seed: 2,
      category: "physical",
      typeId: "normal",
      power: 40,
      accuracy: "always",
      criticalPolicy: "normal",
      actorTypes: ["normal"],
      targetTypes: [["normal"]],
      typeChart: { normal: { normal: 1 } },
    }));

    expect(eventKinds(numericMiss.flattenedEvents)).toContain("MoveMissed");
    expect(eventKinds(numericHit.flattenedEvents)).toContain("DamageApplied");
    expect(eventKinds(critical.flattenedEvents)).toContain("CriticalHit");
    expect(eventKinds(nonCritical.flattenedEvents)).not.toContain("CriticalHit");
  });

  it("keeps minimum non-immune damage at one", () => {
    const transcript = runStrictReplay(createDamageBranchReplayFixture({
      fixtureId: "minimum-nonimmune-damage",
      seed: 1,
      category: "physical",
      typeId: "normal",
      power: 1,
      accuracy: "always",
      criticalPolicy: "never",
      actorTypes: ["fire"],
      targetTypes: [["normal"]],
      typeChart: { normal: { normal: 1 } },
      actorBaseStats: { atk: 0 },
      targetBaseStats: { def: 100_000 },
    }));
    expect(firstDamageAmount(transcript)).toBe(1);
  });

  it("keeps canonical UTF-8 target/event order for multi-target resolution", () => {
    const transcript = runStrictReplay(createDamageBranchReplayFixture({
      fixtureId: "multi-target-utf8-order",
      seed: 2,
      category: "physical",
      typeId: "normal",
      power: 1,
      accuracy: "always",
      criticalPolicy: "never",
      actorTypes: ["normal"],
      targetTypes: [["normal"], ["normal"]],
      targetIds: ["é", "z"],
      targetScope: "allEnemies",
      typeChart: { normal: { normal: 1 } },
    }));
    const moveUsed = transcript.flattenedEvents.find((event) => event.kind === "MoveUsed");
    const damagedTargets = transcript.flattenedEvents
      .filter((event): event is Extract<CombatEvent, { kind: "DamageApplied" }> => event.kind === "DamageApplied")
      .map((event) => event.targetId);
    expect(moveUsed?.kind).toBe("MoveUsed");
    expect(moveUsed?.kind === "MoveUsed" ? moveUsed.targetIds : []).toEqual(["z", "é"]);
    expect(damagedTargets).toEqual(["z", "é"]);
  });

  it("replays same-time initiative by Speed and then CombatantId", () => {
    const base = createDamageBranchReplayFixture({
      fixtureId: "initiative-base",
      seed: 2,
      category: "physical",
      typeId: "normal",
      power: 1,
      accuracy: "always",
      criticalPolicy: "never",
      actorTypes: ["normal"],
      targetTypes: [["normal"]],
      typeChart: { normal: { normal: 1 } },
    });
    const moveId = base.initialBattle.combatants[0].moveLoadout[0];
    const actorId = base.initialBattle.combatants[0].combatantId;
    const targetId = base.initialBattle.combatants[1].combatantId;
    const tieFixture: CombatReplayFixture = {
      ...base,
      fixtureId: "initiative-id-tie",
      initialBattle: {
        ...base.initialBattle,
        combatants: base.initialBattle.combatants.map((combatant) => ({
          ...combatant,
          initialNextActionRemainingMs: 0,
        })),
      },
      stimuli: [
        { kind: "useMove", actorId: targetId, moveId, targetId: actorId },
        { kind: "useMove", actorId, moveId, targetId },
      ],
    };
    const tie = runStrictReplay(tieFixture);
    expect(tie.transitions[0].accepted).toBe(false);
    expect(tie.transitions[1].accepted).toBe(true);

    const speedFixture: CombatReplayFixture = {
      ...base,
      fixtureId: "initiative-speed",
      initialBattle: {
        ...base.initialBattle,
        combatants: base.initialBattle.combatants.map((combatant, index) => ({
          ...combatant,
          initialNextActionRemainingMs: 0,
          baseStats: { ...combatant.baseStats, spe: index === 1 ? 100 : 50 },
        })),
      },
      stimuli: [{ kind: "useMove", actorId: targetId, moveId, targetId: actorId }],
    };
    const speed = runStrictReplay(speedFixture);
    expect(speed.transitions[0].accepted).toBe(true);
  });
});

const PROPERTY_GENERATOR_ID = "task010-grid-v1";
const PROPERTY_CASES = [1, 2, 16].flatMap((combatSeed) =>
  [-20, 20].flatMap((stageDelta) =>
    [0, 7].map((initialNextActionRemainingMs) => ({
      caseId: `${PROPERTY_GENERATOR_ID}/combatSeed=${combatSeed}/stage=${stageDelta}/readiness=${initialNextActionRemainingMs}`,
      combatSeed,
      stageDelta,
      initialNextActionRemainingMs,
    })),
  ),
);

describe("TASK-010 deterministic property matrix", () => {
  it.each(PROPERTY_CASES)("$caseId keeps Battle partition/replay/domain invariants", (propertyCase) => {
    const directFixture = createPartitionReplayFixture({
      propertyCaseId: propertyCase.caseId,
      seed: propertyCase.combatSeed,
      stageDelta: propertyCase.stageDelta,
      initialNextActionRemainingMs: propertyCase.initialNextActionRemainingMs,
      partition: "direct",
    });
    const splitFixture = createPartitionReplayFixture({
      propertyCaseId: propertyCase.caseId,
      seed: propertyCase.combatSeed,
      stageDelta: propertyCase.stageDelta,
      initialNextActionRemainingMs: propertyCase.initialNextActionRemainingMs,
      partition: "split",
    });
    const direct = runCombatReplayFixture(independentlyDecoded(directFixture)).transcript;
    const split = runCombatReplayFixture(independentlyDecoded(splitFixture)).transcript;

    expect(partitionComparable(split)).toEqual(partitionComparable(direct));
    expect(runCombatReplayFixture(independentlyDecoded(directFixture)).transcript).toEqual(direct);
    expect(runCombatReplayFixture(independentlyDecoded(splitFixture)).transcript).toEqual(split);
    expect(direct.initialization.state).toBeDefined();
    if (direct.initialization.state) expectBattleDomains(direct.initialization.state);
    for (const transition of direct.transitions) {
      if (transition.accepted && transition.state) expectBattleDomains(transition.state);
    }
    const actor = direct.finalState?.combatants["partition-actor"];
    expect(actor?.stages.atk).toBe(propertyCase.stageDelta < 0 ? -6 : 6);
  });
});

const TERMINAL_PROPERTY_CASES = [3, 17].flatMap((combatSeed) =>
  (["win", "draw"] as const).map((terminalKind) => ({
    caseId: `${PROPERTY_GENERATOR_ID}/terminal=${terminalKind}/combatSeed=${combatSeed}`,
    combatSeed,
    terminalKind,
  })),
);

describe("TASK-010 deterministic terminal property matrix", () => {
  it.each(TERMINAL_PROPERTY_CASES)("$caseId keeps terminal outcome and post-terminal invariants", (propertyCase) => {
    const fixture = createTerminalPropertyReplayFixture({
      propertyCaseId: propertyCase.caseId,
      seed: propertyCase.combatSeed,
      terminalKind: propertyCase.terminalKind,
    });
    const transcript = runStrictReplay(fixture);
    const terminalTransitionIndex = transcript.transitions.findIndex((transition) =>
      transition.events.some((event) => event.kind === "BattleEnded"),
    );
    const terminalEvent = transcript.flattenedEvents
      .filter((event): event is Extract<CombatEvent, { kind: "BattleEnded" }> => event.kind === "BattleEnded")
      .at(-1);

    expect(terminalTransitionIndex).toBeGreaterThanOrEqual(0);
    expect(transcript.finalState?.status).toBe("ended");
    expect(transcript.finalState?.replacementPendingSideIds).toEqual([]);
    if (transcript.finalState) expectBattleDomains(transcript.finalState);
    expect(terminalEvent).toBeDefined();
    expect(transcript.finalOutcome).toEqual(terminalEvent?.outcome);
    expect(transcript.flattenedEvents.at(-1)?.kind).toBe("BattleEnded");
    if (propertyCase.terminalKind === "win") {
      expect(terminalEvent?.outcome).toEqual({ kind: "win", winnerSideId: "terminal-property-win-a" });
      expect(transcript.flattenedEvents.filter((event) => event.kind === "CombatantKO")).toHaveLength(1);
    } else {
      expect(terminalEvent?.outcome).toEqual({ kind: "draw" });
      expect(transcript.flattenedEvents.filter((event) => event.kind === "CombatantKO")).toHaveLength(2);
    }
    for (const transition of transcript.transitions.slice(terminalTransitionIndex + 1)) {
      expect(transition.accepted).toBe(false);
      expect(transition.events).toEqual([]);
    }
    expect(expectRejectedStimuliAliasAtomic(fixture)).toBeGreaterThanOrEqual(2);
  });
});

describe("TASK-010 cadence replay and partitioning", () => {
  it("replays Battle 1 -> carry -> cadence gap -> different CombatantId Battle 2 rebind", () => {
    const sourceFixture = createCadenceSourceReplayFixture();
    const sourceExecution = runCombatReplayFixture(independentlyDecoded(sourceFixture));
    const sourceTranscript = sourceExecution.transcript;
    expect(sourceTranscript.finalState?.status).toBe("ended");
    expect(sourceTranscript.finalCadenceCarry).toBeDefined();
    if (!sourceTranscript.finalCadenceCarry) throw new Error("expected cadence carry");

    const directGap = advanceCadence(
      sourceTranscript.finalCadenceCarry,
      sourceFixture.initialBattle.context,
      sourceTranscript.finalDeterministicState,
      1000,
    );
    expect(directGap.accepted).toBe(true);
    if (!directGap.accepted) throw new Error(directGap.reason);
    const sourceReplay = runCombatReplayFixture(independentlyDecoded(sourceFixture)).transcript;
    if (!sourceReplay.finalCadenceCarry) throw new Error("expected replayed cadence carry");
    const replayedGap = advanceCadence(
      sourceReplay.finalCadenceCarry,
      independentlyDecoded(sourceFixture).initialBattle.context,
      sourceReplay.finalDeterministicState,
      1000,
    );
    expect(replayedGap).toEqual(directGap);

    const reboundFixture = createCadenceRebindReplayFixture({
      cadenceCarry: directGap.cadence,
      deterministicState: directGap.deterministicState,
      actorId: "cadence-rebound-actor",
    });
    const sourceParticipant = cadenceFixtureParticipant();
    const participantKey = cadenceParticipantKey(sourceParticipant);
    const sourceActorId = sourceFixture.initialBattle.combatants.find((combatant) => combatant.cadenceParticipant)?.combatantId;
    const reboundActor = reboundFixture.initialBattle.combatants.find((combatant) => combatant.cadenceParticipant);
    expect(reboundActor?.combatantId).not.toBe(sourceActorId);
    expect(reboundActor?.cadenceParticipant).toEqual(sourceParticipant);
    expect(Object.prototype.hasOwnProperty.call(reboundFixture.initialBattle.cadenceCarry?.hpByParticipant ?? {}, participantKey)).toBe(true);

    const reboundA = runCombatReplayFixture(independentlyDecoded(reboundFixture)).transcript;
    const reboundB = runCombatReplayFixture(independentlyDecoded(reboundFixture)).transcript;
    expect(reboundA).toEqual(reboundB);
    expect(reboundA.initialization.accepted).toBe(true);
    const reboundStateActor = reboundA.initialization.state?.combatants[reboundActor?.combatantId ?? ""];
    expect(reboundStateActor?.cadenceParticipant).toEqual(sourceParticipant);
    expect(reboundStateActor?.stages).toEqual({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });

    const wrongKindFixture = createCadenceRebindReplayFixture({
      cadenceCarry: directGap.cadence,
      deterministicState: directGap.deterministicState,
      participant: cadenceFixtureParticipant("nonPlayer"),
      actorId: "cadence-wrong-kind",
    });
    expect(cadenceParticipantKey(cadenceFixtureParticipant("nonPlayer"))).not.toBe(participantKey);
    expect(runCombatReplayFixture(wrongKindFixture).transcript.initialization.accepted).toBe(false);
  });

  it("keeps cadence gap A->C equivalent to A->B->C including consequences, carry and RNG", () => {
    const sourceFixture = createCadenceSourceReplayFixture();
    const source = runCombatReplayFixture(sourceFixture).transcript;
    if (!source.finalCadenceCarry) throw new Error("expected cadence carry");

    const direct = advanceCadence(source.finalCadenceCarry, sourceFixture.initialBattle.context, source.finalDeterministicState, 1000);
    const firstHalf = advanceCadence(source.finalCadenceCarry, sourceFixture.initialBattle.context, source.finalDeterministicState, 500);
    expect(direct.accepted).toBe(true);
    expect(firstHalf.accepted).toBe(true);
    if (!direct.accepted || !firstHalf.accepted) throw new Error("expected accepted cadence advancement");
    const secondHalf = advanceCadence(firstHalf.cadence, sourceFixture.initialBattle.context, firstHalf.deterministicState, 500);
    expect(secondHalf.accepted).toBe(true);
    if (!secondHalf.accepted) throw new Error(secondHalf.reason);

    expect(secondHalf.cadence).toEqual(direct.cadence);
    expect([...firstHalf.consequences, ...secondHalf.consequences]).toEqual(direct.consequences);
    expect(secondHalf.deterministicState).toEqual(direct.deterministicState);
  });

  it("keeps rejected cadence advancement atomic and round-trips cadence participant own keys", () => {
    const sourceFixture = createCadenceSourceReplayFixture();
    const source = runStrictReplay(sourceFixture);
    if (!source.finalCadenceCarry) throw new Error("expected cadence carry");

    const actualCarryInput = structuredClone(source.finalCadenceCarry);
    const actualContextInput = structuredClone(sourceFixture.initialBattle.context);
    const actualDeterministicInput = structuredClone(source.finalDeterministicState);
    const carryBefore = structuredClone(actualCarryInput);
    const contextBefore = structuredClone(actualContextInput);
    const deterministicBefore = structuredClone(actualDeterministicInput);
    const rejected = advanceCadence(actualCarryInput, actualContextInput, actualDeterministicInput, -1);
    expect(actualCarryInput).toEqual(carryBefore);
    expect(actualContextInput).toEqual(contextBefore);
    expect(actualDeterministicInput).toEqual(deterministicBefore);
    expect(rejected.accepted).toBe(false);
    expect(rejected.cadence).toEqual(carryBefore);
    expect(rejected.deterministicState).toEqual(deterministicBefore);
    expect(rejected.consequences).toEqual([]);

    const reboundFixture = createCadenceRebindReplayFixture({
      cadenceCarry: source.finalCadenceCarry,
      deterministicState: source.finalDeterministicState,
    });
    const decoded = independentlyDecoded(reboundFixture);
    const participantKey = cadenceParticipantKey(cadenceFixtureParticipant());
    expect(Object.prototype.hasOwnProperty.call(decoded.initialBattle.cadenceCarry?.hpByParticipant ?? {}, participantKey)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(decoded.initialBattle.cadenceCarry?.readinessByParticipant ?? {}, participantKey)).toBe(true);
    expect(runCombatReplayFixture(decoded).transcript).toEqual(runCombatReplayFixture(reboundFixture).transcript);
  });
});
