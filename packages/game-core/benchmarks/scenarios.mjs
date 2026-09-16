import { scenarioConfig } from "./scenario-manifest.mjs";

function ownRecord(entries) {
  const record = Object.create(null);
  for (const [key, value] of entries) record[key] = value;
  return record;
}

function terminalOutcome(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.kind === "BattleEnded") return event.outcome;
  }
  return undefined;
}

function executeBattleFixture(engine, fixture) {
  const initialized = engine.initializeBattle(fixture.initialBattle);
  const events = [...initialized.events];
  const decisions = [];
  let state = initialized.accepted ? initialized.state : undefined;
  let deterministicState = initialized.deterministicState;

  if (state) {
    for (const stimulus of fixture.stimuli) {
      const result = engine.resolveCombatStimulus(state, stimulus, deterministicState);
      decisions.push(result.accepted);
      events.push(...result.events);
      state = result.state ?? state;
      deterministicState = result.deterministicState;
    }
  }

  return {
    kind: "battle",
    initializationAccepted: initialized.accepted,
    decisions,
    events,
    finalState: state,
    finalOutcome: terminalOutcome(events),
    deterministicState,
  };
}

function prepareTimedBattle(engine, fixture, includeInitialization) {
  if (includeInitialization) return { includeInitialization: true };
  const initialized = engine.initializeBattle(fixture.initialBattle);
  if (!initialized.accepted) {
    throw new Error(`timed Battle setup rejected for ${fixture.fixtureId}: ${initialized.reason}`);
  }
  return {
    includeInitialization: false,
    state: initialized.state,
    deterministicState: initialized.deterministicState,
  };
}

function executeTimedBattle(engine, prepared, collectEvidence) {
  let state;
  let deterministicState;
  let observed = 0;
  let initializeCallCount = 0;
  let stimulusCallCount = 0;
  const events = collectEvidence ? [] : undefined;
  const decisions = collectEvidence ? [] : undefined;

  if (prepared.timedBattle.includeInitialization) {
    if (collectEvidence) initializeCallCount += 1;
    const initialized = engine.initializeBattle(prepared.fixture.initialBattle);
    observed += initialized.events.length;
    if (collectEvidence) events.push(...initialized.events);
    state = initialized.accepted ? initialized.state : undefined;
    deterministicState = initialized.deterministicState;
  } else {
    state = prepared.timedBattle.state;
    deterministicState = prepared.timedBattle.deterministicState;
  }

  if (state) {
    for (const stimulus of prepared.fixture.stimuli) {
      if (collectEvidence) stimulusCallCount += 1;
      const result = engine.resolveCombatStimulus(state, stimulus, deterministicState);
      observed += result.events.length;
      if (collectEvidence) {
        decisions.push(result.accepted);
        events.push(...result.events);
      }
      state = result.state ?? state;
      deterministicState = result.deterministicState;
    }
    observed += state.eventSequence;
  }
  observed += deterministicState.rng.state;
  if (!collectEvidence) return observed;
  const start = prepared.timedBattle.includeInitialization
    ? { kind: "battleInit", input: prepared.fixture.initialBattle }
    : {
        kind: "preinitializedBattle",
        state: prepared.timedBattle.state,
        deterministicState: prepared.timedBattle.deterministicState,
      };
  return {
    kind: "battle-timed",
    start,
    includeInitialization: prepared.timedBattle.includeInitialization,
    initializeCallCount,
    stimulusCallCount,
    decisions,
    events,
    finalState: state,
    finalOutcome: terminalOutcome(events),
    deterministicState,
  };
}

function executeTimedCadence(engine, prepared, collectEvidence) {
  const result = engine.advanceCadence(
    prepared.cadence,
    prepared.context,
    prepared.deterministicState,
    prepared.gapMs,
  );
  const observed = result.consequences.length + result.deterministicState.rng.state;
  if (!collectEvidence) return observed;
  return {
    kind: "cadence-timed",
    start: {
      cadence: prepared.cadence,
      context: prepared.context,
      deterministicState: prepared.deterministicState,
      gapMs: prepared.gapMs,
    },
    advanceCadenceCallCount: 1,
    accepted: result.accepted,
    consequences: result.consequences,
    cadence: result.cadence,
    deterministicState: result.deterministicState,
  };
}

