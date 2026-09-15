import type {
  ActiveEffect,
  BattleCombatantState,
  BattleState,
  CadenceAdvanceResult,
  CadenceCarryState,
  CadenceConsequence,
  CadenceParticipant,
  CombatEvent,
  DeterministicState,
  EffectInstruction,
  EffectMagnitude,
  EffectTarget,
} from "./types";
import { battleEffectKey, cadenceParticipantKey } from "./types";
import { compareUtf8Bytes } from "./combat-math";
import { validateCadenceCarry } from "./validation";
import { evaluateBattleLifecycle } from "./lifecycle";
import { cloneSafeRecord, ownGet, safeRecordFromEntries, safeRecordWith } from "./record-utils";

type MutableState = { state: BattleState; events: CombatEvent[]; sequence: number };
type EventData = {
  [K in CombatEvent["kind"]]: Omit<Extract<CombatEvent, { kind: K }>, "sequence">
}[CombatEvent["kind"]];

function exactMagnitude(maxHp: number, value: EffectMagnitude): bigint {
  const hp = BigInt(maxHp);
  const result = value.kind === "integer"
    ? BigInt(value.amount)
    : (hp * BigInt(value.numerator)) / BigInt(value.denominator);
  const clamped = result < 1n ? 1n : result;
  return clamped;
}

function safeAmount(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("effect magnitude exceeds safe integer range");
  return Number(value);
}

function evaluatePeriodicConsequence(
  currentHp: number,
  maxHp: number,
  rule: { periodic?: { kind: "damage" | "healing"; magnitude: EffectMagnitude } },
  stacks: number,
): { kind: "damage" | "healing"; amount: number; resultingHp: number } | undefined {
  if (!rule.periodic || currentHp <= 0) return undefined;
  const requested = exactMagnitude(maxHp, rule.periodic.magnitude) * BigInt(stacks);
  const current = BigInt(currentHp);
  const maximum = BigInt(maxHp);
  const resulting = rule.periodic.kind === "damage"
    ? (requested >= current ? 0n : current - requested)
    : (current + requested >= maximum ? maximum : current + requested);
  const resultingHp = safeAmount(resulting);
  return { kind: rule.periodic.kind, amount: safeAmount(resulting >= current ? resulting - current : current - resulting), resultingHp };
}

function emit(mutable: MutableState, event: EventData): void {
  mutable.sequence += 1;
  mutable.events.push({ ...event, sequence: mutable.sequence });
}

function recipientFor(actor: BattleCombatantState, target: BattleCombatantState | undefined, targetKind: EffectTarget): BattleCombatantState | undefined {
  return targetKind === "self" ? actor : target;
}

