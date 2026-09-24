import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  bundleHash,
  canonicalJson,
  sha256,
  type ArtifactDescriptor,
} from "./canonical.js";
import { canonicalizePveContentArtifacts } from "./pve-content-canonical.js";
import {
  PVE_CONTENT_SCHEMA_VERSION,
  parsePveContentV1,
  validatePveContentV1,
  type PveContentV1,
  type PvePlayabilityEvidence,
} from "./pve-content-schema.js";
import {
  buildPveHumanReviewReport,
  PVE_POKENEXUS_AUTHORED_ARTIFACTS,
  PVE_RETAINED_SOURCE_BACKED_ARTIFACTS,
  pveHumanReviewHash,
  type PveArtifactOriginSummary,
  type PveHumanReviewReport,
} from "./pve-review.js";
import {
  GAME_DATA_SCHEMA_V4,
  type GameDataManifestV4,
} from "./pve-manifest.js";
import { loadPublishedBundle } from "./publication.js";
import { parseGameDataManifest } from "./schema.js";

const BASE_V3_ARTIFACT_PATHS: Record<string, string> = {
  "catalogs/species": "catalogs/species.json",
  "catalogs/moves": "catalogs/moves.json",
  "catalogs/types": "catalogs/types.json",
  "catalogs/abilities": "catalogs/abilities.json",
  "catalogs/items": "catalogs/items.json",
  "catalogs/learnsets": "catalogs/learnsets.json",
  "referenceData/currentTypeEffectiveness": "reference-data/current-type-effectiveness.json",
};

const PVE_ARTIFACT_PATHS = {
  "catalogs/zones": "catalogs/zones.json",
  "catalogs/hunts": "catalogs/hunts.json",
  "catalogs/encounter-definitions": "catalogs/encounter-definitions.json",
} as const;

export const PVE_V4_STAGE_MANIFEST_VERSION = "task-034-pve-v4-stage-v1" as const;

export interface PveV4StageManifest {
  stageManifestVersion: typeof PVE_V4_STAGE_MANIFEST_VERSION;
  schemaVersion: typeof GAME_DATA_SCHEMA_V4;
  pveContentSchemaVersion: typeof PVE_CONTENT_SCHEMA_VERSION;
  baseGameDataVersion: string;
  baseBundleHash: string;
  normalizerVersion: string;
  provenanceHash: string;
  provenanceManifest: {
    logicalName: "provenance";
    path: "provenance.json";
    contentHash: string;
  };
  sourceInventory: {
    logicalName: "source-inventory";
    path: "source-inventory.json";
    contentHash: string;
  };
  artifactOrigins: PveArtifactOriginSummary;
  artifacts: ArtifactDescriptor[];
  contentCommitmentHash: string;
  candidateGameDataVersion: string;
  candidateBundleHash: string;
  reviewHash: string;
  catalogCounts: GameDataManifestV4["catalogCounts"];
}

export interface StagePveV4CandidateInput {
  basePublishedDirectory: string;
  outputDirectory: string;
  content: PveContentV1 | unknown;
  playability: PvePlayabilityEvidence;
  pokemonNextLevelXpCostByLevel?: Readonly<Record<number, number>>;
  playerLevelGateImplications?: Readonly<Record<string, string>>;
}

export interface StagedPveV4Candidate {
  directory: string;
  manifest: PveV4StageManifest;
  stageManifestHash: string;
  review: PveHumanReviewReport;
}

function sortedDescriptors(descriptors: readonly ArtifactDescriptor[]): ArtifactDescriptor[] {
  return [...descriptors].sort((left, right) =>
    left.logicalName.localeCompare(right.logicalName, "en", { sensitivity: "variant" }),
  );
}

function descriptorCount(
  descriptors: readonly ArtifactDescriptor[],
  logicalName: string,
): number {
  const matches = descriptors.filter((descriptor) => descriptor.logicalName === logicalName);
  if (matches.length !== 1) throw new Error(`expected exactly one ${logicalName} descriptor`);
  return matches[0].recordCount;
}

