import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  bundleHash,
  canonicalJson,
  sha256,
  type ArtifactDescriptor,
} from "./canonical.js";
import {
  GAME_DATA_V5_ARTIFACT_PATHS,
  parseGameDataManifestV5,
  type GameDataManifestV5,
} from "./game-data-manifest-v5.js";
import {
  PREALPHA_AUTHORED_ITEM_IDS,
  PREALPHA_CONTENT_AUTHORITY_VERSION,
  PREALPHA_ITEM_IDS,
} from "./prealpha-content-authority.js";
import { canonicalizePveContent, canonicalizePveContentArtifacts } from "./pve-content-canonical.js";
import {
  PVE_CONTENT_SCHEMA_VERSION,
  parsePveContentV1,
  resolvePvePlayabilityEvidence,
  validatePveContentV1,
  type PveContentV1,
  type PvePlayabilityEvidence,
} from "./pve-content-schema.js";
import {
  loadPublishedPromotionV5BundleDirectory,
  publishApprovedPromotionV5Candidate,
  type PromotionV5PublicationApproval,
  type PublishedPromotionV5Bundle,
} from "./promotion-publication-v5.js";
import {
  parseItemDefinitionV1,
  parseSpeciesDefinitionV2,
} from "./schema.js";
import { GAME_DATA_SCHEMA_V5 } from "./schema-version-v5.js";

export const TASK_109_PVE_V5_STAGE_VERSION = "task-109-pve-v5-stage-v1" as const;
export const TASK_109_PVE_REVIEW_VERSION = "task-109-prealpha-wilds-review-v1" as const;
export const TASK_109_BASE_GAME_DATA_VERSION = "game-data-core-kanto-johto-v4" as const;
export const TASK_109_BASE_BUNDLE_HASH =
  "sha256:fc37e5e9acebca805949780e2adb378b7ace8241b7b13ec7689a67d7abf23346" as const;
export const TASK_109_CANDIDATE_GAME_DATA_VERSION = "game-data-core-kanto-johto-v5" as const;
export const TASK_109_PLAYABILITY_GAME_DATA_VERSION = "game-data-core-kanto-johto-v3" as const;
export const TASK_109_PLAYABILITY_PROFILE_ARTIFACT_ID =
  "spec-012-production-move-support-v2" as const;
export const TASK_109_PLAYABILITY_PROFILE_CONTENT_HASH =
  "sha256:6a578d7408c79b7984b5b6640be42dbbb43459f859ffe31ce79880d72d159b57" as const;

const PVE_LOGICAL_NAMES = new Set<string>([
  "catalogs/zones",
  "catalogs/hunts",
  "catalogs/encounter-definitions",
]);

const WILDS_SPECIES_WEIGHTS = Object.freeze({
  "candidate:species:pokedex-pidgey-16:8e97efe736": 16,
  "candidate:species:pokedex-rattata-19:9975b0175c": 15,
  "candidate:species:pokedex-caterpie-10:f77ea3bb04": 18,
  "candidate:species:pokedex-sentret-161:fa09afb6e0": 17,
  "candidate:species:pokedex-ledyba-165:092570add7": 17,
  "candidate:species:pokedex-sunkern-191:8f850eef0e": 17,
});

const WILDS_LEVEL_WEIGHTS = Object.freeze({
  1: 50,
  2: 35,
  3: 15,
});

const TASK_109_WILDS_ZONE_ID = "zone:verdant-edge" as const;
const TASK_109_WILDS_HUNT_ID = "hunt:verdant-edge:wilds" as const;
const TASK_109_WILDS_RECOVERY_DURATION_MS = 30_000 as const;

