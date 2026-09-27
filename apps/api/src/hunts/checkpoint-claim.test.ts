import { describe, expect, it, vi } from "vitest";
import type { SoloHuntRuntimeInputs, SoloHuntRuntimeState } from "@pokenexus/game-core";
import {
  SoloHuntCheckpointClaimService,
  type SoloHuntAdvanceCommandRecord,
  type SoloHuntCheckpointAdvancer,
  type SoloHuntCheckpointRecord,
  type SoloHuntCheckpointRepository,
} from "./checkpoint-claim";

const bytes = (value: string) => new TextEncoder().encode(value);

function state(logicalTimeMs = 10): SoloHuntRuntimeState {
  return {
    playerId: "player:test",
    huntRunIdentity: "hunt:test",
    gameDataVersion: "game:v3",
    rulesVersion: "rules:v4",
    logicalTimeMs,
  } as SoloHuntRuntimeState;
}

function checkpoint(logicalTimeMs = 10, rowVersion = 3n): SoloHuntCheckpointRecord {
  return {
    checkpointId: "checkpoint:test",
    subjectPlayerId: "player:test",
    huntRunIdentity: "hunt:test",
    schemaVersion: "checkpoint:v1",
    gameDataVersion: "game:v3",
    rulesVersion: "rules:v4",
    logicalTimeMs,
    logicalTimeAnchorAt: new Date("2026-09-26T23:00:00.000Z"),
    stateBytes: bytes(String(logicalTimeMs)),
    rowVersion,
    createdAt: new Date("2026-09-26T23:00:00.000Z"),
    updatedAt: new Date("2026-09-26T23:00:00.000Z"),
  };
}

function command(
  targetLogicalTimeMs = 100,
  status: SoloHuntAdvanceCommandRecord["status"] = "advanced",
  commandCorrelation = "advance:1",
  baseCheckpointRowVersion = 3n,
): SoloHuntAdvanceCommandRecord {
  const base: SoloHuntAdvanceCommandRecord = {
    subjectPlayerId: "player:test",
    checkpointId: "checkpoint:test",
    commandCorrelation,
    targetLogicalTimeMs,
    targetWallClockAt: new Date("2026-09-26T23:30:00.000Z"),
    baseCheckpointRowVersion,
    schemaVersion: "checkpoint:v1",
    gameDataVersion: "game:v3",
    rulesVersion: "rules:v4",
    status,
  };
  if (status === "advanced") {
    return {
      ...base,
      resultCheckpointRowVersion: baseCheckpointRowVersion + 1n,
      resultLogicalTimeMs: targetLogicalTimeMs,
      resultStateBytes: bytes(String(targetLogicalTimeMs)),
    };
  }
  return base;
}

function supersededCommand(targetLogicalTimeMs: number, resultLogicalTimeMs: number): SoloHuntAdvanceCommandRecord {
  return {
    ...command(targetLogicalTimeMs, "superseded"),
    resultCheckpointRowVersion: 5n,
    resultLogicalTimeMs,
  };
}

function harness(
  overrides: Partial<SoloHuntCheckpointRepository> = {},
  maxSegmentMs?: number,
) {
  const repository: SoloHuntCheckpointRepository = {
    loadAdvanceCommandByCorrelation: vi.fn(async () => null),
    loadCheckpoint: vi.fn(async () => checkpoint()),
    freezeAdvance: vi.fn(async (input) => ({
      status: "accepted" as const,
      replayed: false,
      command: command(
        input.targetLogicalTimeMs,
        "pending",
        input.commandCorrelation,
        input.expectedCheckpointRowVersion,
      ),
    })),
    progressAdvance: vi.fn(async (input) => ({
      status: "progressed" as const,
      checkpoint: {
        ...checkpoint(input.logicalTimeMs, input.expectedCheckpointRowVersion + 1n),
        stateBytes: input.stateBytes,
      },
    })),
    commitAdvance: vi.fn(async (input) => ({
      status: "accepted" as const,
      replayed: false,
      command: command(
        input.targetLogicalTimeMs,
        "advanced",
        input.commandCorrelation,
        input.expectedCheckpointRowVersion,
      ),
    })),
    ...overrides,
  };
  const decode = vi.fn((value: Uint8Array) => state(Number(new TextDecoder().decode(value))));
  const encode = vi.fn((value: SoloHuntRuntimeState) => bytes(String(value.logicalTimeMs)));
  const loadInputs = vi.fn(async () => ({} as SoloHuntRuntimeInputs));
  const advance = vi.fn<SoloHuntCheckpointAdvancer["advance"]>(
    (current: SoloHuntRuntimeState, _inputs: SoloHuntRuntimeInputs, target: number) => ({
      accepted: true as const,
      state: { ...current, logicalTimeMs: target },
      stopReason: "cutoff" as const,
      events: [],
    }),
  );
  const service = new SoloHuntCheckpointClaimService(
    repository,
    { schemaVersion: "checkpoint:v1", decode, encode },
    { load: loadInputs },
    { advance },
    maxSegmentMs,
  );
  return { service, repository, decode, encode, loadInputs, advance };
}

