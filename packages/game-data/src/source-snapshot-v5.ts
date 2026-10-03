import type { MoveId } from "@pokenexus/game-types";
import { canonicalJson } from "./canonical-json.js";
import {
  canonicalSourceInventories,
  sha256,
  sourceInventoryHash as sourceInventoryHashFn,
} from "./canonical.js";
import {
  MOVE_MAINLINE_GAMES,
  parseSourceInventory,
  type MoveMainlineGame,
  type SourceInventory,
} from "./schema.js";
export { GAME_DATA_SCHEMA_V5 } from "./schema-version-v5.js";

export const SOURCE_PROVIDERS_V5 = ["bulbapedia", "pokemondb", "pokeapi"] as const;
export type SourceProviderV5 = (typeof SOURCE_PROVIDERS_V5)[number];

export const FACT_SOURCE_KINDS = [
  "species",
  "type",
  "ability",
  "item",
  "type-effectiveness",
] as const;
export type FactSourceKind = (typeof FACT_SOURCE_KINDS)[number];

const FACT_KEYS_BY_KIND = {
  species: [
    "sourceName",
    "sourceSlug",
    "nationalDexNumber",
    "introducedGeneration",
    "formLabel",
    "typeIds",
    "baseStats",
    "abilities",
    "catchRate",
    "baseExperience",
    "growthRate",
    "heightMillimeters",
    "weightGrams",
    "eggGroups",
    "genderRatio",
    "eggCycles",
    "evYield",
    "baseFriendship",
  ],
  type: ["sourceName", "sourceSlug"],
  ability: ["sourceName", "sourceSlug", "introducedGeneration", "assignment"],
  item: ["sourceName", "sourceSlug", "sourceCategory"],
  "type-effectiveness": ["multiplier"],
} as const satisfies Record<FactSourceKind, readonly string[]>;

export type FactSourceKey = (typeof FACT_KEYS_BY_KIND)[FactSourceKind][number];

export interface SourceSnapshotFileV5 {
  logicalPath: string;
  sourceLocator: string;
  sourceContentHash: string;
}

export interface SourceSnapshotRecordV5 {
  id: string;
  provider: SourceProviderV5;
  upstreamRevision: string | null;
  acquiredAt: string;
  files: SourceSnapshotFileV5[];
  snapshotHash: string;
}

export interface SourceRecordV5 {
  id: string;
  provider: SourceProviderV5;
  canonicalUrl: string;
  acquiredAt: string;
  parserVersion: string;
  sourceContentHash: string;
  acquisitionStatus: "snapshot";
  snapshotId: string;
  logicalPath: string;
}

export interface FactSourceRelationV5 {
  subjectKind: FactSourceKind;
  subjectKey: string;
  factKey: FactSourceKey;
  sourceRecordIds: string[];
}

export interface MoveFactSourceRelationV2 {
  moveId: MoveId;
  mainline: {
    selectedGame: MoveMainlineGame;
    sourceRecordIds: string[];
  };
  sourceTargetSourceRecordIds: string[];
  makesContactSourceRecordIds: string[];
  zaBaseCooldownSourceRecordIds: string[];
}

export interface ProvenanceManifestV5 {
  sourceSnapshots: SourceSnapshotRecordV5[];
  sourceRecords: SourceRecordV5[];
  factSources: FactSourceRelationV5[];
  moveFactSources: MoveFactSourceRelationV2[];
  inventories: SourceInventory[];
  sourceInventoryHash: string;
  provenanceHash?: string;
}

const HASH_RE = /^sha256:[0-9a-f]{64}$/u;
const GIT_SHA_RE = /^[0-9a-f]{40}$/u;

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
  if (typeof value !== "string" || value.length === 0) {
    fail(path, "must be a non-empty string");
  }
  return value.normalize("NFC");
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return string(value, path);
}

function hash(value: unknown, path: string): string {
  const parsed = string(value, path);
  if (!HASH_RE.test(parsed)) fail(path, "must be sha256:<lowercase-hex>");
  return parsed;
}

function isoDate(value: unknown, path: string): string {
  const parsed = string(value, path);
  if (Number.isNaN(Date.parse(parsed))) fail(path, "must be an ISO-compatible timestamp");
  return parsed;
}

function provider(value: unknown, path: string): SourceProviderV5 {
  if (typeof value !== "string" || !SOURCE_PROVIDERS_V5.includes(value as SourceProviderV5)) {
    fail(path, `must be one of: ${SOURCE_PROVIDERS_V5.join(", ")}`);
  }
  return value as SourceProviderV5;
}

function uniqueStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0) fail(path, "must be a non-empty array");
  const parsed = value.map((entry, index) => string(entry, `${path}[${index}]`));
  if (new Set(parsed).size !== parsed.length) fail(path, "must not contain duplicates");
  return parsed;
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function normalizeLogicalPath(value: unknown, path: string): string {
  const parsed = string(value, path).replaceAll("\\", "/");
  if (parsed.startsWith("/") || parsed.split("/").some((part) => part === "" || part === "." || part === "..")) {
    fail(path, "must be a relative normalized path without empty/dot/traversal segments");
  }
  return parsed;
}

function httpsUrl(value: unknown, path: string): string {
  const parsed = string(value, path);
  let url: URL;
  try {
    url = new URL(parsed);
  } catch {
    fail(path, "must be a valid URL");
  }
  if (url.protocol !== "https:") fail(path, "must use https");
  return url.href.normalize("NFC");
}

function expectedHostForProvider(providerValue: SourceProviderV5): string | null {
  switch (providerValue) {
    case "bulbapedia": return "bulbapedia.bulbagarden.net";
    case "pokemondb": return "pokemondb.net";
    case "pokeapi": return null;
  }
}

function validateProviderLocator(providerValue: SourceProviderV5, locator: string, path: string): void {
  const url = new URL(locator);
  const expectedHost = expectedHostForProvider(providerValue);
  if (expectedHost && url.hostname !== expectedHost) {
    fail(path, `must use ${expectedHost} for provider ${providerValue}`);
  }
  if (
    providerValue === "pokeapi" &&
    url.hostname !== "github.com" &&
    url.hostname !== "raw.githubusercontent.com"
  ) {
    fail(path, "pokeapi source snapshots must reference the official GitHub source repository");
  }
  if (providerValue === "pokeapi") {
    const segments = url.pathname.split("/");
    if (segments[1] !== "PokeAPI" || segments[2] !== "pokeapi") {
      fail(path, "pokeapi source snapshots must reference PokeAPI/pokeapi");
    }
    if (url.hostname === "github.com" && segments[3] !== "blob") {
      fail(path, "GitHub pokeapi source locators must use an immutable blob URL");
    }
    if (url.search || url.hash) fail(path, "pokeapi source locators must not contain query or fragment state");
  }
}

export function canonicalSnapshotFilesV5(files: readonly SourceSnapshotFileV5[]): SourceSnapshotFileV5[] {
  return [...files]
    .map((file) => ({
      logicalPath: file.logicalPath.normalize("NFC"),
      sourceLocator: file.sourceLocator.normalize("NFC"),
      sourceContentHash: file.sourceContentHash,
    }))
    .sort((left, right) => compareUtf8(left.logicalPath, right.logicalPath));
}

export function sourceSnapshotHashV5(
  input: Pick<SourceSnapshotRecordV5, "provider" | "upstreamRevision" | "acquiredAt" | "files">,
): string {
  const preimage = {
    provider: input.provider,
    upstreamRevision: input.upstreamRevision,
    acquiredAt: input.acquiredAt,
    files: canonicalSnapshotFilesV5(input.files),
  };
  return sha256(Buffer.from(canonicalJson(preimage), "utf8"));
}

export function sourceSnapshotIdV5(providerValue: SourceProviderV5, snapshotHash: string): string {
  if (!HASH_RE.test(snapshotHash)) throw new TypeError("snapshotHash must be sha256:<lowercase-hex>");
  return `source-snapshot:${providerValue}:${snapshotHash.slice("sha256:".length)}`;
}

export function finalizeSourceSnapshotRecordV5(
  input: Omit<SourceSnapshotRecordV5, "id" | "snapshotHash">,
): SourceSnapshotRecordV5 {
  const snapshotHash = sourceSnapshotHashV5(input);
  return {
    ...input,
    files: canonicalSnapshotFilesV5(input.files),
    id: sourceSnapshotIdV5(input.provider, snapshotHash),
    snapshotHash,
  };
}

