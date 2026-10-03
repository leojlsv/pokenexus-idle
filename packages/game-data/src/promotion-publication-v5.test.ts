import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundleHash, canonicalJson, sha256, sourceInventoryHash } from "./canonical.js";
import { GAME_DATA_V5_ARTIFACT_PATHS } from "./game-data-manifest-v5.js";
import {
  buildPublishedPromotionV5Manifest,
  loadPublishedPromotionV5Bundle,
  publishApprovedPromotionV5Candidate,
  publishedPromotionV5DirectoryForVersion,
} from "./promotion-publication-v5.js";
import {
  PROMOTION_CANDIDATE_GAME_DATA_VERSION,
  PROMOTION_NORMALIZER_VERSION,
  PROMOTION_V5_STAGE_VERSION,
  type PromotionV5StageManifest,
} from "./promotion-staging-v5.js";
import { finalizeProvenanceManifestV5 } from "./source-snapshot-v5.js";

async function fixture(root: string) {
  const stage = join(root, "stage");
  const emptyArtifactBytes = Buffer.from("[]", "utf8");
  const artifactHash = sha256(emptyArtifactBytes);
  const artifacts = Object.keys(GAME_DATA_V5_ARTIFACT_PATHS)
    .map((logicalName) => ({ logicalName, contentHash: artifactHash, recordCount: 0 }))
    .sort((left, right) => left.logicalName.localeCompare(right.logicalName, "en"));
  for (const descriptor of artifacts) {
    const path = GAME_DATA_V5_ARTIFACT_PATHS[
      descriptor.logicalName as keyof typeof GAME_DATA_V5_ARTIFACT_PATHS
    ];
    await import("node:fs/promises").then(({ mkdir }) => mkdir(join(stage, path, ".."), { recursive: true }));
    await writeFile(join(stage, path), emptyArtifactBytes);
  }

  const provenance = finalizeProvenanceManifestV5({
    sourceSnapshots: [],
    sourceRecords: [],
    factSources: [],
    moveFactSources: [],
    inventories: [],
  });
  const provenanceBytes = Buffer.from(canonicalJson(provenance), "utf8");
  const sourceInventoryBytes = Buffer.from(canonicalJson([]), "utf8");
  await writeFile(join(stage, "provenance.json"), provenanceBytes);
  await writeFile(join(stage, "source-inventory.json"), sourceInventoryBytes);
  const provenanceHash = provenance.provenanceHash!;
  const candidateBundleHash = bundleHash(
    "5",
    PROMOTION_CANDIDATE_GAME_DATA_VERSION,
    artifacts,
    provenanceHash,
  );
  const catalogCounts = {
    species: 0,
    moves: 0,
    types: 0,
    abilities: 0,
    items: 0,
    learnsets: 0,
    currentTypeEffectiveness: 0,
    zones: 0,
    hunts: 0,
    encounterDefinitions: 0,
  };
  const reviewBytes = Buffer.from(canonicalJson({
    candidateGameDataVersion: PROMOTION_CANDIDATE_GAME_DATA_VERSION,
    candidateBundleHash,
    provenanceHash,
  }), "utf8");
  const reviewHash = sha256(reviewBytes);
  const manifest: PromotionV5StageManifest = {
    stageManifestVersion: PROMOTION_V5_STAGE_VERSION,
    schemaVersion: "5",
    pveContentSchemaVersion: "1",
    baseGameDataVersion: "game-data-core-kanto-johto-v3",
    baseBundleHash: `sha256:${"1".repeat(64)}`,
    candidateGameDataVersion: PROMOTION_CANDIDATE_GAME_DATA_VERSION,
    candidateBundleHash,
    normalizerVersion: PROMOTION_NORMALIZER_VERSION,
    provenanceHash,
    provenanceManifest: {
      logicalName: "provenance",
      path: "provenance.json",
      contentHash: sha256(provenanceBytes),
    },
    sourceInventory: {
      logicalName: "source-inventory",
      path: "source-inventory.json",
      contentHash: sourceInventoryHash([]),
    },
    artifacts,
    catalogCounts,
    reviewHash,
  };
  await writeFile(join(stage, "candidate-manifest.json"), canonicalJson(manifest), "utf8");
  await writeFile(join(stage, "human-review.json"), reviewBytes);
  return { directory: stage, manifest, reviewHash };
}

