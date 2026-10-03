import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  bundleHash,
  canonicalJson,
  canonicalSourceInventories,
  sha256,
  sourceInventoryHash,
} from "./canonical.js";
import {
  GAME_DATA_V5_ARTIFACT_PATHS,
  parseGameDataManifestV5,
  type GameDataManifestV5,
} from "./game-data-manifest-v5.js";
import type {
  PromotionV5Review,
  PromotionV5StageManifest,
  StagedPromotionV5Candidate,
} from "./promotion-staging-v5.js";
import {
  canonicalizeProvenanceManifestV5,
  parseProvenanceManifestV5,
  provenanceHashV5,
} from "./source-snapshot-v5.js";

const HASH_RE = /^sha256:[0-9a-f]{64}$/u;

export interface PromotionV5PublicationApproval {
  approvedReviewHash: string;
  approvedAt: string;
}

export interface PublishedPromotionV5Bundle {
  directory: string;
  manifest: GameDataManifestV5;
}

type PromotionV5PublicationCandidate = Pick<
  StagedPromotionV5Candidate,
  "directory" | "manifest" | "reviewHash"
>;

function normalizeVersion(gameDataVersion: string): string {
  const normalized = gameDataVersion.normalize("NFC");
  if (!normalized) throw new TypeError("gameDataVersion must be a non-empty opaque string");
  return normalized;
}

export function publishedPromotionV5DirectoryForVersion(
  root: string,
  gameDataVersion: string,
): string {
  const normalized = normalizeVersion(gameDataVersion);
  const digest = sha256(Buffer.from(normalized, "utf8")).slice("sha256:".length);
  return join(root, `version-${digest}`);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function writeCanonicalFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, canonicalJson(value), "utf8");
}

async function readCanonicalJson(path: string, label: string): Promise<unknown> {
  const bytes = await readFile(path);
  const text = bytes.toString("utf8");
  const parsed = JSON.parse(text) as unknown;
  if (canonicalJson(parsed) !== text) throw new Error(`${label} is not canonical JSON`);
  return parsed;
}

export function buildPublishedPromotionV5Manifest(
  staged: PromotionV5StageManifest,
  publishedAt: string,
): GameDataManifestV5 {
  if (Number.isNaN(Date.parse(publishedAt))) {
    throw new TypeError("publishedAt must be an ISO-compatible timestamp");
  }
  const gameDataVersion = normalizeVersion(staged.candidateGameDataVersion);
  const artifacts = [...staged.artifacts].sort((left, right) =>
    left.logicalName.localeCompare(right.logicalName, "en", { sensitivity: "variant" }),
  );
  const expectedBundleHash = bundleHash(
    staged.schemaVersion,
    gameDataVersion,
    artifacts,
    staged.provenanceHash,
  );
  if (expectedBundleHash !== staged.candidateBundleHash) {
    throw new Error("schema-5 staged candidate bundleHash does not match its reviewed identity");
  }
  return parseGameDataManifestV5({
    schemaVersion: staged.schemaVersion,
    pveContentSchemaVersion: staged.pveContentSchemaVersion,
    gameDataVersion,
    bundleHash: staged.candidateBundleHash,
    provenanceHash: staged.provenanceHash,
    publishedAt,
    normalizerVersion: staged.normalizerVersion,
    artifacts,
    provenanceManifest: { ...staged.provenanceManifest },
    sourceInventory: { ...staged.sourceInventory },
    catalogCounts: { ...staged.catalogCounts },
  });
}

