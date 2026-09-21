import type { CatalogSurface, ExcludedOrDeferredSourceKey, MappingRegistry } from "./schema.js";
import canonicalMappingRosterData from "./canonical-mapping-roster.json" with { type: "json" };

export const MAPPING_ROSTER_VERSION = "mapping-roster-v1" as const;

export interface LocalMappingRoster {
  version: typeof MAPPING_ROSTER_VERSION;
  mappings: MappingRegistry;
  excludedOrDeferred: Partial<
    Record<CatalogSurface, readonly ExcludedOrDeferredSourceKey[]>
  >;
}

/** Canonical mappings are project-owned local data; published IDs must never be renamed from upstream labels. */
export const LOCAL_MAPPING_ROSTER = canonicalMappingRosterData as unknown as LocalMappingRoster;

export function cloneMappingRegistry(registry: MappingRegistry): MappingRegistry {
  return {
    species: registry.species.map((entry) => ({ ...entry })),
    moves: registry.moves.map((entry) => ({ ...entry })),
    types: registry.types.map((entry) => ({ ...entry })),
    abilities: registry.abilities.map((entry) => ({ ...entry })),
    items: registry.items.map((entry) => ({ ...entry })),
  };
}
