import type {
  AbilityId,
  BattleId,
  BattleCombatantState,
  BattleSideId,
  BattleState,
  CadenceParticipant,
  CadenceParticipantKey,
  CadenceCarryState,
  CadenceConsequence,
  CombatEvent,
  CombatStimulus,
  CombatantId,
  DeterministicState,
  DeterministicRngState,
  GameDataVersion,
  MoveId,
  NonPlayerCadenceIdentity,
  PokemonInstanceId,
  ResolvedCombatContext,
  RulesVersion,
  SpeciesId,
  StatBlock,
  TypeId,
  UseMoveIntent,
} from "./types";
import type {
  EncounterDefinitionId,
  EncounterId,
  HuntDefinitionId,
  PlayerId,
  ZoneId,
} from "@pokenexus/game-types";
import { battleEffectKey, cadenceParticipantKey } from "./types";
import { compareInitiative, compareUtf8Bytes, drawUniformInteger } from "./combat-math";
import { createCadenceCarry, initializeBattle, resolveCombatStimulus } from "./battle";
import { advanceCadence } from "./effects";
import { evaluateBattleLifecycle } from "./lifecycle";
import { deriveStats, validateBattleCombatantInit } from "./validation";
import { validateRngState } from "./rng";
import { ownGet, safeRecordFromEntries, safeRecordWith } from "./record-utils";

export interface SoloHuntTeamMemberSnapshot {
  readonly pokemonInstanceId: PokemonInstanceId;
  readonly speciesId: SpeciesId;
  readonly level: number;
  readonly baseStats: StatBlock<number>;
  readonly ivs: StatBlock<number>;
  readonly types: ReadonlyArray<TypeId>;
  readonly moveLoadout: ReadonlyArray<MoveId>;
  readonly abilityId?: AbilityId;
}

export type FreshSoloHuntCadenceResult =
  | {
      readonly accepted: true;
      readonly cadence: CadenceCarryState;
      readonly policy: SoloHuntMovePolicyState;
    }
  | {
      readonly accepted: false;
      readonly reason: string;
    };

export interface SoloHuntEncounterOption {
  readonly encounterDefinitionId: EncounterDefinitionId;
  readonly speciesId: SpeciesId;
  readonly weight: number;
  readonly levelBand: {
    readonly min: number;
    readonly max: number;
  };
  readonly rewardEnvelope: unknown;
}

export interface SoloHuntEncounterSelection extends SoloHuntEncounterOption {
  readonly level: number;
}

export type SoloHuntEncounterSelectionResult =
  | {
      readonly accepted: true;
      readonly selection: SoloHuntEncounterSelection;
      readonly rng: DeterministicRngState;
    }
  | {
      readonly accepted: false;
      readonly reason: string;
      readonly rng: DeterministicRngState;
    };

export interface SoloHuntOpponentTemplate {
  readonly encounterDefinitionId: EncounterDefinitionId;
  readonly speciesId: SpeciesId;
  readonly level: number;
  readonly gameDataVersion: GameDataVersion;
  readonly rulesVersion: RulesVersion;
  readonly baseStats: StatBlock<number>;
  readonly ivs: StatBlock<number>;
  readonly types: ReadonlyArray<TypeId>;
  readonly moveLoadout: ReadonlyArray<MoveId>;
  readonly abilityId?: AbilityId;
}

export type SoloHuntOpponentCatalogValidation =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly reason: string };

export interface SoloHuntEncounterBattleInitInput {
  readonly huntRunIdentity: string;
  readonly encounterOrdinal: number;
  readonly team: ReadonlyArray<SoloHuntTeamMemberSnapshot>;
  readonly cadence: CadenceCarryState;
  readonly policy: SoloHuntMovePolicyState;
  readonly selection: SoloHuntEncounterSelection;
  readonly opponentTemplates: ReadonlyArray<SoloHuntOpponentTemplate>;
  readonly context: ResolvedCombatContext;
  readonly deterministicState: DeterministicState;
}

export type SoloHuntEncounterBattleInitResult =
  | {
      readonly accepted: true;
      readonly state: BattleState;
      readonly deterministicState: DeterministicState;
      readonly policy: SoloHuntMovePolicyState;
      readonly events: ReadonlyArray<CombatEvent>;
      readonly playerSideId: BattleSideId;
      readonly opponentSideId: BattleSideId;
    }
  | {
      readonly accepted: false;
      readonly reason: string;
      readonly deterministicState: DeterministicState;
      readonly policy: SoloHuntMovePolicyState;
      readonly events: readonly [];
    };

export type SoloHuntForcedReplacementResult =
  | {
      readonly accepted: true;
      readonly state: BattleState;
      readonly deterministicState: DeterministicState;
      readonly events: ReadonlyArray<CombatEvent>;
    }
  | {
      readonly accepted: false;
      readonly reason: string;
      readonly state: BattleState;
      readonly deterministicState: DeterministicState;
      readonly events: readonly [];
    };

export type SoloHuntPrunedCadenceResult =
  | {
      readonly accepted: true;
      readonly cadence: CadenceCarryState;
      readonly policy: SoloHuntMovePolicyState;
    }
  | {
      readonly accepted: false;
      readonly reason: string;
    };

export interface SoloHuntTimedCadenceConsequence {
  readonly atOffsetMs: number;
  readonly consequence: CadenceConsequence;
}

export type SoloHuntInterBattleCadenceResult =
  | {
      readonly accepted: true;
      readonly cadence: CadenceCarryState;
      readonly deterministicState: DeterministicState;
      readonly elapsedMs: number;
      readonly noLivingPlayer: boolean;
      readonly consequences: ReadonlyArray<SoloHuntTimedCadenceConsequence>;
    }
  | {
      readonly accepted: false;
      readonly reason: string;
      readonly cadence: CadenceCarryState;
      readonly deterministicState: DeterministicState;
      readonly elapsedMs: number;
      readonly noLivingPlayer: boolean;
      readonly consequences: ReadonlyArray<SoloHuntTimedCadenceConsequence>;
    };

export interface SoloHuntRuntimeInputs {
  readonly playerId: PlayerId;
  readonly zoneId: ZoneId;
  readonly huntDefinitionId: HuntDefinitionId;
  readonly contentVersion: string;
  readonly contentHash: string;
  readonly context: ResolvedCombatContext;
  readonly team: ReadonlyArray<SoloHuntTeamMemberSnapshot>;
  readonly encounterOptions: ReadonlyArray<SoloHuntEncounterOption>;
  readonly opponentTemplates: ReadonlyArray<SoloHuntOpponentTemplate>;
  readonly interBattleGapMs: number;
}

export interface SoloHuntPendingEncounterSelection {
  readonly pendingSelectionIdentity: string;
  readonly playerId: PlayerId;
  readonly zoneId: ZoneId;
  readonly huntDefinitionId: HuntDefinitionId;
  readonly contentVersion: string;
  readonly contentHash: string;
  readonly gameDataVersion: GameDataVersion;
  readonly rulesVersion: RulesVersion;
  readonly encounterDefinitionId: EncounterDefinitionId;
  readonly speciesId: SpeciesId;
  readonly level: number;
  readonly policyRngBeforeSelection: DeterministicRngState;
  readonly policyRngAfterSelection: DeterministicRngState;
}

export interface SoloHuntCompletedEncounterEvidence {
  readonly rewardSourceIdentity: string;
  readonly huntRunIdentity: string;
  readonly encounterId: EncounterId;
  readonly encounterOrdinal: number;
  readonly pendingSelectionIdentity: string;
  readonly encounterDefinitionId: EncounterDefinitionId;
  readonly speciesId: SpeciesId;
  readonly level: number;
  readonly completionKind: "defeat";
  readonly participantPokemonInstanceIds: ReadonlyArray<PokemonInstanceId>;
  readonly rewardEnvelope: unknown;
  readonly contentVersion: string;
  readonly contentHash: string;
  readonly gameDataVersion: GameDataVersion;
  readonly rulesVersion: RulesVersion;
  readonly completedAtHuntTimeMs: number;
}

export type SoloHuntSelectionStreamOrigin =
  | {
      readonly kind: "rng";
      readonly policyRng: DeterministicRngState;
    }
  | {
      readonly kind: "pending";
      readonly pendingEncounterSelection: SoloHuntPendingEncounterSelection;
    };

export interface SoloHuntParticipantActivationProvenance {
  readonly pokemonInstanceId: PokemonInstanceId;
  readonly combatantId: CombatantId;
  readonly activationKind: "initial" | "forcedReplacement";
  readonly combatTimeMs: number;
  readonly eventSequence: number;
}

export interface SoloHuntCompletedEncounterProvenance {
  readonly encounterId: EncounterId;
  readonly encounterOrdinal: number;
  readonly consumedPendingEncounterSelection: SoloHuntPendingEncounterSelection;
  readonly participantActivations: ReadonlyArray<SoloHuntParticipantActivationProvenance>;
  readonly battleStimuli: ReadonlyArray<CombatStimulus>;
  readonly battleStartedAtHuntTimeMs: number;
  readonly completedAtHuntTimeMs: number;
  readonly terminalBattleTimeMs: number;
  readonly terminalEventSequence: number;
}

export interface SoloHuntPendingCaptureDecision {
  readonly encounterId: EncounterId;
  readonly encounterDefinitionId: EncounterDefinitionId;
  readonly speciesId: SpeciesId;
  readonly level: number;
  readonly contentVersion: string;
  readonly contentHash: string;
  readonly gameDataVersion: GameDataVersion;
  readonly rulesVersion: RulesVersion;
}

type SoloHuntBattleOutcome = Extract<CombatEvent, { kind: "BattleEnded" }>["outcome"];

export interface SoloHuntCurrentEncounterRuntime {
  readonly encounterId: EncounterId;
  readonly encounterOrdinal: number;
  readonly pendingSelectionIdentity: string;
  readonly selection: SoloHuntEncounterSelection;
  readonly battleStartedAtHuntTimeMs: number;
  readonly battle: BattleState;
  readonly policy: SoloHuntMovePolicyState;
  readonly playerSideId: BattleSideId;
  readonly opponentSideId: BattleSideId;
  readonly participantPokemonInstanceIds: ReadonlyArray<PokemonInstanceId>;
  readonly participantActivations: ReadonlyArray<SoloHuntParticipantActivationProvenance>;
  readonly battleStimuli: ReadonlyArray<CombatStimulus>;
  readonly battleOutcome?: SoloHuntBattleOutcome;
}

export interface SoloHuntInterBattleRuntime {
  readonly cadence: CadenceCarryState;
  readonly policy: SoloHuntMovePolicyState;
  readonly remainingGapMs: number;
}

export type SoloHuntTerminalReason = "noLivingTeam" | "opponentVictory" | "draw";

export interface SoloHuntRuntimeState {
  readonly huntRunIdentity: string;
  readonly playerId: PlayerId;
  readonly zoneId: ZoneId;
  readonly huntDefinitionId: HuntDefinitionId;
  readonly contentVersion: string;
  readonly contentHash: string;
  readonly gameDataVersion: GameDataVersion;
  readonly rulesVersion: RulesVersion;
  readonly interBattleGapMs: number;
  readonly pinnedTeam: ReadonlyArray<SoloHuntTeamMemberSnapshot>;
  readonly logicalTimeMs: number;
  readonly nextEncounterOrdinal: number;
  readonly selectionStreamOrigin: SoloHuntSelectionStreamOrigin;
  readonly combatDeterministicOrigin: DeterministicState;
  readonly policyRng: DeterministicRngState;
  readonly combatDeterministicState: DeterministicState;
  readonly currentEncounter?: SoloHuntCurrentEncounterRuntime;
  readonly interBattle?: SoloHuntInterBattleRuntime;
  readonly pendingEncounterSelection?: SoloHuntPendingEncounterSelection;
  readonly completedEncounters: ReadonlyArray<SoloHuntCompletedEncounterEvidence>;
  readonly completedEncounterProvenance: ReadonlyArray<SoloHuntCompletedEncounterProvenance>;
  readonly pendingCaptureDecision?: SoloHuntPendingCaptureDecision;
  readonly status: "active" | "terminal";
  readonly terminalReason?: SoloHuntTerminalReason;
}

export type SoloHuntSimulationEvent =
  | {
      readonly kind: "combat";
      readonly encounterId: EncounterId;
      readonly huntTimeMs: number;
      readonly event: CombatEvent;
    }
  | {
      readonly kind: "cadence";
      readonly huntTimeMs: number;
      readonly consequence: CadenceConsequence;
    }
  | {
      readonly kind: "encounterCompleted";
      readonly huntTimeMs: number;
      readonly evidence: SoloHuntCompletedEncounterEvidence;
    }
  | {
      readonly kind: "huntTerminal";
      readonly huntTimeMs: number;
      readonly reason: SoloHuntTerminalReason;
    };

export interface CreateSoloHuntRuntimeInput {
  readonly huntRunIdentity: string;
  readonly inputs: SoloHuntRuntimeInputs;
  readonly policyRng: DeterministicRngState;
  readonly combatDeterministicState: DeterministicState;
  readonly pendingEncounterSelection?: SoloHuntPendingEncounterSelection;
}

export type CreateSoloHuntRuntimeResult =
  | {
      readonly accepted: true;
      readonly state: SoloHuntRuntimeState;
      readonly events: ReadonlyArray<SoloHuntSimulationEvent>;
    }
  | {
      readonly accepted: false;
      readonly reason: string;
      readonly events: readonly [];
    };

export type AdvanceSoloHuntResult =
  | {
      readonly accepted: true;
      readonly state: SoloHuntRuntimeState;
      readonly stopReason: "cutoff" | SoloHuntTerminalReason;
      readonly events: ReadonlyArray<SoloHuntSimulationEvent>;
    }
  | {
      readonly accepted: false;
      readonly reason: string;
      readonly state: SoloHuntRuntimeState;
      readonly events: readonly [];
    };