export async function loadPublishedPromotionV5BundleDirectory(
  directory: string,
  expectedGameDataVersion?: string,
): Promise<PublishedPromotionV5Bundle> {
  const manifest = parseGameDataManifestV5(
    await readCanonicalJson(join(directory, "manifest.json"), "published schema-v5 manifest"),
  );
  if (
    expectedGameDataVersion !== undefined &&
    manifest.gameDataVersion !== normalizeVersion(expectedGameDataVersion)
  ) {
    throw new Error("published schema-v5 manifest gameDataVersion does not match requested version");
  }
  if (
    bundleHash(
      manifest.schemaVersion,
      manifest.gameDataVersion,
      manifest.artifacts,
      manifest.provenanceHash,
    ) !== manifest.bundleHash
  ) {
    throw new Error("published schema-v5 bundleHash mismatch");
  }

  for (const descriptor of manifest.artifacts) {
    const relativePath =
      GAME_DATA_V5_ARTIFACT_PATHS[
        descriptor.logicalName as keyof typeof GAME_DATA_V5_ARTIFACT_PATHS
      ];
    if (!relativePath) throw new Error(`unsupported schema-v5 artifact ${descriptor.logicalName}`);
    const bytes = await readFile(join(directory, relativePath));
    if (sha256(bytes) !== descriptor.contentHash) {
      throw new Error(`published ${descriptor.logicalName} content hash mismatch`);
    }
    const text = bytes.toString("utf8");
    const parsed = JSON.parse(text) as unknown;
    if (canonicalJson(parsed) !== text) {
      throw new Error(`published ${descriptor.logicalName} is not canonical JSON`);
    }
    if (!Array.isArray(parsed) || parsed.length !== descriptor.recordCount) {
      throw new Error(`published ${descriptor.logicalName} record count mismatch`);
    }
  }

  const provenanceBytes = await readFile(join(directory, manifest.provenanceManifest.path));
  if (sha256(provenanceBytes) !== manifest.provenanceManifest.contentHash) {
    throw new Error("published schema-v5 provenance file hash mismatch");
  }
  const provenance = canonicalizeProvenanceManifestV5(
    parseProvenanceManifestV5(JSON.parse(provenanceBytes.toString("utf8")) as unknown),
  );
  if (canonicalJson(provenance) !== provenanceBytes.toString("utf8")) {
    throw new Error("published schema-v5 provenance file is not canonical JSON");
  }
  if (
    provenanceHashV5(provenance) !== manifest.provenanceHash ||
    provenance.provenanceHash !== manifest.provenanceHash
  ) {
    throw new Error("published schema-v5 provenanceHash mismatch");
  }

  const sourceInventoryBytes = await readFile(join(directory, manifest.sourceInventory.path));
  if (sha256(sourceInventoryBytes) !== manifest.sourceInventory.contentHash) {
    throw new Error("published schema-v5 source inventory file hash mismatch");
  }
  const expectedSourceInventoryHash = sourceInventoryHash(provenance.inventories);
  if (
    expectedSourceInventoryHash !== manifest.sourceInventory.contentHash ||
    provenance.sourceInventoryHash !== expectedSourceInventoryHash
  ) {
    throw new Error("published schema-v5 source inventory hash mismatch");
  }
  if (
    !sourceInventoryBytes.equals(
      Buffer.from(canonicalJson(canonicalSourceInventories(provenance.inventories)), "utf8"),
    )
  ) {
    throw new Error("published schema-v5 source inventory does not match provenance");
  }

  return { directory, manifest };
}

export async function loadPublishedPromotionV5Bundle(
  publishedRoot: string,
  gameDataVersion: string,
): Promise<PublishedPromotionV5Bundle> {
  const normalized = normalizeVersion(gameDataVersion);
  return loadPublishedPromotionV5BundleDirectory(
    publishedPromotionV5DirectoryForVersion(publishedRoot, normalized),
    normalized,
  );
}

async function verifyStageCommitment(stagedCandidate: PromotionV5PublicationCandidate): Promise<void> {
  if (!HASH_RE.test(stagedCandidate.reviewHash)) {
    throw new Error("invalid schema-v5 reviewHash commitment");
  }
  if (stagedCandidate.reviewHash !== stagedCandidate.manifest.reviewHash) {
    throw new Error("schema-v5 staged reviewHash does not match candidate manifest");
  }
  const stageManifestBytes = await readFile(join(stagedCandidate.directory, "candidate-manifest.json"));
  const stageManifestText = stageManifestBytes.toString("utf8");
  const stageManifestValue = JSON.parse(stageManifestText) as unknown;
  if (canonicalJson(stageManifestValue) !== stageManifestText) {
    throw new Error("schema-v5 staged manifest is not canonical JSON");
  }
  if (canonicalJson(stageManifestValue) !== canonicalJson(stagedCandidate.manifest)) {
    throw new Error("schema-v5 staged manifest no longer matches validated candidate");
  }
  const reviewBytes = await readFile(join(stagedCandidate.directory, "human-review.json"));
  if (sha256(reviewBytes) !== stagedCandidate.reviewHash) {
    throw new Error("schema-v5 staged Human review hash no longer matches commitment");
  }
  const reviewText = reviewBytes.toString("utf8");
  const reviewValue = JSON.parse(reviewText) as unknown;
  if (canonicalJson(reviewValue) !== reviewText) {
    throw new Error("schema-v5 staged Human review is not canonical JSON");
  }
  if (reviewValue === null || typeof reviewValue !== "object" || Array.isArray(reviewValue)) {
    throw new Error("schema-v5 staged Human review must be an object");
  }
  const review = reviewValue as Partial<PromotionV5Review>;
  if (
    review.candidateGameDataVersion !== stagedCandidate.manifest.candidateGameDataVersion ||
    review.candidateBundleHash !== stagedCandidate.manifest.candidateBundleHash ||
    review.provenanceHash !== stagedCandidate.manifest.provenanceHash
  ) {
    throw new Error("schema-v5 staged Human review does not bind the candidate identity");
  }
}

