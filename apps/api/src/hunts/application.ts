import {
  claimPublicHuntCommandInTransaction,
  claimPokeCenterHealCommandInTransaction,
  closePendingManualCaptureInTransaction,
  completePublicHuntCommandInTransaction,
  completePokeCenterHealCommandInTransaction,
  createHuntCheckpoint,
  createPendingManualCaptureIfFreeInTransaction,
  createSoloHuntInTransaction,
  cancelScheduledHealingCommandsForHuntInTransaction,
  classifyHealingCommandInTransaction,
  createHealingCommandInTransaction,
  ensureAndLockPlayerHuntRoot,
  freezeEncounterBoundaryInTransaction,
  freezeEncounterAutomaticDecisionInTransaction,
  healPokemonVitalitiesToMaxInTransaction,
  initializeAndReconcilePokemonVitalitiesInTransaction,
  insertAutoCapturePolicyInTransaction,
  insertInitialPolicyIntervalInTransaction,
  loadAndLockOwnedTeamSnapshot,
  loadAutoCapturePolicyByVersion,
  loadCurrentAutoCapturePolicy,
  loadEarliestHealingAdvanceBlocker,
  loadEarliestIncompleteEncounterBoundary,
  loadEarliestDueHealingCommand,
  loadEffectivePolicyVersion,
  loadEncounterBoundary,
  loadHuntCheckpoint,
  loadHealingCommandByCommandId,
  loadHuntInputAuthority,
  loadInventory,
  loadOwnedSoloHunt,
  loadPendingManualCapture,
  loadPendingZoneSelection,
  loadPlayerHuntRoot,
  loadPokeCenterHealCommand,
  loadPublicHuntCommand,
  markEncounterBoundaryStageInTransaction,
  markHealingCommandsDueForEncounterInTransaction,
  persistOwnedHuntCheckpointInTransaction,
  recordEncounterAutomaticCaptureResultInTransaction,
  replacePokemonVitalitiesCurrentHpInTransaction,
  saveHuntInputAuthorityInTransaction,
  savePendingZoneSelectionInTransaction,
  deletePendingZoneSelectionInTransaction,
  supersedeOvertakenPublicHuntCommandsInTransaction,
  terminalizeSoloHuntInTransaction,
  resolveHealingCommandInTransaction,
  removeInventoryEntriesInTransaction,
  updatePublicCommandClaimEffectsInTransaction,
  updatePublicHuntCommandTargetInTransaction,
  updatePublicHuntCommandServerContextInTransaction,
  withPgClient,
  withTransaction,
  type HuntAutoCapturePolicyRecord,
  type HuntEncounterBoundaryRecord,
  type HuntInputAuthorityRecord,
  type HuntHealingCommandRecord,
  type HuntPublicCommandKind,
  type HuntPublicCommandRecord,
  type OwnedPokemonRecord,
  type OwnedTeamSnapshot,
  type PokeCenterHealCommandRecord,
  type SoloHuntRecord,
  type TransactionClient,
} from "@pokenexus/database";
import {
  applyCaptureBallPowerBp,
  advanceSoloHuntToEncounterBoundaryOrCutoff,
  applySoloHuntExplicitHealing,
  allocateGeneticBudget,
  baseCaptureChanceBp,
  cadenceParticipantKey,
  createRngState,
  createSoloHuntRuntime,
  decodeSoloHuntCheckpoint,
  encodeSoloHuntCheckpointV2,
  SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V2,
  geneticBudgetForScore,
  geneticCaptureChanceBp,
  replayValidateSoloHuntCompletedCaptureSource,
  type CaptureBallRuleV1,
  type DeterministicRngState,
  type GeneticProfile,
  type EffectMagnitude,
  type SoloHuntCompletedEncounterEvidence,
  type SoloHuntRuntimeInputs,
  type SoloHuntRuntimeState,
  type SoloHuntPendingEncounterSelection,
  type SoloHuntTeamMemberSnapshot,
} from "@pokenexus/game-core";
import {
  hashNormalizedIntent,
  validateAutoCapturePolicyRelationships,
  type AutoCapturePolicyReplaceRequest,
  type HuntItemUseRequest,
  type ManualCaptureRequest,
  type StartHuntRequest,
  type PokeCenterHealRequest,
} from "./protocol";
import { noLivingHuntDisposition, publicRetreatTerminalReason } from "./terminal-disposition";

export interface HuntHttpResult {
  readonly httpStatus: number;
  readonly body: unknown;
}

export interface CaptureBallAuthorityEntry extends CaptureBallRuleV1 {
  readonly premium: boolean;
}

export interface CaptureBallAuthorityRelease {
  readonly version: string;
  readonly balls: readonly CaptureBallAuthorityEntry[];
}

export interface HuntHistoricalEncounterAuthority {
  readonly encounterDefinitionId: string;
  readonly speciesId: string;
  readonly gameDataVersion: string;
  readonly contentVersion: string;
  readonly contentHash: string;
  readonly catchRate: number;
  readonly reward: {
    readonly pokemonXpPool: number;
    readonly playerXp: number | null;
    readonly itemDrops: readonly {
      readonly itemId: string;
      readonly quantity: number;
      readonly chanceBasisPoints: number;
    }[];
  };
}

export interface HuntStartSelectorAuthority {
  readonly huntDefinitionId: string;
  readonly zoneId: string;
  readonly recoveryDurationMs: number;
  readonly gameDataVersion: string;
  readonly rulesVersion: string;
}

export interface BuiltHuntRuntimeAuthority {
  readonly inputs: SoloHuntRuntimeInputs;
  readonly persistedInputs: Record<string, unknown>;
  readonly maxHpByPokemonInstanceId: Readonly<Record<string, number>>;
  readonly selector: HuntStartSelectorAuthority;
  readonly individualizationAuthorityVersion: string | null;
  readonly individualizationAuthorityKeyId: string | null;
}

export interface HuntRuntimeAuthorityPort {
  resolveStartSelector(huntDefinitionId: string): Promise<HuntStartSelectorAuthority | null>;
  buildStartRuntime(input: {
    readonly playerId: string;
    readonly selector: HuntStartSelectorAuthority;
    readonly team: OwnedTeamSnapshot;
    readonly pendingEncounterSelection?: SoloHuntPendingEncounterSelection;
  }): Promise<BuiltHuntRuntimeAuthority>;
  bindStartVitality(
    built: BuiltHuntRuntimeAuthority,
    initialHpByPokemonInstanceId: Readonly<Record<string, number>>,
  ): BuiltHuntRuntimeAuthority;
  deriveCurrentTeamMaxHp(
    team: OwnedTeamSnapshot,
  ): Promise<Readonly<Record<string, number>>>;
  loadPersistedRuntime(record: HuntInputAuthorityRecord): Promise<SoloHuntRuntimeInputs>;
  loadHistoricalEncounter(
    evidence: Pick<
      SoloHuntCompletedEncounterEvidence,
      "encounterDefinitionId" | "speciesId" | "gameDataVersion" | "contentVersion" | "contentHash"
    >,
  ): Promise<HuntHistoricalEncounterAuthority | null>;
  currentBallAuthority(): Promise<CaptureBallAuthorityRelease>;
  ballAuthority(version: string): Promise<CaptureBallAuthorityRelease | null>;
  currentItemRule(input: {
    readonly itemId: string;
    readonly gameDataVersion: string;
    readonly rulesVersion: string;
  }): Promise<{
    readonly itemRuleVersion: string;
    readonly useKind: "none" | "capture-attempt" | "heal-hp";
    readonly magnitude?: {
      readonly kind: "fixed" | "max-hp-fraction";
      readonly amount?: number;
      readonly numerator?: number;
      readonly denominator?: number;
    };
  } | null>;
  itemRule(input: {
    readonly itemId: string;
    readonly itemRuleVersion: string;
    readonly gameDataVersion: string;
    readonly rulesVersion: string;
  }): Promise<{
    readonly itemRuleVersion: string;
    readonly useKind: "none" | "capture-attempt" | "heal-hp";
    readonly magnitude?: {
      readonly kind: "fixed" | "max-hp-fraction";
      readonly amount?: number;
      readonly numerator?: number;
      readonly denominator?: number;
    };
  } | null>;
  validatePolicyReferences(input: {
    readonly speciesIds: readonly string[];
    readonly zoneIds: readonly string[];
    readonly huntDefinitionIds: readonly string[];
  }): Promise<{ readonly gameDataVersion: string; readonly accepted: boolean }>;
}

export interface HuntBoundaryEffectsResult {
  readonly reward: {
    readonly playerExperience: bigint;
    readonly pokemonExperience: readonly { readonly pokemonInstanceId: string; readonly amount: bigint }[];
    readonly items: readonly { readonly itemId: string; readonly quantity: bigint }[];
  };
  readonly automaticCapture:
    | { readonly kind: "not_attempted" }
    | {
        readonly kind: "attempted";
        readonly success: boolean;
        readonly shiny: boolean;
      };
}

export interface HuntBoundaryEffectsPort {
  automaticCapture(input: {
    readonly transaction: TransactionClient;
    readonly playerId: string;
    readonly hunt: SoloHuntRecord;
    readonly state: SoloHuntRuntimeState;
    readonly inputs: SoloHuntRuntimeInputs;
    readonly boundary: HuntEncounterBoundaryRecord;
    readonly selectedItemId: string;
    readonly ballAuthorityVersion: string;
    readonly captureRng: DeterministicRngState;
    readonly expectedInventoryRowVersion: bigint;
    readonly now: Date;
  }): Promise<
    | { readonly status: "accepted"; readonly success: boolean; readonly shiny: boolean }
    | { readonly status: "authority_unavailable" }
    | { readonly status: "integrity_failure" }
  >;
  reward(input: {
    readonly transaction: TransactionClient;
    readonly playerId: string;
    readonly hunt: SoloHuntRecord;
    readonly state: SoloHuntRuntimeState;
    readonly inputs: SoloHuntRuntimeInputs;
    readonly boundary: HuntEncounterBoundaryRecord;
    readonly rewardRng: DeterministicRngState;
  }): Promise<{
    readonly rewardResolutionId: string;
    readonly reward: HuntBoundaryEffectsResult["reward"];
  }>;
}

export interface HuntManualCaptureEffectsPort {
  attempt(input: {
    readonly transaction: TransactionClient;
    readonly playerId: string;
    readonly sourceHunt: SoloHuntRecord;
    readonly state: SoloHuntRuntimeState;
    readonly inputs: SoloHuntRuntimeInputs;
    readonly encounterId: string;
    readonly selectedItemId: string;
    readonly attemptCorrelation: string;
    readonly captureRng: DeterministicRngState;
    readonly ballAuthorityVersion: string;
    readonly expectedInventoryRowVersion: bigint;
    readonly now: Date;
  }): Promise<
    | { readonly status: "accepted"; readonly success: boolean; readonly pokemonInstanceId: string | null }
    | { readonly status: "insufficient_ball" }
    | { readonly status: "authority_unavailable" }
  >;
}

export interface HuntApplicationPorts {
  readonly authority: HuntRuntimeAuthorityPort;
  readonly boundaryEffects: HuntBoundaryEffectsPort;
  readonly manualCaptureEffects: HuntManualCaptureEffectsPort;
}

export interface HuntHttpApplication {
  getState(playerId: string): Promise<HuntHttpResult>;
  getCaptureBalls(playerId: string): Promise<HuntHttpResult>;
  getAutoCapturePolicy(playerId: string): Promise<HuntHttpResult>;
  start(playerId: string, idempotencyKey: string, body: StartHuntRequest): Promise<HuntHttpResult>;
  healAtPokeCenter(
    playerId: string,
    idempotencyKey: string,
    body: PokeCenterHealRequest,
  ): Promise<HuntHttpResult>;
  checkpoint(playerId: string, idempotencyKey: string, huntId: string): Promise<HuntHttpResult>;
  claim(playerId: string, idempotencyKey: string, huntId: string): Promise<HuntHttpResult>;
  retreat(playerId: string, idempotencyKey: string, huntId: string): Promise<HuntHttpResult>;
  capture(
    playerId: string,
    idempotencyKey: string,
    huntId: string,
    body: ManualCaptureRequest,
  ): Promise<HuntHttpResult>;
  useItem(
    playerId: string,
    idempotencyKey: string,
    huntId: string,
    body: HuntItemUseRequest,
  ): Promise<HuntHttpResult>;
  replaceAutoCapturePolicy(
    playerId: string,
    idempotencyKey: string,
    body: AutoCapturePolicyReplaceRequest,
  ): Promise<HuntHttpResult>;
}

export class HuntAuthorityUnavailableError extends Error {
  constructor(message = "Hunt authority is unavailable", options?: ErrorOptions) {
    super(message, options);
    this.name = "HuntAuthorityUnavailableError";
  }
}

interface ClaimEffectsAccumulator {
  playerExperience: string;
  pokemonExperience: Record<string, string>;
  items: Record<string, string>;
  automaticCaptureSummary: {
    attempts: string;
    successes: string;
    failures: string;
    closedNoEligibleBall: string;
    shinySuccesses: string;
  };
}

const EMPTY_CLAIM_EFFECTS: ClaimEffectsAccumulator = {
  playerExperience: "0",
  pokemonExperience: {},
  items: {},
  automaticCaptureSummary: {
    attempts: "0",
    successes: "0",
    failures: "0",
    closedNoEligibleBall: "0",
    shinySuccesses: "0",
  },
};

function cloneClaimEffects(value: Record<string, unknown>): ClaimEffectsAccumulator {
  const source = Object.keys(value).length === 0 ? EMPTY_CLAIM_EFFECTS : value as unknown as ClaimEffectsAccumulator;
  return {
    playerExperience: source.playerExperience ?? "0",
    pokemonExperience: { ...(source.pokemonExperience ?? {}) },
    items: { ...(source.items ?? {}) },
    automaticCaptureSummary: {
      attempts: source.automaticCaptureSummary?.attempts ?? "0",
      successes: source.automaticCaptureSummary?.successes ?? "0",
      failures: source.automaticCaptureSummary?.failures ?? "0",
      closedNoEligibleBall: source.automaticCaptureSummary?.closedNoEligibleBall ?? "0",
      shinySuccesses: source.automaticCaptureSummary?.shinySuccesses ?? "0",
    },
  };
}

function addDecimal(left: string, right: bigint): string {
  return (BigInt(left) + right).toString();
}

function addCount(left: string, amount = 1n): string {
  return (BigInt(left) + amount).toString();
}

function aggregateRewardEffects(
  current: Record<string, unknown>,
  reward: HuntBoundaryEffectsResult["reward"],
): ClaimEffectsAccumulator {
  const next = cloneClaimEffects(current);
  next.playerExperience = addDecimal(next.playerExperience, reward.playerExperience);
  for (const effect of reward.pokemonExperience) {
    next.pokemonExperience[effect.pokemonInstanceId] = addDecimal(
      next.pokemonExperience[effect.pokemonInstanceId] ?? "0",
      effect.amount,
    );
  }
  for (const effect of reward.items) {
    next.items[effect.itemId] = addDecimal(next.items[effect.itemId] ?? "0", effect.quantity);
  }
  return next;
}

function aggregateAutomaticCaptureEffects(
  current: Record<string, unknown>,
  automaticCapture: HuntBoundaryEffectsResult["automaticCapture"],
  closedNoEligibleBall: boolean,
): ClaimEffectsAccumulator {
  const next = cloneClaimEffects(current);
  if (closedNoEligibleBall) {
    next.automaticCaptureSummary.closedNoEligibleBall =
      addCount(next.automaticCaptureSummary.closedNoEligibleBall);
  }
  if (automaticCapture.kind === "attempted") {
    next.automaticCaptureSummary.attempts = addCount(next.automaticCaptureSummary.attempts);
    if (automaticCapture.success) {
      next.automaticCaptureSummary.successes = addCount(next.automaticCaptureSummary.successes);
      if (automaticCapture.shiny) {
        next.automaticCaptureSummary.shinySuccesses =
          addCount(next.automaticCaptureSummary.shinySuccesses);
      }
    } else {
      next.automaticCaptureSummary.failures = addCount(next.automaticCaptureSummary.failures);
    }
  }
  return next;
}

function publicClaimEffects(value: Record<string, unknown>) {
  const effects = cloneClaimEffects(value);
  return {
    playerExperience: effects.playerExperience,
    pokemonExperience: Object.entries(effects.pokemonExperience)
      .filter(([, amount]) => BigInt(amount) !== 0n)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([pokemonInstanceId, amount]) => ({ pokemonInstanceId, amount })),
    items: Object.entries(effects.items)
      .filter(([, quantity]) => BigInt(quantity) !== 0n)
      .sort(([left], [right]) => Buffer.from(left).compare(Buffer.from(right)))
      .map(([itemId, quantity]) => ({ itemId, quantity })),
    automaticCaptureSummary: { ...effects.automaticCaptureSummary },
  };
}

function error(httpStatus: number, code: string, extra?: Record<string, unknown>): HuntHttpResult {
  return { httpStatus, body: { error: code, ...(extra ?? {}) } };
}

function ok(body: unknown, httpStatus = 200): HuntHttpResult {
  return { httpStatus, body };
}

