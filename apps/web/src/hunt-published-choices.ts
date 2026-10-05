import {
  GAME_DATA_SCHEMA_V4,
  GAME_DATA_SCHEMA_V5,
  loadRuntimeGameDataArtifact,
  loadRuntimeGameDataVersion,
  type EncounterDefinitionV1,
  type HuntDefinitionV1,
  type RuntimeGameDataReader,
  type RuntimeGameDataVersion,
  type ZoneDefinitionV1,
} from "@pokenexus/game-data/runtime";

const MAX_OPTIONS = 512;
export const PUBLISHED_HUNT_ARTIFACT_BASE_PATH = "/player/hunts/catalog-artifacts/" as const;

export interface PublishedHuntReleaseDescriptor {
  readonly gameDataVersion: string;
  readonly bundleHash: string;
  readonly artifactBasePath: typeof PUBLISHED_HUNT_ARTIFACT_BASE_PATH;
}

export interface PublishedHuntChoice {
  readonly zoneId: string;
  readonly zoneLabel: string;
  readonly huntDefinitionId: string;
  readonly huntLabel: string;
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

export interface PublishedHuntChoices {
  readonly source: "approved_published_content";
  readonly gameDataVersion: string;
  readonly hunts: readonly PublishedHuntChoice[];
}

export function parsePublishedHuntReleaseDescriptor(value: unknown): PublishedHuntReleaseDescriptor {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid published Hunt release descriptor");
  }
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== 3
    || typeof row.gameDataVersion !== "string"
    || !/^[A-Za-z0-9:._-]{1,128}$/u.test(row.gameDataVersion)
    || typeof row.bundleHash !== "string"
    || !/^sha256:[0-9a-f]{64}$/u.test(row.bundleHash)
    || row.artifactBasePath !== PUBLISHED_HUNT_ARTIFACT_BASE_PATH
  ) {
    throw new Error("Invalid published Hunt release descriptor");
  }
  return {
    gameDataVersion: row.gameDataVersion,
    bundleHash: row.bundleHash,
    artifactBasePath: PUBLISHED_HUNT_ARTIFACT_BASE_PATH,
  };
}

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function projectPublishedHuntChoices(input: {
  readonly version: RuntimeGameDataVersion;
  readonly zones: readonly ZoneDefinitionV1[];
  readonly hunts: readonly HuntDefinitionV1[];
  readonly encounters: readonly EncounterDefinitionV1[];
}): readonly PublishedHuntChoice[] {
  const { version, zones, hunts, encounters } = input;
  if (
    (version.manifest.schemaVersion !== GAME_DATA_SCHEMA_V4
      && version.manifest.schemaVersion !== GAME_DATA_SCHEMA_V5)
    || zones.length > MAX_OPTIONS
    || hunts.length > MAX_OPTIONS
    || encounters.length > 4096
  ) {
    throw new Error("Unsupported or oversized published Hunt choice catalog");
  }

  const zoneDescriptor = version.manifest.artifacts.filter(({ logicalName }) => logicalName === "catalogs/zones");
  const huntDescriptor = version.manifest.artifacts.filter(({ logicalName }) => logicalName === "catalogs/hunts");
  const encounterDescriptor = version.manifest.artifacts.filter(({ logicalName }) => logicalName === "catalogs/encounter-definitions");
  if (
    zoneDescriptor.length !== 1
    || huntDescriptor.length !== 1
    || encounterDescriptor.length !== 1
    || zoneDescriptor[0]!.recordCount !== zones.length
    || huntDescriptor[0]!.recordCount !== hunts.length
    || encounterDescriptor[0]!.recordCount !== encounters.length
  ) {
    throw new Error("Published Zone/Hunt counts differ from the manifest");
  }

  const zoneById = new Map<string, ZoneDefinitionV1>();
  for (const zone of zones) {
    if (zoneById.has(zone.id) || !zone.id || !zone.displayName || zone.id.length > 512 || zone.displayName.length > 512) {
      throw new Error("Invalid published Zone display identity");
    }
    zoneById.set(zone.id, zone);
  }

  const huntIds = new Set<string>();
  return hunts.map((hunt) => {
    const zone = zoneById.get(hunt.zoneId);
    if (!zone || huntIds.has(hunt.id) || !hunt.id || !hunt.displayName || hunt.id.length > 512 || hunt.displayName.length > 512) {
      throw new Error("Invalid published Hunt display identity or Zone reference");
    }
    huntIds.add(hunt.id);
    return { zone, hunt };
  }).sort((left, right) =>
    left.zone.displayOrder - right.zone.displayOrder
    || compareId(left.zone.id, right.zone.id)
    || left.hunt.displayOrder - right.hunt.displayOrder
    || compareId(left.hunt.id, right.hunt.id))
    .map(({ zone, hunt }) => {
      const huntEncounters = encounters.filter(({ huntId }) => huntId === hunt.id);
      if (huntEncounters.length === 0) throw new Error("Published Hunt has no Encounter definitions");
      const playerXpValues = huntEncounters.flatMap(({ reward }) => reward.playerXp === null ? [] : [reward.playerXp]);
      const pokemonXpValues = huntEncounters.map(({ reward }) => reward.pokemonXpPool);
      const dropById = new Map<string, { quantities: number[]; chances: number[] }>();
      for (const encounter of huntEncounters) {
        for (const drop of encounter.reward.itemDrops) {
          const existing = dropById.get(drop.itemId) ?? { quantities: [], chances: [] };
          existing.quantities.push(drop.quantity);
          existing.chances.push(drop.chanceBasisPoints);
          dropById.set(drop.itemId, existing);
        }
      }
      return {
        zoneId: zone.id,
        zoneLabel: zone.displayName,
        huntDefinitionId: hunt.id,
        huntLabel: hunt.displayName,
        preview: {
          possibleSpeciesIds: [...new Set(huntEncounters.map(({ speciesId }) => speciesId))].sort(compareId),
          playerXp: playerXpValues.length ? { min: Math.min(...playerXpValues), max: Math.max(...playerXpValues) } : null,
          pokemonXpPool: { min: Math.min(...pokemonXpValues), max: Math.max(...pokemonXpValues) },
          itemDrops: [...dropById.entries()].sort(([left], [right]) => compareId(left, right)).map(([itemId, values]) => ({
            itemId,
            quantity: { min: Math.min(...values.quantities), max: Math.max(...values.quantities) },
            chanceBasisPoints: { min: Math.min(...values.chances), max: Math.max(...values.chances) },
          })),
        },
      };
    });
}

export async function loadPublishedHuntChoices(
  reader: RuntimeGameDataReader,
  descriptor: PublishedHuntReleaseDescriptor,
): Promise<PublishedHuntChoices> {
  const version = await loadRuntimeGameDataVersion(reader, descriptor.gameDataVersion);
  if (version.manifest.bundleHash !== descriptor.bundleHash) {
    throw new Error("Published Hunt bundle does not match the independently pinned descriptor");
  }
  const [zones, hunts, encounters] = await Promise.all([
    loadRuntimeGameDataArtifact(reader, version, "catalogs/zones"),
    loadRuntimeGameDataArtifact(reader, version, "catalogs/hunts"),
    loadRuntimeGameDataArtifact(reader, version, "catalogs/encounter-definitions"),
  ]);
  return {
    source: "approved_published_content",
    gameDataVersion: descriptor.gameDataVersion,
    hunts: projectPublishedHuntChoices({
      version,
      zones: zones as ZoneDefinitionV1[],
      hunts: hunts as HuntDefinitionV1[],
      encounters: encounters as EncounterDefinitionV1[],
    }),
  };
}
