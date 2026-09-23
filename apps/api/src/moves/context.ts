import {
  MOVE_ELIGIBILITY_RULE_ARTIFACT_ID,
  PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID,
  PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH,
  PRODUCTION_COMBAT_RULE_CATALOG_V1,
  PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID,
  PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH,
  PRODUCTION_MOVE_SELECTABILITY_RULE_ARTIFACT_ID,
  PRODUCTION_MOVE_SELECTABILITY_RULE_SEMANTICS_HASH,
  hashCanonicalProductionCombatRuleCatalog,
  validateProductionCombatRuleCatalogAgainstGameData,
  type ProductionCombatRuleCatalog,
} from "@pokenexus/game-core";
import {
  loadRuntimeGameDataArtifact,
  loadRuntimeGameDataVersion,
  type AbilityDefinitionV1,
  type LearnsetEntryV1,
  type MoveDefinitionV1,
  type RuntimeGameDataReader,
  type SpeciesDefinitionV2,
  type TypeDefinitionV1,
} from "@pokenexus/game-data/runtime";
import type {
  ExactGameDataVersionAuthority,
  ExactStaticContextPairAuthority,
  NewOperationStaticContextSelector,
  StaticContextPairRef,
} from "../static-context/authority";

export {
  MOVE_ELIGIBILITY_RULE_ARTIFACT_ID,
  PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID,
  PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH,
  PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID,
  PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH,
  PRODUCTION_MOVE_SELECTABILITY_RULE_ARTIFACT_ID,
  PRODUCTION_MOVE_SELECTABILITY_RULE_SEMANTICS_HASH,
} from "@pokenexus/game-core";

/**
 * SHA-256 of the exact SPEC-010 semantic snapshot independently reviewed and
 * subsequently accepted by the Human Owner under TASK-088.
 */
export const MOVE_ELIGIBILITY_RULE_SEMANTICS_HASH =
  "sha256:810632522a8d12834ad7aec2beb5f2ade3c45f11dcac08dce4d5a43206235363" as const;

export interface MoveEligibilityRulesDescriptor {
  readonly rulesVersion: string;
  readonly moveEligibilityRuleArtifactId: string;
  readonly moveEligibilityRuleSemanticsHash: string;
  readonly productionSelectability?: {
    readonly artifactId: string;
    readonly semanticHash: string;
    readonly supportProfileArtifactId: string;
    readonly supportProfileContentHash: string;
    readonly combatRuleCatalogArtifactId: string;
    readonly combatRuleCatalogContentHash: string;
  };
}

export interface ExactMoveEligibilityRulesVersionResolver {
  resolve(rulesVersion: string): Promise<{
    readonly rules: MoveEligibilityRulesDescriptor;
    readonly newOperationsAllowed: boolean;
  } | null>;
}

export function createConfiguredMoveEligibilityRulesVersionResolver(
  releases: readonly {
    readonly rules: MoveEligibilityRulesDescriptor;
    readonly newOperationsAllowed: boolean;
  }[],
): ExactMoveEligibilityRulesVersionResolver {
  const byVersion = new Map<string, {
    readonly rules: MoveEligibilityRulesDescriptor;
    readonly newOperationsAllowed: boolean;
  }>();
  for (const release of releases) {
    if (byVersion.has(release.rules.rulesVersion)) {
      throw new Error(`Duplicate Move rulesVersion release: ${release.rules.rulesVersion}`);
    }
    byVersion.set(release.rules.rulesVersion, {
      rules: {
        ...release.rules,
        productionSelectability: release.rules.productionSelectability
          ? { ...release.rules.productionSelectability }
          : undefined,
      },
      newOperationsAllowed: release.newOperationsAllowed,
    });
  }
  return {
    async resolve(rulesVersion) {
      const release = byVersion.get(rulesVersion);
      if (!release) return null;
      return {
        rules: {
          ...release.rules,
          productionSelectability: release.rules.productionSelectability
            ? { ...release.rules.productionSelectability }
            : undefined,
        },
        newOperationsAllowed: release.newOperationsAllowed,
      };
    },
  };
}

