import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface CompletenessFinding {
  speciesId: string;
  sourceName: string;
  formLabel: string | null;
  gaps: string[];
}

interface HarnessReport {
  status: "PASS" | "FAIL";
  metrics: {
    catalog: Record<string, number>;
    species: {
      integrityFailures: number;
      domainViolations: number;
    };
    moves: {
      domainViolations: number;
      historicalLearnsetLeaks: number;
    };
    learnsets: {
      exactSemanticDuplicates: number;
      publishedNotAccepted: number;
      acceptedNotPublished: number;
      contextMismatches: number;
      machineContextConflicts: number;
      rawRows: number;
      normalizedGroups: number;
      multiRouteGroups: number;
      extraRoutes: number;
    };
    forms: {
      structuralFailures: number;
    };
    provenance: {
      unexplainedUnreferenced: number;
      unexpectedCrossSurface: number;
      learnsetSourcesAcrossDifferentNationalDex: number;
      invalidSharedLearnsetMoveSources: number;
    };
    typeEffectiveness: {
      completeMatrix: boolean;
    };
    semanticNulls: Record<
      "power" | "accuracy" | "zaBaseCooldownMs",
      { present: number; semanticNull: number }
    >;
  };
  advisories: {
    completeness: CompletenessFinding[];
  };
  failures: Array<{ id: string }>;
  failedAssertions: Array<{ name: string }>;
}

interface Comparison {
  status: "PASS" | "REGRESSION" | "BASELINE_INVALID";
  catalogChanges: Record<string, { baseline: number; candidate: number; delta: number }>;
  completeness: {
    newGaps: string[];
    resolvedGaps: string[];
  };
  structuralRegressions: Array<{ name: string }>;
  structuralImprovements: Array<{ name: string }>;
}

interface HarnessModule {
  comparePublications(baseline: HarnessReport, candidate: HarnessReport): Comparison;
  discoverPublishedVersions(root?: string): Array<{
    directory: string;
    manifest: {
      gameDataVersion: string;
      publishedAt: string;
    };
  }>;
  parseArgs(argv: string[]): {
    gameDataDir: string | null;
    compareTo: string | null;
    current: boolean;
    compareCurrent: boolean;
  };
  resolveRunTargets(parsedArgs: {
    gameDataDir: string | null;
    compareTo: string | null;
    current: boolean;
    compareCurrent: boolean;
  }): {
    gameDataDir: string;
    compareTo: string | null;
  };
}

const require = createRequire(import.meta.url);
const repoRoot = join(import.meta.dirname, "..", "..", "..");
const runnerPath = join(repoRoot, "scripts", "game-data-sanity", "run-sanity.cjs");
const harness = require(runnerPath) as HarnessModule;

function publishedDirectoryName(gameDataVersion: string): string {
  return (
    "version-" +
    createHash("sha256")
      .update(Buffer.from(gameDataVersion.normalize("NFC"), "utf8"))
      .digest("hex")
  );
}

function report(overrides: Partial<HarnessReport> = {}): HarnessReport {
  return {
    status: "PASS",
    metrics: {
      catalog: {
        species: 1,
        moves: 1,
        learnsets: 1,
        abilities: 1,
        types: 1,
        items: 1,
        currentTypeEffectiveness: 1,
      },
      species: { integrityFailures: 0, domainViolations: 0 },
      moves: { domainViolations: 0, historicalLearnsetLeaks: 0 },
      learnsets: {
        exactSemanticDuplicates: 0,
        publishedNotAccepted: 0,
        acceptedNotPublished: 0,
        contextMismatches: 0,
        machineContextConflicts: 0,
        rawRows: 1,
        normalizedGroups: 1,
        multiRouteGroups: 0,
        extraRoutes: 0,
      },
      forms: { structuralFailures: 0 },
      provenance: {
        unexplainedUnreferenced: 0,
        unexpectedCrossSurface: 0,
        learnsetSourcesAcrossDifferentNationalDex: 0,
        invalidSharedLearnsetMoveSources: 0,
      },
      typeEffectiveness: { completeMatrix: true },
      semanticNulls: {
        power: { present: 1, semanticNull: 0 },
        accuracy: { present: 1, semanticNull: 0 },
        zaBaseCooldownMs: { present: 1, semanticNull: 0 },
      },
    },
    advisories: { completeness: [] },
    failures: [],
    failedAssertions: [],
    ...overrides,
  };
}

