import {
  artifactDescriptor,
  canonicalJson,
  type CanonicalArtifact,
} from "./canonical.js";
import type {
  EncounterDefinitionV1,
  HuntDefinitionV1,
  PveContentV1,
  ZoneDefinitionV1,
} from "./pve-content-schema.js";

export const PVE_ARTIFACT_LOGICAL_NAMES = [
  "catalogs/zones",
  "catalogs/hunts",
  "catalogs/encounter-definitions",
] as const;

export type PveArtifactLogicalName = (typeof PVE_ARTIFACT_LOGICAL_NAMES)[number];

function byUtf8Id<T extends { id: string }>(records: readonly T[]): T[] {
  return [...records].sort((left, right) =>
    left.id.localeCompare(right.id, "en", { sensitivity: "variant" }),
  );
}

function normalizePrerequisites<T extends ZoneDefinitionV1 | HuntDefinitionV1>(record: T): T {
  return {
    ...record,
    availability: {
      ...record.availability,
      prerequisiteHuntIds: [...record.availability.prerequisiteHuntIds].sort((left, right) =>
        left.localeCompare(right, "en", { sensitivity: "variant" }),
      ),
    },
  };
}

function normalizeEncounter(record: EncounterDefinitionV1): EncounterDefinitionV1 {
  return {
    ...record,
    reward: {
      ...record.reward,
      itemDrops: [...record.reward.itemDrops].sort((left, right) => {
        const leftKey = `${left.itemId}\u0000${String(left.quantity).padStart(16, "0")}\u0000${String(left.chanceBasisPoints).padStart(16, "0")}`;
        const rightKey = `${right.itemId}\u0000${String(right.quantity).padStart(16, "0")}\u0000${String(right.chanceBasisPoints).padStart(16, "0")}`;
        return leftKey.localeCompare(rightKey, "en", { sensitivity: "variant" });
      }),
    },
  };
}

function artifact(logicalName: PveArtifactLogicalName, records: readonly unknown[]): CanonicalArtifact {
  const bytes = Buffer.from(canonicalJson(records), "utf8");
  return {
    bytes,
    descriptor: artifactDescriptor(logicalName, bytes, records.length),
  };
}

export function canonicalizePveContent(content: PveContentV1): PveContentV1 {
  return {
    zones: byUtf8Id(content.zones).map(normalizePrerequisites),
    hunts: byUtf8Id(content.hunts).map(normalizePrerequisites),
    encounters: byUtf8Id(content.encounters).map(normalizeEncounter),
  };
}

export function canonicalizePveContentArtifacts(content: PveContentV1): {
  zones: CanonicalArtifact;
  hunts: CanonicalArtifact;
  encounters: CanonicalArtifact;
} {
  const normalized = canonicalizePveContent(content);
  return {
    zones: artifact("catalogs/zones", normalized.zones),
    hunts: artifact("catalogs/hunts", normalized.hunts),
    encounters: artifact("catalogs/encounter-definitions", normalized.encounters),
  };
}