function applyInstruction(mutable: MutableState, actorId: string, targetId: string | undefined, instruction: EffectInstruction): void {
  const actor = ownGet(mutable.state.combatants, actorId);
  const target = targetId ? ownGet(mutable.state.combatants, targetId) : undefined;
  const recipient = actor && recipientFor(actor, target, instruction.target);
  if (!recipient) return;
  const next = { ...recipient, stages: { ...recipient.stages } };
  const combatants = cloneSafeRecord(mutable.state.combatants);

  if (instruction.kind === "removeEffect") {
    const rule = ownGet(mutable.state.context.effectRules, instruction.effectId);
    if (!rule || (rule.lifetimeScope === "cadence" && !next.cadenceParticipant)) return;
    const key = battleEffectKey(next.combatantId, rule.effectId);
    if (!ownGet(mutable.state.effects, key)) return;
    const effects = cloneSafeRecord(mutable.state.effects);
    delete effects[key];
    mutable.state = { ...mutable.state, effects };
    emit(mutable, { kind: "EffectRemoved", effectId: rule.effectId, targetId: next.combatantId, combatTimeMs: mutable.state.combatTimeMs });
    return;
  }

  if (recipient.currentHp <= 0) return;
  if (instruction.kind === "heal") {
    const currentHp = BigInt(next.currentHp);
    const maxHp = BigInt(next.maxHp);
    const requested = exactMagnitude(next.maxHp, instruction.magnitude);
    const resulting = currentHp + requested >= maxHp ? maxHp : currentHp + requested;
    const resultingHp = safeAmount(resulting);
    const amount = safeAmount(resulting - currentHp);
    next.currentHp = resultingHp;
    combatants[next.combatantId] = next;
    mutable.state = { ...mutable.state, combatants };
    emit(mutable, { kind: "HealingApplied", targetId: next.combatantId, amount, resultingHp, combatTimeMs: mutable.state.combatTimeMs });
    return;
  }
  if (instruction.kind === "statStage") {
    const previous = next.stages[instruction.stat];
    const resultingStage = Math.max(-6, Math.min(6, previous + instruction.delta));
    next.stages[instruction.stat] = resultingStage;
    combatants[next.combatantId] = next;
    mutable.state = { ...mutable.state, combatants };
    emit(mutable, { kind: "StatStageChanged", targetId: next.combatantId, stat: instruction.stat, requestedDelta: instruction.delta, appliedDelta: resultingStage - previous, resultingStage, combatTimeMs: mutable.state.combatTimeMs });
    return;
  }
  if (instruction.kind === "actionLock") {
    if (instruction.lifetimeScope === "cadence" && !next.cadenceParticipant) return;
    const actionLockExpiresAtMsByScope = {
      ...next.actionLockExpiresAtMsByScope,
      [instruction.lifetimeScope]: Math.max(
        next.actionLockExpiresAtMsByScope?.[instruction.lifetimeScope] ?? 0,
        mutable.state.combatTimeMs + instruction.durationMs,
      ),
    };
    next.actionLockExpiresAtMsByScope = actionLockExpiresAtMsByScope;
    combatants[next.combatantId] = next;
    mutable.state = { ...mutable.state, combatants };
    return;
  }

  const rule = ownGet(mutable.state.context.effectRules, instruction.effectId);
  if (!rule || (rule.lifetimeScope === "cadence" && !next.cadenceParticipant)) return;
  const key = battleEffectKey(next.combatantId, rule.effectId);
  const prior = ownGet(mutable.state.effects, key);
  if (prior && rule.stackingPolicy === "stack") {
    if ((rule.maxStacks ?? 0) <= prior.stacks) return;
    const effect = { ...prior, stacks: prior.stacks + 1 };
    mutable.state = { ...mutable.state, effects: safeRecordWith(mutable.state.effects, key, effect) };
    emit(mutable, { kind: "EffectUpdated", effectId: rule.effectId, targetId: next.combatantId, stacks: effect.stacks, combatTimeMs: mutable.state.combatTimeMs });
    return;
  }
  if (prior && rule.stackingPolicy === "refresh") {
    const effect = {
      ...prior,
      appliedAtMs: mutable.state.combatTimeMs,
      expiresAtMs: mutable.state.combatTimeMs + rule.durationMs,
      nextTickAtMs: rule.periodic ? mutable.state.combatTimeMs + rule.periodic.intervalMs : undefined,
      scheduleRevision: prior.scheduleRevision + 1,
    };
    mutable.state = { ...mutable.state, effects: safeRecordWith(mutable.state.effects, key, effect) };
    emit(mutable, { kind: "EffectUpdated", effectId: rule.effectId, targetId: next.combatantId, stacks: effect.stacks, combatTimeMs: mutable.state.combatTimeMs });
    return;
  }
  if (prior) emit(mutable, { kind: "EffectRemoved", effectId: rule.effectId, targetId: next.combatantId, combatTimeMs: mutable.state.combatTimeMs });
  const effect: ActiveEffect = {
    effectId: rule.effectId,
    targetCombatantId: next.combatantId,
    ...(next.cadenceParticipant ? { targetCadenceParticipant: next.cadenceParticipant } : {}),
    lifetimeScope: rule.lifetimeScope,
    stackingPolicy: rule.stackingPolicy,
    applicationSequence: mutable.state.nextEffectApplicationSequence,
    scheduleRevision: 1,
    appliedAtMs: mutable.state.combatTimeMs,
    expiresAtMs: mutable.state.combatTimeMs + rule.durationMs,
    nextTickAtMs: rule.periodic ? mutable.state.combatTimeMs + rule.periodic.intervalMs : undefined,
    stacks: 1,
  };
  mutable.state = {
    ...mutable.state,
    effects: safeRecordWith(mutable.state.effects, key, effect),
    nextEffectApplicationSequence: mutable.state.nextEffectApplicationSequence + 1,
  };
  emit(mutable, { kind: "EffectApplied", effectId: rule.effectId, targetId: next.combatantId, stacks: 1, combatTimeMs: mutable.state.combatTimeMs });
}

