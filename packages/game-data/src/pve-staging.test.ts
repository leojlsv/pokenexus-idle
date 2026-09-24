import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical.js";
import type { PveContentV1, PvePlayabilityEvidence } from "./pve-content-schema.js";
import {
  buildPveV4RuntimePreviewManifest,
  stagePveV4Candidate,
} from "./pve-staging.js";
import {
  loadRuntimeGameDataArtifact,
  loadRuntimeGameDataVersion,
  runtimeVersionDirectoryName,
  type RuntimeGameDataReader,
} from "./runtime-delivery.js";
import { parseGameDataManifest } from "./schema.js";

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

async function stage(outputDirectory: string, value?: PveContentV1) {
  const resolved = value ?? await content();
  return stagePveV4Candidate({
    basePublishedDirectory: PUBLISHED_V2,
    outputDirectory,
    content: resolved,
    playability: playability(),
    pokemonNextLevelXpCostByLevel: { 3: 37, 4: 61, 5: 91 },
  });
}

describe("TASK-034 schema-v4 PvE staging", () => {
  it("retains all seven v2 factual artifact identities and adds exactly three authored PvE artifacts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pokenexus-task034-"));
    try {
      const staged = await stage(directory);
      const baseManifest = parseGameDataManifest(
        JSON.parse(await readFile(join(PUBLISHED_V2, "manifest.json"), "utf8")) as unknown,
      );
      expect(staged.manifest.schemaVersion).toBe("4");
      expect(staged.manifest.baseGameDataVersion).toBe("game-data-core-kanto-johto-v2");
      expect(staged.manifest.artifacts).toHaveLength(10);
      for (const descriptor of baseManifest.artifacts) {
        expect(staged.manifest.artifacts).toContainEqual(descriptor);
      }
      expect(staged.manifest.catalogCounts).toMatchObject({
        species: 293,
        moves: 547,
        learnsets: 19_035,
        zones: 1,
        hunts: 1,
        encounterDefinitions: 9,
      });
      expect(staged.review.hunts[0]).toMatchObject({
        id: "hunt:verdant-edge:wilds",
        recoveryDurationMs: 30_000,
        playerLevelMin: null,
        prerequisiteHuntIds: [],
        playerLevelGateImplication: null,
      });
      expect(staged.review.encounters.reduce((sum, row) => sum + row.weight, 0)).toBe(100);
      expect(staged.review.encounters.every(({ reward }) => reward.itemDrops.length === 0)).toBe(true);
      expect(
        staged.review.encounters.filter(({ playability: rows }) =>
          rows.some(({ oneChoiceBottleneck }) => oneChoiceBottleneck),
        ),
      ).toHaveLength(6);
      expect(
        staged.review.encounters.find(({ levelBand }) => levelBand.min === 3)?.soloPokemonXpContext,
      ).toEqual({ nextLevelCost: 37, rewardShareBasisPoints: 4865 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);

  it("reproduces the candidate identity and Human review hash regardless of input array order", async () => {
    const firstDirectory = await mkdtemp(join(tmpdir(), "pokenexus-task034-a-"));
    const secondDirectory = await mkdtemp(join(tmpdir(), "pokenexus-task034-b-"));
    try {
      const value = await content();
      const first = await stage(firstDirectory, value);
      const second = await stage(secondDirectory, {
        zones: [...value.zones].reverse(),
        hunts: [...value.hunts].reverse(),
        encounters: [...value.encounters].reverse(),
      });
      expect(second.manifest.contentCommitmentHash).toBe(first.manifest.contentCommitmentHash);
      expect(second.manifest.candidateGameDataVersion).toBe(first.manifest.candidateGameDataVersion);
      expect(second.manifest.candidateBundleHash).toBe(first.manifest.candidateBundleHash);
      expect(second.manifest.reviewHash).toBe(first.manifest.reviewHash);
      expect(second.stageManifestHash).toBe(first.stageManifestHash);
    } finally {
      await rm(firstDirectory, { recursive: true, force: true });
      await rm(secondDirectory, { recursive: true, force: true });
    }
  }, 20_000);

  it("loads staged schema-v4 PvE shards only through the exact candidate gameDataVersion", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pokenexus-task034-runtime-"));
    try {
      const staged = await stage(directory);
      const preview = buildPveV4RuntimePreviewManifest(staged.manifest);
      const versionDirectory = await runtimeVersionDirectoryName(preview.gameDataVersion);
      const files = new Map<string, Uint8Array>();
      files.set(
        `${versionDirectory}/manifest.json`,
        new TextEncoder().encode(canonicalJson(preview)),
      );
      const relativePaths = [
        "catalogs/zones.json",
        "catalogs/hunts.json",
        "catalogs/encounter-definitions.json",
      ] as const;
      for (const relativePath of relativePaths) {
        files.set(
          `${versionDirectory}/${relativePath}`,
          new Uint8Array(await readFile(join(directory, relativePath))),
        );
      }
      const reader: RuntimeGameDataReader = {
        async read(path) {
          const value = files.get(path);
          if (!value) throw new Error(`unexpected read ${path}`);
          return value;
        },
      };
      const version = await loadRuntimeGameDataVersion(reader, preview.gameDataVersion);
      const zones = await loadRuntimeGameDataArtifact(reader, version, "catalogs/zones");
      const hunts = await loadRuntimeGameDataArtifact(reader, version, "catalogs/hunts");
      const encounters = await loadRuntimeGameDataArtifact(
        reader,
        version,
        "catalogs/encounter-definitions",
      );
      expect(zones).toHaveLength(1);
      expect(hunts).toHaveLength(1);
      expect(encounters).toHaveLength(9);
      await expect(loadRuntimeGameDataVersion(reader, "candidate:wrong")).rejects.toThrow(
        /unexpected read/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);

  it("requires explicit review implications whenever a Player-Level gate is authored", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pokenexus-task034-gate-"));
    try {
      const value = await content();
      value.hunts[0] = {
        ...value.hunts[0],
        availability: {
          ...value.hunts[0].availability,
          playerLevelMin: 2,
        },
      };
      await expect(stage(directory, value)).rejects.toThrow(
        /hunt:verdant-edge:wilds has playerLevelMin=2 but no explicit progression implication/,
      );
      const staged = await stagePveV4Candidate({
        basePublishedDirectory: PUBLISHED_V2,
        outputDirectory: directory,
        content: value,
        playability: playability(),
        pokemonNextLevelXpCostByLevel: { 3: 37, 4: 61, 5: 91 },
        playerLevelGateImplications: {
          "hunt:verdant-edge:wilds": "Explicit review-only gate implication.",
        },
      });
      expect(staged.review.hunts[0].playerLevelGateImplication).toBe(
        "Explicit review-only gate implication.",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);
});