async function copyStagePayload(
  stagedCandidate: PromotionV5PublicationCandidate,
  destination: string,
): Promise<void> {
  for (const descriptor of stagedCandidate.manifest.artifacts) {
    const relativePath =
      GAME_DATA_V5_ARTIFACT_PATHS[
        descriptor.logicalName as keyof typeof GAME_DATA_V5_ARTIFACT_PATHS
      ];
    if (!relativePath) throw new Error(`unsupported schema-v5 artifact ${descriptor.logicalName}`);
    const bytes = await readFile(join(stagedCandidate.directory, relativePath));
    if (sha256(bytes) !== descriptor.contentHash) {
      throw new Error(`staged ${descriptor.logicalName} content hash mismatch`);
    }
    const target = join(destination, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  for (const entry of [
    stagedCandidate.manifest.provenanceManifest,
    stagedCandidate.manifest.sourceInventory,
  ]) {
    const bytes = await readFile(join(stagedCandidate.directory, entry.path));
    if (sha256(bytes) !== entry.contentHash) {
      throw new Error(`staged ${entry.logicalName} content hash mismatch`);
    }
    await writeFile(join(destination, entry.path), bytes);
  }
}

export async function publishApprovedPromotionV5Candidate(
  stagedCandidate: PromotionV5PublicationCandidate,
  publishedRoot: string,
  publishedAt: string,
  approval: PromotionV5PublicationApproval,
): Promise<PublishedPromotionV5Bundle> {
  if (!HASH_RE.test(approval.approvedReviewHash)) {
    throw new Error("schema-v5 publication requires an exact Human-approved reviewHash");
  }
  const approvedAtMs = Date.parse(approval.approvedAt);
  const publishedAtMs = Date.parse(publishedAt);
  if (Number.isNaN(approvedAtMs)) {
    throw new TypeError("schema-v5 Human approval timestamp must be ISO-compatible");
  }
  if (Number.isNaN(publishedAtMs)) {
    throw new TypeError("schema-v5 publication timestamp must be ISO-compatible");
  }
  if (publishedAtMs < approvedAtMs) {
    throw new Error("schema-v5 publication timestamp must not precede Human approval");
  }
  if (approval.approvedReviewHash !== stagedCandidate.reviewHash) {
    throw new Error("schema-v5 staged reviewHash does not match Human approval");
  }
  await verifyStageCommitment(stagedCandidate);

  const manifest = buildPublishedPromotionV5Manifest(stagedCandidate.manifest, publishedAt);
  const destination = publishedPromotionV5DirectoryForVersion(
    publishedRoot,
    manifest.gameDataVersion,
  );
  await mkdir(publishedRoot, { recursive: true });

  if (await pathExists(destination)) {
    const existing = await loadPublishedPromotionV5BundleDirectory(
      destination,
      manifest.gameDataVersion,
    );
    if (existing.manifest.bundleHash !== manifest.bundleHash) {
      throw new Error(
        `gameDataVersion ${manifest.gameDataVersion} already exists with different content`,
      );
    }
    return existing;
  }

  const temporary = join(publishedRoot, `.publish-v5-${randomUUID()}`);
  await mkdir(temporary, { recursive: false });
  try {
    await copyStagePayload(stagedCandidate, temporary);
    await writeCanonicalFile(join(temporary, "manifest.json"), manifest);
    await loadPublishedPromotionV5BundleDirectory(temporary, manifest.gameDataVersion);
    try {
      await rename(temporary, destination);
    } catch (error) {
      if (!(await pathExists(destination))) throw error;
      const existing = await loadPublishedPromotionV5BundleDirectory(
        destination,
        manifest.gameDataVersion,
      );
      if (existing.manifest.bundleHash !== manifest.bundleHash) {
        throw new Error(
          `gameDataVersion ${manifest.gameDataVersion} already exists with different content`,
          { cause: error },
        );
      }
      await rm(temporary, { recursive: true, force: true });
      return existing;
    }
    return { directory: destination, manifest };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}
