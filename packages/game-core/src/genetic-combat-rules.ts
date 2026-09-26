import type { RulesVersion } from "./types";

export const GENETIC_COMBAT_RULES_VERSION_V1 =
  "combat-rules-genetics-v1" as RulesVersion;

export const GENETIC_COMBAT_RULES_SEMANTICS_HASH_V1 =
  "sha256:bfca13ce270969f4a6cf082633dc7fa306032d297010649b5c488dd0d099d350" as const;

export const GENETIC_COMBAT_RULES_RELEASE_V1 = Object.freeze({
  rulesVersion: GENETIC_COMBAT_RULES_VERSION_V1,
  semanticsHash: GENETIC_COMBAT_RULES_SEMANTICS_HASH_V1,
  derivedStats: Object.freeze({
    canonicalIvMin: 0,
    canonicalIvMax: 31,
    geneticBudgetMin: 0,
    geneticBudgetMax: 70,
    levelMin: 1,
    levelMax: 200,
    geneticBonusMode: "separate-additive-input-before-level-scaling" as const,
    scaleNumerator: "2*B+I+G" as const,
    scaleDenominator: 100,
    rounding: "floor" as const,
    hpLevelBonus: true,
    hpFlatBonus: 10,
    otherFlatBonus: 5,
  }),
});

export function canonicalSerializeGeneticCombatRulesReleaseV1(): string {
  const release = GENETIC_COMBAT_RULES_RELEASE_V1;
  return JSON.stringify({
    rulesVersion: release.rulesVersion,
    derivedStats: {
      canonicalIvMin: release.derivedStats.canonicalIvMin,
      canonicalIvMax: release.derivedStats.canonicalIvMax,
      geneticBudgetMin: release.derivedStats.geneticBudgetMin,
      geneticBudgetMax: release.derivedStats.geneticBudgetMax,
      levelMin: release.derivedStats.levelMin,
      levelMax: release.derivedStats.levelMax,
      geneticBonusMode: release.derivedStats.geneticBonusMode,
      scaleNumerator: release.derivedStats.scaleNumerator,
      scaleDenominator: release.derivedStats.scaleDenominator,
      rounding: release.derivedStats.rounding,
      hpLevelBonus: release.derivedStats.hpLevelBonus,
      hpFlatBonus: release.derivedStats.hpFlatBonus,
      otherFlatBonus: release.derivedStats.otherFlatBonus,
    },
  });
}
