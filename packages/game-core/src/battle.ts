import type {
  BattleCombatantState,
  AbilityReactionTrigger,
  BattleInitInput,
  BattleInitResult,
  BattleState,
  CombatantId,
  CombatEvent,
  DeterministicState,
  EffectInstruction,
  ForcedReplacementIntent,
  TransitionResult,
  UseMoveIntent,
} from "./types";
import { battleEffectKey, cadenceParticipantKey } from "./types";
import { validateBattleInit, deriveStats } from "./validation";
import { evaluateBattleLifecycle } from "./lifecycle";
import {
  calculateBaseDamage,
  calculateEffectiveStat,
  calculateCappedFinalDamage,
  calculateStab,
  calculateTypeEffectiveness,
  compareInitiative,
  drawUniformInteger,
  hasLegalTarget,
  resolveTargetIds,
} from "./combat-math";
import { applyEffectInstructionsInternal } from "./effects";
import { advanceTime } from "./effects";
import { cloneSafeRecord, createSafeRecord, ownGet, safeRecordFromEntries, safeRecordWith } from "./record-utils";

export const GLOBAL_ACTION_COOLDOWN_MS = 2000;

function validateAbilityCadenceBindings(state: BattleState, ownerId: CombatantId, counterpartId: CombatantId | undefined, triggers: ReadonlyArray<import("./types").AbilityReactionTrigger>): string | undefined {
  const owner = ownGet(state.combatants, ownerId);
  const rule = owner?.abilityId ? ownGet(state.context.abilityRules, owner.abilityId) : undefined;
  if (!owner || !rule) return undefined;
  for (const reaction of rule.reactions ?? []) {
    if (!triggers.includes(reaction.trigger)) continue;
    const recipient = ownGet(state.combatants, reaction.target === "self" ? ownerId : counterpartId ?? "");
    if (reaction.effects.some((effect) =>
      (effect.kind === "applyEffect" && ownGet(state.context.effectRules, effect.effectId)?.lifetimeScope === "cadence") ||
      (effect.kind === "actionLock" && effect.lifetimeScope === "cadence"),
    ) && !recipient?.cadenceParticipant) {
      return `ability cadence effect cannot bind: ${ownerId}`;
    }
  }
  return undefined;
}

function isActionLocked(combatant: BattleCombatantState, combatTimeMs: number): boolean {
  return Object.values(combatant.actionLockExpiresAtMsByScope ?? {}).some((expiresAtMs) => combatTimeMs < expiresAtMs);
}

function hasExecutableCandidateMove(state: BattleState, actor: BattleCombatantState, moveRule: import("./types").MoveRule): boolean {
  if (isActionLocked(actor, state.combatTimeMs) || state.combatTimeMs < actor.nextActionAtMs ||
    state.combatTimeMs < (ownGet(actor.moveReadyAtMs, moveRule.moveId) ?? 0) || !hasLegalTarget(state, actor, moveRule)) return false;
  if (moveRule.category !== "status" && (!moveRule.typeId || !Number.isSafeInteger(moveRule.power) || moveRule.power! <= 0 ||
    (moveRule.criticalPolicy !== "normal" && moveRule.criticalPolicy !== "always" && moveRule.criticalPolicy !== "never"))) return false;
  if (moveRule.accuracy !== "always" && (!Number.isSafeInteger(moveRule.accuracy) || moveRule.accuracy! < 1 || moveRule.accuracy! > 100)) return false;
  const candidateTargets = moveRule.targetScope === "singleEnemy" || moveRule.targetScope === "singleAlly"
    ? Object.keys(state.combatants) as CombatantId[]
    : [undefined];
  return candidateTargets.some((targetId) => {
    const resolved = resolveTargetIds(state, actor, moveRule, targetId);
    if ("error" in resolved || resolved.targetIds.length === 0) return false;
    for (const instruction of moveRule.effects ?? []) {
      if (instruction.kind !== "applyEffect" && instruction.kind !== "actionLock") continue;
      const effectRule = instruction.kind === "applyEffect" ? ownGet(state.context.effectRules, instruction.effectId) : undefined;
      const requiresCadence = instruction.kind === "actionLock" ? instruction.lifetimeScope === "cadence" : effectRule?.lifetimeScope === "cadence";
      const recipients = instruction.target === "self" ? [actor] : resolved.targetIds.map((id) => ownGet(state.combatants, id));
      if ((instruction.kind === "applyEffect" && !effectRule) || (requiresCadence && recipients.some((recipient) => !recipient?.cadenceParticipant))) return false;
    }
    if (moveRule.category === "status") return true;
    for (const targetId of resolved.targetIds) {
      const target = ownGet(state.combatants, targetId);
      if (!target) return false;
      const effectiveness = calculateTypeEffectiveness(moveRule.typeId, target.types, state.context.typeChart);
      if ("error" in effectiveness) return false;
      if (effectiveness.isImmune) continue;
      const attackerTriggers: AbilityReactionTrigger[] = moveRule.makesContact ? ["afterDirectDamageDealt", "afterContactDealt"] : ["afterDirectDamageDealt"];
      const targetTriggers: AbilityReactionTrigger[] = moveRule.makesContact ? ["afterDirectDamageTaken", "afterContactReceived"] : ["afterDirectDamageTaken"];
      if (validateAbilityCadenceBindings(state, actor.combatantId, targetId, attackerTriggers) ||
        validateAbilityCadenceBindings(state, targetId, actor.combatantId, targetTriggers)) return false;
    }
    return true;
  });
}

