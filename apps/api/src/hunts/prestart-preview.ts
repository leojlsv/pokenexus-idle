import {
  loadRuntimeGameDataArtifact,
  loadRuntimeGameDataVersion,
  type EncounterDefinitionV1,
  type HuntDefinitionV1,
  type RuntimeGameDataReader,
} from "@pokenexus/game-data/runtime";
import type { PlayerStateEnvironment } from "../player/runtime";
import { loadVerifiedHuntCatalogRelease } from "./catalog-release";

export const HUNT_PRESTART_ENCOUNTER_MAX_RECORDS = 4096;
export const HUNT_PRESTART_ENCOUNTER_MAX_BYTES = 4 * 1024 * 1024;
export const HUNT_PRESTART_SPECIES_MAX = 512;
export const HUNT_PRESTART_ITEMS_MAX = 256;
export const HUNT_PRESTART_RESPONSE_MAX_BYTES = 256 * 1024;

const ENCOUNTER_PATH = /^version-[0-9a-f]{64}\/catalogs\/encounter-definitions\.json$/u;
const encoder = new TextEncoder();

export interface HuntPrestartPreview {
  readonly gameDataVersion: string;
  readonly bundleHash: string;
  readonly huntDefinitionId: string;
  readonly preview: {
    readonly possibleSpeciesIds: readonly string[];
    readonly playerXp: { readonly min: number; readonly max: number } | null;
    readonly pokemonXpPool: { readonly min: number; readonly max: number };
    readonly itemDrops: readonly {
      readonly itemId: string;
      readonly quantity: { readonly min: number; readonly max: number };
      readonly chanceBasisPoints: { readonly min: number; readonly max: number };
    }[];
  };
}

