import type { SoloHuntRecord } from "@pokenexus/database";
import type { SoloHuntRuntimeState } from "@pokenexus/game-core";

type EncounterTerminalReason = NonNullable<SoloHuntRuntimeState["terminalReason"]>;

export function noLivingHuntDisposition(
  reason: EncounterTerminalReason | "no_living" | "opponent_victory" | undefined,
): "no_living" {
  // Keep SPEC-003's actual BattleEnded cause in the deterministic checkpoint.
  // SPEC-013 classifies all non-victorious Solo Hunt Battles as no-living,
  // not as a successful Encounter or an explicit Player retreat.
  if (reason === "noLivingTeam" || reason === "no_living" ||
    reason === "opponentVictory" || reason === "opponent_victory" || reason === "draw") {
    return "no_living";
  }
  throw new Error("Unexpected Solo Hunt no-living terminal reason");
}

export function publicRetreatTerminalReason(
  persistedReason: SoloHuntRecord["terminalReason"],
): "retreat" | "no_living" {
  if (persistedReason === "retreat") return "retreat";
  if (persistedReason === null) throw new Error("Unexpected Solo Hunt terminal reason");
  return noLivingHuntDisposition(persistedReason);
}
