import {
  advanceSoloHuntSegmentedToCutoff,
  decodeSoloHuntCheckpointV1,
  encodeSoloHuntCheckpointV1,
  SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V1,
  SOLO_HUNT_DEFAULT_SEGMENT_MS,
  type SoloHuntRuntimeInputs,
  type SoloHuntRuntimeState,
} from "@pokenexus/game-core";
import {
  commitHuntCheckpointAdvance,
  freezeHuntCheckpointAdvance,
  loadHuntCheckpoint,
  loadHuntCheckpointAdvanceCommandByCorrelation,
  persistHuntCheckpointAdvanceProgress,
  withPgClient,
} from "@pokenexus/database";

export interface SoloHuntCheckpointRecord {
  readonly checkpointId: string;
  readonly subjectPlayerId: string;
  readonly huntRunIdentity: string;
  readonly schemaVersion: string;
  readonly gameDataVersion: string;
  readonly rulesVersion: string;
  readonly logicalTimeMs: number;
  readonly logicalTimeAnchorAt: Date;
  readonly stateBytes: Uint8Array;
  readonly rowVersion: bigint;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SoloHuntAdvanceCommandRecord {
  readonly subjectPlayerId: string;
  readonly checkpointId: string;
  readonly commandCorrelation: string;
  readonly targetLogicalTimeMs: number;
  readonly targetWallClockAt: Date;
  readonly baseCheckpointRowVersion: bigint;
  readonly schemaVersion: string;
  readonly gameDataVersion: string;
  readonly rulesVersion: string;
  readonly status: "pending" | "advanced" | "superseded";
  readonly resultCheckpointRowVersion?: bigint;
  readonly resultLogicalTimeMs?: number;
  readonly resultStateBytes?: Uint8Array;
}

export type SoloHuntAdvanceFreezeResult =
  | {
      readonly status: "accepted";
      readonly replayed: boolean;
      readonly command: SoloHuntAdvanceCommandRecord;
    }
  | {
      readonly status: "stale";
      readonly checkpoint: SoloHuntCheckpointRecord;
    }
  | { readonly status: "not_found" }
  | { readonly status: "conflict" };

export type SoloHuntAdvanceCommitResult =
  | {
      readonly status: "accepted";
      readonly replayed: boolean;
      readonly command: SoloHuntAdvanceCommandRecord;
    }
  | {
      readonly status: "stale";
      readonly checkpoint: SoloHuntCheckpointRecord;
    }
  | {
      readonly status: "superseded";
      readonly replayed: boolean;
      readonly command: SoloHuntAdvanceCommandRecord;
    }
  | { readonly status: "not_found" }
  | { readonly status: "conflict" };

export type SoloHuntAdvanceProgressResult =
  | { readonly status: "progressed"; readonly checkpoint: SoloHuntCheckpointRecord }
  | {
      readonly status: "accepted";
      readonly replayed: true;
      readonly command: SoloHuntAdvanceCommandRecord;
    }
  | {
      readonly status: "superseded";
      readonly replayed: boolean;
      readonly command: SoloHuntAdvanceCommandRecord;
    }
  | { readonly status: "stale"; readonly checkpoint: SoloHuntCheckpointRecord }
  | { readonly status: "not_found" }
  | { readonly status: "conflict" };

export interface SoloHuntCheckpointRepository {
  loadAdvanceCommandByCorrelation(
    subjectPlayerId: string,
    commandCorrelation: string,
  ): Promise<SoloHuntAdvanceCommandRecord | null>;
  loadCheckpoint(
    subjectPlayerId: string,
    checkpointId: string,
  ): Promise<SoloHuntCheckpointRecord | null>;
  freezeAdvance(input: {
    readonly subjectPlayerId: string;
    readonly checkpointId: string;
    readonly commandCorrelation: string;
    readonly targetLogicalTimeMs: number;
    readonly expectedCheckpointRowVersion: bigint;
    readonly now: Date;
  }): Promise<SoloHuntAdvanceFreezeResult>;
  progressAdvance(input: {
    readonly subjectPlayerId: string;
    readonly checkpointId: string;
    readonly commandCorrelation: string;
    readonly targetLogicalTimeMs: number;
    readonly expectedCheckpointRowVersion: bigint;
    readonly logicalTimeMs: number;
    readonly stateBytes: Uint8Array;
    readonly now: Date;
  }): Promise<SoloHuntAdvanceProgressResult>;
  commitAdvance(input: {
    readonly subjectPlayerId: string;
    readonly checkpointId: string;
    readonly commandCorrelation: string;
    readonly targetLogicalTimeMs: number;
    readonly expectedCheckpointRowVersion: bigint;
    readonly logicalTimeMs: number;
    readonly stateBytes: Uint8Array;
    readonly now: Date;
  }): Promise<SoloHuntAdvanceCommitResult>;
}

export interface SoloHuntCheckpointCodec {
  readonly schemaVersion: string;
  encode(state: SoloHuntRuntimeState): Uint8Array;
  decode(bytes: Uint8Array): SoloHuntRuntimeState;
}

export interface SoloHuntCheckpointInputAuthority {
  load(record: SoloHuntCheckpointRecord, state: SoloHuntRuntimeState): Promise<SoloHuntRuntimeInputs>;
}

export interface SoloHuntCheckpointAdvancer {
  advance(
    state: SoloHuntRuntimeState,
    inputs: SoloHuntRuntimeInputs,
    targetLogicalTimeMs: number,
  ): ReturnType<typeof advanceSoloHuntSegmentedToCutoff>;
}

const DEFAULT_ADVANCER: SoloHuntCheckpointAdvancer = {
  advance(state, inputs, targetLogicalTimeMs) {
    return advanceSoloHuntSegmentedToCutoff(state, inputs, targetLogicalTimeMs);
  },
};

export const SOLO_HUNT_CHECKPOINT_CODEC_V1: SoloHuntCheckpointCodec = Object.freeze({
  schemaVersion: SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V1,
  encode: encodeSoloHuntCheckpointV1,
  decode(bytes: Uint8Array) {
    const decoded = decodeSoloHuntCheckpointV1(bytes);
    if (!decoded.accepted) throw new Error(`Solo Hunt checkpoint decode failed: ${decoded.reason}`);
    return decoded.state;
  },
});

export function createPgSoloHuntCheckpointRepository(connectionString: string): SoloHuntCheckpointRepository {
  return {
    loadAdvanceCommandByCorrelation(subjectPlayerId, commandCorrelation) {
      return withPgClient({ connectionString }, (client) =>
        loadHuntCheckpointAdvanceCommandByCorrelation(client, subjectPlayerId, commandCorrelation));
    },
    loadCheckpoint(subjectPlayerId, checkpointId) {
      return withPgClient({ connectionString }, (client) => loadHuntCheckpoint(client, subjectPlayerId, checkpointId));
    },
    freezeAdvance(input) {
      return withPgClient({ connectionString }, (client) => freezeHuntCheckpointAdvance(client, input));
    },
    progressAdvance(input) {
      return withPgClient({ connectionString }, (client) => persistHuntCheckpointAdvanceProgress(client, input));
    },
    commitAdvance(input) {
      return withPgClient({ connectionString }, async (client) => {
        const result = await commitHuntCheckpointAdvance(client, input);
        if (result.status === "not_found") return { status: "not_found" as const };
        return result;
      });
    },
  };
}

export type SoloHuntCheckpointClaimResult =
  | {
      readonly status: "advanced";
      readonly replayed: boolean;
      readonly command: SoloHuntAdvanceCommandRecord;
    }
  | {
      readonly status: "progressed";
      readonly logicalTimeMs: number;
      readonly targetLogicalTimeMs: number;
      readonly checkpointRowVersion: bigint;
    }
  | { readonly status: "not_found" }
  | { readonly status: "conflict" }
  | { readonly status: "superseded"; readonly logicalTimeMs: number };

function replayMatches(
  existing: SoloHuntAdvanceCommandRecord,
  input: {
    readonly subjectPlayerId: string;
    readonly checkpointId: string;
    readonly commandCorrelation: string;
    readonly targetLogicalTimeMs: number;
  },
): boolean {
  return existing.subjectPlayerId === input.subjectPlayerId
    && existing.checkpointId === input.checkpointId
    && existing.commandCorrelation === input.commandCorrelation
    && existing.targetLogicalTimeMs === input.targetLogicalTimeMs;
}

function replayIdentityMatches(
  existing: SoloHuntAdvanceCommandRecord,
  input: {
    readonly subjectPlayerId: string;
    readonly checkpointId: string;
    readonly commandCorrelation: string;
  },
): boolean {
  return existing.subjectPlayerId === input.subjectPlayerId
    && existing.checkpointId === input.checkpointId
    && existing.commandCorrelation === input.commandCorrelation;
}

function completedCommandResult(
  command: SoloHuntAdvanceCommandRecord,
  replayed: boolean,
): SoloHuntCheckpointClaimResult | undefined {
  if (command.status === "advanced") {
    return { status: "advanced", replayed, command };
  }
  if (command.status === "superseded") {
    if (command.resultLogicalTimeMs === undefined) {
      throw new Error("Superseded Solo Hunt checkpoint command is missing its durable logical result");
    }
    return { status: "superseded", logicalTimeMs: command.resultLogicalTimeMs };
  }
  return undefined;
}

function elapsedTarget(checkpoint: SoloHuntCheckpointRecord, now: Date): number {
  const nowMs = now.getTime();
  const anchorMs = checkpoint.logicalTimeAnchorAt.getTime();
  if (!Number.isFinite(nowMs) || !Number.isFinite(anchorMs)) {
    throw new Error("Solo Hunt elapsed advancement requires valid checkpoint wall-clock timestamps");
  }
  const elapsedMs = nowMs - anchorMs;
  if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0) {
    throw new Error("Solo Hunt elapsed advancement cannot move backward in wall-clock time");
  }
  const target = checkpoint.logicalTimeMs + elapsedMs;
  if (!Number.isSafeInteger(target) || target < checkpoint.logicalTimeMs) {
    throw new Error("Solo Hunt elapsed advancement exceeds safe logical-time bounds");
  }
  return target;
}

