import {
  claimRewardResolution,
  claimRewardResolutionInTransaction,
  grantInventoryEntriesInTransaction,
  ensureAndLockPlayerHuntRoot,
  initializeAndReconcilePokemonVitalitiesInTransaction,
  insertRewardCompletion,
  loadHuntInputAuthority,
  loadInventory,
  loadOwnedPokemon,
  loadOwnedPokemonProgression,
  loadPlayerProgression,
  loadPokemonVitality,
  loadRewardResolutionById,
  loadRewardResolutionBySourceKey,
  reconcilePokemonVitalityMaxHpInTransaction,
  updateOwnedPokemonProgression,
  updatePlayerProgression,
  withPgClient,
  withTransaction,
  type RewardResolutionEnvelope,
  type RewardResolutionRecord,
  type TransactionClient,
} from "@pokenexus/database";
import {
  GENETIC_COMBAT_RULES_VERSION_V1,
  PLAYER_PROGRESSION_RULE_ID,
  POKEMON_PROGRESSION_RULE_ID,
  allocateGeneticBudget,
  deriveMaxHpForRulesVersion,
  evaluatePlayerXpGrant,
  evaluatePokemonXpGrant,
  geneticBudgetForScore,
  type GeneticProfile,
  type PlayerXpGrantResult,
  type PokemonXpGrantResult,
  type StatBlock,
} from "@pokenexus/game-core";
import {
  authoredItemIdsForRuntimeGameData,
  loadRuntimeGameDataArtifact,
  loadRuntimeGameDataVersion,
  type ItemDefinitionV1,
  type RuntimeGameDataReader,
} from "@pokenexus/game-data/runtime";
import type {
  ExactGameDataVersionAuthority,
  ExactStaticContextPairAuthority,
  StaticContextPairCompatibilityRecord,
} from "../static-context/authority";

export type {
  ExactGameDataVersionAuthority,
  ExactStaticContextPairAuthority,
  StaticContextPairAuthorityResolution,
  StaticContextPairCompatibilityRecord,
  StaticContextPairRef,
} from "../static-context/authority";

export interface PinnedProgressionRules {
  readonly rulesVersion: string;
  readonly pokemonProgressionRuleId: string | null;
  readonly playerProgressionRuleId: string | null;
}

export interface PinnedRewardContext {
  readonly rulesVersion: string | null;
  readonly gameDataVersion: string | null;
  readonly staticContextPairCompatibility: StaticContextPairCompatibilityRecord | null;
  readonly staticContextPairNewOperationsAllowed: boolean | null;
  readonly rulesVersionNewOperationsAllowed: boolean | null;
  readonly gameDataVersionNewOperationsAllowed: boolean | null;
  readonly progressionRules: PinnedProgressionRules;
  readonly itemIds: ReadonlySet<string>;
  readonly speciesBaseStatsById: ReadonlyMap<string, StatBlock<number>>;
}

export interface PinnedRewardContextLoader {
  load(envelope: RewardResolutionEnvelope): Promise<PinnedRewardContext>;
}

export interface ExactRulesVersionResolver {
  resolve(rulesVersion: string): Promise<{
    readonly rules: PinnedProgressionRules;
    readonly newOperationsAllowed: boolean;
  } | null>;
}

