import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPublishedPveV4Bundle } from "./pve-publication.js";
import { parseGameDataManifest } from "./schema.js";

const PACKAGE_ROOT = join(import.meta.dirname, "..");
const PUBLISHED_ROOT = join(PACKAGE_ROOT, "published");
const V2_DIRECTORY = join(
  PUBLISHED_ROOT,
  "version-a583d33f46879d427da91e8a25ad1cedb4824df3f9adf584b2504506d0724e40",
);
const V3 = "game-data-core-kanto-johto-v3";
const REVIEW_MANIFEST = join(
  PACKAGE_ROOT,
  "reviews",
  "task-034",
  "verdant-edge-v1-candidate-manifest.json",
);
const PUBLICATION_RECEIPT = join(
  PACKAGE_ROOT,
  "reviews",
  "task-034",
  "verdant-edge-v1-publication.json",
);

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

describe("TASK-034 immutable published schema-v4 release", () => {
  it("loads v3 exactly and preserves all retained v2 factual artifact descriptors", async () => {
    const published = await loadPublishedPveV4Bundle(PUBLISHED_ROOT, V3);
    expect(published.manifest).toMatchObject({
      schemaVersion: "4",
      pveContentSchemaVersion: "1",
      gameDataVersion: V3,
      bundleHash:
        "sha256:a7ee6337f8f41986ca7fc4608e8f75f49fb1a42d54d66aeb18b5ae56208c6559",
      publishedAt: "2026-09-24T00:55:51.000Z",
      catalogCounts: {
        species: 293,
        moves: 547,
        types: 18,
        abilities: 147,
        items: 30,
        learnsets: 19_035,
        currentTypeEffectiveness: 324,
        zones: 1,
        hunts: 1,
        encounterDefinitions: 9,
      },
    });
    expect(published.manifest.artifacts).toHaveLength(10);

    const v2 = parseGameDataManifest(await json<unknown>(join(V2_DIRECTORY, "manifest.json")));
    for (const descriptor of v2.artifacts) {
      expect(published.manifest.artifacts).toContainEqual(descriptor);
    }

    const reviewed = await json<{
      artifacts: Array<{ logicalName: string; contentHash: string; recordCount: number }>;
      reviewHash: string;
      contentCommitmentHash: string;
    }>(REVIEW_MANIFEST);
    for (const logicalName of [
      "catalogs/zones",
      "catalogs/hunts",
      "catalogs/encounter-definitions",
    ]) {
      const descriptor = reviewed.artifacts.find((entry) => entry.logicalName === logicalName);
      expect(descriptor).toBeDefined();
      expect(published.manifest.artifacts).toContainEqual(descriptor);
    }

    const receipt = await json<{
      humanApproval: {
        approvedAt: string;
        approvedReviewHash: string;
        approvedContentCommitment: string;
      };
      publication: {
        gameDataVersion: string;
        bundleHash: string;
      };
    }>(PUBLICATION_RECEIPT);
    expect(receipt.humanApproval).toEqual({
      approvedAt: "2026-09-24T00:50:52Z",
      approvedReviewHash:
        "sha256:ea956e6932bb4d2587883a0ffd8e5e2f90ce5f16559c8866dd274c2acd403ad6",
      approvedContentCommitment:
        "sha256:b3cb6b8da30b57bbdf12469077269b57c8abace6aa62ca0179270c4885e3486e",
    });
    expect(receipt.publication).toMatchObject({
      gameDataVersion: V3,
      bundleHash:
        "sha256:a7ee6337f8f41986ca7fc4608e8f75f49fb1a42d54d66aeb18b5ae56208c6559",
    });
  });
});
