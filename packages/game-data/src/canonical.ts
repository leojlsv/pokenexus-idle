import { createHash } from "node:crypto";
import type {
  ArtifactDescriptor,
  GameDataCandidate,
  ProvenanceManifest,
  SourceProvider,
  SourceInventory,
} from "./schema.js";

export type { ArtifactDescriptor } from "./schema.js";

export interface CanonicalArtifact {
  bytes: Buffer;
  descriptor: ArtifactDescriptor;
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function canonicalValue(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.normalize("NFC");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path}: non-finite numbers are not canonical JSON`);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => canonicalValue(entry, `${path}[${index}]`));
  if (typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry === undefined) throw new TypeError(`${path}.${key}: undefined is not canonical JSON`);
      result[key.normalize("NFC")] = canonicalValue(entry, `${path}.${key}`);
    }
    return result;
  }
  throw new TypeError(`${path}: unsupported canonical JSON value ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value, "$"));
}

export function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function artifactDescriptor(logicalName: string, bytes: Uint8Array, recordCount: number): ArtifactDescriptor {
  if (!logicalName) throw new TypeError("logicalName must be non-empty");
  if (!Number.isSafeInteger(recordCount) || recordCount < 0) throw new TypeError("recordCount must be a non-negative integer");
  return { logicalName, contentHash: sha256(bytes), recordCount };
}

function byId<T extends { id: string }>(records: T[]): T[] {
  return [...records].sort((a, b) => a.id.localeCompare(b.id, "en", { sensitivity: "variant" }));
}

function sortedStrings(values: string[]): string[] {
  return [...values].sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "variant" }),
  );
}

function normalizedSpecies(candidate: GameDataCandidate) {
  return byId(candidate.catalogs.species).map((record) => ({
    ...record,
    typeIds: sortedStrings(record.typeIds) as typeof record.typeIds,
    abilities: [...record.abilities].sort((a, b) =>
      a.sourceAbilitySlot.localeCompare(b.sourceAbilitySlot, "en"),
    ),
    sourceRecordIds: sortedStrings(record.sourceRecordIds),
  }));
}

function normalizedSourceRefs<T extends { sourceRecordIds: string[] }>(
  records: T[],
): T[] {
  return records.map((record) => ({
    ...record,
    sourceRecordIds: sortedStrings(record.sourceRecordIds),
  }));
}

function byLearnsetKey(candidate: GameDataCandidate): GameDataCandidate["catalogs"]["learnsets"] {
  return [...candidate.catalogs.learnsets].sort((a, b) => {
    const left = [a.speciesId, a.moveId, String(a.sourceGeneration).padStart(3, "0"), a.sourceGame, a.method, a.level ?? -1, a.machineIdentifier ?? ""].join("\u0000");
    const right = [b.speciesId, b.moveId, String(b.sourceGeneration).padStart(3, "0"), b.sourceGame, b.method, b.level ?? -1, b.machineIdentifier ?? ""].join("\u0000");
    return left.localeCompare(right, "en", { sensitivity: "variant" });
  });
}

function byMatrixPair(candidate: GameDataCandidate): GameDataCandidate["referenceData"]["currentTypeEffectiveness"] {
  return [...candidate.referenceData.currentTypeEffectiveness].sort((a, b) => `${a.attackTypeId}\u0000${a.defenseTypeId}`.localeCompare(`${b.attackTypeId}\u0000${b.defenseTypeId}`, "en", { sensitivity: "variant" }));
}

function artifact(logicalName: string, value: unknown[], recordCount = value.length): CanonicalArtifact {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return { bytes, descriptor: artifactDescriptor(logicalName, bytes, recordCount) };
}

