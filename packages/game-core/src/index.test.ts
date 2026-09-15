import { describe, expect, it } from "vitest";
import * as publicApi from "./index";

describe("game-core entrypoint", () => {
  it("exposes the package identity marker", () => {
    expect(publicApi.PACKAGE_NAME).toBe("@pokenexus/game-core");
  });

  it("keeps the runtime public surface limited to authoritative entrypoints and continuation helpers", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      "PACKAGE_NAME",
      "advanceCadence",
      "cadenceParticipantKey",
      "createCadenceCarry",
      "createRngState",
      "deriveSimpleDamageMoveCooldownMs",
      "initializeBattle",
      "nextRngState",
      "resolveCombatStimulus",
    ].sort());
  });
});
