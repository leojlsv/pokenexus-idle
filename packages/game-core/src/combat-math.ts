import type {
  BattleCombatantState,
  BattleState,
  CombatantId,
  DeterministicState,
  MoveRule,
  ResolvedCombatContext,
  TypeId,
} from "./types";
import { nextRngState } from "./rng";
import { ownGet } from "./record-utils";

const UINT32_DOMAIN_SIZE = 0xffffffff;

export function compareUtf8Bytes(a: string, b: string): number {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  const length = Math.min(aBytes.length, bBytes.length);
  for (let index = 0; index < length; index += 1) {
    if (aBytes[index] !== bBytes[index]) return aBytes[index] - bBytes[index];
  }
  return aBytes.length - bBytes.length;
}

/**
 * Calculates effective stat under battle-local stat stages [-6..+6].
 * SPEC-003 Section 9:
 * n >= 0: floor(S * (2 + n) / 2)
 * n < 0:  floor(S * 2 / (2 - n))
 * Result is at least 1.
 */
export function calculateEffectiveStat(baseDerivedStat: number, stage: number): number {
  const clampedStage = Math.max(-6, Math.min(6, Math.trunc(stage)));
  const s = BigInt(Math.max(1, Math.trunc(baseDerivedStat)));
  let effective: bigint;

  if (clampedStage >= 0) {
    effective = (s * BigInt(2 + clampedStage)) / 2n;
  } else {
    effective = (s * 2n) / BigInt(2 - clampedStage);
  }

  if (effective > BigInt(Math.floor(Number.MAX_SAFE_INTEGER / 4))) {
    throw new RangeError("effective stat exceeds safe integer domain");
  }
  return Math.max(1, Number(effective));
}

/**
 * Gets effective speed of a combatant.
 */
export function getEffectiveSpeed(combatant: BattleCombatantState): number {
  return calculateEffectiveStat(combatant.derivedStats.spe, combatant.stages.spe);
}

/**
 * Determines whether combatant A acts before combatant B at the same timestamp.
 * SPEC-003 Section 5.1:
 * 1. higher effective spe acts first
 * 2. remaining ties broken by ascending lexicographic comparison of exact UTF-8 bytes of canonical CombatantId
 */
export function compareInitiative(a: BattleCombatantState, b: BattleCombatantState): number {
  const speA = getEffectiveSpeed(a);
  const speB = getEffectiveSpeed(b);
  if (speA !== speB) {
    return speB - speA; // higher speed first (descending)
  }
  return compareUtf8Bytes(a.combatantId, b.combatantId);
}

/**
 * Validates and freezes target set for an action.
 * SPEC-003 Section 7:
 * - self: actor
 * - singleAlly: exactly one other living active on actor's side
 * - singleEnemy: exactly one living active on opposing side
 * - allAllies: all living active on actor's side including actor
 * - allEnemies: all living active on opposing sides
 * - allActive: all living active on all sides including actor
 * Multi-target scope resolves in ascending UTF-8 byte order of CombatantId.
 */