export function canonicalizeCandidateArtifacts(candidate: GameDataCandidate) {
  return {
    species: artifact("catalogs/species", normalizedSpecies(candidate)),
    moves: artifact(
      "catalogs/moves",
      normalizedSourceRefs(byId(candidate.catalogs.moves)),
    ),
    types: artifact(
      "catalogs/types",
      normalizedSourceRefs(byId(candidate.catalogs.types)),
    ),
    abilities: artifact(
      "catalogs/abilities",
      normalizedSourceRefs(byId(candidate.catalogs.abilities)),
    ),
    items: artifact(
      "catalogs/items",
      normalizedSourceRefs(byId(candidate.catalogs.items)),
    ),
    learnsets: artifact(
      "catalogs/learnsets",
      normalizedSourceRefs(byLearnsetKey(candidate)),
    ),
    currentTypeEffectiveness: artifact(
      "referenceData/currentTypeEffectiveness",
      normalizedSourceRefs(byMatrixPair(candidate)),
    ),
  };
}

export function canonicalSourceInventories(
  inventories: SourceInventory[],
): SourceInventory[] {
  return [...inventories]
    .map((inventory) => ({
      surface: inventory.surface,
      discoveredSourceKeys: sortedStrings(inventory.discoveredSourceKeys),
      acceptedMappingKeys: sortedStrings(inventory.acceptedMappingKeys),
      extractedSourceKeys: sortedStrings(inventory.extractedSourceKeys),
      normalizedSourceKeys: sortedStrings(inventory.normalizedSourceKeys),
      candidateSourceKeys: sortedStrings(inventory.candidateSourceKeys),
      excludedOrDeferred: [...inventory.excludedOrDeferred].sort((a, b) =>
        a.sourceKey.localeCompare(b.sourceKey),
      ),
      ...(inventory.previousAcceptedMappingKeys === undefined
        ? {}
        : {
            previousAcceptedMappingKeys: sortedStrings(
              inventory.previousAcceptedMappingKeys,
            ),
          }),
    }))
    .sort((a, b) => a.surface.localeCompare(b.surface));
}

export function canonicalizeProvenanceManifest(
  provenance: ProvenanceManifest,
): ProvenanceManifest {
  return {
    ...provenance,
    sourceRecords: [...provenance.sourceRecords].sort((a, b) =>
      a.id.localeCompare(b.id, "en", { sensitivity: "variant" }),
    ),
    moveFactSources: [...provenance.moveFactSources].sort((a, b) =>
      a.moveId.localeCompare(b.moveId, "en", { sensitivity: "variant" }),
    ),
    inventories: canonicalSourceInventories(provenance.inventories),
  };
}

export function sourceInventoryHash(inventories: SourceInventory[]): string {
  const normalized = canonicalSourceInventories(inventories);
  return sha256(Buffer.from(canonicalJson(normalized), "utf8"));
}

export function provenanceHash(provenance: ProvenanceManifest): string {
  const { provenanceHash: _ignored, ...withoutHash } =
    canonicalizeProvenanceManifest(provenance);
  return sha256(Buffer.from(canonicalJson(withoutHash), "utf8"));
}

export function finalizeProvenance(
  provenance: Omit<ProvenanceManifest, "sourceInventoryHash" | "provenanceHash"> & {
    /** Legacy caller compatibility only; provider authority is per SourceRecord and this value is discarded. */
    provider?: SourceProvider;
  },
): ProvenanceManifest {
  const { provider: _legacyProvider, ...withoutLegacyProvider } = provenance;
  const withInventoryHash: ProvenanceManifest = {
    ...withoutLegacyProvider,
    sourceInventoryHash: sourceInventoryHash(withoutLegacyProvider.inventories),
  };
  return canonicalizeProvenanceManifest({
    ...withInventoryHash,
    provenanceHash: provenanceHash(withInventoryHash),
  });
}

export function bundleHash(
  schemaVersion: string,
  gameDataVersion: string,
  artifacts: ArtifactDescriptor[],
  provenanceHashValue: string,
): string {
  const input = {
    schemaVersion,
    gameDataVersion,
    artifacts: [...artifacts].sort((a, b) => a.logicalName.localeCompare(b.logicalName)),
    provenanceHash: provenanceHashValue,
  };
  return sha256(Buffer.from(canonicalJson(input), "utf8"));
}