export function createRuntimePinnedRewardContextLoader(input: {
  readonly gameDataReader: RuntimeGameDataReader;
  readonly gameDataVersions: ExactGameDataVersionAuthority;
  readonly rules: ExactRulesVersionResolver;
  readonly staticContextPairs: ExactStaticContextPairAuthority;
}): PinnedRewardContextLoader {
  return {
    async load(envelope) {
      const needsRules = envelope.effects.some(
        (effect) => effect.kind === "pokemon_xp" || effect.kind === "player_xp",
      );
      const needsPokemonXp = envelope.effects.some((effect) => effect.kind === "pokemon_xp");
      const needsItems = envelope.effects.some((effect) => effect.kind === "item_grant");
      let staticContextPairCompatibility: StaticContextPairCompatibilityRecord | null = null;
      let staticContextPairNewOperationsAllowed: boolean | null = null;
      let rulesVersionNewOperationsAllowed: boolean | null = null;
      let gameDataVersionNewOperationsAllowed: boolean | null = null;

      if (envelope.rulesVersion !== null && envelope.gameDataVersion !== null) {
        const requestedPair = {
          gameDataVersion: envelope.gameDataVersion,
          rulesVersion: envelope.rulesVersion,
        };
        const resolvedPair = await input.staticContextPairs.resolve(requestedPair);
        if (
          resolvedPair === null
          || resolvedPair.compatibility.gameDataVersion !== requestedPair.gameDataVersion
          || resolvedPair.compatibility.rulesVersion !== requestedPair.rulesVersion
          || typeof resolvedPair.newOperationsAllowed !== "boolean"
        ) {
          throw new Error(
            `Static context pair is not exactly resolvable: ${requestedPair.gameDataVersion} + ${requestedPair.rulesVersion}`,
          );
        }
        staticContextPairCompatibility = resolvedPair.compatibility;
        staticContextPairNewOperationsAllowed = resolvedPair.newOperationsAllowed;
      }

      let progressionRules: PinnedProgressionRules = {
        rulesVersion: envelope.rulesVersion ?? "",
        pokemonProgressionRuleId: null,
        playerProgressionRuleId: null,
      };
      if (needsRules) {
        if (envelope.rulesVersion === null) {
          throw new Error("Reward progression effects require an exact pinned rulesVersion");
        }
        const resolved = await input.rules.resolve(envelope.rulesVersion);
        if (!resolved) throw new Error(`Pinned rulesVersion is unavailable: ${envelope.rulesVersion}`);
        if (
          resolved.rules.rulesVersion !== envelope.rulesVersion
          || typeof resolved.newOperationsAllowed !== "boolean"
        ) {
          throw new Error("Exact rulesVersion resolver returned a different rules version");
        }
        progressionRules = resolved.rules;
        rulesVersionNewOperationsAllowed = resolved.newOperationsAllowed;
      }

      const itemIds = new Set<string>();
      const speciesBaseStatsById = new Map<string, StatBlock<number>>();
      if (needsItems || (needsPokemonXp && envelope.gameDataVersion !== null)) {
        if (envelope.gameDataVersion === null) {
          throw new Error("Item reward effects require an exact pinned gameDataVersion");
        }
        const gameDataLifecycle = await input.gameDataVersions.resolve(envelope.gameDataVersion);
        if (
          gameDataLifecycle === null
          || gameDataLifecycle.gameDataVersion !== envelope.gameDataVersion
          || typeof gameDataLifecycle.newOperationsAllowed !== "boolean"
        ) {
          throw new Error(`Pinned gameDataVersion is unavailable: ${envelope.gameDataVersion}`);
        }
        gameDataVersionNewOperationsAllowed = gameDataLifecycle.newOperationsAllowed;
        const version = await loadRuntimeGameDataVersion(input.gameDataReader, envelope.gameDataVersion);
        if (needsItems) {
          const items = await loadRuntimeGameDataArtifact(
            input.gameDataReader,
            version,
            "catalogs/items",
          ) as ItemDefinitionV1[];
          for (const item of items) itemIds.add(item.id);
          for (const itemId of authoredItemIdsForRuntimeGameData({
            gameDataVersion: version.gameDataVersion,
            bundleHash: version.manifest.bundleHash,
          })) {
            itemIds.add(itemId);
          }
        }
        if (needsPokemonXp) {
          const species = await loadRuntimeGameDataArtifact(
            input.gameDataReader,
            version,
            "catalogs/species",
          ) as Array<{ readonly id: string; readonly baseStats: StatBlock<number> }>;
          for (const entry of species) speciesBaseStatsById.set(entry.id, entry.baseStats);
        }
      }

      return {
        rulesVersion: envelope.rulesVersion,
        gameDataVersion: envelope.gameDataVersion,
        staticContextPairCompatibility,
        staticContextPairNewOperationsAllowed,
        rulesVersionNewOperationsAllowed,
        gameDataVersionNewOperationsAllowed,
        progressionRules,
        itemIds,
        speciesBaseStatsById,
      };
    },
  };
}

function deriveProgressionMaxHp(
  context: PinnedRewardContext,
  pokemon: NonNullable<Awaited<ReturnType<typeof loadOwnedPokemon>>>,
  level: bigint,
): number {
  const baseStats = context.speciesBaseStatsById.get(pokemon.speciesId);
  if (!baseStats) {
    throw new RewardApplicationError(
      `Pinned game data does not resolve Pokémon Species for vitality reconciliation: ${pokemon.speciesId}`,
    );
  }
  const numericLevel = Number(level);
  const geneticBonuses = context.progressionRules.rulesVersion === GENETIC_COMBAT_RULES_VERSION_V1
    ? allocateGeneticBudget(
        geneticBudgetForScore(pokemon.individualization.geneticScore),
        pokemon.individualization.expressedProfile as GeneticProfile,
      )
    : undefined;
  const maxHp = deriveMaxHpForRulesVersion(
    context.progressionRules.rulesVersion as never,
    baseStats,
    pokemon.ivs,
    numericLevel,
    geneticBonuses,
  );
  if (maxHp === undefined) {
    throw new RewardApplicationError(
      `Pinned rules cannot derive Pokémon max HP for vitality reconciliation: ${pokemon.pokemonInstanceId}`,
    );
  }
  return maxHp;
}

