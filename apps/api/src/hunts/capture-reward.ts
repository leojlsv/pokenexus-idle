import {
  commitCaptureAttempt,
  commitCaptureAttemptInTransaction,
  loadCaptureAttemptByCorrelation,
  withPgClient,
  type CaptureDbClient,
  type CaptureAttemptCommitResult,
  type CaptureAttemptIntent,
  type CaptureAttemptRecord,
  type TransactionClient,
} from "@pokenexus/database";
import {
  CAPTURE_RULES_VERSION_V1,
  deriveMaxHpForRulesVersion,
  deriveLevelAvailableMoves,
  pokemonXpFloor,
  replayValidateSoloHuntCaptureSource,
  replayValidateSoloHuntRewardSource,
  resolveCaptureAttemptV1,
  resolveSoloHuntEncounterReward,
  selectBootstrapMoveLoadout,
  isGeneticCombatRulesVersion,
  type CaptureBallRuleV1,
  type DeterministicRngState,
  type EncounterRewardInputV1,
  type SoloHuntCompletedEncounterEvidence,
  type SoloHuntPendingCaptureDecision,
  type SoloHuntRewardResolution,
  type SoloHuntRuntimeInputs,
  type SoloHuntRuntimeState,
} from "@pokenexus/game-core";
import type { MoveEligibilityContextLoader } from "../moves/context";
import type { RewardApplicationResult } from "../rewards/application";

export interface HistoricalEncounterAuthority {
  readonly encounterDefinitionId: string;
  readonly speciesId: string;
  readonly gameDataVersion: string;
  readonly contentVersion: string;
  readonly contentHash: string;
  readonly catchRate: number;
  readonly reward: EncounterRewardInputV1;
}

export interface HistoricalEncounterAuthorityLoader {
  load(input: {
    readonly encounterDefinitionId: string;
    readonly speciesId: string;
    readonly gameDataVersion: string;
    readonly contentVersion: string;
    readonly contentHash: string;
  }): Promise<HistoricalEncounterAuthority | null>;
}

export interface CaptureBallAuthority {
  resolve(itemId: string): Promise<CaptureBallRuleV1 | null>;
}

export interface CaptureAttemptRepository {
  loadByCorrelation(
    subjectPlayerId: string,
    attemptCorrelation: string,
  ): Promise<CaptureAttemptRecord | null>;
  commit(input: CaptureAttemptIntent & {
    readonly expectedInventoryRowVersion: bigint;
    readonly initialPokemonVitalityCurrentHp?: number;
    readonly now: Date;
  }): Promise<CaptureAttemptCommitResult>;
}

export interface RewardApplicationPort {
  claimResolution(envelope: SoloHuntRewardResolution["envelope"], transaction?: TransactionClient): Promise<{
    readonly status: "created" | "existing";
    readonly resolution: { readonly resolutionId: string };
  }>;
  applyResolution(resolutionId: string, transaction?: TransactionClient): Promise<RewardApplicationResult>;
}

export interface SoloHuntRewardSourceReplayValidator {
  validate(input: {
    readonly huntState: SoloHuntRuntimeState;
    readonly huntInputs: SoloHuntRuntimeInputs;
    readonly rewardSourceIdentity: string;
  }): ReturnType<typeof replayValidateSoloHuntRewardSource>;
}

export interface SoloHuntCaptureSourceReplayValidator {
  validate(input: {
    readonly huntState: SoloHuntRuntimeState;
    readonly huntInputs: SoloHuntRuntimeInputs;
    readonly encounterId: SoloHuntPendingCaptureDecision["encounterId"];
  }): ReturnType<typeof replayValidateSoloHuntCaptureSource>;
}

const DEFAULT_SOLO_HUNT_REWARD_SOURCE_REPLAY_VALIDATOR: SoloHuntRewardSourceReplayValidator = {
  validate(input) {
    return replayValidateSoloHuntRewardSource(
      input.huntState,
      input.huntInputs,
      input.rewardSourceIdentity,
    );
  },
};

const DEFAULT_SOLO_HUNT_CAPTURE_SOURCE_REPLAY_VALIDATOR: SoloHuntCaptureSourceReplayValidator = {
  validate(input) {
    return replayValidateSoloHuntCaptureSource(
      input.huntState,
      input.huntInputs,
      input.encounterId,
    );
  },
};

