import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import type { SpeciesId } from "@pokenexus/game-types";
import {
  allocateGeneticBudget,
  canonicalSerializeEncounterIndividualizationRootInputV1,
  deriveEncounterIndividualizationAuthorityKeyIdV1,
  ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
  geneticBudgetForScore,
  individualizeEncounter,
} from "./encounter-individualization";
import {
  canonicalSerializeGeneticCombatRulesReleaseV1,
  canonicalSerializeGeneticCombatRulesReleaseV2,
  GENETIC_COMBAT_RULES_RELEASE_V1,
  GENETIC_COMBAT_RULES_RELEASE_V2,
  GENETIC_COMBAT_RULES_SEMANTICS_HASH_V1,
  GENETIC_COMBAT_RULES_SEMANTICS_HASH_V2,
} from "./genetic-combat-rules";
import { deriveStatsForRulesVersion } from "./validation";

function authority(secretByte = 7) {
  const secretKey = new Uint8Array(32).fill(secretByte);
  return {
    rulesVersion: ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
    authorityVersion: "authority-v1",
    keyId: deriveEncounterIndividualizationAuthorityKeyIdV1(secretKey),
    secretKey,
  } as const;
}

describe("Encounter individualization", () => {
  it("uses the accepted exact Score -> Budget interpolation examples", () => {
    expect([
      0, 20, 39, 40, 50, 64, 65, 70, 78, 82, 83, 88, 94, 95, 96, 97, 98, 99, 100,
    ].map((score) => [score, geneticBudgetForScore(score)])).toEqual([
      [0, 0],
      [20, 5],
      [39, 10],
      [40, 11],
      [50, 15],
      [64, 20],
      [65, 21],
      [70, 25],
      [78, 31],
      [82, 34],
      [83, 35],
      [88, 42],
      [94, 50],
      [95, 51],
      [96, 55],
      [97, 59],
      [98, 62],
      [99, 66],
      [100, 70],
    ]);
  });

  it("allocates the full Genetic Budget with deterministic remainder ties", () => {
    for (const profile of ["Harmony", "Might", "Clarity", "Endurance", "Resilience"] as const) {
      for (const budget of [0, 1, 5, 11, 31, 51, 70]) {
        const allocation = allocateGeneticBudget(budget, profile);
        expect(Object.values(allocation).reduce((sum, value) => sum + value, 0)).toBe(budget);
      }
    }
    expect(allocateGeneticBudget(1, "Harmony")).toEqual({
      hp: 1, atk: 0, def: 0, spa: 0, spd: 0, spe: 0,
    });
  });

  it("reproduces the exact same hidden individual for the same pending token and authority", () => {
    const input = {
      pendingSelectionIdentity: "pending:stable-token",
      speciesId: "species:charizard" as SpeciesId,
      level: 73,
      compatibleProfiles: ["Might", "Clarity"] as const,
      authority: authority(),
    };
    const first = individualizeEncounter(input);
    const second = individualizeEncounter(input);
    expect(second).toEqual(first);
    expect(first.ivs.hp).toBeGreaterThanOrEqual(0);
    expect(first.ivs.hp).toBeLessThanOrEqual(31);
    expect(first.profileAllocations.map((entry) => entry.profile)).toEqual(["Might", "Clarity"]);
    expect(first.profileAllocations.find((entry) => entry.profile === first.birthProfile)?.bonuses)
      .toEqual(first.birthGeneticBonuses);
    expect(first.isAscendant).toBe(first.shiny && first.geneticGrade === "Apex");
    expect(first.individualizationSnapshotIdentity).toMatch(/^indv1:[0-9a-f]{64}$/);
    expect(first.individualizationSnapshotCommitment).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("changes the individual if the stable pending token or retained authority identity changes", () => {
    const base = {
      pendingSelectionIdentity: "pending:a",
      speciesId: "species:dragonite" as SpeciesId,
      level: 55,
      compatibleProfiles: ["Harmony", "Endurance"] as const,
      authority: authority(),
    };
    const original = individualizeEncounter(base);
    expect(individualizeEncounter({ ...base, pendingSelectionIdentity: "pending:b" }))
      .not.toEqual(original);
    expect(individualizeEncounter({ ...base, authority: authority(8) }))
      .not.toEqual(original);
  });

  it("fails closed if secret material rotates under the same retained authority key identity", () => {
    const originalAuthority = authority();
    expect(() => individualizeEncounter({
      pendingSelectionIdentity: "pending:a",
      speciesId: "species:dragonite" as SpeciesId,
      level: 55,
      compatibleProfiles: ["Harmony", "Endurance"],
      authority: {
        ...originalAuthority,
        secretKey: new Uint8Array(32).fill(8),
      },
    })).toThrow(/keyId does not match secretKey/);
  });

  it("matches the frozen v1 canonical-input and individualization conformance vector", () => {
    const input = {
      pendingSelectionIdentity: "pending:stable-token",
      speciesId: "species:charizard" as SpeciesId,
      level: 73,
      compatibleProfiles: ["Might", "Clarity"] as const,
      authority: authority(),
    };
    expect(input.authority.keyId).toBe(
      "key-v1:9b5c18bad305b6fd28b50973bdec327f4506747cb8da14b25d0a2b3a1ac822ee",
    );
    expect(canonicalSerializeEncounterIndividualizationRootInputV1(input)).toBe(
      "[\"pokenexus-individualization-root\",\"encounter-individualization-v1\",\"authority-v1\",\"key-v1:9b5c18bad305b6fd28b50973bdec327f4506747cb8da14b25d0a2b3a1ac822ee\",\"pending:stable-token\",\"species:charizard\",73,\"Might\",\"Clarity\"]",
    );
    expect(individualizeEncounter(input)).toEqual({
      pendingSelectionIdentity: "pending:stable-token",
      speciesId: "species:charizard",
      level: 73,
      ivs: { hp: 14, atk: 9, def: 18, spa: 11, spd: 18, spe: 19 },
      geneticScore: 37,
      geneticGrade: "Normal",
      geneticBudget: 9,
      compatibleProfiles: ["Might", "Clarity"],
      birthProfile: "Might",
      birthGeneticBonuses: { hp: 2, atk: 2, def: 1, spa: 1, spd: 1, spe: 2 },
      profileAllocations: [
        { profile: "Might", bonuses: { hp: 2, atk: 2, def: 1, spa: 1, spd: 1, spe: 2 } },
        { profile: "Clarity", bonuses: { hp: 2, atk: 1, def: 1, spa: 2, spd: 1, spe: 2 } },
      ],
      shiny: false,
      isAscendant: false,
      individualizationRulesVersion: "encounter-individualization-v1",
      derivationAuthorityVersion: "authority-v1",
      derivationAuthorityKeyId:
        "key-v1:9b5c18bad305b6fd28b50973bdec327f4506747cb8da14b25d0a2b3a1ac822ee",
      individualizationSnapshotIdentity:
        "indv1:c93b4975d9c61dc503ac30a9a37f094355642fbb5b2fffcef97ed56a11c62472",
      individualizationSnapshotCommitment:
        "sha256:fb15afa66b937f37f12fe0307135d237e8bda1d520a68025852fbaa78fd6900b",
    });
  });

  it("freezes the Genetic combat-rules semantics under a content hash", () => {
    const digest = createHash("sha256")
      .update(canonicalSerializeGeneticCombatRulesReleaseV1(), "utf8")
      .digest("hex");
    expect(`sha256:${digest}`).toBe(GENETIC_COMBAT_RULES_SEMANTICS_HASH_V1);
    expect(GENETIC_COMBAT_RULES_RELEASE_V1.derivedStats.geneticBudgetMax).toBe(70);
    const v2Digest = createHash("sha256")
      .update(canonicalSerializeGeneticCombatRulesReleaseV2(), "utf8")
      .digest("hex");
    expect(`sha256:${v2Digest}`).toBe(GENETIC_COMBAT_RULES_SEMANTICS_HASH_V2);
    expect(GENETIC_COMBAT_RULES_RELEASE_V2.derivedStats).toEqual(
      GENETIC_COMBAT_RULES_RELEASE_V1.derivedStats,
    );
  });

  it("rejects a Genetic Bonus vector outside the accepted total budget", () => {
    const valid = deriveStatsForRulesVersion(
      GENETIC_COMBAT_RULES_RELEASE_V1.rulesVersion,
      { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
      { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      100,
      { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 },
    );
    expect(valid).toEqual({ hp: 361, atk: 246, def: 246, spa: 246, spd: 246, spe: 246 });
    expect(deriveStatsForRulesVersion(
      GENETIC_COMBAT_RULES_RELEASE_V2.rulesVersion,
      { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
      { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      100,
      { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 },
    )).toEqual(valid);
    expect(deriveStatsForRulesVersion(
      GENETIC_COMBAT_RULES_RELEASE_V1.rulesVersion,
      { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
      { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      100,
      { hp: 20, atk: 11, def: 10, spa: 10, spd: 10, spe: 10 },
    )).toBeUndefined();
  });

  it("rejects invalid profile pairs and weak derivation secrets", () => {
    expect(() => individualizeEncounter({
      pendingSelectionIdentity: "pending:a",
      speciesId: "species:snorlax" as SpeciesId,
      level: 1,
      compatibleProfiles: ["Harmony", "Harmony"],
      authority: authority(),
    })).toThrow(/two distinct/);
    expect(() => individualizeEncounter({
      pendingSelectionIdentity: "pending:a",
      speciesId: "species:snorlax" as SpeciesId,
      level: 1,
      compatibleProfiles: ["Harmony", "Endurance"],
      authority: {
        rulesVersion: ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
        authorityVersion: "authority-v1",
        keyId: "key-v1:invalid",
        secretKey: new Uint8Array(16),
      },
    })).toThrow(/256 bits/);
  });
});