function inProgress(logicalTimeMs: number, targetLogicalTimeMs: number): HuntHttpResult {
  return ok({
    status: "in_progress",
    progress: {
      logicalTimeMs: logicalTimeMs.toString(),
      targetLogicalTimeMs: targetLogicalTimeMs.toString(),
    },
  }, 202);
}

function commandReplayResult(command: HuntPublicCommandRecord): HuntHttpResult | null {
  if (command.status === "gone") return error(410, "idempotency_gone");
  if (command.status === "terminal") {
    return {
      httpStatus: command.resultHttpStatus ?? 500,
      body: command.resultJson ?? { error: "authority_unavailable" },
    };
  }
  return null;
}

function pokeCenterReplayResult(command: PokeCenterHealCommandRecord): HuntHttpResult | null {
  if (command.status !== "terminal") return null;
  return {
    httpStatus: command.resultHttpStatus ?? 500,
    body: command.resultJson ?? { error: "authority_unavailable" },
  };
}

type ExistingCommandRecheck =
  | { readonly status: "absent" }
  | { readonly status: "pending"; readonly command: HuntPublicCommandRecord }
  | { readonly status: "response"; readonly result: HuntHttpResult };

async function recheckExistingCommandInTransaction(
  transaction: TransactionClient,
  input: {
    readonly playerId: string;
    readonly idempotencyKey: string;
    readonly commandKind: HuntPublicCommandKind;
    readonly intentHash: Uint8Array;
    readonly intentJson: Record<string, unknown>;
  },
): Promise<ExistingCommandRecheck> {
  const existing = await loadPublicHuntCommand(transaction, input.playerId, input.idempotencyKey);
  if (!existing) return { status: "absent" };
  const claimed = await claimPublicHuntCommandInTransaction(transaction, input);
  if (claimed.status === "conflict") {
    return { status: "response", result: error(409, "correlation_conflict") };
  }
  const replay = commandReplayResult(claimed.command);
  return replay
    ? { status: "response", result: replay }
    : { status: "pending", command: claimed.command };
}

async function recheckExecutableCommandInTransaction(
  transaction: TransactionClient,
  playerId: string,
  expected: HuntPublicCommandRecord,
): Promise<
  | { readonly status: "pending"; readonly command: HuntPublicCommandRecord }
  | { readonly status: "response"; readonly result: HuntHttpResult }
> {
  const rechecked = await recheckExistingCommandInTransaction(transaction, {
    playerId,
    idempotencyKey: expected.idempotencyKey,
    commandKind: expected.commandKind,
    intentHash: expected.intentHash,
    intentJson: expected.intentJson,
  });
  if (rechecked.status === "absent") {
    return { status: "response", result: error(503, "authority_unavailable") };
  }
  if (rechecked.status === "response") return rechecked;
  if (rechecked.command.commandId !== expected.commandId) {
    return { status: "response", result: error(409, "correlation_conflict") };
  }
  return rechecked;
}

function randomRngState(): DeterministicRngState {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return createRngState(values[0] === 0 ? 0x9e3779b9 : values[0]!);
}

function rngJson(rng: DeterministicRngState): Record<string, unknown> {
  return { algorithm: rng.algorithm, state: rng.state };
}

function rngFromJson(value: Record<string, unknown> | null): DeterministicRngState | null {
  if (
    value?.algorithm !== "xorshift32-v1"
    || typeof value.state !== "number"
    || !Number.isSafeInteger(value.state)
    || value.state < 1
    || value.state > 0xffffffff
  ) return null;
  return { algorithm: "xorshift32-v1", state: value.state };
}

function healingMagnitude(rule: Awaited<ReturnType<HuntRuntimeAuthorityPort["currentItemRule"]>>): EffectMagnitude | null {
  if (!rule || rule.useKind !== "heal-hp" || !rule.magnitude) return null;
  if (rule.magnitude.kind === "fixed") {
    return Number.isSafeInteger(rule.magnitude.amount) && (rule.magnitude.amount ?? 0) > 0
      ? { kind: "integer", amount: rule.magnitude.amount! }
      : null;
  }
  return Number.isSafeInteger(rule.magnitude.numerator)
    && (rule.magnitude.numerator ?? 0) > 0
    && Number.isSafeInteger(rule.magnitude.denominator)
    && (rule.magnitude.denominator ?? 0) > 0
    ? {
        kind: "maxHpFraction",
        numerator: rule.magnitude.numerator!,
        denominator: rule.magnitude.denominator!,
      }
    : null;
}

function healingAdvanceFenceLogicalTimeMs(record: HuntHealingCommandRecord): number {
  if (record.submissionPhase === null) return record.submissionCutoffLogicalTimeMs;
  if (record.dueLogicalTimeMs === null) {
    throw new Error("Classified healing command without due boundary cannot block Hunt advancement");
  }
  return record.dueLogicalTimeMs;
}

function decodeCheckpointState(bytes: Uint8Array): SoloHuntRuntimeState {
  const decoded = decodeSoloHuntCheckpoint(bytes);
  if (!decoded.accepted) throw new Error(`Solo Hunt checkpoint decode failed: ${decoded.reason}`);
  return decoded.state;
}

function geneticBonusesForOwnedPokemon(record: OwnedPokemonRecord) {
  const budget = geneticBudgetForScore(record.individualization.geneticScore);
  return allocateGeneticBudget(
    budget,
    record.individualization.expressedProfile as GeneticProfile,
  );
}

function quantityFor(inventory: Awaited<ReturnType<typeof loadInventory>>, itemId: string): bigint {
  return inventory?.entries.find((entry) => entry.itemId === itemId)?.quantity ?? 0n;
}

function currentCadence(state: SoloHuntRuntimeState) {
  return state.interBattle?.cadence ?? null;
}

function publicTeam(state: SoloHuntRuntimeState) {
  const cadence = currentCadence(state);
  return state.pinnedTeam.map((member) => {
    const key = cadenceParticipantKey({ kind: "pokemonInstance", identity: member.pokemonInstanceId });
    const activeBattleCombatant = state.currentEncounter
      ? Object.values(state.currentEncounter.battle.combatants).find((combatant) =>
          combatant.cadenceParticipant?.kind === "pokemonInstance"
          && combatant.cadenceParticipant.identity === member.pokemonInstanceId)
      : undefined;
    const currentHp = activeBattleCombatant?.currentHp ?? cadence?.hpByParticipant[key] ?? 0;
    const maxHp = activeBattleCombatant?.maxHp ?? cadence?.maxHpByParticipant[key] ?? Math.max(1, currentHp);
    return {
      pokemonInstanceId: member.pokemonInstanceId,
      speciesId: member.speciesId,
      level: member.level,
      selectedAbilityId: member.abilityId ?? null,
      moveIds: [...member.moveLoadout],
      currentHp,
      maxHp,
    };
  });
}

function currentOwnedHpByPokemonInstanceId(
  state: SoloHuntRuntimeState,
): Readonly<Record<string, number>> {
  const cadence = currentCadence(state);
  const result: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const member of state.pinnedTeam) {
    const key = cadenceParticipantKey({
      kind: "pokemonInstance",
      identity: member.pokemonInstanceId,
    });
    const battleCombatant = state.currentEncounter
      ? Object.values(state.currentEncounter.battle.combatants).find((combatant) =>
          combatant.cadenceParticipant?.kind === "pokemonInstance"
          && combatant.cadenceParticipant.identity === member.pokemonInstanceId)
      : undefined;
    const currentHp = battleCombatant?.currentHp ?? cadence?.hpByParticipant[key];
    if (
      currentHp === undefined
      || !Number.isSafeInteger(currentHp)
      || currentHp < 0
    ) {
      throw new HuntAuthorityUnavailableError(
        "terminal vitality authority is unavailable for " + member.pokemonInstanceId,
      );
    }
    result[member.pokemonInstanceId] = currentHp;
  }
  return result;
}

function huntUsesPersistentVitality(authority: HuntInputAuthorityRecord): boolean {
  const schemaVersion = authority.runtimeInputsJson.schemaVersion;
  if (schemaVersion === "hunt-runtime-inputs-v1") return false;
  if (schemaVersion === "hunt-runtime-inputs-v2") return true;
  throw new HuntAuthorityUnavailableError(
    "persisted Hunt runtime authority has unsupported vitality semantics",
  );
}

async function writeBackTerminalVitalityIfRequired(
  transaction: TransactionClient,
  input: {
    readonly playerId: string;
    readonly huntId: string;
    readonly state: SoloHuntRuntimeState;
    readonly now: Date;
  },
): Promise<void> {
  const authority = await loadHuntInputAuthority(transaction, input.playerId, input.huntId);
  if (!authority) {
    throw new HuntAuthorityUnavailableError("terminal vitality runtime authority is unavailable");
  }
  if (!huntUsesPersistentVitality(authority)) return;
  await replacePokemonVitalitiesCurrentHpInTransaction(transaction, {
    ownerPlayerId: input.playerId,
    currentHpByPokemonInstanceId: currentOwnedHpByPokemonInstanceId(input.state),
    now: input.now,
  });
}

function publicCurrentEncounter(
  state: SoloHuntRuntimeState,
  catchRate: number | null,
): Record<string, unknown> | null {
  const encounter = state.currentEncounter;
  if (!encounter || catchRate === null) return null;
  return {
    encounterId: encounter.encounterId,
    speciesId: encounter.selection.speciesId,
    level: encounter.selection.level,
    catchRate,
    shiny: encounter.individualizationSnapshot?.shiny ?? false,
  };
}

function policyJson(policy: HuntAutoCapturePolicyRecord | null) {
  if (!policy) {
    return {
      policyVersion: null,
      rowVersion: "0",
      enabled: false,
      balls: [],
      rules: [],
    };
  }
  return {
    policyVersion: policy.policyVersion,
    ballAuthorityVersion: policy.ballAuthorityVersion,
    rowVersion: policy.rowVersion.toString(),
    ...policy.policyJson,
  };
}

type SavedAutoCapturePolicy = Pick<AutoCapturePolicyReplaceRequest, "enabled" | "balls" | "rules">;

function asSavedPolicy(policy: HuntAutoCapturePolicyRecord | null): SavedAutoCapturePolicy | null {
  if (!policy) return null;
  return policy.policyJson as unknown as SavedAutoCapturePolicy;
}

function ruleMatches(
  when: AutoCapturePolicyReplaceRequest["rules"][number]["when"],
  visible: {
    readonly shiny: boolean;
    readonly speciesId: string;
    readonly zoneId: string;
    readonly huntDefinitionId: string;
    readonly catchRate: number;
  },
): boolean {
  return (when.shiny === undefined || when.shiny === visible.shiny)
    && (when.speciesIds === undefined || when.speciesIds.includes(visible.speciesId))
    && (when.zoneIds === undefined || when.zoneIds.includes(visible.zoneId))
    && (when.huntDefinitionIds === undefined || when.huntDefinitionIds.includes(visible.huntDefinitionId))
    && (when.catchRateMin === undefined || visible.catchRate >= when.catchRateMin)
    && (when.catchRateMax === undefined || visible.catchRate <= when.catchRateMax);
}

function selectAutomaticBall(
  policy: SavedAutoCapturePolicy,
  authority: CaptureBallAuthorityRelease,
  inventory: Awaited<ReturnType<typeof loadInventory>>,
  visible: {
    readonly shiny: boolean;
    readonly speciesId: string;
    readonly zoneId: string;
    readonly huntDefinitionId: string;
    readonly catchRate: number;
  },
): CaptureBallAuthorityEntry | null {
  if (!policy.enabled) return null;
  const policyBalls = new Map(policy.balls.map((ball) => [ball.itemId, ball] as const));
  const authorityBalls = new Map(authority.balls.map((ball) => [ball.itemId, ball] as const));
  for (const rule of policy.rules) {
    if (!ruleMatches(rule.when, visible)) continue;
    const configured = policyBalls.get(rule.selectedItemId);
    const ball = authorityBalls.get(rule.selectedItemId);
    if (!configured?.autoUseEnabled || !ball) continue;
    const quantity = quantityFor(inventory, rule.selectedItemId);
    if (quantity < 1n) continue;
    if (quantity - 1n < BigInt(configured.minimumReserve)) continue;
    return ball;
  }
  return null;
}

async function syncPendingZoneSelectionInTransaction(
  transaction: TransactionClient,
  playerId: string,
  state: SoloHuntRuntimeState,
): Promise<void> {
  if (state.pendingEncounterSelection) {
    await savePendingZoneSelectionInTransaction(transaction, {
      playerId,
      zoneId: state.zoneId,
      huntDefinitionId: state.huntDefinitionId,
      selectionJson: state.pendingEncounterSelection as unknown as Record<string, unknown>,
    });
    return;
  }
  await deletePendingZoneSelectionInTransaction(transaction, {
    playerId,
    zoneId: state.zoneId,
  });
}

export class HuntApplication implements HuntHttpApplication {
  constructor(
    private readonly connectionString: string,
    private readonly ports: HuntApplicationPorts,
  ) {}

  private async pendingManualCaptureFromClient(
    client: TransactionClient,
    playerId: string,
    ballAuthority: CaptureBallAuthorityRelease,
    visibleThroughHuntStartedAt?: Date,
  ): Promise<Record<string, unknown> | null> {
    const pending = await loadPendingManualCapture(client, playerId);
    if (!pending) return null;
    if (visibleThroughHuntStartedAt) {
      const sourceHunt = await loadOwnedSoloHunt(client, playerId, pending.sourceHuntId);
      if (!sourceHunt || sourceHunt.startedAt > visibleThroughHuntStartedAt) return null;
    }
    const inventory = await loadInventory(client, playerId);
    const captureOptions = ballAuthority.balls.map((ball) => {
      const quantity = quantityFor(inventory, ball.itemId);
      const base = baseCaptureChanceBp(pending.catchRate);
      const minimum = applyCaptureBallPowerBp(
        geneticCaptureChanceBp(base, "Apex"),
        ball.powerQuarterUnits,
      );
      const maximum = applyCaptureBallPowerBp(
        geneticCaptureChanceBp(base, "Normal"),
        ball.powerQuarterUnits,
      );
      return {
        itemId: ball.itemId,
        quantity: quantity.toString(),
        premium: ball.premium,
        chanceRangeBp: { min: minimum, max: maximum },
      };
    });
    return {
      sourceHuntId: pending.sourceHuntId,
      encounterId: pending.encounterId,
      speciesId: pending.speciesId,
      level: pending.level,
      catchRate: pending.catchRate,
      shiny: pending.shiny,
      captureOptions,
    };
  }

  private async terminalStateForHunt(
    client: TransactionClient,
    playerId: string,
    hunt: SoloHuntRecord,
    ballAuthority: CaptureBallAuthorityRelease,
  ): Promise<HuntHttpResult> {
    if (!hunt.terminalAt) throw new Error("Historical terminal-state projection requires a terminal Hunt");
    const recoveryReadyAt = new Date(hunt.terminalAt.getTime() + hunt.recoveryDurationMs);
    if (!Number.isFinite(recoveryReadyAt.getTime())) {
      throw new Error("Historical Hunt recovery anchor is out of range");
    }
    return ok({
      activeHunt: null,
      pendingManualCapture: await this.pendingManualCaptureFromClient(
        client,
        playerId,
        ballAuthority,
        hunt.startedAt,
      ),
      recoveryReadyAt: recoveryReadyAt.toISOString(),
    });
  }

  private async stateFromClient(
    client: TransactionClient,
    playerId: string,
    ballAuthority: CaptureBallAuthorityRelease,
  ): Promise<HuntHttpResult> {
    const root = await loadPlayerHuntRoot(client, playerId);
    if (!root) return ok({ activeHunt: null, pendingManualCapture: null, recoveryReadyAt: null });
    const active = root.activeHuntId
      ? await loadOwnedSoloHunt(client, playerId, root.activeHuntId)
      : null;
    let activeHunt: Record<string, unknown> | null = null;
    if (active && !active.terminalAt) {
      const checkpoint = await loadHuntCheckpoint(client, playerId, active.checkpointId);
      if (!checkpoint) throw new Error("Active Hunt checkpoint is unavailable");
      const state = decodeCheckpointState(checkpoint.stateBytes);
      const currentAuthority = state.currentEncounter
        ? await this.ports.authority.loadHistoricalEncounter({
            encounterDefinitionId: state.currentEncounter.selection.encounterDefinitionId,
            speciesId: state.currentEncounter.selection.speciesId,
            gameDataVersion: state.gameDataVersion,
            contentVersion: state.contentVersion,
            contentHash: state.contentHash,
          })
        : null;
      const effectivePolicyVersion = await loadEffectivePolicyVersion(client, active.huntId, state.logicalTimeMs);
      activeHunt = {
        huntId: active.huntId,
        huntDefinitionId: active.huntDefinitionId,
        zoneId: active.zoneId,
        status: "active",
        logicalTimeMs: state.logicalTimeMs.toString(),
        startedAt: active.startedAt.toISOString(),
        effectiveAutoCapturePolicyVersion: effectivePolicyVersion,
        team: publicTeam(state),
        currentEncounter: publicCurrentEncounter(state, currentAuthority?.catchRate ?? null),
      };
    }
    const pendingManualCapture = await this.pendingManualCaptureFromClient(client, playerId, ballAuthority);
    return ok({
      activeHunt,
      pendingManualCapture,
      recoveryReadyAt: root.recoveryReadyAt?.toISOString() ?? null,
    });
  }

