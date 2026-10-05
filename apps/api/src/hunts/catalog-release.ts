import {
  createDefaultProductionCombatCatalogResolver,
} from "../moves/context";
import { createConfiguredMoveAuthorities, type PlayerStateEnvironment } from "../player/runtime";
import {
  GAME_DATA_SCHEMA_V4,
  GAME_DATA_SCHEMA_V5,
  loadRuntimeGameDataArtifact,
  loadRuntimeGameDataVersion,
  type HuntDefinitionV1,
  type RuntimeGameDataReader,
  type ZoneDefinitionV1,
} from "@pokenexus/game-data/runtime";

export const HUNT_CATALOG_ARTIFACT_BASE_PATH = "/player/hunts/catalog-artifacts/" as const;

export interface HuntCatalogReleaseDescriptor {
  readonly gameDataVersion: string;
  readonly bundleHash: string;
  readonly artifactBasePath: typeof HUNT_CATALOG_ARTIFACT_BASE_PATH;
}

export type HuntCatalogArtifactName = "manifest.json" | "catalogs/zones.json" | "catalogs/hunts.json";

export interface VerifiedHuntCatalogRelease {
  readonly descriptor: HuntCatalogReleaseDescriptor;
  readonly directoryName: string;
  readonly artifacts: Readonly<Record<HuntCatalogArtifactName, Uint8Array>>;
}

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_CATALOG_BYTES = 1024 * 1024;
const MAX_OPTIONS = 512;
const VALID_ARTIFACT_PATH = /^version-[0-9a-f]{64}\/(?:manifest\.json|catalogs\/(?:zones|hunts)\.json)$/u;

function limitFor(path: string): number {
  if (!VALID_ARTIFACT_PATH.test(path)) throw new Error("Unsupported Hunt catalog artifact path");
  return path.endsWith("/manifest.json") ? MAX_MANIFEST_BYTES : MAX_CATALOG_BYTES;
}

function createBoundedOriginReader(baseUrl: string, fetchImpl: typeof fetch): RuntimeGameDataReader {
  const root = new URL(baseUrl);
  const isLoopback = root.hostname === "localhost" || root.hostname === "127.0.0.1" || root.hostname === "[::1]";
  if ((root.protocol !== "https:" && !(root.protocol === "http:" && isLoopback)) ||
    root.username || root.password || root.search || root.hash) {
    throw new Error("Hunt catalog origin must be HTTPS or local loopback without URL credentials");
  }
  if (!root.pathname.endsWith("/")) root.pathname += "/";

  return {
    async read(path) {
      const limit = limitFor(path);
      const url = new URL(path, root);
      if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) {
        throw new Error("Hunt catalog artifact escaped its configured origin");
      }
      const response = await fetchImpl(url, { method: "GET", redirect: "error" });
      if (!response.ok || response.body === null) {
        throw new Error("Hunt catalog artifact is unavailable");
      }
      const contentLength = response.headers.get("Content-Length");
      if (contentLength !== null && (!/^(0|[1-9][0-9]*)$/u.test(contentLength) ||
        BigInt(contentLength) > BigInt(limit))) {
        await response.body.cancel("Hunt catalog artifact exceeds its byte limit");
        throw new Error("Hunt catalog artifact exceeds its byte limit");
      }
      const stream = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await stream.read();
          if (done) break;
          total += value.byteLength;
          if (total > limit) {
            await stream.cancel("Hunt catalog artifact exceeds its byte limit");
            throw new Error("Hunt catalog artifact exceeds its byte limit");
          }
          chunks.push(value);
        }
      } finally {
        stream.releaseLock();
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return bytes;
    },
  };
}

export function validateDisplayCatalog(
  zones: readonly ZoneDefinitionV1[],
  hunts: readonly HuntDefinitionV1[],
): void {
  if (!zones.length || !hunts.length || zones.length > MAX_OPTIONS || hunts.length > MAX_OPTIONS) {
    throw new Error("Hunt catalog has no usable bounded Zone/Hunt choices");
  }
  const zoneIds = new Set<string>();
  for (const zone of zones) {
    if (!zone.id || !zone.displayName || zone.id.length > 512 || zone.displayName.length > 512 ||
      zoneIds.has(zone.id)) {
      throw new Error("Invalid published Zone identity");
    }
    zoneIds.add(zone.id);
  }
  const huntIds = new Set<string>();
  for (const hunt of hunts) {
    if (!hunt.id || !hunt.displayName || hunt.id.length > 512 || hunt.displayName.length > 512 ||
      huntIds.has(hunt.id) || !zoneIds.has(hunt.zoneId)) {
      throw new Error("Invalid published Hunt identity or Zone reference");
    }
    huntIds.add(hunt.id);
  }
}

