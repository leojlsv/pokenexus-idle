import { createHmac } from "node:crypto";
import type { SpeciesId, StatBlock } from "@pokenexus/game-types";
import { drawUniformInteger } from "./combat-math";
import type { DeterministicRngState } from "./types";

export const ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1 =
  "encounter-individualization-v1" as const;

export const GENETIC_PROFILES = [
  "Harmony",
  "Might",
  "Clarity",
  "Endurance",
  "Resilience",
] as const;

export type GeneticProfile = (typeof GENETIC_PROFILES)[number];
export type GeneticGrade = "Normal" | "Uncommon" | "Rare" | "Epic" | "Apex";

export interface EncounterIndividualizationAuthority {
  readonly rulesVersion: typeof ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1;
  readonly authorityVersion: string;
  readonly keyId: string;
  readonly secretKey: Uint8Array;
}

export interface EncounterIndividualizationInput {
  readonly pendingSelectionIdentity: string;
  readonly speciesId: SpeciesId;
  readonly level: number;
  readonly compatibleProfiles: readonly [GeneticProfile, GeneticProfile];
  readonly authority: EncounterIndividualizationAuthority;
}

export interface GeneticProfileAllocation {
  readonly profile: GeneticProfile;
  readonly bonuses: StatBlock<number>;
}

export interface EncounterIndividualizationSnapshot {
  readonly pendingSelectionIdentity: string;
  readonly speciesId: SpeciesId;
  readonly level: number;
  readonly ivs: StatBlock<number>;
  readonly geneticScore: number;
  readonly geneticGrade: GeneticGrade;
  readonly geneticBudget: number;
  readonly compatibleProfiles: readonly [GeneticProfile, GeneticProfile];
  readonly birthProfile: GeneticProfile;
  readonly birthGeneticBonuses: StatBlock<number>;
  readonly profileAllocations: readonly [GeneticProfileAllocation, GeneticProfileAllocation];
  readonly shiny: boolean;
  readonly isAscendant: boolean;
  readonly individualizationRulesVersion: typeof ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1;
  readonly derivationAuthorityVersion: string;
  readonly derivationAuthorityKeyId: string;
  readonly individualizationSnapshotIdentity: string;
  readonly individualizationSnapshotCommitment: string;
}

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

const PROFILE_WEIGHTS: Readonly<Record<GeneticProfile, StatBlock<number>>> = {
  Harmony: { hp: 17, atk: 17, def: 17, spa: 17, spd: 16, spe: 16 },
  Might: { hp: 15, atk: 25, def: 15, spa: 10, spd: 15, spe: 20 },
  Clarity: { hp: 15, atk: 10, def: 15, spa: 25, spd: 15, spe: 20 },
  Endurance: { hp: 20, atk: 15, def: 25, spa: 10, spd: 20, spe: 10 },
  Resilience: { hp: 20, atk: 10, def: 20, spa: 15, spd: 25, spe: 10 },
};

const GRADE_BANDS: Readonly<Record<GeneticGrade, {
  readonly scoreMin: number;
  readonly scoreMax: number;
  readonly budgetMin: number;
  readonly budgetMax: number;
}>> = {
  Normal: { scoreMin: 0, scoreMax: 39, budgetMin: 0, budgetMax: 10 },
  Uncommon: { scoreMin: 40, scoreMax: 64, budgetMin: 11, budgetMax: 20 },
  Rare: { scoreMin: 65, scoreMax: 82, budgetMin: 21, budgetMax: 34 },
  Epic: { scoreMin: 83, scoreMax: 94, budgetMin: 35, budgetMax: 50 },
  Apex: { scoreMin: 95, scoreMax: 100, budgetMin: 51, budgetMax: 70 },
};

function isGeneticProfile(value: unknown): value is GeneticProfile {
  return typeof value === "string" && (GENETIC_PROFILES as readonly string[]).includes(value);
}

