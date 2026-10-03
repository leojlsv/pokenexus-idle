import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  loadPublishedPromotionV5Bundle,
  publishApprovedTask109PveV5Candidate,
  sha256,
  TASK_109_CANDIDATE_GAME_DATA_VERSION,
  type StagedTask109PveV5Candidate,
  type Task109PveReview,
  type Task109PveV5StageManifest,
} from "../src/node";

const GAME_DATA_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(GAME_DATA_ROOT, "../..");
const PUBLISHED_ROOT = join(GAME_DATA_ROOT, "published");
const REVIEW_DIRECTORY = join(GAME_DATA_ROOT, "reviews", "task-109");
const REVIEW_PATH = join(REVIEW_DIRECTORY, "prealpha-wilds-v5-human-review.json");
const MANIFEST_PATH = join(REVIEW_DIRECTORY, "prealpha-wilds-v5-candidate-manifest.json");
const STAGE_DIRECTORY = join(REPO_ROOT, ".tmp", "task-109-prealpha-wilds-v5");

const HUMAN_APPROVED_AT = "2026-10-03T14:01:30Z";
const PUBLISHED_AT = "2026-10-03T14:03:02.265Z";
const HUMAN_APPROVED_REVIEW_HASH =
  "sha256:9bf35a1ff7ce9b0d0b3f08daa8248fb1fc7241dea84158f4376c7503786daabb";
const APPROVED_BUNDLE_HASH =
  "sha256:565cdd360c1b29dc3607696299244279a8d0c3f488d4544c41c62ed47592f782";
const APPROVED_CONTENT_COMMITMENT =
  "sha256:87bab803380b6fbcc3f23a26250be809ef9a149ba7a15ca8739744a68deb178e";

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

describe("TASK-109 approved Pre-alpha Wilds schema-5 publication", () => {
  it("publishes the exact Human-approved staged candidate immutably", async () => {
    const manifest = await readJson<Task109PveV5StageManifest>(MANIFEST_PATH);
    const review = await readJson<Task109PveReview>(REVIEW_PATH);
    const staged: StagedTask109PveV5Candidate = {
      directory: STAGE_DIRECTORY,
      manifest,
      review,
      reviewHash: sha256(Buffer.from(canonicalJson(review), "utf8")),
      stageManifestHash: sha256(Buffer.from(canonicalJson(manifest), "utf8")),
    };

    expect(staged.reviewHash).toBe(HUMAN_APPROVED_REVIEW_HASH);
    expect(staged.manifest.reviewHash).toBe(HUMAN_APPROVED_REVIEW_HASH);
    expect(staged.manifest.candidateGameDataVersion).toBe(TASK_109_CANDIDATE_GAME_DATA_VERSION);
    expect(staged.manifest.candidateBundleHash).toBe(APPROVED_BUNDLE_HASH);
    expect(staged.manifest.contentCommitmentHash).toBe(APPROVED_CONTENT_COMMITMENT);

    const published = await publishApprovedTask109PveV5Candidate(
      staged,
      PUBLISHED_ROOT,
      PUBLISHED_AT,
      {
        approvedReviewHash: HUMAN_APPROVED_REVIEW_HASH,
        approvedAt: HUMAN_APPROVED_AT,
      },
    );
    const reloaded = await loadPublishedPromotionV5Bundle(
      PUBLISHED_ROOT,
      TASK_109_CANDIDATE_GAME_DATA_VERSION,
    );

    expect(reloaded.manifest).toEqual(published.manifest);
    expect(reloaded.manifest.schemaVersion).toBe("5");
    expect(reloaded.manifest.gameDataVersion).toBe(TASK_109_CANDIDATE_GAME_DATA_VERSION);
    expect(reloaded.manifest.bundleHash).toBe(APPROVED_BUNDLE_HASH);
    expect(reloaded.manifest.publishedAt).toBe(PUBLISHED_AT);
    expect(reloaded.manifest.catalogCounts).toMatchObject({
      species: 293,
      items: 30,
      zones: 1,
      hunts: 1,
      encounterDefinitions: 18,
    });

    const receipt = {
      receiptVersion: "task-109-prealpha-wilds-publication-receipt-v1",
      humanApproval: {
        approvedAt: HUMAN_APPROVED_AT,
        approvedReviewHash: HUMAN_APPROVED_REVIEW_HASH,
        approvedContentCommitment: APPROVED_CONTENT_COMMITMENT,
      },
      publication: {
        schemaVersion: reloaded.manifest.schemaVersion,
        pveContentSchemaVersion: reloaded.manifest.pveContentSchemaVersion,
        gameDataVersion: reloaded.manifest.gameDataVersion,
        bundleHash: reloaded.manifest.bundleHash,
        publishedAt: reloaded.manifest.publishedAt,
        publishedDirectory: basename(reloaded.directory),
        artifactCount: reloaded.manifest.artifacts.length,
        catalogCounts: reloaded.manifest.catalogCounts,
        provenanceHash: reloaded.manifest.provenanceHash,
      },
      staging: {
        stageManifestHash: staged.stageManifestHash,
        reviewHash: staged.reviewHash,
        contentCommitmentHash: staged.manifest.contentCommitmentHash,
      },
    };
    await mkdir(REVIEW_DIRECTORY, { recursive: true });
    await writeFile(
      join(REVIEW_DIRECTORY, "prealpha-wilds-v5-publication.json"),
      canonicalJson(receipt),
      "utf8",
    );

    process.stdout.write(
      JSON.stringify(
        {
          gameDataVersion: reloaded.manifest.gameDataVersion,
          bundleHash: reloaded.manifest.bundleHash,
          publishedAt: reloaded.manifest.publishedAt,
          publishedDirectory: basename(reloaded.directory),
          approvedReviewHash: HUMAN_APPROVED_REVIEW_HASH,
          contentCommitmentHash: staged.manifest.contentCommitmentHash,
          stageManifestHash: staged.stageManifestHash,
        },
        null,
        2,
      ) + "\n",
    );
  }, 30_000);
});