export function sourceRecordV5FromSnapshotFile(
  snapshot: SourceSnapshotRecordV5,
  logicalPath: string,
  parserVersion: string,
): SourceRecordV5 {
  const normalizedPath = logicalPath.normalize("NFC").replaceAll("\\", "/");
  const file = snapshot.files.find((entry) => entry.logicalPath === normalizedPath);
  if (!file) throw new TypeError(`snapshot does not contain ${normalizedPath}`);
  const normalizedParserVersion = parserVersion.normalize("NFC");
  if (!normalizedParserVersion) throw new TypeError("parserVersion must be non-empty");
  const identityHash = sha256(Buffer.from(canonicalJson({
    snapshotId: snapshot.id,
    logicalPath: normalizedPath,
    parserVersion: normalizedParserVersion,
  }), "utf8"));
  return {
    id: `source:${snapshot.provider}:${identityHash.slice("sha256:".length)}`,
    provider: snapshot.provider,
    canonicalUrl: file.sourceLocator,
    acquiredAt: snapshot.acquiredAt,
    parserVersion: normalizedParserVersion,
    sourceContentHash: file.sourceContentHash,
    acquisitionStatus: "snapshot",
    snapshotId: snapshot.id,
    logicalPath: normalizedPath,
  };
}

export function parseSourceSnapshotRecordV5(value: unknown): SourceSnapshotRecordV5 {
  const input = record(value, "sourceSnapshot");
  exactKeys(input, ["id", "provider", "upstreamRevision", "acquiredAt", "files", "snapshotHash"], "sourceSnapshot");
  const parsedProvider = provider(input.provider, "sourceSnapshot.provider");
  const upstreamRevision = nullableString(input.upstreamRevision, "sourceSnapshot.upstreamRevision");
  if (parsedProvider === "pokeapi") {
    if (upstreamRevision === null || !GIT_SHA_RE.test(upstreamRevision)) {
      fail("sourceSnapshot.upstreamRevision", "pokeapi snapshots require an exact 40-character lowercase Git commit SHA");
    }
  }
  const acquiredAt = isoDate(input.acquiredAt, "sourceSnapshot.acquiredAt");
  if (!Array.isArray(input.files) || input.files.length === 0) {
    fail("sourceSnapshot.files", "must be a non-empty array");
  }
  const files = input.files.map((entry, index): SourceSnapshotFileV5 => {
    const file = record(entry, `sourceSnapshot.files[${index}]`);
    exactKeys(file, ["logicalPath", "sourceLocator", "sourceContentHash"], `sourceSnapshot.files[${index}]`);
    const logicalPath = normalizeLogicalPath(file.logicalPath, `sourceSnapshot.files[${index}].logicalPath`);
    const sourceLocator = httpsUrl(file.sourceLocator, `sourceSnapshot.files[${index}].sourceLocator`);
    validateProviderLocator(parsedProvider, sourceLocator, `sourceSnapshot.files[${index}].sourceLocator`);
    return {
      logicalPath,
      sourceLocator,
      sourceContentHash: hash(file.sourceContentHash, `sourceSnapshot.files[${index}].sourceContentHash`),
    };
  });
  if (new Set(files.map((entry) => entry.logicalPath)).size !== files.length) {
    fail("sourceSnapshot.files", "logicalPath values must be unique");
  }
  if (parsedProvider === "pokeapi") {
    for (const [index, file] of files.entries()) {
      const url = new URL(file.sourceLocator);
      const expectedRevision = upstreamRevision as string;
      const segments = url.pathname.split("/");
      const revisionIndex = url.hostname === "github.com" ? 4 : 3;
      const revisionInPath = segments[revisionIndex];
      if (revisionInPath !== expectedRevision) {
        fail(`sourceSnapshot.files[${index}].sourceLocator`, "must reference the exact upstreamRevision");
      }
      const locatorLogicalPath = segments.slice(revisionIndex + 1).join("/");
      if (locatorLogicalPath !== file.logicalPath) {
        fail(`sourceSnapshot.files[${index}].sourceLocator`, "must reference the exact logicalPath");
      }
    }
  }
  const normalized = finalizeSourceSnapshotRecordV5({
    provider: parsedProvider,
    upstreamRevision,
    acquiredAt,
    files,
  });
  const snapshotHash = hash(input.snapshotHash, "sourceSnapshot.snapshotHash");
  const id = string(input.id, "sourceSnapshot.id");
  if (snapshotHash !== normalized.snapshotHash) fail("sourceSnapshot.snapshotHash", "does not match canonical snapshot preimage");
  if (id !== normalized.id) fail("sourceSnapshot.id", "does not match provider + snapshotHash");
  return normalized;
}