describe("schema-v5 promotion publication", () => {
  it("requires the reviewed hash and publishes atomically/idempotently without widening runtime", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokenexus-task114-publish-"));
    const publishedRoot = join(root, "published");
    try {
      const staged = await fixture(root);
      await expect(
        publishApprovedPromotionV5Candidate(
          staged,
          publishedRoot,
          "2026-10-03T08:31:47.000Z",
          {
            approvedReviewHash: `sha256:${"0".repeat(64)}`,
            approvedAt: "2026-10-03T08:31:47Z",
          },
        ),
      ).rejects.toThrow(/does not match Human approval/);

      const first = await publishApprovedPromotionV5Candidate(
        staged,
        publishedRoot,
        "2026-10-03T08:31:47.000Z",
        {
          approvedReviewHash: staged.reviewHash,
          approvedAt: "2026-10-03T08:31:47Z",
        },
      );
      expect(first.manifest).toEqual(
        buildPublishedPromotionV5Manifest(staged.manifest, "2026-10-03T08:31:47.000Z"),
      );
      expect(first.directory).toBe(
        publishedPromotionV5DirectoryForVersion(
          publishedRoot,
          PROMOTION_CANDIDATE_GAME_DATA_VERSION,
        ),
      );
      expect(first.manifest.schemaVersion).toBe("5");
      expect(first.manifest.bundleHash).toBe(staged.manifest.candidateBundleHash);

      const loaded = await loadPublishedPromotionV5Bundle(
        publishedRoot,
        PROMOTION_CANDIDATE_GAME_DATA_VERSION,
      );
      expect(loaded.manifest).toEqual(first.manifest);
      const second = await publishApprovedPromotionV5Candidate(
        staged,
        publishedRoot,
        "2026-10-03T08:31:47.000Z",
        {
          approvedReviewHash: staged.reviewHash,
          approvedAt: "2026-10-03T08:31:47Z",
        },
      );
      expect(second.manifest).toEqual(first.manifest);
      expect(await readFile(join(first.directory, "manifest.json"), "utf8")).toBe(
        canonicalJson(first.manifest),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a coherently rewritten candidate that reuses the approved reviewHash", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokenexus-task114-review-replay-"));
    const publishedRoot = join(root, "published");
    try {
      const staged = await fixture(root);
      const speciesPath = GAME_DATA_V5_ARTIFACT_PATHS["catalogs/species"];
      const rewrittenSpeciesBytes = Buffer.from("[{}]", "utf8");
      await writeFile(join(staged.directory, speciesPath), rewrittenSpeciesBytes);
      const rewrittenArtifacts = staged.manifest.artifacts.map((descriptor) =>
        descriptor.logicalName === "catalogs/species"
          ? {
              ...descriptor,
              contentHash: sha256(rewrittenSpeciesBytes),
              recordCount: 1,
            }
          : descriptor,
      );
      staged.manifest.artifacts = rewrittenArtifacts;
      staged.manifest.catalogCounts = { ...staged.manifest.catalogCounts, species: 1 };
      staged.manifest.candidateBundleHash = bundleHash(
        "5",
        staged.manifest.candidateGameDataVersion,
        rewrittenArtifacts,
        staged.manifest.provenanceHash,
      );
      await writeFile(
        join(staged.directory, "candidate-manifest.json"),
        canonicalJson(staged.manifest),
        "utf8",
      );

      await expect(
        publishApprovedPromotionV5Candidate(
          staged,
          publishedRoot,
          "2026-10-03T08:31:47.000Z",
          {
            approvedReviewHash: staged.reviewHash,
            approvedAt: "2026-10-03T08:31:47Z",
          },
        ),
      ).rejects.toThrow(/Human review does not bind the candidate identity/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
