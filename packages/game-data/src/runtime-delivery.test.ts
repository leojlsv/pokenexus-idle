import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createHttpGameDataReader,
  loadRuntimeAuditArtifact,
  loadRuntimeGameDataArtifact,
  loadRuntimeGameDataVersion,
  runtimeVersionDirectoryName,
  type RuntimeGameDataReader,
} from "./runtime-delivery";
import { canonicalJson } from "./canonical-json";

const PUBLISHED_ROOT = join(import.meta.dirname, "..", "published");
const V1 = "game-data-core-kanto-johto-v1";
const V2 = "game-data-core-kanto-johto-v2";
const V3 = "game-data-core-kanto-johto-v3";

function fileReader(root: string): RuntimeGameDataReader {
  return {
    async read(path) {
      return new Uint8Array(await readFile(join(root, ...path.split("/"))));
    },
  };
}

describe("runtime game-data delivery", () => {
  it("adapts immutable HTTP/CDN storage without eagerly fetching any bundle", async () => {
    const fetchMock = async (input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      return new Response(url.pathname, { status: 200 });
    };
    const reader = createHttpGameDataReader(
      "https://static.example.test/game-data",
      fetchMock as typeof fetch,
    );
    const bytes = await reader.read("version-abc/manifest.json");
    expect(new TextDecoder().decode(bytes)).toBe("/game-data/version-abc/manifest.json");
  });

  it("resolves the immutable v1 directory deterministically", async () => {
    expect(await runtimeVersionDirectoryName(V1)).toBe(
      "version-e290cdc29015f0d30cfc345b0cee8a7c22107f919e49eab8d1a6e6ae550a1019",
    );
  });

  it("resolves the corrected immutable v2 directory deterministically", async () => {
    expect(await runtimeVersionDirectoryName(V2)).toBe(
      "version-a583d33f46879d427da91e8a25ad1cedb4824df3f9adf584b2504506d0724e40",
    );
  });

  it("loads only requested catalog shards while preserving manifest/hash verification", async () => {
    const requested: string[] = [];
    const base = fileReader(PUBLISHED_ROOT);
    const reader: RuntimeGameDataReader = {
      async read(path) {
        requested.push(path);
        return base.read(path);
      },
    };
    const version = await loadRuntimeGameDataVersion(reader, V2);
    expect(requested).toHaveLength(1);
    expect(version.manifest.catalogCounts.moves).toBe(547);

    const moves = await loadRuntimeGameDataArtifact(reader, version, "catalogs/moves");
    expect(moves).toHaveLength(547);
    expect(requested).toHaveLength(2);
    expect(requested[1]).toMatch(/catalogs\/moves\.json$/u);
    expect(requested.some((path) => path.endsWith("catalogs/learnsets.json"))).toBe(false);

    const learnsets = await loadRuntimeGameDataArtifact(reader, version, "catalogs/learnsets");
    expect(learnsets).toHaveLength(19_035);
    expect(requested.some((path) => path.endsWith("catalogs/learnsets.json"))).toBe(true);
    await expect(
      loadRuntimeGameDataArtifact(reader, version, "catalogs/zones"),
    ).rejects.toThrow(/exactly one catalogs\/zones artifact descriptor/);
  });

  it("keeps audit metadata lazy and independently hash-verified", async () => {
    const reader = fileReader(PUBLISHED_ROOT);
    const version = await loadRuntimeGameDataVersion(reader, V2);
    const provenance = await loadRuntimeAuditArtifact(reader, version, "provenance");
    expect(provenance).toMatchObject({
      provenanceHash: version.manifest.provenanceHash,
    });
  });

  it("fails closed if a schema-v3 runtime manifest tries to carry PvE artifacts", async () => {
    const base = fileReader(PUBLISHED_ROOT);
    const v2Directory = await runtimeVersionDirectoryName(V2);
    const reader: RuntimeGameDataReader = {
      async read(path) {
        if (path === `${v2Directory}/manifest.json`) {
          const original = JSON.parse(
            new TextDecoder().decode(await base.read(path)),
          ) as {
            artifacts: Array<{
              logicalName: string;
              contentHash: string;
              recordCount: number;
            }>;
          };
          original.artifacts.push({
            logicalName: "catalogs/zones",
            contentHash: `sha256:${"0".repeat(64)}`,
            recordCount: 1,
          });
          return new TextEncoder().encode(canonicalJson(original));
        }
        return base.read(path);
      },
    };
    await expect(loadRuntimeGameDataVersion(reader, V2)).rejects.toThrow(
      /schema-v3 runtime manifest must contain exactly/,
    );
  });

  it("loads the immutable schema-v4 v3 publication only by its exact version", async () => {
    const reader = fileReader(PUBLISHED_ROOT);
    const version = await loadRuntimeGameDataVersion(reader, V3);
    expect(version.manifest.schemaVersion).toBe("4");
    expect(version.manifest.bundleHash).toBe(
      "sha256:a7ee6337f8f41986ca7fc4608e8f75f49fb1a42d54d66aeb18b5ae56208c6559",
    );
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
  });
});
