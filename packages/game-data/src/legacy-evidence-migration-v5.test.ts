import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectRequiredLegacyV3SourceRecordIds,
  isLegacyMoveAvailabilitySourceRecord,
} from "./legacy-evidence-migration-v5.js";
import { parseProvenanceManifest } from "./schema.js";

const PACKAGE_ROOT = join(import.meta.dirname, "..");
const V3_DIRECTORY = join(
  PACKAGE_ROOT,
  "published",
  "version-e7903d8b32ee60805f55ef36c8fe735a517c858f700e92459c3b239a7560e1e2",
);

const GEN8_AVAILABILITY =
  "source:bulbapedia:174c092dbf482f23ef19be3a8cdbd45ea3ba67f6a1519cd788db634a2d744bc3";
const GEN7_AVAILABILITY =
  "source:bulbapedia:9a07928f82404fa0f16d6c386d9d074770edd723f08c5070a6e8740d4c787992";
const PSYCHIC_NOISE_OLD_CONTACT =
  "source:pokemondb:52cdd373544a2d54655c19e76e0f581b19733134bd76e0aba5203c7d75e4ac5a";

describe("schema-5 retained v3 evidence selection", () => {
  it("retains 1,146 records including Gen VII/VIII mainline-selection context", async () => {
    const provenance = parseProvenanceManifest(
      JSON.parse(await readFile(join(V3_DIRECTORY, "provenance.json"), "utf8")) as unknown,
    );
    const required = await collectRequiredLegacyV3SourceRecordIds(V3_DIRECTORY, provenance);

    expect(required.size).toBe(1146);
    expect(required.has(GEN8_AVAILABILITY)).toBe(true);
    expect(required.has(GEN7_AVAILABILITY)).toBe(true);
    expect(required.has(PSYCHIC_NOISE_OLD_CONTACT)).toBe(false);
  });

  it("recognizes only the accepted Bulbapedia availability parser families", () => {
    const base = {
      id: "source:bulbapedia:test",
      provider: "bulbapedia" as const,
      canonicalUrl: "https://bulbapedia.bulbagarden.net/wiki/Test",
      fetchedAt: "2026-09-20T00:00:00.000Z",
      sourceContentHash: `sha256:${"0".repeat(64)}`,
      fetchStatus: "cache" as const,
    };
    expect(isLegacyMoveAvailabilitySourceRecord({
      ...base,
      parserVersion: "bulbapedia-historical-move-availability-v1",
    })).toBe(true);
    expect(isLegacyMoveAvailabilitySourceRecord({
      ...base,
      parserVersion: "bulbapedia-gen9-move-availability-v1",
    })).toBe(true);
    expect(isLegacyMoveAvailabilitySourceRecord({ ...base, parserVersion: "bulbapedia-html-v1" })).toBe(false);
  });
});