export interface Task109PveV5StageManifest {
  stageManifestVersion: typeof TASK_109_PVE_V5_STAGE_VERSION;
  schemaVersion: typeof GAME_DATA_SCHEMA_V5;
  pveContentSchemaVersion: typeof PVE_CONTENT_SCHEMA_VERSION;
  baseGameDataVersion: typeof TASK_109_BASE_GAME_DATA_VERSION;
  baseBundleHash: typeof TASK_109_BASE_BUNDLE_HASH;
  candidateGameDataVersion: typeof TASK_109_CANDIDATE_GAME_DATA_VERSION;
  candidateBundleHash: string;
  normalizerVersion: string;
  provenanceHash: string;
  provenanceManifest: GameDataManifestV5["provenanceManifest"];
  sourceInventory: GameDataManifestV5["sourceInventory"];
  artifacts: ArtifactDescriptor[];
  catalogCounts: GameDataManifestV5["catalogCounts"];
  contentCommitmentHash: string;
  authoredContentAuthority: {
    version: typeof PREALPHA_CONTENT_AUTHORITY_VERSION;
    itemIds: string[];
  };
  playabilityAuthority: {
    profileArtifactId: typeof TASK_109_PLAYABILITY_PROFILE_ARTIFACT_ID;
    profileContentHash: typeof TASK_109_PLAYABILITY_PROFILE_CONTENT_HASH;
    gameDataVersion: typeof TASK_109_PLAYABILITY_GAME_DATA_VERSION;
  };
  reviewHash: string;
}

export interface Task109PveReview {
  reviewVersion: typeof TASK_109_PVE_REVIEW_VERSION;
  baseGameDataVersion: typeof TASK_109_BASE_GAME_DATA_VERSION;
  baseBundleHash: typeof TASK_109_BASE_BUNDLE_HASH;
  candidateGameDataVersion: typeof TASK_109_CANDIDATE_GAME_DATA_VERSION;
  candidateBundleHash: string;
  provenanceHash: string;
  contentCommitmentHash: string;
  authoredContentAuthority: Task109PveV5StageManifest["authoredContentAuthority"];
  artifactOrigins: {
    retainedSourceBacked: string[];
    pokenexusAuthored: string[];
  };
  distribution: {
    jointWeightDenominator: 10_000;
    speciesWeightsPercent: Record<string, number>;
    levelWeightsPercent: Record<string, number>;
    speciesMarginalWeights: Record<string, number>;
    levelMarginalWeights: Record<string, number>;
  };
  playabilityAuthority: Task109PveV5StageManifest["playabilityAuthority"] & {
    level1Rows: Array<{
      speciesId: string;
      executableCount: number;
      progressCapableExecutableCount: number;
    }>;
  };
  zones: PveContentV1["zones"];
  hunts: PveContentV1["hunts"];
  encounters: PveContentV1["encounters"];
}

export interface StageTask109PveV5Input {
  basePublishedDirectory: string;
  outputDirectory: string;
  content: PveContentV1 | unknown;
  playability: PvePlayabilityEvidence;
}

export interface StagedTask109PveV5Candidate {
  directory: string;
  manifest: Task109PveV5StageManifest;
  review: Task109PveReview;
  reviewHash: string;
  stageManifestHash: string;
}

function hasImmediateAvailability(availability: {
  readonly playerLevelMin: number | null;
  readonly prerequisiteHuntIds: readonly string[];
}): boolean {
  return availability.playerLevelMin === null && availability.prerequisiteHuntIds.length === 0;
}

function assertTask109WildsTopology(content: PveContentV1): void {
  if (content.zones.length !== 1) {
    throw new Error(`TASK-109 Wilds requires exactly one Zone, got ${content.zones.length}`);
  }
  const zone = content.zones[0]!;
  if (
    zone.id !== TASK_109_WILDS_ZONE_ID
    || zone.displayName !== "Verdant Edge"
    || !hasImmediateAvailability(zone.availability)
  ) {
    throw new Error("TASK-109 Verdant Edge Zone identity/availability does not match the accepted first-Pre-alpha content");
  }

  if (content.hunts.length !== 1) {
    throw new Error(`TASK-109 Wilds requires exactly one Hunt, got ${content.hunts.length}`);
  }
  const hunt = content.hunts[0]!;
  if (
    hunt.id !== TASK_109_WILDS_HUNT_ID
    || hunt.zoneId !== TASK_109_WILDS_ZONE_ID
    || hunt.displayName !== "Wilds"
    || !hasImmediateAvailability(hunt.availability)
    || hunt.recoveryDurationMs !== TASK_109_WILDS_RECOVERY_DURATION_MS
  ) {
    throw new Error("TASK-109 Wilds Hunt identity/availability/recovery does not match the accepted first-Pre-alpha content");
  }
  if (content.encounters.some(({ huntId }) => huntId !== TASK_109_WILDS_HUNT_ID)) {
    throw new Error("TASK-109 Wilds encounters must all belong to the accepted Wilds Hunt");
  }
}

