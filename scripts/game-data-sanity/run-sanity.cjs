const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { createHash } = require("crypto");

const scriptDir = __dirname;
const repoRoot = path.resolve(scriptDir, "..", "..");
const outDir = path.join(repoRoot, ".tmp-game-data-sanity");
const publishedRoot = path.join(repoRoot, "packages", "game-data", "published");
const factualArtifactPaths = {
  "catalogs/species": "catalogs/species.json",
  "catalogs/moves": "catalogs/moves.json",
  "catalogs/types": "catalogs/types.json",
  "catalogs/abilities": "catalogs/abilities.json",
  "catalogs/items": "catalogs/items.json",
  "catalogs/learnsets": "catalogs/learnsets.json",
  "referenceData/currentTypeEffectiveness": "reference-data/current-type-effectiveness.json",
};
const pveArtifactPaths = {
  "catalogs/zones": "catalogs/zones.json",
  "catalogs/hunts": "catalogs/hunts.json",
  "catalogs/encounter-definitions": "catalogs/encounter-definitions.json",
};
const artifactPaths = { ...factualArtifactPaths, ...pveArtifactPaths };
const requiredArtifactLogicalNamesBySchema = {
  "3": Object.keys(factualArtifactPaths).sort(),
  "4": Object.keys(artifactPaths).sort(),
};
const supportedSchemaVersions = new Set(Object.keys(requiredArtifactLogicalNamesBySchema));
const supportedNormalizerVersion = "pokenexus-static-normalizer-v5";
const sha256Pattern = /^sha256:[0-9a-f]{64}$/u;
const factualCatalogCountArtifacts = {
  species: "catalogs/species",
  moves: "catalogs/moves",
  types: "catalogs/types",
  abilities: "catalogs/abilities",
  items: "catalogs/items",
  learnsets: "catalogs/learnsets",
  currentTypeEffectiveness: "referenceData/currentTypeEffectiveness",
};
const catalogCountArtifactsBySchema = {
  "3": factualCatalogCountArtifacts,
  "4": {
    ...factualCatalogCountArtifacts,
    zones: "catalogs/zones",
    hunts: "catalogs/hunts",
    encounterDefinitions: "catalogs/encounter-definitions",
  },
};

function canonicalValue(value, context = "$") {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(context + ": non-finite numbers are not canonical JSON");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalValue(entry, context + "[" + index + "]"));
  }
  if (typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const entry = value[key];
      if (entry === undefined) {
        throw new TypeError(context + "." + key + ": undefined is not canonical JSON");
      }
      result[key.normalize("NFC")] = canonicalValue(entry, context + "." + key);
    }
    return result;
  }
  throw new TypeError(context + ": unsupported canonical JSON value " + typeof value);
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function sha256Bytes(bytes) {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

function expectedPublishedDirectoryName(gameDataVersion) {
  return (
    "version-" +
    createHash("sha256")
      .update(Buffer.from(gameDataVersion.normalize("NFC"), "utf8"))
      .digest("hex")
  );
}

function assertRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " must be an object");
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(label + " must be a non-empty string");
  }
  return value.normalize("NFC");
}

function requireSha256(value, label) {
  const normalized = requireNonEmptyString(value, label);
  if (!sha256Pattern.test(normalized)) {
    throw new Error(label + " must be sha256:<lowercase-hex>");
  }
  return normalized;
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(label + " must be a non-negative safe integer");
  }
  return value;
}

function validatePublishedManifestContract(manifest, manifestPath) {
  assertRecord(manifest, "Published manifest");
  if (!supportedSchemaVersions.has(manifest.schemaVersion)) {
    throw new Error("Unsupported published schemaVersion " + String(manifest.schemaVersion));
  }
  if (manifest.schemaVersion === "4" && manifest.pveContentSchemaVersion !== "1") {
    throw new Error(
      "Unsupported pveContentSchemaVersion " + String(manifest.pveContentSchemaVersion),
    );
  }
  requireNonEmptyString(manifest.gameDataVersion, "manifest.gameDataVersion");
  requireSha256(manifest.bundleHash, "manifest.bundleHash");
  requireSha256(manifest.provenanceHash, "manifest.provenanceHash");
  const publishedAt = requireNonEmptyString(manifest.publishedAt, "manifest.publishedAt");
  if (!Number.isFinite(Date.parse(publishedAt))) {
    throw new Error("manifest.publishedAt must be an ISO-compatible timestamp");
  }
  const normalizerVersion = requireNonEmptyString(
    manifest.normalizerVersion,
    "manifest.normalizerVersion",
  );
  if (normalizerVersion !== supportedNormalizerVersion) {
    throw new Error("Unsupported normalizerVersion " + normalizerVersion);
  }

  if (!Array.isArray(manifest.artifacts)) {
    throw new Error("Published manifest artifacts must be an array: " + manifestPath);
  }
  const seenLogicalNames = new Set();
  for (let index = 0; index < manifest.artifacts.length; index += 1) {
    const descriptor = manifest.artifacts[index];
    const prefix = "manifest.artifacts[" + index + "]";
    assertRecord(descriptor, prefix);
    const logicalName = requireNonEmptyString(descriptor.logicalName, prefix + ".logicalName");
    if (seenLogicalNames.has(logicalName)) {
      throw new Error("manifest.artifacts logical artifact names must be unique");
    }
    seenLogicalNames.add(logicalName);
    requireSha256(descriptor.contentHash, prefix + ".contentHash");
    requireNonNegativeInteger(descriptor.recordCount, prefix + ".recordCount");
  }

  const referencedFiles = [
    [manifest.provenanceManifest, "manifest.provenanceManifest", "provenance", "provenance.json"],
    [
      manifest.sourceInventory,
      "manifest.sourceInventory",
      "source-inventory",
      "source-inventory.json",
    ],
  ];
  for (const [descriptor, label, logicalName, expectedPath] of referencedFiles) {
    assertRecord(descriptor, label);
    if (descriptor.logicalName !== logicalName) {
      throw new Error(label + ".logicalName must equal " + logicalName);
    }
    if (descriptor.path !== expectedPath) {
      throw new Error(label + ".path must equal " + expectedPath);
    }
    requireSha256(descriptor.contentHash, label + ".contentHash");
  }

  assertRecord(manifest.catalogCounts, "manifest.catalogCounts");
  const catalogCountArtifacts = catalogCountArtifactsBySchema[manifest.schemaVersion];
  for (const key of Object.keys(catalogCountArtifacts)) {
    requireNonNegativeInteger(manifest.catalogCounts[key], "manifest.catalogCounts." + key);
  }
}

