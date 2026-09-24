import type { ArtifactDescriptor } from "./schema.js";
import { PVE_CONTENT_SCHEMA_VERSION } from "./pve-content-schema.js";

export const GAME_DATA_SCHEMA_V4 = "4" as const;

export const GAME_DATA_V4_ARTIFACT_PATHS = {
  "catalogs/species": "catalogs/species.json",
  "catalogs/moves": "catalogs/moves.json",
  "catalogs/types": "catalogs/types.json",
  "catalogs/abilities": "catalogs/abilities.json",
  "catalogs/items": "catalogs/items.json",
  "catalogs/learnsets": "catalogs/learnsets.json",
  "referenceData/currentTypeEffectiveness": "reference-data/current-type-effectiveness.json",
  "catalogs/zones": "catalogs/zones.json",
  "catalogs/hunts": "catalogs/hunts.json",
  "catalogs/encounter-definitions": "catalogs/encounter-definitions.json",
} as const;

export type GameDataV4ArtifactLogicalName = keyof typeof GAME_DATA_V4_ARTIFACT_PATHS;

export interface GameDataManifestV4 {
  schemaVersion: typeof GAME_DATA_SCHEMA_V4;
  pveContentSchemaVersion: typeof PVE_CONTENT_SCHEMA_VERSION;
  gameDataVersion: string;
  bundleHash: string;
  provenanceHash: string;
  publishedAt: string;
  normalizerVersion: string;
  artifacts: ArtifactDescriptor[];
  provenanceManifest: {
    logicalName: "provenance";
    path: "provenance.json";
    contentHash: string;
  };
  sourceInventory: {
    logicalName: "source-inventory";
    path: "source-inventory.json";
    contentHash: string;
  };
  catalogCounts: {
    species: number;
    moves: number;
    types: number;
    abilities: number;
    items: number;
    learnsets: number;
    currentTypeEffectiveness: number;
    zones: number;
    hunts: number;
    encounterDefinitions: number;
  };
}

const HASH_RE = /^sha256:[0-9a-f]{64}$/u;
const REQUIRED_LOGICAL_NAMES = Object.keys(GAME_DATA_V4_ARTIFACT_PATHS).sort();