function assertCheckpointContext(
  record: SoloHuntCheckpointRecord,
  codec: SoloHuntCheckpointCodec,
  state: SoloHuntRuntimeState,
): void {
  if (record.schemaVersion !== codec.schemaVersion) {
    throw new Error(`Unsupported Solo Hunt checkpoint schema: ${record.schemaVersion}`);
  }
  if (state.playerId !== record.subjectPlayerId) {
    throw new Error("Solo Hunt checkpoint Player identity does not match persisted authority");
  }
  if (state.huntRunIdentity !== record.huntRunIdentity) {
    throw new Error("Solo Hunt checkpoint Hunt identity does not match persisted authority");
  }
  if (state.logicalTimeMs !== record.logicalTimeMs) {
    throw new Error("Solo Hunt checkpoint logical time does not match encoded state");
  }
  if (state.gameDataVersion !== record.gameDataVersion || state.rulesVersion !== record.rulesVersion) {
    throw new Error("Solo Hunt checkpoint pinned context does not match encoded state");
  }
}

export class SoloHuntCheckpointClaimService {
  constructor(
    private readonly repository: SoloHuntCheckpointRepository,
    private readonly codec: SoloHuntCheckpointCodec,
    private readonly inputAuthority: SoloHuntCheckpointInputAuthority,
    private readonly advancer: SoloHuntCheckpointAdvancer = DEFAULT_ADVANCER,
    private readonly maxSegmentMs = SOLO_HUNT_DEFAULT_SEGMENT_MS,
  ) {
    if (!Number.isSafeInteger(maxSegmentMs) || maxSegmentMs <= 0) {
      throw new Error("Solo Hunt checkpoint segment size must be a positive safe integer");
    }
  }

