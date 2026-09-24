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
      "PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH",
      "PRODUCTION_COMBAT_GAME_DATA_BUNDLE_HASH_V2",
      "PRODUCTION_COMBAT_GAME_DATA_VERSION",
      "PRODUCTION_COMBAT_GAME_DATA_VERSION_V2",
      "PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID",
      "PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID_V2",
      "PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH",
      "PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH_V2",
      "PRODUCTION_COMBAT_RULE_CATALOG_V1",
      "PRODUCTION_COMBAT_RULE_CATALOG_V2",
      "PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID",
      "PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID_V2",
      "PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH",
      "PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH_V2",
      "PRODUCTION_MOVE_SELECTABILITY_RULE_ARTIFACT_ID",
      "PRODUCTION_MOVE_SELECTABILITY_RULE_SEMANTICS_HASH",
      "PRODUCTION_TARGET_DISPOSITIONS_V1",
      "advanceCadence",
      "advanceSoloHuntToCutoff",
      "assertProductionMoveLoadoutExecutable",
      "buildProductionMoveCoverageReport",
      "cadenceParticipantKey",
      "canonicalSerializeProductionCombatRuleCatalog",
      "createCadenceCarry",
      "createRngState",
      "createSoloHuntMovePolicyState",
      "createSoloHuntRuntime",
      "deriveLevelAvailableMoves",
      "deriveSimpleDamageMoveCooldownMs",
      "evaluatePlayerXpGrant",
      "evaluatePokemonXpGrant",
      "hashCanonicalProductionCombatRuleCatalog",
      "initializeBattle",
      "isProductionMoveExecutable",
      "loadApprovedProductionCombatRuleCatalogV1",
      "loadApprovedProductionCombatRuleCatalogV2",
      "nextRngState",
      "playerLevelForExperience",
      "playerXpFloor",
      "pokemonLevelForExperience",
      "pokemonXpFloor",
      "resolveCombatStimulus",
      "resolveNextSoloHuntMove",
      "resolveProductionBattleAbility",
      "resolveProductionAbilityRuleForBattle",
      "selectBootstrapMoveLoadout",
      "validateProductionCombatRuleCatalogAgainstGameData",
      "validateProductionCombatSupportProfile",
      "validateProductionCombatSupportProfileV2",
    ].sort());
  });
});