function parseSourceRecordV5(value: unknown): SourceRecordV5 {
  const input = record(value, "sourceRecord");
  exactKeys(input, ["id", "provider", "canonicalUrl", "acquiredAt", "parserVersion", "sourceContentHash", "acquisitionStatus", "snapshotId", "logicalPath"], "sourceRecord");
  const parsedProvider = provider(input.provider, "sourceRecord.provider");
  const canonicalUrl = httpsUrl(input.canonicalUrl, "sourceRecord.canonicalUrl");
  validateProviderLocator(parsedProvider, canonicalUrl, "sourceRecord.canonicalUrl");
  if (input.acquisitionStatus !== "snapshot") fail("sourceRecord.acquisitionStatus", "must be snapshot");
  return {
    id: string(input.id, "sourceRecord.id"),
    provider: parsedProvider,
    canonicalUrl,
    acquiredAt: isoDate(input.acquiredAt, "sourceRecord.acquiredAt"),
    parserVersion: string(input.parserVersion, "sourceRecord.parserVersion"),
    sourceContentHash: hash(input.sourceContentHash, "sourceRecord.sourceContentHash"),
    acquisitionStatus: "snapshot",
    snapshotId: string(input.snapshotId, "sourceRecord.snapshotId"),
    logicalPath: normalizeLogicalPath(input.logicalPath, "sourceRecord.logicalPath"),
  };
}

function parseFactSourceRelationV5(value: unknown): FactSourceRelationV5 {
  const input = record(value, "factSource");
  exactKeys(input, ["subjectKind", "subjectKey", "factKey", "sourceRecordIds"], "factSource");
  if (typeof input.subjectKind !== "string" || !FACT_SOURCE_KINDS.includes(input.subjectKind as FactSourceKind)) {
    fail("factSource.subjectKind", `must be one of: ${FACT_SOURCE_KINDS.join(", ")}`);
  }
  const subjectKind = input.subjectKind as FactSourceKind;
  const allowedFactKeys = FACT_KEYS_BY_KIND[subjectKind] as readonly string[];
  if (typeof input.factKey !== "string" || !allowedFactKeys.includes(input.factKey)) {
    fail("factSource.factKey", `unsupported ${subjectKind} fact key`);
  }
  return {
    subjectKind,
    subjectKey: string(input.subjectKey, "factSource.subjectKey"),
    factKey: input.factKey as FactSourceKey,
    sourceRecordIds: uniqueStringArray(input.sourceRecordIds, "factSource.sourceRecordIds").sort(compareUtf8),
  };
}

function parseMoveFactSourceRelationV2(value: unknown): MoveFactSourceRelationV2 {
  const input = record(value, "moveFactSource");
  exactKeys(input, ["moveId", "mainline", "sourceTargetSourceRecordIds", "makesContactSourceRecordIds", "zaBaseCooldownSourceRecordIds"], "moveFactSource");
  const mainline = record(input.mainline, "moveFactSource.mainline");
  exactKeys(mainline, ["selectedGame", "sourceRecordIds"], "moveFactSource.mainline");
  if (
    typeof mainline.selectedGame !== "string" ||
    !MOVE_MAINLINE_GAMES.includes(mainline.selectedGame as MoveMainlineGame)
  ) {
    fail("moveFactSource.mainline.selectedGame", "unsupported selected game");
  }
  return {
    moveId: string(input.moveId, "moveFactSource.moveId") as MoveId,
    mainline: {
      selectedGame: mainline.selectedGame as MoveMainlineGame,
      sourceRecordIds: uniqueStringArray(mainline.sourceRecordIds, "moveFactSource.mainline.sourceRecordIds").sort(compareUtf8),
    },
    sourceTargetSourceRecordIds: uniqueStringArray(input.sourceTargetSourceRecordIds, "moveFactSource.sourceTargetSourceRecordIds").sort(compareUtf8),
    makesContactSourceRecordIds: uniqueStringArray(input.makesContactSourceRecordIds, "moveFactSource.makesContactSourceRecordIds").sort(compareUtf8),
    zaBaseCooldownSourceRecordIds: uniqueStringArray(input.zaBaseCooldownSourceRecordIds, "moveFactSource.zaBaseCooldownSourceRecordIds").sort(compareUtf8),
  };
}