export class RewardApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RewardApplicationError";
  }
}

export class RewardApplicationStaleError extends RewardApplicationError {
  constructor() {
    super("Reward application observed stale aggregate state");
    this.name = "RewardApplicationStaleError";
  }
}

export type RewardApplicationResult =
  | { readonly status: "not_found" }
  | {
    readonly status: "completed";
    readonly resolutionId: string;
    readonly completionId: string;
    readonly completedAt: Date;
    readonly replayed: boolean;
  }
  | { readonly status: "stale"; readonly resolutionId: string };

function validatePinnedContext(
  envelope: RewardResolutionEnvelope,
  context: PinnedRewardContext,
  purpose: "new_resolution" | "historical_application",
): void {
  if (context.rulesVersion !== envelope.rulesVersion || context.gameDataVersion !== envelope.gameDataVersion) {
    throw new RewardApplicationError("Pinned reward context does not match the immutable Resolution context");
  }
  if (envelope.rulesVersion !== null && envelope.gameDataVersion !== null) {
    if (
      context.staticContextPairCompatibility === null
      || context.staticContextPairCompatibility.rulesVersion !== envelope.rulesVersion
      || context.staticContextPairCompatibility.gameDataVersion !== envelope.gameDataVersion
    ) {
      throw new RewardApplicationError(
        "Pinned reward context lacks an exactly resolvable static-context pair",
      );
    }
    if (
      purpose === "new_resolution"
      && context.staticContextPairNewOperationsAllowed !== true
    ) {
      throw new RewardApplicationError(
        "Pinned static-context pair is deprecated for new authoritative operations",
      );
    }
  }
  if (purpose === "new_resolution") {
    const needsRules = envelope.effects.some(
      (effect) => effect.kind === "pokemon_xp" || effect.kind === "player_xp",
    );
    const needsItems = envelope.effects.some((effect) => effect.kind === "item_grant");
    if (needsRules && context.rulesVersionNewOperationsAllowed !== true) {
      throw new RewardApplicationError("Pinned rulesVersion is deprecated for new authoritative operations");
    }
    if (needsItems && context.gameDataVersionNewOperationsAllowed !== true) {
      throw new RewardApplicationError("Pinned gameDataVersion is deprecated for new authoritative operations");
    }
  }
  for (const effect of envelope.effects) {
    if (
      effect.kind === "pokemon_xp"
      && context.progressionRules.pokemonProgressionRuleId !== POKEMON_PROGRESSION_RULE_ID
    ) {
      throw new RewardApplicationError("Pinned rules do not resolve the accepted Pokémon progression semantics");
    }
    if (
      effect.kind === "player_xp"
      && context.progressionRules.playerProgressionRuleId !== PLAYER_PROGRESSION_RULE_ID
    ) {
      throw new RewardApplicationError("Pinned rules do not resolve the accepted Player progression semantics");
    }
    if (effect.kind === "item_grant" && !context.itemIds.has(effect.itemId)) {
      throw new RewardApplicationError(`ItemId is absent from pinned game data: ${effect.itemId}`);
    }
  }
}

function completionResult(
  resolution: RewardResolutionRecord,
  replayed: boolean,
): RewardApplicationResult {
  if (!resolution.completion) throw new Error("completionResult requires a completed Resolution");
  return {
    status: "completed",
    resolutionId: resolution.resolutionId,
    completionId: resolution.completion.completionId,
    completedAt: resolution.completion.completedAt,
    replayed,
  };
}

export class RewardApplicationService {
  constructor(
    private readonly connectionString: string,
    private readonly contextLoader: PinnedRewardContextLoader,
  ) {}