function resolveFromRepo(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function displayPath(value) {
  const relative = path.relative(repoRoot, value);
  return relative && !relative.startsWith("..") ? relative.replaceAll("\\", "/") : value;
}

function parseArgs(argv) {
  let gameDataDir = process.env.POKENEXUS_GAME_DATA_BASE || null;
  let explicitGameDataDir = false;
  let compareTo = null;
  let current = false;
  let compareCurrent = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--game-data-dir") {
      const value = argv[index + 1];
      if (!value) throw new Error("--game-data-dir requires a path");
      gameDataDir = value;
      explicitGameDataDir = true;
      index += 1;
    } else if (argv[index] === "--compare-to") {
      const value = argv[index + 1];
      if (!value) throw new Error("--compare-to requires a path");
      compareTo = value;
      index += 1;
    } else if (argv[index] === "--current") {
      current = true;
    } else if (argv[index] === "--compare-current") {
      compareCurrent = true;
    } else if (argv[index] === "--help" || argv[index] === "-h") {
      console.log(
        "Usage: node scripts/game-data-sanity/run-sanity.cjs [--current | --compare-current | --game-data-dir <candidate-dir> [--compare-to <baseline-dir>]]",
      );
      process.exit(0);
    } else {
      throw new Error("Unknown argument: " + argv[index]);
    }
  }
  if ((current || compareCurrent) && (explicitGameDataDir || compareTo)) {
    throw new Error(
      "--current/--compare-current cannot be combined with explicit publication paths",
    );
  }
  if (current && compareCurrent) {
    throw new Error("--current and --compare-current are mutually exclusive");
  }
  if (current || compareCurrent) gameDataDir = null;
  if (compareTo && !gameDataDir) {
    throw new Error("--compare-to requires --game-data-dir or POKENEXUS_GAME_DATA_BASE");
  }
  return { gameDataDir, compareTo, current, compareCurrent };
}

function discoverPublishedVersions(root = publishedRoot) {
  const history = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("version-"))
    .map((entry) => {
      const directory = path.join(root, entry.name);
      const manifest = readJson(path.join(directory, "manifest.json"));
      const publishedAtMs = Date.parse(manifest.publishedAt);
      if (!Number.isFinite(publishedAtMs)) {
        throw new Error("Invalid publishedAt in " + path.join(directory, "manifest.json"));
      }
      if (typeof manifest.gameDataVersion !== "string" || !manifest.gameDataVersion) {
        throw new Error("Invalid gameDataVersion in " + path.join(directory, "manifest.json"));
      }
      if (entry.name !== expectedPublishedDirectoryName(manifest.gameDataVersion)) {
        throw new Error(
          "Published directory does not match gameDataVersion identity: " + directory,
        );
      }
      return { directory, manifest, publishedAtMs };
    })
    .sort((left, right) => left.publishedAtMs - right.publishedAtMs);
  for (let index = 1; index < history.length; index += 1) {
    if (history[index - 1].publishedAtMs === history[index].publishedAtMs) {
      throw new Error(
        "Ambiguous publication order: duplicate publishedAt " +
          history[index].manifest.publishedAt +
          " for " +
          history[index - 1].manifest.gameDataVersion +
          " and " +
          history[index].manifest.gameDataVersion,
      );
    }
  }
  return history;
}