function createCadenceInputs(engine, config) {
  const participant = { kind: "pokemonInstance", identity: "benchmark-cadence-participant" };
  const participantKey = engine.cadenceParticipantKey(participant);
  const moveId = "benchmark-cadence-idle";
  const effectId = "benchmark-periodic-damage";
  const context = {
    gameDataVersion: "benchmark-data-v1",
    rulesVersion: "benchmark-rules-v1",
    combatEventSchemaVersion: "benchmark-events-v1",
    moveRules: ownRecord([[moveId, {
      moveId,
      typeId: "normal",
      category: "physical",
      targetScope: "singleEnemy",
      moveCooldownMs: 2000,
      power: 1,
      accuracy: "always",
      criticalPolicy: "never",
    }]]),
    abilityRules: ownRecord([]),
    effectRules: ownRecord([[effectId, {
      effectId,
      lifetimeScope: "cadence",
      stackingPolicy: "refresh",
      durationMs: config.durationMs,
      periodic: { kind: "damage", intervalMs: config.intervalMs, magnitude: { kind: "integer", amount: 1 } },
    }]]),
    typeChart: ownRecord([["normal", ownRecord([["normal", 1]])]]),
  };
  const maxHp = 1_000_000_000;
  const cadence = {
    effects: [{
      effectId,
      targetCadenceParticipant: participant,
      lifetimeScope: "cadence",
      stackingPolicy: "refresh",
      applicationSequence: 1,
      scheduleRevision: 1,
      remainingDurationMs: config.durationMs,
      remainingToNextTickMs: config.intervalMs,
      stacks: 1,
    }],
    hpByParticipant: ownRecord([[participantKey, maxHp]]),
    maxHpByParticipant: ownRecord([[participantKey, maxHp]]),
    readinessByParticipant: ownRecord([[participantKey, {
      participant,
      moveLoadout: [moveId],
      nextActionRemainingMs: 0,
      moveCooldownRemainingMs: ownRecord([[moveId, 0]]),
    }]]),
    actionLockRemainingMsByParticipant: ownRecord([[participantKey, 0]]),
  };
  const deterministicState = { rng: { algorithm: "xorshift32-v1", state: 0x12345678 } };
  return { context, cadence, deterministicState, gapMs: config.gapMs };
}

export function prepareScenario(runtime, scenarioId) {
  const config = scenarioConfig(scenarioId);
  const { engine, fixtures } = runtime;

  if (scenarioId === "battle.terminal-replacement.v1") {
    const fixture = fixtures.createTerminalReplacementReplayFixture();
    return { config, fixture, timedBattle: prepareTimedBattle(engine, fixture, true) };
  }
  if (scenarioId === "battle.scheduled-effects.v1") {
    const fixture = fixtures.createPartitionReplayFixture({
      propertyCaseId: "task011-scheduled-effects",
      seed: 2,
      stageDelta: 3,
      initialNextActionRemainingMs: 0,
      partition: "direct",
    });
    return { config, fixture, timedBattle: prepareTimedBattle(engine, fixture, false) };
  }
  if (scenarioId === "battle.multitarget-rng.v1") {
    const fixture = fixtures.createDamageBranchReplayFixture({
      fixtureId: "task011-multitarget-rng",
      seed: 2,
      category: "physical",
      typeId: "normal",
      power: 40,
      accuracy: 75,
      criticalPolicy: "normal",
      actorTypes: ["normal"],
      targetTypes: [["normal"], ["normal"], ["normal"]],
      targetIds: ["é", "z", "a"],
      targetScope: "allEnemies",
      typeChart: { normal: { normal: 1 } },
    });
    return { config, fixture, timedBattle: prepareTimedBattle(engine, fixture, false) };
  }
  return { config, ...createCadenceInputs(engine, config) };
}

export function executePreparedScenario(runtime, prepared) {
  if (prepared.config.kind === "battle") {
    return executeBattleFixture(runtime.engine, prepared.fixture);
  }
  const result = runtime.engine.advanceCadence(
    prepared.cadence,
    prepared.context,
    prepared.deterministicState,
    prepared.gapMs,
  );
  return {
    kind: "cadence",
    accepted: result.accepted,
    consequences: result.consequences,
    cadence: result.cadence,
    deterministicState: result.deterministicState,
  };
}

export function executePreparedScenarioTimed(runtime, prepared) {
  if (prepared.config.kind === "battle") {
    return executeTimedBattle(runtime.engine, prepared, false);
  }
  return executeTimedCadence(runtime.engine, prepared, false);
}

export function executePreparedScenarioTimedEvidence(runtime, prepared) {
  if (prepared.config.kind === "battle") {
    return executeTimedBattle(runtime.engine, prepared, true);
  }
  return executeTimedCadence(runtime.engine, prepared, true);
}
