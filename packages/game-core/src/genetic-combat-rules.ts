import type { RulesVersion } from "./types";
import { MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1 } from "./management-first-combat-rules";

export const GENETIC_COMBAT_RULES_VERSION_V1 =
  "combat-rules-genetics-v1" as RulesVersion;

export const GENETIC_COMBAT_RULES_VERSION_V2 =
  "combat-rules-genetics-v2" as RulesVersion;

export const GENETIC_COMBAT_RULES_SEMANTICS_HASH_V1 =
  "sha256:bfca13ce270969f4a6cf082633dc7fa306032d297010649b5c488dd0d099d350" as const;

export const GENETIC_COMBAT_RULES_SEMANTICS_HASH_V2 =
  "sha256:266b36028ab0410e698d5cda75ff41b84564c5eb2e4b9a515498f4db5af3a53e" as const;

const GENETIC_DERIVED_STATS = Object.freeze({
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
});

export const GENETIC_COMBAT_RULES_RELEASE_V1 = Object.freeze({
  rulesVersion: GENETIC_COMBAT_RULES_VERSION_V1,
  semanticsHash: GENETIC_COMBAT_RULES_SEMANTICS_HASH_V1,
  derivedStats: GENETIC_DERIVED_STATS,
});

export const GENETIC_COMBAT_RULES_RELEASE_V2 = Object.freeze({
  rulesVersion: GENETIC_COMBAT_RULES_VERSION_V2,
  semanticsHash: GENETIC_COMBAT_RULES_SEMANTICS_HASH_V2,
  derivedStats: GENETIC_DERIVED_STATS,
});

export function isGeneticCombatRulesVersion(value: string): boolean {
  return value === GENETIC_COMBAT_RULES_VERSION_V1 || value === GENETIC_COMBAT_RULES_VERSION_V2;
}

/**
 * Forward management-first combat preserves the accepted Genetic derived-stat /
 * individualization semantics while adding TASK-107 cadence/intervention rules.
 * Keep this separate from isGeneticCombatRulesVersion so immutable Genetic
 * release identity checks remain literal.
 */
export function usesGeneticCombatSemantics(value: string): boolean {
  return isGeneticCombatRulesVersion(value) || value === MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1;
}

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

export function canonicalSerializeGeneticCombatRulesReleaseV2(): string {
  const release = GENETIC_COMBAT_RULES_RELEASE_V2;
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