export function createPgCaptureAttemptRepository(connectionString: string): CaptureAttemptRepository {
  return {
    loadByCorrelation(subjectPlayerId, attemptCorrelation) {
      return withPgClient({ connectionString }, (client) =>
        loadCaptureAttemptByCorrelation(client, subjectPlayerId, attemptCorrelation));
    },
    commit(input) {
      return withPgClient({ connectionString }, (client) => commitCaptureAttempt(client, input));
    },
  };
}

export function createTransactionCaptureAttemptRepository(
  client: CaptureDbClient,
): CaptureAttemptRepository {
  return {
    loadByCorrelation(subjectPlayerId, attemptCorrelation) {
      return loadCaptureAttemptByCorrelation(client, subjectPlayerId, attemptCorrelation);
    },
    commit(input) {
      return commitCaptureAttemptInTransaction(client, input);
    },
  };
}

function exactHistoricalAuthority(
  authority: HistoricalEncounterAuthority | null,
  input: {
    readonly encounterDefinitionId: string;
    readonly speciesId: string;
    readonly gameDataVersion: string;
    readonly contentVersion: string;
    readonly contentHash: string;
  },
): HistoricalEncounterAuthority {
  if (authority === null) throw new Error("historical Encounter authority is not exactly resolvable");
  if (
    authority.encounterDefinitionId !== input.encounterDefinitionId
    || authority.speciesId !== input.speciesId
    || authority.gameDataVersion !== input.gameDataVersion
    || authority.contentVersion !== input.contentVersion
    || authority.contentHash !== input.contentHash
  ) {
    throw new Error("historical Encounter authority does not match the frozen Hunt context");
  }
  return authority;
}

function historicalLookupInput(source: SoloHuntCompletedEncounterEvidence | SoloHuntPendingCaptureDecision) {
  return {
    encounterDefinitionId: source.encounterDefinitionId,
    speciesId: source.speciesId,
    gameDataVersion: source.gameDataVersion,
    contentVersion: source.contentVersion,
    contentHash: source.contentHash,
  };
}

export class SoloHuntRewardResolutionService {
  constructor(
    private readonly historical: HistoricalEncounterAuthorityLoader,
    private readonly replayValidator: SoloHuntRewardSourceReplayValidator =
      DEFAULT_SOLO_HUNT_REWARD_SOURCE_REPLAY_VALIDATOR,
  ) {}

  async resolve(input: {
    readonly huntState: SoloHuntRuntimeState;
    readonly huntInputs: SoloHuntRuntimeInputs;
    readonly rewardSourceIdentity: string;
    readonly rewardRng: DeterministicRngState;
  }): Promise<SoloHuntRewardResolution> {
    const validated = this.replayValidator.validate(input);
    if (!validated.accepted) {
      throw new Error(`Solo Hunt reward source failed replay validation: ${validated.reason}`);
    }
    const { subjectPlayerId, evidence, pinnedTeam } = validated.source;
    const lookup = historicalLookupInput(evidence);
    const authority = exactHistoricalAuthority(await this.historical.load(lookup), lookup);
    return resolveSoloHuntEncounterReward({
      subjectPlayerId,
      evidence,
      pinnedTeam,
      rewardInput: authority.reward,
      rng: input.rewardRng,
    });
  }
}

export class SoloHuntRewardApplicationService {
  private readonly resolver: SoloHuntRewardResolutionService;

  constructor(
    historical: HistoricalEncounterAuthorityLoader,
    private readonly application: RewardApplicationPort,
    replayValidator: SoloHuntRewardSourceReplayValidator =
      DEFAULT_SOLO_HUNT_REWARD_SOURCE_REPLAY_VALIDATOR,
  ) {
    this.resolver = new SoloHuntRewardResolutionService(historical, replayValidator);
  }

  async resolveAndApply(input: {
    readonly transaction?: TransactionClient;
    readonly huntState: SoloHuntRuntimeState;
    readonly huntInputs: SoloHuntRuntimeInputs;
    readonly rewardSourceIdentity: string;
    readonly rewardRng: DeterministicRngState;
  }): Promise<{
    readonly resolution: SoloHuntRewardResolution;
    readonly claimStatus: "created" | "existing";
    readonly application: RewardApplicationResult;
  }> {
    const resolution = await this.resolver.resolve(input);
    const claim = await this.application.claimResolution(resolution.envelope, input.transaction);
    const application = await this.application.applyResolution(
      claim.resolution.resolutionId,
      input.transaction,
    );
    return {
      resolution,
      claimStatus: claim.status,
      application,
    };
  }
}