export function applyEffectInstructionsInternal(
  state: BattleState,
  actorId: string,
  targetId: string | undefined,
  instructions: ReadonlyArray<EffectInstruction> | undefined,
): { state: BattleState; events: ReadonlyArray<CombatEvent> } {
  const mutable: MutableState = { state, events: [], sequence: state.eventSequence };
  for (const instruction of instructions ?? []) applyInstruction(mutable, actorId, targetId, instruction);
  return { state: { ...mutable.state, eventSequence: mutable.sequence }, events: mutable.events };
}

type SchedulableEffect = Pick<
  ActiveEffect,
  | "effectId"
  | "lifetimeScope"
  | "stackingPolicy"
  | "applicationSequence"
  | "scheduleRevision"
  | "appliedAtMs"
  | "expiresAtMs"
  | "nextTickAtMs"
  | "stacks"
> & { scheduleTargetKey: string };
type BattleScheduledEffect = ActiveEffect & { scheduleTargetKey: string };
type CadenceScheduledEffect = SchedulableEffect & { targetCadenceParticipant: CadenceParticipant };
type DueBoundary<T extends SchedulableEffect> = { effect: T; kind: "tick" | "expiry"; at: number };
type ScheduledTarget = { currentHp: number; maxHp: number };

function orderDueBoundaries<T extends { effect: SchedulableEffect; kind: "tick" | "expiry" }>(entries: ReadonlyArray<T>): T[] {
  return [...entries].sort((a, b) =>
    a.effect.applicationSequence - b.effect.applicationSequence ||
    compareUtf8Bytes(a.effect.effectId, b.effect.effectId) ||
    (a.kind === "tick" ? -1 : 1),
  );
}

function sameEffectInstance(left: SchedulableEffect, right: SchedulableEffect): boolean {
  return left.effectId === right.effectId && left.scheduleTargetKey === right.scheduleTargetKey;
}

function resolveDueBoundaries<T extends SchedulableEffect>(
  effects: T[],
  context: BattleState["context"],
  fromMs: number,
  toMs: number,
  getTarget: (effect: T) => ScheduledTarget | undefined,
  applyTick: (effect: T, consequence: NonNullable<ReturnType<typeof evaluatePeriodicConsequence>>, at: number) => void,
  expire: (effect: T, at: number) => void,
  enterBoundary: (at: number) => void,
  completeBoundary: () => boolean,
): void {
  let currentTimeMs = fromMs;
  while (true) {
    const next = effects.flatMap((effect) => [effect.nextTickAtMs, effect.expiresAtMs])
      .filter((time): time is number => time !== undefined && time >= currentTimeMs && time <= toMs);
    if (next.length === 0) return;
    const at = Math.min(...next);
    currentTimeMs = at;
    enterBoundary(at);
    const boundary = orderDueBoundaries(effects.flatMap((effect): DueBoundary<T>[] => [
      ...(effect.nextTickAtMs === at ? [{ effect, kind: "tick" as const, at }] : []),
      ...(effect.expiresAtMs === at ? [{ effect, kind: "expiry" as const, at }] : []),
    ]));
    for (const item of boundary) {
      const current = effects.find((effect) => sameEffectInstance(effect, item.effect));
      if (!current || current.applicationSequence !== item.effect.applicationSequence || current.scheduleRevision !== item.effect.scheduleRevision) continue;
      const rule = ownGet(context.effectRules, current.effectId);
      const tickAtExpiry = item.kind === "tick" && current.nextTickAtMs === current.expiresAtMs;
      if (item.kind === "tick" && rule?.periodic) {
        const target = getTarget(current);
        if (target && target.currentHp > 0) {
          const consequence = evaluatePeriodicConsequence(target.currentHp, target.maxHp, rule, current.stacks);
          if (consequence) applyTick(current, consequence, at);
        }
        current.nextTickAtMs = current.nextTickAtMs! + rule.periodic.intervalMs;
      }
      if (item.kind === "expiry" || tickAtExpiry) {
        effects.splice(effects.indexOf(current), 1);
        expire(current, at);
      }
    }
    if (completeBoundary()) return;
  }
}

