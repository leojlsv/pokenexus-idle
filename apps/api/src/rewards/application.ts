import {
  claimRewardResolution,
  grantInventoryEntriesInTransaction,
  insertRewardCompletion,
  loadInventory,
  loadOwnedPokemonProgression,
  loadPlayerProgression,
  loadRewardResolutionById,
  loadRewardResolutionBySourceKey,
  updateOwnedPokemonProgression,
  updatePlayerProgression,
  withPgClient,
  withTransaction,
  type RewardResolutionEnvelope,
  type RewardResolutionRecord,
} from "@pokenexus/database";
import {
  PLAYER_PROGRESSION_RULE_ID,
  POKEMON_PROGRESSION_RULE_ID,
  evaluatePlayerXpGrant,
  evaluatePokemonXpGrant,
  type PlayerXpGrantResult,
  type PokemonXpGrantResult,
} from "@pokenexus/game-core";
import {
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
      if (needsItems) {
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
        const items = await loadRuntimeGameDataArtifact(
          input.gameDataReader,
          version,
          "catalogs/items",
        ) as ItemDefinitionV1[];
        for (const item of items) itemIds.add(item.id);
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
      };
    },
  };
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
  ): Promise<{ readonly status: "created" | "existing"; readonly resolution: RewardResolutionRecord }> {
    const existing = await withPgClient({ connectionString: this.connectionString }, (client) =>
      loadRewardResolutionBySourceKey(client, envelope));
    if (existing) {
      return withPgClient({ connectionString: this.connectionString }, (client) =>
        claimRewardResolution(client, envelope));
    }
    const pinnedContext = await this.contextLoader.load(envelope);
    validatePinnedContext(envelope, pinnedContext, "new_resolution");
    return withPgClient({ connectionString: this.connectionString }, (client) =>
      claimRewardResolution(client, envelope));
  }

  async applyResolution(resolutionId: string): Promise<RewardApplicationResult> {
    const initial = await withPgClient({ connectionString: this.connectionString }, (client) =>
      loadRewardResolutionById(client, resolutionId));
    if (!initial) return { status: "not_found" };
    if (initial.completion) return completionResult(initial, true);

    const pinnedContext = await this.contextLoader.load(initial);
    validatePinnedContext(initial, pinnedContext, "historical_application");

    try {
      return await withPgClient({ connectionString: this.connectionString }, (client) =>
        withTransaction(client, async (transaction) => {
          const resolution = await loadRewardResolutionById(transaction, resolutionId, true);
          if (!resolution) return { status: "not_found" } as const;
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
            playerState = await loadPlayerProgression(transaction, resolution.subjectPlayerId, true);
            if (!playerState) throw new RewardApplicationError("Reward subject Player no longer exists");
          }

          const pokemonStates = new Map<string, NonNullable<Awaited<ReturnType<typeof loadOwnedPokemonProgression>>>>();
          for (const effect of pokemonEffects) {
            const state = await loadOwnedPokemonProgression(
              transaction,
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
          }

          const inventoryState = itemEffects.length > 0
            ? await loadInventory(transaction, resolution.subjectPlayerId, true)
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
            const updated = await updatePlayerProgression(transaction, {
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
            if (!state || !result) throw new Error("Pokémon progression application state is incomplete");
            if (!result.changed) continue;
            const updated = await updateOwnedPokemonProgression(transaction, {
              ownerPlayerId: resolution.subjectPlayerId,
              pokemonInstanceId: effect.pokemonInstanceId,
              expectedRowVersion: state.rowVersion,
              level: result.level,
              totalExperience: result.totalExperience,
              now,
            });
            if (!updated) throw new RewardApplicationStaleError();
          }

          if (itemEffects.length > 0 && inventoryState) {
            const inventoryResult = await grantInventoryEntriesInTransaction(transaction, {
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

          const completion = await insertRewardCompletion(transaction, resolution.resolutionId, now);
          return {
            status: "completed",
            resolutionId: resolution.resolutionId,
            completionId: completion.completionId,
            completedAt: completion.completedAt,
            replayed: false,
          } as const;
        }));
    } catch (error) {
      if (error instanceof RewardApplicationStaleError) {
        return { status: "stale", resolutionId };
      }
      throw error;
    }
  }
}