  async getCaptureBalls(_playerId: string): Promise<HuntHttpResult> {
    try {
      const authority = await this.ports.authority.currentBallAuthority();
      return ok({
        ballAuthorityVersion: authority.version,
        balls: authority.balls.map(({ itemId, powerQuarterUnits, premium }) => ({
          itemId,
          powerQuarterUnits,
          premium,
        })),
      });
    } catch {
      return error(503, "authority_unavailable");
    }
  }

  async getAutoCapturePolicy(playerId: string): Promise<HuntHttpResult> {
    try {
      const authority = await this.ports.authority.currentBallAuthority();
      return withPgClient({ connectionString: this.connectionString }, async (client) => {
        const root = await loadPlayerHuntRoot(client, playerId);
        const policy = root ? await loadCurrentAutoCapturePolicy(client, playerId) : null;
        return ok({
          ...policyJson(policy),
          ballAuthorityVersion: policy?.ballAuthorityVersion ?? authority.version,
        });
      });
    } catch {
      return error(503, "authority_unavailable");
    }
  }

  async getState(playerId: string): Promise<HuntHttpResult> {
    try {
      const ballAuthority = await this.ports.authority.currentBallAuthority();
      return withPgClient({ connectionString: this.connectionString }, (client) =>
        withTransaction(
          client,
          (transaction) => this.stateFromClient(transaction, playerId, ballAuthority),
          { isolationLevel: "REPEATABLE READ" },
        ));
    } catch {
      return error(503, "authority_unavailable");
    }
  }

  async healAtPokeCenter(
    playerId: string,
    idempotencyKey: string,
    body: PokeCenterHealRequest,
  ): Promise<HuntHttpResult> {
    try {
      const existing = await withPgClient(
        { connectionString: this.connectionString },
        (client) => loadPokeCenterHealCommand(client, playerId, idempotencyKey),
      );
      if (existing) {
        if (existing.teamId !== body.teamId) return error(409, "correlation_conflict");
        const replay = pokeCenterReplayResult(existing);
        if (replay) return replay;
      }

      return await withPgClient({ connectionString: this.connectionString }, (client) =>
        withTransaction(client, async (transaction) => {
          const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
          if (!root) return error(404, "not_found");

          const claimed = await claimPokeCenterHealCommandInTransaction(transaction, {
            playerId,
            idempotencyKey,
            teamId: body.teamId,
            now: root.databaseNow,
          });
          if (claimed.status === "conflict") return error(409, "correlation_conflict");
          const replay = pokeCenterReplayResult(claimed.command);
          if (replay) return replay;

          if (root.activeHuntId !== null) {
            const result = error(409, "hunt_active");
            await completePokeCenterHealCommandInTransaction(transaction, {
              commandId: claimed.command.commandId,
              httpStatus: result.httpStatus,
              resultJson: result.body,
              now: root.databaseNow,
            });
            return result;
          }

          const team = await loadAndLockOwnedTeamSnapshot(
            transaction,
            playerId,
            body.teamId,
          );
          if (!team) {
            const result = error(404, "not_found");
            await completePokeCenterHealCommandInTransaction(transaction, {
              commandId: claimed.command.commandId,
              httpStatus: result.httpStatus,
              resultJson: result.body,
              now: root.databaseNow,
            });
            return result;
          }

          const maxHpByPokemonInstanceId =
            await this.ports.authority.deriveCurrentTeamMaxHp(team);
          const healed = await healPokemonVitalitiesToMaxInTransaction(transaction, {
            ownerPlayerId: playerId,
            maxHpByPokemonInstanceId,
            now: root.databaseNow,
          });
          const vitalityById = new Map(
            healed.vitality.map((entry) => [entry.pokemonInstanceId, entry]),
          );
          const result = ok({
            teamId: body.teamId,
            vitality: team.team.pokemonInstanceIds.map((pokemonInstanceId) => {
              const vitality = vitalityById.get(pokemonInstanceId);
              const maxHp = maxHpByPokemonInstanceId[pokemonInstanceId];
              if (!vitality || maxHp === undefined) {
                throw new HuntAuthorityUnavailableError(
                  "PokéCenter result vitality authority is incomplete",
                );
              }
              return {
                pokemonInstanceId,
                currentHp: vitality.currentHp,
                maxHp,
                vitality: vitality.currentHp > 0 ? "conscious" : "ko",
                vitalityRowVersion: vitality.rowVersion.toString(),
              };
            }),
            recoveryReadyAt: root.recoveryReadyAt?.toISOString() ?? null,
          });
          await completePokeCenterHealCommandInTransaction(transaction, {
            commandId: claimed.command.commandId,
            httpStatus: result.httpStatus,
            resultJson: result.body,
            now: root.databaseNow,
          });
          return result;
        }));
    } catch {
      return error(503, "authority_unavailable");
    }
  }

  async start(playerId: string, idempotencyKey: string, body: StartHuntRequest): Promise<HuntHttpResult> {
    const intentHash = await hashNormalizedIntent(body);
    const replayFirst = await this.recheckExistingCommand(
      playerId,
      idempotencyKey,
      "start",
      intentHash,
      body as unknown as Record<string, unknown>,
    );
    if (replayFirst.status === "response") return replayFirst.result;
    let selector: HuntStartSelectorAuthority | null;
    try {
      selector = await this.ports.authority.resolveStartSelector(body.huntDefinitionId);
    } catch {
      const replay = await this.replayBeforeUnboundFailure(
        playerId,
        idempotencyKey,
        "start",
        intentHash,
        body as unknown as Record<string, unknown>,
      );
      return replay ?? error(503, "authority_unavailable");
    }
    if (!selector) {
      const replay = await this.replayBeforeUnboundFailure(
        playerId,
        idempotencyKey,
        "start",
        intentHash,
        body as unknown as Record<string, unknown>,
      );
      return replay ?? error(404, "not_found");
    }

    try {
      return await withPgClient({ connectionString: this.connectionString }, (client) =>
        withTransaction(client, async (transaction) => {
          const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
          if (!root) return error(404, "not_found");
          const team = await loadAndLockOwnedTeamSnapshot(transaction, playerId, body.teamId);
          if (!team) {
            const existing = await recheckExistingCommandInTransaction(transaction, {
              playerId,
              idempotencyKey,
              commandKind: "start",
              intentHash,
              intentJson: body as unknown as Record<string, unknown>,
            });
            if (existing.status === "response") return existing.result;
            return existing.status === "pending"
              ? error(503, "authority_unavailable")
              : error(404, "not_found");
          }
          const claimed = await claimPublicHuntCommandInTransaction(transaction, {
            playerId,
            idempotencyKey,
            commandKind: "start",
            intentHash,
            intentJson: body as unknown as Record<string, unknown>,
          });
          if (claimed.status === "conflict") return error(409, "correlation_conflict");
          const replay = commandReplayResult(claimed.command);
          if (replay) return replay;
          if (root.activeHuntId) {
            const result = error(409, "hunt_already_active");
            await completePublicHuntCommandInTransaction(
              transaction, claimed.command.commandId, result.httpStatus, result.body,
            );
            return result;
          }
          if (root.recoveryReadyAt && root.databaseNow < root.recoveryReadyAt) {
            const result = error(409, "recovery_pending", { recoveryReadyAt: root.recoveryReadyAt.toISOString() });
            await completePublicHuntCommandInTransaction(
              transaction, claimed.command.commandId, result.httpStatus, result.body,
            );
            return result;
          }
          const retainedPending = await loadPendingZoneSelection(transaction, {
            playerId,
            zoneId: selector!.zoneId,
          });
          const pendingEncounterSelection = retainedPending?.selectionJson as
            | SoloHuntPendingEncounterSelection
            | undefined;
          let built: BuiltHuntRuntimeAuthority;
          try {
            built = await this.ports.authority.buildStartRuntime({
              playerId,
              selector: selector!,
              team,
              ...(pendingEncounterSelection ? { pendingEncounterSelection } : {}),
            });
          } catch (cause) {
            if (cause instanceof HuntAuthorityUnavailableError) {
              throw cause;
            }
            const result = error(422, "hunt_not_admissible");
            await completePublicHuntCommandInTransaction(
              transaction, claimed.command.commandId, result.httpStatus, result.body,
            );
            return result;
          }
          const vitality = await initializeAndReconcilePokemonVitalitiesInTransaction(
            transaction,
            {
              ownerPlayerId: playerId,
              maxHpByPokemonInstanceId: built.maxHpByPokemonInstanceId,
              now: root.databaseNow,
            },
          );
          built = this.ports.authority.bindStartVitality(
            built,
            Object.fromEntries(
              vitality.map((entry) => [entry.pokemonInstanceId, entry.currentHp]),
            ),
          );
          const huntRunIdentity = `hunt-run:${crypto.randomUUID()}`;
          const created = createSoloHuntRuntime({
            huntRunIdentity,
            inputs: built.inputs,
            policyRng: randomRngState(),
            combatDeterministicState: { rng: randomRngState() },
            ...(pendingEncounterSelection ? { pendingEncounterSelection } : {}),
          });
          if (!created.accepted) {
            const result = error(422, "hunt_not_admissible");
            await completePublicHuntCommandInTransaction(
              transaction, claimed.command.commandId, result.httpStatus, result.body,
            );
            return result;
          }
          const checkpoint = await createHuntCheckpoint(transaction, {
            subjectPlayerId: playerId,
            huntRunIdentity,
            schemaVersion: SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V2,
            gameDataVersion: built.inputs.context.gameDataVersion,
            rulesVersion: built.inputs.context.rulesVersion,
            logicalTimeMs: created.state.logicalTimeMs,
            logicalTimeAnchorAt: root.databaseNow,
            stateBytes: encodeSoloHuntCheckpointV2(created.state),
            now: root.databaseNow,
          });
          const currentPolicy = await loadCurrentAutoCapturePolicy(transaction, playerId);
          const hunt = await createSoloHuntInTransaction(transaction, {
            playerId,
            checkpointId: checkpoint.checkpointId,
            huntDefinitionId: built.selector.huntDefinitionId,
            zoneId: built.selector.zoneId,
            recoveryDurationMs: built.selector.recoveryDurationMs,
            initialPolicyVersion: currentPolicy?.policyVersion ?? null,
            startedAt: root.databaseNow,
          });
          await insertInitialPolicyIntervalInTransaction(
            transaction,
            hunt.huntId,
            currentPolicy?.policyVersion ?? null,
          );
          await saveHuntInputAuthorityInTransaction(transaction, {
            huntId: hunt.huntId,
            playerId,
            gameDataVersion: built.inputs.context.gameDataVersion,
            rulesVersion: built.inputs.context.rulesVersion,
            runtimeInputsJson: built.persistedInputs,
            individualizationAuthorityVersion: built.individualizationAuthorityVersion,
            individualizationAuthorityKeyId: built.individualizationAuthorityKeyId,
          });
          await syncPendingZoneSelectionInTransaction(transaction, playerId, created.state);
          const ballAuthority = await this.ports.authority.currentBallAuthority();
          const stateResult = await this.stateFromClient(transaction, playerId, ballAuthority);
          if (stateResult.httpStatus !== 200) {
            throw new HuntAuthorityUnavailableError("accepted Hunt state could not be materialized");
          }
          const completed = await completePublicHuntCommandInTransaction(
            transaction, claimed.command.commandId, 200, stateResult.body,
          );
          return commandReplayResult(completed) ?? stateResult;
        }));
    } catch {
      return error(503, "authority_unavailable");
    }
  }

  checkpoint(playerId: string, idempotencyKey: string, huntId: string): Promise<HuntHttpResult> {
    return this.advanceMutation(playerId, idempotencyKey, huntId, "checkpoint");
  }

  claim(playerId: string, idempotencyKey: string, huntId: string): Promise<HuntHttpResult> {
    return this.advanceMutation(playerId, idempotencyKey, huntId, "claim");
  }

  async retreat(playerId: string, idempotencyKey: string, huntId: string): Promise<HuntHttpResult> {
    const advanced = await this.advanceMutation(playerId, idempotencyKey, huntId, "retreat", true);
    if (advanced.httpStatus !== 200 || typeof advanced.body !== "object" || advanced.body === null) return advanced;
    return advanced;
  }

  async capture(
    playerId: string,
    idempotencyKey: string,
    huntId: string,
    body: ManualCaptureRequest,
  ): Promise<HuntHttpResult> {
    const intent = { huntId, ...body };
    const intentHash = await hashNormalizedIntent(intent);
    const source = await withPgClient({ connectionString: this.connectionString }, (client) =>
      loadOwnedSoloHunt(client, playerId, huntId));
    if (!source) {
      const replay = await this.replayBeforeUnboundFailure(
        playerId,
        idempotencyKey,
        "manual_capture",
        intentHash,
        intent as unknown as Record<string, unknown>,
      );
      return replay ?? error(404, "not_found");
    }

    let freeze: HuntHttpResult;
    try {
      freeze = await withPgClient({ connectionString: this.connectionString }, (client) =>
        withTransaction(client, async (transaction) => {
          const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
          if (!root) return error(404, "not_found");
          const claimed = await claimPublicHuntCommandInTransaction(transaction, {
            playerId,
            idempotencyKey,
            commandKind: "manual_capture",
            intentHash,
            intentJson: intent as unknown as Record<string, unknown>,
            sourceHuntId: huntId,
          });
          if (claimed.status === "conflict") return error(409, "correlation_conflict");
          const replay = commandReplayResult(claimed.command);
          if (replay) return replay;
          if (claimed.replayed) {
            return ok({ commandId: claimed.command.commandId }, 102);
          }

          const pending = await loadPendingManualCapture(transaction, playerId, true);
          if (!pending || pending.sourceHuntId !== huntId || pending.encounterId !== body.encounterId) {
            const result = error(409, "capture_unavailable");
            await completePublicHuntCommandInTransaction(
              transaction,
              claimed.command.commandId,
              result.httpStatus,
              result.body,
            );
            return result;
          }

          let serverContext: Record<string, unknown> = { ...claimed.command.serverContext };
          if (body.decision === "attempt") {
            const ballAuthority = await this.ports.authority.currentBallAuthority();
            if (!ballAuthority.balls.some((ball) => ball.itemId === body.selectedItemId)) {
              const result = error(422, "capture_ball_not_authorized");
              await completePublicHuntCommandInTransaction(
                transaction,
                claimed.command.commandId,
                result.httpStatus,
                result.body,
              );
              return result;
            }
            serverContext = {
              ...serverContext,
              ballAuthorityVersion: ballAuthority.version,
              captureRng: rngJson(randomRngState()),
            };
          }

          let advancementHuntId: string | null = null;
          let targetLogicalTimeMs: number | null = null;
          let targetWallClockAt: Date | null = null;
          if (root.activeHuntId) {
            const active = await loadOwnedSoloHunt(transaction, playerId, root.activeHuntId, true);
            if (active && !active.terminalAt) {
              const checkpoint = await loadHuntCheckpoint(transaction, playerId, active.checkpointId);
              if (!checkpoint) throw new HuntAuthorityUnavailableError("manual capture prelude checkpoint is unavailable");
              advancementHuntId = active.huntId;
              targetLogicalTimeMs = checkpoint.logicalTimeMs
                + Math.max(0, Math.floor(root.databaseNow.getTime() - checkpoint.logicalTimeAnchorAt.getTime()));
              targetWallClockAt = root.databaseNow;
              serverContext = {
                ...serverContext,
                preludeCheckpointId: checkpoint.checkpointId,
                preludeCheckpointRowVersion: checkpoint.rowVersion.toString(),
              };
            }
          }
          await updatePublicHuntCommandTargetInTransaction(transaction, claimed.command.commandId, {
            advancementHuntId,
            targetLogicalTimeMs,
            targetWallClockAt,
          });
          await updatePublicHuntCommandServerContextInTransaction(
            transaction,
            claimed.command.commandId,
            serverContext,
          );
          return ok({ commandId: claimed.command.commandId }, 102);
        }));
    } catch (cause) {
      if (cause instanceof HuntAuthorityUnavailableError) return error(503, "authority_unavailable");
      throw cause;
    }
    if (freeze.httpStatus !== 102) return freeze;

    const command = await withPgClient({ connectionString: this.connectionString }, (client) =>
      loadPublicHuntCommand(client, playerId, idempotencyKey));
    if (!command) return error(503, "authority_unavailable");
    const prelude = await this.progressFrozenHuntPreludeOneStep(playerId, command);
    if (prelude.status === "response") return prelude.result;

    try {
      return await withPgClient({ connectionString: this.connectionString }, (client) =>
        withTransaction(client, async (transaction) => {
          const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
          if (!root) return error(404, "not_found");
          const executable = await recheckExecutableCommandInTransaction(transaction, playerId, command);
          if (executable.status === "response") return executable.result;
          const current = executable.command;
          const pending = await loadPendingManualCapture(transaction, playerId, true);
          if (!pending || pending.sourceHuntId !== huntId || pending.encounterId !== body.encounterId) {
            const result = error(409, "capture_unavailable");
            await completePublicHuntCommandInTransaction(
              transaction,
              current.commandId,
              result.httpStatus,
              result.body,
            );
            return result;
          }
          const lockedSource = await loadOwnedSoloHunt(transaction, playerId, huntId, true);
          if (!lockedSource) return error(503, "authority_unavailable");

          if (body.decision === "skip") {
            await closePendingManualCaptureInTransaction(transaction, {
              playerId,
              sourceHuntId: huntId,
              encounterId: body.encounterId,
            });
            const state = await this.stateFromClient(transaction, playerId, { version: "manual-skip", balls: [] });
            const result = ok({
              state: state.body,
              capture: { decision: "skip", encounterId: body.encounterId },
            });
            await completePublicHuntCommandInTransaction(transaction, current.commandId, 200, result.body);
            return result;
          }

          const ballAuthorityVersion = typeof current.serverContext.ballAuthorityVersion === "string"
            ? current.serverContext.ballAuthorityVersion
            : null;
          const captureRng = current.serverContext.captureRng
            && typeof current.serverContext.captureRng === "object"
            && !Array.isArray(current.serverContext.captureRng)
            ? rngFromJson(current.serverContext.captureRng as Record<string, unknown>)
            : null;
          if (!ballAuthorityVersion || !captureRng) {
            throw new Error("Accepted manual capture lacks frozen Ball authority/RNG");
          }
          const ballAuthority = await this.ports.authority.ballAuthority(ballAuthorityVersion);
          if (!ballAuthority) return error(503, "authority_unavailable");
          if (!ballAuthority.balls.some((ball) => ball.itemId === body.selectedItemId)) {
            throw new Error("Frozen manual capture Ball authority no longer matches accepted ItemId");
          }
          const checkpoint = await loadHuntCheckpoint(transaction, playerId, lockedSource.checkpointId);
          const inputAuthority = await loadHuntInputAuthority(transaction, playerId, lockedSource.huntId);
          if (!checkpoint || !inputAuthority) return error(503, "authority_unavailable");
          const inputs = await this.ports.authority.loadPersistedRuntime(inputAuthority);
          const state = decodeCheckpointState(checkpoint.stateBytes);
          const validated = replayValidateSoloHuntCompletedCaptureSource(state, inputs, body.encounterId as never);
          if (!validated.accepted) {
            const result = error(409, "capture_unavailable");
            await completePublicHuntCommandInTransaction(
              transaction,
              current.commandId,
              result.httpStatus,
              result.body,
            );
            return result;
          }
          const inventory = await loadInventory(transaction, playerId, true);
          if (!inventory) return error(503, "authority_unavailable");
          const effect = await this.ports.manualCaptureEffects.attempt({
            transaction,
            playerId,
            sourceHunt: lockedSource,
            state,
            inputs,
            encounterId: body.encounterId,
            selectedItemId: body.selectedItemId,
            attemptCorrelation: `manual:${current.commandId}`,
            captureRng,
            ballAuthorityVersion,
            expectedInventoryRowVersion: inventory.rowVersion,
            now: root.databaseNow,
          });
          if (effect.status === "insufficient_ball") {
            const result = error(409, "insufficient_ball");
            await completePublicHuntCommandInTransaction(
              transaction,
              current.commandId,
              result.httpStatus,
              result.body,
            );
            return result;
          }
          if (effect.status === "authority_unavailable") return error(503, "authority_unavailable");
          await closePendingManualCaptureInTransaction(transaction, {
            playerId,
            sourceHuntId: huntId,
            encounterId: body.encounterId,
          });
          const stateResult = await this.stateFromClient(transaction, playerId, ballAuthority);
          const result = ok({
            state: stateResult.body,
            capture: {
              decision: "attempt",
              encounterId: body.encounterId,
              selectedItemId: body.selectedItemId,
              outcome: effect.success ? "success" : "failure",
              pokemonInstanceId: effect.pokemonInstanceId,
            },
          });
          await completePublicHuntCommandInTransaction(transaction, current.commandId, 200, result.body);
          return result;
        }));
    } catch (cause) {
      if (cause instanceof HuntAuthorityUnavailableError) return error(503, "authority_unavailable");
      throw cause;
    }
  }

