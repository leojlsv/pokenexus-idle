import { describe, expect, it } from "vitest";
import { noLivingHuntDisposition, publicRetreatTerminalReason } from "./terminal-disposition";

describe("approved public v1 Solo Hunt terminal disposition", () => {
  it.each(["noLivingTeam", "opponentVictory", "draw"] as const)(
    "classifies deterministic %s as Hunt no_living without changing the original cause",
    (original) => {
      expect(noLivingHuntDisposition(original)).toBe("no_living");
      expect(original).not.toBe("no_living");
    },
  );

  it.each(["no_living", "draw", "opponent_victory", "retreat"] as const)(
    "maps existing persisted %s to an approved public retreat result",
    (persisted) => {
      expect(publicRetreatTerminalReason(persisted))
        .toBe(persisted === "retreat" ? "retreat" : "no_living");
    },
  );

  it("fails closed on missing or unknown terminal causes", () => {
    expect(() => publicRetreatTerminalReason(null)).toThrow("Unexpected Solo Hunt");
    expect(() => noLivingHuntDisposition(undefined)).toThrow("Unexpected Solo Hunt");
    expect(() => noLivingHuntDisposition("unknown" as "noLivingTeam")).toThrow("Unexpected Solo Hunt");
    expect(() => publicRetreatTerminalReason("unknown" as "retreat")).toThrow("Unexpected Solo Hunt");
  });
});
