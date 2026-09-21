import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BULBAPEDIA_GEN9_MOVE_LIST_URL } from "./bulbapedia-gen9-move-parser";
import { runMaintenanceIngestion } from "./maintenance-ingestion";

const liveDescribe =
  process.env.POKENEXUS_LIVE_INGESTION === "1" ? describe : describe.skip;

liveDescribe("dual-provider maintenance ingestion live smoke", () => {
  it(
    "passes both robots gates and exercises Bulbapedia-primary Move normalization with a PokémonDB complement",
    async () => {
      const outputRoot = process.env.POKENEXUS_LIVE_INGESTION_ROOT;
      if (!outputRoot) {
        throw new Error(
          "POKENEXUS_LIVE_INGESTION_ROOT is required for the opt-in live smoke",
        );
      }
      await mkdir(outputRoot, { recursive: true });
      const runRoot = await mkdtemp(join(outputRoot, "maintenance-smoke-"));
      const result = await runMaintenanceIngestion({
        outputDirectory: join(runRoot, "output"),
        cacheDirectory: join(runRoot, "cache"),
        intent: "smoke",
        profile: {
          movePages: ["https://pokemondb.net/move/tackle"],
        },
      });

      expect(result.validationReport.candidateValid).toBe(true);
      expect(result.validationReport.publicationReady).toBe(false);
      expect(result.validationReport.findings).toContainEqual(
        expect.objectContaining({ code: "maintenance-smoke-not-publishable" }),
      );
      expect(result.rawExtracted.moves.some((entry) => entry.sourceName === "Tackle")).toBe(true);

      const provenance = JSON.parse(
        await readFile(join(runRoot, "output", "provenance-manifest.json"), "utf8"),
      ) as {
        sourceRecords: Array<{ provider: string; canonicalUrl: string }>;
      };
      expect(
        provenance.sourceRecords.some((source) => source.provider === "bulbapedia"),
      ).toBe(true);
      expect(
        provenance.sourceRecords.some((source) => source.provider === "pokemondb"),
      ).toBe(true);
      expect(
        provenance.sourceRecords.some(
          (source) =>
            source.provider === "bulbapedia" &&
            source.canonicalUrl === BULBAPEDIA_GEN9_MOVE_LIST_URL,
        ),
      ).toBe(true);
      expect(
        provenance.sourceRecords.some(
          (source) =>
            source.provider === "pokemondb" &&
            source.canonicalUrl === "https://pokemondb.net/move/tackle",
        ),
      ).toBe(true);
    },
    180_000,
  );
});
