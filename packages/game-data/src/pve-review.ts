import { canonicalJson, sha256, type ArtifactDescriptor } from "./canonical.js";
import {
  resolvePvePlayabilityEvidence,
  type EncounterDefinitionV1,
  type PveContentV1,
  type PvePlayabilityEvidence,
} from "./pve-content-schema.js";
import { canonicalizePveContent } from "./pve-content-canonical.js";

export const PVE_HUMAN_REVIEW_REPORT_VERSION = "task-034-pve-human-review-v1" as const;
export const PVE_RETAINED_SOURCE_BACKED_ARTIFACTS = [
  "catalogs/species",
  "catalogs/moves",
  "catalogs/types",
  "catalogs/abilities",
  "catalogs/items",
  "catalogs/learnsets",
  "referenceData/currentTypeEffectiveness",
] as const;
export const PVE_POKENEXUS_AUTHORED_ARTIFACTS = [
  "catalogs/zones",
  "catalogs/hunts",
  "catalogs/encounter-definitions",
] as const;

export interface PveArtifactOriginSummary {
  retainedSourceBacked: {
    provenanceScope: "retained-external-factual-provenance";
    logicalNames: string[];
  };
  pokenexusAuthored: {
    provenanceScope: "pokenexus-authored-no-external-source-record";
    logicalNames: string[];
  };
}

export interface PveReviewCandidateIdentity {
  schemaVersion: "4";
  pveContentSchemaVersion: "1";
  gameDataVersion: string;
  bundleHash: string;
  contentCommitmentHash: string;
  artifacts: ArtifactDescriptor[];
}

export interface PveReviewInput {
  baseGameDataVersion: string;
  baseBundleHash: string;
  candidate: PveReviewCandidateIdentity;
  content: PveContentV1;
  playability: PvePlayabilityEvidence;
  pokemonNextLevelXpCostByLevel?: Readonly<Record<number, number>>;
  playerLevelGateImplications?: Readonly<Record<string, string>>;
}

export interface PveEncounterReviewRow {
  id: string;
  huntId: string;
  speciesId: string;
  weight: number;
  levelBand: { min: number; max: number };
  reward: EncounterDefinitionV1["reward"];
  playability: Array<{
    level: number;
    evidenceThresholdLevel: number;
    executableCount: number;
    progressCapableExecutableCount: number;
    oneChoiceBottleneck: boolean;
  }>;
  soloPokemonXpContext: {
    nextLevelCost: number;
    rewardShareBasisPoints: number;
  } | null;
}

export interface PveHumanReviewReport {
  reportVersion: typeof PVE_HUMAN_REVIEW_REPORT_VERSION;
  artifactOrigins: PveArtifactOriginSummary;
  baseGameData: {
    gameDataVersion: string;
    bundleHash: string;
  };
  candidate: PveReviewCandidateIdentity;
  playabilityAuthority: {
    profileArtifactId: string;
    profileContentHash: string;
    gameDataVersion: string;
  };
  zones: Array<{
    id: string;
    displayName: string;
    displayOrder: number;
    playerLevelMin: number | null;
    prerequisiteHuntIds: string[];
    playerLevelGateImplication: string | null;
  }>;
  hunts: Array<{
    id: string;
    zoneId: string;
    displayName: string;
    displayOrder: number;
    playerLevelMin: number | null;
    prerequisiteHuntIds: string[];
    recoveryDurationMs: number;
    playerLevelGateImplication: string | null;
  }>;
  encounters: PveEncounterReviewRow[];
}

function gateImplication(
  playerLevelMin: number | null,
  key: string,
  implications: Readonly<Record<string, string>> | undefined,
): string | null {
  if (playerLevelMin === null) return null;
  const implication = implications?.[key]?.normalize("NFC").trim();
  if (!implication) {
    throw new Error(`${key} has playerLevelMin=${playerLevelMin} but no explicit progression implication`);
  }
  return implication;
}