  async advanceElapsed(input: {
    readonly subjectPlayerId: string;
    readonly checkpointId: string;
    readonly commandCorrelation: string;
    readonly now: Date;
  }): Promise<SoloHuntCheckpointClaimResult> {
    const committed = await this.repository.loadAdvanceCommandByCorrelation(
      input.subjectPlayerId,
      input.commandCorrelation,
    );
    if (committed !== null) {
      if (!replayIdentityMatches(committed, input)) return { status: "conflict" };
      return this.advanceFrozen(committed, input.now, true);
    }

    let checkpoint = await this.repository.loadCheckpoint(input.subjectPlayerId, input.checkpointId);
    if (checkpoint === null) return { status: "not_found" };
    const targetLogicalTimeMs = elapsedTarget(checkpoint, input.now);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const frozen = await this.repository.freezeAdvance({
        subjectPlayerId: input.subjectPlayerId,
        checkpointId: input.checkpointId,
        commandCorrelation: input.commandCorrelation,
        targetLogicalTimeMs,
        expectedCheckpointRowVersion: checkpoint.rowVersion,
        now: input.now,
      });
      if (frozen.status === "accepted") {
        return this.advanceFrozen(frozen.command, input.now, frozen.replayed);
      }
      if (frozen.status === "not_found") return { status: "not_found" };
      if (frozen.status === "conflict") {
        const raced = await this.repository.loadAdvanceCommandByCorrelation(
          input.subjectPlayerId,
          input.commandCorrelation,
        );
        if (raced !== null && replayIdentityMatches(raced, input)) {
          return this.advanceFrozen(raced, input.now, true);
        }
        return { status: "conflict" };
      }
      checkpoint = frozen.checkpoint;
    }
    return { status: "conflict" };
  }

  async advance(input: {
    readonly subjectPlayerId: string;
    readonly checkpointId: string;
    readonly commandCorrelation: string;
    readonly targetLogicalTimeMs: number;
    readonly now: Date;
  }): Promise<SoloHuntCheckpointClaimResult> {
    if (!Number.isSafeInteger(input.targetLogicalTimeMs) || input.targetLogicalTimeMs < 0) {
      throw new Error("Solo Hunt target logical time must be a non-negative safe integer");
    }

    const committed = await this.repository.loadAdvanceCommandByCorrelation(
      input.subjectPlayerId,
      input.commandCorrelation,
    );
    if (committed !== null) {
      if (!replayMatches(committed, input)) return { status: "conflict" };
      return this.advanceFrozen(committed, input.now, true);
    }

    let checkpoint = await this.repository.loadCheckpoint(input.subjectPlayerId, input.checkpointId);
    if (checkpoint === null) return { status: "not_found" };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const frozen = await this.repository.freezeAdvance({
        subjectPlayerId: input.subjectPlayerId,
        checkpointId: input.checkpointId,
        commandCorrelation: input.commandCorrelation,
        targetLogicalTimeMs: input.targetLogicalTimeMs,
        expectedCheckpointRowVersion: checkpoint.rowVersion,
        now: input.now,
      });
      if (frozen.status === "accepted") {
        return this.advanceFrozen(frozen.command, input.now, frozen.replayed);
      }
      if (frozen.status === "not_found") return { status: "not_found" };
      if (frozen.status === "conflict") return { status: "conflict" };
      checkpoint = frozen.checkpoint;
    }

    return { status: "conflict" };
  }

  private async advanceFrozen(
    command: SoloHuntAdvanceCommandRecord,
    now: Date,
    replayed: boolean,
  ): Promise<SoloHuntCheckpointClaimResult> {
    const completed = completedCommandResult(command, replayed);
    if (completed) return completed;

    const checkpoint = await this.repository.loadCheckpoint(command.subjectPlayerId, command.checkpointId);
    if (checkpoint === null) return { status: "not_found" };

    if (checkpoint.logicalTimeMs > command.targetLogicalTimeMs) {
      const result = await this.repository.commitAdvance({
        subjectPlayerId: command.subjectPlayerId,
        checkpointId: command.checkpointId,
        commandCorrelation: command.commandCorrelation,
        targetLogicalTimeMs: command.targetLogicalTimeMs,
        expectedCheckpointRowVersion: checkpoint.rowVersion,
        logicalTimeMs: command.targetLogicalTimeMs,
        stateBytes: checkpoint.stateBytes,
        now,
      });
      if (result.status === "superseded" || result.status === "accepted") {
        return completedCommandResult(result.command, result.replayed)!;
      }
      if (result.status === "not_found") return { status: "not_found" };
      if (result.status === "conflict") return { status: "conflict" };
      return {
        status: "progressed",
        logicalTimeMs: result.checkpoint.logicalTimeMs,
        targetLogicalTimeMs: command.targetLogicalTimeMs,
        checkpointRowVersion: result.checkpoint.rowVersion,
      };
    }

    if (
      checkpoint.schemaVersion !== command.schemaVersion
      || checkpoint.gameDataVersion !== command.gameDataVersion
      || checkpoint.rulesVersion !== command.rulesVersion
    ) {
      throw new Error("Solo Hunt frozen command context does not match persisted checkpoint authority");
    }
    const state = this.codec.decode(checkpoint.stateBytes);
    assertCheckpointContext(checkpoint, this.codec, state);
    const huntInputs = await this.inputAuthority.load(checkpoint, state);
    if (checkpoint.logicalTimeMs === command.targetLogicalTimeMs) {
      const validated = this.advancer.advance(state, huntInputs, command.targetLogicalTimeMs);
      if (!validated.accepted) {
        throw new Error(`Solo Hunt checkpoint validation rejected: ${validated.reason}`);
      }
      const validatedStateBytes = this.codec.encode(validated.state);
      if (
        validated.state.logicalTimeMs !== state.logicalTimeMs
        || validatedStateBytes.byteLength !== checkpoint.stateBytes.byteLength
        || validatedStateBytes.some((byte, index) => byte !== checkpoint.stateBytes[index])
      ) {
        throw new Error("Solo Hunt checkpoint zero-elapsed validation changed authoritative state");
      }
      const result = await this.repository.commitAdvance({
        subjectPlayerId: command.subjectPlayerId,
        checkpointId: command.checkpointId,
        commandCorrelation: command.commandCorrelation,
        targetLogicalTimeMs: command.targetLogicalTimeMs,
        expectedCheckpointRowVersion: checkpoint.rowVersion,
        logicalTimeMs: checkpoint.logicalTimeMs,
        stateBytes: checkpoint.stateBytes,
        now,
      });
      if (result.status === "accepted" || result.status === "superseded") {
        return completedCommandResult(result.command, result.replayed)!;
      }
      if (result.status === "not_found") return { status: "not_found" };
      if (result.status === "conflict") return { status: "conflict" };
      return {
        status: "progressed",
        logicalTimeMs: result.checkpoint.logicalTimeMs,
        targetLogicalTimeMs: command.targetLogicalTimeMs,
        checkpointRowVersion: result.checkpoint.rowVersion,
      };
    }

    const segmentTargetLogicalTimeMs = state.status === "terminal"
      ? state.logicalTimeMs
      : state.logicalTimeMs + Math.min(
          command.targetLogicalTimeMs - state.logicalTimeMs,
          this.maxSegmentMs,
        );
    const advanced = this.advancer.advance(state, huntInputs, segmentTargetLogicalTimeMs);
    if (!advanced.accepted) {
      throw new Error(`Solo Hunt checkpoint advancement rejected: ${advanced.reason}`);
    }
    if (
      advanced.stopReason === "cutoff"
      && advanced.state.logicalTimeMs !== segmentTargetLogicalTimeMs
    ) {
      throw new Error("Solo Hunt checkpoint advancer did not stop at the deterministic segment target");
    }
    if (
      advanced.stopReason !== "cutoff"
      && (advanced.state.status !== "terminal" || advanced.state.logicalTimeMs > command.targetLogicalTimeMs)
    ) {
      throw new Error("Solo Hunt checkpoint advancer returned an invalid terminal boundary");
    }
    const stateBytes = this.codec.encode(advanced.state);
    const reachedFrozenTarget = advanced.state.logicalTimeMs === command.targetLogicalTimeMs;
    const reachedTerminalBoundary = advanced.state.status === "terminal";
    if (!reachedFrozenTarget && !reachedTerminalBoundary) {
      const progress = await this.repository.progressAdvance({
        subjectPlayerId: command.subjectPlayerId,
        checkpointId: command.checkpointId,
        commandCorrelation: command.commandCorrelation,
        targetLogicalTimeMs: command.targetLogicalTimeMs,
        expectedCheckpointRowVersion: checkpoint.rowVersion,
        logicalTimeMs: advanced.state.logicalTimeMs,
        stateBytes,
        now,
      });
      if (progress.status === "progressed") {
        return {
          status: "progressed",
          logicalTimeMs: progress.checkpoint.logicalTimeMs,
          targetLogicalTimeMs: command.targetLogicalTimeMs,
          checkpointRowVersion: progress.checkpoint.rowVersion,
        };
      }
      if (progress.status === "accepted" || progress.status === "superseded") {
        return completedCommandResult(progress.command, progress.replayed)!;
      }
      if (progress.status === "not_found") return { status: "not_found" };
      if (progress.status === "conflict") return { status: "conflict" };
      return {
        status: "progressed",
        logicalTimeMs: progress.checkpoint.logicalTimeMs,
        targetLogicalTimeMs: command.targetLogicalTimeMs,
        checkpointRowVersion: progress.checkpoint.rowVersion,
      };
    }

    const result = await this.repository.commitAdvance({
      subjectPlayerId: command.subjectPlayerId,
      checkpointId: command.checkpointId,
      commandCorrelation: command.commandCorrelation,
      targetLogicalTimeMs: command.targetLogicalTimeMs,
      expectedCheckpointRowVersion: checkpoint.rowVersion,
      logicalTimeMs: advanced.state.logicalTimeMs,
      stateBytes,
      now,
    });
    if (result.status === "accepted" || result.status === "superseded") {
      return completedCommandResult(result.command, result.replayed)!;
    }
    if (result.status === "not_found") return { status: "not_found" };
    if (result.status === "conflict") return { status: "conflict" };
    return {
      status: "progressed",
      logicalTimeMs: result.checkpoint.logicalTimeMs,
      targetLogicalTimeMs: command.targetLogicalTimeMs,
      checkpointRowVersion: result.checkpoint.rowVersion,
    };
  }
}