export interface MoveEligibilityGameDataCatalog {
  readonly gameDataVersion: string;
  readonly gameDataBundleHash: string;
  readonly species: readonly SpeciesDefinitionV2[];
  readonly moves: readonly MoveDefinitionV1[];
  readonly abilities: readonly AbilityDefinitionV1[];
  readonly types: readonly TypeDefinitionV1[];
  readonly learnsets: readonly LearnsetEntryV1[];
}

export interface ExactMoveEligibilityGameDataLoader {
  load(
    gameDataVersion: string,
    options?: { readonly includeProductionFacts: boolean },
  ): Promise<MoveEligibilityGameDataCatalog>;
}

export interface MoveEligibilityContext {
  readonly pair: StaticContextPairRef;
  readonly rules: MoveEligibilityRulesDescriptor;
  readonly speciesIds: ReadonlySet<string>;
  readonly moveIds: ReadonlySet<string>;
  readonly learnsetsBySpecies: ReadonlyMap<string, readonly LearnsetEntryV1[]>;
  readonly productionExecutableMoveIds: readonly string[] | null;
  readonly productionCatalog: ProductionCombatRuleCatalog | null;
}

export interface MoveEligibilityContextLoader {
  loadForNewOperation(): Promise<MoveEligibilityContext>;
}

export class MoveAuthorityUnavailableError extends Error {
  readonly authorityCause: unknown;

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Move authority is unavailable");
    this.name = "MoveAuthorityUnavailableError";
    this.authorityCause = cause;
  }
}

export interface ExactProductionCombatCatalogResolver {
  resolve(input: {
    readonly artifactId: string;
    readonly contentHash: string;
  }): Promise<ProductionCombatRuleCatalog | null>;
}

function productionCatalogKey(artifactId: string, contentHash: string): string {
  return JSON.stringify([artifactId, contentHash]);
}

export function createConfiguredProductionCombatCatalogResolver(
  catalogs: readonly ProductionCombatRuleCatalog[],
): ExactProductionCombatCatalogResolver {
  const byIdentity = new Map<string, ProductionCombatRuleCatalog>();
  const verifiedIdentities = new Set<string>();
  for (const catalog of catalogs) {
    const key = productionCatalogKey(catalog.profileArtifactId, catalog.profileContentHash);
    if (byIdentity.has(key)) throw new Error(`Duplicate production combat catalog: ${catalog.profileArtifactId}`);
    byIdentity.set(key, catalog);
  }
  return {
    async resolve({ artifactId, contentHash }) {
      const key = productionCatalogKey(artifactId, contentHash);
      const catalog = byIdentity.get(key) ?? null;
      if (catalog === null) return null;
      if (!verifiedIdentities.has(key)) {
        const recomputedContentHash = await hashCanonicalProductionCombatRuleCatalog(catalog);
        if (recomputedContentHash !== catalog.canonicalContentHash) {
          throw new Error(`Production combat catalog content hash mismatch: ${catalog.artifactId}`);
        }
        verifiedIdentities.add(key);
      }
      return catalog;
    },
  };
}

const DEFAULT_PRODUCTION_COMBAT_CATALOG_RESOLVER = createConfiguredProductionCombatCatalogResolver([
  PRODUCTION_COMBAT_RULE_CATALOG_V1,
]);

export function createDefaultProductionCombatCatalogResolver(): ExactProductionCombatCatalogResolver {
  return DEFAULT_PRODUCTION_COMBAT_CATALOG_RESOLVER;
}