function assertInput(input: EncounterIndividualizationInput): void {
  if (!input.pendingSelectionIdentity) throw new Error("pendingSelectionIdentity is required");
  if (!input.speciesId) throw new Error("speciesId is required");
  if (!Number.isSafeInteger(input.level) || input.level < 1 || input.level > 200) {
    throw new Error("level must be an integer in 1..200");
  }
  const [left, right] = input.compatibleProfiles;
  if (!isGeneticProfile(left) || !isGeneticProfile(right) || left === right) {
    throw new Error("compatibleProfiles must contain exactly two distinct Genetic Profiles");
  }
  if (input.authority.rulesVersion !== ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1) {
    throw new Error("unsupported individualization rules version");
  }
  if (!input.authority.authorityVersion) throw new Error("derivation authority version is required");
  if (!(input.authority.secretKey instanceof Uint8Array) || input.authority.secretKey.byteLength < 32) {
    throw new Error("individualization secretKey must contain at least 256 bits");
  }
  if (input.authority.keyId !== deriveEncounterIndividualizationAuthorityKeyIdV1(input.authority.secretKey)) {
    throw new Error("individualization authority keyId does not match secretKey");
  }
}

export function canonicalSerializeEncounterIndividualizationRootInputV1(
  input: EncounterIndividualizationInput,
): string {
  return JSON.stringify([
    "pokenexus-individualization-root",
    input.authority.rulesVersion,
    input.authority.authorityVersion,
    input.authority.keyId,
    input.pendingSelectionIdentity,
    input.speciesId,
    input.level,
    input.compatibleProfiles[0],
    input.compatibleProfiles[1],
  ]);
}

function hmac(key: Uint8Array, value: string | Uint8Array): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

export function deriveEncounterIndividualizationAuthorityKeyIdV1(secretKey: Uint8Array): string {
  if (!(secretKey instanceof Uint8Array) || secretKey.byteLength < 32) {
    throw new Error("individualization secretKey must contain at least 256 bits");
  }
  return `key-v1:${hmac(secretKey, "pokenexus-individualization-authority-key-id-v1").toString("hex")}`;
}

function deriveRoot(input: EncounterIndividualizationInput): Buffer {
  return hmac(
    input.authority.secretKey,
    canonicalSerializeEncounterIndividualizationRootInputV1(input),
  );
}

function deriveDomainRng(root: Uint8Array, domain: string): DeterministicRngState {
  const digest = hmac(root, JSON.stringify(["pokenexus-individualization-domain", domain]));
  for (let offset = 0; offset <= digest.byteLength - 4; offset += 4) {
    const state = digest.readUInt32BE(offset);
    if (state !== 0) return { algorithm: "xorshift32-v1", state };
  }
  return { algorithm: "xorshift32-v1", state: 0x9e3779b9 };
}

function draw(root: Uint8Array, domain: string, min: number, max: number): number {
  return drawUniformInteger({ rng: deriveDomainRng(root, domain) }, min, max).value;
}

function gradeFromRoll(roll: number): GeneticGrade {
  if (roll < 5500) return "Normal";
  if (roll < 8300) return "Uncommon";
  if (roll < 9500) return "Rare";
  if (roll < 9900) return "Epic";
  return "Apex";
}

export function geneticBudgetForScore(score: number): number {
  if (!Number.isSafeInteger(score) || score < 0 || score > 100) {
    throw new Error("geneticScore must be an integer in 0..100");
  }
  const grade: GeneticGrade = score < 40
    ? "Normal"
    : score < 65
      ? "Uncommon"
      : score < 83
        ? "Rare"
        : score < 95
          ? "Epic"
          : "Apex";
  const band = GRADE_BANDS[grade];
  const offset = score - band.scoreMin;
  const scoreSpan = band.scoreMax - band.scoreMin;
  const budgetSpan = band.budgetMax - band.budgetMin;
  return band.budgetMin
    + Math.floor((2 * offset * budgetSpan + scoreSpan) / (2 * scoreSpan));
}