function verifyPublishedBundleIntegrity(gameDataDir, manifest) {
  const manifestPath = path.join(gameDataDir, "manifest.json");
  const manifestBytes = fs.readFileSync(manifestPath);
  if (manifestBytes.toString("utf8") !== canonicalJson(manifest)) {
    throw new Error("Published manifest is not canonical JSON: " + manifestPath);
  }
  validatePublishedManifestContract(manifest, manifestPath);

  const requiredArtifactLogicalNames =
    requiredArtifactLogicalNamesBySchema[manifest.schemaVersion];
  const actualLogicalNames = manifest.artifacts.map((descriptor) => descriptor.logicalName).sort();
  if (
    actualLogicalNames.length !== requiredArtifactLogicalNames.length ||
    actualLogicalNames.some(
      (logicalName, index) => logicalName !== requiredArtifactLogicalNames[index],
    )
  ) {
    throw new Error("Published manifest does not contain the exact required artifact set");
  }

  const sortedDescriptors = [...manifest.artifacts].sort((left, right) =>
    left.logicalName.localeCompare(right.logicalName, "en"),
  );
  if (canonicalJson(manifest.artifacts) !== canonicalJson(sortedDescriptors)) {
    throw new Error("Published manifest artifact descriptors are not in canonical order");
  }

  const descriptorsByLogicalName = new Map(
    manifest.artifacts.map((descriptor) => [descriptor.logicalName, descriptor]),
  );
  const catalogCountArtifacts = catalogCountArtifactsBySchema[manifest.schemaVersion];
  for (const [catalogCountName, logicalName] of Object.entries(catalogCountArtifacts)) {
    if (
      manifest.catalogCounts[catalogCountName] !==
      descriptorsByLogicalName.get(logicalName).recordCount
    ) {
      throw new Error(
        "manifest catalogCounts." + catalogCountName + " does not match artifact recordCount",
      );
    }
  }

  for (const descriptor of manifest.artifacts) {
    const relativePath = artifactPaths[descriptor.logicalName];
    if (!relativePath) {
      throw new Error("Unsupported published artifact logical name: " + descriptor.logicalName);
    }
    const artifactPath = path.join(gameDataDir, relativePath);
    const bytes = fs.readFileSync(artifactPath);
    if (sha256Bytes(bytes) !== descriptor.contentHash) {
      throw new Error("Published artifact hash mismatch: " + descriptor.logicalName);
    }
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== descriptor.recordCount) {
      throw new Error("Published artifact recordCount mismatch: " + descriptor.logicalName);
    }
  }

  const provenancePath = path.join(gameDataDir, manifest.provenanceManifest.path);
  const provenanceBytes = fs.readFileSync(provenancePath);
  if (sha256Bytes(provenanceBytes) !== manifest.provenanceManifest.contentHash) {
    throw new Error("Published provenance file hash mismatch");
  }
  const provenance = JSON.parse(provenanceBytes.toString("utf8"));
  if (provenanceBytes.toString("utf8") !== canonicalJson(provenance)) {
    throw new Error("Published provenance file is not canonical JSON");
  }
  const { provenanceHash: _ignoredProvenanceHash, ...provenanceWithoutHash } = provenance;
  const calculatedProvenanceHash = sha256Bytes(
    Buffer.from(canonicalJson(provenanceWithoutHash), "utf8"),
  );
  if (
    calculatedProvenanceHash !== manifest.provenanceHash ||
    provenance.provenanceHash !== manifest.provenanceHash
  ) {
    throw new Error("Published provenance hash mismatch");
  }

  const sourceInventoryPath = path.join(gameDataDir, manifest.sourceInventory.path);
  const sourceInventoryBytes = fs.readFileSync(sourceInventoryPath);
  if (sha256Bytes(sourceInventoryBytes) !== manifest.sourceInventory.contentHash) {
    throw new Error("Published source inventory file hash mismatch");
  }
  const sourceInventory = JSON.parse(sourceInventoryBytes.toString("utf8"));
  if (sourceInventoryBytes.toString("utf8") !== canonicalJson(sourceInventory)) {
    throw new Error("Published source inventory file is not canonical JSON");
  }
  if (canonicalJson(sourceInventory) !== canonicalJson(provenance.inventories)) {
    throw new Error("Published source inventory file does not match provenance inventory");
  }
  if (
    provenance.sourceInventoryHash !== manifest.sourceInventory.contentHash ||
    provenance.sourceInventoryHash !== sha256Bytes(sourceInventoryBytes)
  ) {
    throw new Error("Published source inventory hash mismatch");
  }

  const calculatedBundleHash = sha256Bytes(
    Buffer.from(
      canonicalJson({
        schemaVersion: manifest.schemaVersion,
        gameDataVersion: manifest.gameDataVersion,
        artifacts: sortedDescriptors,
        provenanceHash: manifest.provenanceHash,
      }),
      "utf8",
    ),
  );
  if (calculatedBundleHash !== manifest.bundleHash) {
    throw new Error("Published bundleHash mismatch");
  }
}