export function createRuntimeMoveEligibilityGameDataLoader(
  reader: RuntimeGameDataReader,
): ExactMoveEligibilityGameDataLoader {
  return {
    async load(gameDataVersion, options) {
      const version = await loadRuntimeGameDataVersion(reader, gameDataVersion);
      const [species, moves, learnsets] = await Promise.all([
        loadRuntimeGameDataArtifact(reader, version, "catalogs/species") as Promise<SpeciesDefinitionV2[]>,
        loadRuntimeGameDataArtifact(reader, version, "catalogs/moves") as Promise<MoveDefinitionV1[]>,
        loadRuntimeGameDataArtifact(reader, version, "catalogs/learnsets") as Promise<LearnsetEntryV1[]>,
      ]);
      const abilities = options?.includeProductionFacts === true
        ? await loadRuntimeGameDataArtifact(reader, version, "catalogs/abilities") as AbilityDefinitionV1[]
        : [];
      const types = options?.includeProductionFacts === true
        ? await loadRuntimeGameDataArtifact(reader, version, "catalogs/types") as TypeDefinitionV1[]
        : [];
      return {
        gameDataVersion: version.gameDataVersion,
        gameDataBundleHash: version.manifest.bundleHash,
        species,
        moves,
        abilities,
        types,
        learnsets,
      };
    },
  };
}

function assertUniqueIds(
  values: readonly { readonly id: string }[],
  label: "Species" | "Move" | "Ability",
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id)) throw new Error(`Pinned game data contains duplicate ${label}Id: ${value.id}`);
    ids.add(value.id);
  }
  return ids;
}