function assertReviewedPveArtifactsMatchManifest(
  content: PveContentV1,
  manifest: Task109PveV5StageManifest,
): void {
  const reviewedArtifacts = canonicalizePveContentArtifacts(content);
  const expectedDescriptors = [
    reviewedArtifacts.zones.descriptor,
    reviewedArtifacts.hunts.descriptor,
    reviewedArtifacts.encounters.descriptor,
  ];
  const manifestByLogicalName = new Map(
    manifest.artifacts.map((descriptor) => [descriptor.logicalName, descriptor] as const),
  );
  for (const expected of expectedDescriptors) {
    const actual = manifestByLogicalName.get(expected.logicalName);
    if (!actual || canonicalJson(actual) !== canonicalJson(expected)) {
      throw new Error(
        `TASK-109 Human review ${expected.logicalName} does not match the staged PvE artifact descriptor`,
      );
    }
  }
}

function equalStringArrays(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function assertTask109PveV5PublicationContract(
  staged: StagedTask109PveV5Candidate,
): void {
  const { manifest, review } = staged;
  if (
    manifest.stageManifestVersion !== TASK_109_PVE_V5_STAGE_VERSION
    || manifest.schemaVersion !== GAME_DATA_SCHEMA_V5
    || manifest.pveContentSchemaVersion !== PVE_CONTENT_SCHEMA_VERSION
    || manifest.baseGameDataVersion !== TASK_109_BASE_GAME_DATA_VERSION
    || manifest.baseBundleHash !== TASK_109_BASE_BUNDLE_HASH
    || manifest.candidateGameDataVersion !== TASK_109_CANDIDATE_GAME_DATA_VERSION
  ) {
    throw new Error("TASK-109 staged manifest does not match the accepted publication identity");
  }
  if (
    review.reviewVersion !== TASK_109_PVE_REVIEW_VERSION
    || review.baseGameDataVersion !== manifest.baseGameDataVersion
    || review.baseBundleHash !== manifest.baseBundleHash
    || review.candidateGameDataVersion !== manifest.candidateGameDataVersion
    || review.candidateBundleHash !== manifest.candidateBundleHash
    || review.provenanceHash !== manifest.provenanceHash
    || review.contentCommitmentHash !== manifest.contentCommitmentHash
  ) {
    throw new Error("TASK-109 Human review does not bind the full staged candidate identity");
  }
  const expectedItems = [...PREALPHA_AUTHORED_ITEM_IDS];
  if (
    manifest.authoredContentAuthority.version !== PREALPHA_CONTENT_AUTHORITY_VERSION
    || review.authoredContentAuthority.version !== PREALPHA_CONTENT_AUTHORITY_VERSION
    || !equalStringArrays(manifest.authoredContentAuthority.itemIds, expectedItems)
    || !equalStringArrays(review.authoredContentAuthority.itemIds, expectedItems)
  ) {
    throw new Error("TASK-109 authored content authority does not match the accepted ItemId set");
  }
  const expectedPlayability = {
    profileArtifactId: TASK_109_PLAYABILITY_PROFILE_ARTIFACT_ID,
    profileContentHash: TASK_109_PLAYABILITY_PROFILE_CONTENT_HASH,
    gameDataVersion: TASK_109_PLAYABILITY_GAME_DATA_VERSION,
  } as const;
  if (
    manifest.playabilityAuthority.profileArtifactId !== expectedPlayability.profileArtifactId
    || manifest.playabilityAuthority.profileContentHash !== expectedPlayability.profileContentHash
    || manifest.playabilityAuthority.gameDataVersion !== expectedPlayability.gameDataVersion
    || review.playabilityAuthority.profileArtifactId !== expectedPlayability.profileArtifactId
    || review.playabilityAuthority.profileContentHash !== expectedPlayability.profileContentHash
    || review.playabilityAuthority.gameDataVersion !== expectedPlayability.gameDataVersion
  ) {
    throw new Error("TASK-109 playability authority does not match the accepted production support release");
  }

  const reviewedContent: PveContentV1 = {
    zones: review.zones,
    hunts: review.hunts,
    encounters: review.encounters,
  };
  assertTask109WildsTopology(reviewedContent);
  assertReviewedPveArtifactsMatchManifest(reviewedContent, manifest);
  const distribution = distributionEvidence(reviewedContent);
  assertTask109Economy(reviewedContent);
  if (canonicalJson(distribution) !== canonicalJson(review.distribution)) {
    throw new Error("TASK-109 Human review distribution evidence does not match reviewed content");
  }
  const reviewedLevel1 = [...review.playabilityAuthority.level1Rows]
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId, "en", { sensitivity: "variant" }));
  if (
    reviewedLevel1.length !== Object.keys(WILDS_SPECIES_WEIGHTS).length
    || reviewedLevel1.some(({ speciesId, progressCapableExecutableCount }) =>
      !Object.prototype.hasOwnProperty.call(WILDS_SPECIES_WEIGHTS, speciesId)
      || progressCapableExecutableCount <= 0)
  ) {
    throw new Error("TASK-109 Human review does not prove Level-1 progress-capable support for all Wilds Species");
  }
  const expectedAuthoredArtifacts = [...PVE_LOGICAL_NAMES].sort();
  const actualAuthoredArtifacts = [...review.artifactOrigins.pokenexusAuthored].sort();
  if (!equalStringArrays(actualAuthoredArtifacts, expectedAuthoredArtifacts)) {
    throw new Error("TASK-109 Human review artifact origin classification is incomplete");
  }
  if (
    manifest.reviewHash !== staged.reviewHash
    || sha256(Buffer.from(canonicalJson(review), "utf8")) !== staged.reviewHash
  ) {
    throw new Error("TASK-109 reviewHash does not bind the canonical Human review bytes");
  }
  if (sha256(Buffer.from(canonicalJson(manifest), "utf8")) !== staged.stageManifestHash) {
    throw new Error("TASK-109 stageManifestHash does not bind the canonical staged manifest");
  }
}

