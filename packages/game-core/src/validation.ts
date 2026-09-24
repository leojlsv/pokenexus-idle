import type {
  BattleCombatantInit,
  BattleInitInput,
  BattleSideInit,
  CadenceParticipant,
  ResolvedCombatContext,
} from "./types";
import { cadenceParticipantKey } from "./types";
import { validateRngState } from "./rng";
import { ownGet } from "./record-utils";

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
const MAX_LEVEL = 200;
const TARGET_SCOPES = new Set([
  "self",
  "singleAlly",
  "singleEnemy",
  "allAllies",
  "allEnemies",
  "allActive",
]);
const CATEGORIES = new Set(["physical", "special", "status"]);
const STAGE_STATS = new Set(["atk", "def", "spa", "spd", "spe"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value > 0;
}

function isCadenceParticipant(value: unknown): value is CadenceParticipant {
  return isRecord(value) &&
    (value.kind === "pokemonInstance" || value.kind === "nonPlayer") &&
    isNonEmptyString(value.identity);
}

function sameStringKeys(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function sameOrderedStrings(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function validateInteger(value: unknown, label: string, minimum = 0): string | undefined {
  if (!isInteger(value) || value < minimum) return `${label} must be an integer >= ${minimum}`;
  return undefined;
}

export function deriveStats(
  baseStats: BattleCombatantInit["baseStats"],
  ivs: BattleCombatantInit["ivs"],
  level: number,
): BattleCombatantInit["baseStats"] | undefined {
  if (!isPositiveInteger(level) || level > MAX_LEVEL) return undefined;
  const result = {} as BattleCombatantInit["baseStats"];
  for (const key of STAT_KEYS) {
    if (!isNonNegativeInteger(baseStats[key]) || !isInteger(ivs[key])) return undefined;
    const raw = ((2n * BigInt(baseStats[key]) + BigInt(ivs[key])) * BigInt(level)) / 100n;
    const derived = key === "hp" ? raw + BigInt(level) + 10n : raw + 5n;
    if (derived < 1n || derived > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
    result[key] = Number(derived);
  }
  return result;
}

function validateStatBlock(block: BattleCombatantInit["baseStats"], label: string): string | undefined {
  for (const key of STAT_KEYS) {
    if (!isNonNegativeInteger(block[key])) return `${label}.${key} must be a non-negative integer`;
  }
  return undefined;
}

export function validateCadenceCarry(cadence: import("./types").CadenceCarryState, context: ResolvedCombatContext): string | undefined {
  const contextError = validateContext(context);
  if (contextError) return contextError;
  if (!isRecord(cadence) || !Array.isArray(cadence.effects) || !isRecord(cadence.hpByParticipant) ||
    !isRecord(cadence.maxHpByParticipant) || !isRecord(cadence.readinessByParticipant) ||
    !isRecord(cadence.actionLockRemainingMsByParticipant)) {
    return "cadence carry must contain effect, HP, readiness, and action-lock records";
  }

  const hpKeys = Object.keys(cadence.hpByParticipant);
  const maxHpKeys = Object.keys(cadence.maxHpByParticipant);
  const readinessKeys = Object.keys(cadence.readinessByParticipant);
  const actionLockKeys = Object.keys(cadence.actionLockRemainingMsByParticipant);
  if (!sameStringKeys(hpKeys, maxHpKeys) || !sameStringKeys(hpKeys, readinessKeys) || !sameStringKeys(hpKeys, actionLockKeys)) {
    return "cadence carry participant keys must match";
  }

  for (const participantKey of hpKeys) {
    const hp = ownGet(cadence.hpByParticipant, participantKey as import("./types").CadenceParticipantKey);
    const maxHp = ownGet(cadence.maxHpByParticipant, participantKey as import("./types").CadenceParticipantKey);
    const readiness = ownGet(cadence.readinessByParticipant, participantKey as import("./types").CadenceParticipantKey);
    const actionLockRemainingMs = ownGet(cadence.actionLockRemainingMsByParticipant, participantKey as import("./types").CadenceParticipantKey);
    if (!isNonNegativeInteger(hp) || !isPositiveInteger(maxHp) || hp > maxHp) {
      return `invalid cadence HP continuity: ${participantKey}`;
    }
    if (!isRecord(readiness) || !isCadenceParticipant(readiness.participant) ||
      cadenceParticipantKey(readiness.participant) !== participantKey ||
      !Array.isArray(readiness.moveLoadout) || readiness.moveLoadout.length < 1 || readiness.moveLoadout.length > 4 ||
      readiness.moveLoadout.some((moveId) => !isNonEmptyString(moveId) || !ownGet(context.moveRules, moveId)) ||
      new Set(readiness.moveLoadout).size !== readiness.moveLoadout.length ||
      !isNonNegativeInteger(readiness.nextActionRemainingMs) || !isRecord(readiness.moveCooldownRemainingMs) ||
      !isNonNegativeInteger(actionLockRemainingMs)) {
      return `invalid cadence readiness: ${participantKey}`;
    }
    const loadoutKeys = readiness.moveLoadout as ReadonlyArray<string>;
    const cooldownKeys = Object.keys(readiness.moveCooldownRemainingMs);
    if (!sameStringKeys(loadoutKeys, cooldownKeys) ||
      cooldownKeys.some((moveId) => !isNonNegativeInteger(ownGet(readiness.moveCooldownRemainingMs, moveId)))) {
      return `invalid cadence move readiness: ${participantKey}`;
    }
  }

  const seenEffects = new Set<string>();
  const applicationSequences = new Set<number>();
  for (const carry of cadence.effects) {
    if (!isRecord(carry) || !isCadenceParticipant(carry.targetCadenceParticipant)) {
      return "invalid cadence effect participant";
    }
    if (!isNonEmptyString(carry.effectId)) return "invalid cadence effect rule";
    const participantKey = cadenceParticipantKey(carry.targetCadenceParticipant);
    const effectKey = JSON.stringify([participantKey, carry.effectId]);
    const rule = ownGet(context.effectRules, carry.effectId);
    if (carry.lifetimeScope !== "cadence" ||
      !rule || rule.lifetimeScope !== "cadence" || rule.stackingPolicy !== carry.stackingPolicy || seenEffects.has(effectKey) ||
      ownGet(cadence.hpByParticipant, participantKey) === undefined || ownGet(cadence.maxHpByParticipant, participantKey) === undefined) {
      return `invalid cadence effect rule: ${effectKey}`;
    }
    if (!isPositiveInteger(carry.applicationSequence) || !isPositiveInteger(carry.scheduleRevision) ||
      !isPositiveInteger(carry.remainingDurationMs) ||
      (carry.remainingToNextTickMs !== undefined && !isPositiveInteger(carry.remainingToNextTickMs)) ||
      applicationSequences.has(carry.applicationSequence) || !isPositiveInteger(carry.stacks)) {
      return `invalid cadence effect timing: ${effectKey}`;
    }
    if ((rule.periodic && carry.remainingToNextTickMs === undefined) || (!rule.periodic && carry.remainingToNextTickMs !== undefined)) {
      return `invalid cadence effect schedule: ${effectKey}`;
    }
    if (rule.stackingPolicy === "stack" && (!rule.periodic || rule.periodic.kind !== "damage" || carry.stacks > (rule.maxStacks ?? 0))) {
      return `invalid cadence effect stack state: ${effectKey}`;
    }
    if (rule.stackingPolicy !== "stack" && carry.stacks !== 1) return `invalid cadence effect stack state: ${effectKey}`;
    seenEffects.add(effectKey);
    applicationSequences.add(carry.applicationSequence);
  }
  return undefined;
}

export function validateContext(context: ResolvedCombatContext): string | undefined {
  if (!isRecord(context)) return "resolved combat context must be a record";
    if (!isNonEmptyString(context.gameDataVersion)) return "gameDataVersion is required";
    if (!isNonEmptyString(context.rulesVersion)) return "rulesVersion is required";
    if (!isNonEmptyString(context.combatEventSchemaVersion)) {
      return "combatEventSchemaVersion is required";
    }
  if (!isRecord(context.moveRules) || !isRecord(context.abilityRules) || !isRecord(context.typeChart)) {
    return "resolved combat context catalogs must be records";
  }
  if (!isRecord(context.effectRules)) return "effect rules must be a record";
  for (const [key, rule] of Object.entries(context.effectRules)) {
    if (!isRecord(rule) || rule.effectId !== key) return `effect rule key mismatch: ${key}`;
    if (rule.lifetimeScope !== "battle" && rule.lifetimeScope !== "cadence") return `effect lifetime scope invalid: ${key}`;
    if (rule.stackingPolicy !== "replace" && rule.stackingPolicy !== "refresh" && rule.stackingPolicy !== "stack") {
      return `effect stacking policy invalid: ${key}`;
    }
    if (!isInteger(rule.durationMs) || rule.durationMs < 1) return `effect duration invalid: ${key}`;
    if (rule.periodic) {
      if (!isRecord(rule.periodic) || (rule.periodic.kind !== "damage" && rule.periodic.kind !== "healing")) {
        return `effect periodic consequence invalid: ${key}`;
      }
      if (!isInteger(rule.periodic.intervalMs) || rule.periodic.intervalMs < 1) return `effect interval invalid: ${key}`;
      if (rule.stackingPolicy === "stack" && (rule.periodic.kind !== "damage" || !isInteger(rule.maxStacks) || rule.maxStacks < 2)) {
        return `effect stack rule invalid: ${key}`;
      }
      if (rule.stackingPolicy !== "stack" && rule.maxStacks !== undefined) return `effect maxStacks invalid: ${key}`;
      if (!isRecord(rule.periodic.magnitude)) return `effect magnitude invalid: ${key}`;
      if (rule.periodic.magnitude.kind === "integer") {
        if (!isInteger(rule.periodic.magnitude.amount) || rule.periodic.magnitude.amount <= 0) return `effect magnitude invalid: ${key}`;
      } else if (
        !isInteger(rule.periodic.magnitude.numerator) ||
        rule.periodic.magnitude.numerator <= 0 ||
        !isInteger(rule.periodic.magnitude.denominator) ||
        rule.periodic.magnitude.denominator <= 0
      ) return `effect fraction invalid: ${key}`;
      else if (rule.periodic.magnitude.kind !== "maxHpFraction") return `effect magnitude invalid: ${key}`;
    } else if (rule.stackingPolicy === "stack") {
      return `non-periodic effect cannot stack: ${key}`;
    }
  }
  for (const [key, rule] of Object.entries(context.moveRules)) {
    if (!isRecord(rule) || rule.moveId !== key) return `move rule key mismatch: ${key}`;
    if (!CATEGORIES.has(rule.category) || !TARGET_SCOPES.has(rule.targetScope)) {
      return `unsupported move rule for ${key}`;
    }
    if (!isInteger(rule.moveCooldownMs) || rule.moveCooldownMs < 2000) {
      return "move cooldown must be >= 2000: " + key;
    }
    if (rule.category === "status") {
      if (!rule.effects || rule.effects.length === 0) return `status move has no explicit effects: ${key}`;
    } else if (!rule.typeId || !isPositiveInteger(rule.power)) return `direct damage power/type invalid: ${key}`;
    if (rule.accuracy !== "always" && (!isInteger(rule.accuracy) || rule.accuracy < 1 || rule.accuracy > 100)) {
      return `accuracy invalid: ${key}`;
    }
    if (rule.category !== "status" && rule.criticalPolicy !== "normal" && rule.criticalPolicy !== "always" && rule.criticalPolicy !== "never") {
      return `critical policy invalid: ${key}`;
    }
    if (rule.makesContact !== undefined && typeof rule.makesContact !== "boolean") {
      return `contact tag invalid: ${key}`;
    }
    const effectError = validateInstructions(rule.effects, context);
    if (effectError) return `${key}: ${effectError}`;
  }
  for (const [key, rule] of Object.entries(context.abilityRules)) {
    if (!isRecord(rule) || rule.abilityId !== key) return `ability rule key mismatch: ${key}`;
    if (rule.reactions !== undefined && !Array.isArray(rule.reactions)) return `ability reactions must be an array: ${key}`;
    const reactionOrders = new Set<string>();
    for (const reaction of rule.reactions ?? []) {
      if (!isRecord(reaction) || !isPositiveInteger(reaction.order) ||
        !["battleStart", "afterDirectDamageDealt", "afterDirectDamageTaken", "afterContactDealt", "afterContactReceived"].includes(reaction.trigger as string) ||
        (reaction.target !== "self" && reaction.target !== "counterpart") ||
        (reaction.trigger === "battleStart" && reaction.target !== "self")) return `ability reaction invalid: ${key}`;
      const effectError = validateAbilityEffects(reaction.effects, context);
      if (effectError) return `${key}: ${effectError}`;
      const orderKey = `${reaction.trigger}:${reaction.order}`;
      if (reactionOrders.has(orderKey)) return `duplicate ability reaction order: ${key}`;
      reactionOrders.add(orderKey);
    }
  }

  function validateInstructions(instructions: unknown, context: ResolvedCombatContext): string | undefined {
    if (instructions === undefined) return undefined;
    if (!Array.isArray(instructions)) return "effect instructions must be an array";
    for (const instruction of instructions) {
      if (!isRecord(instruction)) return "effect instruction must be a record";
      if (instruction.kind !== "heal" && instruction.kind !== "statStage" && instruction.kind !== "actionLock" &&
        instruction.kind !== "applyEffect" && instruction.kind !== "removeEffect") return "effect instruction kind invalid";
      if (instruction.target !== "self" && instruction.target !== "target") return "effect target invalid";
      if (instruction.scope !== "perResolvedTarget" && instruction.scope !== "oncePerAction") return "effect execution scope invalid";
      if (instruction.scope === "oncePerAction" && instruction.target === "target") return "oncePerAction cannot target currentTarget";
      if (instruction.kind === "applyEffect" || instruction.kind === "removeEffect") {
        if (!isNonEmptyString(instruction.effectId) || !Object.prototype.hasOwnProperty.call(context.effectRules, instruction.effectId)) {
          return `unresolved effect: ${String(instruction.effectId)}`;
        }
      }
      if (instruction.kind === "actionLock" && (!isInteger(instruction.durationMs) || instruction.durationMs < 1 ||
        (instruction.lifetimeScope !== "battle" && instruction.lifetimeScope !== "cadence"))) return "action lock invalid";
      if (instruction.kind === "statStage" && (!STAGE_STATS.has(instruction.stat as string) || !isInteger(instruction.delta) || instruction.delta === 0)) return "stat stage invalid";
      if (instruction.kind === "heal") {
        if (!isRecord(instruction.magnitude)) return "heal magnitude invalid";
        if (instruction.magnitude.kind === "integer") {
          if (!isInteger(instruction.magnitude.amount) || instruction.magnitude.amount <= 0) return "heal amount invalid";
        } else if (instruction.magnitude.kind === "maxHpFraction") {
          if (!isInteger(instruction.magnitude.numerator) || instruction.magnitude.numerator <= 0 ||
            !isInteger(instruction.magnitude.denominator) || instruction.magnitude.denominator <= 0) return "heal fraction invalid";
        } else {
          return "heal magnitude invalid";
        }
      }
    }
    return undefined;
  }
  function validateAbilityEffects(effects: unknown, context: ResolvedCombatContext): string | undefined {
    if (!Array.isArray(effects)) return "ability effects must be an array";
    for (const effect of effects) {
      if (!isRecord(effect) || !["heal", "statStage", "actionLock", "applyEffect", "removeEffect"].includes(effect.kind as string)) return "ability effect invalid";
      if (effect.kind === "heal") {
        if (!isRecord(effect.magnitude)) return "ability heal invalid";
        if (effect.magnitude.kind === "integer" && (!isInteger(effect.magnitude.amount) || effect.magnitude.amount <= 0)) return "ability heal invalid";
        if (effect.magnitude.kind === "maxHpFraction" && (!isInteger(effect.magnitude.numerator) || effect.magnitude.numerator <= 0 || !isInteger(effect.magnitude.denominator) || effect.magnitude.denominator <= 0)) return "ability heal invalid";
        if (effect.magnitude.kind !== "integer" && effect.magnitude.kind !== "maxHpFraction") return "ability heal invalid";
      }
      if (effect.kind === "statStage" && (!STAGE_STATS.has(effect.stat as string) || !isInteger(effect.delta) || effect.delta === 0)) return "ability stat invalid";
      if (effect.kind === "actionLock" && (!isInteger(effect.durationMs) || effect.durationMs < 1 ||
        (effect.lifetimeScope !== "battle" && effect.lifetimeScope !== "cadence"))) return "ability lock invalid";
      if ((effect.kind === "applyEffect" || effect.kind === "removeEffect") &&
        (!isNonEmptyString(effect.effectId) || !Object.prototype.hasOwnProperty.call(context.effectRules, effect.effectId))) return "ability effect rule invalid";
    }
    return undefined;
  }
  for (const [attackType, row] of Object.entries(context.typeChart)) {
    if (!isRecord(row)) return `type chart row invalid: ${attackType}`;
    for (const [defenseType, multiplier] of Object.entries(row)) {
      if (![0, 0.5, 1, 2].includes(multiplier as number)) {
        return `type chart value invalid: ${attackType}/${defenseType}`;
      }
    }
  }
  return undefined;
}

function validateSide(side: BattleSideInit): string | undefined {
  if (!isNonEmptyString(side.sideId)) return "sideId is required";
  if (!isPositiveInteger(side.activeCapacity)) return `activeCapacity invalid: ${side.sideId}`;
  if (side.combatantIds.length === 0) return `side has no combatants: ${side.sideId}`;
  if (new Set(side.combatantIds).size !== side.combatantIds.length) {
    return `duplicate combatant in side: ${side.sideId}`;
  }
  if (new Set(side.initialActiveCombatantIds).size !== side.initialActiveCombatantIds.length) {
    return `duplicate active combatant in side: ${side.sideId}`;
  }
  if (side.initialActiveCombatantIds.some((id) => !side.combatantIds.includes(id))) {
    return `active combatant is not owned by side: ${side.sideId}`;
  }
  return undefined;
}

export function validateBattleCombatantInit(
  combatant: BattleCombatantInit,
  context: ResolvedCombatContext,
): string | undefined {
  if (!isNonEmptyString(combatant.combatantId) || !isNonEmptyString(combatant.speciesId)) {
    return "combatant and species identities are required";
  }
  if (!isPositiveInteger(combatant.level) || combatant.level > MAX_LEVEL) return `level invalid: ${combatant.combatantId}`;
  const baseError = validateStatBlock(combatant.baseStats, "baseStats");
  if (baseError) return `${combatant.combatantId}: ${baseError}`;
  for (const key of STAT_KEYS) {
    if (!isInteger(combatant.ivs[key]) || combatant.ivs[key] < 0 || combatant.ivs[key] > 31) {
      return `IV invalid: ${combatant.combatantId}.${key}`;
    }
  }
  if (combatant.types.length < 1) return `types required: ${combatant.combatantId}`;
  if (!isNonNegativeInteger(combatant.startingHp)) return `startingHp invalid: ${combatant.combatantId}`;
  if (!Array.isArray(combatant.moveLoadout) || combatant.moveLoadout.length < 1 || combatant.moveLoadout.length > 4) {
    return `move loadout must contain 1..4 moves: ${combatant.combatantId}`;
  }
  if (new Set(combatant.moveLoadout).size !== combatant.moveLoadout.length) {
    return `duplicate move in loadout: ${combatant.combatantId}`;
  }
  for (const moveId of combatant.moveLoadout) {
    if (!ownGet(context.moveRules, moveId)) return `unresolved move: ${moveId}`;
  }
  if (!isNonNegativeInteger(combatant.initialNextActionRemainingMs)) {
    return `initial action readiness invalid: ${combatant.combatantId}`;
  }
  const readinessKeys = Object.keys(combatant.initialMoveCooldownRemainingMs);
  const loadoutKeys = [...combatant.moveLoadout];
  if (!sameStringKeys(readinessKeys, loadoutKeys)) {
    return `move readiness keys do not match loadout: ${combatant.combatantId}`;
  }
  for (const moveId of loadoutKeys) {
    if (!isNonNegativeInteger(ownGet(combatant.initialMoveCooldownRemainingMs, moveId))) {
      return `move readiness invalid: ${combatant.combatantId}/${moveId}`;
    }
  }
  if (combatant.abilityId && !ownGet(context.abilityRules, combatant.abilityId)) {
    return `unresolved ability: ${combatant.abilityId}`;
  }
  if (combatant.cadenceParticipant && (!isRecord(combatant.cadenceParticipant) ||
    (combatant.cadenceParticipant.kind !== "pokemonInstance" && combatant.cadenceParticipant.kind !== "nonPlayer") ||
    !isNonEmptyString(combatant.cadenceParticipant.identity))) {
    return `cadence participant invalid: ${combatant.combatantId}`;
  }
  const derived = deriveStats(combatant.baseStats, combatant.ivs, combatant.level);
  if (!derived) {
    return `derived stats invalid: ${combatant.combatantId}`;
  }
  if (Object.values(derived).some((value) => value > Math.floor(Number.MAX_SAFE_INTEGER / 4))) {
    return `derived stats exceed stage-safe integer domain: ${combatant.combatantId}`;
  }
  if (combatant.startingHp > derived.hp) return `startingHp exceeds maxHp: ${combatant.combatantId}`;
  return undefined;
}

export function validateBattleInit(input: BattleInitInput): string | undefined {
  if (!isNonEmptyString(input.battleId)) return "battleId is required";
  const contextError = validateContext(input.context);
  if (contextError) return contextError;
  const rngError = validateRngState(input.deterministicState.rng);
  if (rngError) return rngError;
  if (input.sides.length < 2) return "battle requires at least two sides";
  if (new Set(input.sides.map((side) => side.sideId)).size !== input.sides.length) {
    return "side identities must be unique";
  }
  for (const side of input.sides) {
    const error = validateSide(side);
    if (error) return error;
  }
  const combatantIds = input.combatants.map((combatant) => combatant.combatantId);
  if (new Set(combatantIds).size !== combatantIds.length) return "combatant identities must be unique";
  const combatantsById = new Map(input.combatants.map((combatant) => [combatant.combatantId, combatant]));
  const sideOwners = new Map<string, string>();
  for (const side of input.sides) {
    for (const combatantId of side.combatantIds) {
      if (!combatantsById.has(combatantId)) return `side references unknown combatant: ${combatantId}`;
      if (sideOwners.has(combatantId)) return `combatant belongs to multiple sides: ${combatantId}`;
      sideOwners.set(combatantId, side.sideId);
    }
  }
  for (const combatantId of combatantIds) {
    if (!sideOwners.has(combatantId)) return `combatant is not owned by a side: ${combatantId}`;
  }
  for (const combatant of input.combatants) {
    const error = validateBattleCombatantInit(combatant, input.context);
    if (error) return error;
  }
  const bindings = input.cadenceBindings ?? {};
  if (!isRecord(bindings)) return "cadence bindings must be a record";
  const boundParticipantKeys = Object.keys(bindings);
  const boundCombatants = new Set<string>();
  for (const combatant of input.combatants) {
    if (combatant.cadenceParticipant) {
      const participantKey = cadenceParticipantKey(combatant.cadenceParticipant);
      if (ownGet(bindings, participantKey) !== combatant.combatantId) {
        return `cadence participant is not bound exactly: ${participantKey}`;
      }
    }
  }
  for (const participantKey of boundParticipantKeys) {
    const target = ownGet(bindings, participantKey as import("./types").CadenceParticipantKey);
    if (!isNonEmptyString(target)) return `invalid cadence rebind: ${participantKey}`;
    if (boundCombatants.has(target)) return `cadence combatant is bound more than once: ${target}`;
    boundCombatants.add(target);
    const combatant = input.combatants.find((candidate) => candidate.combatantId === target);
    if (!combatant?.cadenceParticipant || cadenceParticipantKey(combatant.cadenceParticipant) !== participantKey) {
      return `invalid cadence rebind: ${participantKey}`;
    }
  }
  if (input.cadenceCarry) {
    const carryError = validateCadenceCarry(input.cadenceCarry, input.context);
    if (carryError) return carryError;
    const participants = input.combatants
      .filter((combatant) => combatant.cadenceParticipant)
      .map((combatant) => cadenceParticipantKey(combatant.cadenceParticipant!));
    const hpKeys = Object.keys(input.cadenceCarry.hpByParticipant);
    const maxHpKeys = Object.keys(input.cadenceCarry.maxHpByParticipant);
    const readinessKeys = Object.keys(input.cadenceCarry.readinessByParticipant);
    const actionLockKeys = Object.keys(input.cadenceCarry.actionLockRemainingMsByParticipant);
    if (!sameStringKeys(hpKeys, participants) || !sameStringKeys(maxHpKeys, participants) ||
      !sameStringKeys(readinessKeys, participants) || !sameStringKeys(actionLockKeys, participants)) {
      return "cadence carry keys must exactly match cadence participants";
    }
    for (const combatant of input.combatants) {
      if (!combatant.cadenceParticipant) continue;
      const participantKey = cadenceParticipantKey(combatant.cadenceParticipant);
      const derived = deriveStats(combatant.baseStats, combatant.ivs, combatant.level);
      const carriedMaxHp = ownGet(input.cadenceCarry.maxHpByParticipant, participantKey);
      const carriedHp = ownGet(input.cadenceCarry.hpByParticipant, participantKey);
      const readiness = ownGet(input.cadenceCarry.readinessByParticipant, participantKey);
      if (!derived || carriedMaxHp !== derived.hp ||
        !isNonNegativeInteger(carriedHp) ||
        carriedHp > derived.hp ||
        carriedHp !== combatant.startingHp ||
        readiness?.nextActionRemainingMs !== combatant.initialNextActionRemainingMs) {
        return `invalid cadence HP continuity: ${participantKey}`;
      }
      const carriedReadiness = readiness;
      const carriedMoveReadiness = carriedReadiness?.moveCooldownRemainingMs;
      if (!carriedReadiness || cadenceParticipantKey(carriedReadiness.participant) !== participantKey ||
        !sameOrderedStrings(carriedReadiness.moveLoadout, combatant.moveLoadout) || !carriedMoveReadiness ||
        !sameStringKeys(Object.keys(carriedMoveReadiness), Object.keys(combatant.initialMoveCooldownRemainingMs)) ||
        Object.keys(carriedMoveReadiness).some((moveId) => ownGet(carriedMoveReadiness, moveId) !== ownGet(combatant.initialMoveCooldownRemainingMs, moveId))) {
        return `invalid cadence readiness continuity: ${participantKey}`;
      }
    }
    const seenEffects = new Set<string>();
    for (const carry of input.cadenceCarry.effects) {
      const rule = ownGet(input.context.effectRules, carry.effectId);
      if (!rule || rule.lifetimeScope !== "cadence" || carry.lifetimeScope !== "cadence") {
        return `invalid cadence effect rule: ${carry.effectId}`;
      }
      if (!isCadenceParticipant(carry.targetCadenceParticipant)) return `invalid cadence effect identity: ${carry.effectId}`;
      const participantKey = cadenceParticipantKey(carry.targetCadenceParticipant);
      const effectKey = JSON.stringify([participantKey, carry.effectId]);
      if (seenEffects.has(effectKey)) return `duplicate cadence effect: ${effectKey}`;
      seenEffects.add(effectKey);
      if (!isPositiveInteger(carry.applicationSequence) || !isPositiveInteger(carry.scheduleRevision) || !isPositiveInteger(carry.stacks)) {
        return `invalid cadence effect identity: ${carry.effectId}`;
      }
      if (rule.stackingPolicy !== carry.stackingPolicy ||
        (rule.stackingPolicy === "stack" && (!rule.periodic || rule.periodic.kind !== "damage" || carry.stacks > (rule.maxStacks ?? 0))) ||
        (rule.stackingPolicy !== "stack" && carry.stacks !== 1)) return `invalid cadence effect stack state: ${effectKey}`;
      if (!isNonNegativeInteger(carry.remainingDurationMs) || (carry.remainingToNextTickMs !== undefined && !isNonNegativeInteger(carry.remainingToNextTickMs))) {
        return `invalid cadence effect timing: ${carry.effectId}`;
      }
      if (carry.remainingDurationMs === 0 || (rule.periodic && carry.remainingToNextTickMs === undefined) || (!rule.periodic && carry.remainingToNextTickMs !== undefined) ||
        (carry.remainingToNextTickMs !== undefined && carry.remainingToNextTickMs === 0)) return `invalid cadence effect schedule: ${effectKey}`;
      if (ownGet(bindings, participantKey) === undefined) return `cadence effect is not rebound: ${participantKey}`;
    }
  }
  const carriedHp = input.cadenceCarry?.hpByParticipant;
  for (const side of input.sides) {
    const living = side.combatantIds.filter((id) => {
      const combatant = input.combatants.find((candidate) => candidate.combatantId === id);
      const participantKey = combatant?.cadenceParticipant ? cadenceParticipantKey(combatant.cadenceParticipant) : undefined;
      const hp = input.cadenceCarry && participantKey && carriedHp ? ownGet(carriedHp, participantKey) : combatant?.startingHp;
      return combatant !== undefined && hp !== undefined && hp > 0;
    });
    if (living.length === 0) return `side has no living combatant: ${side.sideId}`;
    if (side.initialActiveCombatantIds.length !== Math.min(side.activeCapacity, living.length)) return `initial active set is not full: ${side.sideId}`;
    if (side.initialActiveCombatantIds.some((id) => {
      const combatant = input.combatants.find((candidate) => candidate.combatantId === id);
      const participantKey = combatant?.cadenceParticipant ? cadenceParticipantKey(combatant.cadenceParticipant) : undefined;
      return (input.cadenceCarry && participantKey && carriedHp ? ownGet(carriedHp, participantKey) : combatant?.startingHp) === 0;
    })) return `KO combatant cannot be active: ${side.sideId}`;
  }
  return undefined;
}