const request = {
  subjectPlayerId: "player:test",
  checkpointId: "checkpoint:test",
  commandCorrelation: "advance:1",
  targetLogicalTimeMs: 100,
  now: new Date("2026-09-26T23:30:00Z"),
};

describe("SoloHuntCheckpointClaimService", () => {
  it("replays a committed correlation before loading checkpoint/current authority", async () => {
    const existing = command();
    const h = harness({ loadAdvanceCommandByCorrelation: vi.fn(async () => existing) });
    await expect(h.service.advance(request)).resolves.toEqual({
      status: "advanced",
      replayed: true,
      command: existing,
    });
    expect(h.repository.loadCheckpoint).not.toHaveBeenCalled();
    expect(h.decode).not.toHaveBeenCalled();
    expect(h.loadInputs).not.toHaveBeenCalled();
  });

  it("replays elapsed-time response loss before recalculating a later wall-clock cutoff", async () => {
    const existing = command(100);
    const h = harness({ loadAdvanceCommandByCorrelation: vi.fn(async () => existing) });
    await expect(h.service.advanceElapsed({
      subjectPlayerId: "player:test",
      checkpointId: "checkpoint:test",
      commandCorrelation: "advance:1",
      now: new Date("2026-09-27T23:00:00.000Z"),
    })).resolves.toEqual({ status: "advanced", replayed: true, command: existing });
    expect(h.repository.loadCheckpoint).not.toHaveBeenCalled();
    expect(h.advance).not.toHaveBeenCalled();
  });

  it("replays a durable superseded elapsed correlation without deriving a later cutoff", async () => {
    const existing = supersededCommand(100, 101);
    const h = harness({ loadAdvanceCommandByCorrelation: vi.fn(async () => existing) });
    await expect(h.service.advanceElapsed({
      subjectPlayerId: "player:test",
      checkpointId: "checkpoint:test",
      commandCorrelation: "advance:1",
      now: new Date("2026-09-28T23:00:00.000Z"),
    })).resolves.toEqual({ status: "superseded", logicalTimeMs: 101 });
    expect(h.repository.loadCheckpoint).not.toHaveBeenCalled();
    expect(h.repository.freezeAdvance).not.toHaveBeenCalled();
    expect(h.advance).not.toHaveBeenCalled();
  });

  it("derives elapsed logical target exactly once from the authoritative checkpoint wall clock", async () => {
    const current = {
      ...checkpoint(100, 3n),
      updatedAt: new Date("2026-09-26T23:00:00.000Z"),
      stateBytes: bytes("100"),
    };
    const h = harness({ loadCheckpoint: vi.fn(async () => current) });
    await expect(h.service.advanceElapsed({
      subjectPlayerId: "player:test",
      checkpointId: "checkpoint:test",
      commandCorrelation: "advance:elapsed",
      now: new Date("2026-09-26T23:00:01.500Z"),
    })).resolves.toMatchObject({ status: "advanced" });
    expect(h.advance).toHaveBeenCalledWith(expect.objectContaining({ logicalTimeMs: 100 }), {}, 1600);
    expect(h.repository.commitAdvance).toHaveBeenCalledWith(expect.objectContaining({
      commandCorrelation: "advance:elapsed",
      targetLogicalTimeMs: 1600,
    }));
    expect(h.repository.freezeAdvance).toHaveBeenCalledWith(expect.objectContaining({
      commandCorrelation: "advance:elapsed",
      targetLogicalTimeMs: 1600,
      expectedCheckpointRowVersion: 3n,
    }));
  });

  it("fails closed when elapsed wall clock predates the persisted checkpoint", async () => {
    const h = harness();
    await expect(h.service.advanceElapsed({
      subjectPlayerId: "player:test",
      checkpointId: "checkpoint:test",
      commandCorrelation: "advance:past",
      now: new Date("2026-09-26T22:59:59.999Z"),
    })).rejects.toThrow(/cannot move backward/);
    expect(h.repository.commitAdvance).not.toHaveBeenCalled();
  });

  it("keeps the first elapsed cutoff frozen when the initial freeze loses an OCC race", async () => {
    const initial = {
      ...checkpoint(100, 3n),
      logicalTimeAnchorAt: new Date("2026-09-26T23:00:00.000Z"),
      stateBytes: bytes("100"),
    };
    const raced = {
      ...checkpoint(1700, 4n),
      logicalTimeAnchorAt: new Date("2026-09-26T23:00:01.600Z"),
      stateBytes: bytes("1700"),
    };
    let freezes = 0;
    const h = harness({
      loadCheckpoint: vi.fn(async () => initial),
      freezeAdvance: vi.fn(async (freezeInput) => {
        freezes += 1;
        if (freezes === 1) return { status: "stale" as const, checkpoint: raced };
        return {
          status: "accepted" as const,
          replayed: false,
          command: supersededCommand(freezeInput.targetLogicalTimeMs, raced.logicalTimeMs),
        };
      }),
    });
    await expect(h.service.advanceElapsed({
      subjectPlayerId: "player:test",
      checkpointId: "checkpoint:test",
      commandCorrelation: "advance:elapsed-stale",
      now: new Date("2026-09-26T23:00:01.500Z"),
    })).resolves.toEqual({ status: "superseded", logicalTimeMs: 1700 });
    expect(h.repository.freezeAdvance).toHaveBeenNthCalledWith(1, expect.objectContaining({
      targetLogicalTimeMs: 1600,
      expectedCheckpointRowVersion: 3n,
    }));
    expect(h.repository.freezeAdvance).toHaveBeenNthCalledWith(2, expect.objectContaining({
      targetLogicalTimeMs: 1600,
      expectedCheckpointRowVersion: 4n,
    }));
    expect(h.advance).not.toHaveBeenCalled();
  });

  it("rejects reuse of a committed correlation with a different frozen target", async () => {
    const h = harness({ loadAdvanceCommandByCorrelation: vi.fn(async () => command(99)) });
    await expect(h.service.advance(request)).resolves.toEqual({ status: "conflict" });
    expect(h.repository.loadCheckpoint).not.toHaveBeenCalled();
  });

  it("advances and commits exactly to the requested logical cutoff", async () => {
    const h = harness();
    const result = await h.service.advance(request);
    expect(result).toMatchObject({ status: "advanced", replayed: false });
    expect(h.advance).toHaveBeenCalledWith(expect.objectContaining({ logicalTimeMs: 10 }), {}, 100);
    expect(h.repository.commitAdvance).toHaveBeenCalledWith(expect.objectContaining({
      commandCorrelation: "advance:1",
      targetLogicalTimeMs: 100,
      expectedCheckpointRowVersion: 3n,
      logicalTimeMs: 100,
    }));
  });

  it("fails closed on malformed checkpoint bytes even when the frozen target is already reached", async () => {
    const atTarget = checkpoint(100, 3n);
    const h = harness({
      loadCheckpoint: vi.fn(async () => atTarget),
      freezeAdvance: vi.fn(async () => ({
        status: "accepted" as const,
        replayed: false,
        command: command(100, "pending", "advance:1", 3n),
      })),
    });
    h.decode.mockImplementation(() => {
      throw new Error("Solo Hunt checkpoint decode failed: malformed");
    });
    await expect(h.service.advance(request)).rejects.toThrow(/decode failed: malformed/);
    expect(h.repository.commitAdvance).not.toHaveBeenCalled();
    expect(h.advance).not.toHaveBeenCalled();
  });

  it("runs authoritative replay validation before completing an already-reached target", async () => {
    const atTarget = checkpoint(100, 3n);
    const h = harness({
      loadCheckpoint: vi.fn(async () => atTarget),
      freezeAdvance: vi.fn(async () => ({
        status: "accepted" as const,
        replayed: false,
        command: command(100, "pending", "advance:1", 3n),
      })),
    });
    h.advance.mockReturnValue({
      accepted: false,
      reason: "Solo Hunt current Encounter individualization snapshot does not replay exactly",
      state: state(100),
      events: [],
    });
    await expect(h.service.advance(request)).rejects.toThrow(/individualization snapshot does not replay exactly/);
    expect(h.loadInputs).toHaveBeenCalledTimes(1);
    expect(h.advance).toHaveBeenCalledWith(expect.objectContaining({ logicalTimeMs: 100 }), {}, 100);
    expect(h.repository.commitAdvance).not.toHaveBeenCalled();
  });

  it("persists one bounded segment per invocation and resumes the same frozen correlation", async () => {
    let stored = checkpoint(10, 3n);
    let frozen = false;
    const pending = command(100, "pending", "advance:1", 3n);
    const h = harness({
      loadAdvanceCommandByCorrelation: vi.fn(async () => frozen ? pending : null),
      loadCheckpoint: vi.fn(async () => stored),
      freezeAdvance: vi.fn(async () => {
        frozen = true;
        return { status: "accepted" as const, replayed: false, command: pending };
      }),
      progressAdvance: vi.fn(async (input) => {
        stored = {
          ...stored,
          logicalTimeMs: input.logicalTimeMs,
          stateBytes: input.stateBytes,
          rowVersion: stored.rowVersion + 1n,
        };
        return { status: "progressed" as const, checkpoint: stored };
      }),
      commitAdvance: vi.fn(async (input) => ({
        status: "accepted" as const,
        replayed: false,
        command: command(
          input.targetLogicalTimeMs,
          "advanced",
          input.commandCorrelation,
          pending.baseCheckpointRowVersion,
        ),
      })),
    }, 30);

    await expect(h.service.advance(request)).resolves.toMatchObject({
      status: "progressed",
      logicalTimeMs: 40,
      targetLogicalTimeMs: 100,
      checkpointRowVersion: 4n,
    });
    await expect(h.service.advance(request)).resolves.toMatchObject({
      status: "progressed",
      logicalTimeMs: 70,
      targetLogicalTimeMs: 100,
      checkpointRowVersion: 5n,
    });
    await expect(h.service.advance(request)).resolves.toMatchObject({ status: "advanced" });

    expect(h.advance).toHaveBeenNthCalledWith(1, expect.objectContaining({ logicalTimeMs: 10 }), {}, 40);
    expect(h.advance).toHaveBeenNthCalledWith(2, expect.objectContaining({ logicalTimeMs: 40 }), {}, 70);
    expect(h.advance).toHaveBeenNthCalledWith(3, expect.objectContaining({ logicalTimeMs: 70 }), {}, 100);
    expect(h.repository.freezeAdvance).toHaveBeenCalledTimes(1);
    expect(h.repository.progressAdvance).toHaveBeenCalledTimes(2);
    expect(h.repository.commitAdvance).toHaveBeenCalledTimes(1);
  });

  it("stops after one simulated segment when the final OCC write loses a race", async () => {
    const newer = checkpoint(40, 4n);
    let commits = 0;
    const h = harness({
      commitAdvance: vi.fn(async (input) => {
        commits += 1;
        if (commits === 1) return { status: "stale" as const, checkpoint: newer };
        return {
          status: "accepted" as const,
          replayed: false,
          command: command(
            input.targetLogicalTimeMs,
            "advanced",
            input.commandCorrelation,
            input.expectedCheckpointRowVersion,
          ),
        };
      }),
    });
    await expect(h.service.advance(request)).resolves.toEqual({
      status: "progressed",
      logicalTimeMs: 40,
      targetLogicalTimeMs: 100,
      checkpointRowVersion: 4n,
    });
    expect(h.advance).toHaveBeenCalledTimes(1);
    expect(h.advance).toHaveBeenCalledWith(expect.objectContaining({ logicalTimeMs: 10 }), {}, 100);
    expect(h.repository.commitAdvance).toHaveBeenCalledTimes(1);
    expect(h.repository.commitAdvance).toHaveBeenCalledWith(expect.objectContaining({
      targetLogicalTimeMs: 100,
      expectedCheckpointRowVersion: 3n,
    }));
  });

  it("returns superseded when authoritative state already moved beyond the frozen target", async () => {
    const superseded = supersededCommand(100, 101);
    const h = harness({
      loadCheckpoint: vi.fn(async () => checkpoint(101, 5n)),
      freezeAdvance: vi.fn(async () => ({ status: "accepted" as const, replayed: false, command: superseded })),
    });
    await expect(h.service.advance(request)).resolves.toEqual({ status: "superseded", logicalTimeMs: 101 });
    expect(h.advance).not.toHaveBeenCalled();
  });

  it("fails closed when persisted context and decoded checkpoint disagree", async () => {
    const h = harness();
    h.decode.mockReturnValue({ ...state(10), rulesVersion: "rules:forged" } as unknown as SoloHuntRuntimeState);
    await expect(h.service.advance(request)).rejects.toThrow(/pinned context/);
    expect(h.repository.commitAdvance).not.toHaveBeenCalled();
  });

  it("fails closed when the encoded Hunt identity does not match the persisted checkpoint", async () => {
    const h = harness();
    h.decode.mockReturnValue({
      ...state(10),
      huntRunIdentity: "hunt:forged",
    } as unknown as SoloHuntRuntimeState);
    await expect(h.service.advance(request)).rejects.toThrow(/Hunt identity/);
    expect(h.loadInputs).not.toHaveBeenCalled();
    expect(h.repository.commitAdvance).not.toHaveBeenCalled();
  });
});