export async function publishApprovedTask109PveV5Candidate(
  staged: StagedTask109PveV5Candidate,
  publishedRoot: string,
  publishedAt: string,
  approval: PromotionV5PublicationApproval,
): Promise<PublishedPromotionV5Bundle> {
  assertTask109PveV5PublicationContract(staged);
  return publishApprovedPromotionV5Candidate(staged, publishedRoot, publishedAt, approval);
}

function pathsOverlap(left: string, right: string): boolean {
  const a = resolve(left);
  const b = resolve(right);
  const aToB = relative(a, b);
  const bToA = relative(b, a);
  const inside = (value: string): boolean =>
    value === "" || (!value.startsWith("..") && !isAbsolute(value));
  return inside(aToB) || inside(bToA);
}

function descriptorCount(descriptors: readonly ArtifactDescriptor[], logicalName: string): number {
  const descriptor = descriptors.find((entry) => entry.logicalName === logicalName);
  if (!descriptor) throw new Error(`missing schema-5 artifact descriptor ${logicalName}`);
  return descriptor.recordCount;
}

function catalogCounts(descriptors: readonly ArtifactDescriptor[]): GameDataManifestV5["catalogCounts"] {
  return {
    species: descriptorCount(descriptors, "catalogs/species"),
    moves: descriptorCount(descriptors, "catalogs/moves"),
    types: descriptorCount(descriptors, "catalogs/types"),
    abilities: descriptorCount(descriptors, "catalogs/abilities"),
    items: descriptorCount(descriptors, "catalogs/items"),
    learnsets: descriptorCount(descriptors, "catalogs/learnsets"),
    currentTypeEffectiveness: descriptorCount(descriptors, "referenceData/currentTypeEffectiveness"),
    zones: descriptorCount(descriptors, "catalogs/zones"),
    hunts: descriptorCount(descriptors, "catalogs/hunts"),
    encounterDefinitions: descriptorCount(descriptors, "catalogs/encounter-definitions"),
  };
}