export class HuntPrestartPreviewError extends Error {
  constructor(readonly code: "not_found" | "authority_unavailable", message: string) {
    super(message);
    this.name = "HuntPrestartPreviewError";
  }
}

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function createBoundedEncounterOriginReader(
  baseUrl: string,
  fetchImpl: typeof fetch,
): RuntimeGameDataReader {
  const root = new URL(baseUrl);
  const loopback = root.hostname === "localhost" || root.hostname === "127.0.0.1" || root.hostname === "[::1]";
  if ((root.protocol !== "https:" && !(root.protocol === "http:" && loopback)) ||
    root.username || root.password || root.search || root.hash) {
    throw new Error("Hunt preview origin must be HTTPS or local loopback without URL credentials");
  }
  if (!root.pathname.endsWith("/")) root.pathname += "/";

  return {
    async read(path) {
      if (!ENCOUNTER_PATH.test(path)) throw new Error("Unsupported Hunt preview artifact path");
      const url = new URL(path, root);
      if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) {
        throw new Error("Hunt preview artifact escaped its configured origin");
      }
      const response = await fetchImpl(url, { method: "GET", redirect: "manual" });
      if (!response.ok || response.body === null) throw new Error("Hunt preview artifact is unavailable");
      const contentLength = response.headers.get("Content-Length");
      if (contentLength !== null && (!/^(0|[1-9][0-9]*)$/u.test(contentLength) ||
        BigInt(contentLength) > BigInt(HUNT_PRESTART_ENCOUNTER_MAX_BYTES))) {
        await response.body.cancel("Hunt preview artifact exceeds its byte limit");
        throw new Error("Hunt preview artifact exceeds its byte limit");
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > HUNT_PRESTART_ENCOUNTER_MAX_BYTES) {
            await reader.cancel("Hunt preview artifact exceeds its byte limit");
            throw new Error("Hunt preview artifact exceeds its byte limit");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
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

function boundedInjectedEncounterReader(reader: RuntimeGameDataReader): RuntimeGameDataReader {
  return {
    async read(path) {
      if (!ENCOUNTER_PATH.test(path)) throw new Error("Unsupported Hunt preview artifact path");
      const bytes = await reader.read(path);
      if (bytes.byteLength > HUNT_PRESTART_ENCOUNTER_MAX_BYTES) {
        throw new Error("Hunt preview artifact exceeds its byte limit");
      }
      return bytes;
    },
  };
}

export function projectHuntPrestartPreview(input: {
  readonly gameDataVersion: string;
  readonly bundleHash: string;
  readonly huntDefinitionId: string;
  readonly encounters: readonly EncounterDefinitionV1[];
}): HuntPrestartPreview {
  const huntEncounters = input.encounters.filter(({ huntId }) => huntId === input.huntDefinitionId);
  if (!huntEncounters.length) {
    throw new HuntPrestartPreviewError("authority_unavailable", "Published Hunt has no Encounter definitions");
  }

  const possibleSpeciesIds = [...new Set(huntEncounters.map(({ speciesId }) => speciesId))].sort(compareId);
  if (!possibleSpeciesIds.length || possibleSpeciesIds.length > HUNT_PRESTART_SPECIES_MAX ||
    possibleSpeciesIds.some((id) => !id || id.length > 512)) {
    throw new HuntPrestartPreviewError("authority_unavailable", "Hunt preview Species projection exceeds its contract");
  }

  const playerXpConfigured = huntEncounters.some(({ reward }) => reward.playerXp !== null);
  const playerXpValues = huntEncounters.map(({ reward }) => reward.playerXp ?? 0);
  const pokemonXpValues = huntEncounters.map(({ reward }) => reward.pokemonXpPool);
  for (const encounter of huntEncounters) {
    const itemIds = encounter.reward.itemDrops.map(({ itemId }) => itemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new HuntPrestartPreviewError(
        "authority_unavailable",
        "Hunt preview Encounter contains duplicate Item drop identities",
      );
    }
  }
  const dropIds = new Set(huntEncounters.flatMap(({ reward }) => reward.itemDrops.map(({ itemId }) => itemId)));
  if (dropIds.size > HUNT_PRESTART_ITEMS_MAX) {
    throw new HuntPrestartPreviewError("authority_unavailable", "Hunt preview Item projection exceeds its contract");
  }

  const itemDrops = [...dropIds].sort(compareId).map((itemId) => {
    if (!itemId || itemId.length > 512) {
      throw new HuntPrestartPreviewError("authority_unavailable", "Hunt preview Item identity exceeds its contract");
    }
    const present = huntEncounters.flatMap(({ reward }) =>
      reward.itemDrops.filter((drop) => drop.itemId === itemId));
    const chances = huntEncounters.map(({ reward }) =>
      reward.itemDrops.find((drop) => drop.itemId === itemId)?.chanceBasisPoints ?? 0);
    return {
      itemId,
      quantity: {
        min: Math.min(...present.map(({ quantity }) => quantity)),
        max: Math.max(...present.map(({ quantity }) => quantity)),
      },
      chanceBasisPoints: { min: Math.min(...chances), max: Math.max(...chances) },
    };
  }).filter(({ chanceBasisPoints }) => chanceBasisPoints.max > 0);

  const result: HuntPrestartPreview = {
    gameDataVersion: input.gameDataVersion,
    bundleHash: input.bundleHash,
    huntDefinitionId: input.huntDefinitionId,
    preview: {
      possibleSpeciesIds,
      playerXp: playerXpConfigured
        ? { min: Math.min(...playerXpValues), max: Math.max(...playerXpValues) }
        : null,
      pokemonXpPool: { min: Math.min(...pokemonXpValues), max: Math.max(...pokemonXpValues) },
      itemDrops,
    },
  };
  if (encoder.encode(JSON.stringify(result)).byteLength > HUNT_PRESTART_RESPONSE_MAX_BYTES) {
    throw new HuntPrestartPreviewError("authority_unavailable", "Hunt preview response exceeds its contract");
  }
  return result;
}

export async function loadVerifiedHuntPrestartPreview(
  env: PlayerStateEnvironment,
  huntDefinitionId: string,
  options: { readonly reader?: RuntimeGameDataReader; readonly fetchImpl?: typeof fetch } = {},
): Promise<HuntPrestartPreview> {
  const release = await loadVerifiedHuntCatalogRelease(env, options);
  const encounterSource = options.reader
    ? boundedInjectedEncounterReader(options.reader)
    : createBoundedEncounterOriginReader(env.PLAYER_STATE_GAME_DATA_BASE_URL ?? "", options.fetchImpl ?? fetch);
  const runtimeReader: RuntimeGameDataReader = {
    async read(path) {
      if (path === `${release.directoryName}/manifest.json`) return release.artifacts["manifest.json"];
      if (path === `${release.directoryName}/catalogs/hunts.json`) return release.artifacts["catalogs/hunts.json"];
      if (path === `${release.directoryName}/catalogs/encounter-definitions.json`) return encounterSource.read(path);
      throw new Error("Unsupported Hunt preview runtime artifact path");
    },
  };

  const version = await loadRuntimeGameDataVersion(runtimeReader, release.descriptor.gameDataVersion);
  if (version.directoryName !== release.directoryName || version.manifest.bundleHash !== release.descriptor.bundleHash) {
    throw new Error("Hunt preview release identity drifted from the verified catalog authority");
  }
  const encounterDescriptors = version.manifest.artifacts.filter(({ logicalName }) =>
    logicalName === "catalogs/encounter-definitions");
  if (encounterDescriptors.length !== 1 ||
    encounterDescriptors[0]!.recordCount > HUNT_PRESTART_ENCOUNTER_MAX_RECORDS) {
    throw new Error("Hunt preview Encounter manifest exceeds its record limit");
  }
  const hunts = await loadRuntimeGameDataArtifact(runtimeReader, version, "catalogs/hunts") as HuntDefinitionV1[];
  if (!hunts.some(({ id }) => id === huntDefinitionId)) {
    throw new HuntPrestartPreviewError("not_found", "Hunt is absent from the selected current publication");
  }
  const encounters = await loadRuntimeGameDataArtifact(
    runtimeReader,
    version,
    "catalogs/encounter-definitions",
  ) as EncounterDefinitionV1[];
  return projectHuntPrestartPreview({
    gameDataVersion: release.descriptor.gameDataVersion,
    bundleHash: release.descriptor.bundleHash,
    huntDefinitionId,
    encounters,
  });
}
