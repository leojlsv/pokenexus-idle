import { describe, expect, it } from "vitest";
import * as publicApi from "./index";

describe("game-core entrypoint", () => {
  it("exposes the package identity marker", () => {
    expect(publicApi.PACKAGE_NAME).toBe("@pokenexus/game-core");
  });

  it("keeps the runtime public surface limited to authoritative entrypoints and continuation helpers", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      "MOVE_ELIGIBILITY_RULE_ARTIFACT_ID",
      "PACKAGE_NAME",
      "PLAYER_PROGRESSION_RULE_ID",
      "POKEMON_LEVEL_CAP",
      "POKEMON_PROGRESSION_RULE_ID",
      "POKEMON_XP_CAP",
      "advanceCadence",
      "cadenceParticipantKey",
      "createCadenceCarry",
      "createRngState",
      "deriveLevelAvailableMoves",
      "deriveSimpleDamageMoveCooldownMs",
      "evaluatePlayerXpGrant",
      "evaluatePokemonXpGrant",
      "initializeBattle",
      "nextRngState",
      "playerLevelForExperience",
      "playerXpFloor",
      "pokemonLevelForExperience",
      "pokemonXpFloor",
      "resolveCombatStimulus",
      "selectBootstrapMoveLoadout",
    ].sort());
  });
});
