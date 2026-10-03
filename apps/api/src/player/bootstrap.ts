import {
  commitPlayerBootstrap,
  withPgClient,
  type CommitPlayerBootstrapInput,
  type CommitPlayerBootstrapResult,
} from "@pokenexus/database";
import {
  GENETIC_COMBAT_RULES_VERSION_V1,
  MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1,
  deriveLevelAvailableMoves,
  deriveMaxHpForRulesVersion,
  individualizeEncounter,
  type EncounterIndividualizationAuthority,
  type GeneticProfile,
} from "@pokenexus/game-core";
import { PREALPHA_ITEM_IDS } from "@pokenexus/game-data/runtime";
import type { MoveEligibilityContextLoader } from "../moves/context";

export const PLAYER_BOOTSTRAP_CONTENT_VERSION = "player-bootstrap-prealpha-v1" as const;

export const PREALPHA_POKE_BALL_ITEM_ID = PREALPHA_ITEM_IDS.standardPokeBall;
export const PREALPHA_BASIC_POTION_ITEM_ID = PREALPHA_ITEM_IDS.basicPotion;
export const PREALPHA_REVIVE_25_ITEM_ID = PREALPHA_ITEM_IDS.revive25;

export const PREALPHA_INITIAL_INVENTORY = Object.freeze([
  Object.freeze({ itemId: PREALPHA_POKE_BALL_ITEM_ID, quantity: 50n }),
  Object.freeze({ itemId: PREALPHA_BASIC_POTION_ITEM_ID, quantity: 20n }),
  Object.freeze({ itemId: PREALPHA_REVIVE_25_ITEM_ID, quantity: 5n }),
] as const);

export const PREALPHA_STARTER_LOADOUTS = Object.freeze({
  "candidate:species:pokedex-bulbasaur-1:91b07648a3": Object.freeze([
    "candidate:move:growl:7d61e39e75",
    "candidate:move:tackle:ceab38a5be",
  ]),
  "candidate:species:pokedex-charmander-4:76e12e8c3b": Object.freeze([
    "candidate:move:growl:7d61e39e75",
    "candidate:move:scratch:5a9cb6b54e",
  ]),
  "candidate:species:pokedex-squirtle-7:6f5ada4df3": Object.freeze([
    "candidate:move:tackle:ceab38a5be",
    "candidate:move:tail-whip:24951e6804",
  ]),
  "candidate:species:pokedex-chikorita-152:24bd4cdb1d": Object.freeze([
    "candidate:move:growl:7d61e39e75",
    "candidate:move:tackle:ceab38a5be",
  ]),
  "candidate:species:pokedex-cyndaquil-155:f879aca845": Object.freeze([
    "candidate:move:leer:f13f8e16a9",
    "candidate:move:tackle:ceab38a5be",
  ]),
  "candidate:species:pokedex-totodile-158:f3d3f9a1f7": Object.freeze([
    "candidate:move:leer:f13f8e16a9",
    "candidate:move:scratch:5a9cb6b54e",
  ]),
} as const);

export const PLAYER_BOOTSTRAP_CONTENT_AUTHORITY = Object.freeze({
  version: PLAYER_BOOTSTRAP_CONTENT_VERSION,
  starters: Object.freeze(
    Object.entries(PREALPHA_STARTER_LOADOUTS)
      .sort(([left], [right]) => left.localeCompare(right, "en", { sensitivity: "variant" }))
      .map(([speciesId, moveIds]) => Object.freeze({
        speciesId,
        moveIds: Object.freeze([...moveIds]),
      })),
  ),
  inventory: Object.freeze(
    [...PREALPHA_INITIAL_INVENTORY]
      .sort((left, right) => left.itemId.localeCompare(right.itemId, "en", { sensitivity: "variant" }))
      .map(({ itemId, quantity }) => Object.freeze({ itemId, quantity: quantity.toString() })),
  ),
});

export const PLAYER_BOOTSTRAP_CONTENT_HASH =
  "sha256:07c12e90845a8073323a59a4261b0c0e213c77912e5402a44342e43a764e459e" as const;

export type PrealphaStarterSpeciesId = keyof typeof PREALPHA_STARTER_LOADOUTS;

export interface PlayerBootstrapRepository {
  commit(input: CommitPlayerBootstrapInput): Promise<CommitPlayerBootstrapResult>;
}

export interface StarterGeneticProfileAuthority {
  resolve(input: {
    readonly gameDataVersion: string;
    readonly rulesVersion: string;
    readonly speciesId: PrealphaStarterSpeciesId;
  }): Promise<readonly [GeneticProfile, GeneticProfile] | null>;
}

export interface StarterIndividualizationAuthorityProvider {
  loadForNewOperation(): Promise<EncounterIndividualizationAuthority>;
}

export type PlayerBootstrapApplicationResult =
  | CommitPlayerBootstrapResult
  | {
      readonly status: "invalid_starter";
    }
  | {
      readonly status: "authority_unavailable";
      readonly reason:
        | "starter_species"
        | "starter_moves"
        | "production_moves"
        | "genetic_profiles"
        | "max_hp";
    };