const SOLO_HUNT_LEVEL_MAX = 200;
const UINT32_SELECTION_DOMAIN_MAX = 0xffffffff;

function validateSoloHuntEncounterOptions(
  options: ReadonlyArray<SoloHuntEncounterOption>,
): { readonly accepted: true; readonly totalWeight: number } | { readonly accepted: false; readonly reason: string } {
  if (options.length === 0) {
    return { accepted: false, reason: "Solo Hunt encounter selection requires at least one option" };
  }
  const seenIds = new Set<string>();
  let totalWeight = 0;
  for (const option of options) {
    if (
      typeof option.encounterDefinitionId !== "string"
      || option.encounterDefinitionId.length === 0
      || typeof option.speciesId !== "string"
      || option.speciesId.length === 0
    ) {
      return { accepted: false, reason: "Solo Hunt encounter option identities must be non-empty" };
    }
    if (seenIds.has(option.encounterDefinitionId)) {
      return {
        accepted: false,
        reason: `duplicate Solo Hunt EncounterDefinitionId: ${option.encounterDefinitionId}`,
      };
    }
    seenIds.add(option.encounterDefinitionId);
    if (!Number.isSafeInteger(option.weight) || option.weight <= 0) {
      return { accepted: false, reason: "Solo Hunt encounter weights must be positive safe integers" };
    }
    if (
      !Number.isSafeInteger(option.levelBand.min)
      || !Number.isSafeInteger(option.levelBand.max)
      || option.levelBand.min < 1
      || option.levelBand.max > SOLO_HUNT_LEVEL_MAX
      || option.levelBand.min > option.levelBand.max
    ) {
      return { accepted: false, reason: "Solo Hunt encounter level band is invalid" };
    }
    totalWeight += option.weight;
    if (!Number.isSafeInteger(totalWeight) || totalWeight > UINT32_SELECTION_DOMAIN_MAX) {
      return { accepted: false, reason: "Solo Hunt total encounter weight exceeds RNG domain" };
    }
  }
  return { accepted: true, totalWeight };
}

function opponentTemplateKey(encounterDefinitionId: EncounterDefinitionId, level: number): string {
  return JSON.stringify([encounterDefinitionId, level]);
}

export function validateSoloHuntOpponentCatalog(
  options: ReadonlyArray<SoloHuntEncounterOption>,
  templates: ReadonlyArray<SoloHuntOpponentTemplate>,
  context: ResolvedCombatContext,
): SoloHuntOpponentCatalogValidation {
  const optionsValidation = validateSoloHuntEncounterOptions(options);
  if (!optionsValidation.accepted) return optionsValidation;

  const optionById = new Map(options.map((option) => [option.encounterDefinitionId, option]));
  const expectedKeys = new Set<string>();
  for (const option of options) {
    for (let level = option.levelBand.min; level <= option.levelBand.max; level += 1) {
      expectedKeys.add(opponentTemplateKey(option.encounterDefinitionId, level));
    }
  }

  const seenKeys = new Set<string>();
  for (const template of templates) {
    const key = opponentTemplateKey(template.encounterDefinitionId, template.level);
    if (seenKeys.has(key)) {
      return { accepted: false, reason: `duplicate Solo Hunt opponent template: ${key}` };
    }
    seenKeys.add(key);
    if (!expectedKeys.has(key)) {
      return { accepted: false, reason: `unexpected Solo Hunt opponent template: ${key}` };
    }
    const option = optionById.get(template.encounterDefinitionId);
    if (!option || option.speciesId !== template.speciesId) {
      return { accepted: false, reason: `Solo Hunt opponent template Species mismatch: ${key}` };
    }
    if (
      template.gameDataVersion !== context.gameDataVersion
      || template.rulesVersion !== context.rulesVersion
    ) {
      return { accepted: false, reason: `Solo Hunt opponent template combat context mismatch: ${key}` };
    }
    const derived = deriveStats(template.baseStats, template.ivs, template.level);
    if (!derived) {
      return { accepted: false, reason: `Solo Hunt opponent template derived stats invalid: ${key}` };
    }
    const combatantError = validateBattleCombatantInit(
      {
        combatantId: `solo-hunt-preflight:${key}` as CombatantId,
        speciesId: template.speciesId,
        level: template.level,
        baseStats: template.baseStats,
        ivs: template.ivs,
        types: template.types,
        startingHp: derived.hp,
        moveLoadout: template.moveLoadout,
        initialNextActionRemainingMs: 0,
        initialMoveCooldownRemainingMs: safeRecordFromEntries(
          template.moveLoadout.map((moveId) => [moveId, 0] as const),
        ),
        ...(template.abilityId ? { abilityId: template.abilityId } : {}),
      },
      context,
    );
    if (combatantError) {
      return { accepted: false, reason: `invalid Solo Hunt opponent template ${key}: ${combatantError}` };
    }
  }

  if (seenKeys.size !== expectedKeys.size) {
    const missing = [...expectedKeys].filter((key) => !seenKeys.has(key)).sort(compareUtf8Bytes)[0];
    return { accepted: false, reason: `missing Solo Hunt opponent template: ${missing}` };
  }
  return { accepted: true };
}

