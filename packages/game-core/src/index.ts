export {
  createCadenceCarry,
  initializeBattle,
  resolveCombatStimulus,
} from "./battle";
export { deriveSimpleDamageMoveCooldownMs } from "./cooldown";
export { advanceCadence } from "./effects";
export { createRngState, nextRngState } from "./rng";
export { cadenceParticipantKey } from "./types";
export type * from "./types";

export const PACKAGE_NAME = "@pokenexus/game-core" as const;