/** New-operation authority is resolved from the same configured pair used by Hunt Start. */
export async function loadVerifiedHuntCatalogRelease(
  env: PlayerStateEnvironment,
  options: { readonly reader?: RuntimeGameDataReader; readonly fetchImpl?: typeof fetch } = {},
): Promise<VerifiedHuntCatalogRelease> {
  const authorities = createConfiguredMoveAuthorities(env);
  const pair = await authorities.selector.select();
  const [pairRecord, dataRecord, rulesRecord] = await Promise.all([
    authorities.staticContextPairs.resolve(pair),
    authorities.gameDataVersions.resolve(pair.gameDataVersion),
    authorities.rulesVersions.resolve(pair.rulesVersion),
  ]);
  if (!pairRecord?.newOperationsAllowed ||
    pairRecord.compatibility.gameDataVersion !== pair.gameDataVersion ||
    pairRecord.compatibility.rulesVersion !== pair.rulesVersion ||
    dataRecord?.gameDataVersion !== pair.gameDataVersion || !dataRecord.newOperationsAllowed ||
    rulesRecord?.rules.rulesVersion !== pair.rulesVersion || !rulesRecord.newOperationsAllowed ||
    !rulesRecord.rules.productionSelectability) {
    throw new Error("Selected Hunt catalog release is unavailable for new operations");
  }

  const productionSelectability = rulesRecord.rules.productionSelectability;
  const productionCatalog = await createDefaultProductionCombatCatalogResolver().resolve({
    supportProfileArtifactId: productionSelectability.supportProfileArtifactId,
    supportProfileContentHash: productionSelectability.supportProfileContentHash,
    combatRuleCatalogArtifactId: productionSelectability.combatRuleCatalogArtifactId,
    combatRuleCatalogContentHash: productionSelectability.combatRuleCatalogContentHash,
  });
  if (!productionCatalog || productionCatalog.gameDataVersion !== pair.gameDataVersion ||
    productionCatalog.canonicalContentHash !== productionSelectability.combatRuleCatalogContentHash ||
    productionCatalog.profileContentHash !== productionSelectability.supportProfileContentHash ||
    productionCatalog.productionSelectabilityRuleArtifact.artifactId !== productionSelectability.artifactId ||
    productionCatalog.productionSelectabilityRuleArtifact.semanticHash !== productionSelectability.semanticHash) {
    throw new Error("Selected Hunt catalog lacks independently pinned production content");
  }

  const originReader = options.reader ?? createBoundedOriginReader(
    env.PLAYER_STATE_GAME_DATA_BASE_URL ?? "",
    options.fetchImpl ?? fetch,
  );
  const bytesByPath = new Map<string, Uint8Array>();
  const reader: RuntimeGameDataReader = {
    async read(path) {
      const limit = limitFor(path);
      const existing = bytesByPath.get(path);
      if (existing) return existing;
      const bytes = await originReader.read(path);
      if (bytes.byteLength > limit) throw new Error("Hunt catalog artifact exceeds its byte limit");
      bytesByPath.set(path, bytes);
      return bytes;
    },
  };
  const version = await loadRuntimeGameDataVersion(reader, pair.gameDataVersion);
  if ((version.manifest.schemaVersion !== GAME_DATA_SCHEMA_V4 &&
      version.manifest.schemaVersion !== GAME_DATA_SCHEMA_V5) ||
    version.manifest.bundleHash !== productionCatalog.gameDataBundleHash) {
    throw new Error("Hunt catalog manifest does not match the independent production release pin");
  }
  const [zones, hunts] = await Promise.all([
    loadRuntimeGameDataArtifact(reader, version, "catalogs/zones") as Promise<ZoneDefinitionV1[]>,
    loadRuntimeGameDataArtifact(reader, version, "catalogs/hunts") as Promise<HuntDefinitionV1[]>,
  ]);
  validateDisplayCatalog(zones, hunts);

  const requiredBytes = (name: HuntCatalogArtifactName): Uint8Array => {
    const bytes = bytesByPath.get(`${version.directoryName}/${name}`);
    if (!bytes) throw new Error("Verified Hunt catalog artifact is missing");
    return bytes;
  };
  return {
    descriptor: {
      gameDataVersion: pair.gameDataVersion,
      bundleHash: productionCatalog.gameDataBundleHash,
      artifactBasePath: HUNT_CATALOG_ARTIFACT_BASE_PATH,
    },
    directoryName: version.directoryName,
    artifacts: {
      "manifest.json": requiredBytes("manifest.json"),
      "catalogs/zones.json": requiredBytes("catalogs/zones.json"),
      "catalogs/hunts.json": requiredBytes("catalogs/hunts.json"),
    },
  };
}

/** Accept exactly the three published runtime paths; arbitrary origin paths are never proxied. */
export function catalogArtifactName(
  path: string,
  directoryName: string,
): HuntCatalogArtifactName | "release_drift" | null {
  if (!VALID_ARTIFACT_PATH.test(path)) return null;
  if (!path.startsWith(`${directoryName}/`)) return "release_drift";
  const name = path.slice(directoryName.length + 1);
  if (name === "manifest.json" || name === "catalogs/zones.json" || name === "catalogs/hunts.json") {
    return name;
  }
  return null;
}
