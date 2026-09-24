export {
  createCadenceCarry,
  initializeBattle,
  resolveCombatStimulus,
} from "./battle";
export { deriveSimpleDamageMoveCooldownMs } from "./cooldown";
export { advanceCadence } from "./effects";
export * from "./move-eligibility";
export * from "./production-combat-rules";
export { createRngState, nextRngState } from "./rng";
export * from "./progression";
export {
  advanceSoloHuntToCutoff,
  createSoloHuntMovePolicyState,
  createSoloHuntRuntime,
  resolveNextSoloHuntMove,
} from "./solo-hunt";
export type {
  AdvanceSoloHuntResult,
  CreateSoloHuntRuntimeInput,
  CreateSoloHuntRuntimeResult,
  SoloHuntCompletedEncounterProvenance,
  SoloHuntCompletedEncounterEvidence,
  SoloHuntEncounterOption,
  SoloHuntMovePolicyState,
  SoloHuntMoveResolution,
  SoloHuntOpponentTemplate,
  SoloHuntParticipantActivationProvenance,
  SoloHuntPendingCaptureDecision,
  SoloHuntPendingEncounterSelection,
  SoloHuntRuntimeInputs,
  SoloHuntRuntimeState,
  SoloHuntSimulationEvent,
  SoloHuntSelectionStreamOrigin,
  SoloHuntTeamMemberSnapshot,
} from "./solo-hunt";
export { cadenceParticipantKey } from "./types";
export type * from "./types";

export const PACKAGE_NAME = "@pokenexus/game-core" as const;