function sameStringSet(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function encounterBattleId(huntRunIdentity: string, encounterOrdinal: number): BattleId {
  return JSON.stringify(["soloHuntBattle", huntRunIdentity, encounterOrdinal]) as BattleId;
}

function playerCombatantId(
  huntRunIdentity: string,
  encounterOrdinal: number,
  pokemonInstanceId: PokemonInstanceId,
): CombatantId {
  return JSON.stringify([
    "soloHuntPlayer",
    huntRunIdentity,
    encounterOrdinal,
    pokemonInstanceId,
  ]) as CombatantId;
}

function opponentCombatantId(huntRunIdentity: string, encounterOrdinal: number): CombatantId {
  return JSON.stringify(["soloHuntOpponent", huntRunIdentity, encounterOrdinal]) as CombatantId;
}

function opponentCadenceIdentity(
  huntRunIdentity: string,
  encounterOrdinal: number,
): NonPlayerCadenceIdentity {
  return JSON.stringify(["soloHuntOpponent", huntRunIdentity, encounterOrdinal]) as NonPlayerCadenceIdentity;
}

const SOLO_HUNT_PLAYER_SIDE_ID = "solo-hunt:player" as BattleSideId;
const SOLO_HUNT_OPPONENT_SIDE_ID = "solo-hunt:opponent" as BattleSideId;

export function initializeSoloHuntEncounterBattle(
  input: SoloHuntEncounterBattleInitInput,
): SoloHuntEncounterBattleInitResult {
  const reject = (reason: string): SoloHuntEncounterBattleInitResult => ({
    accepted: false,
    reason,
    deterministicState: input.deterministicState,
    policy: input.policy,
    events: [],
  });
  if (typeof input.huntRunIdentity !== "string" || input.huntRunIdentity.length === 0) {
    return reject("Solo Hunt run identity is required");
  }
  if (!Number.isSafeInteger(input.encounterOrdinal) || input.encounterOrdinal < 1) {
    return reject("Solo Hunt encounter ordinal must be a positive safe integer");
  }

  const templateKey = opponentTemplateKey(
    input.selection.encounterDefinitionId,
    input.selection.level,
  );
  const matchingTemplates = input.opponentTemplates.filter((template) =>
    opponentTemplateKey(template.encounterDefinitionId, template.level) === templateKey,
  );
  if (matchingTemplates.length !== 1) {
    return reject(`Solo Hunt opponent template must resolve exactly once: ${templateKey}`);
  }
  const template = matchingTemplates[0];
  if (
    template.speciesId !== input.selection.speciesId
    || template.gameDataVersion !== input.context.gameDataVersion
    || template.rulesVersion !== input.context.rulesVersion
  ) {
    return reject(`Solo Hunt opponent template does not match selected encounter/context: ${templateKey}`);
  }

  const playerKeys = input.team.map((member) => cadenceParticipantKey({
    kind: "pokemonInstance",
    identity: member.pokemonInstanceId,
  }));
  if (
    !sameStringSet(Object.keys(input.cadence.hpByParticipant), playerKeys)
    || !sameStringSet(Object.keys(input.cadence.maxHpByParticipant), playerKeys)
    || !sameStringSet(Object.keys(input.cadence.readinessByParticipant), playerKeys)
    || !sameStringSet(Object.keys(input.cadence.actionLockRemainingMsByParticipant), playerKeys)
    || !sameStringSet(Object.keys(input.policy.nextMoveSlotByParticipant), playerKeys)
  ) {
    return reject("Solo Hunt continuing player cadence/policy keys must exactly match the pinned Team");
  }

  const activeMember = input.team.find((member) => {
    const key = cadenceParticipantKey({ kind: "pokemonInstance", identity: member.pokemonInstanceId });
    return (ownGet(input.cadence.hpByParticipant, key) ?? 0) > 0;
  });
  if (!activeMember) return reject("Solo Hunt has no living pinned Team member for the next Battle");

  const opponentDerived = deriveStats(template.baseStats, template.ivs, template.level);
  if (!opponentDerived) return reject(`Solo Hunt opponent template derived stats invalid: ${templateKey}`);
  const opponentParticipant = {
    kind: "nonPlayer" as const,
    identity: opponentCadenceIdentity(input.huntRunIdentity, input.encounterOrdinal),
  };
  const opponentKey = cadenceParticipantKey(opponentParticipant);
  const opponentReadiness = {
    participant: opponentParticipant,
    moveLoadout: [...template.moveLoadout],
    nextActionRemainingMs: 0,
    moveCooldownRemainingMs: safeRecordFromEntries(
      template.moveLoadout.map((moveId) => [moveId, 0] as const),
    ),
  };
  const cadence: CadenceCarryState = {
    effects: [...input.cadence.effects],
    hpByParticipant: safeRecordWith(input.cadence.hpByParticipant, opponentKey, opponentDerived.hp),
    maxHpByParticipant: safeRecordWith(input.cadence.maxHpByParticipant, opponentKey, opponentDerived.hp),
    readinessByParticipant: safeRecordWith(
      input.cadence.readinessByParticipant,
      opponentKey,
      opponentReadiness,
    ),
    actionLockRemainingMsByParticipant: safeRecordWith(
      input.cadence.actionLockRemainingMsByParticipant,
      opponentKey,
      0,
    ),
  };
  const policy: SoloHuntMovePolicyState = {
    nextMoveSlotByParticipant: safeRecordWith(
      input.policy.nextMoveSlotByParticipant,
      opponentKey,
      1,
    ),
  };

  const playerCombatants = input.team.map((member) => {
    const participant = { kind: "pokemonInstance" as const, identity: member.pokemonInstanceId };
    const key = cadenceParticipantKey(participant);
    const readiness = ownGet(cadence.readinessByParticipant, key)!;
    return {
      combatantId: playerCombatantId(
        input.huntRunIdentity,
        input.encounterOrdinal,
        member.pokemonInstanceId,
      ),
      speciesId: member.speciesId,
      level: member.level,
      baseStats: member.baseStats,
      ivs: member.ivs,
      types: member.types,
      startingHp: ownGet(cadence.hpByParticipant, key)!,
      moveLoadout: member.moveLoadout,
      initialNextActionRemainingMs: readiness.nextActionRemainingMs,
      initialMoveCooldownRemainingMs: readiness.moveCooldownRemainingMs,
      ...(member.abilityId ? { abilityId: member.abilityId } : {}),
      cadenceParticipant: participant,
    };
  });
  const opponentId = opponentCombatantId(input.huntRunIdentity, input.encounterOrdinal);
  const opponentCombatant = {
    combatantId: opponentId,
    speciesId: template.speciesId,
    level: template.level,
    baseStats: template.baseStats,
    ivs: template.ivs,
    types: template.types,
    startingHp: opponentDerived.hp,
    moveLoadout: template.moveLoadout,
    initialNextActionRemainingMs: 0,
    initialMoveCooldownRemainingMs: opponentReadiness.moveCooldownRemainingMs,
    ...(template.abilityId ? { abilityId: template.abilityId } : {}),
    cadenceParticipant: opponentParticipant,
  };
  const activePlayerId = playerCombatantId(
    input.huntRunIdentity,
    input.encounterOrdinal,
    activeMember.pokemonInstanceId,
  );
  const cadenceBindings = safeRecordFromEntries([
    ...playerCombatants.map((combatant) => [
      cadenceParticipantKey(combatant.cadenceParticipant),
      combatant.combatantId,
    ] as const),
    [opponentKey, opponentId] as const,
  ]);
  const battle = initializeBattle({
    battleId: encounterBattleId(input.huntRunIdentity, input.encounterOrdinal),
    context: input.context,
    sides: [
      {
        sideId: SOLO_HUNT_PLAYER_SIDE_ID,
        activeCapacity: 1,
        combatantIds: playerCombatants.map((combatant) => combatant.combatantId),
        initialActiveCombatantIds: [activePlayerId],
      },
      {
        sideId: SOLO_HUNT_OPPONENT_SIDE_ID,
        activeCapacity: 1,
        combatantIds: [opponentId],
        initialActiveCombatantIds: [opponentId],
      },
    ],
    combatants: [...playerCombatants, opponentCombatant],
    deterministicState: input.deterministicState,
    cadenceBindings,
    cadenceCarry: cadence,
  });
  if (!battle.accepted) return reject(battle.reason);
  return {
    accepted: true,
    state: battle.state,
    deterministicState: battle.deterministicState,
    policy,
    events: battle.events,
    playerSideId: SOLO_HUNT_PLAYER_SIDE_ID,
    opponentSideId: SOLO_HUNT_OPPONENT_SIDE_ID,
  };
}

export function resolveSoloHuntForcedReplacement(
  state: BattleState,
  deterministicState: DeterministicState,
  team: ReadonlyArray<SoloHuntTeamMemberSnapshot>,
  playerSideId: BattleSideId,
): SoloHuntForcedReplacementResult {
  const reject = (reason: string): SoloHuntForcedReplacementResult => ({
    accepted: false,
    reason,
    state,
    deterministicState,
    events: [],
  });
  if (state.status !== "active") return reject("Battle is not active");
  if (state.replacementPendingSideIds.length === 0) {
    return { accepted: true, state, deterministicState, events: [] };
  }
  if (
    state.replacementPendingSideIds.length !== 1
    || state.replacementPendingSideIds[0] !== playerSideId
  ) {
    return reject("Solo Hunt encountered unsupported non-player or ambiguous forced replacement");
  }
  const side = state.sides.find((candidate) => candidate.sideId === playerSideId);
  if (!side) return reject("Solo Hunt player side is missing");

  let replacementId: CombatantId | undefined;
  for (const member of team) {
    const candidate = side.combatantIds
      .map((combatantId) => ownGet(state.combatants, combatantId))
      .find((combatant) =>
        combatant?.cadenceParticipant?.kind === "pokemonInstance"
        && combatant.cadenceParticipant.identity === member.pokemonInstanceId,
      );
    if (
      candidate
      && candidate.currentHp > 0
      && !side.activeCombatantIds.includes(candidate.combatantId)
    ) {
      replacementId = candidate.combatantId;
      break;
    }
  }
  if (!replacementId) return reject("Solo Hunt forced replacement has no living eligible pinned reserve");

  const result = resolveCombatStimulus(
    state,
    { kind: "forcedReplacement", sideId: playerSideId, combatantId: replacementId },
    deterministicState,
  );
  if (!result.accepted) return reject(result.reason);
  return {
    accepted: true,
    state: result.state,
    deterministicState: result.deterministicState,
    events: result.events,
  };
}

export function pruneSoloHuntEndedOpponentCadence(
  state: BattleState,
  policy: SoloHuntMovePolicyState,
  team: ReadonlyArray<SoloHuntTeamMemberSnapshot>,
): SoloHuntPrunedCadenceResult {
  if (state.status !== "ended") {
    return { accepted: false, reason: "Solo Hunt cadence can be pruned only after Battle end" };
  }
  const carry = createCadenceCarry(state);
  const playerKeys = team.map((member) => cadenceParticipantKey({
    kind: "pokemonInstance",
    identity: member.pokemonInstanceId,
  }));
  const playerKeySet = new Set<string>(playerKeys);
  if (playerKeys.some((key) =>
    ownGet(carry.hpByParticipant, key) === undefined
    || ownGet(carry.maxHpByParticipant, key) === undefined
    || ownGet(carry.readinessByParticipant, key) === undefined
    || ownGet(carry.actionLockRemainingMsByParticipant, key) === undefined,
  )) {
    return { accepted: false, reason: "ended Battle cadence is missing a pinned Team participant" };
  }
  if (playerKeys.some((key) => ownGet(policy.nextMoveSlotByParticipant, key) === undefined)) {
    return { accepted: false, reason: "ended Battle policy is missing a pinned Team cursor" };
  }

  const keepEntries = <T>(record: Readonly<Record<string, T>>) => safeRecordFromEntries(
    Object.entries(record).filter(([key]) => playerKeySet.has(key)),
  );
  return {
    accepted: true,
    cadence: {
      effects: carry.effects.filter((effect) =>
        playerKeySet.has(cadenceParticipantKey(effect.targetCadenceParticipant)),
      ),
      hpByParticipant: keepEntries(carry.hpByParticipant),
      maxHpByParticipant: keepEntries(carry.maxHpByParticipant),
      readinessByParticipant: keepEntries(carry.readinessByParticipant),
      actionLockRemainingMsByParticipant: keepEntries(carry.actionLockRemainingMsByParticipant),
    },
    policy: {
      nextMoveSlotByParticipant: keepEntries(policy.nextMoveSlotByParticipant),
    },
  };
}

function nextCadenceEffectBoundaryMs(cadence: CadenceCarryState): number | undefined {
  const boundaries = cadence.effects.flatMap((effect) => [
    effect.remainingDurationMs,
    ...(effect.remainingToNextTickMs === undefined ? [] : [effect.remainingToNextTickMs]),
  ]).filter((value) => Number.isSafeInteger(value) && value > 0);
  return boundaries.length > 0 ? Math.min(...boundaries) : undefined;
}

function cadenceHasLivingPlayer(cadence: CadenceCarryState): boolean {
  return Object.entries(cadence.readinessByParticipant).some(([key, readiness]) =>
    readiness.participant.kind === "pokemonInstance"
    && (ownGet(cadence.hpByParticipant, key as CadenceParticipantKey) ?? 0) > 0,
  );
}

export function advanceSoloHuntInterBattleCadence(
  cadence: CadenceCarryState,
  context: ResolvedCombatContext,
  deterministicState: DeterministicState,
  interBattleGapMs: number,
): SoloHuntInterBattleCadenceResult {
  const reject = (
    reason: string,
    currentCadence = cadence,
    currentDeterministicState = deterministicState,
    elapsedMs = 0,
    consequences: ReadonlyArray<SoloHuntTimedCadenceConsequence> = [],
  ): SoloHuntInterBattleCadenceResult => ({
    accepted: false,
    reason,
    cadence: currentCadence,
    deterministicState: currentDeterministicState,
    elapsedMs,
    noLivingPlayer: !cadenceHasLivingPlayer(currentCadence),
    consequences,
  });
  if (!Number.isSafeInteger(interBattleGapMs) || interBattleGapMs < 0) {
    return reject("interBattleGapMs must be a non-negative safe integer");
  }
  if (Object.values(cadence.readinessByParticipant).some((entry) => entry.participant.kind !== "pokemonInstance")) {
    return reject("ended opponent cadence must be pruned before inter-Battle advancement");
  }

  let currentCadence = cadence;
  let currentDeterministicState = deterministicState;
  let elapsedMs = 0;
  let remainingMs = interBattleGapMs;
  const timedConsequences: SoloHuntTimedCadenceConsequence[] = [];

  if (!cadenceHasLivingPlayer(currentCadence)) {
    return {
      accepted: true,
      cadence: currentCadence,
      deterministicState: currentDeterministicState,
      elapsedMs,
      noLivingPlayer: true,
      consequences: timedConsequences,
    };
  }

  if (remainingMs === 0) {
    const validation = advanceCadence(currentCadence, context, currentDeterministicState, 0);
    if (!validation.accepted) return reject(validation.reason);
    return {
      accepted: true,
      cadence: validation.cadence,
      deterministicState: validation.deterministicState,
      elapsedMs: 0,
      noLivingPlayer: !cadenceHasLivingPlayer(validation.cadence),
      consequences: [],
    };
  }

  while (remainingMs > 0) {
    const nextEffectBoundaryMs = nextCadenceEffectBoundaryMs(currentCadence);
    const stepMs = Math.min(remainingMs, nextEffectBoundaryMs ?? remainingMs);
    const advanced = advanceCadence(
      currentCadence,
      context,
      currentDeterministicState,
      stepMs,
    );
    if (!advanced.accepted) {
      return reject(
        advanced.reason,
        currentCadence,
        currentDeterministicState,
        elapsedMs,
        timedConsequences,
      );
    }
    elapsedMs += stepMs;
    remainingMs -= stepMs;
    currentCadence = advanced.cadence;
    currentDeterministicState = advanced.deterministicState;
    timedConsequences.push(...advanced.consequences.map((consequence) => ({
      atOffsetMs: elapsedMs,
      consequence,
    })));
    if (!cadenceHasLivingPlayer(currentCadence)) {
      return {
        accepted: true,
        cadence: currentCadence,
        deterministicState: currentDeterministicState,
        elapsedMs,
        noLivingPlayer: true,
        consequences: timedConsequences,
      };
    }
  }

  return {
    accepted: true,
    cadence: currentCadence,
    deterministicState: currentDeterministicState,
    elapsedMs,
    noLivingPlayer: false,
    consequences: timedConsequences,
  };
}

export function selectSoloHuntEncounter(
  options: ReadonlyArray<SoloHuntEncounterOption>,
  rng: DeterministicRngState,
): SoloHuntEncounterSelectionResult {
  const rngError = validateRngState(rng);
  if (rngError) return { accepted: false, reason: rngError, rng };
  const optionsValidation = validateSoloHuntEncounterOptions(options);
  if (!optionsValidation.accepted) return { ...optionsValidation, rng };
  const totalWeight = optionsValidation.totalWeight;

  const definitionDraw = drawUniformInteger({ rng }, 1, totalWeight);
  let cumulativeWeight = 0;
  let selected: SoloHuntEncounterOption | undefined;
  for (const option of options) {
    cumulativeWeight += option.weight;
    if (definitionDraw.value <= cumulativeWeight) {
      selected = option;
      break;
    }
  }
  if (!selected) {
    return { accepted: false, reason: "Solo Hunt encounter selection did not resolve", rng };
  }

  let nextRng = definitionDraw.nextState.rng;
  let level = selected.levelBand.min;
  if (selected.levelBand.min !== selected.levelBand.max) {
    const levelDraw = drawUniformInteger(
      { rng: nextRng },
      selected.levelBand.min,
      selected.levelBand.max,
    );
    level = levelDraw.value;
    nextRng = levelDraw.nextState.rng;
  }

  return {
    accepted: true,
    selection: {
      ...selected,
      levelBand: { ...selected.levelBand },
      level,
    },
    rng: nextRng,
  };
}

function sameRng(left: DeterministicRngState, right: DeterministicRngState): boolean {
  return left.algorithm === right.algorithm && left.state === right.state;
}

function sameStatBlock(left: StatBlock<number>, right: StatBlock<number>): boolean {
  return left.hp === right.hp
    && left.atk === right.atk
    && left.def === right.def
    && left.spa === right.spa
    && left.spd === right.spd
    && left.spe === right.spe;
}

function sameOrderedStrings(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function samePinnedTeam(
  left: ReadonlyArray<SoloHuntTeamMemberSnapshot>,
  right: ReadonlyArray<SoloHuntTeamMemberSnapshot>,
): boolean {
  return left.length === right.length && left.every((member, index) => {
    const other = right[index];
    return other !== undefined
      && member.pokemonInstanceId === other.pokemonInstanceId
      && member.speciesId === other.speciesId
      && member.level === other.level
      && sameStatBlock(member.baseStats, other.baseStats)
      && sameStatBlock(member.ivs, other.ivs)
      && sameOrderedStrings(member.types, other.types)
      && sameOrderedStrings(member.moveLoadout, other.moveLoadout)
      && member.abilityId === other.abilityId;
  });
}

function validateRuntimeInputs(inputs: SoloHuntRuntimeInputs): string | undefined {
  if (
    typeof inputs.playerId !== "string"
    || inputs.playerId.length === 0
    || typeof inputs.zoneId !== "string"
    || inputs.zoneId.length === 0
    || typeof inputs.huntDefinitionId !== "string"
    || inputs.huntDefinitionId.length === 0
    || typeof inputs.contentVersion !== "string"
    || inputs.contentVersion.length === 0
    || typeof inputs.contentHash !== "string"
    || inputs.contentHash.length === 0
  ) {
    return "Solo Hunt pinned player/zone/hunt/content identities are required";
  }
  if (!Number.isSafeInteger(inputs.interBattleGapMs) || inputs.interBattleGapMs < 0) {
    return "interBattleGapMs must be a non-negative safe integer";
  }
  const optionsValidation = validateSoloHuntEncounterOptions(inputs.encounterOptions);
  if (!optionsValidation.accepted) return optionsValidation.reason;
  const catalogValidation = validateSoloHuntOpponentCatalog(
    inputs.encounterOptions,
    inputs.opponentTemplates,
    inputs.context,
  );
  if (!catalogValidation.accepted) return catalogValidation.reason;
  const fresh = createFreshSoloHuntCadence(inputs.team);
  if (!fresh.accepted) return fresh.reason;
  for (const member of inputs.team) {
    const derived = deriveStats(member.baseStats, member.ivs, member.level);
    if (!derived) return "invalid derived stats for pinned Team member: " + member.pokemonInstanceId;
    const error = validateBattleCombatantInit(
      {
        combatantId: ("solo-hunt-team-preflight:" + member.pokemonInstanceId) as CombatantId,
        speciesId: member.speciesId,
        level: member.level,
        baseStats: member.baseStats,
        ivs: member.ivs,
        types: member.types,
        startingHp: derived.hp,
        moveLoadout: member.moveLoadout,
        initialNextActionRemainingMs: 0,
        initialMoveCooldownRemainingMs: safeRecordFromEntries(
          member.moveLoadout.map((moveId) => [moveId, 0] as const),
        ),
        ...(member.abilityId ? { abilityId: member.abilityId } : {}),
      },
      inputs.context,
    );
    if (error) return "invalid pinned Team member " + member.pokemonInstanceId + ": " + error;
  }
  return undefined;
}

function validateRuntimeBinding(
  state: SoloHuntRuntimeState,
  inputs: SoloHuntRuntimeInputs,
): string | undefined {
  const inputError = validateRuntimeInputs(inputs);
  if (inputError) return inputError;
  if (
    state.playerId !== inputs.playerId
    || state.zoneId !== inputs.zoneId
    || state.huntDefinitionId !== inputs.huntDefinitionId
    || state.contentVersion !== inputs.contentVersion
    || state.contentHash !== inputs.contentHash
    || state.gameDataVersion !== inputs.context.gameDataVersion
    || state.rulesVersion !== inputs.context.rulesVersion
    || state.interBattleGapMs !== inputs.interBattleGapMs
    || !samePinnedTeam(state.pinnedTeam, inputs.team)
  ) {
    return "Solo Hunt advancement inputs do not match the pinned runtime binding";
  }
  return undefined;
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length
      && left.every((value, index) => structurallyEqual(value, right[index]));
  }
  if (
    left !== null
    && right !== null
    && typeof left === "object"
    && typeof right === "object"
    && !Array.isArray(left)
    && !Array.isArray(right)
  ) {
    const leftRecord = left as Readonly<Record<string, unknown>>;
    const rightRecord = right as Readonly<Record<string, unknown>>;
    const leftKeys = Object.keys(leftRecord).sort(compareUtf8Bytes);
    const rightKeys = Object.keys(rightRecord).sort(compareUtf8Bytes);
    return sameOrderedStrings(leftKeys, rightKeys)
      && leftKeys.every((key) => structurallyEqual(leftRecord[key], rightRecord[key]));
  }
  return false;
}

function sameEncounterSelection(
  left: SoloHuntEncounterSelection,
  right: SoloHuntEncounterSelection,
): boolean {
  return left.encounterDefinitionId === right.encounterDefinitionId
    && left.speciesId === right.speciesId
    && left.weight === right.weight
    && left.levelBand.min === right.levelBand.min
    && left.levelBand.max === right.levelBand.max
    && left.level === right.level
    && structurallyEqual(left.rewardEnvelope, right.rewardEnvelope);
}

function pendingSelectionIdentity(
  inputs: SoloHuntRuntimeInputs,
  policyRngBeforeSelection: DeterministicRngState,
  selection: SoloHuntEncounterSelection,
): string {
  return JSON.stringify([
    "soloHuntPendingSelection",
    inputs.playerId,
    inputs.zoneId,
    inputs.huntDefinitionId,
    inputs.contentVersion,
    inputs.contentHash,
    inputs.context.gameDataVersion,
    inputs.context.rulesVersion,
    policyRngBeforeSelection.algorithm,
    policyRngBeforeSelection.state,
    selection.encounterDefinitionId,
    selection.speciesId,
    selection.level,
  ]);
}

function soloHuntEncounterId(huntRunIdentity: string, encounterOrdinal: number): EncounterId {
  return JSON.stringify(["soloHuntEncounter", huntRunIdentity, encounterOrdinal]) as EncounterId;
}

function rewardSourceIdentity(huntRunIdentity: string, encounterOrdinal: number): string {
  return JSON.stringify(["soloHuntEncounterReward", huntRunIdentity, encounterOrdinal]);
}

function selectionMatchesPending(
  selection: SoloHuntEncounterSelection,
  pending: SoloHuntPendingEncounterSelection,
): boolean {
  return selection.encounterDefinitionId === pending.encounterDefinitionId
    && selection.speciesId === pending.speciesId
    && selection.level === pending.level;
}

function validatePendingSelection(
  inputs: SoloHuntRuntimeInputs,
  pending: SoloHuntPendingEncounterSelection,
): { readonly accepted: true; readonly selection: SoloHuntEncounterSelection }
  | { readonly accepted: false; readonly reason: string } {
  if (
    pending.playerId !== inputs.playerId
    || pending.zoneId !== inputs.zoneId
    || pending.huntDefinitionId !== inputs.huntDefinitionId
    || pending.contentVersion !== inputs.contentVersion
    || pending.contentHash !== inputs.contentHash
    || pending.gameDataVersion !== inputs.context.gameDataVersion
    || pending.rulesVersion !== inputs.context.rulesVersion
  ) {
    return { accepted: false, reason: "PendingEncounterSelection exact context does not match the requested Hunt" };
  }
  const beforeError = validateRngState(pending.policyRngBeforeSelection);
  const afterError = validateRngState(pending.policyRngAfterSelection);
  if (beforeError || afterError) {
    return { accepted: false, reason: beforeError ?? afterError ?? "invalid PendingEncounterSelection RNG" };
  }
  const replay = selectSoloHuntEncounter(inputs.encounterOptions, pending.policyRngBeforeSelection);
  if (
    !replay.accepted
    || !selectionMatchesPending(replay.selection, pending)
    || !sameRng(replay.rng, pending.policyRngAfterSelection)
    || pending.pendingSelectionIdentity !== pendingSelectionIdentity(
      inputs,
      pending.policyRngBeforeSelection,
      replay.selection,
    )
  ) {
    return { accepted: false, reason: "PendingEncounterSelection provenance does not replay exactly" };
  }
  return { accepted: true, selection: replay.selection };
}

function sameCadenceParticipant(
  left: CadenceParticipant | undefined,
  right: CadenceParticipant | undefined,
): boolean {
  return left?.kind === right?.kind && left?.identity === right?.identity;
}

function validateRuntimeCombatant(
  combatant: BattleCombatantState | undefined,
  expected: SoloHuntTeamMemberSnapshot | SoloHuntOpponentTemplate,
  expectedCombatantId: CombatantId,
  expectedSideId: BattleSideId,
  expectedCadenceParticipant: CadenceParticipant,
): string | undefined {
  if (!combatant || combatant.combatantId !== expectedCombatantId) {
    return "Solo Hunt Battle is missing expected Combatant: " + expectedCombatantId;
  }
  const derived = deriveStats(expected.baseStats, expected.ivs, expected.level);
  if (!derived) return "Solo Hunt expected Combatant stats are invalid: " + expectedCombatantId;
  if (
    combatant.sideId !== expectedSideId
    || combatant.speciesId !== expected.speciesId
    || combatant.level !== expected.level
    || !sameOrderedStrings(combatant.types, expected.types)
    || !sameOrderedStrings(combatant.moveLoadout, expected.moveLoadout)
    || combatant.abilityId !== expected.abilityId
    || combatant.maxHp !== derived.hp
    || !sameStatBlock(combatant.derivedStats, derived)
    || !sameCadenceParticipant(combatant.cadenceParticipant, expectedCadenceParticipant)
  ) {
    return "Solo Hunt Battle Combatant immutable facts drifted: " + expectedCombatantId;
  }
  if (
    !Number.isSafeInteger(combatant.currentHp)
    || combatant.currentHp < 0
    || combatant.currentHp > combatant.maxHp
    || !Number.isSafeInteger(combatant.nextActionAtMs)
    || combatant.nextActionAtMs < 0
    || !sameStringSet(Object.keys(combatant.moveReadyAtMs), expected.moveLoadout)
    || Object.values(combatant.moveReadyAtMs).some(
      (readyAtMs) => !Number.isSafeInteger(readyAtMs) || readyAtMs < 0,
    )
  ) {
    return "Solo Hunt Battle Combatant HP/readiness is invalid: " + expectedCombatantId;
  }
  if (
    Object.values(combatant.stages).some(
      (stage) => !Number.isSafeInteger(stage) || stage < -6 || stage > 6,
    )
  ) {
    return "Solo Hunt Battle Combatant stages are invalid: " + expectedCombatantId;
  }
  const locks = combatant.actionLockExpiresAtMsByScope ?? {};
  if (
    Object.keys(locks).some((scope) => scope !== "battle" && scope !== "cadence")
    || Object.values(locks).some(
      (expiresAtMs) => expiresAtMs !== undefined
        && (!Number.isSafeInteger(expiresAtMs) || expiresAtMs < 0),
    )
  ) {
    return "Solo Hunt Battle Combatant action lock is invalid: " + expectedCombatantId;
  }
  return undefined;
}

function validateBattleEffectsCheckpoint(battle: BattleState): string | undefined {
  const seenApplicationSequences = new Set<number>();
  let greatestApplicationSequence = 0;
  for (const [key, effect] of Object.entries(battle.effects)) {
    const target = ownGet(battle.combatants, effect.targetCombatantId);
    const rule = ownGet(battle.context.effectRules, effect.effectId);
    if (
      key !== battleEffectKey(effect.targetCombatantId, effect.effectId)
      || !target
      || !rule
      || effect.lifetimeScope !== rule.lifetimeScope
      || effect.stackingPolicy !== rule.stackingPolicy
      || !sameCadenceParticipant(effect.targetCadenceParticipant, target.cadenceParticipant)
    ) {
      return "Solo Hunt Battle effect binding is invalid: " + key;
    }
    if (
      !Number.isSafeInteger(effect.applicationSequence)
      || effect.applicationSequence < 1
      || seenApplicationSequences.has(effect.applicationSequence)
      || !Number.isSafeInteger(effect.scheduleRevision)
      || effect.scheduleRevision < 1
      || !Number.isSafeInteger(effect.appliedAtMs)
      || effect.appliedAtMs < 0
      || effect.appliedAtMs > battle.combatTimeMs
      || !Number.isSafeInteger(effect.expiresAtMs)
      || effect.expiresAtMs <= battle.combatTimeMs
      || (effect.nextTickAtMs !== undefined
        && (!Number.isSafeInteger(effect.nextTickAtMs)
          || effect.nextTickAtMs <= battle.combatTimeMs
          || effect.nextTickAtMs > effect.expiresAtMs))
      || (rule.periodic === undefined) !== (effect.nextTickAtMs === undefined)
      || !Number.isSafeInteger(effect.stacks)
      || effect.stacks < 1
      || (rule.stackingPolicy === "stack" && effect.stacks > (rule.maxStacks ?? 0))
      || (rule.stackingPolicy !== "stack" && effect.stacks !== 1)
    ) {
      return "Solo Hunt Battle effect timing/state is invalid: " + key;
    }
    seenApplicationSequences.add(effect.applicationSequence);
    greatestApplicationSequence = Math.max(greatestApplicationSequence, effect.applicationSequence);
  }
  if (
    !Number.isSafeInteger(battle.nextEffectApplicationSequence)
    || battle.nextEffectApplicationSequence < 1
    || battle.nextEffectApplicationSequence <= greatestApplicationSequence
  ) {
    return "Solo Hunt Battle next effect application sequence is invalid";
  }
  return undefined;
}

function validateCurrentEncounterBattleCheckpoint(
  state: SoloHuntRuntimeState,
  inputs: SoloHuntRuntimeInputs,
  encounter: SoloHuntCurrentEncounterRuntime,
): string | undefined {
  const battle = encounter.battle;
  if (
    encounter.playerSideId !== SOLO_HUNT_PLAYER_SIDE_ID
    || encounter.opponentSideId !== SOLO_HUNT_OPPONENT_SIDE_ID
    || battle.battleId !== encounterBattleId(state.huntRunIdentity, encounter.encounterOrdinal)
    || !structurallyEqual(battle.context, inputs.context)
    || !Number.isSafeInteger(battle.combatTimeMs)
    || battle.combatTimeMs < 0
    || !Number.isSafeInteger(battle.eventSequence)
    || battle.eventSequence < 1
  ) {
    return "Solo Hunt current Battle identity/context is inconsistent";
  }
  if (
    battle.sides.length !== 2
    || battle.sides[0]?.sideId !== SOLO_HUNT_PLAYER_SIDE_ID
    || battle.sides[1]?.sideId !== SOLO_HUNT_OPPONENT_SIDE_ID
  ) {
    return "Solo Hunt current Battle sides are inconsistent";
  }
  const playerSide = battle.sides[0]!;
  const opponentSide = battle.sides[1]!;
  const expectedPlayerIds = inputs.team.map((member) =>
    playerCombatantId(state.huntRunIdentity, encounter.encounterOrdinal, member.pokemonInstanceId),
  );
  const expectedOpponentId = opponentCombatantId(state.huntRunIdentity, encounter.encounterOrdinal);
  if (
    playerSide.activeCapacity !== 1
    || opponentSide.activeCapacity !== 1
    || !sameOrderedStrings(playerSide.combatantIds, expectedPlayerIds)
    || !sameOrderedStrings(opponentSide.combatantIds, [expectedOpponentId])
    || !sameStringSet(Object.keys(battle.combatants), [...expectedPlayerIds, expectedOpponentId])
  ) {
    return "Solo Hunt current Battle membership is inconsistent";
  }
  for (const member of inputs.team) {
    const combatantId = playerCombatantId(
      state.huntRunIdentity,
      encounter.encounterOrdinal,
      member.pokemonInstanceId,
    );
    const error = validateRuntimeCombatant(
      ownGet(battle.combatants, combatantId),
      member,
      combatantId,
      SOLO_HUNT_PLAYER_SIDE_ID,
      { kind: "pokemonInstance", identity: member.pokemonInstanceId },
    );
    if (error) return error;
  }
  const matchingTemplates = inputs.opponentTemplates.filter((template) =>
    template.encounterDefinitionId === encounter.selection.encounterDefinitionId
    && template.level === encounter.selection.level,
  );
  if (matchingTemplates.length !== 1) {
    return "Solo Hunt current Encounter opponent template does not resolve exactly once";
  }
  const opponentError = validateRuntimeCombatant(
    ownGet(battle.combatants, expectedOpponentId),
    matchingTemplates[0]!,
    expectedOpponentId,
    SOLO_HUNT_OPPONENT_SIDE_ID,
    {
      kind: "nonPlayer",
      identity: opponentCadenceIdentity(state.huntRunIdentity, encounter.encounterOrdinal),
    },
  );
  if (opponentError) return opponentError;
  const effectError = validateBattleEffectsCheckpoint(battle);
  if (effectError) return effectError;
  const policyError = validatePolicyState(battle, encounter.policy);
  if (policyError) return policyError;

  const lifecycle = evaluateBattleLifecycle(battle);
  if (!structurallyEqual(lifecycle.state, battle)) {
    return "Solo Hunt current Battle lifecycle state is not settled";
  }
  if (!structurallyEqual(lifecycle.outcome, encounter.battleOutcome)) {
    return "Solo Hunt current Battle outcome does not match Combat Engine lifecycle";
  }
  if (
    (state.status === "active" && battle.status !== "active")
    || (state.status === "terminal"
      && (!encounter.battleOutcome
        || battle.status !== "ended"
        || (state.terminalReason !== "draw" && state.terminalReason !== "opponentVictory")))
  ) {
    return "Solo Hunt runtime status does not match current Battle lifecycle";
  }
  if (state.status === "terminal" && encounter.battleOutcome) {
    const expectedReason = encounter.battleOutcome.kind === "draw"
      ? "draw"
      : encounter.battleOutcome.winnerSideId === encounter.opponentSideId
        ? "opponentVictory"
        : undefined;
    if (!expectedReason || state.terminalReason !== expectedReason) {
      return "Solo Hunt terminal reason does not match current Battle outcome";
    }
  }
  return undefined;
}

function validateParticipantActivations(
  state: SoloHuntRuntimeState,
  inputs: SoloHuntRuntimeInputs,
  encounterOrdinal: number,
  activations: ReadonlyArray<SoloHuntParticipantActivationProvenance>,
  maxCombatTimeMs: number,
  maxEventSequence: number,
): string | undefined {
  if (activations.length < 1) return "Solo Hunt participant provenance must not be empty";
  const teamIndex = new Map(
    inputs.team.map((member, index) => [member.pokemonInstanceId, index] as const),
  );
  const seen = new Set<PokemonInstanceId>();
  let previousTeamIndex = -1;
  let previousCombatTimeMs = -1;
  let previousEventSequence = -1;
  for (let index = 0; index < activations.length; index += 1) {
    const activation = activations[index]!;
    const memberIndex = teamIndex.get(activation.pokemonInstanceId);
    if (
      memberIndex === undefined
      || memberIndex <= previousTeamIndex
      || seen.has(activation.pokemonInstanceId)
      || activation.combatantId !== playerCombatantId(
        state.huntRunIdentity,
        encounterOrdinal,
        activation.pokemonInstanceId,
      )
      || !Number.isSafeInteger(activation.combatTimeMs)
      || activation.combatTimeMs < 0
      || activation.combatTimeMs > maxCombatTimeMs
      || !Number.isSafeInteger(activation.eventSequence)
      || activation.eventSequence < 0
      || activation.eventSequence > maxEventSequence
    ) {
      return "Solo Hunt participant activation provenance is invalid";
    }
    if (index === 0) {
      if (
        activation.activationKind !== "initial"
        || activation.combatTimeMs !== 0
        || activation.eventSequence !== 0
        || (encounterOrdinal === 1
          && activation.pokemonInstanceId !== inputs.team[0]?.pokemonInstanceId)
      ) {
        return "Solo Hunt initial participant provenance is invalid";
      }
    } else if (
      activation.activationKind !== "forcedReplacement"
      || activation.combatTimeMs < previousCombatTimeMs
      || activation.eventSequence <= previousEventSequence
    ) {
      return "Solo Hunt replacement participant provenance is invalid";
    }
    seen.add(activation.pokemonInstanceId);
    previousTeamIndex = memberIndex;
    previousCombatTimeMs = activation.combatTimeMs;
    previousEventSequence = activation.eventSequence;
  }
  return undefined;
}

function validateCompletedEncounterEvidence(
  state: SoloHuntRuntimeState,
  inputs: SoloHuntRuntimeInputs,
): string | undefined {
  if (state.completedEncounterProvenance.length !== state.completedEncounters.length) {
    return "Solo Hunt completion evidence/provenance counts do not match";
  }
  let expectedSelectionRng: DeterministicRngState | undefined;
  let originPending: SoloHuntPendingEncounterSelection | undefined;
  if (state.selectionStreamOrigin.kind === "rng") {
    const originError = validateRngState(state.selectionStreamOrigin.policyRng);
    if (originError) return originError;
    expectedSelectionRng = state.selectionStreamOrigin.policyRng;
  } else {
    const originValidation = validatePendingSelection(
      inputs,
      state.selectionStreamOrigin.pendingEncounterSelection,
    );
    if (!originValidation.accepted) return originValidation.reason;
    originPending = state.selectionStreamOrigin.pendingEncounterSelection;
  }
  let previousCompletionTimeMs = -1;
  for (let index = 0; index < state.completedEncounters.length; index += 1) {
    const evidence = state.completedEncounters[index]!;
    const provenance = state.completedEncounterProvenance[index]!;
    const expectedOrdinal = index + 1;
    const pending = provenance.consumedPendingEncounterSelection;
    const pendingValidation = validatePendingSelection(inputs, pending);
    if (!pendingValidation.accepted) return pendingValidation.reason;
    if (
      index === 0
      && originPending
      && !structurallyEqual(pending, originPending)
    ) {
      return "Solo Hunt first completion does not consume the retained pending selection origin";
    }
    if (
      (index > 0 || !originPending)
      && (!expectedSelectionRng || !sameRng(pending.policyRngBeforeSelection, expectedSelectionRng))
    ) {
      return "Solo Hunt completed Encounter selection RNG provenance is discontinuous";
    }
    expectedSelectionRng = pending.policyRngAfterSelection;
    const selection = pendingValidation.selection;
    const participantError = validateParticipantActivations(
      state,
      inputs,
      expectedOrdinal,
      provenance.participantActivations,
      provenance.terminalBattleTimeMs,
      provenance.terminalEventSequence,
    );
    if (participantError) return participantError;
    const provenanceParticipants = participantIdsFromProvenance(provenance.participantActivations);
    if (
      evidence.encounterOrdinal !== expectedOrdinal
      || evidence.encounterId !== soloHuntEncounterId(state.huntRunIdentity, expectedOrdinal)
      || evidence.rewardSourceIdentity !== rewardSourceIdentity(state.huntRunIdentity, expectedOrdinal)
      || provenance.encounterOrdinal !== expectedOrdinal
      || provenance.encounterId !== evidence.encounterId
      || evidence.huntRunIdentity !== state.huntRunIdentity
      || evidence.completionKind !== "defeat"
      || evidence.pendingSelectionIdentity !== pending.pendingSelectionIdentity
      || provenance.completedAtHuntTimeMs !== evidence.completedAtHuntTimeMs
      || provenance.completedAtHuntTimeMs
        !== provenance.battleStartedAtHuntTimeMs + provenance.terminalBattleTimeMs
      || !Number.isSafeInteger(provenance.terminalEventSequence)
      || provenance.terminalEventSequence < 1
      || evidence.contentVersion !== state.contentVersion
      || evidence.contentHash !== state.contentHash
      || evidence.gameDataVersion !== state.gameDataVersion
      || evidence.rulesVersion !== state.rulesVersion
      || !Number.isSafeInteger(evidence.completedAtHuntTimeMs)
      || evidence.completedAtHuntTimeMs < previousCompletionTimeMs
      || evidence.completedAtHuntTimeMs > state.logicalTimeMs
      || evidence.encounterDefinitionId !== selection.encounterDefinitionId
      || evidence.speciesId !== selection.speciesId
      || evidence.level !== selection.level
      || !structurallyEqual(evidence.rewardEnvelope, selection.rewardEnvelope)
      || !sameOrderedStrings(evidence.participantPokemonInstanceIds, provenanceParticipants)
    ) {
      return "Solo Hunt completed Encounter evidence is inconsistent or forged";
    }
    previousCompletionTimeMs = evidence.completedAtHuntTimeMs;
  }
  const expectedCompletedCount = state.currentEncounter
    ? state.currentEncounter.encounterOrdinal - 1
    : state.nextEncounterOrdinal - 1;
  if (state.completedEncounters.length !== expectedCompletedCount) {
    return "Solo Hunt completed Encounter evidence count does not match encounter progression";
  }
  if (state.pendingEncounterSelection) {
    const pending = state.pendingEncounterSelection;
    if (
      state.completedEncounters.length === 0
      && originPending
      && !structurallyEqual(pending, originPending)
    ) {
      return "Solo Hunt active pending selection does not match retained selection origin";
    }
    if (
      (state.completedEncounters.length > 0 || !originPending)
      && (!expectedSelectionRng || !sameRng(pending.policyRngBeforeSelection, expectedSelectionRng))
    ) {
      return "Solo Hunt active pending selection RNG provenance is discontinuous";
    }
    if (!sameRng(state.policyRng, pending.policyRngAfterSelection)) {
      return "Solo Hunt policy RNG does not match the active pending selection";
    }
  } else if (!expectedSelectionRng || !sameRng(state.policyRng, expectedSelectionRng)) {
    return "Solo Hunt policy RNG does not match completed selection provenance";
  }
  return undefined;
}

type SoloHuntEncounterReplayResult =
  | {
      readonly accepted: true;
      readonly battle: BattleState;
      readonly deterministicState: DeterministicState;
      readonly policy: SoloHuntMovePolicyState;
      readonly participantActivations: ReadonlyArray<SoloHuntParticipantActivationProvenance>;
      readonly playerSideId: BattleSideId;
      readonly opponentSideId: BattleSideId;
    }
  | { readonly accepted: false; readonly reason: string };

function replaySoloHuntEncounterStimuli(
  huntRunIdentity: string,
  encounterOrdinal: number,
  team: ReadonlyArray<SoloHuntTeamMemberSnapshot>,
  cadence: CadenceCarryState,
  policy: SoloHuntMovePolicyState,
  selection: SoloHuntEncounterSelection,
  opponentTemplates: ReadonlyArray<SoloHuntOpponentTemplate>,
  context: ResolvedCombatContext,
  deterministicState: DeterministicState,
  stimuli: ReadonlyArray<CombatStimulus>,
): SoloHuntEncounterReplayResult {
  const initialized = initializeSoloHuntEncounterBattle({
    huntRunIdentity,
    encounterOrdinal,
    team,
    cadence,
    policy,
    selection,
    opponentTemplates,
    context,
    deterministicState,
  });
  if (!initialized.accepted) return { accepted: false, reason: initialized.reason };
  const initialActivation = initialParticipantActivation(initialized.state, initialized.playerSideId);
  if (!initialActivation) {
    return { accepted: false, reason: "Solo Hunt replay did not resolve an initial player participant" };
  }

  let battle = initialized.state;
  let replayDeterministicState = initialized.deterministicState;
  let replayPolicy = initialized.policy;
  let participantActivations: ReadonlyArray<SoloHuntParticipantActivationProvenance> = [initialActivation];

  for (const stimulus of stimuli) {
    if (stimulus.kind === "useMove") {
      const resolved = resolveNextSoloHuntMove(
        battle,
        replayDeterministicState,
        replayPolicy,
      );
      if (resolved.kind !== "resolved" || !structurallyEqual(resolved.intent, stimulus)) {
        return { accepted: false, reason: "Solo Hunt replayed automatic Move does not match stored stimulus" };
      }
      battle = resolved.state;
      replayDeterministicState = resolved.deterministicState;
      replayPolicy = resolved.policy;
      continue;
    }

    if (stimulus.kind === "forcedReplacement") {
      const replacement = resolveSoloHuntForcedReplacement(
        battle,
        replayDeterministicState,
        team,
        initialized.playerSideId,
      );
      if (!replacement.accepted) return { accepted: false, reason: replacement.reason };
      const activation = replacement.events.find(
        (event): event is Extract<CombatEvent, { kind: "CombatantActivated" }> =>
          event.kind === "CombatantActivated" && event.sideId === initialized.playerSideId,
      );
      if (
        !activation
        || stimulus.sideId !== initialized.playerSideId
        || stimulus.combatantId !== activation.combatantId
      ) {
        return { accepted: false, reason: "Solo Hunt replayed forced replacement does not match stored stimulus" };
      }
      participantActivations = appendReplacementParticipantActivations(
        participantActivations,
        replacement.state,
        initialized.playerSideId,
        replacement.events,
      );
      battle = replacement.state;
      replayDeterministicState = replacement.deterministicState;
      continue;
    }

    if (stimulus.kind === "advanceTime") {
      const policyBoundary = resolveNextSoloHuntMove(
        battle,
        replayDeterministicState,
        replayPolicy,
      );
      if (policyBoundary.kind !== "idle") {
        return {
          accepted: false,
          reason: "Solo Hunt replayed advanceTime skips a required automatic Move",
        };
      }
      if (
        policyBoundary.nextPolicyBoundaryMs !== undefined
        && stimulus.toMs > policyBoundary.nextPolicyBoundaryMs
      ) {
        return {
          accepted: false,
          reason: "Solo Hunt replayed advanceTime skips the next deterministic policy boundary",
        };
      }
      const advanced = resolveCombatStimulus(battle, stimulus, replayDeterministicState);
      if (!advanced.accepted) return { accepted: false, reason: advanced.reason };
      battle = advanced.state;
      replayDeterministicState = advanced.deterministicState;
      continue;
    }

    return { accepted: false, reason: "Solo Hunt replay encountered an unsupported combat stimulus" };
  }

  return {
    accepted: true,
    battle,
    deterministicState: replayDeterministicState,
    policy: replayPolicy,
    participantActivations,
    playerSideId: initialized.playerSideId,
    opponentSideId: initialized.opponentSideId,
  };
}

function validateReplayableHuntHistory(
  state: SoloHuntRuntimeState,
  inputs: SoloHuntRuntimeInputs,
): string | undefined {
  const originRngError = validateRngState(state.combatDeterministicOrigin.rng);
  if (originRngError) return originRngError;
  const fresh = createFreshSoloHuntCadence(inputs.team);
  if (!fresh.accepted) return fresh.reason;

  let cadence = fresh.cadence;
  let policy = fresh.policy;
  let deterministicState = state.combatDeterministicOrigin;
  let huntTimeMs = 0;

  for (let index = 0; index < state.completedEncounterProvenance.length; index += 1) {
    const provenance = state.completedEncounterProvenance[index]!;
    const evidence = state.completedEncounters[index]!;
    const pendingValidation = validatePendingSelection(
      inputs,
      provenance.consumedPendingEncounterSelection,
    );
    if (!pendingValidation.accepted) return pendingValidation.reason;
    if (provenance.battleStartedAtHuntTimeMs !== huntTimeMs) {
      return "Solo Hunt completed Encounter Battle start time does not replay from prior cadence";
    }

    const replay = replaySoloHuntEncounterStimuli(
      state.huntRunIdentity,
      provenance.encounterOrdinal,
      inputs.team,
      cadence,
      policy,
      pendingValidation.selection,
      inputs.opponentTemplates,
      inputs.context,
      deterministicState,
      provenance.battleStimuli,
    );
    if (!replay.accepted) return replay.reason;
    const lifecycle = evaluateBattleLifecycle(replay.battle);
    if (
      replay.battle.status !== "ended"
      || lifecycle.outcome?.kind !== "win"
      || lifecycle.outcome.winnerSideId !== replay.playerSideId
    ) {
      return "Solo Hunt completed Encounter stimulus history does not replay to player victory";
    }
    if (
      provenance.terminalBattleTimeMs !== replay.battle.combatTimeMs
      || provenance.terminalEventSequence !== replay.battle.eventSequence
      || provenance.completedAtHuntTimeMs !== huntTimeMs + replay.battle.combatTimeMs
      || evidence.completedAtHuntTimeMs !== provenance.completedAtHuntTimeMs
      || !structurallyEqual(provenance.participantActivations, replay.participantActivations)
      || !sameOrderedStrings(
        evidence.participantPokemonInstanceIds,
        participantIdsFromProvenance(replay.participantActivations),
      )
    ) {
      return "Solo Hunt completed Encounter transition provenance does not replay exactly";
    }

    const pruned = pruneSoloHuntEndedOpponentCadence(replay.battle, replay.policy, inputs.team);
    if (!pruned.accepted) return pruned.reason;
    deterministicState = replay.deterministicState;
    huntTimeMs = provenance.completedAtHuntTimeMs;

    const isLastCompletion = index === state.completedEncounterProvenance.length - 1;
    if (isLastCompletion && state.interBattle) {
      const elapsedGapMs = state.logicalTimeMs - huntTimeMs;
      if (
        !Number.isSafeInteger(elapsedGapMs)
        || elapsedGapMs < 0
        || elapsedGapMs > inputs.interBattleGapMs
        || state.interBattle.remainingGapMs !== inputs.interBattleGapMs - elapsedGapMs
      ) {
        return "Solo Hunt inter-Battle checkpoint time does not match replayed completion boundary";
      }
      const advanced = advanceSoloHuntInterBattleCadence(
        pruned.cadence,
        inputs.context,
        deterministicState,
        elapsedGapMs,
      );
      if (
        !advanced.accepted
        || advanced.elapsedMs !== elapsedGapMs
        || !structurallyEqual(advanced.cadence, state.interBattle.cadence)
        || !structurallyEqual(pruned.policy, state.interBattle.policy)
        || !structurallyEqual(advanced.deterministicState, state.combatDeterministicState)
        || (state.status === "active" && advanced.noLivingPlayer)
        || (state.status === "terminal"
          && (state.terminalReason !== "noLivingTeam" || !advanced.noLivingPlayer))
      ) {
        return "Solo Hunt inter-Battle checkpoint does not replay exactly";
      }
      return undefined;
    }

    const gap = advanceSoloHuntInterBattleCadence(
      pruned.cadence,
      inputs.context,
      deterministicState,
      inputs.interBattleGapMs,
    );
    if (!gap.accepted || gap.noLivingPlayer || gap.elapsedMs !== inputs.interBattleGapMs) {
      return "Solo Hunt completed Encounter cannot replay into the next Battle cadence";
    }
    cadence = gap.cadence;
    policy = pruned.policy;
    deterministicState = gap.deterministicState;
    huntTimeMs += gap.elapsedMs;
  }

  if (!state.currentEncounter) {
    return "Solo Hunt replay expected a current Encounter after completed cadence history";
  }
  const encounter = state.currentEncounter;
  const pending = state.pendingEncounterSelection;
  if (!pending) return "Solo Hunt current Encounter replay is missing pending selection";
  const pendingValidation = validatePendingSelection(inputs, pending);
  if (!pendingValidation.accepted) return pendingValidation.reason;
  if (encounter.battleStartedAtHuntTimeMs !== huntTimeMs) {
    return "Solo Hunt current Encounter Battle start time does not replay from prior cadence";
  }
  const replay = replaySoloHuntEncounterStimuli(
    state.huntRunIdentity,
    encounter.encounterOrdinal,
    inputs.team,
    cadence,
    policy,
    pendingValidation.selection,
    inputs.opponentTemplates,
    inputs.context,
    deterministicState,
    encounter.battleStimuli,
  );
  if (!replay.accepted) return replay.reason;
  if (
    !structurallyEqual(replay.battle, encounter.battle)
    || !structurallyEqual(replay.policy, encounter.policy)
    || !structurallyEqual(replay.deterministicState, state.combatDeterministicState)
    || !structurallyEqual(replay.participantActivations, encounter.participantActivations)
    || !sameOrderedStrings(
      encounter.participantPokemonInstanceIds,
      participantIdsFromProvenance(replay.participantActivations),
    )
    || state.logicalTimeMs !== huntTimeMs + replay.battle.combatTimeMs
  ) {
    return "Solo Hunt current Encounter checkpoint does not replay exactly from authoritative stimuli";
  }
  return undefined;
}

function validateRuntimeState(
  state: SoloHuntRuntimeState,
  inputs: SoloHuntRuntimeInputs,
): string | undefined {
  if (!Number.isSafeInteger(state.logicalTimeMs) || state.logicalTimeMs < 0) {
    return "Solo Hunt logical time must be a non-negative safe integer";
  }
  if (!Number.isSafeInteger(state.nextEncounterOrdinal) || state.nextEncounterOrdinal < 2) {
    return "Solo Hunt next Encounter ordinal is invalid";
  }
  const policyRngError = validateRngState(state.policyRng);
  const combatRngError = validateRngState(state.combatDeterministicState.rng);
  if (policyRngError || combatRngError) {
    return policyRngError ?? combatRngError ?? "invalid Solo Hunt RNG state";
  }
  if (state.status === "active" && state.terminalReason !== undefined) {
    return "active Solo Hunt cannot carry a terminal reason";
  }
  if (state.status === "terminal" && state.terminalReason === undefined) {
    return "terminal Solo Hunt is missing terminal reason";
  }
  if ((state.currentEncounter === undefined) === (state.interBattle === undefined)) {
    return "Solo Hunt runtime must contain exactly one active phase";
  }

  if (state.currentEncounter) {
    const encounter = state.currentEncounter;
    if (
      encounter.encounterOrdinal !== state.nextEncounterOrdinal - 1
      || encounter.encounterId !== soloHuntEncounterId(state.huntRunIdentity, encounter.encounterOrdinal)
      || encounter.battleStartedAtHuntTimeMs + encounter.battle.combatTimeMs !== state.logicalTimeMs
      || encounter.battle.context.gameDataVersion !== state.gameDataVersion
      || encounter.battle.context.rulesVersion !== state.rulesVersion
    ) {
      return "Solo Hunt current Encounter identity/time/context is inconsistent";
    }
    const battleError = validateCurrentEncounterBattleCheckpoint(state, inputs, encounter);
    if (battleError) return battleError;
    const pending = state.pendingEncounterSelection;
    if (!pending || pending.pendingSelectionIdentity !== encounter.pendingSelectionIdentity) {
      return "Solo Hunt current Encounter is missing its exact pending selection";
    }
    const validatedPending = validatePendingSelection(inputs, pending);
    if (
      !validatedPending.accepted
      || !sameEncounterSelection(encounter.selection, validatedPending.selection)
      || !sameRng(state.policyRng, pending.policyRngAfterSelection)
    ) {
      return validatedPending.accepted
        ? "Solo Hunt current Encounter does not match its replayed pending selection"
        : validatedPending.reason;
    }
    const participantError = validateParticipantActivations(
      state,
      inputs,
      encounter.encounterOrdinal,
      encounter.participantActivations,
      encounter.battle.combatTimeMs,
      encounter.battle.eventSequence,
    );
    if (participantError) return participantError;
    if (!sameOrderedStrings(
      encounter.participantPokemonInstanceIds,
      participantIdsFromProvenance(encounter.participantActivations),
    )) {
      return "Solo Hunt current Encounter participants do not match activation provenance";
    }
  } else {
    if (state.pendingEncounterSelection !== undefined) {
      return "Solo Hunt inter-Battle phase cannot retain a consumed pending selection";
    }
    const between = state.interBattle!;
    if (
      !Number.isSafeInteger(between.remainingGapMs)
      || between.remainingGapMs < 0
      || between.remainingGapMs > state.interBattleGapMs
    ) {
      return "Solo Hunt inter-Battle remaining gap is invalid";
    }
    const cadenceValidation = advanceSoloHuntInterBattleCadence(
      between.cadence,
      inputs.context,
      state.combatDeterministicState,
      0,
    );
    if (!cadenceValidation.accepted) return cadenceValidation.reason;
    if (state.status === "active" && cadenceValidation.noLivingPlayer) {
      return "active Solo Hunt inter-Battle phase has no living pinned Team member";
    }
    if (state.status === "terminal" && state.terminalReason !== "noLivingTeam") {
      return "terminal Solo Hunt inter-Battle phase must be a no-living terminal";
    }
  }

  const evidenceError = validateCompletedEncounterEvidence(state, inputs);
  if (evidenceError) return evidenceError;
  if (state.pendingCaptureDecision) {
    const backing = state.completedEncounters.find(
      (evidence) => evidence.encounterId === state.pendingCaptureDecision!.encounterId,
    );
    if (
      !backing
      || !structurallyEqual(
        state.pendingCaptureDecision,
        captureDecisionFromEvidence(backing),
      )
    ) {
      return "Solo Hunt pending capture decision is not exactly bound to completed Encounter evidence";
    }
  }
  const replayError = validateReplayableHuntHistory(state, inputs);
  if (replayError) return replayError;
  return undefined;
}

function selectPendingEncounter(
  inputs: SoloHuntRuntimeInputs,
  policyRng: DeterministicRngState,
): {
  readonly accepted: true;
  readonly pending: SoloHuntPendingEncounterSelection;
  readonly selection: SoloHuntEncounterSelection;
  readonly policyRng: DeterministicRngState;
} | {
  readonly accepted: false;
  readonly reason: string;
} {
  const selected = selectSoloHuntEncounter(inputs.encounterOptions, policyRng);
  if (!selected.accepted) return { accepted: false, reason: selected.reason };
  return {
    accepted: true,
    pending: {
      pendingSelectionIdentity: pendingSelectionIdentity(inputs, policyRng, selected.selection),
      playerId: inputs.playerId,
      zoneId: inputs.zoneId,
      huntDefinitionId: inputs.huntDefinitionId,
      contentVersion: inputs.contentVersion,
      contentHash: inputs.contentHash,
      gameDataVersion: inputs.context.gameDataVersion,
      rulesVersion: inputs.context.rulesVersion,
      encounterDefinitionId: selected.selection.encounterDefinitionId,
      speciesId: selected.selection.speciesId,
      level: selected.selection.level,
      policyRngBeforeSelection: policyRng,
      policyRngAfterSelection: selected.rng,
    },
    selection: selected.selection,
    policyRng: selected.rng,
  };
}

function battleOutcomeFromEvents(events: ReadonlyArray<CombatEvent>): SoloHuntBattleOutcome | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.kind === "BattleEnded") return event.outcome;
  }
  return undefined;
}