function resolveRunTargets(parsedArgs) {
  if (parsedArgs.gameDataDir) {
    return {
      gameDataDir: resolveFromRepo(parsedArgs.gameDataDir),
      compareTo: parsedArgs.compareTo ? resolveFromRepo(parsedArgs.compareTo) : null,
    };
  }
  const history = discoverPublishedVersions();
  if (history.length === 0) throw new Error("No published game-data versions found");
  const current = history.at(-1);
  if (!current) throw new Error("No current published game-data version found");
  if (parsedArgs.compareCurrent) {
    const previous = history.at(-2);
    if (!previous) throw new Error("At least two published versions are required for comparison");
    return { gameDataDir: current.directory, compareTo: previous.directory };
  }
  return { gameDataDir: current.directory, compareTo: null };
}

const audits = [
  {
    id: "coverage",
    script: "audit-static-data-coverage.cjs",
    resultFile: "static-data-coverage-audit.json",
  },
  {
    id: "normalizedLearnset",
    script: "audit-normalized-learnset.cjs",
    resultFile: "normalized-learnset-audit.json",
  },
  {
    id: "learnsetIntegrity",
    script: "learnset-integrity-audit.cjs",
    resultFile: "learnset-integrity-audit.json",
  },
  {
    id: "identityRelations",
    script: "identity-relations-audit.cjs",
    resultFile: "identity-relations-audit.json",
  },
  {
    id: "identityResidue",
    script: "audit-identity-residue.cjs",
    resultFile: "identity-residue-audit.json",
  },
  {
    id: "perSpeciesIntegrity",
    script: "audit-per-species-integrity.cjs",
    resultFile: "per-species-integrity-audit.json",
  },
  {
    id: "learnsetContextIntegrity",
    script: "audit-learnset-context-integrity.cjs",
    resultFile: "learnset-context-integrity-audit.json",
  },
  {
    id: "formsIntegrity",
    script: "audit-forms-integrity.cjs",
    resultFile: "forms-integrity-audit.json",
  },
  {
    id: "provenanceReuse",
    script: "audit-provenance-reuse.cjs",
    resultFile: "provenance-reuse-audit.json",
  },
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function runAudit(audit, gameDataDir) {
  const scriptPath = path.join(scriptDir, audit.script);
  const resultPath = path.join(outDir, audit.resultFile);
  if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      POKENEXUS_GAME_DATA_BASE: gameDataDir,
    },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const outputExists = fs.existsSync(resultPath);
  let parsed = null;
  let parseError = null;
  if (outputExists) {
    try {
      parsed = readJson(resultPath);
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    id: audit.id,
    script: audit.script,
    resultFile: audit.resultFile,
    exitCode: result.status,
    signal: result.signal,
    durationMs: Date.now() - startedAt,
    outputExists,
    parseError,
    stderr: (result.stderr || "").trim(),
    status: result.status === 0 && outputExists && parseError === null ? "PASS" : "FAIL",
    parsed,
  };
}

function requireAudit(resultsById, id) {
  const result = resultsById.get(id);
  if (!result?.parsed) throw new Error("Missing parsed audit result: " + id);
  return result.parsed;
}

function compactFailure(result) {
  return {
    id: result.id,
    exitCode: result.exitCode,
    signal: result.signal,
    outputExists: result.outputExists,
    parseError: result.parseError,
    stderr: result.stderr.slice(0, 4000),
  };
}

function makeAssertion(name, actual, expected) {
  return {
    name,
    actual,
    expected,
    pass: actual === expected,
  };
}

function flattenCompletenessGaps(report) {
  const result = new Set();
  for (const entry of report.advisories?.completeness || []) {
    for (const gap of entry.gaps || []) {
      result.add([entry.speciesId, entry.sourceName, entry.formLabel ?? "", gap].join("|"));
    }
  }
  return result;
}

function numericDelta(baseline, candidate) {
  return {
    baseline,
    candidate,
    delta: candidate - baseline,
  };
}

function comparePublications(baseline, candidate) {
  const catalogChanges = {};
  const catalogKeys = new Set([
    ...Object.keys(baseline.metrics?.catalog || {}),
    ...Object.keys(candidate.metrics?.catalog || {}),
  ]);
  for (const key of [...catalogKeys].sort()) {
    const before = baseline.metrics?.catalog?.[key] ?? 0;
    const after = candidate.metrics?.catalog?.[key] ?? 0;
    if (before !== after) catalogChanges[key] = numericDelta(before, after);
  }

  const baselineGaps = flattenCompletenessGaps(baseline);
  const candidateGaps = flattenCompletenessGaps(candidate);
  const newCompletenessGaps = [...candidateGaps].filter((key) => !baselineGaps.has(key));
  const resolvedCompletenessGaps = [...baselineGaps].filter((key) => !candidateGaps.has(key));

  const regressionFields = [
    ["species.integrityFailures", "species", "integrityFailures"],
    ["species.domainViolations", "species", "domainViolations"],
    ["moves.domainViolations", "moves", "domainViolations"],
    ["moves.historicalLearnsetLeaks", "moves", "historicalLearnsetLeaks"],
    ["learnsets.exactSemanticDuplicates", "learnsets", "exactSemanticDuplicates"],
    ["learnsets.publishedNotAccepted", "learnsets", "publishedNotAccepted"],
    ["learnsets.acceptedNotPublished", "learnsets", "acceptedNotPublished"],
    ["learnsets.contextMismatches", "learnsets", "contextMismatches"],
    ["learnsets.machineContextConflicts", "learnsets", "machineContextConflicts"],
    ["forms.structuralFailures", "forms", "structuralFailures"],
    ["provenance.unexplainedUnreferenced", "provenance", "unexplainedUnreferenced"],
    ["provenance.unexpectedCrossSurface", "provenance", "unexpectedCrossSurface"],
    [
      "provenance.learnsetSourcesAcrossDifferentNationalDex",
      "provenance",
      "learnsetSourcesAcrossDifferentNationalDex",
    ],
    [
      "provenance.invalidSharedLearnsetMoveSources",
      "provenance",
      "invalidSharedLearnsetMoveSources",
    ],
    ["provenance.invalidSharedTypeChartSources", "provenance", "invalidSharedTypeChartSources"],
  ];
  const structuralRegressions = [];
  const structuralImprovements = [];
  if (baseline.metrics && candidate.metrics) {
    for (const [name, group, field] of regressionFields) {
      const before = baseline.metrics[group]?.[field] ?? 0;
      const after = candidate.metrics[group]?.[field] ?? 0;
      if (after > before) {
        structuralRegressions.push({ name, ...numericDelta(before, after) });
      } else if (after < before) {
        structuralImprovements.push({ name, ...numericDelta(before, after) });
      }
    }
    if (
      baseline.metrics.typeEffectiveness.completeMatrix === true &&
      candidate.metrics.typeEffectiveness.completeMatrix !== true
    ) {
      structuralRegressions.push({
        name: "typeEffectiveness.completeMatrix",
        baseline: true,
        candidate: candidate.metrics.typeEffectiveness.completeMatrix,
      });
    }
  }
  if (candidate.status !== "PASS") {
    structuralRegressions.unshift({
      name: "candidate.sanityStatus",
      baseline: baseline.status,
      candidate: candidate.status,
      failedAudits: candidate.failures?.map((entry) => entry.id) || [],
      failedAssertions: candidate.failedAssertions?.map((entry) => entry.name) || [],
    });
  }

  const residueConflictFields = [
    ["historicalMoveLeaks", "moves", "historicalLearnsetLeaks"],
    ["duplicateLearnsetRoutes", "learnsets", "exactSemanticDuplicates"],
    ["publishedNotAccepted", "learnsets", "publishedNotAccepted"],
    ["acceptedNotPublished", "learnsets", "acceptedNotPublished"],
    ["contextMismatches", "learnsets", "contextMismatches"],
    ["machineContextConflicts", "learnsets", "machineContextConflicts"],
    ["unexplainedProvenance", "provenance", "unexplainedUnreferenced"],
    ["unexpectedCrossSurface", "provenance", "unexpectedCrossSurface"],
    ["invalidSharedTypeChartSources", "provenance", "invalidSharedTypeChartSources"],
  ];
  const residueConflictDeltas = {};
  if (baseline.metrics && candidate.metrics) {
    for (const [name, group, field] of residueConflictFields) {
      residueConflictDeltas[name] = numericDelta(
        baseline.metrics[group]?.[field] ?? 0,
        candidate.metrics[group]?.[field] ?? 0,
      );
    }
  }

  const semanticNullDrift = {};
  for (const field of ["power", "accuracy", "zaBaseCooldownMs"]) {
    if (!baseline.metrics?.semanticNulls?.[field] || !candidate.metrics?.semanticNulls?.[field]) {
      continue;
    }
    semanticNullDrift[field] = {
      present: numericDelta(
        baseline.metrics.semanticNulls[field].present,
        candidate.metrics.semanticNulls[field].present,
      ),
      semanticNull: numericDelta(
        baseline.metrics.semanticNulls[field].semanticNull,
        candidate.metrics.semanticNulls[field].semanticNull,
      ),
    };
  }

  const learnsetCoverage = {};
  for (const field of ["rawRows", "normalizedGroups", "multiRouteGroups", "extraRoutes"]) {
    if (baseline.metrics?.learnsets && candidate.metrics?.learnsets) {
      learnsetCoverage[field] = numericDelta(
        baseline.metrics.learnsets[field],
        candidate.metrics.learnsets[field],
      );
    }
  }

  return {
    status:
      baseline.metrics == null
        ? "BASELINE_INVALID"
        : structuralRegressions.length > 0 || newCompletenessGaps.length > 0
          ? "REGRESSION"
          : "PASS",
    baselineSanityStatus: baseline.status,
    candidateSanityStatus: candidate.status,
    catalogChanges,
    completeness: {
      newGaps: newCompletenessGaps,
      resolvedGaps: resolvedCompletenessGaps,
    },
    structuralRegressions,
    structuralImprovements,
    residueConflictDeltas,
    semanticNullDrift,
    learnsetCoverage,
  };
}

function runBaselineForComparison(compareTo, candidateReport) {
  const resultSnapshots = new Map();
  for (const audit of audits) {
    const resultPath = path.join(outDir, audit.resultFile);
    resultSnapshots.set(resultPath, fs.existsSync(resultPath) ? fs.readFileSync(resultPath) : null);
  }
  const sanityJsonPath = path.join(outDir, "sanity-report.json");
  if (fs.existsSync(sanityJsonPath)) fs.unlinkSync(sanityJsonPath);
  let baselineReport;
  try {
    const child = spawnSync(process.execPath, [__filename, "--game-data-dir", compareTo], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, POKENEXUS_GAME_DATA_BASE: "" },
    });
    if (!fs.existsSync(sanityJsonPath)) {
      throw new Error(
        "Baseline sanity report was not produced for comparison: " +
          compareTo +
          (child.stderr ? "\n" + child.stderr.trim() : ""),
      );
    }
    baselineReport = readJson(sanityJsonPath);
  } finally {
    for (const [resultPath, content] of resultSnapshots) {
      if (content === null) {
        if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
      } else {
        fs.writeFileSync(resultPath, content);
      }
    }
    fs.writeFileSync(sanityJsonPath, JSON.stringify(candidateReport, null, 2) + "\n");
  }
  return baselineReport;
}

