import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildProductionMoveCoverageReport,
  pokemonXpFloor,
  PRODUCTION_COMBAT_RULE_CATALOG_V1,
  validateProductionCombatRuleCatalogAgainstGameData,
} from "../../game-core/src/index";
import {
  canonicalJson,
  loadPublishedBundle,
  stagePveV4Candidate,
} from "../src/node";

const GAME_DATA_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(GAME_DATA_ROOT, "../..");
const V2 = "game-data-core-kanto-johto-v2";
const V2_DIRECTORY =
  "version-a583d33f46879d427da91e8a25ad1cedb4824df3f9adf584b2504506d0724e40";
const PUBLISHED_ROOT = join(GAME_DATA_ROOT, "published");
const PROFILE_PATH = join(GAME_DATA_ROOT, "profiles", "pve", "verdant-edge-v1.json");
const STAGE_DIRECTORY = join(REPO_ROOT, ".tmp", "task-034-verdant-edge-v1");
const REVIEW_DIRECTORY = join(GAME_DATA_ROOT, "reviews", "task-034");

describe("TASK-034 Verdant Edge review generator", () => {
  it("materializes deterministic review evidence from the exact v2 + TASK-091 authorities", async () => {
    const base = await loadPublishedBundle(PUBLISHED_ROOT, V2);
    expect(base.directory.endsWith(V2_DIRECTORY)).toBe(true);

    const combatFacts = {
      gameDataVersion: base.manifest.gameDataVersion,
      gameDataBundleHash: base.manifest.bundleHash,
      species: base.candidate.catalogs.species,
      moves: base.candidate.catalogs.moves,
      abilities: base.candidate.catalogs.abilities,
      types: base.candidate.catalogs.types,
      learnsets: base.candidate.catalogs.learnsets,
    };
    expect(() =>
      validateProductionCombatRuleCatalogAgainstGameData(
        PRODUCTION_COMBAT_RULE_CATALOG_V1,
        combatFacts,
      ),
    ).not.toThrow();
    const playability = buildProductionMoveCoverageReport({
      catalog: PRODUCTION_COMBAT_RULE_CATALOG_V1,
      gameDataVersion: base.manifest.gameDataVersion,
      species: base.candidate.catalogs.species,
      learnsets: base.candidate.catalogs.learnsets,
    });

    const candidate = JSON.parse(await readFile(PROFILE_PATH, "utf8")) as unknown;
    const pokemonNextLevelXpCostByLevel: Record<number, number> = {};
    for (const level of [3, 4, 5]) {
      pokemonNextLevelXpCostByLevel[level] = Number(
        pokemonXpFloor(BigInt(level + 1)) - pokemonXpFloor(BigInt(level)),
      );
    }

    const staged = await stagePveV4Candidate({
      basePublishedDirectory: base.directory,
      outputDirectory: STAGE_DIRECTORY,
      content: candidate,
      playability,
      pokemonNextLevelXpCostByLevel,
    });

    await mkdir(REVIEW_DIRECTORY, { recursive: true });
    const reviewPath = join(REVIEW_DIRECTORY, "verdant-edge-v1-human-review.json");
    const manifestPath = join(REVIEW_DIRECTORY, "verdant-edge-v1-candidate-manifest.json");
    await writeFile(reviewPath, canonicalJson(staged.review), "utf8");
    await writeFile(manifestPath, canonicalJson(staged.manifest), "utf8");

    expect(staged.manifest.artifacts).toHaveLength(10);
    expect(staged.review.artifactOrigins).toEqual(staged.manifest.artifactOrigins);
    expect(staged.review.artifactOrigins.retainedSourceBacked.logicalNames).toHaveLength(7);
    expect(staged.review.artifactOrigins.pokenexusAuthored.logicalNames).toEqual([
      "catalogs/zones",
      "catalogs/hunts",
      "catalogs/encounter-definitions",
    ]);
    expect(staged.manifest.catalogCounts).toMatchObject({
      species: 293,
      moves: 547,
      learnsets: 19_035,
      zones: 1,
      hunts: 1,
      encounterDefinitions: 9,
    });
    expect(staged.review.encounters.reduce((sum, row) => sum + row.weight, 0)).toBe(100);
    expect(staged.review.playabilityAuthority).toEqual({
      profileArtifactId: "spec-012-production-move-support-v1",
      profileContentHash:
        "sha256:1462b33b35e38224b505240dbf5205104e98dae1310d0bc630e2aa02fb31879e",
      gameDataVersion: "game-data-core-kanto-johto-v2",
    });
    expect(staged.review.hunts[0]).toMatchObject({
      id: "hunt:verdant-edge:wilds",
      recoveryDurationMs: 30_000,
      playerLevelMin: null,
      prerequisiteHuntIds: [],
      playerLevelGateImplication: null,
    });
    expect(
      staged.review.encounters.every(({ reward }) => reward.itemDrops.length === 0),
    ).toBe(true);
    expect(
      staged.review.encounters.filter(({ playability: rows }) =>
        rows.some(({ oneChoiceBottleneck }) => oneChoiceBottleneck),
      ),
    ).toHaveLength(6);

    process.stdout.write(
      JSON.stringify(
        {
          baseGameDataVersion: staged.manifest.baseGameDataVersion,
          baseBundleHash: staged.manifest.baseBundleHash,
          candidateGameDataVersion: staged.manifest.candidateGameDataVersion,
          candidateBundleHash: staged.manifest.candidateBundleHash,
          contentCommitmentHash: staged.manifest.contentCommitmentHash,
          stageManifestHash: staged.stageManifestHash,
          reviewHash: staged.manifest.reviewHash,
          artifactCount: staged.manifest.artifacts.length,
          counts: staged.manifest.catalogCounts,
          reviewPath,
          manifestPath,
        },
        null,
        2,
      ) + "\n",
    );
  });
});
