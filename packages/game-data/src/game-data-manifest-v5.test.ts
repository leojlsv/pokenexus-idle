import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGameDataManifestV5 } from "./game-data-manifest-v5.js";
import { parseGameDataManifestV4 } from "./pve-manifest.js";

const PACKAGE_ROOT = join(import.meta.dirname, "..");
const V3_DIRECTORY = join(
  PACKAGE_ROOT,
  "published",
  "version-e7903d8b32ee60805f55ef36c8fe735a517c858f700e92459c3b239a7560e1e2",
);

async function v3Manifest(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(V3_DIRECTORY, "manifest.json"), "utf8")) as Record<string, unknown>;
}

describe("schema-5 additive manifest", () => {
  it("accepts the exact schema-v4 envelope with only schemaVersion advanced to 5", async () => {
    const source = await v3Manifest();
    const parsed = parseGameDataManifestV5({ ...source, schemaVersion: "5" });

    expect(parsed.schemaVersion).toBe("5");
    expect(parsed.pveContentSchemaVersion).toBe("1");
    expect(parsed.artifacts).toHaveLength(10);
    expect(parsed.catalogCounts).toEqual(source.catalogCounts);
    expect(parsed.gameDataVersion).toBe("game-data-core-kanto-johto-v3");
  });

  it("keeps schema-4 and schema-5 parsers isolated and exact-key fail closed", async () => {
    const source = await v3Manifest();
    const v5 = { ...source, schemaVersion: "5" };

    expect(() => parseGameDataManifestV4(v5)).toThrow(/schemaVersion/);
    expect(() => parseGameDataManifestV5(source)).toThrow(/schemaVersion/);
    expect(() => parseGameDataManifestV5({ ...v5, unexpectedField: true })).toThrow(/unexpectedField/);
  });
});
