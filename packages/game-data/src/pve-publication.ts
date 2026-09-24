import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  bundleHash,
  canonicalJson,
  canonicalSourceInventories,
  canonicalizeProvenanceManifest,
  provenanceHash,
  sha256,
  sourceInventoryHash,
} from "./canonical.js";
import {
  GAME_DATA_SCHEMA_V4,
  GAME_DATA_V4_ARTIFACT_PATHS,
  parseGameDataManifestV4,
  type GameDataManifestV4,
} from "./pve-manifest.js";
import type { StagedPveV4Candidate } from "./pve-staging.js";
import { parseProvenanceManifest } from "./schema.js";

const HASH_RE = /^sha256:[0-9a-f]{64}$/u;

export interface PveV4PublicationApproval {
  approvedReviewHash: string;
  approvedAt: string;
}

export interface PublishedPveV4Bundle {
  directory: string;
  manifest: GameDataManifestV4;
}

function normalizeVersion(gameDataVersion: string): string {
  const normalized = gameDataVersion.normalize("NFC");
  if (!normalized) throw new TypeError("gameDataVersion must be a non-empty opaque string");
  return normalized;
}

export function publishedPveV4DirectoryForVersion(
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
  if (canonicalJson(parsed) !== text) {
    throw new Error(`${label} is not canonical JSON`);
  }
  return parsed;
}

export function buildPublishedPveV4Manifest(
  staged: StagedPveV4Candidate["manifest"],
  gameDataVersion: string,
  publishedAt: string,
): GameDataManifestV4 {
  const normalizedGameDataVersion = normalizeVersion(gameDataVersion);
  if (Number.isNaN(Date.parse(publishedAt))) {
    throw new TypeError("publishedAt must be an ISO-compatible timestamp");
  }
  const artifacts = [...staged.artifacts].sort((left, right) =>
    left.logicalName.localeCompare(right.logicalName, "en", { sensitivity: "variant" }),
  );
  return {
    schemaVersion: GAME_DATA_SCHEMA_V4,
    pveContentSchemaVersion: staged.pveContentSchemaVersion,
    gameDataVersion: normalizedGameDataVersion,
    bundleHash: bundleHash(
      GAME_DATA_SCHEMA_V4,
      normalizedGameDataVersion,
      artifacts,
      staged.provenanceHash,
    ),
    provenanceHash: staged.provenanceHash,
    publishedAt,
    normalizerVersion: staged.normalizerVersion,
    artifacts,
    provenanceManifest: { ...staged.provenanceManifest },
    sourceInventory: { ...staged.sourceInventory },
    catalogCounts: { ...staged.catalogCounts },
  };
}