export function createPgPlayerBootstrapRepository(connectionString: string): PlayerBootstrapRepository {
  return {
    commit(input) {
      return withPgClient({ connectionString }, (client) => commitPlayerBootstrap(client, input));
    },
  };
}

function isStarterSpeciesId(value: string): value is PrealphaStarterSpeciesId {
  return Object.prototype.hasOwnProperty.call(PREALPHA_STARTER_LOADOUTS, value);
}

function progressCapableMove(
  context: Awaited<ReturnType<MoveEligibilityContextLoader["loadForNewOperation"]>>,
  moveId: string,
): boolean {
  const rule = context.productionCatalog?.moveRules[moveId];
  return rule !== undefined
    && (rule.category === "physical" || rule.category === "special")
    && typeof rule.power === "number"
    && rule.power > 0;
}

export class PlayerBootstrapApplicationService {
  constructor(
    private readonly repository: PlayerBootstrapRepository,
    private readonly contextLoader: MoveEligibilityContextLoader,
    private readonly profileAuthority: StarterGeneticProfileAuthority,
    private readonly individualizationAuthority: StarterIndividualizationAuthorityProvider,
  ) {}

  async bootstrap(input: {
    readonly playerId: string;
    readonly starterSpeciesId: string;
    readonly now: Date;
  }): Promise<PlayerBootstrapApplicationResult> {
    if (!isStarterSpeciesId(input.starterSpeciesId)) return { status: "invalid_starter" };

    const context = await this.contextLoader.loadForNewOperation();
    const species = context.speciesById.get(input.starterSpeciesId);
    if (!species) return { status: "authority_unavailable", reason: "starter_species" };

    const moveIds = PREALPHA_STARTER_LOADOUTS[input.starterSpeciesId];
    let available: ReadonlySet<string>;
    try {
      available = new Set(deriveLevelAvailableMoves({
        speciesId: input.starterSpeciesId,
        currentLevel: 1,
        learnset: context.learnsetsBySpecies.get(input.starterSpeciesId) ?? [],
      }).map(({ moveId }) => moveId));
    } catch {
      return { status: "authority_unavailable", reason: "starter_moves" };
    }
    if (moveIds.some((moveId) => !context.moveIds.has(moveId) || !available.has(moveId))) {
      return { status: "authority_unavailable", reason: "starter_moves" };
    }
    if (
      context.productionExecutableMoveIds === null
      || context.productionCatalog === null
      || moveIds.some((moveId) => !context.productionExecutableMoveIds!.includes(moveId))
      || !moveIds.some((moveId) => progressCapableMove(context, moveId))
    ) {
      return { status: "authority_unavailable", reason: "production_moves" };
    }

    const compatibleProfiles = await this.profileAuthority.resolve({
      gameDataVersion: context.pair.gameDataVersion,
      rulesVersion: context.pair.rulesVersion,
      speciesId: input.starterSpeciesId,
    });
    if (!compatibleProfiles) return { status: "authority_unavailable", reason: "genetic_profiles" };
    const authority = await this.individualizationAuthority.loadForNewOperation();
    const snapshot = individualizeEncounter({
      pendingSelectionIdentity: `player-bootstrap-starter-v1:${input.playerId}`,
      speciesId: input.starterSpeciesId as never,
      level: 1,
      compatibleProfiles,
      authority,
    });
    const geneticAware = context.pair.rulesVersion === GENETIC_COMBAT_RULES_VERSION_V1
      || context.pair.rulesVersion === MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1;
    const maxHp = deriveMaxHpForRulesVersion(
      context.pair.rulesVersion as never,
      species.baseStats,
      snapshot.ivs,
      1,
      geneticAware ? snapshot.birthGeneticBonuses : undefined,
    );
    if (maxHp === undefined) return { status: "authority_unavailable", reason: "max_hp" };

    return this.repository.commit({
      playerId: input.playerId,
      rulesVersion: context.pair.rulesVersion,
      pokemon: {
        speciesId: input.starterSpeciesId,
        level: 1,
        ivs: snapshot.ivs,
        totalExperience: 0n,
        geneticScore: snapshot.geneticScore,
        compatibleProfiles: snapshot.compatibleProfiles,
        birthProfile: snapshot.birthProfile,
        shiny: snapshot.shiny,
        individualizationRulesVersion: snapshot.individualizationRulesVersion,
        derivationAuthorityVersion: snapshot.derivationAuthorityVersion,
        derivationAuthorityKeyId: snapshot.derivationAuthorityKeyId,
        originIdentity: snapshot.pendingSelectionIdentity,
        individualizationSnapshotIdentity: snapshot.individualizationSnapshotIdentity,
        individualizationSnapshotCommitment: snapshot.individualizationSnapshotCommitment,
        contentVersion: PLAYER_BOOTSTRAP_CONTENT_VERSION,
        contentHash: PLAYER_BOOTSTRAP_CONTENT_HASH,
        gameDataVersion: context.pair.gameDataVersion,
        selectedAbilityId: null,
        moveIds,
        initialCurrentHp: maxHp,
      },
      inventoryGrants: PREALPHA_INITIAL_INVENTORY,
      now: input.now,
    });
  }
}