function distributionEvidence(content: PveContentV1): Task109PveReview["distribution"] {
  const speciesMarginalWeights: Record<string, number> = {};
  const levelMarginalWeights: Record<string, number> = {};
  const jointPairs = new Set<string>();
  for (const encounter of content.encounters) {
    if (encounter.levelBand.min !== encounter.levelBand.max) {
      throw new Error(`TASK-109 Wilds requires fixed-level rows: ${encounter.id}`);
    }
    const expectedSpeciesWeight =
      WILDS_SPECIES_WEIGHTS[encounter.speciesId as keyof typeof WILDS_SPECIES_WEIGHTS];
    const level = encounter.levelBand.min;
    const expectedLevelWeight =
      WILDS_LEVEL_WEIGHTS[level as keyof typeof WILDS_LEVEL_WEIGHTS];
    if (expectedSpeciesWeight === undefined || expectedLevelWeight === undefined) {
      throw new Error(`TASK-109 Wilds contains unexpected species/level: ${encounter.id}`);
    }
    if (encounter.weight !== expectedSpeciesWeight * expectedLevelWeight) {
      throw new Error(`TASK-109 Wilds joint weight is not factorized: ${encounter.id}`);
    }
    const pairKey = `${encounter.speciesId}\u0000${level}`;
    if (jointPairs.has(pairKey)) {
      throw new Error(`TASK-109 Wilds contains duplicate species/level pair: ${encounter.id}`);
    }
    jointPairs.add(pairKey);
    speciesMarginalWeights[encounter.speciesId] =
      (speciesMarginalWeights[encounter.speciesId] ?? 0) + encounter.weight;
    levelMarginalWeights[String(level)] =
      (levelMarginalWeights[String(level)] ?? 0) + encounter.weight;
  }
  if (content.encounters.length !== 18) {
    throw new Error(`TASK-109 Wilds requires exactly 18 fixed-level rows, got ${content.encounters.length}`);
  }
  for (const [speciesId, percent] of Object.entries(WILDS_SPECIES_WEIGHTS)) {
    if (speciesMarginalWeights[speciesId] !== percent * 100) {
      throw new Error(`TASK-109 Wilds species marginal mismatch for ${speciesId}`);
    }
    for (const level of Object.keys(WILDS_LEVEL_WEIGHTS)) {
      if (!jointPairs.has(`${speciesId}\u0000${level}`)) {
        throw new Error(`TASK-109 Wilds missing species/level pair: ${speciesId} Lv${level}`);
      }
    }
  }
  for (const [level, percent] of Object.entries(WILDS_LEVEL_WEIGHTS)) {
    if (levelMarginalWeights[level] !== percent * 100) {
      throw new Error(`TASK-109 Wilds level marginal mismatch for Lv${level}`);
    }
  }
  return {
    jointWeightDenominator: 10_000,
    speciesWeightsPercent: { ...WILDS_SPECIES_WEIGHTS },
    levelWeightsPercent: { ...WILDS_LEVEL_WEIGHTS },
    speciesMarginalWeights,
    levelMarginalWeights,
  };
}