function fail(path: string, message: string): never {
  throw new TypeError(`${path}: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "must be an object");
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], path: string): void {
  const expectedSet = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!expectedSet.has(key)) fail(`${path}.${key}`, "is not an accepted field");
  }
  for (const key of expected) {
    if (!(key in value)) fail(`${path}.${key}`, "is required");
  }
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) fail(path, "must be a non-empty string");
  return value.normalize("NFC");
}

function hash(value: unknown, path: string): string {
  const result = string(value, path);
  if (!HASH_RE.test(result)) fail(path, "must be a sha256 hash");
  return result;
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(path, "must be a non-negative safe integer");
  }
  return value;
}

function parseArtifact(value: unknown, path: string): ArtifactDescriptor {
  const entry = record(value, path);
  exactKeys(entry, ["logicalName", "contentHash", "recordCount"], path);
  return {
    logicalName: string(entry.logicalName, `${path}.logicalName`),
    contentHash: hash(entry.contentHash, `${path}.contentHash`),
    recordCount: nonNegativeInteger(entry.recordCount, `${path}.recordCount`),
  };
}

function referencedFile<
  TLogicalName extends "provenance" | "source-inventory",
  TPath extends "provenance.json" | "source-inventory.json",
>(
  value: unknown,
  path: string,
  logicalName: TLogicalName,
  expectedPath: TPath,
): { logicalName: TLogicalName; path: TPath; contentHash: string } {
  const entry = record(value, path);
  exactKeys(entry, ["logicalName", "path", "contentHash"], path);
  if (entry.logicalName !== logicalName) fail(`${path}.logicalName`, `must be ${logicalName}`);
  if (entry.path !== expectedPath) fail(`${path}.path`, `must be ${expectedPath}`);
  return {
    logicalName,
    path: expectedPath,
    contentHash: hash(entry.contentHash, `${path}.contentHash`),
  };
}

export function parseGameDataManifestV4(value: unknown): GameDataManifestV4 {
  const manifest = record(value, "manifest");
  exactKeys(
    manifest,
    [
      "schemaVersion",
      "pveContentSchemaVersion",
      "gameDataVersion",
      "bundleHash",
      "provenanceHash",
      "publishedAt",
      "normalizerVersion",
      "artifacts",
      "provenanceManifest",
      "sourceInventory",
      "catalogCounts",
    ],
    "manifest",
  );
  if (manifest.schemaVersion !== GAME_DATA_SCHEMA_V4) {
    fail("manifest.schemaVersion", `must be ${GAME_DATA_SCHEMA_V4}`);
  }
  if (manifest.pveContentSchemaVersion !== PVE_CONTENT_SCHEMA_VERSION) {
    fail("manifest.pveContentSchemaVersion", `must be ${PVE_CONTENT_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(manifest.artifacts)) fail("manifest.artifacts", "must be an array");
  const artifacts = manifest.artifacts.map((entry, index) =>
    parseArtifact(entry, `manifest.artifacts[${index}]`),
  );
  const actualNames = artifacts.map(({ logicalName }) => logicalName).sort();
  if (
    actualNames.length !== REQUIRED_LOGICAL_NAMES.length ||
    actualNames.some((logicalName, index) => logicalName !== REQUIRED_LOGICAL_NAMES[index])
  ) {
    fail("manifest.artifacts", `must contain exactly ${REQUIRED_LOGICAL_NAMES.join(", ")}`);
  }
  const canonicalNames = artifacts.map(({ logicalName }) => logicalName);
  const sortedNames = [...canonicalNames].sort();
  if (canonicalNames.some((logicalName, index) => logicalName !== sortedNames[index])) {
    fail("manifest.artifacts", "must be sorted by logicalName");
  }

  const counts = record(manifest.catalogCounts, "manifest.catalogCounts");
  exactKeys(
    counts,
    [
      "species",
      "moves",
      "types",
      "abilities",
      "items",
      "learnsets",
      "currentTypeEffectiveness",
      "zones",
      "hunts",
      "encounterDefinitions",
    ],
    "manifest.catalogCounts",
  );
  const parsedCounts: GameDataManifestV4["catalogCounts"] = {
    species: nonNegativeInteger(counts.species, "manifest.catalogCounts.species"),
    moves: nonNegativeInteger(counts.moves, "manifest.catalogCounts.moves"),
    types: nonNegativeInteger(counts.types, "manifest.catalogCounts.types"),
    abilities: nonNegativeInteger(counts.abilities, "manifest.catalogCounts.abilities"),
    items: nonNegativeInteger(counts.items, "manifest.catalogCounts.items"),
    learnsets: nonNegativeInteger(counts.learnsets, "manifest.catalogCounts.learnsets"),
    currentTypeEffectiveness: nonNegativeInteger(
      counts.currentTypeEffectiveness,
      "manifest.catalogCounts.currentTypeEffectiveness",
    ),
    zones: nonNegativeInteger(counts.zones, "manifest.catalogCounts.zones"),
    hunts: nonNegativeInteger(counts.hunts, "manifest.catalogCounts.hunts"),
    encounterDefinitions: nonNegativeInteger(
      counts.encounterDefinitions,
      "manifest.catalogCounts.encounterDefinitions",
    ),
  };
  const descriptorCountByLogicalName = new Map(
    artifacts.map(({ logicalName, recordCount }) => [logicalName, recordCount] as const),
  );
  const expectedCounts: Array<[keyof GameDataManifestV4["catalogCounts"], GameDataV4ArtifactLogicalName]> = [
    ["species", "catalogs/species"],
    ["moves", "catalogs/moves"],
    ["types", "catalogs/types"],
    ["abilities", "catalogs/abilities"],
    ["items", "catalogs/items"],
    ["learnsets", "catalogs/learnsets"],
    ["currentTypeEffectiveness", "referenceData/currentTypeEffectiveness"],
    ["zones", "catalogs/zones"],
    ["hunts", "catalogs/hunts"],
    ["encounterDefinitions", "catalogs/encounter-definitions"],
  ];
  for (const [countKey, logicalName] of expectedCounts) {
    if (parsedCounts[countKey] !== descriptorCountByLogicalName.get(logicalName)) {
      fail(
        `manifest.catalogCounts.${countKey}`,
        `must match ${logicalName} descriptor recordCount`,
      );
    }
  }

  const publishedAt = string(manifest.publishedAt, "manifest.publishedAt");
  if (Number.isNaN(Date.parse(publishedAt))) {
    fail("manifest.publishedAt", "must be an ISO-compatible timestamp");
  }

  return {
    schemaVersion: GAME_DATA_SCHEMA_V4,
    pveContentSchemaVersion: PVE_CONTENT_SCHEMA_VERSION,
    gameDataVersion: string(manifest.gameDataVersion, "manifest.gameDataVersion"),
    bundleHash: hash(manifest.bundleHash, "manifest.bundleHash"),
    provenanceHash: hash(manifest.provenanceHash, "manifest.provenanceHash"),
    publishedAt,
    normalizerVersion: string(manifest.normalizerVersion, "manifest.normalizerVersion"),
    artifacts,
    provenanceManifest: referencedFile(
      manifest.provenanceManifest,
      "manifest.provenanceManifest",
      "provenance",
      "provenance.json",
    ),
    sourceInventory: referencedFile(
      manifest.sourceInventory,
      "manifest.sourceInventory",
      "source-inventory",
      "source-inventory.json",
    ),
    catalogCounts: parsedCounts,
  };
}