export function advanceTime(
  state: BattleState,
  deterministicState: DeterministicState,
  toMs: number,
): { accepted: true; state: BattleState; deterministicState: DeterministicState; events: ReadonlyArray<CombatEvent> } | { accepted: false; reason: string; state: BattleState; deterministicState: DeterministicState; events: ReadonlyArray<CombatEvent> } {
  if (!Number.isSafeInteger(toMs) || toMs <= state.combatTimeMs) return { accepted: false, reason: "advanceTime requires a strictly greater safe integer", state, deterministicState, events: [] };
  if (state.status !== "active") return { accepted: false, reason: "battle is not active", state, deterministicState, events: [] };
  if (state.replacementPendingSideIds.length > 0) return { accepted: false, reason: "forced replacement is pending", state, deterministicState, events: [] };
  const mutable: MutableState = { state, events: [], sequence: state.eventSequence };
  const effects: BattleScheduledEffect[] = Object.values(state.effects).map((effect) => ({
    ...effect,
    scheduleTargetKey: effect.targetCombatantId,
  }));
  resolveDueBoundaries(
    effects,
    state.context,
    state.combatTimeMs,
    toMs,
    (effect) => ownGet(mutable.state.combatants, effect.targetCombatantId),
    (effect, consequence, at) => {
      const target = ownGet(mutable.state.combatants, effect.targetCombatantId)!;
      mutable.state = { ...mutable.state, combatants: safeRecordWith(mutable.state.combatants, target.combatantId, { ...target, currentHp: consequence.resultingHp }) };
      emit(mutable, { kind: "EffectTicked", effectId: effect.effectId, targetId: target.combatantId, consequence: consequence.kind, amount: consequence.amount, resultingHp: consequence.resultingHp, combatTimeMs: at });
      emit(mutable, consequence.kind === "damage"
        ? { kind: "DamageApplied", source: "effect", targetId: target.combatantId, amount: consequence.amount, resultingHp: consequence.resultingHp, combatTimeMs: at }
        : { kind: "HealingApplied", targetId: target.combatantId, amount: consequence.amount, resultingHp: consequence.resultingHp, combatTimeMs: at });
      if (consequence.resultingHp === 0 && target.currentHp > 0) emit(mutable, { kind: "CombatantKO", combatantId: target.combatantId, combatTimeMs: at });
    },
    (effect, at) => emit(mutable, { kind: "EffectRemoved", effectId: effect.effectId, targetId: effect.targetCombatantId, combatTimeMs: at }),
    (at) => { mutable.state = { ...mutable.state, combatTimeMs: at }; },
    () => {
      const lifecycle = evaluateBattleLifecycle(mutable.state);
      mutable.state = lifecycle.state;
      if (lifecycle.outcome) {
        emit(mutable, { kind: "BattleEnded", outcome: lifecycle.outcome, combatTimeMs: mutable.state.combatTimeMs });
      }
      return lifecycle.outcome !== undefined || mutable.state.replacementPendingSideIds.length > 0;
    },
  );
  const stoppedAtBoundary = mutable.state.status === "ended" || mutable.state.replacementPendingSideIds.length > 0;
  const retainedEffects = mutable.state.status === "ended" ? effects.filter((effect) => effect.lifetimeScope === "cadence") : effects;
  const retainedBattleEffects = safeRecordFromEntries(retainedEffects.map(({ scheduleTargetKey: _scheduleTargetKey, ...effect }) => [
    battleEffectKey(effect.targetCombatantId, effect.effectId),
    effect,
  ]));
  return { accepted: true, state: { ...mutable.state, combatTimeMs: stoppedAtBoundary ? mutable.state.combatTimeMs : toMs, eventSequence: mutable.sequence, effects: retainedBattleEffects }, deterministicState, events: mutable.events };
}

