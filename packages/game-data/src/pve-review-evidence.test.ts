import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalizePveContentArtifacts,
} from "./pve-content-canonical.js";
import { parsePveContentV1 } from "./pve-content-schema.js";
import { pveHumanReviewHash, type PveHumanReviewReport } from "./pve-review.js";
import type { PveV4StageManifest } from "./pve-staging.js";
import { parseGameDataManifest } from "./schema.js";

const PACKAGE_ROOT = join(import.meta.dirname, "..");
const PROFILE = join(PACKAGE_ROOT, "profiles", "pve", "verdant-edge-v1.json");
const REVIEW = join(
  PACKAGE_ROOT,
  "reviews",
  "task-034",
  "verdant-edge-v1-human-review.json",
);
const CANDIDATE_MANIFEST = join(
  PACKAGE_ROOT,
  "reviews",
  "task-034",
  "verdant-edge-v1-candidate-manifest.json",
);
const V2_MANIFEST = join(
  PACKAGE_ROOT,
  "published",
  "version-a583d33f46879d427da91e8a25ad1cedb4824df3f9adf584b2504506d0724e40",
  "manifest.json",
);

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

describe("TASK-034 committed Human-review evidence", () => {
  it("matches the authored profile, retained v2 facts and deterministic review commitment", async () => {
    const content = parsePveContentV1(await json<unknown>(PROFILE));
    const review = await json<PveHumanReviewReport>(REVIEW);
    const candidate = await json<PveV4StageManifest>(CANDIDATE_MANIFEST);
    const v2 = parseGameDataManifest(await json<unknown>(V2_MANIFEST));

    expect(candidate.baseGameDataVersion).toBe(v2.gameDataVersion);
    expect(candidate.baseBundleHash).toBe(v2.bundleHash);
    expect(candidate.schemaVersion).toBe("4");
    expect(candidate.pveContentSchemaVersion).toBe("1");
    expect(candidate.artifactOrigins).toEqual({
      retainedSourceBacked: {
        provenanceScope: "retained-external-factual-provenance",
        logicalNames: [
          "catalogs/species",
          "catalogs/moves",
          "catalogs/types",
          "catalogs/abilities",
          "catalogs/items",
          "catalogs/learnsets",
          "referenceData/currentTypeEffectiveness",
        ],
      },
      pokenexusAuthored: {
        provenanceScope: "pokenexus-authored-no-external-source-record",
        logicalNames: [
          "catalogs/zones",
          "catalogs/hunts",
          "catalogs/encounter-definitions",
        ],
      },
    });
    expect(review.artifactOrigins).toEqual(candidate.artifactOrigins);
    expect(candidate.artifacts).toHaveLength(10);
    for (const descriptor of v2.artifacts) {
      expect(candidate.artifacts).toContainEqual(descriptor);
    }

    const pveArtifacts = Object.values(canonicalizePveContentArtifacts(content));
    for (const { descriptor } of pveArtifacts) {
      expect(candidate.artifacts).toContainEqual(descriptor);
      expect(review.candidate.artifacts).toContainEqual(descriptor);
    }

    expect(review.candidate.gameDataVersion).toBe(candidate.candidateGameDataVersion);
    expect(review.candidate.bundleHash).toBe(candidate.candidateBundleHash);
    expect(review.candidate.contentCommitmentHash).toBe(candidate.contentCommitmentHash);
    expect(pveHumanReviewHash(review)).toBe(candidate.reviewHash);
    expect(review.playabilityAuthority).toEqual({
      profileArtifactId: "spec-012-production-move-support-v1",
      profileContentHash:
        "sha256:1462b33b35e38224b505240dbf5205104e98dae1310d0bc630e2aa02fb31879e",
      gameDataVersion: "game-data-core-kanto-johto-v2",
    });

    expect(review.zones).toEqual([
      expect.objectContaining({
        id: "zone:verdant-edge",
        playerLevelMin: null,
        prerequisiteHuntIds: [],
        playerLevelGateImplication: null,
      }),
    ]);
    expect(review.hunts).toEqual([
      expect.objectContaining({
        id: "hunt:verdant-edge:wilds",
        zoneId: "zone:verdant-edge",
        playerLevelMin: null,
        prerequisiteHuntIds: [],
        recoveryDurationMs: 30_000,
        playerLevelGateImplication: null,
      }),
    ]);
    expect(review.encounters).toHaveLength(9);
    expect(review.encounters.reduce((sum, row) => sum + row.weight, 0)).toBe(100);
    expect(review.encounters.every(({ reward }) => reward.itemDrops.length === 0)).toBe(true);

    const bottlenecks = review.encounters.filter(({ playability }) =>
      playability.some(({ oneChoiceBottleneck }) => oneChoiceBottleneck),
    );
    expect(bottlenecks).toHaveLength(6);
    expect(new Set(bottlenecks.map(({ speciesId }) => speciesId))).toEqual(
      new Set([
        "candidate:species:pokedex-rattata-19:9975b0175c",
        "candidate:species:pokedex-spearow-21:0ddd44d801",
      ]),
    );
    expect(
      review.encounters
        .filter(({ speciesId }) => speciesId.includes("hoothoot"))
        .every(({ playability }) =>
          playability.every(({ progressCapableExecutableCount }) =>
            progressCapableExecutableCount === 2),
        ),
    ).toBe(true);

    const xpByLevel = new Map(
      review.encounters.map(({ levelBand, reward, soloPokemonXpContext }) => [
        levelBand.min,
        {
          pokemonXpPool: reward.pokemonXpPool,
          playerXp: reward.playerXp,
          context: soloPokemonXpContext,
        },
      ]),
    );
    expect(xpByLevel.get(3)).toEqual({
      pokemonXpPool: 18,
      playerXp: 6,
      context: { nextLevelCost: 37, rewardShareBasisPoints: 4865 },
    });
    expect(xpByLevel.get(4)).toEqual({
      pokemonXpPool: 24,
      playerXp: 8,
      context: { nextLevelCost: 61, rewardShareBasisPoints: 3934 },
    });
    expect(xpByLevel.get(5)).toEqual({
      pokemonXpPool: 30,
      playerXp: 10,
      context: { nextLevelCost: 91, rewardShareBasisPoints: 3297 },
    });
  });
});
