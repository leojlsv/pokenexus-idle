import assert from "node:assert/strict";
import { createHash } from "node:crypto";

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    const result = Object.create(null);
    for (const key of Object.keys(value).sort()) result[key] = canonicalValue(value[key]);
    return result;
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(canonicalValue(value))).digest("hex");
}

function battleFinalSummary(state) {
  if (!state) return null;
  const combatants = Object.create(null);
  for (const combatantId of Object.keys(state.combatants).sort()) {
    const combatant = state.combatants[combatantId];
    combatants[combatantId] = {
      currentHp: combatant.currentHp,
      nextActionAtMs: combatant.nextActionAtMs,
      moveReadyAtMs: combatant.moveReadyAtMs,
      stages: combatant.stages,
    };
  }
  return {
    status: state.status,
    combatTimeMs: state.combatTimeMs,
    eventSequence: state.eventSequence,
    replacementPendingSideIds: state.replacementPendingSideIds,
    combatants,
    effects: Object.values(state.effects).map((effect) => ({
      effectId: effect.effectId,
      targetCombatantId: effect.targetCombatantId,
      expiresAtMs: effect.expiresAtMs,
      nextTickAtMs: effect.nextTickAtMs,
      stacks: effect.stacks,
    })),
  };
}

function cadenceFinalSummary(cadence) {
  return {
    effects: cadence.effects.map((effect) => ({
      effectId: effect.effectId,
      remainingDurationMs: effect.remainingDurationMs,
      remainingToNextTickMs: effect.remainingToNextTickMs,
      stacks: effect.stacks,
    })),
    hpByParticipant: cadence.hpByParticipant,
    readinessByParticipant: cadence.readinessByParticipant,
    actionLockRemainingMsByParticipant: cadence.actionLockRemainingMsByParticipant,
  };
}

export function semanticEvidence(scenarioId, result) {
  if (result.kind === "battle") {
    const boundaryCount = result.events.filter((event) => event.kind === "EffectTicked" || event.kind === "EffectRemoved").length;
    const authoritative = {
      scenarioId,
      initializationAccepted: result.initializationAccepted,
      decisions: result.decisions,
      events: result.events,
      finalState: result.finalState,
      finalOutcome: result.finalOutcome,
      deterministicState: result.deterministicState,
    };
    return {
      digest: sha256(authoritative),
      eventCount: result.events.length,
      consequenceCount: 0,
      boundaryCount,
      outcome: result.finalOutcome ?? null,
      final: battleFinalSummary(result.finalState),
      rng: result.deterministicState.rng,
    };
  }

  const boundaryCount = result.consequences.filter((consequence) => consequence.kind === "tick" || consequence.kind === "expiry").length;
  const authoritative = {
    scenarioId,
    accepted: result.accepted,
    consequences: result.consequences,
    cadence: result.cadence,
    deterministicState: result.deterministicState,
  };
  return {
    digest: sha256(authoritative),
    eventCount: 0,
    consequenceCount: result.consequences.length,
    boundaryCount,
    outcome: null,
    final: cadenceFinalSummary(result.cadence),
    rng: result.deterministicState.rng,
  };
}

export function timedSemanticEvidence(scenarioId, result) {
  if (result.kind === "battle-timed") {
    const boundaryCount = result.events.filter((event) => event.kind === "EffectTicked" || event.kind === "EffectRemoved").length;
    const authoritative = {
      scenarioId,
      start: result.start,
      includeInitialization: result.includeInitialization,
      initializeCallCount: result.initializeCallCount,
      stimulusCallCount: result.stimulusCallCount,
      decisions: result.decisions,
      events: result.events,
      finalState: result.finalState,
      finalOutcome: result.finalOutcome,
      deterministicState: result.deterministicState,
    };
    return {
      digest: sha256(authoritative),
      startDigest: sha256(result.start),
      includeInitialization: result.includeInitialization,
      initializeCallCount: result.initializeCallCount,
      stimulusCallCount: result.stimulusCallCount,
      eventCount: result.events.length,
      consequenceCount: 0,
      boundaryCount,
      outcome: result.finalOutcome ?? null,
      final: battleFinalSummary(result.finalState),
      rng: result.deterministicState.rng,
    };
  }

  const boundaryCount = result.consequences.filter((consequence) => consequence.kind === "tick" || consequence.kind === "expiry").length;
  const authoritative = {
    scenarioId,
    start: result.start,
    advanceCadenceCallCount: result.advanceCadenceCallCount,
    accepted: result.accepted,
    consequences: result.consequences,
    cadence: result.cadence,
    deterministicState: result.deterministicState,
  };
  return {
    digest: sha256(authoritative),
    startDigest: sha256(result.start),
    advanceCadenceCallCount: result.advanceCadenceCallCount,
    eventCount: 0,
    consequenceCount: result.consequences.length,
    boundaryCount,
    outcome: null,
    final: cadenceFinalSummary(result.cadence),
    rng: result.deterministicState.rng,
  };
}

export function assertSemanticEvidence(scenarioId, actual, expected) {
  assert.deepStrictEqual(canonicalValue(actual), canonicalValue(expected), `semantic preflight mismatch for ${scenarioId}`);
}

export function nearestRank(values, percentile) {
  if (values.length === 0) throw new Error("nearestRank requires at least one value");
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil(percentile * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}
