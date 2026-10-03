import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { canonicalJson } from "./canonical-json.js";
import { sha256 } from "./canonical.js";
import { verifyLocalSourceSnapshot } from "./local-source-snapshot.js";
import { loadPublishedPveV4BundleDirectory } from "./pve-publication.js";
import {
  parseLearnsetEntryV1,
  parseMoveDefinitionV1,
  parseProvenanceManifest,
  parseSpeciesDefinitionV2,
  type ProvenanceManifest,
  type SourceRecord,
} from "./schema.js";
import {
  finalizeSourceSnapshotRecordV5,
  sourceRecordV5FromSnapshotFile,
  type SourceRecordV5,
  type SourceSnapshotRecordV5,
} from "./source-snapshot-v5.js";

export const LEGACY_V3_EVIDENCE_INDEX_VERSION = "legacy-v3-evidence-index-v1" as const;
export const LEGACY_V3_BASE_BUNDLE_HASH = "sha256:a7ee6337f8f41986ca7fc4608e8f75f49fb1a42d54d66aeb18b5ae56208c6559" as const;
export const LEGACY_V3_SNAPSHOT_FILE = "source.bin" as const;
export const LEGACY_V3_SNAPSHOT_MANIFEST = "source-snapshot.json" as const;
export const LEGACY_V3_EVIDENCE_INDEX_FILE = "legacy-v3-source-record-index.json" as const;
export const LEGACY_MOVE_AVAILABILITY_PARSER_VERSIONS = new Set([
  "bulbapedia-historical-move-availability-v1",
  "bulbapedia-gen9-move-availability-v1",
]);

interface LegacyCacheMetadata {
  fetchedAt: string;
  sourceContentHash: string;
}

export interface LegacyV3EvidenceIndexEntry {
  oldSourceRecordId: string;
  sourceRecordId: string;
  snapshotId: string;
  snapshotDirectory: string;
  provider: SourceRecord["provider"];
  canonicalUrl: string;
  acquiredAt: string;
  parserVersion: string;
  sourceContentHash: string;
}

export interface LegacyV3EvidenceIndex {
  version: typeof LEGACY_V3_EVIDENCE_INDEX_VERSION;
  baseGameDataVersion: string;
  baseBundleHash: string;
  entries: LegacyV3EvidenceIndexEntry[];
}

export interface MigrateLegacyV3EvidenceInput {
  basePublishedDirectory: string;
  cacheDirectory: string;
  outputDirectory: string;
}

export interface MigratedLegacyV3Evidence {
  index: LegacyV3EvidenceIndex;
  sourceSnapshots: SourceSnapshotRecordV5[];
  sourceRecords: SourceRecordV5[];
  sourceRecordIdMap: Map<string, string>;
}