function canonicalFactSources(relations: readonly FactSourceRelationV5[]): FactSourceRelationV5[] {
  return [...relations].sort((left, right) =>
    compareUtf8(
      `${left.subjectKind}\u0000${left.subjectKey}\u0000${left.factKey}`,
      `${right.subjectKind}\u0000${right.subjectKey}\u0000${right.factKey}`,
    ),
  );
}

export function canonicalizeProvenanceManifestV5(provenance: ProvenanceManifestV5): ProvenanceManifestV5 {
  return {
    ...provenance,
    sourceSnapshots: provenance.sourceSnapshots
      .map((snapshot) => ({ ...snapshot, files: canonicalSnapshotFilesV5(snapshot.files) }))
      .sort((left, right) => compareUtf8(left.id, right.id)),
    sourceRecords: [...provenance.sourceRecords].sort((left, right) => compareUtf8(left.id, right.id)),
    factSources: canonicalFactSources(
      provenance.factSources.map((relation) => ({
        ...relation,
        sourceRecordIds: [...relation.sourceRecordIds].sort(compareUtf8),
      })),
    ),
    moveFactSources: provenance.moveFactSources
      .map((relation) => ({
        ...relation,
        mainline: {
          ...relation.mainline,
          sourceRecordIds: [...relation.mainline.sourceRecordIds].sort(compareUtf8),
        },
        sourceTargetSourceRecordIds: [...relation.sourceTargetSourceRecordIds].sort(compareUtf8),
        makesContactSourceRecordIds: [...relation.makesContactSourceRecordIds].sort(compareUtf8),
        zaBaseCooldownSourceRecordIds: [...relation.zaBaseCooldownSourceRecordIds].sort(compareUtf8),
      }))
      .sort((left, right) => compareUtf8(left.moveId, right.moveId)),
    inventories: canonicalSourceInventories(provenance.inventories),
  };
}

export function provenanceHashV5(provenance: ProvenanceManifestV5): string {
  const { provenanceHash: _ignored, ...withoutHash } = canonicalizeProvenanceManifestV5(provenance);
  return sha256(Buffer.from(canonicalJson(withoutHash), "utf8"));
}

export function finalizeProvenanceManifestV5(
  provenance: Omit<ProvenanceManifestV5, "sourceInventoryHash" | "provenanceHash">,
): ProvenanceManifestV5 {
  const withInventoryHash: ProvenanceManifestV5 = {
    ...provenance,
    sourceInventoryHash: sourceInventoryHashFn(provenance.inventories),
  };
  return canonicalizeProvenanceManifestV5({
    ...withInventoryHash,
    provenanceHash: provenanceHashV5(withInventoryHash),
  });
}