function reviewEncounter(
  encounter: EncounterDefinitionV1,
  evidence: PvePlayabilityEvidence,
  xpCosts: Readonly<Record<number, number>> | undefined,
): PveEncounterReviewRow {
  const playability: PveEncounterReviewRow["playability"] = [];
  for (let level = encounter.levelBand.min; level <= encounter.levelBand.max; level += 1) {
    const row = resolvePvePlayabilityEvidence(evidence, encounter.speciesId, level);
    if (row === null) {
      throw new Error(`missing playability evidence for ${encounter.speciesId} at level ${level}`);
    }
    if (row.progressCapableExecutableCount <= 0) {
      throw new Error(`zero progress-capable playability for ${encounter.speciesId} at level ${level}`);
    }
    playability.push({
      level,
      evidenceThresholdLevel: row.level,
      executableCount: row.executableCount,
      progressCapableExecutableCount: row.progressCapableExecutableCount,
      oneChoiceBottleneck: row.progressCapableExecutableCount === 1,
    });
  }

  let soloPokemonXpContext: PveEncounterReviewRow["soloPokemonXpContext"] = null;
  if (encounter.levelBand.min === encounter.levelBand.max) {
    const cost = xpCosts?.[encounter.levelBand.min];
    if (cost !== undefined) {
      if (!Number.isSafeInteger(cost) || cost <= 0) {
        throw new TypeError("pokemonNextLevelXpCostByLevel values must be positive safe integers");
      }
      soloPokemonXpContext = {
        nextLevelCost: cost,
        rewardShareBasisPoints: Math.round((encounter.reward.pokemonXpPool * 10_000) / cost),
      };
    }
  }

  return {
    id: encounter.id,
    huntId: encounter.huntId,
    speciesId: encounter.speciesId,
    weight: encounter.weight,
    levelBand: { ...encounter.levelBand },
    reward: {
      ...encounter.reward,
      itemDrops: encounter.reward.itemDrops.map((drop) => ({ ...drop })),
    },
    playability,
    soloPokemonXpContext,
  };
}

export function buildPveHumanReviewReport(input: PveReviewInput): PveHumanReviewReport {
  if (input.playability.gameDataVersion !== input.baseGameDataVersion) {
    throw new Error("playability evidence gameDataVersion does not match base game data");
  }
  const content = canonicalizePveContent(input.content);
  return {
    reportVersion: PVE_HUMAN_REVIEW_REPORT_VERSION,
    artifactOrigins: {
      retainedSourceBacked: {
        provenanceScope: "retained-external-factual-provenance",
        logicalNames: [...PVE_RETAINED_SOURCE_BACKED_ARTIFACTS],
      },
      pokenexusAuthored: {
        provenanceScope: "pokenexus-authored-no-external-source-record",
        logicalNames: [...PVE_POKENEXUS_AUTHORED_ARTIFACTS],
      },
    },
    baseGameData: {
      gameDataVersion: input.baseGameDataVersion,
      bundleHash: input.baseBundleHash,
    },
    candidate: {
      ...input.candidate,
      artifacts: [...input.candidate.artifacts].sort((left, right) =>
        left.logicalName.localeCompare(right.logicalName, "en", { sensitivity: "variant" }),
      ),
    },
    playabilityAuthority: {
      profileArtifactId: input.playability.profileArtifactId,
      profileContentHash: input.playability.profileContentHash,
      gameDataVersion: input.playability.gameDataVersion,
    },
    zones: content.zones.map((zone) => ({
      id: zone.id,
      displayName: zone.displayName,
      displayOrder: zone.displayOrder,
      playerLevelMin: zone.availability.playerLevelMin,
      prerequisiteHuntIds: [...zone.availability.prerequisiteHuntIds],
      playerLevelGateImplication: gateImplication(
        zone.availability.playerLevelMin,
        zone.id,
        input.playerLevelGateImplications,
      ),
    })),
    hunts: content.hunts.map((hunt) => ({
      id: hunt.id,
      zoneId: hunt.zoneId,
      displayName: hunt.displayName,
      displayOrder: hunt.displayOrder,
      playerLevelMin: hunt.availability.playerLevelMin,
      prerequisiteHuntIds: [...hunt.availability.prerequisiteHuntIds],
      recoveryDurationMs: hunt.recoveryDurationMs,
      playerLevelGateImplication: gateImplication(
        hunt.availability.playerLevelMin,
        hunt.id,
        input.playerLevelGateImplications,
      ),
    })),
    encounters: content.encounters.map((encounter) =>
      reviewEncounter(encounter, input.playability, input.pokemonNextLevelXpCostByLevel),
    ),
  };
}

export function pveHumanReviewHash(report: PveHumanReviewReport): string {
  return sha256(Buffer.from(canonicalJson(report), "utf8"));
}