function assertTask109Economy(content: PveContentV1): void {
  for (const encounter of content.encounters) {
    const level = encounter.levelBand.min;
    if (encounter.reward.playerXp !== 2 * level || encounter.reward.pokemonXpPool !== 6 * level) {
      throw new Error(`TASK-109 Wilds XP mismatch: ${encounter.id}`);
    }
    if (encounter.reward.itemDrops.length !== 2) {
      throw new Error(`TASK-109 Wilds requires exactly two independent drops: ${encounter.id}`);
    }
    const drops = new Map(encounter.reward.itemDrops.map((drop) => [drop.itemId, drop] as const));
    if (drops.size !== 2) throw new Error(`TASK-109 Wilds requires exactly two independent drops: ${encounter.id}`);
    const ball = drops.get(PREALPHA_ITEM_IDS.standardPokeBall);
    const potion = drops.get(PREALPHA_ITEM_IDS.basicPotion);
    if (!ball || ball.quantity !== 1 || ball.chanceBasisPoints !== 1_500) {
      throw new Error(`TASK-109 Wilds Poké Ball drop mismatch: ${encounter.id}`);
    }
    if (!potion || potion.quantity !== 1 || potion.chanceBasisPoints !== 500) {
      throw new Error(`TASK-109 Wilds Potion drop mismatch: ${encounter.id}`);
    }
    if (drops.has(PREALPHA_ITEM_IDS.revive25)) {
      throw new Error(`TASK-109 Wilds must not drop Revive: ${encounter.id}`);
    }
  }
}

function level1PlayabilityEvidence(playability: PvePlayabilityEvidence): Task109PveReview["playabilityAuthority"]["level1Rows"] {
  if (
    playability.gameDataVersion !== TASK_109_PLAYABILITY_GAME_DATA_VERSION ||
    playability.profileArtifactId !== TASK_109_PLAYABILITY_PROFILE_ARTIFACT_ID ||
    playability.profileContentHash !== TASK_109_PLAYABILITY_PROFILE_CONTENT_HASH
  ) {
    throw new Error("TASK-109 playability evidence is not the accepted production support authority");
  }
  return Object.keys(WILDS_SPECIES_WEIGHTS).sort().map((speciesId) => {
    const row = resolvePvePlayabilityEvidence(playability, speciesId, 1);
    if (!row || row.level !== 1 || row.progressCapableExecutableCount <= 0) {
      throw new Error(`TASK-109 Wilds lacks Level-1 progress-capable production support for ${speciesId}`);
    }
    return {
      speciesId,
      executableCount: row.executableCount,
      progressCapableExecutableCount: row.progressCapableExecutableCount,
    };
  });
}

async function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