export function isLegacyMoveAvailabilitySourceRecord(source: SourceRecord | undefined): boolean {
  return source !== undefined && LEGACY_MOVE_AVAILABILITY_PARSER_VERSIONS.has(source.parserVersion);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function pathsOverlap(left: string, right: string): boolean {
  const a = resolve(left);
  const b = resolve(right);
  const aToB = relative(a, b);
  const bToA = relative(b, a);
  const inside = (value: string): boolean =>
    value === "" || (!value.startsWith("..") && !isAbsolute(value));
  return inside(aToB) || inside(bToA);
}

function cacheKey(canonicalUrl: string): string {
  return sha256(Buffer.from(new URL(canonicalUrl).href, "utf8")).slice("sha256:".length);
}

function snapshotDirectoryName(snapshot: SourceSnapshotRecordV5): string {
  return snapshot.snapshotHash.slice("sha256:".length);
}

function parseCacheMetadata(value: unknown, label: string): LegacyCacheMetadata {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label}: must be an object`);
  }
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input).sort();
  if (keys.length !== 2 || keys[0] !== "fetchedAt" || keys[1] !== "sourceContentHash") {
    throw new TypeError(`${label}: must contain exactly fetchedAt/sourceContentHash`);
  }
  if (typeof input.fetchedAt !== "string" || Number.isNaN(Date.parse(input.fetchedAt))) {
    throw new TypeError(`${label}.fetchedAt: must be an ISO-compatible timestamp`);
  }
  if (typeof input.sourceContentHash !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(input.sourceContentHash)) {
    throw new TypeError(`${label}.sourceContentHash: must be a sha256 hash`);
  }
  return {
    fetchedAt: input.fetchedAt,
    sourceContentHash: input.sourceContentHash,
  };
}

async function readCanonicalArray(path: string, label: string): Promise<unknown[]> {
  const text = await readFile(path, "utf8");
  const parsed = JSON.parse(text) as unknown;
  if (canonicalJson(parsed) !== text) throw new Error(`${label} must be canonical JSON`);
  if (!Array.isArray(parsed)) throw new Error(`${label} must be an array`);
  return parsed;
}

export async function collectRequiredLegacyV3SourceRecordIds(
  basePublishedDirectory: string,
  provenance: ProvenanceManifest,
): Promise<Set<string>> {
  const species = (await readCanonicalArray(
    join(basePublishedDirectory, "catalogs/species.json"),
    "schema-v4 Species artifact",
  )).map(parseSpeciesDefinitionV2);
  const learnsets = (await readCanonicalArray(
    join(basePublishedDirectory, "catalogs/learnsets.json"),
    "schema-v4 Learnset artifact",
  )).map(parseLearnsetEntryV1);
  const moves = (await readCanonicalArray(
    join(basePublishedDirectory, "catalogs/moves.json"),
    "schema-v4 Move artifact",
  )).map(parseMoveDefinitionV1);
  const sourceById = new Map(provenance.sourceRecords.map((entry) => [entry.id, entry] as const));
  const mainlineAvailabilityContext = new Set<string>();
  for (const move of moves) {
    for (const sourceRecordId of move.sourceRecordIds) {
      if (isLegacyMoveAvailabilitySourceRecord(sourceById.get(sourceRecordId))) {
        mainlineAvailabilityContext.add(sourceRecordId);
      }
    }
  }

  const roles = {
    species: new Set(species.flatMap((record) => record.sourceRecordIds)),
    learnsets: new Set(learnsets.flatMap((record) => record.sourceRecordIds)),
    mainline: new Set(provenance.moveFactSources.map((relation) => relation.mainline.sourceRecordId)),
    sourceTarget: new Set(provenance.moveFactSources.map((relation) => relation.sourceTargetSourceRecordId)),
    za: new Set(provenance.moveFactSources.map((relation) => relation.zaBaseCooldownSourceRecordId)),
    mainlineAvailabilityContext,
  };
  const expected = {
    species: 503,
    learnsets: 257,
    mainline: 29,
    sourceTarget: 547,
    za: 1,
    mainlineAvailabilityContext: 3,
  } as const;
  for (const [key, count] of Object.entries(expected)) {
    if (roles[key as keyof typeof roles].size !== count) {
      throw new Error(`unexpected retained-v3 ${key} evidence count`);
    }
  }
  return new Set([
    ...roles.species,
    ...roles.learnsets,
    ...roles.mainline,
    ...roles.sourceTarget,
    ...roles.za,
    ...roles.mainlineAvailabilityContext,
  ]);
}

async function migrateSourceRecord(
  source: SourceRecord,
  cacheDirectory: string,
  outputDirectory: string,
): Promise<{ snapshot: SourceSnapshotRecordV5; sourceRecord: SourceRecordV5; entry: LegacyV3EvidenceIndexEntry }> {
  const key = cacheKey(source.canonicalUrl);
  const normalizedUrl = new URL(source.canonicalUrl).href;
  if (normalizedUrl !== source.canonicalUrl) {
    throw new Error(`legacy SourceRecord canonicalUrl is not normalized for ${source.id}`);
  }
  if (source.id !== `source:${source.provider}:${key}`) {
    throw new Error(`legacy SourceRecord id/url-key mismatch for ${source.id}`);
  }
  const metadataPath = join(cacheDirectory, `${key}.json`);
  const payloadPath = join(cacheDirectory, `${key}.bin`);
  const [metadataText, payload] = await Promise.all([
    readFile(metadataPath, "utf8"),
    readFile(payloadPath),
  ]);
  const metadata = parseCacheMetadata(JSON.parse(metadataText) as unknown, `legacy cache metadata ${key}`);
  const actualHash = sha256(payload);
  if (metadata.fetchedAt !== source.fetchedAt) {
    throw new Error(`legacy cache fetchedAt mismatch for ${source.id}`);
  }
  if (metadata.sourceContentHash !== source.sourceContentHash || actualHash !== source.sourceContentHash) {
    throw new Error(`legacy cache content hash mismatch for ${source.id}`);
  }

  const snapshot = finalizeSourceSnapshotRecordV5({
    provider: source.provider,
    upstreamRevision: null,
    acquiredAt: source.fetchedAt,
    files: [{
      logicalPath: LEGACY_V3_SNAPSHOT_FILE,
      sourceLocator: normalizedUrl,
      sourceContentHash: source.sourceContentHash,
    }],
  });
  const sourceRecord = sourceRecordV5FromSnapshotFile(
    snapshot,
    LEGACY_V3_SNAPSHOT_FILE,
    source.parserVersion,
  );
  const directoryName = snapshotDirectoryName(snapshot);
  const snapshotDirectory = join(outputDirectory, "snapshots", directoryName);
  const manifestBytes = Buffer.from(canonicalJson(snapshot), "utf8");
  if (await pathExists(snapshotDirectory)) {
    const verified = await verifyLocalSourceSnapshot(snapshotDirectory);
    if (verified.record.id !== snapshot.id || verified.record.snapshotHash !== snapshot.snapshotHash) {
      throw new Error(`stable legacy snapshot identity mismatch for ${source.id}`);
    }
    const existing = await readFile(join(snapshotDirectory, LEGACY_V3_SNAPSHOT_FILE));
    if (sha256(existing) !== source.sourceContentHash) {
      throw new Error(`stable legacy snapshot payload mismatch for ${source.id}`);
    }
  } else {
    const snapshotsRoot = join(outputDirectory, "snapshots");
    await mkdir(snapshotsRoot, { recursive: true });
    const temporary = join(snapshotsRoot, `.tmp-${randomUUID()}`);
    await mkdir(temporary, { recursive: false });
    try {
      await writeFile(join(temporary, LEGACY_V3_SNAPSHOT_FILE), payload, { flag: "wx" });
      await writeFile(join(temporary, LEGACY_V3_SNAPSHOT_MANIFEST), manifestBytes, { flag: "wx" });
      const verified = await verifyLocalSourceSnapshot(temporary);
      if (verified.record.id !== snapshot.id || verified.record.snapshotHash !== snapshot.snapshotHash) {
        throw new Error(`temporary legacy snapshot identity mismatch for ${source.id}`);
      }
      try {
        await rename(temporary, snapshotDirectory);
      } catch (error) {
        if (!(await pathExists(snapshotDirectory))) throw error;
        await rm(temporary, { recursive: true, force: true });
        const verifiedExisting = await verifyLocalSourceSnapshot(snapshotDirectory);
        if (verifiedExisting.record.id !== snapshot.id) throw error;
      }
    } catch (error) {
      if (await pathExists(temporary)) await rm(temporary, { recursive: true, force: true });
      throw error;
    }
  }

  return {
    snapshot,
    sourceRecord,
    entry: {
      oldSourceRecordId: source.id,
      sourceRecordId: sourceRecord.id,
      snapshotId: snapshot.id,
      snapshotDirectory: `snapshots/${directoryName}`,
      provider: source.provider,
      canonicalUrl: sourceRecord.canonicalUrl,
      acquiredAt: sourceRecord.acquiredAt,
      parserVersion: sourceRecord.parserVersion,
      sourceContentHash: sourceRecord.sourceContentHash,
    },
  };
}

export async function migrateLegacyV3Evidence(
  input: MigrateLegacyV3EvidenceInput,
): Promise<MigratedLegacyV3Evidence> {
  if (pathsOverlap(input.outputDirectory, input.cacheDirectory)) {
    throw new Error("legacy evidence outputDirectory must not overlap the retained source cache");
  }
  if (pathsOverlap(input.outputDirectory, input.basePublishedDirectory)) {
    throw new Error("legacy evidence outputDirectory must not overlap the immutable published baseline");
  }
  const base = await loadPublishedPveV4BundleDirectory(input.basePublishedDirectory);
  if (base.manifest.gameDataVersion !== "game-data-core-kanto-johto-v3") {
    throw new Error("legacy schema-5 migration requires exact game-data-core-kanto-johto-v3 baseline");
  }
  if (base.manifest.bundleHash !== LEGACY_V3_BASE_BUNDLE_HASH) {
    throw new Error("legacy schema-5 migration requires exact approved v3 bundleHash");
  }
  const provenanceText = await readFile(
    join(input.basePublishedDirectory, base.manifest.provenanceManifest.path),
    "utf8",
  );
  if (canonicalJson(JSON.parse(provenanceText) as unknown) !== provenanceText) {
    throw new Error("schema-v4 provenance must be canonical JSON");
  }
  const provenance = parseProvenanceManifest(JSON.parse(provenanceText) as unknown);
  const requiredIds = await collectRequiredLegacyV3SourceRecordIds(
    input.basePublishedDirectory,
    provenance,
  );
  const sourceById = new Map(provenance.sourceRecords.map((entry) => [entry.id, entry] as const));
  if (requiredIds.size !== 1146) {
    throw new Error(`expected 1,146 retained v3 SourceRecord evidence records, got ${requiredIds.size}`);
  }

  await mkdir(input.outputDirectory, { recursive: true });
  const migrated = [];
  for (const id of [...requiredIds].sort()) {
    const source = sourceById.get(id);
    if (!source) throw new Error(`v3 provenance is missing required SourceRecord ${id}`);
    migrated.push(await migrateSourceRecord(source, input.cacheDirectory, input.outputDirectory));
  }

  const entries = migrated.map(({ entry }) => entry).sort((left, right) =>
    left.oldSourceRecordId.localeCompare(right.oldSourceRecordId, "en", { sensitivity: "variant" }),
  );
  const index: LegacyV3EvidenceIndex = {
    version: LEGACY_V3_EVIDENCE_INDEX_VERSION,
    baseGameDataVersion: base.manifest.gameDataVersion,
    baseBundleHash: base.manifest.bundleHash,
    entries,
  };
  const indexPath = join(input.outputDirectory, LEGACY_V3_EVIDENCE_INDEX_FILE);
  const indexBytes = Buffer.from(canonicalJson(index), "utf8");
  if (await pathExists(indexPath)) {
    const existing = await readFile(indexPath);
    if (sha256(existing) !== sha256(indexBytes)) {
      throw new Error("stable legacy evidence index already exists with different bytes");
    }
  } else {
    const temporaryIndex = join(input.outputDirectory, `.tmp-index-${randomUUID()}.json`);
    try {
      await writeFile(temporaryIndex, indexBytes, { flag: "wx" });
      await rename(temporaryIndex, indexPath);
    } catch (error) {
      if (await pathExists(temporaryIndex)) await rm(temporaryIndex, { force: true });
      if (!(await pathExists(indexPath))) throw error;
      const existing = await readFile(indexPath);
      if (sha256(existing) !== sha256(indexBytes)) throw error;
    }
  }

  const sourceSnapshots = migrated.map(({ snapshot }) => snapshot);
  const sourceRecords = migrated.map(({ sourceRecord }) => sourceRecord);
  if (new Set(sourceSnapshots.map((entry) => entry.id)).size !== sourceSnapshots.length) {
    throw new Error("legacy evidence migration produced duplicate snapshot IDs");
  }
  if (new Set(sourceRecords.map((entry) => entry.id)).size !== sourceRecords.length) {
    throw new Error("legacy evidence migration produced duplicate SourceRecord IDs");
  }
  if (entries.length !== 1146 || sourceSnapshots.length !== 1146 || sourceRecords.length !== 1146) {
    throw new Error("legacy evidence migration did not produce exactly 1,146 identities");
  }
  return {
    index,
    sourceSnapshots,
    sourceRecords,
    sourceRecordIdMap: new Map(entries.map((entry) => [entry.oldSourceRecordId, entry.sourceRecordId] as const)),
  };
}