function catalogCounts(descriptors: readonly ArtifactDescriptor[]): GameDataManifestV4["catalogCounts"] {
  return {
    species: descriptorCount(descriptors, "catalogs/species"),
    moves: descriptorCount(descriptors, "catalogs/moves"),
    types: descriptorCount(descriptors, "catalogs/types"),
    abilities: descriptorCount(descriptors, "catalogs/abilities"),
    items: descriptorCount(descriptors, "catalogs/items"),
    learnsets: descriptorCount(descriptors, "catalogs/learnsets"),
    currentTypeEffectiveness: descriptorCount(
      descriptors,
      "referenceData/currentTypeEffectiveness",
    ),
    zones: descriptorCount(descriptors, "catalogs/zones"),
    hunts: descriptorCount(descriptors, "catalogs/hunts"),
    encounterDefinitions: descriptorCount(descriptors, "catalogs/encounter-definitions"),
  };
}

async function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

export function buildPveV4RuntimePreviewManifest(
  stage: PveV4StageManifest,
  publishedAt = "1970-01-01T00:00:00.000Z",
): GameDataManifestV4 {
  return {
    schemaVersion: GAME_DATA_SCHEMA_V4,
    pveContentSchemaVersion: PVE_CONTENT_SCHEMA_VERSION,
    gameDataVersion: stage.candidateGameDataVersion,
    bundleHash: stage.candidateBundleHash,
    provenanceHash: stage.provenanceHash,
    publishedAt,
    normalizerVersion: stage.normalizerVersion,
    artifacts: sortedDescriptors(stage.artifacts),
    provenanceManifest: { ...stage.provenanceManifest },
    sourceInventory: { ...stage.sourceInventory },
    catalogCounts: { ...stage.catalogCounts },
  };
}

