export {
  createCadenceCarry,
  initializeBattle,
  resolveCombatStimulus,
} from "./battle";
export { deriveSimpleDamageMoveCooldownMs } from "./cooldown";
export * from "./capture-reward";
export { advanceCadence } from "./effects";
export { evaluateInstantHpHealing } from "./effects";
export type { InstantHpHealingResult } from "./effects";
export {
  ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
  GENETIC_PROFILES,
  allocateGeneticBudget,
  geneticBudgetForScore,
  individualizeEncounter,
  sameIndividualizationSnapshot,
} from "./encounter-individualization";
export type * from "./encounter-individualization";
export {
  GENETIC_COMBAT_RULES_RELEASE_V1,
  GENETIC_COMBAT_RULES_SEMANTICS_HASH_V1,
  GENETIC_COMBAT_RULES_VERSION_V1,
} from "./genetic-combat-rules";
export * from "./move-eligibility";
export * from "./production-combat-rules";
export {
  SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V1,
  SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V2,
  SOLO_HUNT_DEFAULT_SEGMENT_MS,
  advanceSoloHuntSegmentedToCutoff,
  decodeSoloHuntCheckpoint,
  decodeSoloHuntCheckpointV1,
  decodeSoloHuntCheckpointV2,
  encodeSoloHuntCheckpointV1,
  encodeSoloHuntCheckpointV2,
} from "./solo-hunt-checkpoint";
export type { SoloHuntCheckpointDecodeResult } from "./solo-hunt-checkpoint";
export { createRngState, nextRngState } from "./rng";
export * from "./progression";
export {
  advanceSoloHuntToCutoff,
  applySoloHuntExplicitHealing,
  createSoloHuntMovePolicyState,
  createSoloHuntRuntime,
  advanceSoloHuntToEncounterBoundaryOrCutoff,
  replayValidateSoloHuntCaptureSource,
  replayValidateSoloHuntCompletedCaptureSource,
  replayValidateSoloHuntRewardSource,
  resolveNextSoloHuntMove,
} from "./solo-hunt";
export type {
  AdvanceSoloHuntResult,
  AdvanceSoloHuntToEncounterBoundaryResult,
  ApplySoloHuntExplicitHealingResult,
  CreateSoloHuntRuntimeInput,
  CreateSoloHuntRuntimeResult,
  SoloHuntCompletedEncounterProvenance,
  SoloHuntCompletedEncounterEvidence,
  SoloHuntAppliedHealingEvent,
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