export function createMoveEligibilityContextLoader(input: {
  readonly selector: NewOperationStaticContextSelector;
  readonly staticContextPairs: ExactStaticContextPairAuthority;
  readonly gameDataVersions: ExactGameDataVersionAuthority;
  readonly rulesVersions: ExactMoveEligibilityRulesVersionResolver;
  readonly gameData: ExactMoveEligibilityGameDataLoader;
  readonly productionCatalogs?: ExactProductionCombatCatalogResolver;
}): MoveEligibilityContextLoader {
  return {
    async loadForNewOperation() {
      try {
        const pair = await input.selector.select();

        const resolvedPair = await input.staticContextPairs.resolve(pair);
        if (
          resolvedPair === null
          || resolvedPair.compatibility.gameDataVersion !== pair.gameDataVersion
          || resolvedPair.compatibility.rulesVersion !== pair.rulesVersion
        ) {
          throw new Error(
            `Static context pair is not exactly resolvable: ${pair.gameDataVersion} + ${pair.rulesVersion}`,
          );
        }
        if (resolvedPair.newOperationsAllowed !== true) {
          throw new Error("Static context pair is deprecated for new Move operations");
        }

        const resolvedRules = await input.rulesVersions.resolve(pair.rulesVersion);
        if (
          resolvedRules === null
          || resolvedRules.rules.rulesVersion !== pair.rulesVersion
        ) {
          throw new Error(`Move rulesVersion is not exactly resolvable: ${pair.rulesVersion}`);
        }
        if (resolvedRules.newOperationsAllowed !== true) {
          throw new Error("Move rulesVersion is deprecated for new Move operations");
        }
        if (
          resolvedRules.rules.moveEligibilityRuleArtifactId !== MOVE_ELIGIBILITY_RULE_ARTIFACT_ID
          || resolvedRules.rules.moveEligibilityRuleSemanticsHash !== MOVE_ELIGIBILITY_RULE_SEMANTICS_HASH
        ) {
          throw new Error("Move rulesVersion does not resolve the accepted Move-eligibility semantics");
        }
        const productionSelectability = resolvedRules.rules.productionSelectability ?? null;
        if (productionSelectability !== null && (
          productionSelectability.artifactId !== PRODUCTION_MOVE_SELECTABILITY_RULE_ARTIFACT_ID
          || productionSelectability.semanticHash !== PRODUCTION_MOVE_SELECTABILITY_RULE_SEMANTICS_HASH
          || productionSelectability.supportProfileArtifactId !== PRODUCTION_COMBAT_SUPPORT_PROFILE_ARTIFACT_ID
          || productionSelectability.supportProfileContentHash !== PRODUCTION_COMBAT_SUPPORT_PROFILE_CONTENT_HASH
          || productionSelectability.combatRuleCatalogArtifactId !== PRODUCTION_COMBAT_RULE_CATALOG_ARTIFACT_ID
          || productionSelectability.combatRuleCatalogContentHash !== PRODUCTION_COMBAT_RULE_CATALOG_CANONICAL_HASH
        )) {
          throw new Error("Move rulesVersion does not resolve the accepted production-selectability semantics");
        }

        const gameDataLifecycle = await input.gameDataVersions.resolve(pair.gameDataVersion);
        if (
          gameDataLifecycle === null
          || gameDataLifecycle.gameDataVersion !== pair.gameDataVersion
        ) {
          throw new Error(`gameDataVersion is not exactly resolvable: ${pair.gameDataVersion}`);
        }
        if (gameDataLifecycle.newOperationsAllowed !== true) {
          throw new Error("gameDataVersion is deprecated for new Move operations");
        }

        const catalog = productionSelectability === null
          ? await input.gameData.load(pair.gameDataVersion)
          : await input.gameData.load(pair.gameDataVersion, { includeProductionFacts: true });
        if (catalog.gameDataVersion !== pair.gameDataVersion) {
          throw new Error("Exact game-data loader returned a different gameDataVersion");
        }

        const speciesIds = assertUniqueIds(catalog.species, "Species");
        const moveIds = assertUniqueIds(catalog.moves, "Move");
        if (productionSelectability !== null) {
          const abilityIds = assertUniqueIds(catalog.abilities, "Ability");
          for (const species of catalog.species) {
            for (const assignment of species.abilities) {
              if (!abilityIds.has(assignment.abilityId)) {
                throw new Error(`Species references unresolved AbilityId: ${assignment.abilityId}`);
              }
            }
          }
        }
        const learnsetsBySpecies = new Map<string, LearnsetEntryV1[]>();
        for (const row of catalog.learnsets) {
          if (!speciesIds.has(row.speciesId)) {
            throw new Error(`Learnset references unresolved SpeciesId: ${row.speciesId}`);
          }
          if (!moveIds.has(row.moveId)) {
            throw new Error(`Learnset references unresolved MoveId: ${row.moveId}`);
          }
          const rows = learnsetsBySpecies.get(row.speciesId);
          if (rows) rows.push(row);
          else learnsetsBySpecies.set(row.speciesId, [row]);
        }

        let productionCatalog: ProductionCombatRuleCatalog | null = null;
        if (productionSelectability !== null) {
          if (!input.productionCatalogs) throw new Error("Production combat catalog authority is unavailable");
          productionCatalog = await input.productionCatalogs.resolve({
            artifactId: productionSelectability.supportProfileArtifactId,
            contentHash: productionSelectability.supportProfileContentHash,
          });
          if (productionCatalog === null) throw new Error("Production combat support profile is not exactly resolvable");
          if (
            productionCatalog.productionSelectabilityRuleArtifact.artifactId !== productionSelectability.artifactId
            || productionCatalog.productionSelectabilityRuleArtifact.semanticHash !== productionSelectability.semanticHash
            || productionCatalog.artifactId !== productionSelectability.combatRuleCatalogArtifactId
            || productionCatalog.canonicalContentHash !== productionSelectability.combatRuleCatalogContentHash
          ) {
            throw new Error("Production combat catalog does not resolve the selected production-selectability artifact");
          }
          validateProductionCombatRuleCatalogAgainstGameData(productionCatalog, {
            gameDataVersion: catalog.gameDataVersion,
            gameDataBundleHash: catalog.gameDataBundleHash,
            species: catalog.species,
            moves: catalog.moves,
            abilities: catalog.abilities,
            types: catalog.types,
            learnsets: catalog.learnsets,
          });
        }

        return {
          pair,
          rules: resolvedRules.rules,
          speciesIds,
          moveIds,
          learnsetsBySpecies,
          productionExecutableMoveIds: productionCatalog?.executableMoveIds ?? null,
          productionCatalog,
        };
      } catch (error) {
        if (error instanceof MoveAuthorityUnavailableError) throw error;
        throw new MoveAuthorityUnavailableError(error);
      }
    },
  };
}
