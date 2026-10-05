export {
  createCadenceCarry,
  initializeBattle,
  resolveCombatStimulus,
} from "./battle";
export { deriveSimpleDamageMoveCooldownMs } from "./cooldown";
export * from "./capture-reward";
export { advanceCadence, applyCadenceExternalHpHeal, applyCadenceRevive } from "./effects";
export { evaluateInstantHpHealing } from "./effects";
export type { InstantHpHealingResult } from "./effects";
export {
  MANAGEMENT_FIRST_COMBAT_EVENT_SCHEMA_VERSION_V1,
  MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1,
} from "./management-first-combat-rules";
export {
  ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
  GENETIC_PROFILES,
  allocateGeneticBudget,
  geneticBudgetForScore,
  individualizeEncounter,
  sameIndividualizationSnapshot,
} from "./encounter-individualization";
export type * from "./encounter-individualization";
export * from "./hunt-automation-policy";
export {
  GENETIC_COMBAT_RULES_RELEASE_V1,
  GENETIC_COMBAT_RULES_RELEASE_V2,
  GENETIC_COMBAT_RULES_SEMANTICS_HASH_V1,
  GENETIC_COMBAT_RULES_SEMANTICS_HASH_V2,
  GENETIC_COMBAT_RULES_VERSION_V1,
  GENETIC_COMBAT_RULES_VERSION_V2,
  isGeneticCombatRulesVersion,
  usesGeneticCombatSemantics,
} from "./genetic-combat-rules";
export * from "./move-eligibility";
export * from "./production-combat-rules";
export {
  SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V1,
  SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V2,
  SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V3,
  SOLO_HUNT_DEFAULT_SEGMENT_MS,
  advanceSoloHuntSegmentedToCutoff,
  decodeSoloHuntCheckpoint,
  decodeSoloHuntCheckpointV1,
  decodeSoloHuntCheckpointV2,
  decodeSoloHuntCheckpointV3,
  encodeSoloHuntCheckpointV1,
  encodeSoloHuntCheckpointV2,
  encodeSoloHuntCheckpointV3,
} from "./solo-hunt-checkpoint";
export type { SoloHuntCheckpointDecodeResult } from "./solo-hunt-checkpoint";
export { createRngState, nextRngState } from "./rng";
export * from "./progression";
export {
  advanceSoloHuntToCutoff,
  advanceSoloHuntToAutomationBoundaryOrEncounterBoundaryOrCutoff,
  applySoloHuntBattleAutoPotion,
  applySoloHuntBattleAutoRevive,
  applySoloHuntExplicitHealing,
  applySoloHuntInterBattleAutoPotion,
  applySoloHuntInterBattleAutoRevive,
  applySoloHuntPostBattleAutoRevive,
  createSoloHuntMovePolicyState,
  createSoloHuntRuntime,
  declineSoloHuntBattleAutoRevive,
  declineSoloHuntInterBattleAutoRevive,
  declineSoloHuntPostBattleAutoRevive,
  advanceSoloHuntToEncounterBoundaryOrCutoff,
  replayValidateSoloHuntCaptureSource,
  replayValidateSoloHuntCompletedCaptureSource,
  replayValidateSoloHuntRewardSource,
  resolveNextSoloHuntMove,
} from "./solo-hunt";
export type {
  AdvanceSoloHuntResult,
  AdvanceSoloHuntToAutomationBoundaryResult,
  AdvanceSoloHuntToEncounterBoundaryResult,
  ApplySoloHuntAutomationItemResult,
  ApplySoloHuntExplicitHealingResult,
  CreateSoloHuntRuntimeInput,
  CreateSoloHuntRuntimeResult,
  SoloHuntCompletedEncounterProvenance,
  SoloHuntCompletedEncounterEvidence,
  SoloHuntAppliedHealingEvent,
  SoloHuntAppliedAutomationEvent,
  SoloHuntEncounterOption,
  SoloHuntMovePolicyState,
  SoloHuntMoveResolution,
  SoloHuntOpponentTemplate,
  SoloHuntParticipantActivationProvenance,
  SoloHuntPendingCaptureDecision,
  SoloHuntPendingEncounterSelection,
  SoloHuntRuntimeInputs,
  SoloHuntRuntimeState,
  ReplayValidatedSoloHuntRewardSourceResult,
  ReplayValidatedSoloHuntCaptureSourceResult,
  SoloHuntSimulationEvent,
  SoloHuntSelectionStreamOrigin,
  SoloHuntTeamMemberSnapshot,
} from "./solo-hunt";
export { cadenceParticipantKey } from "./types";
export type * from "./types";
export { deriveMaxHpForRulesVersion } from "./validation";

export const PACKAGE_NAME = "@pokenexus/game-core" as const;