export function parseProvenanceManifestV5(value: unknown): ProvenanceManifestV5 {
  const input = record(value, "provenanceV5");
  const requiredKeys = ["sourceSnapshots", "sourceRecords", "factSources", "moveFactSources", "inventories", "sourceInventoryHash"];
  const allowedKeys = [...requiredKeys, "provenanceHash"];
  for (const key of Object.keys(input)) {
    if (!allowedKeys.includes(key)) fail(`provenanceV5.${key}`, "is not an accepted field");
  }
  for (const key of requiredKeys) {
    if (!(key in input)) fail(`provenanceV5.${key}`, "is required");
  }
  if (!Array.isArray(input.sourceSnapshots)) fail("provenanceV5.sourceSnapshots", "must be an array");
  if (!Array.isArray(input.sourceRecords)) fail("provenanceV5.sourceRecords", "must be an array");
  if (!Array.isArray(input.factSources)) fail("provenanceV5.factSources", "must be an array");
  if (!Array.isArray(input.moveFactSources)) fail("provenanceV5.moveFactSources", "must be an array");
  if (!Array.isArray(input.inventories)) fail("provenanceV5.inventories", "must be an array");

  const sourceSnapshots = input.sourceSnapshots.map(parseSourceSnapshotRecordV5);
  const sourceRecords = input.sourceRecords.map(parseSourceRecordV5);
  const factSources = input.factSources.map(parseFactSourceRelationV5);
  const moveFactSources = input.moveFactSources.map(parseMoveFactSourceRelationV2);
  const inventories = input.inventories.map(parseSourceInventory);
  const sourceInventoryHash = hash(input.sourceInventoryHash, "provenanceV5.sourceInventoryHash");
  const provenanceHashValue = input.provenanceHash === undefined
    ? undefined
    : hash(input.provenanceHash, "provenanceV5.provenanceHash");

  if (new Set(sourceSnapshots.map((entry) => entry.id)).size !== sourceSnapshots.length) {
    fail("provenanceV5.sourceSnapshots", "snapshot IDs must be unique");
  }
  if (new Set(sourceRecords.map((entry) => entry.id)).size !== sourceRecords.length) {
    fail("provenanceV5.sourceRecords", "source record IDs must be unique");
  }
  if (new Set(inventories.map((entry) => entry.surface)).size !== inventories.length) {
    fail("provenanceV5.inventories", "inventory surfaces must be unique");
  }
  if (sourceInventoryHash !== sourceInventoryHashFn(inventories)) {
    fail("provenanceV5.sourceInventoryHash", "does not match canonical source inventory preimage");
  }

  const snapshotsById = new Map(sourceSnapshots.map((entry) => [entry.id, entry] as const));
  const sourceRecordsById = new Map(sourceRecords.map((entry) => [entry.id, entry] as const));
  for (const [index, source] of sourceRecords.entries()) {
    const snapshot = snapshotsById.get(source.snapshotId);
    if (!snapshot) fail(`provenanceV5.sourceRecords[${index}].snapshotId`, "references unknown snapshot");
    if (source.provider !== snapshot.provider) fail(`provenanceV5.sourceRecords[${index}].provider`, "must match snapshot provider");
    const snapshotFile = snapshot.files.find((entry) => entry.logicalPath === source.logicalPath);
    if (!snapshotFile) fail(`provenanceV5.sourceRecords[${index}].logicalPath`, "does not exist in snapshot inventory");
    if (source.acquiredAt !== snapshot.acquiredAt) {
      fail(`provenanceV5.sourceRecords[${index}].acquiredAt`, "must match snapshot acquisition timestamp");
    }
    if (snapshotFile.sourceContentHash !== source.sourceContentHash) {
      fail(`provenanceV5.sourceRecords[${index}].sourceContentHash`, "must match snapshot file hash");
    }
    if (snapshotFile.sourceLocator !== source.canonicalUrl) {
      fail(`provenanceV5.sourceRecords[${index}].canonicalUrl`, "must match snapshot file sourceLocator");
    }
  }

  const assertEvidenceIds = (ids: readonly string[], path: string): void => {
    for (const id of ids) {
      if (!sourceRecordsById.has(id)) fail(path, `references unknown source record ${id}`);
    }
  };
  const factRelationKeys = new Set<string>();
  for (const [index, relation] of factSources.entries()) {
    const key = `${relation.subjectKind}\u0000${relation.subjectKey}\u0000${relation.factKey}`;
    if (factRelationKeys.has(key)) fail(`provenanceV5.factSources[${index}]`, "duplicate fact relation");
    factRelationKeys.add(key);
    assertEvidenceIds(relation.sourceRecordIds, `provenanceV5.factSources[${index}].sourceRecordIds`);
  }
  const moveIds = new Set<string>();
  for (const [index, relation] of moveFactSources.entries()) {
    if (moveIds.has(relation.moveId)) fail(`provenanceV5.moveFactSources[${index}].moveId`, "duplicate Move fact relation");
    moveIds.add(relation.moveId);
    assertEvidenceIds(relation.mainline.sourceRecordIds, `provenanceV5.moveFactSources[${index}].mainline.sourceRecordIds`);
    assertEvidenceIds(relation.sourceTargetSourceRecordIds, `provenanceV5.moveFactSources[${index}].sourceTargetSourceRecordIds`);
    assertEvidenceIds(relation.makesContactSourceRecordIds, `provenanceV5.moveFactSources[${index}].makesContactSourceRecordIds`);
    assertEvidenceIds(relation.zaBaseCooldownSourceRecordIds, `provenanceV5.moveFactSources[${index}].zaBaseCooldownSourceRecordIds`);
  }

  const parsed = canonicalizeProvenanceManifestV5({
    sourceSnapshots,
    sourceRecords,
    factSources,
    moveFactSources,
    inventories,
    sourceInventoryHash,
    ...(provenanceHashValue === undefined ? {} : { provenanceHash: provenanceHashValue }),
  });
  if (provenanceHashValue !== undefined && provenanceHashV5(parsed) !== provenanceHashValue) {
    fail("provenanceV5.provenanceHash", "does not match canonical provenance preimage");
  }
  return parsed;
}