function initialParticipantActivation(
  battle: BattleState,
  playerSideId: BattleSideId,
): SoloHuntParticipantActivationProvenance | undefined {
  const side = battle.sides.find((candidate) => candidate.sideId === playerSideId);
  const combatantId = side?.activeCombatantIds[0];
  if (!combatantId) return undefined;
  const participant = ownGet(battle.combatants, combatantId)?.cadenceParticipant;
  if (participant?.kind !== "pokemonInstance") return undefined;
  return {
    pokemonInstanceId: participant.identity,
    combatantId,
    activationKind: "initial",
    combatTimeMs: 0,
    eventSequence: 0,
  };
}

function appendReplacementParticipantActivations(
  existing: ReadonlyArray<SoloHuntParticipantActivationProvenance>,
  battle: BattleState,
  playerSideId: BattleSideId,
  combatEvents: ReadonlyArray<CombatEvent>,
): ReadonlyArray<SoloHuntParticipantActivationProvenance> {
  const seen = new Set(existing.map((activation) => activation.pokemonInstanceId));
  const additions: SoloHuntParticipantActivationProvenance[] = [];
  for (const event of combatEvents) {
    if (event.kind !== "CombatantActivated" || event.sideId !== playerSideId) continue;
    const participant = ownGet(battle.combatants, event.combatantId)?.cadenceParticipant;
    if (participant?.kind !== "pokemonInstance" || seen.has(participant.identity)) continue;
    seen.add(participant.identity);
    additions.push({
      pokemonInstanceId: participant.identity,
      combatantId: event.combatantId,
      activationKind: "forcedReplacement",
      combatTimeMs: event.combatTimeMs,
      eventSequence: event.sequence,
    });
  }
  return [...existing, ...additions];
}

