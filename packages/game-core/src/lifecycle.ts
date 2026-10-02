import type { BattleSideId, BattleState } from "./types";
import { ownGet, safeRecordFromEntries } from "./record-utils";

export type BattleOutcome = { kind: "win"; winnerSideId: BattleSideId } | { kind: "draw" };

function evaluateBattleLifecycleInternal(state: BattleState, allowKoIntervention: boolean): {
  state: BattleState;
  outcome?: BattleOutcome;
} {
  if (state.koInterventionPending) return { state };

  if (allowKoIntervention && state.koInterventionSideId) {
    const interventionSide = state.sides.find((side) => side.sideId === state.koInterventionSideId);
    const pendingCombatantId = interventionSide?.activeCombatantIds.find(
      (combatantId) => (ownGet(state.combatants, combatantId)?.currentHp ?? 0) === 0,
    );
    const nonInterventionSideHasLivingCombatant = state.sides.some((side) =>
      side.sideId !== state.koInterventionSideId
      && side.combatantIds.some((combatantId) => (ownGet(state.combatants, combatantId)?.currentHp ?? 0) > 0),
    );
    if (pendingCombatantId && nonInterventionSideHasLivingCombatant) {
      return {
        state: {
          ...state,
          replacementPendingSideIds: [],
          koInterventionPending: {
            sideId: state.koInterventionSideId,
            combatantId: pendingCombatantId,
          },
        },
      };
    }
  }

  const sides = state.sides.map((side) => ({
    ...side,
    activeCombatantIds: side.activeCombatantIds.filter((combatantId) => (ownGet(state.combatants, combatantId)?.currentHp ?? 0) > 0),
  }));
  const surviving = sides.filter((side) => side.combatantIds.some((combatantId) => (ownGet(state.combatants, combatantId)?.currentHp ?? 0) > 0));
  if (surviving.length <= 1) {
    const effects = safeRecordFromEntries(Object.entries(state.effects).filter(([, effect]) => effect.lifetimeScope === "cadence"));
    const combatants = safeRecordFromEntries(Object.entries(state.combatants).map(([combatantId, combatant]) => {
      const { actionLockExpiresAtMsByScope: priorActionLocks, ...unlockedCombatant } = combatant;
      const { battle: _battle, ...actionLockExpiresAtMsByScope } = priorActionLocks ?? {};
      return [combatantId, {
        ...unlockedCombatant,
        ...(Object.keys(actionLockExpiresAtMsByScope).length > 0 ? { actionLockExpiresAtMsByScope } : {}),
      }];
    }));
    return {
      state: {
        ...state,
        status: "ended",
        sides,
        combatants,
        replacementPendingSideIds: [],
        ...(Object.prototype.hasOwnProperty.call(state, "koInterventionPending") ? { koInterventionPending: null } : {}),
        effects,
      },
      outcome: surviving.length === 1 ? { kind: "win", winnerSideId: surviving[0].sideId } : { kind: "draw" },
    };
  }
  const replacementPendingSideIds = sides
    .filter((side) =>
      side.activeCombatantIds.length < side.activeCapacity &&
      side.combatantIds.some((combatantId) => (ownGet(state.combatants, combatantId)?.currentHp ?? 0) > 0 && !side.activeCombatantIds.includes(combatantId)),
    )
    .map((side) => side.sideId);
  return {
    state: {
      ...state,
      sides,
      replacementPendingSideIds,
      ...(Object.prototype.hasOwnProperty.call(state, "koInterventionPending") ? { koInterventionPending: null } : {}),
    },
  };
}

export function evaluateBattleLifecycle(state: BattleState): {
  state: BattleState;
  outcome?: BattleOutcome;
} {
  return evaluateBattleLifecycleInternal(state, true);
}

export function evaluateBattleLifecycleAfterKoInterventionDecline(state: BattleState): {
  state: BattleState;
  outcome?: BattleOutcome;
} {
  return evaluateBattleLifecycleInternal(state, false);
}
