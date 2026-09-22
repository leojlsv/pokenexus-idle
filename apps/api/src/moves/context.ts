import {
  MOVE_ELIGIBILITY_RULE_ARTIFACT_ID,
} from "@pokenexus/game-core";
import {
  loadRuntimeGameDataArtifact,
  loadRuntimeGameDataVersion,
  type LearnsetEntryV1,
  type MoveDefinitionV1,
  type RuntimeGameDataReader,
  type SpeciesDefinitionV2,
} from "@pokenexus/game-data/runtime";
import type {
  ExactGameDataVersionAuthority,
  ExactStaticContextPairAuthority,
  NewOperationStaticContextSelector,
  StaticContextPairRef,
} from "../static-context/authority";

export { MOVE_ELIGIBILITY_RULE_ARTIFACT_ID } from "@pokenexus/game-core";

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
      rules: { ...release.rules },
      newOperationsAllowed: release.newOperationsAllowed,
    });
  }
  return {
    async resolve(rulesVersion) {
      const release = byVersion.get(rulesVersion);
      if (!release) return null;
      return {
        rules: { ...release.rules },
        newOperationsAllowed: release.newOperationsAllowed,
      };
    },
  };
}

export interface MoveEligibilityGameDataCatalog {
  readonly gameDataVersion: string;
  readonly species: readonly SpeciesDefinitionV2[];
  readonly moves: readonly MoveDefinitionV1[];
  readonly learnsets: readonly LearnsetEntryV1[];
}

export interface ExactMoveEligibilityGameDataLoader {
  load(gameDataVersion: string): Promise<MoveEligibilityGameDataCatalog>;
}

export interface MoveEligibilityContext {
  readonly pair: StaticContextPairRef;
  readonly rules: MoveEligibilityRulesDescriptor;
  readonly speciesIds: ReadonlySet<string>;
  readonly moveIds: ReadonlySet<string>;
  readonly learnsetsBySpecies: ReadonlyMap<string, readonly LearnsetEntryV1[]>;
}

export interface MoveEligibilityContextLoader {
  loadForNewOperation(): Promise<MoveEligibilityContext>;
}

export function createRuntimeMoveEligibilityGameDataLoader(
  reader: RuntimeGameDataReader,
): ExactMoveEligibilityGameDataLoader {
  return {
    async load(gameDataVersion) {
      const version = await loadRuntimeGameDataVersion(reader, gameDataVersion);
      const [species, moves, learnsets] = await Promise.all([
        loadRuntimeGameDataArtifact(reader, version, "catalogs/species") as Promise<SpeciesDefinitionV2[]>,
        loadRuntimeGameDataArtifact(reader, version, "catalogs/moves") as Promise<MoveDefinitionV1[]>,
        loadRuntimeGameDataArtifact(reader, version, "catalogs/learnsets") as Promise<LearnsetEntryV1[]>,
      ]);
      return {
        gameDataVersion: version.gameDataVersion,
        species,
        moves,
        learnsets,
      };
    },
  };
}

function assertUniqueIds(
  values: readonly { readonly id: string }[],
  label: "Species" | "Move",
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
}): MoveEligibilityContextLoader {
  return {
    async loadForNewOperation() {
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

      const catalog = await input.gameData.load(pair.gameDataVersion);
      if (catalog.gameDataVersion !== pair.gameDataVersion) {
        throw new Error("Exact game-data loader returned a different gameDataVersion");
      }

      const speciesIds = assertUniqueIds(catalog.species, "Species");
      const moveIds = assertUniqueIds(catalog.moves, "Move");
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

      return {
        pair,
        rules: resolvedRules.rules,
        speciesIds,
        moveIds,
        learnsetsBySpecies,
      };
    },
  };
}