function participantIdsFromProvenance(
  activations: ReadonlyArray<SoloHuntParticipantActivationProvenance>,
): ReadonlyArray<PokemonInstanceId> {
  return activations.map((activation) => activation.pokemonInstanceId);
}

function wrapCombatEvents(
  encounter: Pick<SoloHuntCurrentEncounterRuntime, "encounterId" | "battleStartedAtHuntTimeMs">,
  combatEvents: ReadonlyArray<CombatEvent>,
): ReadonlyArray<SoloHuntSimulationEvent> {
  return combatEvents.map((event) => ({
    kind: "combat" as const,
    encounterId: encounter.encounterId,
    huntTimeMs: encounter.battleStartedAtHuntTimeMs + event.combatTimeMs,
    event,
  }));
}

function buildCurrentEncounter(
  huntRunIdentity: string,
  encounterOrdinal: number,
  battleStartedAtHuntTimeMs: number,
  team: ReadonlyArray<SoloHuntTeamMemberSnapshot>,
  cadence: CadenceCarryState,
  policy: SoloHuntMovePolicyState,
  pending: SoloHuntPendingEncounterSelection,
  selection: SoloHuntEncounterSelection,
  opponentTemplates: ReadonlyArray<SoloHuntOpponentTemplate>,
  context: ResolvedCombatContext,
  deterministicState: DeterministicState,
): {
  readonly accepted: true;
  readonly encounter: SoloHuntCurrentEncounterRuntime;
  readonly deterministicState: DeterministicState;
  readonly events: ReadonlyArray<SoloHuntSimulationEvent>;
} | {
  readonly accepted: false;
  readonly reason: string;
} {
  const initialized = initializeSoloHuntEncounterBattle({
    huntRunIdentity,
    encounterOrdinal,
    team,
    cadence,
    policy,
    selection,
    opponentTemplates,
    context,
    deterministicState,
  });
  if (!initialized.accepted) return { accepted: false, reason: initialized.reason };
  const encounterId = soloHuntEncounterId(huntRunIdentity, encounterOrdinal);
  const outcome = battleOutcomeFromEvents(initialized.events);
  const initialActivation = initialParticipantActivation(initialized.state, initialized.playerSideId);
  if (!initialActivation) {
    return { accepted: false, reason: "Solo Hunt Battle did not expose an initial player participant" };
  }
  const encounter: SoloHuntCurrentEncounterRuntime = {
    encounterId,
    encounterOrdinal,
    pendingSelectionIdentity: pending.pendingSelectionIdentity,
    selection,
    battleStartedAtHuntTimeMs,
    battle: initialized.state,
    policy: initialized.policy,
    playerSideId: initialized.playerSideId,
    opponentSideId: initialized.opponentSideId,
    participantPokemonInstanceIds: [initialActivation.pokemonInstanceId],
    participantActivations: [initialActivation],
    battleStimuli: [],
    ...(outcome ? { battleOutcome: outcome } : {}),
  };
  return {
    accepted: true,
    encounter,
    deterministicState: initialized.deterministicState,
    events: wrapCombatEvents(encounter, initialized.events),
  };
}