export function allocateGeneticBudget(
  budget: number,
  profile: GeneticProfile,
): StatBlock<number> {
  if (!Number.isSafeInteger(budget) || budget < 0 || budget > 70) {
    throw new Error("geneticBudget must be an integer in 0..70");
  }
  if (!isGeneticProfile(profile)) throw new Error("unsupported Genetic Profile");
  const weights = PROFILE_WEIGHTS[profile];
  const result: StatBlock<number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const remainders: Array<{ readonly stat: (typeof STAT_KEYS)[number]; readonly remainder: number; readonly tie: number }> = [];
  let assigned = 0;
  for (let tie = 0; tie < STAT_KEYS.length; tie += 1) {
    const stat = STAT_KEYS[tie]!;
    const numerator = budget * weights[stat];
    const floorValue = Math.floor(numerator / 100);
    result[stat] = floorValue;
    assigned += floorValue;
    remainders.push({ stat, remainder: numerator % 100, tie });
  }
  remainders.sort((left, right) =>
    right.remainder - left.remainder || left.tie - right.tie);
  let leftover = budget - assigned;
  for (const entry of remainders) {
    if (leftover === 0) break;
    result[entry.stat] += 1;
    leftover -= 1;
  }
  if (STAT_KEYS.reduce((sum, stat) => sum + result[stat], 0) !== budget) {
    throw new Error("Genetic Profile allocation did not preserve full budget");
  }
  return result;
}

function drawIvs(root: Uint8Array): StatBlock<number> {
  const ivs: StatBlock<number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  for (const stat of STAT_KEYS) {
    const first = drawUniformInteger({ rng: deriveDomainRng(root, `iv:${stat}`) }, 0, 15);
    const second = drawUniformInteger(first.nextState, 0, 16);
    ivs[stat] = first.value + second.value;
  }
  return ivs;
}

function snapshotCommitment(
  root: Uint8Array,
  facts: Omit<
    EncounterIndividualizationSnapshot,
    "individualizationSnapshotIdentity" | "individualizationSnapshotCommitment"
  >,
): string {
  return `sha256:${hmac(root, JSON.stringify(["snapshot", facts])).toString("hex")}`;
}

export function individualizeEncounter(
  input: EncounterIndividualizationInput,
): EncounterIndividualizationSnapshot {
  assertInput(input);
  const root = deriveRoot(input);
  const grade = gradeFromRoll(draw(root, "grade", 0, 9999));
  const band = GRADE_BANDS[grade];
  const geneticScore = draw(root, "score", band.scoreMin, band.scoreMax);
  const geneticBudget = geneticBudgetForScore(geneticScore);
  const ivs = drawIvs(root);
  const birthProfile = input.compatibleProfiles[draw(root, "profile", 0, 1)]!;
  const shiny = draw(root, "shiny", 0, 16383) === 0;
  const profileAllocations = input.compatibleProfiles.map((profile) => ({
    profile,
    bonuses: allocateGeneticBudget(geneticBudget, profile),
  })) as unknown as readonly [GeneticProfileAllocation, GeneticProfileAllocation];
  const birthAllocation = profileAllocations.find((entry) => entry.profile === birthProfile)!;
  const baseFacts = {
    pendingSelectionIdentity: input.pendingSelectionIdentity,
    speciesId: input.speciesId,
    level: input.level,
    ivs,
    geneticScore,
    geneticGrade: grade,
    geneticBudget,
    compatibleProfiles: [...input.compatibleProfiles] as readonly [GeneticProfile, GeneticProfile],
    birthProfile,
    birthGeneticBonuses: birthAllocation.bonuses,
    profileAllocations,
    shiny,
    isAscendant: shiny && grade === "Apex",
    individualizationRulesVersion: input.authority.rulesVersion,
    derivationAuthorityVersion: input.authority.authorityVersion,
    derivationAuthorityKeyId: input.authority.keyId,
  } satisfies Omit<
    EncounterIndividualizationSnapshot,
    "individualizationSnapshotIdentity" | "individualizationSnapshotCommitment"
  >;
  const individualizationSnapshotIdentity =
    `indv1:${hmac(root, "snapshot-identity").toString("hex")}`;
  return {
    ...baseFacts,
    individualizationSnapshotIdentity,
    individualizationSnapshotCommitment: snapshotCommitment(root, baseFacts),
  };
}

export function sameIndividualizationSnapshot(
  left: EncounterIndividualizationSnapshot,
  right: EncounterIndividualizationSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
