import { canonicalJson } from "./canonical-json.js";
import {
  parseAbilityDefinitionV1,
  parseGameDataManifest,
  parseItemDefinitionV1,
  parseLearnsetEntryV1,
  parseMoveDefinitionV1,
  parseSpeciesDefinitionV2,
  parseTypeDefinitionV1,
  parseTypeEffectivenessEntry,
  type GameDataManifest,
} from "./schema.js";

export const RUNTIME_ARTIFACT_PATHS = {
  "catalogs/species": "catalogs/species.json",
  "catalogs/moves": "catalogs/moves.json",
  "catalogs/types": "catalogs/types.json",
  "catalogs/abilities": "catalogs/abilities.json",
  "catalogs/items": "catalogs/items.json",
  "catalogs/learnsets": "catalogs/learnsets.json",
  "referenceData/currentTypeEffectiveness": "reference-data/current-type-effectiveness.json",
} as const;

export type RuntimeArtifactLogicalName = keyof typeof RUNTIME_ARTIFACT_PATHS;

export interface RuntimeGameDataReader {
  read(path: string): Promise<Uint8Array>;
}

export function createHttpGameDataReader(
  baseUrl: string | URL,
  fetchImpl: typeof fetch = fetch,
): RuntimeGameDataReader {
  const root = new URL(baseUrl.toString());
  if (root.protocol !== "https:" && root.protocol !== "http:") {
    throw new TypeError("game-data delivery base URL must use http or https");
  }
  if (!root.pathname.endsWith("/")) root.pathname += "/";
  return {
    async read(path) {
      const normalizedPath = path.replace(/^\/+/, "");
      const response = await fetchImpl(new URL(normalizedPath, root));
      if (!response.ok) {
        throw new Error(
          `game-data delivery fetch failed ${response.status} for ${normalizedPath}`,
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

export interface RuntimeGameDataVersion {
  gameDataVersion: string;
  directoryName: string;
  manifest: GameDataManifest;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return `sha256:${hex(new Uint8Array(digest))}`;
}

async function sha256HexText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return hex(new Uint8Array(digest));
}

function joinPath(...parts: string[]): string {
  return parts.map((part) => part.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
}

async function parseCanonicalJson(bytes: Uint8Array, label: string): Promise<unknown> {
  const text = textDecoder.decode(bytes);
  const parsed = JSON.parse(text) as unknown;
  if (canonicalJson(parsed) !== text) throw new Error(`${label} is not canonical JSON`);
  return parsed;
}

export async function runtimeVersionDirectoryName(gameDataVersion: string): Promise<string> {
  const normalized = gameDataVersion.normalize("NFC");
  if (!normalized) throw new TypeError("gameDataVersion must be non-empty");
  return `version-${await sha256HexText(normalized)}`;
}

export async function loadRuntimeGameDataVersion(
  reader: RuntimeGameDataReader,
  gameDataVersion: string,
): Promise<RuntimeGameDataVersion> {
  const normalized = gameDataVersion.normalize("NFC");
  const directoryName = await runtimeVersionDirectoryName(normalized);
  const manifestBytes = await reader.read(joinPath(directoryName, "manifest.json"));
  const manifest = parseGameDataManifest(
    await parseCanonicalJson(manifestBytes, "published manifest"),
  );
  if (manifest.gameDataVersion !== normalized) {
    throw new Error("published manifest gameDataVersion does not match requested version");
  }
  const expectedBundleHash = await sha256(
    textEncoder.encode(
      canonicalJson({
        schemaVersion: manifest.schemaVersion,
        gameDataVersion: manifest.gameDataVersion,
        artifacts: [...manifest.artifacts].sort((left, right) =>
          left.logicalName.localeCompare(right.logicalName, "en", { sensitivity: "variant" }),
        ),
        provenanceHash: manifest.provenanceHash,
      }),
    ),
  );
  if (manifest.bundleHash !== expectedBundleHash) throw new Error("published bundleHash mismatch");
  return { gameDataVersion: normalized, directoryName, manifest };
}

function parserFor(logicalName: RuntimeArtifactLogicalName): (value: unknown) => unknown {
  switch (logicalName) {
    case "catalogs/species": return parseSpeciesDefinitionV2;
    case "catalogs/moves": return parseMoveDefinitionV1;
    case "catalogs/types": return parseTypeDefinitionV1;
    case "catalogs/abilities": return parseAbilityDefinitionV1;
    case "catalogs/items": return parseItemDefinitionV1;
    case "catalogs/learnsets": return parseLearnsetEntryV1;
    case "referenceData/currentTypeEffectiveness": return parseTypeEffectivenessEntry;
  }
}

export async function loadRuntimeGameDataArtifact(
  reader: RuntimeGameDataReader,
  version: RuntimeGameDataVersion,
  logicalName: RuntimeArtifactLogicalName,
): Promise<unknown[]> {
  const descriptors = version.manifest.artifacts.filter((entry) => entry.logicalName === logicalName);
  if (descriptors.length !== 1) {
    throw new Error(`manifest must contain exactly one ${logicalName} artifact descriptor`);
  }
  const bytes = await reader.read(
    joinPath(version.directoryName, RUNTIME_ARTIFACT_PATHS[logicalName]),
  );
  if (await sha256(bytes) !== descriptors[0].contentHash) {
    throw new Error(`${logicalName} content hash mismatch`);
  }
  const parsed = await parseCanonicalJson(bytes, logicalName);
  if (!Array.isArray(parsed)) throw new Error(`${logicalName} must be a JSON array`);
  if (parsed.length !== descriptors[0].recordCount) {
    throw new Error(`${logicalName} record count mismatch`);
  }
  const parser = parserFor(logicalName);
  return parsed.map((entry) => parser(entry));
}

export async function loadRuntimeAuditArtifact(
  reader: RuntimeGameDataReader,
  version: RuntimeGameDataVersion,
  kind: "provenance" | "source-inventory",
): Promise<unknown> {
  const descriptor = kind === "provenance"
    ? version.manifest.provenanceManifest
    : version.manifest.sourceInventory;
  const bytes = await reader.read(joinPath(version.directoryName, descriptor.path));
  if (await sha256(bytes) !== descriptor.contentHash) {
    throw new Error(`${kind} content hash mismatch`);
  }
  return parseCanonicalJson(bytes, kind);
}