export function resolveTargetIds(
  state: BattleState,
  actor: BattleCombatantState,
  moveRule: MoveRule,
  specifiedTargetId?: CombatantId,
): { targetIds: CombatantId[] } | { error: string } {
  const actorSide = state.sides.find((s) => s.sideId === actor.sideId);
  if (!actorSide) return { error: "actor side not found" };

  const isLivingActive = (id: CombatantId): boolean => {
    const c = ownGet(state.combatants, id);
    if (!c || c.currentHp <= 0) return false;
    const side = state.sides.find((s) => s.sideId === c.sideId);
    return Boolean(side?.activeCombatantIds.includes(id));
  };

  switch (moveRule.targetScope) {
    case "self": {
      return { targetIds: [actor.combatantId] };
    }
    case "singleAlly": {
      if (!specifiedTargetId) return { error: "singleAlly requires explicit targetId" };
      if (specifiedTargetId === actor.combatantId) return { error: "singleAlly cannot target self" };
      const target = ownGet(state.combatants, specifiedTargetId);
      if (!target || target.sideId !== actor.sideId || !isLivingActive(specifiedTargetId)) {
        return { error: "singleAlly target must be a living active ally" };
      }
      return { targetIds: [specifiedTargetId] };
    }
    case "singleEnemy": {
      if (!specifiedTargetId) return { error: "singleEnemy requires explicit targetId" };
      const target = ownGet(state.combatants, specifiedTargetId);
      if (!target || target.sideId === actor.sideId || !isLivingActive(specifiedTargetId)) {
        return { error: "singleEnemy target must be a living active enemy" };
      }
      return { targetIds: [specifiedTargetId] };
    }
    case "allAllies": {
      const allies = (actorSide.activeCombatantIds as CombatantId[]).filter(isLivingActive);
      allies.sort(compareUtf8Bytes);
      return { targetIds: allies };
    }
    case "allEnemies": {
      const enemies: CombatantId[] = [];
      for (const side of state.sides) {
        if (side.sideId === actor.sideId) continue;
        for (const id of side.activeCombatantIds) {
          if (isLivingActive(id)) enemies.push(id);
        }
      }
      enemies.sort(compareUtf8Bytes);
      return { targetIds: enemies };
    }
    case "allActive": {
      const all: CombatantId[] = [];
      for (const side of state.sides) {
        for (const id of side.activeCombatantIds) {
          if (isLivingActive(id)) all.push(id);
        }
      }
      all.sort(compareUtf8Bytes);
      return { targetIds: all };
    }
    default:
      return { error: `unsupported targetScope` };
  }
}

export function hasLegalTarget(state: BattleState, actor: BattleCombatantState, moveRule: MoveRule): boolean {
  const actorSide = state.sides.find((side) => side.sideId === actor.sideId);
  if (!actorSide) return false;
  const isLivingActive = (id: CombatantId): boolean => {
    const combatant = ownGet(state.combatants, id);
    if (!combatant || combatant.currentHp <= 0) return false;
    const side = state.sides.find((candidate) => candidate.sideId === combatant.sideId);
    return Boolean(side?.activeCombatantIds.includes(id));
  };
  switch (moveRule.targetScope) {
    case "self":
      return isLivingActive(actor.combatantId);
    case "singleAlly":
      return actorSide.activeCombatantIds.some(
        (id) => id !== actor.combatantId && ownGet(state.combatants, id)?.sideId === actor.sideId && isLivingActive(id),
      );
    case "singleEnemy":
      return state.sides.some(
        (side) =>
          side.sideId !== actor.sideId &&
          side.activeCombatantIds.some((id) => isLivingActive(id)),
      );
    case "allAllies":
      return actorSide.activeCombatantIds.some((id) => isLivingActive(id));
    case "allEnemies":
    case "allActive":
      return state.sides.some((side) =>
        side.activeCombatantIds.some((id) => (moveRule.targetScope === "allActive" || side.sideId !== actor.sideId) && isLivingActive(id)),
      );
    default:
      return false;
  }
}

/**
 * Draws a uniform integer in [min..max] inclusive from deterministic RNG.
 */
export function drawUniformInteger(
  deterministicState: DeterministicState,
  min: number,
  max: number,
): { value: number; nextState: DeterministicState } {
  const range = max - min + 1;
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || range < 1) {
    throw new Error("uniform draw bounds must be safe integers with min <= max");
  }
  const acceptedDomain = Math.floor(UINT32_DOMAIN_SIZE / range) * range;
  let nextRng = nextRngState(deterministicState.rng);
  while (nextRng.state > acceptedDomain) {
    nextRng = nextRngState(nextRng);
  }
  return {
    value: min + ((nextRng.state - 1) % range),
    nextState: { rng: nextRng },
  };
}

/**
 * SPEC-003 Section 14.1 STAB calculation:
 * If Move's TypeId matches at least one attacker type, STAB is 3/2 (rational 3/2), else 1 (rational 1/1).
 */
export function calculateStab(
  moveTypeId: TypeId | undefined,
  attackerTypes: ReadonlyArray<TypeId>,
): { num: bigint; den: bigint } {
  if (moveTypeId && attackerTypes.includes(moveTypeId)) {
    return { num: 3n, den: 2n };
  }
  return { num: 1n, den: 1n };
}