export async function stageTask109PveV5Candidate(
  input: StageTask109PveV5Input,
): Promise<StagedTask109PveV5Candidate> {
  if (pathsOverlap(input.outputDirectory, input.basePublishedDirectory)) {
    throw new Error("TASK-109 outputDirectory must not overlap immutable published baseline");
  }
  const base = await loadPublishedPromotionV5BundleDirectory(
    input.basePublishedDirectory,
    TASK_109_BASE_GAME_DATA_VERSION,
  );
  if (base.manifest.bundleHash !== TASK_109_BASE_BUNDLE_HASH) {
    throw new Error("TASK-109 requires the exact approved game-data-core-kanto-johto-v4 baseline");
  }

  const [speciesRaw, itemsRaw] = await Promise.all([
    readFile(join(base.directory, GAME_DATA_V5_ARTIFACT_PATHS["catalogs/species"]), "utf8"),
    readFile(join(base.directory, GAME_DATA_V5_ARTIFACT_PATHS["catalogs/items"]), "utf8"),
  ]);
  const species = (JSON.parse(speciesRaw) as unknown[]).map(parseSpeciesDefinitionV2);
  const items = (JSON.parse(itemsRaw) as unknown[]).map(parseItemDefinitionV1);
  const factualItemIds = new Set(items.map(({ id }) => id));
  for (const itemId of PREALPHA_AUTHORED_ITEM_IDS) {
    if (factualItemIds.has(itemId)) {
      throw new Error(`PokeNexus-authored ItemId collides with factual item catalog: ${itemId}`);
    }
  }

  const content = canonicalizePveContent(parsePveContentV1(input.content));
  assertTask109WildsTopology(content);
  const level1Rows = level1PlayabilityEvidence(input.playability);
  const referenceItemIds = new Set<string>([
    ...factualItemIds,
    ...PREALPHA_AUTHORED_ITEM_IDS,
  ]);
  const validation = validatePveContentV1(content, {
    speciesIds: new Set(species.map(({ id }) => id)),
    itemIds: referenceItemIds,
    playability: input.playability,
  });
  if (!validation.valid) {
    const summary = validation.findings
      .map(({ code, path, message }) => `${code} ${path}: ${message}`)
      .join("; ");
    throw new Error(`invalid TASK-109 PvE candidate: ${summary}`);
  }
  const distribution = distributionEvidence(content);
  assertTask109Economy(content);

  const pveArtifacts = canonicalizePveContentArtifacts(content);
  const replacement = new Map<string, { bytes: Buffer; descriptor: ArtifactDescriptor }>([
    ["catalogs/zones", pveArtifacts.zones],
    ["catalogs/hunts", pveArtifacts.hunts],
    ["catalogs/encounter-definitions", pveArtifacts.encounters],
  ]);
  const descriptors = base.manifest.artifacts
    .map((descriptor) => replacement.get(descriptor.logicalName)?.descriptor ?? descriptor)
    .sort((left, right) =>
      left.logicalName.localeCompare(right.logicalName, "en", { sensitivity: "variant" }),
    );
  const contentCommitmentHash = sha256(Buffer.from(canonicalJson({
    schemaVersion: GAME_DATA_SCHEMA_V5,
    pveContentSchemaVersion: PVE_CONTENT_SCHEMA_VERSION,
    baseGameDataVersion: TASK_109_BASE_GAME_DATA_VERSION,
    baseBundleHash: TASK_109_BASE_BUNDLE_HASH,
    candidateGameDataVersion: TASK_109_CANDIDATE_GAME_DATA_VERSION,
    artifacts: descriptors,
    provenanceHash: base.manifest.provenanceHash,
    authoredContentAuthority: {
      version: PREALPHA_CONTENT_AUTHORITY_VERSION,
      itemIds: [...PREALPHA_AUTHORED_ITEM_IDS],
    },
  }), "utf8"));
  const candidateBundleHash = bundleHash(
    GAME_DATA_SCHEMA_V5,
    TASK_109_CANDIDATE_GAME_DATA_VERSION,
    descriptors,
    base.manifest.provenanceHash,
  );
  const playabilityAuthority = {
    profileArtifactId: TASK_109_PLAYABILITY_PROFILE_ARTIFACT_ID,
    profileContentHash: TASK_109_PLAYABILITY_PROFILE_CONTENT_HASH,
    gameDataVersion: TASK_109_PLAYABILITY_GAME_DATA_VERSION,
  } as const;
  const authoredContentAuthority = {
    version: PREALPHA_CONTENT_AUTHORITY_VERSION,
    itemIds: [...PREALPHA_AUTHORED_ITEM_IDS],
  };
  const review: Task109PveReview = {
    reviewVersion: TASK_109_PVE_REVIEW_VERSION,
    baseGameDataVersion: TASK_109_BASE_GAME_DATA_VERSION,
    baseBundleHash: TASK_109_BASE_BUNDLE_HASH,
    candidateGameDataVersion: TASK_109_CANDIDATE_GAME_DATA_VERSION,
    candidateBundleHash,
    provenanceHash: base.manifest.provenanceHash,
    contentCommitmentHash,
    authoredContentAuthority,
    artifactOrigins: {
      retainedSourceBacked: descriptors
        .filter(({ logicalName }) => !PVE_LOGICAL_NAMES.has(logicalName))
        .map(({ logicalName }) => logicalName),
      pokenexusAuthored: descriptors
        .filter(({ logicalName }) => PVE_LOGICAL_NAMES.has(logicalName))
        .map(({ logicalName }) => logicalName),
    },
    distribution,
    playabilityAuthority: { ...playabilityAuthority, level1Rows },
    zones: content.zones,
    hunts: content.hunts,
    encounters: content.encounters,
  };
  const reviewBytes = Buffer.from(canonicalJson(review), "utf8");
  const reviewHash = sha256(reviewBytes);
  const manifest: Task109PveV5StageManifest = {
    stageManifestVersion: TASK_109_PVE_V5_STAGE_VERSION,
    schemaVersion: GAME_DATA_SCHEMA_V5,
    pveContentSchemaVersion: PVE_CONTENT_SCHEMA_VERSION,
    baseGameDataVersion: TASK_109_BASE_GAME_DATA_VERSION,
    baseBundleHash: TASK_109_BASE_BUNDLE_HASH,
    candidateGameDataVersion: TASK_109_CANDIDATE_GAME_DATA_VERSION,
    candidateBundleHash,
    normalizerVersion: base.manifest.normalizerVersion,
    provenanceHash: base.manifest.provenanceHash,
    provenanceManifest: { ...base.manifest.provenanceManifest },
    sourceInventory: { ...base.manifest.sourceInventory },
    artifacts: descriptors,
    catalogCounts: catalogCounts(descriptors),
    contentCommitmentHash,
    authoredContentAuthority,
    playabilityAuthority,
    reviewHash,
  };
  const previewManifest = parseGameDataManifestV5({
    schemaVersion: GAME_DATA_SCHEMA_V5,
    pveContentSchemaVersion: PVE_CONTENT_SCHEMA_VERSION,
    gameDataVersion: TASK_109_CANDIDATE_GAME_DATA_VERSION,
    bundleHash: candidateBundleHash,
    provenanceHash: base.manifest.provenanceHash,
    publishedAt: "1970-01-01T00:00:00.000Z",
    normalizerVersion: base.manifest.normalizerVersion,
    artifacts: descriptors,
    provenanceManifest: base.manifest.provenanceManifest,
    sourceInventory: base.manifest.sourceInventory,
    catalogCounts: manifest.catalogCounts,
  });

  await rm(input.outputDirectory, { recursive: true, force: true });
  await mkdir(input.outputDirectory, { recursive: true });
  for (const descriptor of base.manifest.artifacts) {
    const relativePath =
      GAME_DATA_V5_ARTIFACT_PATHS[
        descriptor.logicalName as keyof typeof GAME_DATA_V5_ARTIFACT_PATHS
      ];
    if (!relativePath) throw new Error(`unsupported retained schema-5 artifact ${descriptor.logicalName}`);
    const authored = replacement.get(descriptor.logicalName);
    if (authored) {
      await writeBytes(join(input.outputDirectory, relativePath), authored.bytes);
      continue;
    }
    const bytes = await readFile(join(base.directory, relativePath));
    if (sha256(bytes) !== descriptor.contentHash) {
      throw new Error(`retained schema-5 artifact hash mismatch for ${descriptor.logicalName}`);
    }
    await writeBytes(join(input.outputDirectory, relativePath), bytes);
  }
  for (const audit of [base.manifest.provenanceManifest, base.manifest.sourceInventory]) {
    const bytes = await readFile(join(base.directory, audit.path));
    if (sha256(bytes) !== audit.contentHash) {
      throw new Error(`retained schema-5 audit artifact hash mismatch for ${audit.logicalName}`);
    }
    await writeBytes(join(input.outputDirectory, audit.path), bytes);
  }
  const manifestBytes = Buffer.from(canonicalJson(manifest), "utf8");
  await writeBytes(join(input.outputDirectory, "candidate-manifest.json"), manifestBytes);
  await writeBytes(
    join(input.outputDirectory, "runtime-preview-manifest.json"),
    Buffer.from(canonicalJson(previewManifest), "utf8"),
  );
  await writeBytes(join(input.outputDirectory, "human-review.json"), reviewBytes);

  for (const descriptor of descriptors) {
    const relativePath =
      GAME_DATA_V5_ARTIFACT_PATHS[
        descriptor.logicalName as keyof typeof GAME_DATA_V5_ARTIFACT_PATHS
      ];
    if (!relativePath) throw new Error(`unsupported TASK-109 schema-5 artifact ${descriptor.logicalName}`);
    const bytes = await readFile(join(input.outputDirectory, relativePath));
    if (sha256(bytes) !== descriptor.contentHash) {
      throw new Error(`staged TASK-109 artifact hash mismatch ${descriptor.logicalName}`);
    }
  }
  return {
    directory: input.outputDirectory,
    manifest,
    review,
    reviewHash,
    stageManifestHash: sha256(manifestBytes),
  };
}