  async claimResolution(
    envelope: RewardResolutionEnvelope,
    transaction?: TransactionClient,
  ): Promise<{ readonly status: "created" | "existing"; readonly resolution: RewardResolutionRecord }> {
    const claim = async (client: TransactionClient) => {
      const existing = await loadRewardResolutionBySourceKey(client, envelope);
      if (existing) return transaction
        ? claimRewardResolutionInTransaction(client, envelope)
        : claimRewardResolution(client, envelope);
      const pinnedContext = await this.contextLoader.load(envelope);
      validatePinnedContext(envelope, pinnedContext, "new_resolution");
      return transaction
        ? claimRewardResolutionInTransaction(client, envelope)
        : claimRewardResolution(client, envelope);
    };
    return transaction
      ? claim(transaction)
      : withPgClient({ connectionString: this.connectionString }, claim);
  }

  async applyResolution(
    resolutionId: string,
    transaction?: TransactionClient,
  ): Promise<RewardApplicationResult> {
    const initial = transaction
      ? await loadRewardResolutionById(transaction, resolutionId)
      : await withPgClient({ connectionString: this.connectionString }, (client) =>
          loadRewardResolutionById(client, resolutionId));
    if (!initial) return { status: "not_found" };
    if (initial.completion) return completionResult(initial, true);

    const pinnedContext = await this.contextLoader.load(initial);
    validatePinnedContext(initial, pinnedContext, "historical_application");

    const apply = async (client: TransactionClient): Promise<RewardApplicationResult> => {
      let activeHistoricalHunt = false;
      if (initial.effects.some((effect) => effect.kind === "pokemon_xp")) {
        const root = await ensureAndLockPlayerHuntRoot(client, initial.subjectPlayerId);
        if (!root) throw new RewardApplicationError("Reward subject Player no longer exists");
        if (root.activeHuntId !== null) {
          const authority = await loadHuntInputAuthority(
            client,
            initial.subjectPlayerId,
            root.activeHuntId,
          );
          if (!authority) {
            throw new RewardApplicationError("Active Hunt input authority is unavailable");
          }
          const schemaVersion = authority.runtimeInputsJson.schemaVersion;
          if (schemaVersion === "hunt-runtime-inputs-v1") {
            activeHistoricalHunt = true;
          } else if (schemaVersion !== "hunt-runtime-inputs-v2") {
            throw new RewardApplicationError("Active Hunt vitality semantics are unsupported");
          }
        }
      }
      const resolution = await loadRewardResolutionById(client, resolutionId, true);
      if (!resolution) return { status: "not_found" };
      if (resolution.completion) return completionResult(resolution, true);
      validatePinnedContext(resolution, pinnedContext, "historical_application");

      const playerEffect = resolution.effects.find((effect) => effect.kind === "player_xp");
      const pokemonEffects = resolution.effects
        .filter((effect): effect is Extract<(typeof resolution.effects)[number], { kind: "pokemon_xp" }> =>
          effect.kind === "pokemon_xp")
        .sort((left, right) => left.pokemonInstanceId < right.pokemonInstanceId ? -1 : left.pokemonInstanceId > right.pokemonInstanceId ? 1 : 0);
      const itemEffects = resolution.effects.filter(
        (effect): effect is Extract<(typeof resolution.effects)[number], { kind: "item_grant" }> =>
          effect.kind === "item_grant",
      );

      let playerState: Awaited<ReturnType<typeof loadPlayerProgression>> = null;
      if (playerEffect) {
        playerState = await loadPlayerProgression(client, resolution.subjectPlayerId, true);
        if (!playerState) throw new RewardApplicationError("Reward subject Player no longer exists");
      }

      const pokemonStates = new Map<string, NonNullable<Awaited<ReturnType<typeof loadOwnedPokemonProgression>>>>();
      const pokemonConfigs = new Map<string, NonNullable<Awaited<ReturnType<typeof loadOwnedPokemon>>>>();
      for (const effect of pokemonEffects) {
        const state = await loadOwnedPokemonProgression(
          client,
          resolution.subjectPlayerId,
          effect.pokemonInstanceId,
          true,
        );
        if (!state) {
          throw new RewardApplicationError(
            `Pokémon target is missing or not owned by Reward subject: ${effect.pokemonInstanceId}`,
          );
        }
        pokemonStates.set(effect.pokemonInstanceId, state);
        const config = await loadOwnedPokemon(client, resolution.subjectPlayerId, effect.pokemonInstanceId);
        if (!config || config.rowVersion !== state.rowVersion) {
          throw new RewardApplicationStaleError();
        }
        pokemonConfigs.set(effect.pokemonInstanceId, config);
      }

      const inventoryState = itemEffects.length > 0
        ? await loadInventory(client, resolution.subjectPlayerId, true)
        : null;
      if (itemEffects.length > 0 && !inventoryState) {
        throw new RewardApplicationError("Reward subject Inventory does not exist");
      }

      const pokemonResults = new Map<string, PokemonXpGrantResult>();
      for (const effect of pokemonEffects) {
        const state = pokemonStates.get(effect.pokemonInstanceId);
        if (!state) throw new Error("Locked Pokémon state was lost during application");
        pokemonResults.set(effect.pokemonInstanceId, evaluatePokemonXpGrant({
          ruleId: pinnedContext.progressionRules.pokemonProgressionRuleId ?? "",
          current: { level: state.level, totalExperience: state.totalExperience },
          xpAmount: effect.amount,
        }));
      }

      let playerResult: PlayerXpGrantResult | null = null;
      if (playerEffect && playerState) {
        playerResult = evaluatePlayerXpGrant({
          ruleId: pinnedContext.progressionRules.playerProgressionRuleId ?? "",
          current: { level: playerState.level, totalExperience: playerState.totalExperience },
          xpAmount: playerEffect.amount,
        });
      }

      const now = new Date();
      if (playerState && playerResult?.changed) {
        const updated = await updatePlayerProgression(client, {
          playerId: playerState.playerId,
          expectedRowVersion: playerState.rowVersion,
          level: playerResult.level,
          totalExperience: playerResult.totalExperience,
          now,
        });
        if (!updated) throw new RewardApplicationStaleError();
      }

      for (const effect of pokemonEffects) {
        const state = pokemonStates.get(effect.pokemonInstanceId);
        const result = pokemonResults.get(effect.pokemonInstanceId);
        const config = pokemonConfigs.get(effect.pokemonInstanceId);
        if (!state || !result || !config) throw new Error("Pokémon progression application state is incomplete");
        if (!result.changed) continue;
        const updated = await updateOwnedPokemonProgression(client, {
          ownerPlayerId: resolution.subjectPlayerId,
          pokemonInstanceId: effect.pokemonInstanceId,
          expectedRowVersion: state.rowVersion,
          level: result.level,
          totalExperience: result.totalExperience,
          now,
        });
        if (!updated) throw new RewardApplicationStaleError();
        if (result.level !== state.level) {
          const maxHp = deriveProgressionMaxHp(pinnedContext, config, result.level);
          const existingVitality = await loadPokemonVitality(
            client,
            resolution.subjectPlayerId,
            effect.pokemonInstanceId,
            true,
          );
          if (existingVitality) {
            const reconciled = await reconcilePokemonVitalityMaxHpInTransaction(client, {
              ownerPlayerId: resolution.subjectPlayerId,
              pokemonInstanceId: effect.pokemonInstanceId,
              maxHp,
              now,
            });
            if (reconciled.status === "not_found" || reconciled.status === "stale") {
              throw new RewardApplicationError("Pokémon vitality reconciliation lost locked row invariant");
            }
          } else if (!activeHistoricalHunt) {
            await initializeAndReconcilePokemonVitalitiesInTransaction(client, {
              ownerPlayerId: resolution.subjectPlayerId,
              maxHpByPokemonInstanceId: { [effect.pokemonInstanceId]: maxHp },
              now,
            });
          }
        }
      }

      if (itemEffects.length > 0 && inventoryState) {
        const inventoryResult = await grantInventoryEntriesInTransaction(client, {
          playerId: resolution.subjectPlayerId,
          expectedRowVersion: inventoryState.rowVersion,
          grants: itemEffects.map((effect) => ({ itemId: effect.itemId, quantity: effect.quantity })),
          now,
        });
        if (inventoryResult.status === "stale") throw new RewardApplicationStaleError();
        if (inventoryResult.status !== "updated") {
          throw new RewardApplicationError(`Inventory reward application failed: ${inventoryResult.status}`);
        }
      }

      const completion = await insertRewardCompletion(client, resolution.resolutionId, now);
      return {
        status: "completed",
        resolutionId: resolution.resolutionId,
        completionId: completion.completionId,
        completedAt: completion.completedAt,
        replayed: false,
      };
    };

    try {
      return transaction
        ? await apply(transaction)
        : await withPgClient({ connectionString: this.connectionString }, (client) =>
            withTransaction(client, apply));
    } catch (error) {
      if (error instanceof RewardApplicationStaleError) {
        return { status: "stale", resolutionId };
      }
      throw error;
    }
  }
}