  async useItem(
    playerId: string,
    idempotencyKey: string,
    huntId: string,
    body: HuntItemUseRequest,
  ): Promise<HuntHttpResult> {
    const intent = { huntId, ...body };
    const intentHash = await hashNormalizedIntent(intent);
    const frozen = await withPgClient({ connectionString: this.connectionString }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
        const hunt = await loadOwnedSoloHunt(transaction, playerId, huntId, true);
        if (!hunt) {
          const existing = await recheckExistingCommandInTransaction(transaction, {
            playerId,
            idempotencyKey,
            commandKind: "heal_item",
            intentHash,
            intentJson: intent as unknown as Record<string, unknown>,
          });
          if (existing.status === "response") return existing.result;
          return existing.status === "pending"
            ? error(503, "authority_unavailable")
            : error(404, "not_found");
        }
        const existing = await loadPublicHuntCommand(transaction, playerId, idempotencyKey);
        if (existing) {
          const claimed = await claimPublicHuntCommandInTransaction(transaction, {
            playerId,
            idempotencyKey,
            commandKind: "heal_item",
            intentHash,
            intentJson: intent as unknown as Record<string, unknown>,
            sourceHuntId: huntId,
            advancementHuntId: existing.advancementHuntId,
          });
          if (claimed.status === "conflict") return error(409, "correlation_conflict");
          const replay = commandReplayResult(claimed.command);
          if (replay) return replay;
          const healing = await loadHealingCommandByCommandId(
            transaction,
            claimed.command.commandId,
            true,
          );
          if (!healing) throw new Error("Accepted healing command is missing its domain record");
          return ok({
            commandId: claimed.command.commandId,
            checkpointId: typeof claimed.command.serverContext.checkpointId === "string"
              ? claimed.command.serverContext.checkpointId
              : hunt.checkpointId,
            targetLogicalTimeMs: healing.submissionCutoffLogicalTimeMs,
          }, 102);
        }
        if (!root || root.activeHuntId !== huntId || hunt.terminalAt) {
          const claimed = await claimPublicHuntCommandInTransaction(transaction, {
            playerId,
            idempotencyKey,
            commandKind: "heal_item",
            intentHash,
            intentJson: intent as unknown as Record<string, unknown>,
            sourceHuntId: huntId,
            advancementHuntId: huntId,
          });
          if (claimed.status === "conflict") return error(409, "correlation_conflict");
          const result = error(409, "hunt_not_active");
          await completePublicHuntCommandInTransaction(
            transaction,
            claimed.command.commandId,
            result.httpStatus,
            result.body,
          );
          return result;
        }

        const checkpoint = await loadHuntCheckpoint(transaction, playerId, hunt.checkpointId);
        const inputAuthority = await loadHuntInputAuthority(transaction, playerId, hunt.huntId);
        if (!checkpoint || !inputAuthority) return error(503, "authority_unavailable");
        const state = decodeCheckpointState(checkpoint.stateBytes);
        if (!state.pinnedTeam.some(({ pokemonInstanceId }) => pokemonInstanceId === body.targetPokemonInstanceId)) {
          const claimed = await claimPublicHuntCommandInTransaction(transaction, {
            playerId,
            idempotencyKey,
            commandKind: "heal_item",
            intentHash,
            intentJson: intent as unknown as Record<string, unknown>,
            sourceHuntId: huntId,
            advancementHuntId: huntId,
          });
          if (claimed.status === "conflict") return error(409, "correlation_conflict");
          const result = error(422, "hunt_item_target_invalid");
          await completePublicHuntCommandInTransaction(
            transaction,
            claimed.command.commandId,
            result.httpStatus,
            result.body,
          );
          return result;
        }
        let itemRule: Awaited<ReturnType<HuntRuntimeAuthorityPort["currentItemRule"]>>;
        try {
          itemRule = await this.ports.authority.currentItemRule({
            itemId: body.itemId,
            gameDataVersion: state.gameDataVersion,
            rulesVersion: state.rulesVersion,
          });
        } catch {
          return error(503, "authority_unavailable");
        }
        if (!itemRule || itemRule.useKind !== "heal-hp" || healingMagnitude(itemRule) === null) {
          const claimed = await claimPublicHuntCommandInTransaction(transaction, {
            playerId,
            idempotencyKey,
            commandKind: "heal_item",
            intentHash,
            intentJson: intent as unknown as Record<string, unknown>,
            sourceHuntId: huntId,
            advancementHuntId: huntId,
          });
          if (claimed.status === "conflict") return error(409, "correlation_conflict");
          const result = error(422, "hunt_item_not_supported");
          await completePublicHuntCommandInTransaction(
            transaction,
            claimed.command.commandId,
            result.httpStatus,
            result.body,
          );
          return result;
        }
        const inventory = await loadInventory(transaction, playerId, true);
        const claimed = await claimPublicHuntCommandInTransaction(transaction, {
          playerId,
          idempotencyKey,
          commandKind: "heal_item",
          intentHash,
          intentJson: intent as unknown as Record<string, unknown>,
          sourceHuntId: huntId,
          advancementHuntId: huntId,
        });
        if (claimed.status === "conflict") return error(409, "correlation_conflict");
        const replay = commandReplayResult(claimed.command);
        if (replay) return replay;
        if (!inventory || quantityFor(inventory, body.itemId) < 1n) {
          const result = error(409, "insufficient_item");
          await completePublicHuntCommandInTransaction(
            transaction,
            claimed.command.commandId,
            result.httpStatus,
            result.body,
          );
          return result;
        }
        const targetLogicalTimeMs = checkpoint.logicalTimeMs
          + Math.max(0, Math.floor(root.databaseNow.getTime() - checkpoint.logicalTimeAnchorAt.getTime()));
        await updatePublicHuntCommandTargetInTransaction(transaction, claimed.command.commandId, {
          advancementHuntId: huntId,
          targetLogicalTimeMs,
          targetWallClockAt: root.databaseNow,
        });
        await updatePublicHuntCommandServerContextInTransaction(
          transaction,
          claimed.command.commandId,
          {
            itemRuleVersion: itemRule.itemRuleVersion,
            gameDataVersion: state.gameDataVersion,
            rulesVersion: state.rulesVersion,
            checkpointId: hunt.checkpointId,
            checkpointRowVersion: checkpoint.rowVersion.toString(),
          },
        );
        await createHealingCommandInTransaction(transaction, {
          commandId: claimed.command.commandId,
          playerId,
          sourceHuntId: huntId,
          itemId: body.itemId,
          targetPokemonInstanceId: body.targetPokemonInstanceId,
          itemRuleVersion: itemRule.itemRuleVersion,
          gameDataVersion: state.gameDataVersion,
          rulesVersion: state.rulesVersion,
          submissionCutoffLogicalTimeMs: targetLogicalTimeMs,
          submissionPhase: null,
          submissionEncounterId: null,
          dueLogicalTimeMs: null,
          acceptanceSequence: claimed.command.acceptanceSequence,
        });
        return ok({
          commandId: claimed.command.commandId,
          checkpointId: hunt.checkpointId,
          targetLogicalTimeMs,
        }, 102);
      }));
    if (frozen.httpStatus !== 102) return frozen;
    const context = frozen.body as {
      readonly commandId: string;
      readonly checkpointId: string;
      readonly targetLogicalTimeMs: number;
    };
    try {
      return await this.progressHealingCommandOneStep(
        playerId,
        idempotencyKey,
        huntId,
        context,
      );
    } catch {
      return error(503, "authority_unavailable");
    }
  }

  async replaceAutoCapturePolicy(
    playerId: string,
    idempotencyKey: string,
    body: AutoCapturePolicyReplaceRequest,
  ): Promise<HuntHttpResult> {
    const intentHash = await hashNormalizedIntent(body);
    const expected = BigInt(body.expectedRowVersion);
    const speciesIds = [...new Set(body.rules.flatMap(({ when }) => when.speciesIds ?? []))];
    const zoneIds = [...new Set(body.rules.flatMap(({ when }) => when.zoneIds ?? []))];
    const huntDefinitionIds = [...new Set(body.rules.flatMap(({ when }) => when.huntDefinitionIds ?? []))];

    let freeze: HuntHttpResult;
    try {
      freeze = await withPgClient({ connectionString: this.connectionString }, (client) =>
        withTransaction(client, async (transaction) => {
          const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
          if (!root) return error(404, "not_found");
          const existing = await loadPublicHuntCommand(transaction, playerId, idempotencyKey);
          if (existing) {
            const claimed = await claimPublicHuntCommandInTransaction(transaction, {
              playerId,
              idempotencyKey,
              commandKind: "policy_replace",
              intentHash,
              intentJson: body as unknown as Record<string, unknown>,
              advancementHuntId: existing.advancementHuntId,
            });
            if (claimed.status === "conflict") return error(409, "correlation_conflict");
            const replay = commandReplayResult(claimed.command);
            return replay ?? ok({ commandId: claimed.command.commandId }, 102);
          }

          if (root.policyRowVersion !== expected) {
            const claimed = await claimPublicHuntCommandInTransaction(transaction, {
              playerId,
              idempotencyKey,
              commandKind: "policy_replace",
              intentHash,
              intentJson: body as unknown as Record<string, unknown>,
            });
            if (claimed.status === "conflict") return error(409, "correlation_conflict");
            const result = error(409, "stale");
            await completePublicHuntCommandInTransaction(
              transaction,
              claimed.command.commandId,
              result.httpStatus,
              result.body,
            );
            return result;
          }

          const [ballAuthority, contentAuthority] = await Promise.all([
            this.ports.authority.currentBallAuthority(),
            this.ports.authority.validatePolicyReferences({ speciesIds, zoneIds, huntDefinitionIds }),
          ]);
          const claimed = await claimPublicHuntCommandInTransaction(transaction, {
            playerId,
            idempotencyKey,
            commandKind: "policy_replace",
            intentHash,
            intentJson: body as unknown as Record<string, unknown>,
          });
          if (claimed.status === "conflict") return error(409, "correlation_conflict");

          const relationshipError = validateAutoCapturePolicyRelationships(body);
          if (relationshipError || !contentAuthority.accepted) {
            const result = error(422, "auto_capture_policy_invalid");
            await completePublicHuntCommandInTransaction(
              transaction,
              claimed.command.commandId,
              result.httpStatus,
              result.body,
            );
            return result;
          }
          const authorityBallIds = new Set(ballAuthority.balls.map(({ itemId }) => itemId));
          if (body.balls.some(({ itemId }) => !authorityBallIds.has(itemId))
            || body.rules.some(({ selectedItemId }) => !authorityBallIds.has(selectedItemId))) {
            const result = error(422, "capture_ball_not_authorized");
            await completePublicHuntCommandInTransaction(
              transaction,
              claimed.command.commandId,
              result.httpStatus,
              result.body,
            );
            return result;
          }

          let advancementHuntId: string | null = null;
          let targetLogicalTimeMs: number | null = null;
          let targetWallClockAt: Date | null = null;
          let serverContext: Record<string, unknown> = {
            ballAuthorityVersion: ballAuthority.version,
            validationGameDataVersion: contentAuthority.gameDataVersion,
          };
          if (root.activeHuntId) {
            const active = await loadOwnedSoloHunt(transaction, playerId, root.activeHuntId, true);
            if (active && !active.terminalAt) {
              const checkpoint = await loadHuntCheckpoint(transaction, playerId, active.checkpointId);
              if (!checkpoint) throw new HuntAuthorityUnavailableError("policy prelude checkpoint is unavailable");
              advancementHuntId = active.huntId;
              targetLogicalTimeMs = checkpoint.logicalTimeMs
                + Math.max(0, Math.floor(root.databaseNow.getTime() - checkpoint.logicalTimeAnchorAt.getTime()));
              targetWallClockAt = root.databaseNow;
              serverContext = {
                ...serverContext,
                preludeCheckpointId: checkpoint.checkpointId,
                preludeCheckpointRowVersion: checkpoint.rowVersion.toString(),
              };
            }
          }
          await updatePublicHuntCommandTargetInTransaction(transaction, claimed.command.commandId, {
            advancementHuntId,
            targetLogicalTimeMs,
            targetWallClockAt,
          });
          await updatePublicHuntCommandServerContextInTransaction(
            transaction,
            claimed.command.commandId,
            serverContext,
          );
          return ok({ commandId: claimed.command.commandId }, 102);
        }));
    } catch (cause) {
      if (cause instanceof HuntAuthorityUnavailableError) return error(503, "authority_unavailable");
      throw cause;
    }
    if (freeze.httpStatus !== 102) return freeze;

    const command = await withPgClient({ connectionString: this.connectionString }, (client) =>
      loadPublicHuntCommand(client, playerId, idempotencyKey));
    if (!command) return error(503, "authority_unavailable");
    const prelude = await this.progressFrozenHuntPreludeOneStep(playerId, command);
    if (prelude.status === "response") return prelude.result;

    return withPgClient({ connectionString: this.connectionString }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
        if (!root) return error(404, "not_found");
        const executable = await recheckExecutableCommandInTransaction(transaction, playerId, command);
        if (executable.status === "response") return executable.result;
        const current = executable.command;
        if (root.policyRowVersion !== expected) {
          const result = error(409, "stale");
          await completePublicHuntCommandInTransaction(
            transaction,
            current.commandId,
            result.httpStatus,
            result.body,
          );
          return result;
        }
        const ballAuthorityVersion = typeof current.serverContext.ballAuthorityVersion === "string"
          ? current.serverContext.ballAuthorityVersion
          : null;
        const validationGameDataVersion = typeof current.serverContext.validationGameDataVersion === "string"
          ? current.serverContext.validationGameDataVersion
          : null;
        if (!ballAuthorityVersion || !validationGameDataVersion) {
          throw new Error("Accepted policy save lacks frozen authority identities");
        }

        let effectiveAt: { huntId: string; logicalTimeMs: string } | null = null;
        if (current.advancementHuntId !== null && current.targetLogicalTimeMs !== null) {
          const frozenHunt = await loadOwnedSoloHunt(
            transaction,
            playerId,
            current.advancementHuntId,
            true,
          );
          if (frozenHunt && !frozenHunt.terminalAt) {
            const checkpoint = await loadHuntCheckpoint(transaction, playerId, frozenHunt.checkpointId);
            if (!checkpoint) return error(503, "authority_unavailable");
            if (checkpoint.logicalTimeMs > current.targetLogicalTimeMs) {
              const result = error(409, "command_superseded");
              await completePublicHuntCommandInTransaction(
                transaction,
                current.commandId,
                result.httpStatus,
                result.body,
              );
              return result;
            }
            if (checkpoint.logicalTimeMs < current.targetLogicalTimeMs) {
              return inProgress(checkpoint.logicalTimeMs, current.targetLogicalTimeMs);
            }
            effectiveAt = {
              huntId: frozenHunt.huntId,
              logicalTimeMs: checkpoint.logicalTimeMs.toString(),
            };
          }
        }
        const inserted = await insertAutoCapturePolicyInTransaction(transaction, {
          playerId,
          expectedRowVersion: expected,
          ballAuthorityVersion,
          validationGameDataVersion,
          enabled: body.enabled,
          policyJson: {
            enabled: body.enabled,
            balls: body.balls,
            rules: body.rules,
          },
          effectiveHuntId: effectiveAt?.huntId ?? null,
          effectiveLogicalTimeMs: effectiveAt ? Number(effectiveAt.logicalTimeMs) : null,
        });
        if (inserted.status === "stale") {
          const result = error(409, "stale");
          await completePublicHuntCommandInTransaction(
            transaction,
            current.commandId,
            result.httpStatus,
            result.body,
          );
          return result;
        }
        const resultBody = {
          policy: {
            policyVersion: inserted.policy.policyVersion,
            ballAuthorityVersion: inserted.policy.ballAuthorityVersion,
            rowVersion: inserted.policy.rowVersion.toString(),
            ...inserted.policy.policyJson,
          },
          effectiveAt,
        };
        await completePublicHuntCommandInTransaction(transaction, current.commandId, 200, resultBody);
        return ok(resultBody);
      }));
  }

  private async recheckExistingCommand(
    playerId: string,
    idempotencyKey: string,
    commandKind: HuntPublicCommandKind,
    intentHash: Uint8Array,
    intentJson: Record<string, unknown>,
  ): Promise<ExistingCommandRecheck> {
    return withPgClient({ connectionString: this.connectionString }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
        if (!root) return { status: "absent" } as const;
        return recheckExistingCommandInTransaction(transaction, {
          playerId,
          idempotencyKey,
          commandKind,
          intentHash,
          intentJson,
        });
      }));
  }

  private async replayBeforeUnboundFailure(
    playerId: string,
    idempotencyKey: string,
    commandKind: HuntPublicCommandKind,
    intentHash: Uint8Array,
    intentJson: Record<string, unknown>,
  ): Promise<HuntHttpResult | null> {
    const existing = await this.recheckExistingCommand(
      playerId,
      idempotencyKey,
      commandKind,
      intentHash,
      intentJson,
    );
    if (existing.status === "absent") return null;
    if (existing.status === "response") return existing.result;
    return error(503, "authority_unavailable");
  }

  private async resolveEarliestDueHealAtBoundary(
    playerId: string,
    hunt: SoloHuntRecord,
    logicalTimeMs: number,
    beforeAcceptanceSequence?: bigint,
  ): Promise<
    | { readonly status: "none" }
    | { readonly status: "resolved"; readonly commandId: string; readonly result: HuntHttpResult }
    | { readonly status: "retry" }
    | { readonly status: "authority_unavailable" }
  > {
    const candidate = await withPgClient({ connectionString: this.connectionString }, (client) =>
      loadEarliestDueHealingCommand(client, { huntId: hunt.huntId, logicalTimeMs }));
    if (!candidate) return { status: "none" };
    if (beforeAcceptanceSequence !== undefined && candidate.acceptanceSequence >= beforeAcceptanceSequence) {
      return { status: "none" };
    }

    let rule: Awaited<ReturnType<HuntRuntimeAuthorityPort["itemRule"]>>;
    let ballAuthority: CaptureBallAuthorityRelease;
    try {
      [rule, ballAuthority] = await Promise.all([
        this.ports.authority.itemRule({
          itemId: candidate.itemId,
          itemRuleVersion: candidate.itemRuleVersion,
          gameDataVersion: candidate.gameDataVersion,
          rulesVersion: candidate.rulesVersion,
        }),
        this.ports.authority.currentBallAuthority(),
      ]);
    } catch {
      return { status: "authority_unavailable" };
    }
    const magnitude = healingMagnitude(rule);
    if (!magnitude) return { status: "authority_unavailable" };

    return withPgClient({ connectionString: this.connectionString }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
        if (!root) throw new Error("Due heal lost Player Hunt root");
        const lockedHunt = await loadOwnedSoloHunt(transaction, playerId, hunt.huntId, true);
        if (!lockedHunt || lockedHunt.terminalAt) return { status: "none" } as const;
        const due = await loadEarliestDueHealingCommand(
          transaction,
          { huntId: hunt.huntId, logicalTimeMs },
          true,
        );
        if (!due) return { status: "none" } as const;
        if (due.commandId !== candidate.commandId) return { status: "retry" } as const;
        if (due.dueLogicalTimeMs !== logicalTimeMs) {
          if (due.dueLogicalTimeMs !== null && due.dueLogicalTimeMs < logicalTimeMs) {
            throw new Error("Hunt advanced past an unresolved healing boundary");
          }
          return { status: "none" } as const;
        }

        const checkpoint = await loadHuntCheckpoint(transaction, playerId, hunt.checkpointId, true);
        const inputAuthority = await loadHuntInputAuthority(transaction, playerId, hunt.huntId);
        if (!checkpoint || !inputAuthority) return { status: "authority_unavailable" } as const;
        if (checkpoint.logicalTimeMs !== logicalTimeMs) {
          throw new Error("Due heal checkpoint is not at its frozen logical boundary");
        }
        const state = decodeCheckpointState(checkpoint.stateBytes);
        if (state.status !== "active" || !state.interBattle) {
          throw new Error("Due heal is not at an active inter-Battle boundary");
        }
        let inputs: SoloHuntRuntimeInputs;
        try {
          inputs = await this.ports.authority.loadPersistedRuntime(inputAuthority);
        } catch {
          return { status: "authority_unavailable" } as const;
        }

        const teamEntry = publicTeam(state).find(
          ({ pokemonInstanceId }) => pokemonInstanceId === due.targetPokemonInstanceId,
        );
        const completeNotApplied = async (
          reason: "target_ineligible" | "insufficient_item",
        ): Promise<{ readonly status: "resolved"; readonly commandId: string; readonly result: HuntHttpResult }> => {
          await resolveHealingCommandInTransaction(transaction, {
            commandId: due.commandId,
            outcome: "not_applied",
            reason,
            healedHp: 0,
          });
          const stateResult = await this.stateFromClient(transaction, playerId, ballAuthority);
          const result = ok({
            state: stateResult.body,
            itemUse: {
              itemId: due.itemId,
              targetPokemonInstanceId: due.targetPokemonInstanceId,
              outcome: "not_applied",
              healedHp: 0,
              reason,
            },
          });
          const completed = await completePublicHuntCommandInTransaction(
            transaction,
            due.commandId,
            200,
            result.body,
          );
          return {
            status: "resolved",
            commandId: due.commandId,
            result: commandReplayResult(completed) ?? result,
          };
        };

        if (!teamEntry || teamEntry.currentHp <= 0 || teamEntry.currentHp >= teamEntry.maxHp) {
          return completeNotApplied("target_ineligible");
        }
        const inventory = await loadInventory(transaction, playerId, true);
        if (!inventory) return { status: "authority_unavailable" } as const;
        if (quantityFor(inventory, due.itemId) < 1n) return completeNotApplied("insufficient_item");

        const healed = applySoloHuntExplicitHealing(state, inputs, {
          sourceIdentity: `heal:${due.commandId}`,
          acceptanceSequence: due.acceptanceSequence.toString(),
          targetPokemonInstanceId: due.targetPokemonInstanceId as never,
          magnitude,
        });
        if (!healed.accepted) {
          throw new Error(`Due heal failed deterministic application: ${healed.reason}`);
        }
        const debit = await removeInventoryEntriesInTransaction(transaction, {
          playerId,
          expectedRowVersion: inventory.rowVersion,
          removals: [{ itemId: due.itemId, quantity: 1n }],
          now: root.databaseNow,
        });
        if (debit.status === "insufficient") return completeNotApplied("insufficient_item");
        if (debit.status !== "updated") {
          throw new Error(`Due heal Inventory debit failed: ${debit.status}`);
        }
        const persisted = await persistOwnedHuntCheckpointInTransaction(transaction, {
          playerId,
          checkpointId: hunt.checkpointId,
          expectedRowVersion: checkpoint.rowVersion,
          schemaVersion: SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V2,
          logicalTimeMs: healed.state.logicalTimeMs,
          stateBytes: encodeSoloHuntCheckpointV2(healed.state),
        });
        if (persisted.status !== "updated") {
          throw new Error(`Due heal checkpoint persistence failed: ${persisted.status}`);
        }
        await resolveHealingCommandInTransaction(transaction, {
          commandId: due.commandId,
          outcome: "applied",
          reason: null,
          healedHp: healed.event.healedHp,
        });
        const stateResult = await this.stateFromClient(transaction, playerId, ballAuthority);
        const result = ok({
          state: stateResult.body,
          itemUse: {
            itemId: due.itemId,
            targetPokemonInstanceId: due.targetPokemonInstanceId,
            outcome: "applied",
            healedHp: healed.event.healedHp,
            reason: null,
          },
        });
        const completed = await completePublicHuntCommandInTransaction(
          transaction,
          due.commandId,
          200,
          result.body,
        );
        return {
          status: "resolved",
          commandId: due.commandId,
          result: commandReplayResult(completed) ?? result,
        } as const;
      }));
  }

  private async progressEarliestHealingBlockerAtBoundary(
    playerId: string,
    hunt: SoloHuntRecord,
    state: SoloHuntRuntimeState,
    beforeAcceptanceSequence?: bigint,
  ): Promise<
    | { readonly status: "none" }
    | { readonly status: "progressed" }
    | { readonly status: "resolved"; readonly commandId: string; readonly result: HuntHttpResult }
    | { readonly status: "authority_unavailable" }
  > {
    const candidate = await withPgClient({ connectionString: this.connectionString }, (client) =>
      loadEarliestHealingAdvanceBlocker(client, {
        huntId: hunt.huntId,
        logicalTimeMs: state.logicalTimeMs,
      }));
    if (!candidate) return { status: "none" };
    const candidateFence = healingAdvanceFenceLogicalTimeMs(candidate);
    if (candidateFence < state.logicalTimeMs) {
      throw new Error("Hunt advanced past an unresolved healing advancement fence");
    }
    if (candidateFence !== state.logicalTimeMs) return { status: "none" };
    if (beforeAcceptanceSequence !== undefined && candidate.acceptanceSequence >= beforeAcceptanceSequence) {
      return { status: "none" };
    }

    if (candidate.submissionPhase !== null) {
      const due = await this.resolveEarliestDueHealAtBoundary(
        playerId,
        hunt,
        state.logicalTimeMs,
        beforeAcceptanceSequence,
      );
      if (due.status === "authority_unavailable") return due;
      if (due.status === "resolved") return due;
      if (due.status === "retry") return { status: "progressed" };
      return { status: "none" };
    }

    return withPgClient({ connectionString: this.connectionString }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
        if (!root) throw new Error("Healing classification lost Player Hunt root");
        const lockedHunt = await loadOwnedSoloHunt(transaction, playerId, hunt.huntId, true);
        if (!lockedHunt || lockedHunt.terminalAt) return { status: "none" } as const;
        const locked = await loadEarliestHealingAdvanceBlocker(
          transaction,
          { huntId: hunt.huntId, logicalTimeMs: state.logicalTimeMs },
          true,
        );
        if (!locked) return { status: "none" } as const;
        const lockedFence = healingAdvanceFenceLogicalTimeMs(locked);
        if (lockedFence < state.logicalTimeMs) {
          throw new Error("Hunt advanced past an unresolved healing advancement fence");
        }
        if (lockedFence !== state.logicalTimeMs) return { status: "none" } as const;
        if (beforeAcceptanceSequence !== undefined && locked.acceptanceSequence >= beforeAcceptanceSequence) {
          return { status: "none" } as const;
        }
        if (locked.commandId !== candidate.commandId || locked.submissionPhase !== null) {
          return { status: "progressed" } as const;
        }
        if (!state.interBattle && !state.currentEncounter) {
          throw new Error("Healing submission cutoff is neither Battle nor inter-Battle");
        }
        await classifyHealingCommandInTransaction(transaction, {
          commandId: locked.commandId,
          submissionPhase: state.interBattle ? "inter_battle" : "battle",
          submissionEncounterId: state.currentEncounter?.encounterId ?? null,
          dueLogicalTimeMs: state.interBattle ? state.logicalTimeMs : null,
        });
        return { status: "progressed" } as const;
      }));
  }

  private async progressHealingCommandOneStep(
    playerId: string,
    idempotencyKey: string,
    huntId: string,
    frozen: {
      readonly commandId: string;
      readonly checkpointId: string;
      readonly targetLogicalTimeMs: number;
    },
  ): Promise<HuntHttpResult> {
    const snapshot = await withPgClient({ connectionString: this.connectionString }, async (client) => {
      const hunt = await loadOwnedSoloHunt(client, playerId, huntId);
      const checkpoint = await loadHuntCheckpoint(client, playerId, frozen.checkpointId);
      const inputAuthority = await loadHuntInputAuthority(client, playerId, huntId);
      const command = await loadPublicHuntCommand(client, playerId, idempotencyKey);
      const healing = command
        ? await loadHealingCommandByCommandId(client, command.commandId)
        : null;
      if (!hunt || !checkpoint || !inputAuthority || !command || !healing) return null;
      return { hunt, checkpoint, inputAuthority, command, healing };
    });
    if (!snapshot) return error(404, "not_found");
    const replay = commandReplayResult(snapshot.command);
    if (replay) return replay;
    if (snapshot.command.commandId !== frozen.commandId) return error(409, "correlation_conflict");

    if (snapshot.hunt.terminalAt) {
      return withPgClient({ connectionString: this.connectionString }, (client) =>
        withTransaction(client, async (transaction) => {
          const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
          if (!root) return error(404, "not_found");
          const healing = await loadHealingCommandByCommandId(transaction, frozen.commandId, true);
          if (healing?.status === "scheduled") {
            await resolveHealingCommandInTransaction(transaction, {
              commandId: frozen.commandId,
              outcome: "not_applied",
              reason: "hunt_terminal",
              healedHp: 0,
            });
          }
          let ballAuthority: CaptureBallAuthorityRelease;
          try {
            ballAuthority = await this.ports.authority.currentBallAuthority();
          } catch {
            return error(503, "authority_unavailable");
          }
          const stateResult = await this.stateFromClient(transaction, playerId, ballAuthority);
          const result = ok({
            state: stateResult.body,
            itemUse: {
              itemId: snapshot.healing.itemId,
              targetPokemonInstanceId: snapshot.healing.targetPokemonInstanceId,
              outcome: "not_applied",
              healedHp: 0,
              reason: "hunt_terminal",
            },
          });
          const completed = await completePublicHuntCommandInTransaction(
            transaction,
            frozen.commandId,
            200,
            result.body,
          );
          return commandReplayResult(completed) ?? result;
        }));
    }

    const inputs = await this.ports.authority.loadPersistedRuntime(snapshot.inputAuthority);
    let state = decodeCheckpointState(snapshot.checkpoint.stateBytes);

    const incomplete = await withPgClient({ connectionString: this.connectionString }, (client) =>
      loadEarliestIncompleteEncounterBoundary(client, snapshot.hunt.huntId));
    if (incomplete) {
      const boundaryResult = await this.completeBoundary(
        playerId,
        snapshot.hunt,
        snapshot.command,
        state,
        inputs,
        incomplete,
      );
      return boundaryResult.httpStatus === 204
        ? inProgress(state.logicalTimeMs, frozen.targetLogicalTimeMs)
        : boundaryResult;
    }

    if (state.status === "active") {
      const healingProgress = await this.progressEarliestHealingBlockerAtBoundary(
        playerId,
        snapshot.hunt,
        state,
      );
      if (healingProgress.status === "authority_unavailable") return error(503, "authority_unavailable");
      if (healingProgress.status === "resolved") {
        return healingProgress.commandId === frozen.commandId
          ? healingProgress.result
          : inProgress(state.logicalTimeMs, frozen.targetLogicalTimeMs);
      }
      if (healingProgress.status === "progressed") {
        return inProgress(state.logicalTimeMs, frozen.targetLogicalTimeMs);
      }
    }

    if (snapshot.healing.submissionPhase === "battle" && snapshot.healing.dueLogicalTimeMs === null) {
      return ok({
        status: "waiting_boundary",
        huntId,
        targetPokemonInstanceId: snapshot.healing.targetPokemonInstanceId,
      }, 202);
    }

    if (state.logicalTimeMs < frozen.targetLogicalTimeMs && state.status === "active") {
      const blocker = await withPgClient({ connectionString: this.connectionString }, (client) =>
        loadEarliestHealingAdvanceBlocker(
          client,
          { huntId: snapshot.hunt.huntId, logicalTimeMs: frozen.targetLogicalTimeMs },
        ));
      const blockerFence = blocker ? healingAdvanceFenceLogicalTimeMs(blocker) : null;
      const advanceTarget = blockerFence !== null && blockerFence > state.logicalTimeMs
        ? Math.min(frozen.targetLogicalTimeMs, blockerFence)
        : frozen.targetLogicalTimeMs;
      const advanced = advanceSoloHuntToEncounterBoundaryOrCutoff(state, inputs, advanceTarget);
      if (!advanced.accepted) throw new Error(advanced.reason);
      state = advanced.state;
      const persisted = await this.persistAdvancedStateAndMaybeBoundary(
        playerId,
        snapshot.hunt,
        snapshot.command,
        snapshot.checkpoint.rowVersion,
        state,
        inputs,
        advanced.stopReason,
      );
      if (persisted.httpStatus !== 204) return persisted;
      if (advanced.stopReason === "encounterBoundary") return inProgress(state.logicalTimeMs, frozen.targetLogicalTimeMs);
      if (blockerFence === state.logicalTimeMs) return inProgress(state.logicalTimeMs, frozen.targetLogicalTimeMs);
    }

    if (state.status === "terminal") {
      return this.finalizeTerminalHealingCommand(
        playerId,
        snapshot.hunt,
        snapshot.command,
        state,
        snapshot.healing,
      );
    }
    if (state.logicalTimeMs < frozen.targetLogicalTimeMs) {
      return inProgress(state.logicalTimeMs, frozen.targetLogicalTimeMs);
    }

    let healing = snapshot.healing;
    if (healing.submissionPhase === null) {
      healing = await withPgClient({ connectionString: this.connectionString }, (client) =>
        withTransaction(client, async (transaction) => {
          const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
          if (!root) throw new Error("Healing classification lost Player Hunt root");
          const current = await loadHealingCommandByCommandId(transaction, frozen.commandId, true);
          if (!current) throw new Error("Healing classification lost domain record");
          if (current.submissionPhase !== null) return current;
          return classifyHealingCommandInTransaction(transaction, {
            commandId: frozen.commandId,
            submissionPhase: state.interBattle ? "inter_battle" : "battle",
            submissionEncounterId: state.currentEncounter?.encounterId ?? null,
            dueLogicalTimeMs: state.interBattle ? state.logicalTimeMs : null,
          });
        }));
    }

    if (healing.submissionPhase === "battle" && healing.dueLogicalTimeMs === null) {
      return ok({
        status: "waiting_boundary",
        huntId,
        targetPokemonInstanceId: healing.targetPokemonInstanceId,
      }, 202);
    }
    if (!state.interBattle || healing.dueLogicalTimeMs !== state.logicalTimeMs) {
      return inProgress(state.logicalTimeMs, frozen.targetLogicalTimeMs);
    }
    const due = await this.resolveEarliestDueHealAtBoundary(playerId, snapshot.hunt, state.logicalTimeMs);
    if (due.status === "authority_unavailable") return error(503, "authority_unavailable");
    if (due.status === "resolved") {
      return due.commandId === frozen.commandId
        ? due.result
        : inProgress(state.logicalTimeMs, frozen.targetLogicalTimeMs);
    }
    return inProgress(state.logicalTimeMs, frozen.targetLogicalTimeMs);
  }

  private async terminalizePreludeHunt(
    playerId: string,
    hunt: SoloHuntRecord,
    command: HuntPublicCommandRecord,
    state: SoloHuntRuntimeState,
  ): Promise<HuntHttpResult | null> {
    const terminalReason = noLivingHuntDisposition(state.terminalReason);
    return withPgClient({ connectionString: this.connectionString }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
        if (!root) return error(404, "not_found");
        const executable = await recheckExecutableCommandInTransaction(transaction, playerId, command);
        if (executable.status === "response") return executable.result;
        const locked = await loadOwnedSoloHunt(transaction, playerId, hunt.huntId, true);
        if (!locked || locked.terminalAt) return null;
        await writeBackTerminalVitalityIfRequired(transaction, {
          playerId,
          huntId: hunt.huntId,
          state,
          now: root.databaseNow,
        });
        await terminalizeSoloHuntInTransaction(transaction, {
          playerId,
          huntId: hunt.huntId,
          terminalReason,
          recoveryDurationMs: hunt.recoveryDurationMs,
        });
        await cancelScheduledHealingCommandsForHuntInTransaction(transaction, hunt.huntId);
        return null;
      }));
  }

  private async progressFrozenHuntPreludeOneStep(
    playerId: string,
    command: HuntPublicCommandRecord,
  ): Promise<{ readonly status: "done" } | { readonly status: "response"; readonly result: HuntHttpResult }> {
    const huntId = command.advancementHuntId;
    const targetLogicalTimeMs = command.targetLogicalTimeMs;
    if (huntId === null || targetLogicalTimeMs === null) return { status: "done" };

    const snapshot = await withPgClient({ connectionString: this.connectionString }, async (client) => {
      const [hunt, checkpoint, inputAuthority, latestCommand] = await Promise.all([
        loadOwnedSoloHunt(client, playerId, huntId),
        command.serverContext.preludeCheckpointId && typeof command.serverContext.preludeCheckpointId === "string"
          ? loadHuntCheckpoint(client, playerId, command.serverContext.preludeCheckpointId)
          : Promise.resolve(null),
        loadHuntInputAuthority(client, playerId, huntId),
        loadPublicHuntCommand(client, playerId, command.idempotencyKey),
      ]);
      if (!hunt || !inputAuthority || !latestCommand) return null;
      const resolvedCheckpoint = checkpoint ?? await loadHuntCheckpoint(client, playerId, hunt.checkpointId);
      return resolvedCheckpoint ? { hunt, checkpoint: resolvedCheckpoint, inputAuthority, command: latestCommand } : null;
    });
    if (!snapshot) return { status: "response", result: error(503, "authority_unavailable") };
    const replay = commandReplayResult(snapshot.command);
    if (replay) return { status: "response", result: replay };
    if (snapshot.hunt.terminalAt) return { status: "done" };

    const inputs = await this.ports.authority.loadPersistedRuntime(snapshot.inputAuthority);
    let state = decodeCheckpointState(snapshot.checkpoint.stateBytes);
    if (state.logicalTimeMs > targetLogicalTimeMs) {
      const result = error(409, "command_superseded");
      const serialized = await withPgClient({ connectionString: this.connectionString }, (client) =>
        withTransaction(client, async (transaction) => {
          const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
          if (!root) return error(404, "not_found");
          const executable = await recheckExecutableCommandInTransaction(
            transaction,
            playerId,
            snapshot.command,
          );
          if (executable.status === "response") return executable.result;
          const checkpoint = await loadHuntCheckpoint(
            transaction,
            playerId,
            snapshot.checkpoint.checkpointId,
          );
          if (!checkpoint) return error(503, "authority_unavailable");
          if (checkpoint.logicalTimeMs <= targetLogicalTimeMs) {
            return inProgress(checkpoint.logicalTimeMs, targetLogicalTimeMs);
          }
          const completed = await completePublicHuntCommandInTransaction(
            transaction,
            executable.command.commandId,
            result.httpStatus,
            result.body,
          );
          return commandReplayResult(completed) ?? result;
        }));
      return { status: "response", result: serialized };
    }

    const incomplete = await withPgClient({ connectionString: this.connectionString }, (client) =>
      loadEarliestIncompleteEncounterBoundary(client, huntId));
    if (incomplete) {
      const result = await this.completeBoundary(
        playerId,
        snapshot.hunt,
        snapshot.command,
        state,
        inputs,
        incomplete,
      );
      return result.httpStatus === 204
        ? { status: "response", result: inProgress(state.logicalTimeMs, targetLogicalTimeMs) }
        : { status: "response", result };
    }

    if (state.status === "active") {
      const healingProgress = await this.progressEarliestHealingBlockerAtBoundary(
        playerId,
        snapshot.hunt,
        state,
      );
      if (healingProgress.status === "authority_unavailable") {
        return { status: "response", result: error(503, "authority_unavailable") };
      }
      if (healingProgress.status === "resolved" || healingProgress.status === "progressed") {
        return { status: "response", result: inProgress(state.logicalTimeMs, targetLogicalTimeMs) };
      }
    }

    if (state.status === "terminal") {
      const terminalized = await this.terminalizePreludeHunt(
        playerId,
        snapshot.hunt,
        snapshot.command,
        state,
      );
      if (terminalized) return { status: "response", result: terminalized };
      return { status: "done" };
    }
    if (state.logicalTimeMs === targetLogicalTimeMs) return { status: "done" };

    const blocker = await withPgClient({ connectionString: this.connectionString }, (client) =>
      loadEarliestHealingAdvanceBlocker(client, { huntId, logicalTimeMs: targetLogicalTimeMs }));
    const blockerFence = blocker ? healingAdvanceFenceLogicalTimeMs(blocker) : null;
    const advanceTarget = blockerFence !== null && blockerFence > state.logicalTimeMs
      ? Math.min(targetLogicalTimeMs, blockerFence)
      : targetLogicalTimeMs;
    const advanced = advanceSoloHuntToEncounterBoundaryOrCutoff(state, inputs, advanceTarget);
    if (!advanced.accepted) throw new Error(advanced.reason);
    state = advanced.state;
    const persisted = await this.persistAdvancedStateAndMaybeBoundary(
      playerId,
      snapshot.hunt,
      snapshot.command,
      snapshot.checkpoint.rowVersion,
      state,
      inputs,
      advanced.stopReason,
    );
    if (persisted.httpStatus !== 204) return { status: "response", result: persisted };
    if (advanced.stopReason === "encounterBoundary" || blockerFence === state.logicalTimeMs) {
      return { status: "response", result: inProgress(state.logicalTimeMs, targetLogicalTimeMs) };
    }
    if (state.status === "terminal") {
      const terminalized = await this.terminalizePreludeHunt(
        playerId,
        snapshot.hunt,
        snapshot.command,
        state,
      );
      if (terminalized) return { status: "response", result: terminalized };
      return { status: "done" };
    }
    return state.logicalTimeMs === targetLogicalTimeMs
      ? { status: "done" }
      : { status: "response", result: inProgress(state.logicalTimeMs, targetLogicalTimeMs) };
  }

  private async advanceMutation(
    playerId: string,
    idempotencyKey: string,
    huntId: string,
    kind: Extract<HuntPublicCommandKind, "checkpoint" | "claim" | "retreat">,
    terminalizeAfterCutoff = false,
  ): Promise<HuntHttpResult> {
    const intent = { huntId };
    const intentHash = await hashNormalizedIntent(intent);
    const freeze = await withPgClient({ connectionString: this.connectionString }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
        if (!root) return error(404, "not_found");
        const existing = await recheckExistingCommandInTransaction(transaction, {
          playerId,
          idempotencyKey,
          commandKind: kind,
          intentHash,
          intentJson: intent,
        });
        const hunt = await loadOwnedSoloHunt(transaction, playerId, huntId, true);
        if (!hunt) {
          if (existing.status === "response") return existing.result;
          return existing.status === "pending"
            ? error(503, "authority_unavailable")
            : error(404, "not_found");
        }
        const checkpoint = await loadHuntCheckpoint(transaction, playerId, hunt.checkpointId);
        if (!checkpoint) return error(503, "authority_unavailable");
        if (existing.status === "response") return existing.result;
        if (existing.status === "pending") {
          if (
            existing.command.targetLogicalTimeMs === null
            || existing.command.advancementHuntId !== huntId
          ) {
            return error(503, "authority_unavailable");
          }
          return ok({
            commandId: existing.command.commandId,
            targetLogicalTimeMs: existing.command.targetLogicalTimeMs,
            checkpointId: checkpoint.checkpointId,
            huntId,
          }, 102);
        }
        if (root.activeHuntId !== huntId || hunt.terminalAt) {
          const claimed = await claimPublicHuntCommandInTransaction(transaction, {
            playerId,
            idempotencyKey,
            commandKind: kind,
            intentHash,
            intentJson: intent,
            sourceHuntId: huntId,
            advancementHuntId: huntId,
          });
          if (claimed.status === "conflict") return error(409, "correlation_conflict");
          const replay = commandReplayResult(claimed.command);
          if (replay) return replay;
          const result = error(409, "hunt_not_active");
          await completePublicHuntCommandInTransaction(
            transaction,
            claimed.command.commandId,
            result.httpStatus,
            result.body,
          );
          return result;
        }
        const claimed = await claimPublicHuntCommandInTransaction(transaction, {
          playerId,
          idempotencyKey,
          commandKind: kind,
          intentHash,
          intentJson: intent,
          sourceHuntId: huntId,
          advancementHuntId: huntId,
        });
        if (claimed.status === "conflict") return error(409, "correlation_conflict");
        const replay = commandReplayResult(claimed.command);
        if (replay) return replay;
        const targetLogicalTimeMs = claimed.command.targetLogicalTimeMs ?? (
          checkpoint.logicalTimeMs
          + Math.max(0, Math.floor(root.databaseNow.getTime() - checkpoint.logicalTimeAnchorAt.getTime()))
        );
        if (claimed.command.targetLogicalTimeMs === null) {
          await updatePublicHuntCommandTargetInTransaction(transaction, claimed.command.commandId, {
            advancementHuntId: huntId,
            targetLogicalTimeMs,
            targetWallClockAt: root.databaseNow,
          });
        }
        return ok({
          commandId: claimed.command.commandId,
          targetLogicalTimeMs,
          checkpointId: checkpoint.checkpointId,
          huntId,
        }, 102);
      }));
    if (freeze.httpStatus !== 102) return freeze;
    const frozen = freeze.body as {
      readonly commandId: string;
      readonly targetLogicalTimeMs: number;
      readonly checkpointId: string;
      readonly huntId: string;
    };

    try {
      const progressed = await this.progressOneStep(
        playerId,
        idempotencyKey,
        frozen,
        kind,
        terminalizeAfterCutoff,
      );
      return progressed;
    } catch {
      return error(503, "authority_unavailable");
    }
  }

  private async progressOneStep(
    playerId: string,
    idempotencyKey: string,
    frozen: {
      readonly commandId: string;
      readonly targetLogicalTimeMs: number;
      readonly checkpointId: string;
      readonly huntId: string;
    },
    kind: "checkpoint" | "claim" | "retreat",
    terminalizeAfterCutoff: boolean,
  ): Promise<HuntHttpResult> {
    const snapshot = await withPgClient({ connectionString: this.connectionString }, async (client) => {
      const hunt = await loadOwnedSoloHunt(client, playerId, frozen.huntId);
      const checkpoint = await loadHuntCheckpoint(client, playerId, frozen.checkpointId);
      const inputAuthority = await loadHuntInputAuthority(client, playerId, frozen.huntId);
      const command = await loadPublicHuntCommand(client, playerId, idempotencyKey);
      if (!hunt || !checkpoint || !inputAuthority || !command) return null;
      return { hunt, checkpoint, inputAuthority, command };
    });
    if (!snapshot) return error(404, "not_found");
    const replay = commandReplayResult(snapshot.command);
    if (replay) return replay;
    let state = decodeCheckpointState(snapshot.checkpoint.stateBytes);
    if (snapshot.hunt.terminalAt) {
      if (kind === "retreat") {
        return this.finalizeRetreatAgainstExistingTerminal(
          playerId,
          snapshot.hunt,
          snapshot.command,
        );
      }
      return this.finalizeAdvanceCommand(
        playerId,
        idempotencyKey,
        snapshot.hunt,
        snapshot.command,
        kind,
        state,
        false,
      );
    }
    const inputs = await this.ports.authority.loadPersistedRuntime(snapshot.inputAuthority);
    if (state.logicalTimeMs > frozen.targetLogicalTimeMs) {
      return this.finalizeAdvanceCommand(
        playerId, idempotencyKey, snapshot.hunt, snapshot.command, kind, state, true,
      );
    }

    const incomplete = await withPgClient({ connectionString: this.connectionString }, (client) =>
      loadEarliestIncompleteEncounterBoundary(client, snapshot.hunt.huntId));
    if (incomplete) {
      const boundaryResult = await this.completeBoundary(
        playerId, snapshot.hunt, snapshot.command, state, inputs, incomplete,
      );
      if (boundaryResult.httpStatus !== 204) return boundaryResult;
      return inProgress(state.logicalTimeMs, frozen.targetLogicalTimeMs);
    }

    if (state.status === "active") {
      const healingProgress = await this.progressEarliestHealingBlockerAtBoundary(
        playerId,
        snapshot.hunt,
        state,
        terminalizeAfterCutoff && state.logicalTimeMs === frozen.targetLogicalTimeMs
          ? snapshot.command.acceptanceSequence
          : undefined,
      );
      if (healingProgress.status === "authority_unavailable") return error(503, "authority_unavailable");
      if (healingProgress.status === "resolved" || healingProgress.status === "progressed") {
        return inProgress(state.logicalTimeMs, frozen.targetLogicalTimeMs);
      }
    }

    if (state.logicalTimeMs < frozen.targetLogicalTimeMs && state.status === "active") {
      const blocker = await withPgClient({ connectionString: this.connectionString }, (client) =>
        loadEarliestHealingAdvanceBlocker(
          client,
          { huntId: snapshot.hunt.huntId, logicalTimeMs: frozen.targetLogicalTimeMs },
        ));
      const blockerFence = blocker ? healingAdvanceFenceLogicalTimeMs(blocker) : null;
      const advanceTarget = blockerFence !== null && blockerFence > state.logicalTimeMs
        ? Math.min(frozen.targetLogicalTimeMs, blockerFence)
        : frozen.targetLogicalTimeMs;
      const advanced = advanceSoloHuntToEncounterBoundaryOrCutoff(
        state,
        inputs,
        advanceTarget,
      );
      if (!advanced.accepted) throw new Error(advanced.reason);
      state = advanced.state;
      const freezeResult = await this.persistAdvancedStateAndMaybeBoundary(
        playerId,
        snapshot.hunt,
        snapshot.command,
        snapshot.checkpoint.rowVersion,
        state,
        inputs,
        advanced.stopReason,
      );
      if (freezeResult.httpStatus !== 204) return freezeResult;
      if (advanced.stopReason === "encounterBoundary") return inProgress(state.logicalTimeMs, frozen.targetLogicalTimeMs);
      if (blockerFence === state.logicalTimeMs) return inProgress(state.logicalTimeMs, frozen.targetLogicalTimeMs);
    }

    if (state.status === "terminal") {
      const reason = state.terminalReason === "noLivingTeam" ? "no_living" : state.terminalReason;
      return this.finalizeAutomaticTerminal(
        playerId, snapshot.hunt, snapshot.command, kind, state, reason ?? "no_living",
      );
    }

    if (state.logicalTimeMs < frozen.targetLogicalTimeMs) {
      return inProgress(state.logicalTimeMs, frozen.targetLogicalTimeMs);
    }
    if (terminalizeAfterCutoff) {
      return this.finalizeRetreat(playerId, snapshot.hunt, snapshot.command, state);
    }
    return this.finalizeAdvanceCommand(
      playerId,
      idempotencyKey,
      snapshot.hunt,
      snapshot.command,
      kind,
      state,
      false,
    );
  }

  private async persistAdvancedStateAndMaybeBoundary(
    playerId: string,
    hunt: SoloHuntRecord,
    command: HuntPublicCommandRecord,
    expectedRowVersion: bigint,
    state: SoloHuntRuntimeState,
    inputs: SoloHuntRuntimeInputs,
    stopReason: string,
  ): Promise<HuntHttpResult> {
    try {
      return await withPgClient({ connectionString: this.connectionString }, (client) =>
        withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
        if (!root) return error(404, "not_found");
        const executable = await recheckExecutableCommandInTransaction(transaction, playerId, command);
        if (executable.status === "response") return executable.result;
        const persisted = await persistOwnedHuntCheckpointInTransaction(transaction, {
          playerId,
          checkpointId: hunt.checkpointId,
          expectedRowVersion,
          schemaVersion: SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V2,
          logicalTimeMs: state.logicalTimeMs,
          stateBytes: encodeSoloHuntCheckpointV2(state),
        });
        if (persisted.status === "stale") {
          const current = await loadPublicHuntCommand(transaction, playerId, command.idempotencyKey);
          if (!current || current.commandId !== command.commandId) {
            return error(409, "correlation_conflict");
          }
          const replay = commandReplayResult(current);
          if (replay) return replay;
          const latestCheckpoint = await loadHuntCheckpoint(transaction, playerId, hunt.checkpointId);
          if (!latestCheckpoint) return error(404, "not_found");
          return inProgress(
            latestCheckpoint.logicalTimeMs,
            current.targetLogicalTimeMs ?? latestCheckpoint.logicalTimeMs,
          );
        }
        if (persisted.status === "not_found") return error(404, "not_found");
        await syncPendingZoneSelectionInTransaction(transaction, playerId, state);
        await supersedeOvertakenPublicHuntCommandsInTransaction(transaction, {
          playerId,
          huntId: hunt.huntId,
          committedLogicalTimeMs: state.logicalTimeMs,
        });
        if (stopReason !== "encounterBoundary") return ok({}, 204);
        const evidence = state.completedEncounters[state.completedEncounters.length - 1];
        const provenance = state.completedEncounterProvenance[state.completedEncounterProvenance.length - 1];
        if (!evidence || !provenance || evidence.encounterOrdinal !== provenance.encounterOrdinal) {
          throw new Error("Encounter boundary lacks matching replay provenance");
        }
        const historical = await this.ports.authority.loadHistoricalEncounter(evidence);
        if (!historical) throw new HuntAuthorityUnavailableError("historical Encounter authority is unavailable");
        const policyVersion = await loadEffectivePolicyVersion(
          transaction, hunt.huntId, evidence.completedAtHuntTimeMs,
        );
        const policy = policyVersion
          ? await loadAutoCapturePolicyByVersion(transaction, playerId, policyVersion)
          : null;
        const saved = asSavedPolicy(policy);
        let automaticDisposition: HuntEncounterBoundaryRecord["automaticDisposition"] = null;
        let captureRng: DeterministicRngState | null = null;
        let manualDisposition: HuntEncounterBoundaryRecord["manualDisposition"] = "not_applicable";
        if (saved?.enabled) {
          captureRng = randomRngState();
        } else {
          automaticDisposition = "disabled";
          const manualCreated = await createPendingManualCaptureIfFreeInTransaction(transaction, {
            playerId,
            sourceHuntId: hunt.huntId,
            encounterId: evidence.encounterId,
            speciesId: evidence.speciesId,
            level: evidence.level,
            catchRate: historical.catchRate,
            shiny: provenance.individualizationSnapshot?.shiny ?? false,
            captureEvidenceJson: {
              rewardSourceIdentity: evidence.rewardSourceIdentity,
              individualizationSnapshotIdentity: evidence.individualizationSnapshotIdentity ?? null,
              gameDataVersion: evidence.gameDataVersion,
              contentVersion: evidence.contentVersion,
              contentHash: evidence.contentHash,
            },
          });
          manualDisposition = manualCreated === "created" ? "created_pending" : "blocked_existing";
        }
        await freezeEncounterBoundaryInTransaction(transaction, {
          huntId: hunt.huntId,
          encounterId: evidence.encounterId,
          encounterOrdinal: evidence.encounterOrdinal,
          completedLogicalTimeMs: evidence.completedAtHuntTimeMs,
          policyVersion,
          rewardRngJson: rngJson(randomRngState()),
          captureRngJson: captureRng ? rngJson(captureRng) : null,
          preRewardInventoryRowVersion: null,
          automaticDisposition,
          selectedItemId: null,
          automaticAttemptCorrelation: saved?.enabled
            ? `auto:${evidence.encounterId}:${policyVersion ?? "none"}`
            : null,
          manualDisposition,
        });
        return ok({}, 204);
      }));
    } catch (cause) {
      if (cause instanceof HuntAuthorityUnavailableError) return error(503, "authority_unavailable");
      throw cause;
    }
  }

  private async completeBoundary(
    playerId: string,
    hunt: SoloHuntRecord,
    command: HuntPublicCommandRecord,
    state: SoloHuntRuntimeState,
    inputs: SoloHuntRuntimeInputs,
    boundary: HuntEncounterBoundaryRecord,
  ): Promise<HuntHttpResult> {
    const evidence = state.completedEncounters.find(({ encounterId }) => encounterId === boundary.encounterId);
    if (!evidence) throw new Error("Persisted Encounter boundary is absent from Hunt history");
    const historical = await this.ports.authority.loadHistoricalEncounter(evidence);
    if (!historical) return error(503, "authority_unavailable");
    const provenance = state.completedEncounterProvenance.find(
      ({ encounterId }) => encounterId === boundary.encounterId,
    );
    if (!provenance) throw new Error("Persisted Encounter boundary lacks replay provenance");

    if (boundary.status === "frozen") {
      try {
        return await withPgClient({ connectionString: this.connectionString }, (client) =>
          withTransaction(client, async (transaction) => {
          const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
          if (!root) return error(404, "not_found");
          const executable = await recheckExecutableCommandInTransaction(transaction, playerId, command);
          if (executable.status === "response") return executable.result;
          const locked = await loadEncounterBoundary(transaction, hunt.huntId, boundary.encounterId, true);
          if (!locked) return error(503, "authority_unavailable");
          if (locked.status !== "frozen") return ok({}, 204);

          if (locked.automaticDisposition === null) {
            if (!locked.policyVersion || !locked.captureRngJson || !locked.automaticAttemptCorrelation) {
              throw new Error("Automatic capture boundary is missing frozen authority/RNG identity");
            }
            const policy = await loadAutoCapturePolicyByVersion(
              transaction,
              playerId,
              locked.policyVersion,
            );
            const saved = asSavedPolicy(policy);
            if (!policy || !saved?.enabled) {
              throw new Error("Automatic capture boundary references a non-enabled policy");
            }
            const ballAuthority = await this.ports.authority.ballAuthority(policy.ballAuthorityVersion);
            if (!ballAuthority) throw new HuntAuthorityUnavailableError("frozen Ball authority is unavailable");
            const inventory = await loadInventory(transaction, playerId, true);
            if (!inventory) {
              throw new HuntAuthorityUnavailableError("pre-reward Inventory authority is unavailable");
            }
            const selected = selectAutomaticBall(saved, ballAuthority, inventory, {
              shiny: provenance.individualizationSnapshot?.shiny ?? false,
              speciesId: evidence.speciesId,
              zoneId: hunt.zoneId,
              huntDefinitionId: hunt.huntDefinitionId,
              catchRate: historical.catchRate,
            });
            if (!selected) {
              await freezeEncounterAutomaticDecisionInTransaction(transaction, {
                huntId: hunt.huntId,
                encounterId: boundary.encounterId,
                automaticDisposition: "no_eligible_ball",
                selectedItemId: null,
                automaticAttemptCorrelation: null,
                preRewardInventoryRowVersion: inventory.rowVersion,
              });
            } else {
              const captureRng = rngFromJson(locked.captureRngJson);
              if (!captureRng) throw new Error("Automatic capture boundary has invalid frozen RNG state");
              await freezeEncounterAutomaticDecisionInTransaction(transaction, {
                huntId: hunt.huntId,
                encounterId: boundary.encounterId,
                automaticDisposition: "attempt",
                selectedItemId: selected.itemId,
                automaticAttemptCorrelation: locked.automaticAttemptCorrelation,
                preRewardInventoryRowVersion: inventory.rowVersion,
              });
              const capture = await this.ports.boundaryEffects.automaticCapture({
                transaction,
                playerId,
                hunt,
                state,
                inputs,
                boundary: { ...locked, automaticDisposition: "attempt", selectedItemId: selected.itemId },
                selectedItemId: selected.itemId,
                ballAuthorityVersion: ballAuthority.version,
                captureRng,
                expectedInventoryRowVersion: inventory.rowVersion,
                now: root.databaseNow,
              });
              if (capture.status === "authority_unavailable") {
                throw new HuntAuthorityUnavailableError("automatic capture authority is unavailable");
              }
              if (capture.status === "integrity_failure") {
                throw new Error("Automatic capture transaction lost its frozen Inventory/source invariant");
              }
              await recordEncounterAutomaticCaptureResultInTransaction(transaction, {
                huntId: hunt.huntId,
                encounterId: boundary.encounterId,
                success: capture.success,
                shiny: capture.shiny,
              });
            }
          } else if (
            locked.automaticDisposition === "attempt"
            && locked.automaticCaptureSuccess === null
          ) {
            if (
              !locked.policyVersion
              || !locked.captureRngJson
              || !locked.automaticAttemptCorrelation
              || !locked.selectedItemId
              || locked.preRewardInventoryRowVersion === null
            ) {
              throw new Error("Frozen automatic capture attempt is missing replay authority");
            }
            const policy = await loadAutoCapturePolicyByVersion(
              transaction,
              playerId,
              locked.policyVersion,
            );
            const saved = asSavedPolicy(policy);
            if (!policy || !saved?.enabled) {
              throw new Error("Frozen automatic capture attempt references a non-enabled policy");
            }
            const ballAuthority = await this.ports.authority.ballAuthority(policy.ballAuthorityVersion);
            if (!ballAuthority) {
              throw new HuntAuthorityUnavailableError("frozen Ball authority is unavailable");
            }
            const inventory = await loadInventory(transaction, playerId, true);
            if (!inventory) {
              throw new HuntAuthorityUnavailableError("pre-reward Inventory authority is unavailable");
            }
            if (inventory.rowVersion !== locked.preRewardInventoryRowVersion) {
              throw new Error("Pre-reward Inventory changed before frozen automatic capture replay");
            }
            const captureRng = rngFromJson(locked.captureRngJson);
            if (!captureRng) throw new Error("Frozen automatic capture attempt has invalid RNG state");
            const capture = await this.ports.boundaryEffects.automaticCapture({
              transaction,
              playerId,
              hunt,
              state,
              inputs,
              boundary: locked,
              selectedItemId: locked.selectedItemId,
              ballAuthorityVersion: ballAuthority.version,
              captureRng,
              expectedInventoryRowVersion: inventory.rowVersion,
              now: root.databaseNow,
            });
            if (capture.status === "authority_unavailable") {
              throw new HuntAuthorityUnavailableError("automatic capture authority is unavailable");
            }
            if (capture.status === "integrity_failure") {
              throw new Error("Automatic capture replay lost its frozen Inventory/source invariant");
            }
            await recordEncounterAutomaticCaptureResultInTransaction(transaction, {
              huntId: hunt.huntId,
              encounterId: boundary.encounterId,
              success: capture.success,
              shiny: capture.shiny,
            });
          }
          if (executable.command.commandKind === "claim") {
            const finalizedCapture = await loadEncounterBoundary(
              transaction,
              hunt.huntId,
              boundary.encounterId,
              true,
            );
            if (!finalizedCapture) throw new Error("Automatic capture boundary disappeared before claim aggregation");
            const automaticCapture = finalizedCapture.automaticDisposition === "attempt"
              ? {
                  kind: "attempted" as const,
                  success: finalizedCapture.automaticCaptureSuccess === true,
                  shiny: finalizedCapture.automaticCaptureShiny === true,
                }
              : { kind: "not_attempted" as const };
            const accumulated = aggregateAutomaticCaptureEffects(
              executable.command.claimEffects,
              automaticCapture,
              finalizedCapture.automaticDisposition === "no_eligible_ball",
            );
            await updatePublicCommandClaimEffectsInTransaction(
              transaction,
              executable.command.commandId,
              accumulated as unknown as Record<string, unknown>,
            );
          }
          await markEncounterBoundaryStageInTransaction(transaction, {
            huntId: hunt.huntId,
            encounterId: boundary.encounterId,
            status: "capture_committed",
          });
            return ok({}, 204);
          }));
      } catch (cause) {
        if (cause instanceof HuntAuthorityUnavailableError) return error(503, "authority_unavailable");
        throw cause;
      }
    }

    if (boundary.status === "capture_committed") {
      const rewardRng = rngFromJson(boundary.rewardRngJson);
      if (!rewardRng) throw new Error("Encounter boundary has invalid frozen reward RNG state");
      const rewardResult = await withPgClient({ connectionString: this.connectionString }, (client) =>
        withTransaction(client, async (transaction) => {
          const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
          if (!root) throw new Error("Reward boundary lost Player Hunt root");
          const executable = await recheckExecutableCommandInTransaction(transaction, playerId, command);
          if (executable.status === "response") return executable.result;
          const locked = await loadEncounterBoundary(transaction, hunt.huntId, boundary.encounterId, true);
          if (!locked || locked.status !== "capture_committed") return;
          const reward = await this.ports.boundaryEffects.reward({
            transaction,
            playerId,
            hunt,
            state,
            inputs,
            boundary: locked,
            rewardRng,
          });
          await markEncounterBoundaryStageInTransaction(transaction, {
            huntId: hunt.huntId,
            encounterId: boundary.encounterId,
            status: "reward_committed",
            rewardResolutionId: reward.rewardResolutionId,
          });
          if (executable.command.commandKind === "claim") {
            const accumulated = aggregateRewardEffects(
              executable.command.claimEffects,
              reward.reward,
            );
            await updatePublicCommandClaimEffectsInTransaction(
              transaction,
              executable.command.commandId,
              accumulated as unknown as Record<string, unknown>,
            );
          }
        }));
      if (rewardResult) return rewardResult;
      return ok({}, 204);
    }

    if (boundary.status === "reward_committed") {
      const completionResult = await withPgClient({ connectionString: this.connectionString }, (client) =>
        withTransaction(client, async (transaction) => {
          const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
          if (!root) throw new Error("Encounter boundary lost Player Hunt root");
          const executable = await recheckExecutableCommandInTransaction(transaction, playerId, command);
          if (executable.status === "response") return executable.result;
          const locked = await loadEncounterBoundary(transaction, hunt.huntId, boundary.encounterId, true);
          if (!locked || locked.status !== "reward_committed") return;
          if (state.pendingCaptureDecision?.encounterId === boundary.encounterId) {
            const checkpoint = await loadHuntCheckpoint(transaction, playerId, hunt.checkpointId);
            if (!checkpoint) throw new Error("Boundary completion lost checkpoint");
            const latest = decodeCheckpointState(checkpoint.stateBytes);
            if (latest.pendingCaptureDecision?.encounterId === boundary.encounterId) {
              const cleared = { ...latest, pendingCaptureDecision: undefined };
              const persisted = await persistOwnedHuntCheckpointInTransaction(transaction, {
                playerId,
                checkpointId: hunt.checkpointId,
                expectedRowVersion: checkpoint.rowVersion,
                schemaVersion: SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V2,
                logicalTimeMs: cleared.logicalTimeMs,
                stateBytes: encodeSoloHuntCheckpointV2(cleared),
              });
              if (persisted.status !== "updated") {
                throw new Error("Boundary capture closure could not persist checkpoint cleanup");
              }
            }
          }
          await markHealingCommandsDueForEncounterInTransaction(transaction, {
            huntId: hunt.huntId,
            encounterId: boundary.encounterId,
            dueLogicalTimeMs: boundary.completedLogicalTimeMs,
          });
          await markEncounterBoundaryStageInTransaction(transaction, {
            huntId: hunt.huntId,
            encounterId: boundary.encounterId,
            status: "committed",
          });
        }));
      if (completionResult) return completionResult;
      return ok({}, 204);
    }

    return ok({}, 204);
  }

  private async finalizeAdvanceCommand(
    playerId: string,
    idempotencyKey: string,
    hunt: SoloHuntRecord,
    command: HuntPublicCommandRecord,
    kind: "checkpoint" | "claim" | "retreat",
    state: SoloHuntRuntimeState,
    superseded: boolean,
  ): Promise<HuntHttpResult> {
    if (superseded) {
      const result = error(409, "command_superseded");
      return withPgClient({ connectionString: this.connectionString }, (client) =>
        withTransaction(client, async (transaction) => {
          const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
          if (!root) return error(404, "not_found");
          const current = await loadPublicHuntCommand(transaction, playerId, idempotencyKey);
          if (!current || current.commandId !== command.commandId) return error(409, "correlation_conflict");
          const replay = commandReplayResult(current);
          if (replay) return replay;
          const completed = await completePublicHuntCommandInTransaction(
            transaction,
            command.commandId,
            409,
            result.body,
          );
          return commandReplayResult(completed) ?? result;
        }));
    }
    let ballAuthority: CaptureBallAuthorityRelease;
    try {
      ballAuthority = await this.ports.authority.currentBallAuthority();
    } catch {
      return error(503, "authority_unavailable");
    }
    return withPgClient({ connectionString: this.connectionString }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
        if (!root) return error(404, "not_found");
        const current = await loadPublicHuntCommand(transaction, playerId, idempotencyKey);
        if (!current || current.commandId !== command.commandId) return error(409, "correlation_conflict");
        const replay = commandReplayResult(current);
        if (replay) return replay;
        const lockedHunt = await loadOwnedSoloHunt(transaction, playerId, hunt.huntId, true);
        if (!lockedHunt) return error(503, "authority_unavailable");
        const checkpoint = await loadHuntCheckpoint(transaction, playerId, lockedHunt.checkpointId);
        if (!checkpoint) return error(503, "authority_unavailable");
        if (current.targetLogicalTimeMs !== null && checkpoint.logicalTimeMs > current.targetLogicalTimeMs) {
          const result = error(409, "command_superseded");
          const completed = await completePublicHuntCommandInTransaction(
            transaction,
            current.commandId,
            result.httpStatus,
            result.body,
          );
          return commandReplayResult(completed) ?? result;
        }
        if (checkpoint.logicalTimeMs !== state.logicalTimeMs) {
          return error(503, "authority_unavailable");
        }
        const latestState = lockedHunt.terminalAt
          ? await this.terminalStateForHunt(transaction, playerId, lockedHunt, ballAuthority)
          : await this.stateFromClient(transaction, playerId, ballAuthority);
        if (latestState.httpStatus !== 200) return latestState;
        const resultBody = kind === "claim"
          ? {
              state: latestState.body,
              effects: publicClaimEffects(current.claimEffects),
            }
          : latestState.body;
        const completed = await completePublicHuntCommandInTransaction(
          transaction,
          current.commandId,
          200,
          resultBody,
        );
        return commandReplayResult(completed) ?? ok(resultBody);
      }));
  }

  private async finalizeAutomaticTerminal(
    playerId: string,
    hunt: SoloHuntRecord,
    command: HuntPublicCommandRecord,
    kind: "checkpoint" | "claim" | "retreat",
    state: SoloHuntRuntimeState,
    reason: NonNullable<SoloHuntRuntimeState["terminalReason"]> | "no_living" | "opponent_victory",
  ): Promise<HuntHttpResult> {
    const terminalReason = noLivingHuntDisposition(reason);
    let ballAuthority: CaptureBallAuthorityRelease | null = null;
    if (kind !== "retreat") {
      try {
        ballAuthority = await this.ports.authority.currentBallAuthority();
      } catch {
        return error(503, "authority_unavailable");
      }
    }
    return withPgClient({ connectionString: this.connectionString }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
        if (!root) return error(404, "not_found");
        const executable = await recheckExecutableCommandInTransaction(transaction, playerId, command);
        if (executable.status === "response") return executable.result;
        const current = executable.command;
        const lockedHunt = await loadOwnedSoloHunt(transaction, playerId, hunt.huntId, true);
        if (!lockedHunt) return error(503, "authority_unavailable");
        if (lockedHunt.terminalAt) {
          if (kind === "retreat") {
            const resultBody = {
              status: "terminal",
              terminalReason: publicRetreatTerminalReason(lockedHunt.terminalReason),
              recoveryReadyAt: new Date(
                lockedHunt.terminalAt.getTime() + lockedHunt.recoveryDurationMs,
              ).toISOString(),
            };
            const completed = await completePublicHuntCommandInTransaction(
              transaction,
              current.commandId,
              200,
              resultBody,
            );
            return commandReplayResult(completed) ?? ok(resultBody);
          }
          const stateResult = await this.terminalStateForHunt(transaction, playerId, lockedHunt, ballAuthority!);
          if (stateResult.httpStatus !== 200) return stateResult;
          const resultBody = kind === "claim"
            ? { state: stateResult.body, effects: publicClaimEffects(current.claimEffects) }
            : stateResult.body;
          const completed = await completePublicHuntCommandInTransaction(
            transaction,
            current.commandId,
            200,
            resultBody,
          );
          return commandReplayResult(completed) ?? ok(resultBody);
        }
        const checkpoint = await loadHuntCheckpoint(transaction, playerId, hunt.checkpointId);
        if (!checkpoint || checkpoint.logicalTimeMs !== state.logicalTimeMs) {
          return error(503, "authority_unavailable");
        }
        await writeBackTerminalVitalityIfRequired(transaction, {
          playerId,
          huntId: hunt.huntId,
          state,
          now: root.databaseNow,
        });
        const terminal = await terminalizeSoloHuntInTransaction(transaction, {
          playerId,
          huntId: hunt.huntId,
          terminalReason,
          recoveryDurationMs: hunt.recoveryDurationMs,
        });
        await cancelScheduledHealingCommandsForHuntInTransaction(transaction, hunt.huntId);
        let resultBody: unknown;
        if (kind === "retreat") {
          resultBody = {
            status: "terminal",
            terminalReason,
            recoveryReadyAt: terminal.recoveryReadyAt.toISOString(),
          };
        } else {
          const stateResult = await this.stateFromClient(transaction, playerId, ballAuthority!);
          if (stateResult.httpStatus !== 200) return stateResult;
          resultBody = kind === "claim"
            ? { state: stateResult.body, effects: publicClaimEffects(current.claimEffects) }
            : stateResult.body;
        }
        const completed = await completePublicHuntCommandInTransaction(
          transaction,
          current.commandId,
          200,
          resultBody,
        );
        return commandReplayResult(completed) ?? ok(resultBody);
      }));
  }

  private async finalizeRetreat(
    playerId: string,
    hunt: SoloHuntRecord,
    command: HuntPublicCommandRecord,
    state: SoloHuntRuntimeState,
  ): Promise<HuntHttpResult> {
    return withPgClient({ connectionString: this.connectionString }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
        if (!root) return error(404, "not_found");
        const executable = await recheckExecutableCommandInTransaction(transaction, playerId, command);
        if (executable.status === "response") return executable.result;
        const current = executable.command;
        const lockedHunt = await loadOwnedSoloHunt(transaction, playerId, hunt.huntId, true);
        if (!lockedHunt) return error(503, "authority_unavailable");
        if (lockedHunt.terminalAt) {
          const resultBody = {
            status: "terminal",
            terminalReason: publicRetreatTerminalReason(lockedHunt.terminalReason),
            recoveryReadyAt: new Date(
              lockedHunt.terminalAt.getTime() + lockedHunt.recoveryDurationMs,
            ).toISOString(),
          };
          const completed = await completePublicHuntCommandInTransaction(
            transaction,
            current.commandId,
            200,
            resultBody,
          );
          return commandReplayResult(completed) ?? ok(resultBody);
        }
        const checkpoint = await loadHuntCheckpoint(transaction, playerId, hunt.checkpointId);
        if (!checkpoint || checkpoint.logicalTimeMs !== state.logicalTimeMs) {
          return error(503, "authority_unavailable");
        }
        await writeBackTerminalVitalityIfRequired(transaction, {
          playerId,
          huntId: hunt.huntId,
          state,
          now: root.databaseNow,
        });
        const terminal = await terminalizeSoloHuntInTransaction(transaction, {
          playerId,
          huntId: hunt.huntId,
          terminalReason: "retreat",
          recoveryDurationMs: hunt.recoveryDurationMs,
        });
        await cancelScheduledHealingCommandsForHuntInTransaction(transaction, hunt.huntId);
        const resultBody = {
          status: "terminal",
          terminalReason: "retreat",
          recoveryReadyAt: terminal.recoveryReadyAt.toISOString(),
        };
        const completed = await completePublicHuntCommandInTransaction(
          transaction,
          current.commandId,
          200,
          resultBody,
        );
        return commandReplayResult(completed) ?? ok(resultBody);
      }));
  }

  private async finalizeRetreatAgainstExistingTerminal(
    playerId: string,
    hunt: SoloHuntRecord,
    command: HuntPublicCommandRecord,
  ): Promise<HuntHttpResult> {
    return withPgClient({ connectionString: this.connectionString }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
        if (!root) return error(404, "not_found");
        const executable = await recheckExecutableCommandInTransaction(transaction, playerId, command);
        if (executable.status === "response") return executable.result;
        const current = executable.command;
        const lockedHunt = await loadOwnedSoloHunt(transaction, playerId, hunt.huntId, true);
        if (!lockedHunt?.terminalAt) {
          return error(503, "authority_unavailable");
        }
        const resultBody = {
          status: "terminal",
          terminalReason: publicRetreatTerminalReason(lockedHunt.terminalReason),
          recoveryReadyAt: new Date(
            lockedHunt.terminalAt.getTime() + lockedHunt.recoveryDurationMs,
          ).toISOString(),
        };
        const completed = await completePublicHuntCommandInTransaction(
          transaction,
          current.commandId,
          200,
          resultBody,
        );
        return commandReplayResult(completed) ?? ok(resultBody);
      }));
  }

  private async finalizeTerminalHealingCommand(
    playerId: string,
    hunt: SoloHuntRecord,
    command: HuntPublicCommandRecord,
    state: SoloHuntRuntimeState,
    healing: HuntHealingCommandRecord,
  ): Promise<HuntHttpResult> {
    let ballAuthority: CaptureBallAuthorityRelease;
    try {
      ballAuthority = await this.ports.authority.currentBallAuthority();
    } catch {
      return error(503, "authority_unavailable");
    }
    const terminalReason = noLivingHuntDisposition(state.terminalReason);
    return withPgClient({ connectionString: this.connectionString }, (client) =>
      withTransaction(client, async (transaction) => {
        const root = await ensureAndLockPlayerHuntRoot(transaction, playerId);
        if (!root) return error(404, "not_found");
        const executable = await recheckExecutableCommandInTransaction(transaction, playerId, command);
        if (executable.status === "response") return executable.result;
        const current = executable.command;
        const lockedHunt = await loadOwnedSoloHunt(transaction, playerId, hunt.huntId, true);
        if (!lockedHunt) return error(503, "authority_unavailable");
        if (lockedHunt.terminalAt) {
          const stateResult = await this.terminalStateForHunt(transaction, playerId, lockedHunt, ballAuthority);
          if (stateResult.httpStatus !== 200) return stateResult;
          const result = ok({
            state: stateResult.body,
            itemUse: {
              itemId: healing.itemId,
              targetPokemonInstanceId: healing.targetPokemonInstanceId,
              outcome: "not_applied",
              healedHp: 0,
              reason: "hunt_terminal",
            },
          });
          const completed = await completePublicHuntCommandInTransaction(
            transaction,
            current.commandId,
            200,
            result.body,
          );
          return commandReplayResult(completed) ?? result;
        }
        const checkpoint = await loadHuntCheckpoint(transaction, playerId, hunt.checkpointId);
        if (!checkpoint || checkpoint.logicalTimeMs !== state.logicalTimeMs) {
          return error(503, "authority_unavailable");
        }
        await writeBackTerminalVitalityIfRequired(transaction, {
          playerId,
          huntId: hunt.huntId,
          state,
          now: root.databaseNow,
        });
        await terminalizeSoloHuntInTransaction(transaction, {
          playerId,
          huntId: hunt.huntId,
          terminalReason,
          recoveryDurationMs: hunt.recoveryDurationMs,
        });
        await cancelScheduledHealingCommandsForHuntInTransaction(transaction, hunt.huntId);
        const stateResult = await this.stateFromClient(transaction, playerId, ballAuthority);
        if (stateResult.httpStatus !== 200) return stateResult;
        const result = ok({
          state: stateResult.body,
          itemUse: {
            itemId: healing.itemId,
            targetPokemonInstanceId: healing.targetPokemonInstanceId,
            outcome: "not_applied",
            healedHp: 0,
            reason: "hunt_terminal",
          },
        });
        const completed = await completePublicHuntCommandInTransaction(
          transaction,
          current.commandId,
          200,
          result.body,
        );
        return commandReplayResult(completed) ?? result;
      }));
  }
}