export function createSoloHuntRuntime(
  input: CreateSoloHuntRuntimeInput,
): CreateSoloHuntRuntimeResult {
  const inputsError = validateRuntimeInputs(input.inputs);
  if (inputsError) return { accepted: false, reason: inputsError, events: [] };
  if (typeof input.huntRunIdentity !== "string" || input.huntRunIdentity.length === 0) {
    return { accepted: false, reason: "Solo Hunt run identity is required", events: [] };
  }
  const policyRngError = validateRngState(input.policyRng);
  const combatRngError = validateRngState(input.combatDeterministicState.rng);
  if (policyRngError || combatRngError) {
    return {
      accepted: false,
      reason: policyRngError ?? combatRngError ?? "invalid deterministic RNG",
      events: [],
    };
  }
  const fresh = createFreshSoloHuntCadence(input.inputs.team);
  if (!fresh.accepted) return { accepted: false, reason: fresh.reason, events: [] };

  let pending: SoloHuntPendingEncounterSelection;
  let selection: SoloHuntEncounterSelection;
  let policyRng: DeterministicRngState;
  if (input.pendingEncounterSelection) {
    const validated = validatePendingSelection(input.inputs, input.pendingEncounterSelection);
    if (!validated.accepted) return { accepted: false, reason: validated.reason, events: [] };
    pending = input.pendingEncounterSelection;
    selection = validated.selection;
    policyRng = pending.policyRngAfterSelection;
  } else {
    const selected = selectPendingEncounter(input.inputs, input.policyRng);
    if (!selected.accepted) return { accepted: false, reason: selected.reason, events: [] };
    pending = selected.pending;
    selection = selected.selection;
    policyRng = selected.policyRng;
  }

  const built = buildCurrentEncounter(
    input.huntRunIdentity,
    1,
    0,
    input.inputs.team,
    fresh.cadence,
    fresh.policy,
    pending,
    selection,
    input.inputs.opponentTemplates,
    input.inputs.context,
    input.combatDeterministicState,
  );
  if (!built.accepted) return { accepted: false, reason: built.reason, events: [] };
  return {
    accepted: true,
    state: {
      huntRunIdentity: input.huntRunIdentity,
      playerId: input.inputs.playerId,
      zoneId: input.inputs.zoneId,
      huntDefinitionId: input.inputs.huntDefinitionId,
      contentVersion: input.inputs.contentVersion,
      contentHash: input.inputs.contentHash,
      gameDataVersion: input.inputs.context.gameDataVersion,
      rulesVersion: input.inputs.context.rulesVersion,
      interBattleGapMs: input.inputs.interBattleGapMs,
      pinnedTeam: [...input.inputs.team],
      logicalTimeMs: 0,
      nextEncounterOrdinal: 2,
      selectionStreamOrigin: input.pendingEncounterSelection
        ? { kind: "pending", pendingEncounterSelection: input.pendingEncounterSelection }
        : { kind: "rng", policyRng: input.policyRng },
      combatDeterministicOrigin: input.combatDeterministicState,
      policyRng,
      combatDeterministicState: built.deterministicState,
      currentEncounter: built.encounter,
      pendingEncounterSelection: pending,
      completedEncounters: [],
      completedEncounterProvenance: [],
      status: "active",
    },
    events: built.events,
  };
}