export async function stagePveV4Candidate(
  input: StagePveV4CandidateInput,
): Promise<StagedPveV4Candidate> {
  const baseManifest = parseGameDataManifest(
    JSON.parse(
      await readFile(join(input.basePublishedDirectory, "manifest.json"), "utf8"),
    ) as unknown,
  );
  const base = await loadPublishedBundle(
    dirname(input.basePublishedDirectory),
    baseManifest.gameDataVersion,
  );
  if (input.playability.gameDataVersion !== base.manifest.gameDataVersion) {
    throw new Error("playability evidence must be pinned to the base gameDataVersion");
  }

  const content = parsePveContentV1(input.content);
  const validation = validatePveContentV1(content, {
    speciesIds: new Set(base.candidate.catalogs.species.map(({ id }) => id)),
    itemIds: new Set(base.candidate.catalogs.items.map(({ id }) => id)),
    playability: input.playability,
  });
  if (!validation.valid) {
    const summary = validation.findings
      .map(({ code, path, message }) => `${code} ${path}: ${message}`)
      .join("; ");
    throw new Error(`invalid PvE candidate: ${summary}`);
  }

  const pveArtifacts = canonicalizePveContentArtifacts(content);
  const pveByLogicalName = new Map(
    Object.values(pveArtifacts).map((artifact) => [artifact.descriptor.logicalName, artifact] as const),
  );
  const descriptors = sortedDescriptors([
    ...base.manifest.artifacts,
    ...Object.values(pveArtifacts).map(({ descriptor }) => descriptor),
  ]);

  const contentCommitmentInput = {
    schemaVersion: GAME_DATA_SCHEMA_V4,
    pveContentSchemaVersion: PVE_CONTENT_SCHEMA_VERSION,
    baseGameDataVersion: base.manifest.gameDataVersion,
    baseBundleHash: base.manifest.bundleHash,
    artifacts: descriptors,
    provenanceHash: base.manifest.provenanceHash,
  };
  const contentCommitmentHash = sha256(
    Buffer.from(canonicalJson(contentCommitmentInput), "utf8"),
  );
  const candidateGameDataVersion =
    `candidate:game-data:pve-v4:${contentCommitmentHash.slice("sha256:".length)}`;
  const candidateBundleHash = bundleHash(
    GAME_DATA_SCHEMA_V4,
    candidateGameDataVersion,
    descriptors,
    base.manifest.provenanceHash,
  );

  const candidateIdentity = {
    schemaVersion: GAME_DATA_SCHEMA_V4,
    pveContentSchemaVersion: PVE_CONTENT_SCHEMA_VERSION,
    gameDataVersion: candidateGameDataVersion,
    bundleHash: candidateBundleHash,
    contentCommitmentHash,
    artifacts: descriptors,
  } as const;
  const review = buildPveHumanReviewReport({
    baseGameDataVersion: base.manifest.gameDataVersion,
    baseBundleHash: base.manifest.bundleHash,
    candidate: candidateIdentity,
    content,
    playability: input.playability,
    pokemonNextLevelXpCostByLevel: input.pokemonNextLevelXpCostByLevel,
    playerLevelGateImplications: input.playerLevelGateImplications,
  });
  const reviewBytes = Buffer.from(canonicalJson(review), "utf8");
  const reviewHash = pveHumanReviewHash(review);

  const manifest: PveV4StageManifest = {
    stageManifestVersion: PVE_V4_STAGE_MANIFEST_VERSION,
    schemaVersion: GAME_DATA_SCHEMA_V4,
    pveContentSchemaVersion: PVE_CONTENT_SCHEMA_VERSION,
    baseGameDataVersion: base.manifest.gameDataVersion,
    baseBundleHash: base.manifest.bundleHash,
    normalizerVersion: base.manifest.normalizerVersion,
    provenanceHash: base.manifest.provenanceHash,
    provenanceManifest: { ...base.manifest.provenanceManifest },
    sourceInventory: { ...base.manifest.sourceInventory },
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
    artifacts: descriptors,
    contentCommitmentHash,
    candidateGameDataVersion,
    candidateBundleHash,
    reviewHash,
    catalogCounts: catalogCounts(descriptors),
  };
  const manifestBytes = Buffer.from(canonicalJson(manifest), "utf8");

  await rm(input.outputDirectory, { recursive: true, force: true });
  await mkdir(input.outputDirectory, { recursive: true });
  for (const descriptor of base.manifest.artifacts) {
    const relativePath = BASE_V3_ARTIFACT_PATHS[descriptor.logicalName];
    if (!relativePath) throw new Error(`unsupported retained v3 artifact ${descriptor.logicalName}`);
    const bytes = await readFile(join(base.directory, relativePath));
    if (sha256(bytes) !== descriptor.contentHash) {
      throw new Error(`retained v3 artifact hash mismatch for ${descriptor.logicalName}`);
    }
    await writeBytes(join(input.outputDirectory, relativePath), bytes);
  }
  for (const [logicalName, relativePath] of Object.entries(PVE_ARTIFACT_PATHS)) {
    const artifact = pveByLogicalName.get(logicalName);
    if (!artifact) throw new Error(`missing canonical PvE artifact ${logicalName}`);
    await writeBytes(join(input.outputDirectory, relativePath), artifact.bytes);
  }
  const provenanceBytes = await readFile(
    join(base.directory, base.manifest.provenanceManifest.path),
  );
  const sourceInventoryBytes = await readFile(
    join(base.directory, base.manifest.sourceInventory.path),
  );
  if (sha256(provenanceBytes) !== base.manifest.provenanceManifest.contentHash) {
    throw new Error("retained provenance file hash mismatch");
  }
  if (sha256(sourceInventoryBytes) !== base.manifest.sourceInventory.contentHash) {
    throw new Error("retained source inventory file hash mismatch");
  }
  await writeBytes(
    join(input.outputDirectory, base.manifest.provenanceManifest.path),
    provenanceBytes,
  );
  await writeBytes(
    join(input.outputDirectory, base.manifest.sourceInventory.path),
    sourceInventoryBytes,
  );
  await writeBytes(join(input.outputDirectory, "candidate-manifest.json"), manifestBytes);
  await writeBytes(join(input.outputDirectory, "human-review.json"), reviewBytes);

  return {
    directory: input.outputDirectory,
    manifest,
    stageManifestHash: sha256(manifestBytes),
    review,
  };
}