/**
 * SPEC-003 Section 14.2 Type Effectiveness calculation:
 * Multiplies effectiveness against each defender type from the pinned typeChart.
 * Values: 0 -> 0/1, 0.5 -> 1/2, 1 -> 1/1, 2 -> 2/1.
 */
export function calculateTypeEffectiveness(
  moveTypeId: TypeId | undefined,
  defenderTypes: ReadonlyArray<TypeId>,
  typeChart: ResolvedCombatContext["typeChart"],
): { num: bigint; den: bigint; isImmune: boolean } | { error: string } {
  if (!moveTypeId) return { error: "direct damage move type is unresolved" };
  if (defenderTypes.length === 0) return { error: "defender types are unresolved" };

  const row = ownGet(typeChart, moveTypeId);
  if (!row) return { error: `type chart row is missing: ${moveTypeId}` };

  let num = 1n;
  let den = 1n;

  for (const defType of defenderTypes) {
    const val = ownGet(row, defType);
    if (val === undefined) return { error: `type chart entry is missing: ${moveTypeId}/${defType}` };
    if (val === 0) {
      return { num: 0n, den: 1n, isImmune: true };
    }
    if (val === 0.5) {
      num *= 1n;
      den *= 2n;
    } else if (val === 2) {
      num *= 2n;
      den *= 1n;
    } else if (val === 1) {
      // 1/1
    } else {
      // Any unsupported multiplier fails closed or treats as exact
      return { num: 0n, den: 1n, isImmune: true };
    }
  }

  return { num, den, isImmune: num === 0n };
}

/**
 * SPEC-003 Section 13 Base Damage Arithmetic:
 * levelFactor = floor((2 * L) / 5) + 2
 * scaled      = floor((levelFactor * P * A) / D)
 * baseDamage  = floor(scaled / 50) + 2
 */
export function calculateBaseDamage(
  level: number,
  power: number,
  attackStat: number,
  defenseStat: number,
): bigint {
  const L = BigInt(level);
  const P = BigInt(power);
  const A = BigInt(attackStat);
  const D = BigInt(Math.max(1, defenseStat));

  const levelFactor = (2n * L) / 5n + 2n;
  const scaled = (levelFactor * P * A) / D;
  const baseDamage = scaled / 50n + 2n;
  return baseDamage;
}

/**
 * SPEC-003 Section 14.5 Final Damage Rounding:
 * modified = baseDamage * STAB * typeEffectiveness * critical * (variance / 100)
 * if typeEffectiveness == 0: 0
 * else: max(1, floor(modified))
 */
export function calculateFinalDamage(
  baseDamage: bigint,
  stab: { num: bigint; den: bigint },
  typeEff: { num: bigint; den: bigint },
  isCritical: boolean,
  varianceRoll: number,
): number {
  const finalDamage = calculateFinalDamageExact(baseDamage, stab, typeEff, isCritical, varianceRoll);

  if (finalDamage > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("final damage exceeds safe integer domain");
  return Number(finalDamage);
}

function calculateFinalDamageExact(
  baseDamage: bigint,
  stab: { num: bigint; den: bigint },
  typeEff: { num: bigint; den: bigint },
  isCritical: boolean,
  varianceRoll: number,
): bigint {
  if (typeEff.num === 0n) return 0n;

  const critNum = isCritical ? 3n : 1n;
  const critDen = isCritical ? 2n : 1n;
  const varNum = BigInt(varianceRoll);
  const varDen = 100n;

  const totalNum = baseDamage * stab.num * typeEff.num * critNum * varNum;
  const totalDen = stab.den * typeEff.den * critDen * varDen;

  const modified = totalNum / totalDen;
  const finalDamage = modified < 1n ? 1n : modified;

  return finalDamage;
}

export function calculateCappedFinalDamage(
  baseDamage: bigint,
  stab: { num: bigint; den: bigint },
  typeEff: { num: bigint; den: bigint },
  isCritical: boolean,
  varianceRoll: number,
  currentHp: number,
): number {
  const exact = calculateFinalDamageExact(baseDamage, stab, typeEff, isCritical, varianceRoll);
  const capped = exact > BigInt(currentHp) ? BigInt(currentHp) : exact;
  return Number(capped);
}