export async function loadPublishedPveV4BundleDirectory(
  directory: string,
  expectedGameDataVersion?: string,
): Promise<PublishedPveV4Bundle> {
  const manifestValue = await readCanonicalJson(
    join(directory, "manifest.json"),
    "published schema-v4 manifest",
  );
  const manifest = parseGameDataManifestV4(manifestValue);
  if (
    expectedGameDataVersion !== undefined &&
    manifest.gameDataVersion !== normalizeVersion(expectedGameDataVersion)
  ) {
    throw new Error("published schema-v4 manifest gameDataVersion does not match requested version");
  }
  const expectedBundleHash = bundleHash(
    manifest.schemaVersion,
    manifest.gameDataVersion,
    manifest.artifacts,
    manifest.provenanceHash,
  );
  if (manifest.bundleHash !== expectedBundleHash) {
    throw new Error("published schema-v4 bundleHash mismatch");
  }

  for (const descriptor of manifest.artifacts) {
    const relativePath =
      GAME_DATA_V4_ARTIFACT_PATHS[
        descriptor.logicalName as keyof typeof GAME_DATA_V4_ARTIFACT_PATHS
      ];
    if (!relativePath) {
      throw new Error(`unsupported schema-v4 artifact ${descriptor.logicalName}`);
    }
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

  const provenanceBytes = await readFile(
    join(directory, manifest.provenanceManifest.path),
  );
  if (sha256(provenanceBytes) !== manifest.provenanceManifest.contentHash) {
    throw new Error("published schema-v4 provenance file hash mismatch");
  }
  const provenance = canonicalizeProvenanceManifest(
    parseProvenanceManifest(JSON.parse(provenanceBytes.toString("utf8")) as unknown),
  );
  if (canonicalJson(provenance) !== provenanceBytes.toString("utf8")) {
    throw new Error("published schema-v4 provenance file is not canonical JSON");
  }
  if (
    provenanceHash(provenance) !== manifest.provenanceHash ||
    provenance.provenanceHash !== manifest.provenanceHash
  ) {
    throw new Error("published schema-v4 provenanceHash mismatch");
  }

  const sourceInventoryBytes = await readFile(
    join(directory, manifest.sourceInventory.path),
  );
  if (sha256(sourceInventoryBytes) !== manifest.sourceInventory.contentHash) {
    throw new Error("published schema-v4 source inventory file hash mismatch");
  }
  const expectedSourceInventoryHash = sourceInventoryHash(provenance.inventories);
  if (
    expectedSourceInventoryHash !== manifest.sourceInventory.contentHash ||
    provenance.sourceInventoryHash !== expectedSourceInventoryHash
  ) {
    throw new Error("published schema-v4 source inventory hash mismatch");
  }
  if (
    !sourceInventoryBytes.equals(
      Buffer.from(canonicalJson(canonicalSourceInventories(provenance.inventories)), "utf8"),
    )
  ) {
    throw new Error("published schema-v4 source inventory does not match provenance");
  }

  return { directory, manifest };
}

export async function loadPublishedPveV4Bundle(
  publishedRoot: string,
  gameDataVersion: string,
): Promise<PublishedPveV4Bundle> {
  const normalized = normalizeVersion(gameDataVersion);
  return loadPublishedPveV4BundleDirectory(
    publishedPveV4DirectoryForVersion(publishedRoot, normalized),
    normalized,
  );
}

async function verifyStageCommitment(stagedCandidate: StagedPveV4Candidate): Promise<void> {
  if (!HASH_RE.test(stagedCandidate.stageManifestHash)) {
    throw new Error("invalid schema-v4 stageManifestHash commitment");
  }
  const stageManifestBytes = await readFile(
    join(stagedCandidate.directory, "candidate-manifest.json"),
  );
  if (sha256(stageManifestBytes) !== stagedCandidate.stageManifestHash) {
    throw new Error("schema-v4 staged manifest hash no longer matches commitment");
  }
  const stageManifestValue = JSON.parse(stageManifestBytes.toString("utf8")) as unknown;
  if (canonicalJson(stageManifestValue) !== stageManifestBytes.toString("utf8")) {
    throw new Error("schema-v4 staged manifest is not canonical JSON");
  }
  if (canonicalJson(stageManifestValue) !== canonicalJson(stagedCandidate.manifest)) {
    throw new Error("schema-v4 staged manifest no longer matches validated candidate");
  }
  const reviewBytes = await readFile(join(stagedCandidate.directory, "human-review.json"));
  if (sha256(reviewBytes) !== stagedCandidate.manifest.reviewHash) {
    throw new Error("schema-v4 staged Human review hash no longer matches commitment");
  }
  if (
    canonicalJson(JSON.parse(reviewBytes.toString("utf8")) as unknown) !==
    reviewBytes.toString("utf8")
  ) {
    throw new Error("schema-v4 staged Human review is not canonical JSON");
  }
}

async function copyStagePayload(
  stagedCandidate: StagedPveV4Candidate,
  destination: string,
): Promise<void> {
  for (const descriptor of stagedCandidate.manifest.artifacts) {
    const relativePath =
      GAME_DATA_V4_ARTIFACT_PATHS[
        descriptor.logicalName as keyof typeof GAME_DATA_V4_ARTIFACT_PATHS
      ];
    if (!relativePath) {
      throw new Error(`unsupported schema-v4 artifact ${descriptor.logicalName}`);
    }
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

export async function publishApprovedPveV4Candidate(
  stagedCandidate: StagedPveV4Candidate,
  publishedRoot: string,
  gameDataVersion: string,
  publishedAt: string,
  approval: PveV4PublicationApproval,
): Promise<PublishedPveV4Bundle> {
  if (!HASH_RE.test(approval.approvedReviewHash)) {
    throw new Error("schema-v4 publication requires an exact Human-approved reviewHash");
  }
  if (Number.isNaN(Date.parse(approval.approvedAt))) {
    throw new TypeError("schema-v4 Human approval timestamp must be ISO-compatible");
  }
  if (approval.approvedReviewHash !== stagedCandidate.manifest.reviewHash) {
    throw new Error("schema-v4 staged reviewHash does not match Human approval");
  }
  await verifyStageCommitment(stagedCandidate);

  const manifest = buildPublishedPveV4Manifest(
    stagedCandidate.manifest,
    gameDataVersion,
    publishedAt,
  );
  const destination = publishedPveV4DirectoryForVersion(
    publishedRoot,
    manifest.gameDataVersion,
  );
  await mkdir(publishedRoot, { recursive: true });

  if (await pathExists(destination)) {
    const existing = await loadPublishedPveV4BundleDirectory(
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

  const temporary = join(publishedRoot, `.publish-pve-${randomUUID()}`);
  await mkdir(temporary, { recursive: false });
  try {
    await copyStagePayload(stagedCandidate, temporary);
    await writeCanonicalFile(join(temporary, "manifest.json"), manifest);
    await loadPublishedPveV4BundleDirectory(temporary, manifest.gameDataVersion);
    try {
      await rename(temporary, destination);
    } catch (error) {
      if (!(await pathExists(destination))) throw error;
      const existing = await loadPublishedPveV4BundleDirectory(
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