export function teamSnapshotToSoloHuntMembers(
  snapshot: OwnedTeamSnapshot,
  speciesById: ReadonlyMap<string, {
    readonly id: string;
    readonly baseStats: SoloHuntTeamMemberSnapshot["baseStats"];
    readonly typeIds: readonly string[];
    readonly abilities: readonly { readonly abilityId: string }[];
  }>,
): readonly SoloHuntTeamMemberSnapshot[] {
  return snapshot.pokemon.map((pokemon) => {
    const species = speciesById.get(pokemon.speciesId);
    if (!species) throw new HuntAuthorityUnavailableError(`Species is unavailable: ${pokemon.speciesId}`);
    if (pokemon.moveLoadout.state !== "selected" || pokemon.moveLoadout.moveIds.length === 0) {
      throw new Error(`Pokémon has no selected Move loadout: ${pokemon.pokemonInstanceId}`);
    }
    if (
      pokemon.selectedAbilityId !== null
      && !species.abilities.some(({ abilityId }) => abilityId === pokemon.selectedAbilityId)
    ) {
      throw new Error(`Pokémon selected Ability is not compatible with Species: ${pokemon.pokemonInstanceId}`);
    }
    return {
      pokemonInstanceId: pokemon.pokemonInstanceId as never,
      speciesId: pokemon.speciesId as never,
      level: pokemon.level,
      baseStats: species.baseStats,
      ivs: pokemon.ivs,
      geneticBonuses: geneticBonusesForOwnedPokemon(pokemon),
      types: species.typeIds as never,
      moveLoadout: pokemon.moveLoadout.moveIds as never,
      ...(pokemon.selectedAbilityId ? { abilityId: pokemon.selectedAbilityId as never } : {}),
    };
  });
}