function captureReplayRequestMatches(
  existing: CaptureAttemptRecord,
  input: {
    readonly subjectPlayerId: string;
    readonly attemptCorrelation: string;
    readonly encounterId: SoloHuntPendingCaptureDecision["encounterId"];
    readonly selectedItemId: string;
    readonly captureRng: DeterministicRngState;
  },
): boolean {
  return existing.subjectPlayerId === input.subjectPlayerId
    && existing.attemptCorrelation === input.attemptCorrelation
    && existing.encounterId === input.encounterId
    && existing.selectedItemId === input.selectedItemId
    && existing.rng.algorithm === input.captureRng.algorithm
    && existing.rng.before === input.captureRng.state;
}

export class SoloHuntCaptureResolutionService {
  constructor(
    private readonly repository: CaptureAttemptRepository,
    private readonly historical: HistoricalEncounterAuthorityLoader,
    private readonly creationContext: MoveEligibilityContextLoader,
    private readonly ballAuthority: CaptureBallAuthority,
    private readonly captureSourceValidator: SoloHuntCaptureSourceReplayValidator =
      DEFAULT_SOLO_HUNT_CAPTURE_SOURCE_REPLAY_VALIDATOR,
  ) {}

  async attempt(input: {
    readonly subjectPlayerId: string;
    readonly attemptCorrelation: string;
    readonly encounterId: SoloHuntPendingCaptureDecision["encounterId"];
    readonly huntState: SoloHuntRuntimeState;
    readonly huntInputs: SoloHuntRuntimeInputs;
    readonly selectedItemId: string;
    readonly captureRng: DeterministicRngState;
    readonly expectedInventoryRowVersion: bigint;
    readonly now: Date;
  }): Promise<CaptureAttemptCommitResult> {
    const existing = await this.repository.loadByCorrelation(
      input.subjectPlayerId,
      input.attemptCorrelation,
    );
    if (existing !== null) {
      return captureReplayRequestMatches(existing, input)
        ? { status: "accepted", replayed: true, attempt: existing }
        : { status: "conflict", existingAttemptId: existing.captureAttemptId };
    }
    const validatedCaptureSource = this.captureSourceValidator.validate({
      huntState: input.huntState,
      huntInputs: input.huntInputs,
      encounterId: input.encounterId,
    });
    if (!validatedCaptureSource.accepted) {
      throw new Error(`Solo Hunt capture source failed replay validation: ${validatedCaptureSource.reason}`);
    }
    if (validatedCaptureSource.source.subjectPlayerId !== input.subjectPlayerId) {
      throw new Error("Solo Hunt capture source subject Player does not match capture command subject");
    }
    const { pendingCapture, snapshot } = validatedCaptureSource.source;
    const lookup = historicalLookupInput(pendingCapture);
    const historical = exactHistoricalAuthority(await this.historical.load(lookup), lookup);
    const ball = await this.ballAuthority.resolve(input.selectedItemId);
    if (ball === null || ball.itemId !== input.selectedItemId) {
      throw new Error("selected ItemId is not authorized by the capture Ball artifact");
    }

    const creation = await this.creationContext.loadForNewOperation();
    const species = creation.speciesById.get(pendingCapture.speciesId);
    if (!species || species.id !== pendingCapture.speciesId) {
      throw new Error("captured Species is unavailable in the selected creation context");
    }
    const normal1 = species.abilities.filter((assignment) => assignment.sourceAbilitySlot === "normal-1");
    if (normal1.length !== 1) {
      throw new Error("captured Species must resolve exactly one canonical normal-1 Ability");
    }

    const eligibleMoves = deriveLevelAvailableMoves({
      speciesId: pendingCapture.speciesId,
      currentLevel: pendingCapture.level,
      learnset: creation.learnsetsBySpecies.get(pendingCapture.speciesId) ?? [],
    });
    if (creation.productionExecutableMoveIds === null) {
      throw new Error("capture creation context lacks exact production-executable Move authority");
    }
    const selectableMoves = eligibleMoves.filter(({ moveId }) =>
      creation.productionExecutableMoveIds!.includes(moveId));
    if (selectableMoves.length === 0) throw new Error("captured Species has no selectable bootstrap Move");
    const moveIds = selectBootstrapMoveLoadout(selectableMoves);
    for (const moveId of moveIds) {
      if (!creation.moveIds.has(moveId)) throw new Error(`bootstrap Move is unresolved: ${moveId}`);
    }

    const capture = resolveCaptureAttemptV1({
      pendingCapture,
      snapshot,
      catchRate: historical.catchRate,
      ball,
      captureRulesVersion: CAPTURE_RULES_VERSION_V1,
      rng: input.captureRng,
    });

    const pokemon = capture.success
      ? {
          speciesId: snapshot.speciesId,
          level: snapshot.level,
          ivs: snapshot.ivs,
          totalExperience: pokemonXpFloor(BigInt(snapshot.level)),
          geneticScore: snapshot.geneticScore,
          compatibleProfiles: snapshot.compatibleProfiles,
          birthProfile: snapshot.birthProfile,
          shiny: snapshot.shiny,
          individualizationRulesVersion: snapshot.individualizationRulesVersion,
          derivationAuthorityVersion: snapshot.derivationAuthorityVersion,
          derivationAuthorityKeyId: snapshot.derivationAuthorityKeyId,
          originPendingSelectionIdentity: snapshot.pendingSelectionIdentity,
          individualizationSnapshotIdentity: snapshot.individualizationSnapshotIdentity,
          individualizationSnapshotCommitment: snapshot.individualizationSnapshotCommitment,
          contentVersion: pendingCapture.contentVersion,
          contentHash: pendingCapture.contentHash,
          individualizationGameDataVersion: pendingCapture.gameDataVersion,
          selectedAbilityId: normal1[0]!.abilityId,
          moveIds,
        }
      : null;
    const initialPokemonVitalityCurrentHp = pokemon
      ? deriveMaxHpForRulesVersion(
          creation.pair.rulesVersion as never,
          species.baseStats,
          snapshot.ivs,
          snapshot.level,
          isGeneticCombatRulesVersion(creation.pair.rulesVersion)
            ? snapshot.birthGeneticBonuses
            : undefined,
        )
      : undefined;
    if (pokemon && initialPokemonVitalityCurrentHp === undefined) {
      throw new Error("captured Pokémon max HP is unavailable in the selected creation context");
    }

    return this.repository.commit({
      subjectPlayerId: input.subjectPlayerId,
      attemptCorrelation: input.attemptCorrelation,
      encounterId: pendingCapture.encounterId,
      encounterDefinitionId: pendingCapture.encounterDefinitionId,
      speciesId: pendingCapture.speciesId,
      level: pendingCapture.level,
      selectedItemId: input.selectedItemId,
      captureRulesVersion: capture.captureRulesVersion,
      captureRulesSemanticsHash: capture.captureRulesSemanticsHash,
      contentVersion: pendingCapture.contentVersion,
      contentHash: pendingCapture.contentHash,
      encounterGameDataVersion: pendingCapture.gameDataVersion,
      encounterRulesVersion: pendingCapture.rulesVersion,
      creationGameDataVersion: creation.pair.gameDataVersion,
      creationRulesVersion: creation.pair.rulesVersion,
      pendingSelectionIdentity: snapshot.pendingSelectionIdentity,
      individualizationSnapshotIdentity: snapshot.individualizationSnapshotIdentity,
      individualizationSnapshotCommitment: snapshot.individualizationSnapshotCommitment,
      individualizationRulesVersion: snapshot.individualizationRulesVersion,
      derivationAuthorityVersion: snapshot.derivationAuthorityVersion,
      derivationAuthorityKeyId: snapshot.derivationAuthorityKeyId,
      baseChanceBp: capture.baseChanceBp,
      geneticChanceBp: capture.geneticChanceBp,
      finalChanceBp: capture.finalChanceBp,
      captureRoll: capture.roll,
      rng: {
        algorithm: capture.rngBefore.algorithm,
        before: capture.rngBefore.state,
        after: capture.rngAfter.state,
      },
      success: capture.success,
      pokemon,
      ...(initialPokemonVitalityCurrentHp === undefined
        ? {}
        : { initialPokemonVitalityCurrentHp }),
      expectedInventoryRowVersion: input.expectedInventoryRowVersion,
      now: input.now,
    });
  }
}
