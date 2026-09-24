import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PveContentV1, PvePlayabilityEvidence } from "./pve-content-schema.js";
import {
  loadPublishedPveV4Bundle,
  publishApprovedPveV4Candidate,
  publishedPveV4DirectoryForVersion,
} from "./pve-publication.js";
import { stagePveV4Candidate } from "./pve-staging.js";

const PUBLISHED_V2 = join(
  import.meta.dirname,
  "..",
  "published",
  "version-a583d33f46879d427da91e8a25ad1cedb4824df3f9adf584b2504506d0724e40",
);
const PROFILE = join(import.meta.dirname, "..", "profiles", "pve", "verdant-edge-v1.json");

const RATTATA = "candidate:species:pokedex-rattata-19:9975b0175c";
const SPEAROW = "candidate:species:pokedex-spearow-21:0ddd44d801";
const HOOTHOOT = "candidate:species:pokedex-hoothoot-163:3ecad094b2";

function evidenceRow(speciesId: string, level: number, count: number) {
  return {
    speciesId,
    level,
    eligibleCount: count,
    executableCount: count,
    progressCapableExecutableCount: count,
    simpleExecutableCount: count,
    authoredExecutableCount: 0,
    distinctTargetClasses: 1,
    distinctCategoryClasses: 1,
    distinctEffectRoleClasses: 1,
    bottleneck: count === 1 ? "one-executable" as const : null,
  };
}

function playability(): PvePlayabilityEvidence {
  return {
    profileArtifactId: "spec-012-production-move-support-v1",
    profileContentHash: `sha256:${"1".repeat(64)}`,
    gameDataVersion: "game-data-core-kanto-johto-v2",
    speciesCount: 293,
    rows: [
      ...[3, 4, 5].map((level) => evidenceRow(RATTATA, level, 1)),
      ...[3, 4, 5].map((level) => evidenceRow(SPEAROW, level, 1)),
      ...[3, 4, 5].map((level) => evidenceRow(HOOTHOOT, level, 2)),
    ],
  };
}

async function content(): Promise<PveContentV1> {
  return JSON.parse(await readFile(PROFILE, "utf8")) as PveContentV1;
}

describe("schema-v4 PvE publication", () => {
  it("requires the exact Human-approved review hash and publishes atomically/idempotently", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokenexus-task034-publish-"));
    const stageDirectory = join(root, "stage");
    const publishedRoot = join(root, "published");
    try {
      const staged = await stagePveV4Candidate({
        basePublishedDirectory: PUBLISHED_V2,
        outputDirectory: stageDirectory,
        content: await content(),
        playability: playability(),
        pokemonNextLevelXpCostByLevel: { 3: 37, 4: 61, 5: 91 },
      });
      await expect(
        publishApprovedPveV4Candidate(
          staged,
          publishedRoot,
          "game-data:test-pve-v3",
          "2026-09-24T00:50:52.000Z",
          {
            approvedReviewHash: `sha256:${"0".repeat(64)}`,
            approvedAt: "2026-09-24T00:50:52Z",
          },
        ),
      ).rejects.toThrow(/does not match Human approval/);

      const first = await publishApprovedPveV4Candidate(
        staged,
        publishedRoot,
        "game-data:test-pve-v3",
        "2026-09-24T00:50:52.000Z",
        {
          approvedReviewHash: staged.manifest.reviewHash,
          approvedAt: "2026-09-24T00:50:52Z",
        },
      );
      expect(first.manifest.schemaVersion).toBe("4");
      expect(first.manifest.gameDataVersion).toBe("game-data:test-pve-v3");
      expect(first.manifest.artifacts).toHaveLength(10);
      expect(first.directory).toBe(
        publishedPveV4DirectoryForVersion(publishedRoot, "game-data:test-pve-v3"),
      );
      const loaded = await loadPublishedPveV4Bundle(
        publishedRoot,
        "game-data:test-pve-v3",
      );
      expect(loaded.manifest).toEqual(first.manifest);

      const second = await publishApprovedPveV4Candidate(
        staged,
        publishedRoot,
        "game-data:test-pve-v3",
        "2026-09-24T00:50:52.000Z",
        {
          approvedReviewHash: staged.manifest.reviewHash,
          approvedAt: "2026-09-24T00:50:52Z",
        },
      );
      expect(second.manifest).toEqual(first.manifest);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);
});