function clearRunEvidence() {
  fs.mkdirSync(outDir, { recursive: true });
  const fileNames = [
    ...audits.map((audit) => audit.resultFile),
    "sanity-report.json",
    "sanity-report.txt",
    "sanity-compare-report.json",
    "sanity-compare-report.txt",
  ];
  for (const fileName of fileNames) {
    const filePath = path.join(outDir, fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

function main() {
  clearRunEvidence();
  const parsedArgs = parseArgs(process.argv.slice(2));
  const { gameDataDir, compareTo } = resolveRunTargets(parsedArgs);
  const manifestPath = path.join(gameDataDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Game-data manifest not found: " + manifestPath);
  }
  const manifest = readJson(manifestPath);
  verifyPublishedBundleIntegrity(gameDataDir, manifest);

  const executions = audits.map((audit) => runAudit(audit, gameDataDir));
  const resultsById = new Map(executions.map((result) => [result.id, result]));
  const failures = executions.filter((result) => result.status !== "PASS");

  let metrics = null;
  let assertions = [];
  const metricAuditIds = [
    "coverage",
    "normalizedLearnset",
    "identityResidue",
    "perSpeciesIntegrity",
    "learnsetContextIntegrity",
    "formsIntegrity",
    "provenanceReuse",
  ];
  const canBuildMetrics = metricAuditIds.every((id) => resultsById.get(id)?.parsed != null);
  if (canBuildMetrics) {
    const coverage = requireAudit(resultsById, "coverage");
    const normalized = requireAudit(resultsById, "normalizedLearnset");
    const identityResidue = requireAudit(resultsById, "identityResidue");
    const perSpecies = requireAudit(resultsById, "perSpeciesIntegrity");
    const context = requireAudit(resultsById, "learnsetContextIntegrity");
    const forms = requireAudit(resultsById, "formsIntegrity");
    const provenanceReuse = requireAudit(resultsById, "provenanceReuse");

    assertions = [
      makeAssertion(
        "manifest species count",
        identityResidue.speciesIdentity.records,
        manifest.catalogCounts.species,
      ),
      makeAssertion(
        "manifest move count",
        identityResidue.moveIdentity.currentMoveDefinitions,
        manifest.catalogCounts.moves,
      ),
      makeAssertion(
        "manifest learnset count",
        identityResidue.learnsetIdentity.rows,
        manifest.catalogCounts.learnsets,
      ),
      makeAssertion(
        "manifest ability count",
        coverage.abilities.count,
        manifest.catalogCounts.abilities,
      ),
      makeAssertion("manifest item count", coverage.items.count, manifest.catalogCounts.items),
      makeAssertion(
        "manifest type count",
        coverage.typeEffectiveness.typeCount,
        manifest.catalogCounts.types,
      ),
      makeAssertion(
        "manifest type-effectiveness count",
        coverage.typeEffectiveness.rows,
        manifest.catalogCounts.currentTypeEffectiveness,
      ),
      makeAssertion(
        "accepted learnsets equal published rows",
        context.inventory.accepted,
        context.publishedParity.rows,
      ),
      makeAssertion(
        "normalized + extra routes equal raw rows",
        normalized.normalizedSpeciesMoveGroups + normalized.extraAcquisitionRoutesRetained,
        normalized.rawLearnsetRows,
      ),
      makeAssertion(
        "all species structurally clean",
        perSpecies.summary.structurallyCleanSpecies,
        perSpecies.summary.speciesRecords,
      ),
    ];

    metrics = {
      catalog: manifest.catalogCounts,
      species: {
        structurallyClean: perSpecies.summary.structurallyCleanSpecies,
        integrityFailures: perSpecies.summary.speciesWithIntegrityFailures,
        completenessGaps: perSpecies.summary.speciesWithCompletenessGaps,
        domainViolations: identityResidue.domainIntegrity.species.violationRecords,
      },
      moves: {
        domainViolations: identityResidue.domainIntegrity.moves.violationRecords,
        acceptedMappings: identityResidue.moveIdentity.acceptedMappings,
        currentDefinitions: identityResidue.moveIdentity.currentMoveDefinitions,
        historicalMappings: identityResidue.moveIdentity.historicalAcceptedMappings,
        historicalLearnsetLeaks:
          identityResidue.moveIdentity.historicalMoveIdsPresentInCurrentLearnsets,
      },
      learnsets: {
        rawRows: normalized.rawLearnsetRows,
        normalizedGroups: normalized.normalizedSpeciesMoveGroups,
        multiRouteGroups: normalized.multiRouteSpeciesMoveGroups,
        extraRoutes: normalized.extraAcquisitionRoutesRetained,
        exactSemanticDuplicates: identityResidue.learnsetIdentity.exactSemanticDuplicateRouteKeys,
        publishedNotAccepted: context.publishedParity.publishedNotAccepted,
        acceptedNotPublished: context.publishedParity.acceptedNotPublished,
        contextMismatches: context.speciesContexts.acceptedPublishedContextMismatches,
        machineContextConflicts: context.machineIdentity.conflictingContextKeys,
      },
      forms: {
        records: forms.summary.forms,
        structuralFailures: forms.comparisons.filter(
          (entry) =>
            !entry.baseResolved ||
            !entry.baseIsCanonicalBase ||
            !entry.nationalDexMatchesBase ||
            !entry.introducedNotBeforeBase ||
            entry.learnsetRows === 0 ||
            entry.sourceContexts.length !== 1,
        ).length,
        differentSourceContextFromBase: forms.summary.sourceContextDiffersFromBase,
      },
      provenance: {
        sourceRecords: identityResidue.provenance.sourceRecords,
        unexplainedUnreferenced: identityResidue.provenance.otherUnreferencedSourceRecords,
        crossSurfaceRecords: provenanceReuse.crossSurface.records,
        unexpectedCrossSurface: provenanceReuse.crossSurface.unexpectedCombinationRecords,
        learnsetSourcesAcrossDifferentNationalDex:
          provenanceReuse.learnsetEvidence.sourceRecordsAcrossDifferentNationalDex,
        invalidSharedLearnsetMoveSources: provenanceReuse.sharedLearnsetMoveEvidence.invalidSources,
        invalidSharedTypeChartSources: provenanceReuse.sharedTypeChartEvidence.invalidSources,
      },
      typeEffectiveness: {
        rows: coverage.typeEffectiveness.rows,
        completeMatrix: coverage.typeEffectiveness.completeMatrix,
      },
      semanticNulls: coverage.moves.nullableFacts,
      selectedFive: perSpecies.selectedFive.map((entry) => ({
        sourceName: entry.sourceName,
        completenessGaps: entry.completenessGaps,
        integrityFailures: entry.integrityFailures,
      })),
    };
  }

  const failedAssertions = assertions.filter((assertion) => !assertion.pass);
  const overallPass = failures.length === 0 && failedAssertions.length === 0;
  const report = {
    status: overallPass ? "PASS" : "FAIL",
    generatedAt: new Date().toISOString(),
    gameDataDir: displayPath(gameDataDir),
    publication: {
      gameDataVersion: manifest.gameDataVersion,
      schemaVersion: manifest.schemaVersion,
      bundleHash: manifest.bundleHash,
      provenanceHash: manifest.provenanceHash,
      publishedAt: manifest.publishedAt,
    },
    audits: executions.map((result) => ({
      id: result.id,
      script: result.script,
      resultFile: result.resultFile,
      status: result.status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    })),
    assertions,
    metrics,
    advisories:
      metrics !== null
        ? {
            completeness: requireAudit(resultsById, "perSpeciesIntegrity").completenessFindings,
            formContextDifferences: requireAudit(resultsById, "formsIntegrity")
              .differentContextFromBase,
            machineIdentifiersReusedAcrossContexts: requireAudit(
              resultsById,
              "learnsetContextIntegrity",
            ).machineIdentity.reusedAcrossContexts,
            machineIdentifiersReusedWithDifferentMove: requireAudit(
              resultsById,
              "learnsetContextIntegrity",
            ).machineIdentity.reusedAcrossContextsWithDifferentMove,
            explainedUnreferencedProvenance: {
              gen8LearnsetCache: requireAudit(resultsById, "identityResidue").provenance
                .unreferencedGen8LearnsetCacheRecords,
              speciesDiscovery: requireAudit(resultsById, "identityResidue").provenance
                .unreferencedSpeciesDiscoveryRecords,
            },
          }
        : null,
    failures: failures.map(compactFailure),
    failedAssertions,
  };

  fs.writeFileSync(path.join(outDir, "sanity-report.json"), JSON.stringify(report, null, 2) + "\n");

  let compareReport = null;
  if (compareTo) {
    const baselineReport = runBaselineForComparison(compareTo, report);
    const comparison = comparePublications(baselineReport, report);
    compareReport = {
      status: comparison.status,
      generatedAt: new Date().toISOString(),
      baseline: {
        gameDataDir: displayPath(compareTo),
        publication: baselineReport.publication,
        sanityStatus: baselineReport.status,
      },
      candidate: {
        gameDataDir: displayPath(gameDataDir),
        publication: report.publication,
        sanityStatus: report.status,
      },
      comparison,
    };
    fs.writeFileSync(
      path.join(outDir, "sanity-compare-report.json"),
      JSON.stringify(compareReport, null, 2) + "\n",
    );
  }

  const lines = [
    "PokeNexus game-data sanity: " + report.status,
    "Version: " + report.publication.gameDataVersion,
    "Bundle: " + report.publication.bundleHash,
    "Audits: " +
      executions.filter((result) => result.status === "PASS").length +
      "/" +
      executions.length +
      " PASS",
    "Assertions: " +
      assertions.filter((assertion) => assertion.pass).length +
      "/" +
      assertions.length +
      " PASS",
  ];
  if (metrics) {
    lines.push(
      "Species: " +
        metrics.species.structurallyClean +
        "/" +
        metrics.catalog.species +
        " structurally clean; completeness gaps=" +
        metrics.species.completenessGaps,
      "Learnsets: raw=" +
        metrics.learnsets.rawRows +
        "; normalized=" +
        metrics.learnsets.normalizedGroups +
        "; duplicate routes=" +
        metrics.learnsets.exactSemanticDuplicates +
        "; parity drift=" +
        (metrics.learnsets.publishedNotAccepted + metrics.learnsets.acceptedNotPublished),
      "Forms: " +
        metrics.forms.records +
        "; structural failures=" +
        metrics.forms.structuralFailures +
        "; context differences=" +
        metrics.forms.differentSourceContextFromBase,
      "Provenance: unexpected cross-surface=" +
        metrics.provenance.unexpectedCrossSurface +
        "; unexplained unreferenced=" +
        metrics.provenance.unexplainedUnreferenced,
      "Type matrix: " +
        metrics.typeEffectiveness.rows +
        " rows; complete=" +
        metrics.typeEffectiveness.completeMatrix,
    );
  }
  if (failures.length) {
    lines.push("Failed audits: " + failures.map((result) => result.id).join(", "));
  }
  if (failedAssertions.length) {
    lines.push(
      "Failed assertions: " + failedAssertions.map((assertion) => assertion.name).join(", "),
    );
  }
  if (compareReport) {
    lines.push(
      "Comparison: " + compareReport.status,
      "Baseline: " +
        compareReport.baseline.publication.gameDataVersion +
        " · " +
        compareReport.baseline.publication.bundleHash,
      "Catalog changes: " + Object.keys(compareReport.comparison.catalogChanges).length,
      "New completeness gaps: " +
        compareReport.comparison.completeness.newGaps.length +
        "; resolved gaps=" +
        compareReport.comparison.completeness.resolvedGaps.length,
      "Structural regressions: " +
        compareReport.comparison.structuralRegressions.length +
        "; improvements=" +
        compareReport.comparison.structuralImprovements.length,
    );
    const compareLines = [
      "PokeNexus game-data comparison: " + compareReport.status,
      "Baseline: " +
        compareReport.baseline.publication.gameDataVersion +
        " · " +
        compareReport.baseline.publication.bundleHash,
      "Baseline sanity: " + compareReport.baseline.sanityStatus,
      "Candidate: " +
        compareReport.candidate.publication.gameDataVersion +
        " · " +
        compareReport.candidate.publication.bundleHash,
      "Candidate sanity: " + compareReport.candidate.sanityStatus,
      "Catalog changes: " + Object.keys(compareReport.comparison.catalogChanges).length,
      ...Object.entries(compareReport.comparison.catalogChanges).map(
        ([name, delta]) =>
          "  catalog." +
          name +
          ": " +
          delta.baseline +
          " -> " +
          delta.candidate +
          " (" +
          (delta.delta >= 0 ? "+" : "") +
          delta.delta +
          ")",
      ),
      "New completeness gaps: " + compareReport.comparison.completeness.newGaps.length,
      "Resolved completeness gaps: " + compareReport.comparison.completeness.resolvedGaps.length,
      "Structural regressions: " + compareReport.comparison.structuralRegressions.length,
      "Structural improvements: " + compareReport.comparison.structuralImprovements.length,
      "Semantic-null fields changed: " +
        Object.values(compareReport.comparison.semanticNullDrift).filter(
          (entry) => entry.present.delta !== 0 || entry.semanticNull.delta !== 0,
        ).length,
      "Learnset coverage fields changed: " +
        Object.values(compareReport.comparison.learnsetCoverage).filter(
          (entry) => entry.delta !== 0,
        ).length,
    ];
    fs.writeFileSync(
      path.join(outDir, "sanity-compare-report.txt"),
      compareLines.join("\n") + "\n",
    );
  }
  fs.writeFileSync(path.join(outDir, "sanity-report.txt"), lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  process.exitCode = overallPass && (!compareReport || compareReport.status === "PASS") ? 0 : 2;
}

module.exports = {
  comparePublications,
  discoverPublishedVersions,
  parseArgs,
  resolveRunTargets,
};

if (require.main === module) main();