export function advanceCadence(cadence: CadenceCarryState, context: BattleState["context"], deterministicState: DeterministicState, gapMs: number): CadenceAdvanceResult {
  if (!Number.isSafeInteger(gapMs) || gapMs < 0) return { accepted: false, reason: "gapMs must be a non-negative safe integer", cadence, deterministicState, consequences: [] };
  const carryError = validateCadenceCarry(cadence, context);
  if (carryError) return { accepted: false, reason: carryError, cadence, deterministicState, consequences: [] };
  const effects: CadenceScheduledEffect[] = cadence.effects.map((carry) => ({
    effectId: carry.effectId,
    scheduleTargetKey: cadenceParticipantKey(carry.targetCadenceParticipant),
    targetCadenceParticipant: carry.targetCadenceParticipant,
    lifetimeScope: "cadence",
    stackingPolicy: carry.stackingPolicy,
    applicationSequence: carry.applicationSequence,
    scheduleRevision: carry.scheduleRevision,
    appliedAtMs: 0,
    expiresAtMs: carry.remainingDurationMs,
    nextTickAtMs: carry.remainingToNextTickMs,
    stacks: carry.stacks,
  }));
  const hp = cloneSafeRecord(cadence.hpByParticipant);
  const consequences: CadenceConsequence[] = [];
  resolveDueBoundaries(
    effects,
    context,
    0,
    gapMs,
    (effect) => {
      const participant = effect.targetCadenceParticipant!;
      const participantKey = cadenceParticipantKey(participant);
      return { currentHp: ownGet(hp, participantKey)!, maxHp: ownGet(cadence.maxHpByParticipant, participantKey)! };
    },
    (effect, consequence) => {
      const participant = effect.targetCadenceParticipant!;
      const participantKey = cadenceParticipantKey(participant);
      const currentHp = ownGet(hp, participantKey)!;
      hp[participantKey] = consequence.resultingHp;
      consequences.push({ kind: "tick", targetCadenceParticipant: participant, effectId: effect.effectId, amount: consequence.amount, resultingHp: consequence.resultingHp });
      consequences.push({ kind: consequence.kind, targetCadenceParticipant: participant, effectId: effect.effectId, amount: consequence.amount, resultingHp: consequence.resultingHp });
      if (consequence.resultingHp === 0 && currentHp > 0) consequences.push({ kind: "ko", targetCadenceParticipant: participant, effectId: effect.effectId, resultingHp: consequence.resultingHp });
    },
    (effect) => consequences.push({ kind: "expiry", targetCadenceParticipant: effect.targetCadenceParticipant!, effectId: effect.effectId }),
    () => undefined,
    () => false,
  );
  const remaining = effects.map((effect) => ({
    effectId: effect.effectId,
    targetCadenceParticipant: effect.targetCadenceParticipant!,
    lifetimeScope: "cadence" as const,
    stackingPolicy: effect.stackingPolicy,
    applicationSequence: effect.applicationSequence,
    scheduleRevision: effect.scheduleRevision,
    remainingDurationMs: effect.expiresAtMs - gapMs,
    remainingToNextTickMs: effect.nextTickAtMs === undefined ? undefined : effect.nextTickAtMs - gapMs,
    stacks: effect.stacks,
  }));
  const readinessByParticipant = safeRecordFromEntries(Object.entries(cadence.readinessByParticipant).map(([participantKey, readiness]) => [
    participantKey,
    {
      participant: readiness.participant,
      moveLoadout: [...readiness.moveLoadout],
      nextActionRemainingMs: Math.max(0, readiness.nextActionRemainingMs - gapMs),
      moveCooldownRemainingMs: safeRecordFromEntries(
        Object.entries(readiness.moveCooldownRemainingMs).map(([moveId, remainingMs]) => [moveId, Math.max(0, remainingMs - gapMs)]),
      ),
    },
  ]));
  const actionLockRemainingMsByParticipant = safeRecordFromEntries(
    Object.entries(cadence.actionLockRemainingMsByParticipant).map(([participantKey, remainingMs]) => [participantKey, Math.max(0, remainingMs - gapMs)]),
  );
  return {
    accepted: true,
    cadence: {
      effects: remaining,
      hpByParticipant: hp,
      maxHpByParticipant: cloneSafeRecord(cadence.maxHpByParticipant),
      readinessByParticipant,
      actionLockRemainingMsByParticipant,
    },
    deterministicState,
    consequences,
  };
}