function completeEncounterEvidence(
  state: SoloHuntRuntimeState,
  encounter: SoloHuntCurrentEncounterRuntime,
): SoloHuntCompletedEncounterEvidence {
  return {
    rewardSourceIdentity: rewardSourceIdentity(state.huntRunIdentity, encounter.encounterOrdinal),
    huntRunIdentity: state.huntRunIdentity,
    encounterId: encounter.encounterId,
    encounterOrdinal: encounter.encounterOrdinal,
    pendingSelectionIdentity: encounter.pendingSelectionIdentity,
    encounterDefinitionId: encounter.selection.encounterDefinitionId,
    speciesId: encounter.selection.speciesId,
    level: encounter.selection.level,
    completionKind: "defeat",
    participantPokemonInstanceIds: encounter.participantPokemonInstanceIds,
    rewardEnvelope: encounter.selection.rewardEnvelope,
    contentVersion: state.contentVersion,
    contentHash: state.contentHash,
    gameDataVersion: state.gameDataVersion,
    rulesVersion: state.rulesVersion,
    completedAtHuntTimeMs: state.logicalTimeMs,
  };
}

function completeEncounterProvenance(
  state: SoloHuntRuntimeState,
  encounter: SoloHuntCurrentEncounterRuntime,
  pending: SoloHuntPendingEncounterSelection,
): SoloHuntCompletedEncounterProvenance {
  return {
    encounterId: encounter.encounterId,
    encounterOrdinal: encounter.encounterOrdinal,
    consumedPendingEncounterSelection: pending,
    participantActivations: [...encounter.participantActivations],
    battleStimuli: [...encounter.battleStimuli],
    battleStartedAtHuntTimeMs: encounter.battleStartedAtHuntTimeMs,
    completedAtHuntTimeMs: state.logicalTimeMs,
    terminalBattleTimeMs: encounter.battle.combatTimeMs,
    terminalEventSequence: encounter.battle.eventSequence,
  };
}

function captureDecisionFromEvidence(
  evidence: SoloHuntCompletedEncounterEvidence,
): SoloHuntPendingCaptureDecision {
  return {
    encounterId: evidence.encounterId,
    encounterDefinitionId: evidence.encounterDefinitionId,
    speciesId: evidence.speciesId,
    level: evidence.level,
    contentVersion: evidence.contentVersion,
    contentHash: evidence.contentHash,
    gameDataVersion: evidence.gameDataVersion,
    rulesVersion: evidence.rulesVersion,
  };
}

function terminalizeSoloHunt(
  state: SoloHuntRuntimeState,
  reason: SoloHuntTerminalReason,
): SoloHuntRuntimeState {
  return { ...state, status: "terminal", terminalReason: reason };
}

export function advanceSoloHuntToCutoff(
  state: SoloHuntRuntimeState,
  inputs: SoloHuntRuntimeInputs,
  cutoffMs: number,
): AdvanceSoloHuntResult {
  const originalState = state;
  const reject = (reason: string): AdvanceSoloHuntResult => ({
    accepted: false,
    reason,
    state: originalState,
    events: [],
  });
  if (!Number.isSafeInteger(cutoffMs) || cutoffMs < state.logicalTimeMs) {
    return reject("Solo Hunt cutoff must be a safe integer at or after current logical time");
  }
  const bindingError = validateRuntimeBinding(state, inputs);
  if (bindingError) return reject(bindingError);
  const stateError = validateRuntimeState(state, inputs);
  if (stateError) return reject(stateError);
  if (state.status === "terminal") {
    if (!state.terminalReason) return reject("terminal Solo Hunt is missing terminal reason");
    return { accepted: true, state, stopReason: state.terminalReason, events: [] };
  }

  let currentState = state;
  const events: SoloHuntSimulationEvent[] = [];

  while (true) {
    if (currentState.status === "terminal") {
      const reason = currentState.terminalReason;
      if (!reason) return reject("terminal Solo Hunt is missing terminal reason");
      return { accepted: true, state: currentState, stopReason: reason, events };
    }

    if (currentState.currentEncounter) {
      let encounter = currentState.currentEncounter;
      const battleLogicalTimeMs = encounter.battleStartedAtHuntTimeMs + encounter.battle.combatTimeMs;
      if (battleLogicalTimeMs !== currentState.logicalTimeMs) {
        return reject("Solo Hunt logical time does not match current Battle time");
      }

      if (encounter.battle.replacementPendingSideIds.length > 0) {
        const replacement = resolveSoloHuntForcedReplacement(
          encounter.battle,
          currentState.combatDeterministicState,
          inputs.team,
          encounter.playerSideId,
        );
        if (!replacement.accepted) return reject(replacement.reason);
        events.push(...wrapCombatEvents(encounter, replacement.events));
        const outcome = battleOutcomeFromEvents(replacement.events);
        const activationEvent = replacement.events.find(
          (event): event is Extract<CombatEvent, { kind: "CombatantActivated" }> =>
            event.kind === "CombatantActivated" && event.sideId === encounter.playerSideId,
        );
        if (!activationEvent) {
          return reject("Solo Hunt forced replacement did not emit CombatantActivated provenance");
        }
        const participantActivations = appendReplacementParticipantActivations(
          encounter.participantActivations,
          replacement.state,
          encounter.playerSideId,
          replacement.events,
        );
        encounter = {
          ...encounter,
          battle: replacement.state,
          participantPokemonInstanceIds: participantIdsFromProvenance(participantActivations),
          participantActivations,
          battleStimuli: [
            ...encounter.battleStimuli,
            {
              kind: "forcedReplacement",
              sideId: encounter.playerSideId,
              combatantId: activationEvent.combatantId,
            },
          ],
          ...(outcome ? { battleOutcome: outcome } : {}),
        };
        currentState = {
          ...currentState,
          currentEncounter: encounter,
          combatDeterministicState: replacement.deterministicState,
        };
        continue;
      }

      if (encounter.battle.status === "ended") {
        const outcome = encounter.battleOutcome;
        if (!outcome) return reject("ended Solo Hunt Battle is missing BattleEnded outcome");
        if (outcome.kind === "draw") {
          currentState = terminalizeSoloHunt(currentState, "draw");
          events.push({
            kind: "huntTerminal",
            huntTimeMs: currentState.logicalTimeMs,
            reason: "draw",
          });
          continue;
        }
        if (outcome.winnerSideId !== encounter.playerSideId) {
          if (outcome.winnerSideId !== encounter.opponentSideId) {
            return reject("Solo Hunt Battle winner is not a known Hunt side");
          }
          currentState = terminalizeSoloHunt(currentState, "opponentVictory");
          events.push({
            kind: "huntTerminal",
            huntTimeMs: currentState.logicalTimeMs,
            reason: "opponentVictory",
          });
          continue;
        }

        const pending = currentState.pendingEncounterSelection;
        if (!pending || pending.pendingSelectionIdentity !== encounter.pendingSelectionIdentity) {
          return reject("successful Encounter does not match the current PendingEncounterSelection");
        }
        const evidence = completeEncounterEvidence(currentState, encounter);
        const provenance = completeEncounterProvenance(currentState, encounter, pending);
        const pruned = pruneSoloHuntEndedOpponentCadence(
          encounter.battle,
          encounter.policy,
          inputs.team,
        );
        if (!pruned.accepted) return reject(pruned.reason);
        events.push({
          kind: "encounterCompleted",
          huntTimeMs: currentState.logicalTimeMs,
          evidence,
        });
        currentState = {
          ...currentState,
          currentEncounter: undefined,
          pendingEncounterSelection: undefined,
          completedEncounters: [...currentState.completedEncounters, evidence],
          completedEncounterProvenance: [
            ...currentState.completedEncounterProvenance,
            provenance,
          ],
          ...(currentState.pendingCaptureDecision
            ? {}
            : { pendingCaptureDecision: captureDecisionFromEvidence(evidence) }),
          interBattle: {
            cadence: pruned.cadence,
            policy: pruned.policy,
            remainingGapMs: inputs.interBattleGapMs,
          },
        };
        continue;
      }

      if (currentState.logicalTimeMs === cutoffMs) {
        return { accepted: true, state: currentState, stopReason: "cutoff", events };
      }

      const resolved = resolveNextSoloHuntMove(
        encounter.battle,
        currentState.combatDeterministicState,
        encounter.policy,
      );
      if (resolved.kind === "rejected") return reject(resolved.reason);
      if (resolved.kind === "resolved") {
        events.push(...wrapCombatEvents(encounter, resolved.events));
        const outcome = battleOutcomeFromEvents(resolved.events);
        encounter = {
          ...encounter,
          battle: resolved.state,
          policy: resolved.policy,
          battleStimuli: [...encounter.battleStimuli, resolved.intent],
          ...(outcome ? { battleOutcome: outcome } : {}),
        };
        currentState = {
          ...currentState,
          logicalTimeMs: encounter.battleStartedAtHuntTimeMs + resolved.state.combatTimeMs,
          currentEncounter: encounter,
          combatDeterministicState: resolved.deterministicState,
        };
        continue;
      }

      const cutoffBattleTimeMs = cutoffMs - encounter.battleStartedAtHuntTimeMs;
      const nextBoundaryMs = Math.min(
        resolved.nextPolicyBoundaryMs ?? cutoffBattleTimeMs,
        cutoffBattleTimeMs,
      );
      if (!Number.isSafeInteger(nextBoundaryMs) || nextBoundaryMs <= encounter.battle.combatTimeMs) {
        return reject("Solo Hunt policy cannot make deterministic forward progress");
      }
      const advanced = resolveCombatStimulus(
        encounter.battle,
        { kind: "advanceTime", toMs: nextBoundaryMs },
        currentState.combatDeterministicState,
      );
      if (!advanced.accepted) return reject(advanced.reason);
      events.push(...wrapCombatEvents(encounter, advanced.events));
      const outcome = battleOutcomeFromEvents(advanced.events);
      encounter = {
        ...encounter,
        battle: advanced.state,
        battleStimuli: [
          ...encounter.battleStimuli,
          { kind: "advanceTime", toMs: nextBoundaryMs },
        ],
        ...(outcome ? { battleOutcome: outcome } : {}),
      };
      currentState = {
        ...currentState,
        logicalTimeMs: encounter.battleStartedAtHuntTimeMs + advanced.state.combatTimeMs,
        currentEncounter: encounter,
        combatDeterministicState: advanced.deterministicState,
      };
      continue;
    }

    if (currentState.interBattle) {
      if (currentState.logicalTimeMs === cutoffMs) {
        return { accepted: true, state: currentState, stopReason: "cutoff", events };
      }
      const between = currentState.interBattle;
      if (between.remainingGapMs > 0) {
        const availableMs = cutoffMs - currentState.logicalTimeMs;
        const requestedMs = Math.min(between.remainingGapMs, availableMs);
        if (requestedMs <= 0) {
          return { accepted: true, state: currentState, stopReason: "cutoff", events };
        }
        const advanced = advanceSoloHuntInterBattleCadence(
          between.cadence,
          inputs.context,
          currentState.combatDeterministicState,
          requestedMs,
        );
        if (!advanced.accepted) return reject(advanced.reason);
        events.push(...advanced.consequences.map(({ atOffsetMs, consequence }) => ({
          kind: "cadence" as const,
          huntTimeMs: currentState.logicalTimeMs + atOffsetMs,
          consequence,
        })));
        const nextLogicalTimeMs = currentState.logicalTimeMs + advanced.elapsedMs;
        const remainingGapMs = between.remainingGapMs - advanced.elapsedMs;
        currentState = {
          ...currentState,
          logicalTimeMs: nextLogicalTimeMs,
          combatDeterministicState: advanced.deterministicState,
          interBattle: {
            cadence: advanced.cadence,
            policy: between.policy,
            remainingGapMs,
          },
        };
        if (advanced.noLivingPlayer) {
          currentState = terminalizeSoloHunt(currentState, "noLivingTeam");
          events.push({
            kind: "huntTerminal",
            huntTimeMs: currentState.logicalTimeMs,
            reason: "noLivingTeam",
          });
          continue;
        }
        if (advanced.elapsedMs <= 0 && requestedMs > 0) {
          return reject("Solo Hunt inter-Battle cadence cannot make deterministic forward progress");
        }
        continue;
      }

      if (currentState.logicalTimeMs === cutoffMs) {
        return { accepted: true, state: currentState, stopReason: "cutoff", events };
      }
      const selected = selectPendingEncounter(inputs, currentState.policyRng);
      if (!selected.accepted) return reject(selected.reason);
      const ordinal = currentState.nextEncounterOrdinal;
      const built = buildCurrentEncounter(
        currentState.huntRunIdentity,
        ordinal,
        currentState.logicalTimeMs,
        inputs.team,
        between.cadence,
        between.policy,
        selected.pending,
        selected.selection,
        inputs.opponentTemplates,
        inputs.context,
        currentState.combatDeterministicState,
      );
      if (!built.accepted) return reject(built.reason);
      events.push(...built.events);
      currentState = {
        ...currentState,
        nextEncounterOrdinal: ordinal + 1,
        policyRng: selected.policyRng,
        combatDeterministicState: built.deterministicState,
        currentEncounter: built.encounter,
        interBattle: undefined,
        pendingEncounterSelection: selected.pending,
      };
      continue;
    }

    return reject("active Solo Hunt has neither an Encounter Battle nor inter-Battle cadence state");
  }
}