function resolveAbilityReactions(
  state: BattleState,
  ownerId: CombatantId,
  counterpartId: CombatantId | undefined,
  trigger: import("./types").AbilityReactionTrigger,
): { state: BattleState; events: ReadonlyArray<CombatEvent> } {
  const owner = ownGet(state.combatants, ownerId);
  const rule = owner?.abilityId ? ownGet(state.context.abilityRules, owner.abilityId) : undefined;
  if (!owner || owner.currentHp <= 0 || !rule) return { state, events: [] };
  let current = state;
  const events: CombatEvent[] = [];
  for (const reaction of (rule.reactions ?? []).filter((candidate) => candidate.trigger === trigger).sort((left, right) => left.order - right.order)) {
    const recipient = reaction.target === "self" ? ownerId : counterpartId;
    if (!recipient) continue;
    const instructions: EffectInstruction[] = reaction.effects.map((effect) => ({
      ...effect,
      scope: "perResolvedTarget",
      target: reaction.target === "self" ? "self" : "target",
    }));
    const result = applyEffectInstructionsInternal(current, ownerId, counterpartId, instructions);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

export function initializeBattle(input: BattleInitInput): BattleInitResult {
  const error = validateBattleInit(input);
  if (error) {
    return {
      accepted: false,
      reason: error,
      deterministicState: input.deterministicState,
      events: [],
    };
  }

  const sideByCombatant = new Map<string, BattleState["sides"][number]["sideId"]>();
  for (const side of input.sides) {
    for (const combatantId of side.combatantIds) sideByCombatant.set(combatantId, side.sideId);
  }

  const combatants = createSafeRecord<BattleState["combatants"][string]>();
  for (const inputCombatant of input.combatants) {
    const participantKey = inputCombatant.cadenceParticipant
      ? cadenceParticipantKey(inputCombatant.cadenceParticipant)
      : undefined;
    const cadenceActionLockRemainingMs = inputCombatant.cadenceParticipant
      ? (input.cadenceCarry ? ownGet(input.cadenceCarry.actionLockRemainingMsByParticipant, participantKey!) : undefined)
      : undefined;
    const derivedStats = deriveStats(inputCombatant.baseStats, inputCombatant.ivs, inputCombatant.level);
    if (!derivedStats) {
      return {
        accepted: false,
        reason: `derived stats invalid: ${inputCombatant.combatantId}`,
        deterministicState: input.deterministicState,
        events: [],
      };
    }
    const moveReadyAtMs = createSafeRecord<number>();
    for (const moveId of inputCombatant.moveLoadout) {
      moveReadyAtMs[moveId] = ownGet(inputCombatant.initialMoveCooldownRemainingMs, moveId)!;
    }
    combatants[inputCombatant.combatantId] = {
      combatantId: inputCombatant.combatantId,
      sideId: sideByCombatant.get(inputCombatant.combatantId)!,
      speciesId: inputCombatant.speciesId,
      level: inputCombatant.level,
      types: [...inputCombatant.types],
      maxHp: derivedStats.hp,
      derivedStats,
      currentHp: inputCombatant.startingHp,
      moveLoadout: [...inputCombatant.moveLoadout],
      nextActionAtMs: inputCombatant.initialNextActionRemainingMs,
      moveReadyAtMs,
      stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      ...(cadenceActionLockRemainingMs !== undefined && cadenceActionLockRemainingMs > 0
        ? { actionLockExpiresAtMsByScope: { cadence: cadenceActionLockRemainingMs } }
        : {}),
      ...(inputCombatant.abilityId ? { abilityId: inputCombatant.abilityId } : {}),
      ...(inputCombatant.cadenceParticipant
        ? { cadenceParticipant: inputCombatant.cadenceParticipant }
        : {}),
    };
  }

  const initialEffects = createSafeRecord<BattleState["effects"][string]>();
  let nextEffectApplicationSequence = 1;
  for (const inputCombatant of input.combatants) {
    const participantKey = inputCombatant.cadenceParticipant
      ? cadenceParticipantKey(inputCombatant.cadenceParticipant)
      : undefined;
    const carriedHp = participantKey && input.cadenceCarry ? ownGet(input.cadenceCarry.hpByParticipant, participantKey) : undefined;
    if (carriedHp !== undefined) {
      combatants[inputCombatant.combatantId] = {
        ...ownGet(combatants, inputCombatant.combatantId)!,
        currentHp: carriedHp,
      };
    }
  }
  for (const carry of input.cadenceCarry?.effects ?? []) {
    const participantKey = cadenceParticipantKey(carry.targetCadenceParticipant);
    const binding = input.cadenceBindings ? ownGet(input.cadenceBindings, participantKey) : undefined;
    const target = binding ? ownGet(combatants, binding) : undefined;
    if (!target) {
      return { accepted: false, reason: `cadence effect target is not bound: ${participantKey}`, deterministicState: input.deterministicState, events: [] };
    }
    const key = battleEffectKey(target.combatantId, carry.effectId);
    initialEffects[key] = {
      effectId: carry.effectId,
      targetCombatantId: target.combatantId,
      targetCadenceParticipant: carry.targetCadenceParticipant,
      lifetimeScope: "cadence",
      stackingPolicy: carry.stackingPolicy,
      applicationSequence: carry.applicationSequence,
      scheduleRevision: carry.scheduleRevision,
      appliedAtMs: 0,
      expiresAtMs: carry.remainingDurationMs,
      nextTickAtMs: carry.remainingToNextTickMs,
      stacks: carry.stacks,
    };
    nextEffectApplicationSequence = Math.max(nextEffectApplicationSequence, carry.applicationSequence + 1);
  }

  const state: BattleState = {
    battleId: input.battleId,
    context: input.context,
    combatTimeMs: 0,
    eventSequence: 1,
    status: "active",
    sides: input.sides.map((side) => ({
      sideId: side.sideId,
      activeCapacity: side.activeCapacity,
      combatantIds: [...side.combatantIds],
      activeCombatantIds: [...side.initialActiveCombatantIds],
    })),
    combatants,
    replacementPendingSideIds: [],
    effects: initialEffects,
    nextEffectApplicationSequence,
  };

  for (const side of state.sides) {
    for (const combatantId of side.activeCombatantIds) {
      const error = validateAbilityCadenceBindings(state, combatantId, undefined, ["battleStart"]);
      if (error) return { accepted: false, reason: error, deterministicState: input.deterministicState, events: [] };
    }
  }
  let initialized = state;
  const events: CombatEvent[] = [{ kind: "BattleStarted", battleId: input.battleId, sequence: 1, combatTimeMs: 0 }];
  const initialActives = state.sides.flatMap((side) => side.activeCombatantIds.map((combatantId) => ownGet(state.combatants, combatantId)))
    .filter((combatant): combatant is BattleCombatantState => combatant !== undefined && combatant.currentHp > 0)
    .sort(compareInitiative);
  for (const combatant of initialActives) {
    const result = resolveAbilityReactions(initialized, combatant.combatantId, undefined, "battleStart");
    initialized = result.state;
    events.push(...result.events);
  }
  const lifecycle = evaluateBattleLifecycle(initialized);
  initialized = lifecycle.state;
  if (lifecycle.outcome) {
    initialized = { ...initialized, eventSequence: initialized.eventSequence + 1 };
    events.push({ kind: "BattleEnded", outcome: lifecycle.outcome, sequence: initialized.eventSequence, combatTimeMs: 0 });
  }
  return {
    accepted: true,
    state: initialized,
    deterministicState: input.deterministicState,
    events,
  };
}

export function createCadenceCarry(state: BattleState): import("./types").CadenceCarryState {
  const participantByCombatant = new Map(
    Object.values(state.combatants)
      .filter((combatant) => combatant.cadenceParticipant)
      .map((combatant) => [combatant.combatantId, combatant.cadenceParticipant!]),
  );
  const effects = Object.values(state.effects)
    .filter((effect) => effect.lifetimeScope === "cadence" && effect.targetCadenceParticipant)
    .map((effect) => ({
      effectId: effect.effectId,
      targetCadenceParticipant: effect.targetCadenceParticipant!,
      lifetimeScope: "cadence" as const,
      stackingPolicy: effect.stackingPolicy,
      applicationSequence: effect.applicationSequence,
      scheduleRevision: effect.scheduleRevision,
      remainingDurationMs: Math.max(0, effect.expiresAtMs - state.combatTimeMs),
      remainingToNextTickMs: effect.nextTickAtMs === undefined ? undefined : Math.max(0, effect.nextTickAtMs - state.combatTimeMs),
      stacks: effect.stacks,
    }));
  const hpByParticipant = createSafeRecord<number>() as Record<import("./types").CadenceParticipantKey, number>;
  const maxHpByParticipant = createSafeRecord<number>() as Record<import("./types").CadenceParticipantKey, number>;
  const readinessByParticipant = createSafeRecord<import("./types").CadenceReadinessCarry>() as Record<import("./types").CadenceParticipantKey, import("./types").CadenceReadinessCarry>;
  const actionLockRemainingMsByParticipant = createSafeRecord<number>() as Record<import("./types").CadenceParticipantKey, number>;
  for (const combatant of Object.values(state.combatants)) {
    const participant = participantByCombatant.get(combatant.combatantId);
    if (participant) {
      const participantKey = cadenceParticipantKey(participant);
      hpByParticipant[participantKey] = combatant.currentHp;
      maxHpByParticipant[participantKey] = combatant.maxHp;
      readinessByParticipant[participantKey] = {
        participant,
        moveLoadout: [...combatant.moveLoadout],
        nextActionRemainingMs: Math.max(0, combatant.nextActionAtMs - state.combatTimeMs),
        moveCooldownRemainingMs: safeRecordFromEntries(
          Object.entries(combatant.moveReadyAtMs).map(([moveId, readyAtMs]) => [moveId, Math.max(0, readyAtMs - state.combatTimeMs)]),
        ),
      };
      actionLockRemainingMsByParticipant[participantKey] = Math.max(
        0,
        (combatant.actionLockExpiresAtMsByScope?.cadence ?? 0) - state.combatTimeMs,
      );
    }
  }
  return { effects, hpByParticipant, maxHpByParticipant, readinessByParticipant, actionLockRemainingMsByParticipant };
}

export function resolveCombatStimulus(
  state: BattleState,
  stimulus: import("./types").CombatStimulus,
  deterministicState: DeterministicState,
): TransitionResult {
  if (stimulus.kind === "advanceTime") return advanceTime(state, deterministicState, stimulus.toMs);
  if (stimulus.kind === "forcedReplacement") return resolveForcedReplacement(state, stimulus, deterministicState);
  return resolveUseMove(state, stimulus, deterministicState);
}

export function resolveForcedReplacement(
  state: BattleState,
  intent: ForcedReplacementIntent,
  deterministicState: DeterministicState,
): TransitionResult {
  if (state.status !== "active") return { accepted: false, reason: "battle is not active", state, deterministicState, events: [] };
  if (!state.replacementPendingSideIds.includes(intent.sideId)) return { accepted: false, reason: "side has no pending replacement", state, deterministicState, events: [] };
  const side = state.sides.find((candidate) => candidate.sideId === intent.sideId);
  const combatant = ownGet(state.combatants, intent.combatantId);
  if (!side || side.activeCombatantIds.length >= side.activeCapacity || !side.combatantIds.includes(intent.combatantId) ||
    !combatant || combatant.sideId !== side.sideId || combatant.currentHp <= 0 || side.activeCombatantIds.includes(combatant.combatantId)) {
    return { accepted: false, reason: "replacement combatant is not a living inactive side member", state, deterministicState, events: [] };
  }
  const activated = {
    ...state,
    sides: state.sides.map((candidate) => candidate.sideId === side.sideId
      ? { ...candidate, activeCombatantIds: [...candidate.activeCombatantIds, combatant.combatantId] }
      : candidate),
    eventSequence: state.eventSequence + 1,
  };
  const lifecycle = evaluateBattleLifecycle(activated);
  return {
    accepted: true,
    state: lifecycle.state,
    deterministicState,
    events: [{ kind: "CombatantActivated", sideId: side.sideId, combatantId: combatant.combatantId, sequence: state.eventSequence + 1, combatTimeMs: state.combatTimeMs }],
  };
}

/**
 * Validates and resolves a useMove intent against BattleState and DeterministicState.
 * SPEC-003 Sections 6, 7, 8, 10, 11, 12, 13, 14, 15, 20, 21.
 * Atomic rejection on failure: returns unchanged state, deterministicState, and no events.
 */
export function resolveUseMove(
  state: BattleState,
  intent: UseMoveIntent,
  deterministicState: DeterministicState,
): TransitionResult {
  if (state.status !== "active") {
    return { accepted: false, reason: "battle is not active", state, deterministicState, events: [] };
  }
  if (state.replacementPendingSideIds.length > 0) {
    return { accepted: false, reason: "forced replacement is pending", state, deterministicState, events: [] };
  }

  const actor = ownGet(state.combatants, intent.actorId);
  if (!actor || actor.currentHp <= 0) {
    return { accepted: false, reason: "actor is not living", state, deterministicState, events: [] };
  }
  if (isActionLocked(actor, state.combatTimeMs)) {
    return { accepted: false, reason: "actor is action locked", state, deterministicState, events: [] };
  }

  const actorSide = state.sides.find((s) => s.sideId === actor.sideId);
  if (!actorSide || !actorSide.activeCombatantIds.includes(actor.combatantId)) {
    return { accepted: false, reason: "actor is not active", state, deterministicState, events: [] };
  }

  if (state.combatTimeMs < actor.nextActionAtMs) {
    return { accepted: false, reason: "actor is on global action cooldown", state, deterministicState, events: [] };
  }

  if (!actor.moveLoadout.includes(intent.moveId)) {
    return { accepted: false, reason: "move is not in actor loadout", state, deterministicState, events: [] };
  }

  const moveRule = ownGet(state.context.moveRules, intent.moveId);
  if (!moveRule) {
    return { accepted: false, reason: "move rule not resolved in context", state, deterministicState, events: [] };
  }

  const moveReadyAt = ownGet(actor.moveReadyAtMs, intent.moveId) ?? 0;
  if (state.combatTimeMs < moveReadyAt) {
    return { accepted: false, reason: "move is on cooldown", state, deterministicState, events: [] };
  }

  // Same-timestamp Speed initiative verification:
  // Collect all living active combatants across all sides who are action-ready at combatTimeMs
  const readyCombatants: BattleCombatantState[] = [];
  for (const side of state.sides) {
    for (const cId of side.activeCombatantIds) {
      const c = ownGet(state.combatants, cId);
      if (c && c.currentHp > 0 && state.combatTimeMs >= c.nextActionAtMs && !isActionLocked(c, state.combatTimeMs)) {
        // check if c has at least one executable ready move with legal target
        const hasExecutableMove = c.moveLoadout.some((mId) => {
          const rule = ownGet(state.context.moveRules, mId);
          if (!rule) return false;
          return rule !== undefined && hasExecutableCandidateMove(state, c, rule);
        });
        if (hasExecutableMove) {
          readyCombatants.push(c);
        }
      }
    }
  }

  readyCombatants.sort(compareInitiative);
  if (readyCombatants.length > 0 && readyCombatants[0].combatantId !== actor.combatantId) {
    return {
      accepted: false,
      reason: `actor does not have initiative at this timestamp; expected ${readyCombatants[0].combatantId}`,
      state,
      deterministicState,
      events: [],
    };
  }

  // Target resolution & freezing
  const targetRes = resolveTargetIds(state, actor, moveRule, intent.targetId);
  if ("error" in targetRes || targetRes.targetIds.length === 0) {
    return { accepted: false, reason: "error" in targetRes ? targetRes.error : "no legal targets", state, deterministicState, events: [] };
  }
  const frozenTargetIds = targetRes.targetIds;
  if (moveRule.category === "status" && (!moveRule.effects || moveRule.effects.length === 0)) {
    return { accepted: false, reason: "status move has no explicit effects", state, deterministicState, events: [] };
  }
  const power = moveRule.power;
  const accuracyRule = moveRule.accuracy;
  if (
    (moveRule.category !== "status" && !moveRule.typeId) ||
    (moveRule.category !== "status" && typeof power !== "number") ||
    (moveRule.category !== "status" && !Number.isSafeInteger(power)) ||
    (moveRule.category !== "status" && power !== undefined && power <= 0) ||
    (accuracyRule !== "always" &&
      (typeof accuracyRule !== "number" ||
        !Number.isSafeInteger(accuracyRule) ||
        accuracyRule < 1 ||
        accuracyRule > 100)) ||
    (moveRule.category !== "status" && !moveRule.criticalPolicy)
  ) {
    return { accepted: false, reason: "move rule is not executable", state, deterministicState, events: [] };
  }
  for (const instruction of moveRule.effects ?? []) {
    if (instruction.kind === "applyEffect" || instruction.kind === "actionLock") {
      const effectRule = instruction.kind === "applyEffect" ? ownGet(state.context.effectRules, instruction.effectId) : undefined;
      const requiresCadenceParticipant = instruction.kind === "actionLock"
        ? instruction.lifetimeScope === "cadence"
        : effectRule?.lifetimeScope === "cadence";
      const recipients = instruction.target === "self"
        ? [actor]
        : frozenTargetIds.map((targetId) => ownGet(state.combatants, targetId)).filter((target): target is BattleCombatantState => target !== undefined);
      if ((instruction.kind === "applyEffect" && !effectRule) || (requiresCadenceParticipant && recipients.some((recipient) => !recipient.cadenceParticipant))) {
        return { accepted: false, reason: "effect instruction cannot bind its lifetime scope", state, deterministicState, events: [] };
      }
    }
  }
  const movePower = power;
  const moveAccuracy = accuracyRule;

  // Freeze calculation inputs at action acceptance
  const offensiveStatKey = moveRule.category === "special" ? "spa" : "atk";
  const defensiveStatKey = moveRule.category === "special" ? "spd" : "def";
  const actorEffectiveOffensiveStat = calculateEffectiveStat(actor.derivedStats[offensiveStatKey], actor.stages[offensiveStatKey]);
  const actorTypes = [...actor.types];
  const targetSnapshots: Array<{
    targetId: CombatantId;
    targetEffectiveDefensiveStat: number;
    typeEffectiveness: { num: bigint; den: bigint; isImmune: boolean };
  }> = [];
  for (const targetId of frozenTargetIds) {
    const target = ownGet(state.combatants, targetId);
    if (!target) {
      return { accepted: false, reason: `target is missing: ${targetId}`, state, deterministicState, events: [] };
    }
    if (moveRule.category === "status") continue;
    const typeEffectiveness = calculateTypeEffectiveness(moveRule.typeId, target.types, state.context.typeChart);
    if ("error" in typeEffectiveness) {
      return { accepted: false, reason: typeEffectiveness.error, state, deterministicState, events: [] };
    }
    targetSnapshots.push({
      targetId,
      targetEffectiveDefensiveStat: calculateEffectiveStat(
        target.derivedStats[defensiveStatKey],
        target.stages[defensiveStatKey],
      ),
      typeEffectiveness,
    });
  }
  if (moveRule.category !== "status") {
    const attackerTriggers: import("./types").AbilityReactionTrigger[] = moveRule.makesContact
      ? ["afterDirectDamageDealt", "afterContactDealt"]
      : ["afterDirectDamageDealt"];
    const targetTriggers: import("./types").AbilityReactionTrigger[] = moveRule.makesContact
      ? ["afterDirectDamageTaken", "afterContactReceived"]
      : ["afterDirectDamageTaken"];
    for (const targetSnapshot of targetSnapshots) {
      if (targetSnapshot.typeEffectiveness.isImmune) continue;
      const actorBindingError = validateAbilityCadenceBindings(state, actor.combatantId, targetSnapshot.targetId, attackerTriggers);
      const targetBindingError = validateAbilityCadenceBindings(state, targetSnapshot.targetId, actor.combatantId, targetTriggers);
      if (actorBindingError || targetBindingError) {
        return { accepted: false, reason: actorBindingError ?? targetBindingError!, state, deterministicState, events: [] };
      }
    }
  }

  let currentDetState = deterministicState;
  let nextSeq = state.eventSequence;
  const events: CombatEvent[] = [];

  // 1. MoveUsed event
  nextSeq += 1;
  events.push({
    kind: "MoveUsed",
    actorId: actor.combatantId,
    moveId: intent.moveId,
    targetIds: frozenTargetIds,
    sequence: nextSeq,
    combatTimeMs: state.combatTimeMs,
  });

  // Clone combatants state map for mutations
  let nextCombatants = createSafeRecord<BattleCombatantState>();
  for (const [id, c] of Object.entries(state.combatants)) {
    nextCombatants[id] = {
      ...c,
      types: [...c.types],
      derivedStats: { ...c.derivedStats },
      moveLoadout: [...c.moveLoadout],
      moveReadyAtMs: cloneSafeRecord(c.moveReadyAtMs),
      stages: { ...c.stages },
    };
  }

  // Resolve per frozen target in canonical order
  for (const targetId of frozenTargetIds) {
    const target = ownGet(nextCombatants, targetId);
    if (!target || target.currentHp <= 0) {
      // Skipped if KO before its turn in action chain
      continue;
    }

    // Accuracy gate
    const accuracy = moveAccuracy;
    if (typeof accuracy === "number") {
      const { value: accuracyRoll, nextState: s1 } = drawUniformInteger(currentDetState, 1, 100);
      currentDetState = s1;
      if (accuracyRoll > accuracy) {
        nextSeq += 1;
        events.push({
          kind: "MoveMissed",
          actorId: actor.combatantId,
          moveId: intent.moveId,
          targetId: target.combatantId,
          sequence: nextSeq,
          combatTimeMs: state.combatTimeMs,
        });
        continue;
      }
    }

    if (moveRule.category === "status") {
      const effectResult = applyEffectInstructionsInternal(
        { ...state, combatants: nextCombatants, eventSequence: nextSeq },
        actor.combatantId,
        target.combatantId,
        moveRule.effects?.filter((instruction) => instruction.scope === "perResolvedTarget"),
      );
      nextCombatants = cloneSafeRecord(effectResult.state.combatants);
      nextSeq = effectResult.state.eventSequence;
      state = effectResult.state;
      events.push(...effectResult.events);
      continue;
    }

    // Physical / Special direct damage
    if (movePower === undefined) {
      return { accepted: false, reason: "direct damage power is unresolved", state, deterministicState, events: [] };
    }
    const snapshot = targetSnapshots.find((candidate) => !("error" in candidate) && candidate.targetId === targetId);
    if (!snapshot) continue;
    const targetEffectiveDefensiveStat = snapshot.targetEffectiveDefensiveStat;
    const baseDamage = calculateBaseDamage(actor.level, movePower, actorEffectiveOffensiveStat, targetEffectiveDefensiveStat);

    const stab = calculateStab(moveRule.typeId, actorTypes);
    const typeEff = snapshot.typeEffectiveness;

    if (typeEff.isImmune) {
      nextSeq += 1;
      events.push({
        kind: "MoveImmune",
        actorId: actor.combatantId,
        moveId: intent.moveId,
        targetId: target.combatantId,
        sequence: nextSeq,
        combatTimeMs: state.combatTimeMs,
      });
      continue;
    }

    // Critical hit roll (if policy is normal)
    let isCrit: boolean;
    if (moveRule.criticalPolicy === "always") {
      isCrit = true;
    } else if (moveRule.criticalPolicy === "never") {
      isCrit = false;
    } else {
      // normal: 1/16 draw [1..16], 1 is crit
      const { value: critRoll, nextState: s2 } = drawUniformInteger(currentDetState, 1, 16);
      currentDetState = s2;
      isCrit = critRoll === 1;
    }

    // Damage variance roll: uniform integer [85..100]
    const { value: varianceRoll, nextState: s3 } = drawUniformInteger(currentDetState, 85, 100);
    currentDetState = s3;

    const appliedDamage = calculateCappedFinalDamage(
      baseDamage,
      stab,
      typeEff,
      isCrit,
      varianceRoll,
      target.currentHp,
    );

    if (isCrit) {
      nextSeq += 1;
      events.push({
        kind: "CriticalHit",
        actorId: actor.combatantId,
        moveId: intent.moveId,
        targetId: target.combatantId,
        sequence: nextSeq,
        combatTimeMs: state.combatTimeMs,
      });
    }

    const resultingHp = target.currentHp - appliedDamage;
    target.currentHp = resultingHp;

    nextSeq += 1;
    events.push({
      kind: "DamageApplied",
      source: "move",
      actorId: actor.combatantId,
      moveId: intent.moveId,
      targetId: target.combatantId,
      amount: appliedDamage,
      resultingHp,
      sequence: nextSeq,
      combatTimeMs: state.combatTimeMs,
    });

    if (resultingHp === 0) {
      nextSeq += 1;
      events.push({
        kind: "CombatantKO",
        combatantId: target.combatantId,
        sequence: nextSeq,
        combatTimeMs: state.combatTimeMs,
      });
    }

    const attackerTriggers: AbilityReactionTrigger[] = moveRule.makesContact
      ? ["afterDirectDamageDealt", "afterContactDealt"]
      : ["afterDirectDamageDealt"];
    for (const trigger of attackerTriggers) {
      const reaction = resolveAbilityReactions(
        { ...state, combatants: nextCombatants, eventSequence: nextSeq },
        actor.combatantId,
        target.combatantId,
        trigger,
      );
      nextCombatants = cloneSafeRecord(reaction.state.combatants);
      nextSeq = reaction.state.eventSequence;
      state = reaction.state;
      events.push(...reaction.events);
    }
    if ((ownGet(nextCombatants, target.combatantId)?.currentHp ?? 0) > 0) {
      const targetTriggers: AbilityReactionTrigger[] = moveRule.makesContact
        ? ["afterDirectDamageTaken", "afterContactReceived"]
        : ["afterDirectDamageTaken"];
      for (const trigger of targetTriggers) {
        const reaction = resolveAbilityReactions(
          { ...state, combatants: nextCombatants, eventSequence: nextSeq },
          target.combatantId,
          actor.combatantId,
          trigger,
        );
        nextCombatants = cloneSafeRecord(reaction.state.combatants);
        nextSeq = reaction.state.eventSequence;
        state = reaction.state;
        events.push(...reaction.events);
      }
    }

    const effectResult = applyEffectInstructionsInternal(
      { ...state, combatants: nextCombatants, eventSequence: nextSeq },
      actor.combatantId,
      target.combatantId,
      moveRule.effects?.filter((instruction) => instruction.scope === "perResolvedTarget"),
    );
    nextCombatants = cloneSafeRecord(effectResult.state.combatants);
    nextSeq = effectResult.state.eventSequence;
    state = effectResult.state;
    events.push(...effectResult.events);
  }

  const oncePerAction = applyEffectInstructionsInternal(
    { ...state, combatants: nextCombatants, eventSequence: nextSeq },
    actor.combatantId,
    undefined,
    moveRule.effects?.filter((instruction) => instruction.scope === "oncePerAction"),
  );
  nextCombatants = cloneSafeRecord(oncePerAction.state.combatants);
  nextSeq = oncePerAction.state.eventSequence;
  state = oncePerAction.state;
  events.push(...oncePerAction.events);

  // Update actor GCD and Move readiness
  const nextActor = ownGet(nextCombatants, actor.combatantId)!;
  nextCombatants[actor.combatantId] = {
    ...nextActor,
    nextActionAtMs: state.combatTimeMs + GLOBAL_ACTION_COOLDOWN_MS,
    moveReadyAtMs: safeRecordWith(nextActor.moveReadyAtMs, intent.moveId, state.combatTimeMs + moveRule.moveCooldownMs),
  };

  let nextState: BattleState = {
    ...state,
    eventSequence: nextSeq,
    combatants: nextCombatants,
  };
  const lifecycle = evaluateBattleLifecycle(nextState);
  nextState = lifecycle.state;
  if (lifecycle.outcome) {
    nextSeq += 1;
    events.push({ kind: "BattleEnded", outcome: lifecycle.outcome, sequence: nextSeq, combatTimeMs: nextState.combatTimeMs });
    nextState = { ...nextState, eventSequence: nextSeq };
  }

  return {
    accepted: true,
    state: nextState,
    deterministicState: currentDetState,
    events,
  };
}