describe("repository game-data sanity harness", () => {
  it("treats catalog/coverage drift as descriptive when integrity does not regress", () => {
    const baseline = report();
    const candidate = report({
      metrics: {
        ...baseline.metrics,
        catalog: { ...baseline.metrics.catalog, moves: 2, learnsets: 3 },
        learnsets: {
          ...baseline.metrics.learnsets,
          rawRows: 3,
          normalizedGroups: 2,
          multiRouteGroups: 1,
          extraRoutes: 1,
        },
      },
    });

    const comparison = harness.comparePublications(baseline, candidate);
    expect(comparison.status).toBe("PASS");
    expect(comparison.catalogChanges.moves.delta).toBe(1);
    expect(comparison.catalogChanges.learnsets.delta).toBe(2);
    expect(comparison.structuralRegressions).toEqual([]);
  });

  it("classifies a new completeness gap as a regression", () => {
    const baseline = report();
    const candidate = report({
      advisories: {
        completeness: [
          {
            speciesId: "species-alpha",
            sourceName: "Alpha",
            formLabel: null,
            gaps: ["baseFriendship"],
          },
        ],
      },
    });

    const comparison = harness.comparePublications(baseline, candidate);
    expect(comparison.status).toBe("REGRESSION");
    expect(comparison.completeness.newGaps).toHaveLength(1);
  });

  it("classifies a new structural failure as a regression", () => {
    const baseline = report();
    const candidate = report({
      metrics: {
        ...baseline.metrics,
        learnsets: {
          ...baseline.metrics.learnsets,
          exactSemanticDuplicates: 1,
        },
      },
    });

    const comparison = harness.comparePublications(baseline, candidate);
    expect(comparison.status).toBe("REGRESSION");
    expect(comparison.structuralRegressions.map((entry) => entry.name)).toContain(
      "learnsets.exactSemanticDuplicates",
    );
  });

  it("keeps an older failing baseline usable when the candidate is clean", () => {
    const baseline = report({
      status: "FAIL",
      metrics: {
        ...report().metrics,
        forms: { structuralFailures: 1 },
      },
      failures: [{ id: "formsIntegrity" }],
    });
    const candidate = report();

    const comparison = harness.comparePublications(baseline, candidate);
    expect(comparison.status).toBe("PASS");
    expect(comparison.structuralImprovements.map((entry) => entry.name)).toContain(
      "forms.structuralFailures",
    );
  });

  it("classifies candidate sanity failure as a regression", () => {
    const baseline = report();
    const candidate = report({
      status: "FAIL",
      failures: [{ id: "learnsetIntegrity" }],
    });

    const comparison = harness.comparePublications(baseline, candidate);
    expect(comparison.status).toBe("REGRESSION");
    expect(comparison.structuralRegressions[0]?.name).toBe("candidate.sanityStatus");
  });

  it("discovers repository publications chronologically and resolves current/previous", () => {
    const publishedRoot = join(repoRoot, "packages", "game-data", "published");
    const history = harness.discoverPublishedVersions(publishedRoot);
    expect(history.length).toBeGreaterThanOrEqual(2);
    const timestamps = history.map((entry) => Date.parse(entry.manifest.publishedAt));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));

    const targets = harness.resolveRunTargets(harness.parseArgs(["--compare-current"]));
    expect(targets.compareTo).not.toBeNull();
    const candidateManifest = JSON.parse(
      readFileSync(join(targets.gameDataDir, "manifest.json"), "utf8"),
    ) as { publishedAt: string };
    const baselineManifest = JSON.parse(
      readFileSync(join(targets.compareTo!, "manifest.json"), "utf8"),
    ) as { publishedAt: string };
    expect(Date.parse(candidateManifest.publishedAt)).toBeGreaterThanOrEqual(
      Date.parse(baselineManifest.publishedAt),
    );
  });

  it("rejects ambiguous publication order when two manifests share publishedAt", () => {
    const root = mkdtempSync(join(tmpdir(), "pokenexus-published-order-"));
    try {
      for (const version of ["alpha", "beta"]) {
        const directory = join(root, publishedDirectoryName(version));
        mkdirSync(directory, { recursive: true });
        writeFileSync(
          join(directory, "manifest.json"),
          JSON.stringify({
            gameDataVersion: version,
            publishedAt: "2026-09-22T00:00:00.000Z",
          }),
        );
      }
      expect(() => harness.discoverPublishedVersions(root)).toThrow(
        /Ambiguous publication order: duplicate publishedAt/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("lets --current/--compare-current override an inherited publication environment", () => {
    const previous = process.env.POKENEXUS_GAME_DATA_BASE;
    process.env.POKENEXUS_GAME_DATA_BASE = "should-not-pin-current";
    try {
      expect(harness.parseArgs(["--current"]).gameDataDir).toBeNull();
      expect(harness.parseArgs(["--compare-current"]).gameDataDir).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.POKENEXUS_GAME_DATA_BASE;
      else process.env.POKENEXUS_GAME_DATA_BASE = previous;
    }
  });

  it("removes stale compare reports on a current-only CLI run", () => {
    const outDir = join(repoRoot, ".tmp-game-data-sanity");
    mkdirSync(outDir, { recursive: true });
    const staleJson = join(outDir, "sanity-compare-report.json");
    const staleText = join(outDir, "sanity-compare-report.txt");
    writeFileSync(staleJson, "{}\n");
    writeFileSync(staleText, "stale\n");

    const result = spawnSync(process.execPath, [runnerPath, "--current"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(existsSync(staleJson)).toBe(false);
    expect(existsSync(staleText)).toBe(false);
  });

  it("runs the automatic current-vs-previous comparison successfully", () => {
    const result = spawnSync(process.execPath, [runnerPath, "--compare-current"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const compareReport = JSON.parse(
      readFileSync(join(repoRoot, ".tmp-game-data-sanity", "sanity-compare-report.json"), "utf8"),
    ) as { status: string };
    expect(compareReport.status).toBe("PASS");
  });

  it("fails closed when an explicit comparison baseline cannot produce a report", () => {
    const targets = harness.resolveRunTargets(harness.parseArgs(["--current"]));
    const missingBaseline = join(
      repoRoot,
      "packages",
      "game-data",
      "published",
      "version-does-not-exist",
    );
    const result = spawnSync(
      process.execPath,
      [runnerPath, "--game-data-dir", targets.gameDataDir, "--compare-to", missingBaseline],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );
    expect(result.status).not.toBe(0);
    expect(existsSync(join(repoRoot, ".tmp-game-data-sanity", "sanity-compare-report.json"))).toBe(
      false,
    );
    const candidateReport = JSON.parse(
      readFileSync(join(repoRoot, ".tmp-game-data-sanity", "sanity-report.json"), "utf8"),
    ) as { publication: { gameDataVersion: string } };
    expect(candidateReport.publication.gameDataVersion).toBe("game-data-core-kanto-johto-v2");
  });

  it("fails closed when a published artifact no longer matches its manifest hash", () => {
    const targets = harness.resolveRunTargets(harness.parseArgs(["--current"]));
    const root = mkdtempSync(join(tmpdir(), "pokenexus-corrupt-publication-"));
    const copiedPublication = join(root, "candidate");
    const outDir = join(repoRoot, ".tmp-game-data-sanity");
    const staleJson = join(outDir, "sanity-report.json");
    const staleText = join(outDir, "sanity-report.txt");
    try {
      cpSync(targets.gameDataDir, copiedPublication, { recursive: true });
      const itemsPath = join(copiedPublication, "catalogs", "items.json");
      writeFileSync(itemsPath, readFileSync(itemsPath, "utf8") + " ");
      mkdirSync(outDir, { recursive: true });
      writeFileSync(staleJson, JSON.stringify({ status: "PASS", stale: true }) + "\n");
      writeFileSync(staleText, "stale PASS\n");

      const result = spawnSync(
        process.execPath,
        [runnerPath, "--game-data-dir", copiedPublication],
        {
          cwd: repoRoot,
          encoding: "utf8",
        },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toMatch(/Published artifact hash mismatch/);
      expect(existsSync(staleJson)).toBe(false);
      expect(existsSync(staleText)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed on an unsupported published normalizerVersion", () => {
    const targets = harness.resolveRunTargets(harness.parseArgs(["--current"]));
    const root = mkdtempSync(join(tmpdir(), "pokenexus-normalizer-publication-"));
    const copiedPublication = join(root, "candidate");
    try {
      cpSync(targets.gameDataDir, copiedPublication, { recursive: true });
      const manifestPath = join(copiedPublication, "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        normalizerVersion: string;
      };
      manifest.normalizerVersion = "unsupported-normalizer-v999";
      writeFileSync(manifestPath, JSON.stringify(manifest));

      const result = spawnSync(
        process.execPath,
        [runnerPath, "--game-data-dir", copiedPublication],
        {
          cwd: repoRoot,
          encoding: "utf8",
        },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toMatch(/Unsupported normalizerVersion/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed when manifest catalogCounts drift from artifact recordCounts", () => {
    const targets = harness.resolveRunTargets(harness.parseArgs(["--current"]));
    const root = mkdtempSync(join(tmpdir(), "pokenexus-catalog-count-publication-"));
    const copiedPublication = join(root, "candidate");
    try {
      cpSync(targets.gameDataDir, copiedPublication, { recursive: true });
      const manifestPath = join(copiedPublication, "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        catalogCounts: { items: number };
      };
      manifest.catalogCounts.items += 1;
      writeFileSync(manifestPath, JSON.stringify(manifest));

      const result = spawnSync(
        process.execPath,
        [runnerPath, "--game-data-dir", copiedPublication],
        {
          cwd: repoRoot,
          encoding: "utf8",
        },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toMatch(
        /catalogCounts\.items does not match artifact recordCount/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