export interface SoloHuntMovePolicyState {
  readonly nextMoveSlotByParticipant: Readonly<Record<CadenceParticipantKey, number>>;
}

export function createFreshSoloHuntCadence(
  team: ReadonlyArray<SoloHuntTeamMemberSnapshot>,
): FreshSoloHuntCadenceResult {
  if (team.length === 0) {
    return { accepted: false, reason: "Solo Hunt requires at least one pinned Team member" };
  }

  const seenParticipants = new Set<PokemonInstanceId>();
  const hpEntries: Array<readonly [CadenceParticipantKey, number]> = [];
  const maxHpEntries: Array<readonly [CadenceParticipantKey, number]> = [];
  const readinessEntries: Array<readonly [CadenceParticipantKey, CadenceCarryState["readinessByParticipant"][CadenceParticipantKey]]> = [];
  const actionLockEntries: Array<readonly [CadenceParticipantKey, number]> = [];
  const cursorEntries: Array<readonly [CadenceParticipantKey, number]> = [];

  for (const member of team) {
    if (seenParticipants.has(member.pokemonInstanceId)) {
      return { accepted: false, reason: `duplicate pinned Team cadence identity: ${member.pokemonInstanceId}` };
    }
    seenParticipants.add(member.pokemonInstanceId);

    if (
      member.moveLoadout.length < 1
      || member.moveLoadout.length > 4
      || new Set(member.moveLoadout).size !== member.moveLoadout.length
    ) {
      return { accepted: false, reason: `invalid pinned Move loadout: ${member.pokemonInstanceId}` };
    }
    if (member.types.length < 1) {
      return { accepted: false, reason: `types required for pinned Team member: ${member.pokemonInstanceId}` };
    }

    const derived = deriveStats(member.baseStats, member.ivs, member.level);
    if (!derived) {
      return { accepted: false, reason: `invalid derived stats for pinned Team member: ${member.pokemonInstanceId}` };
    }

    const participant = {
      kind: "pokemonInstance" as const,
      identity: member.pokemonInstanceId,
    };
    const participantKey = cadenceParticipantKey(participant);
    hpEntries.push([participantKey, derived.hp]);
    maxHpEntries.push([participantKey, derived.hp]);
    readinessEntries.push([
      participantKey,
      {
        participant,
        moveLoadout: [...member.moveLoadout],
        nextActionRemainingMs: 0,
        moveCooldownRemainingMs: safeRecordFromEntries(
          member.moveLoadout.map((moveId) => [moveId, 0] as const),
        ),
      },
    ]);
    actionLockEntries.push([participantKey, 0]);
    cursorEntries.push([participantKey, 1]);
  }

  return {
    accepted: true,
    cadence: {
      effects: [],
      hpByParticipant: safeRecordFromEntries(hpEntries),
      maxHpByParticipant: safeRecordFromEntries(maxHpEntries),
      readinessByParticipant: safeRecordFromEntries(readinessEntries),
      actionLockRemainingMsByParticipant: safeRecordFromEntries(actionLockEntries),
    },
    policy: {
      nextMoveSlotByParticipant: safeRecordFromEntries(cursorEntries),
    },
  };
}

export type SoloHuntMoveResolution =
  | {
      readonly kind: "resolved";
      readonly state: BattleState;
      readonly deterministicState: DeterministicState;
      readonly policy: SoloHuntMovePolicyState;
      readonly intent: UseMoveIntent;
      readonly events: ReadonlyArray<CombatEvent>;
    }
  | {
      readonly kind: "idle";
      readonly state: BattleState;
      readonly deterministicState: DeterministicState;
      readonly policy: SoloHuntMovePolicyState;
      readonly nextPolicyBoundaryMs?: number;
      readonly events: readonly [];
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
      readonly state: BattleState;
      readonly deterministicState: DeterministicState;
      readonly policy: SoloHuntMovePolicyState;
      readonly events: readonly [];
    };

function participantEntries(state: BattleState): ReadonlyArray<readonly [CadenceParticipantKey, number]> {
  return Object.values(state.combatants)
    .filter((combatant) => combatant.cadenceParticipant !== undefined)
    .map((combatant) => [
      cadenceParticipantKey(combatant.cadenceParticipant!),
      combatant.moveLoadout.length,
    ] as const)
    .sort((left, right) => compareUtf8Bytes(left[0], right[0]));
}

export function createSoloHuntMovePolicyState(state: BattleState): SoloHuntMovePolicyState {
  return {
    nextMoveSlotByParticipant: safeRecordFromEntries(
      participantEntries(state).map(([participantKey]) => [participantKey, 1]),
    ),
  };
}

function validatePolicyState(
  state: BattleState,
  policy: SoloHuntMovePolicyState,
): string | undefined {
  const participants = participantEntries(state);
  const expectedKeys = participants.map(([participantKey]) => participantKey);
  const actualKeys = Object.keys(policy.nextMoveSlotByParticipant).sort(compareUtf8Bytes);
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((participantKey, index) => participantKey !== expectedKeys[index])
  ) {
    return "Solo Hunt Move cursor keys must exactly match Battle cadence participants";
  }
  for (const [participantKey, loadoutSize] of participants) {
    const cursor = ownGet(policy.nextMoveSlotByParticipant, participantKey);
    if (!Number.isSafeInteger(cursor) || cursor! < 1 || cursor! > loadoutSize) {
      return `Solo Hunt Move cursor is outside the frozen populated loadout: ${participantKey}`;
    }
  }
  return undefined;
}

function activeLivingCombatants(state: BattleState) {
  return state.sides
    .flatMap((side) => side.activeCombatantIds)
    .map((combatantId) => ownGet(state.combatants, combatantId))
    .filter((combatant): combatant is NonNullable<typeof combatant> =>
      combatant !== undefined && combatant.currentHp > 0,
    )
    .sort(compareInitiative);
}

function targetCandidates(state: BattleState): ReadonlyArray<CombatantId | undefined> {
  const ids = Object.keys(state.combatants) as CombatantId[];
  ids.sort(compareUtf8Bytes);
  return [undefined, ...ids];
}

function nextPolicyBoundaryMs(state: BattleState): number | undefined {
  const currentTimeMs = state.combatTimeMs;
  const candidates: number[] = [];

  for (const actor of activeLivingCombatants(state)) {
    const lockExpiresAtMs = Math.max(
      currentTimeMs,
      ...Object.values(actor.actionLockExpiresAtMsByScope ?? {}).filter(Number.isSafeInteger),
    );
    for (const moveId of actor.moveLoadout) {
      const readyAtMs = Math.max(
        actor.nextActionAtMs,
        ownGet(actor.moveReadyAtMs, moveId) ?? 0,
        lockExpiresAtMs,
      );
      if (Number.isSafeInteger(readyAtMs) && readyAtMs > currentTimeMs) {
        candidates.push(readyAtMs);
      }
    }
  }

  for (const effect of Object.values(state.effects)) {
    for (const boundaryMs of [effect.nextTickAtMs, effect.expiresAtMs]) {
      if (
        boundaryMs !== undefined
        && Number.isSafeInteger(boundaryMs)
        && boundaryMs > currentTimeMs
      ) {
        candidates.push(boundaryMs);
      }
    }
  }

  return candidates.length > 0 ? Math.min(...candidates) : undefined;
}

export function resolveNextSoloHuntMove(
  state: BattleState,
  deterministicState: DeterministicState,
  policy: SoloHuntMovePolicyState,
): SoloHuntMoveResolution {
  const policyError = validatePolicyState(state, policy);
  if (policyError) {
    return {
      kind: "rejected",
      reason: policyError,
      state,
      deterministicState,
      policy,
      events: [],
    };
  }
  if (state.status !== "active") {
    return {
      kind: "rejected",
      reason: "Solo Hunt Move policy requires an active Battle",
      state,
      deterministicState,
      policy,
      events: [],
    };
  }
  if (state.replacementPendingSideIds.length > 0) {
    return { kind: "idle", state, deterministicState, policy, events: [] };
  }

  for (const actor of activeLivingCombatants(state)) {
    if (!actor.cadenceParticipant) {
      return {
        kind: "rejected",
        reason: `Solo Hunt active Combatant is missing cadence identity: ${actor.combatantId}`,
        state,
        deterministicState,
        policy,
        events: [],
      };
    }
    const participantKey = cadenceParticipantKey(actor.cadenceParticipant);
    const cursor = ownGet(policy.nextMoveSlotByParticipant, participantKey)!;
    for (let offset = 0; offset < actor.moveLoadout.length; offset += 1) {
      const slotIndex = (cursor - 1 + offset) % actor.moveLoadout.length;
      const moveId = actor.moveLoadout[slotIndex]!;
      for (const targetId of targetCandidates(state)) {
        const intent: UseMoveIntent = {
          kind: "useMove",
          actorId: actor.combatantId,
          moveId,
          ...(targetId === undefined ? {} : { targetId }),
        };
        const result = resolveCombatStimulus(state, intent, deterministicState);
        if (!result.accepted) continue;
        const nextSlot = (slotIndex + 1) % actor.moveLoadout.length + 1;
        return {
          kind: "resolved",
          state: result.state,
          deterministicState: result.deterministicState,
          policy: {
            nextMoveSlotByParticipant: safeRecordWith(
              policy.nextMoveSlotByParticipant,
              participantKey,
              nextSlot,
            ),
          },
          intent,
          events: result.events,
        };
      }
    }
  }

  const boundaryMs = nextPolicyBoundaryMs(state);
  return {
    kind: "idle",
    state,
    deterministicState,
    policy,
    ...(boundaryMs === undefined ? {} : { nextPolicyBoundaryMs: boundaryMs }),
    events: [],
  };
}
