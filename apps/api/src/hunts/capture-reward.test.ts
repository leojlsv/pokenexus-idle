import { describe, expect, it, vi } from "vitest";
import type {
  CaptureAttemptCommitResult,
  CaptureAttemptIntent,
  CaptureAttemptRecord,
} from "@pokenexus/database";
import type {
  EncounterIndividualizationSnapshot,
  SoloHuntCompletedEncounterEvidence,
  SoloHuntPendingCaptureDecision,
  SoloHuntTeamMemberSnapshot,
} from "@pokenexus/game-core";
import type { MoveEligibilityContext, MoveEligibilityContextLoader } from "../moves/context";
import {
  SoloHuntCaptureResolutionService,
  SoloHuntRewardApplicationService,
  SoloHuntRewardResolutionService,
  type CaptureAttemptRepository,
  type CaptureBallAuthority,
  type HistoricalEncounterAuthorityLoader,
  type SoloHuntCaptureSourceReplayValidator,
  type SoloHuntRewardSourceReplayValidator,
} from "./capture-reward";

const speciesId = "species:test" as never;

function snapshot(): EncounterIndividualizationSnapshot {
  return {
    pendingSelectionIdentity: "pending:test",
    speciesId,
    level: 10,
    ivs: { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 },
    geneticScore: 20,
    geneticGrade: "Normal",
    geneticBudget: 5,
    compatibleProfiles: ["Harmony", "Might"],
    birthProfile: "Harmony",
    birthGeneticBonuses: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 0 },
    profileAllocations: [
      { profile: "Harmony", bonuses: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 0 } },
      { profile: "Might", bonuses: { hp: 1, atk: 1, def: 1, spa: 0, spd: 1, spe: 1 } },
    ],
    shiny: false,
    isAscendant: false,
    individualizationRulesVersion: "encounter-individualization-v1",
    derivationAuthorityVersion: "authority-v1",
    derivationAuthorityKeyId: "key-v1:test",
    individualizationSnapshotIdentity: "indv1:test",
    individualizationSnapshotCommitment: "sha256:snapshot",
  };
}

function pending(individual = snapshot()): SoloHuntPendingCaptureDecision {
  return {
    encounterId: "encounter:test" as never,
    encounterDefinitionId: "encounter-definition:test" as never,
    speciesId,
    level: 10,
    contentVersion: "content-v1",
    contentHash: "sha256:content",
    gameDataVersion: "game-data:historical" as never,
    rulesVersion: "rules:historical" as never,
    pendingSelectionIdentity: individual.pendingSelectionIdentity,
    individualizationSnapshotIdentity: individual.individualizationSnapshotIdentity,
    individualizationSnapshotCommitment: individual.individualizationSnapshotCommitment,
    individualizationRulesVersion: individual.individualizationRulesVersion,
    derivationAuthorityVersion: individual.derivationAuthorityVersion,
    derivationAuthorityKeyId: individual.derivationAuthorityKeyId,
  };
}

function historical(): HistoricalEncounterAuthorityLoader {
  return {
    load: vi.fn(async (input) => ({
      ...input,
      catchRate: 45,
      reward: { pokemonXpPool: 10, playerXp: 3, itemDrops: [] },
    })),
  };
}

function creationContext(options: {
  readonly abilities?: readonly { abilityId: string; sourceAbilitySlot: "normal-1" | "normal-2" }[];
  readonly executableMoves?: readonly string[] | null;
} = {}): MoveEligibilityContext {
  const abilities = options.abilities ?? [{ abilityId: "ability:normal-1", sourceAbilitySlot: "normal-1" }];
  return {
    pair: { gameDataVersion: "game-data:creation", rulesVersion: "rules:creation" },
    rules: {
      rulesVersion: "rules:creation",
      moveEligibilityRuleArtifactId: "pokenexus.move-eligibility.level-up-only.v1",
      moveEligibilityRuleSemanticsHash: "sha256:test",
    },
    speciesIds: new Set([speciesId]),
    speciesById: new Map([[speciesId, {
      id: speciesId,
      abilities,
    } as never]]),
    moveIds: new Set(["move:one", "move:two", "move:late"]),
    learnsetsBySpecies: new Map([[speciesId, [
      {
        speciesId,
        moveId: "move:one" as never,
        sourceGeneration: 8,
        sourceGame: "test",
        method: "level-up" as const,
        level: 1,
        machineIdentifier: null,
        sourceRecordIds: ["source:1"],
      },
      {
        speciesId,
        moveId: "move:two" as never,
        sourceGeneration: 8,
        sourceGame: "test",
        method: "level-up" as const,
        level: 5,
        machineIdentifier: null,
        sourceRecordIds: ["source:2"],
      },
      {
        speciesId,
        moveId: "move:late" as never,
        sourceGeneration: 8,
        sourceGame: "test",
        method: "level-up" as const,
        level: 20,
        machineIdentifier: null,
        sourceRecordIds: ["source:3"],
      },
    ]]]),
    productionExecutableMoveIds: options.executableMoves === undefined
      ? ["move:one", "move:two"]
      : options.executableMoves,
    productionCatalog: null,
  };
}

function captureAttemptRecord(individual = snapshot()): CaptureAttemptRecord {
  const target = pending(individual);
  return {
    captureAttemptId: "00000000-0000-7000-8000-000000000099",
    subjectPlayerId: "00000000-0000-7000-8000-000000000001",
    attemptCorrelation: "capture-command:test",
    encounterId: target.encounterId,
    encounterDefinitionId: target.encounterDefinitionId,
    speciesId: target.speciesId,
    level: target.level,
    selectedItemId: "item:poke-ball",
    captureRulesVersion: "pokenexus.capture.post-defeat.v1",
    captureRulesSemanticsHash: "sha256:capture-rules",
    contentVersion: target.contentVersion,
    contentHash: target.contentHash,
    encounterGameDataVersion: target.gameDataVersion,
    encounterRulesVersion: target.rulesVersion,
    creationGameDataVersion: "game-data:creation:retained",
    creationRulesVersion: "rules:creation:retained",
    pendingSelectionIdentity: individual.pendingSelectionIdentity,
    individualizationSnapshotIdentity: individual.individualizationSnapshotIdentity,
    individualizationSnapshotCommitment: individual.individualizationSnapshotCommitment,
    individualizationRulesVersion: individual.individualizationRulesVersion,
    derivationAuthorityVersion: individual.derivationAuthorityVersion,
    derivationAuthorityKeyId: individual.derivationAuthorityKeyId,
    baseChanceBp: 2500,
    geneticChanceBp: 2500,
    finalChanceBp: 2500,
    captureRoll: 9999,
    rng: { algorithm: "xorshift32-v1", before: 1, after: 270369 },
    success: false,
    pokemon: null,
    createdPokemonInstanceId: null,
    acceptedAt: new Date("2026-09-26T20:00:00.000Z"),
  };
}

function repository(existing: CaptureAttemptRecord | null = null) {
  const loadByCorrelation = vi.fn(async () => existing);
  const commit = vi.fn(async (
    _input: CaptureAttemptIntent & { expectedInventoryRowVersion: bigint; now: Date },
  ): Promise<CaptureAttemptCommitResult> => ({ status: "inventory_stale", rowVersion: 9n }));
  return {
    value: { loadByCorrelation, commit } satisfies CaptureAttemptRepository,
    loadByCorrelation,
    commit,
  };
}

function rewardReplayValidator(input: {
  readonly evidence: SoloHuntCompletedEncounterEvidence;
  readonly pinnedTeam: readonly SoloHuntTeamMemberSnapshot[];
  readonly subjectPlayerId?: string;
}): SoloHuntRewardSourceReplayValidator {
  return {
    validate: vi.fn(() => ({
      accepted: true as const,
      source: {
        subjectPlayerId: (input.subjectPlayerId ?? "00000000-0000-7000-8000-000000000001") as never,
        evidence: input.evidence,
        pinnedTeam: [...input.pinnedTeam],
      },
    })),
  };
}

function captureReplayValidator(
  individual = snapshot(),
  subjectPlayerId = "00000000-0000-7000-8000-000000000001",
): SoloHuntCaptureSourceReplayValidator {
  const target = pending(individual);
  return {
    validate: vi.fn((input) => input.encounterId === target.encounterId
      ? {
          accepted: true as const,
          source: {
            subjectPlayerId: subjectPlayerId as never,
            pendingCapture: target,
            snapshot: individual,
          },
        }
      : {
          accepted: false as const,
          reason: "Solo Hunt Encounter is not the exact replay-validated pending capture decision",
        }),
  };
}

function captureAttemptInput(
  individual = snapshot(),
  overrides: Partial<{
    subjectPlayerId: string;
    attemptCorrelation: string;
    encounterId: SoloHuntPendingCaptureDecision["encounterId"];
    selectedItemId: string;
    captureRng: { algorithm: "xorshift32-v1"; state: number };
    expectedInventoryRowVersion: bigint;
    now: Date;
  }> = {},
) {
  return {
    subjectPlayerId: "00000000-0000-7000-8000-000000000001",
    attemptCorrelation: "capture-command:test",
    encounterId: pending(individual).encounterId,
    huntState: {} as never,
    huntInputs: {} as never,
    selectedItemId: "item:poke-ball",
    captureRng: { algorithm: "xorshift32-v1" as const, state: 1 },
    expectedInventoryRowVersion: 0n,
    now: new Date("2026-09-26T19:50:24.000Z"),
    ...overrides,
  };
}

describe("SoloHuntCaptureResolutionService", () => {
  it("preflights deterministic normal-1 and Move bootstrap before committing an accepted-success intent", async () => {
    const individual = snapshot();
    const repo = repository();
    const context = creationContext();
    const loader: MoveEligibilityContextLoader = { loadForNewOperation: vi.fn(async () => context) };
    const balls: CaptureBallAuthority = {
      resolve: vi.fn(async (itemId) => ({ itemId, powerQuarterUnits: 4 as const })),
    };
    const service = new SoloHuntCaptureResolutionService(
      repo.value,
      historical(),
      loader,
      balls,
      captureReplayValidator(individual),
    );
    const now = new Date("2026-09-26T19:50:24.000Z");

    await expect(service.attempt(captureAttemptInput(individual, {
      expectedInventoryRowVersion: 8n,
      now,
    }))).resolves.toEqual({ status: "inventory_stale", rowVersion: 9n });

    expect(repo.commit).toHaveBeenCalledOnce();
    const intent = repo.commit.mock.calls[0]![0];
    expect(intent.success).toBe(true);
    expect(intent.pokemon).toMatchObject({
      speciesId,
      level: 10,
      ivs: individual.ivs,
      totalExperience: 999n,
      geneticScore: 20,
      birthProfile: "Harmony",
      shiny: false,
      selectedAbilityId: "ability:normal-1",
      moveIds: ["move:two", "move:one"],
    });
    expect(intent.creationGameDataVersion).toBe("game-data:creation");
    expect(intent.creationRulesVersion).toBe("rules:creation");
    expect(intent.expectedInventoryRowVersion).toBe(8n);
  });

  it("returns a durable same-correlation replay before consulting current Ball or creation authority", async () => {
    const individual = snapshot();
    const existing = captureAttemptRecord(individual);
    const repo = repository(existing);
    const historicalAuthority = historical();
    const loader: MoveEligibilityContextLoader = {
      loadForNewOperation: vi.fn(async () => {
        throw new Error("current creation context must not be consulted on replay");
      }),
    };
    const balls: CaptureBallAuthority = {
      resolve: vi.fn(async () => {
        throw new Error("current Ball authority must not be consulted on replay");
      }),
    };
    const captureSource = captureReplayValidator(individual);
    const service = new SoloHuntCaptureResolutionService(
      repo.value,
      historicalAuthority,
      loader,
      balls,
      captureSource,
    );

    await expect(service.attempt(captureAttemptInput(individual, {
      subjectPlayerId: existing.subjectPlayerId,
      attemptCorrelation: existing.attemptCorrelation,
      encounterId: existing.encounterId as never,
      selectedItemId: existing.selectedItemId,
      captureRng: { algorithm: "xorshift32-v1", state: existing.rng.before },
      expectedInventoryRowVersion: 999n,
      now: new Date("2026-09-26T21:00:00.000Z"),
    }))).resolves.toEqual({ status: "accepted", replayed: true, attempt: existing });

    expect(repo.loadByCorrelation).toHaveBeenCalledOnce();
    expect(repo.commit).not.toHaveBeenCalled();
    expect(historicalAuthority.load).not.toHaveBeenCalled();
    expect(loader.loadForNewOperation).not.toHaveBeenCalled();
    expect(balls.resolve).not.toHaveBeenCalled();
    expect(captureSource.validate).not.toHaveBeenCalled();
  });

  it("conflicts a same-correlation replay when the frozen capture RNG origin changes", async () => {
    const individual = snapshot();
    const existing = captureAttemptRecord(individual);
    const repo = repository(existing);
    const historicalAuthority = historical();
    const loader: MoveEligibilityContextLoader = {
      loadForNewOperation: vi.fn(async () => creationContext()),
    };
    const balls: CaptureBallAuthority = {
      resolve: vi.fn(async (itemId) => ({ itemId, powerQuarterUnits: 4 as const })),
    };
    const captureSource = captureReplayValidator(individual);
    const service = new SoloHuntCaptureResolutionService(
      repo.value,
      historicalAuthority,
      loader,
      balls,
      captureSource,
    );

    await expect(service.attempt(captureAttemptInput(individual, {
      subjectPlayerId: existing.subjectPlayerId,
      attemptCorrelation: existing.attemptCorrelation,
      encounterId: existing.encounterId as never,
      selectedItemId: existing.selectedItemId,
      captureRng: { algorithm: "xorshift32-v1", state: 987654321 },
      expectedInventoryRowVersion: 999n,
      now: new Date("2026-09-26T21:01:00.000Z"),
    }))).resolves.toEqual({ status: "conflict", existingAttemptId: existing.captureAttemptId });

    expect(repo.commit).not.toHaveBeenCalled();
    expect(historicalAuthority.load).not.toHaveBeenCalled();
    expect(loader.loadForNewOperation).not.toHaveBeenCalled();
    expect(balls.resolve).not.toHaveBeenCalled();
    expect(captureSource.validate).not.toHaveBeenCalled();
  });

  it("fails closed when the selected creation context lacks production-executable Move authority", async () => {
    const repo = repository();
    const loader: MoveEligibilityContextLoader = {
      loadForNewOperation: vi.fn(async () => creationContext({ executableMoves: null })),
    };
    const service = new SoloHuntCaptureResolutionService(
      repo.value,
      historical(),
      loader,
      { resolve: vi.fn(async (itemId) => ({ itemId, powerQuarterUnits: 4 as const })) },
      captureReplayValidator(),
    );
    await expect(service.attempt(captureAttemptInput())).rejects.toThrow(
      /lacks exact production-executable Move authority/,
    );
    expect(repo.commit).not.toHaveBeenCalled();
  });

  it("fails before repository commit when normal-1 is missing or ambiguous", async () => {
    for (const abilities of [
      [{ abilityId: "ability:normal-2", sourceAbilitySlot: "normal-2" as const }],
      [
        { abilityId: "ability:a", sourceAbilitySlot: "normal-1" as const },
        { abilityId: "ability:b", sourceAbilitySlot: "normal-1" as const },
      ],
    ]) {
      const repo = repository();
      const loader: MoveEligibilityContextLoader = {
        loadForNewOperation: vi.fn(async () => creationContext({ abilities })),
      };
      const service = new SoloHuntCaptureResolutionService(
        repo.value,
        historical(),
        loader,
        { resolve: vi.fn(async (itemId) => ({ itemId, powerQuarterUnits: 4 as const })) },
        captureReplayValidator(),
      );
      await expect(service.attempt(captureAttemptInput())).rejects.toThrow(/exactly one canonical normal-1/);
      expect(repo.commit).not.toHaveBeenCalled();
    }
  });

  it("fails before repository commit when no production-selectable bootstrap Move exists", async () => {
    const repo = repository();
    const loader: MoveEligibilityContextLoader = {
      loadForNewOperation: vi.fn(async () => creationContext({ executableMoves: [] })),
    };
    const service = new SoloHuntCaptureResolutionService(
      repo.value,
      historical(),
      loader,
      { resolve: vi.fn(async (itemId) => ({ itemId, powerQuarterUnits: 4 as const })) },
      captureReplayValidator(),
    );
    await expect(service.attempt(captureAttemptInput())).rejects.toThrow(/no selectable bootstrap Move/);
    expect(repo.commit).not.toHaveBeenCalled();
  });

  it("rejects an unauthorized capture ItemId before resolving capture", async () => {
    const repo = repository();
    const service = new SoloHuntCaptureResolutionService(
      repo.value,
      historical(),
      { loadForNewOperation: vi.fn(async () => creationContext()) },
      { resolve: vi.fn(async () => null) },
      captureReplayValidator(),
    );
    await expect(service.attempt(captureAttemptInput(snapshot(), {
      selectedItemId: "item:not-authorized",
    }))).rejects.toThrow(/not authorized/);
    expect(repo.commit).not.toHaveBeenCalled();
  });

  it("uses only the replay-validated TASK-097 snapshot and rejects unavailable capture provenance", async () => {
    const individual = snapshot();
    const repo = repository();
    const rejectedSource: SoloHuntCaptureSourceReplayValidator = {
      validate: vi.fn(() => ({
        accepted: false as const,
        reason: "Solo Hunt pending capture lacks authoritative TASK-097 individualization snapshot provenance",
      })),
    };
    const historicalAuthority = historical();
    const loader: MoveEligibilityContextLoader = { loadForNewOperation: vi.fn(async () => creationContext()) };
    const balls: CaptureBallAuthority = {
      resolve: vi.fn(async (itemId) => ({ itemId, powerQuarterUnits: 4 as const })),
    };
    const service = new SoloHuntCaptureResolutionService(
      repo.value,
      historicalAuthority,
      loader,
      balls,
      rejectedSource,
    );

    await expect(service.attempt(captureAttemptInput(individual))).rejects.toThrow(
      /capture source failed replay validation/,
    );
    expect(historicalAuthority.load).not.toHaveBeenCalled();
    expect(loader.loadForNewOperation).not.toHaveBeenCalled();
    expect(balls.resolve).not.toHaveBeenCalled();
    expect(repo.commit).not.toHaveBeenCalled();
  });
});

describe("SoloHuntRewardResolutionService", () => {
  it("loads exact historical reward authority before resolving", async () => {
    const authority = historical();
    const reward = { pokemonXpPool: 10, playerXp: 3, itemDrops: [] } as const;
    const evidence: SoloHuntCompletedEncounterEvidence = {
      rewardSourceIdentity: "reward:test",
      huntRunIdentity: "hunt:test",
      encounterId: "encounter:test" as never,
      encounterOrdinal: 1,
      pendingSelectionIdentity: "pending:test",
      encounterDefinitionId: "encounter-definition:test" as never,
      speciesId,
      level: 10,
      completionKind: "defeat",
      participantPokemonInstanceIds: ["00000000-0000-7000-8000-000000000010" as never],
      rewardEnvelope: reward,
      contentVersion: "content-v1",
      contentHash: "sha256:content",
      gameDataVersion: "game-data:historical" as never,
      rulesVersion: "rules:historical" as never,
      completedAtHuntTimeMs: 100,
    };
    const member: SoloHuntTeamMemberSnapshot = {
      pokemonInstanceId: evidence.participantPokemonInstanceIds[0]!,
      speciesId,
      level: 10,
      baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
      ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
      types: [],
      moveLoadout: [],
    };
    const replayValidator = rewardReplayValidator({ evidence, pinnedTeam: [member] });
    const service = new SoloHuntRewardResolutionService(authority, replayValidator);

    const result = await service.resolve({
      huntState: {} as never,
      huntInputs: {} as never,
      rewardSourceIdentity: evidence.rewardSourceIdentity,
      rewardRng: { algorithm: "xorshift32-v1", state: 123 },
    });
    expect(result.envelope.effects).toEqual([
      { kind: "pokemon_xp", pokemonInstanceId: member.pokemonInstanceId, amount: 10n },
      { kind: "player_xp", playerId: "00000000-0000-7000-8000-000000000001", amount: 3n },
    ]);
    expect(authority.load).toHaveBeenCalledWith({
      encounterDefinitionId: evidence.encounterDefinitionId,
      speciesId,
      gameDataVersion: evidence.gameDataVersion,
      contentVersion: evidence.contentVersion,
      contentHash: evidence.contentHash,
    });
  });

  it("feeds the exact resolved envelope unchanged into TASK-024 claim/application and preserves RNG continuation", async () => {
    const authority: HistoricalEncounterAuthorityLoader = {
      load: vi.fn(async (input) => ({
        ...input,
        catchRate: 45,
        reward: { pokemonXpPool: 0, playerXp: null, itemDrops: [] },
      })),
    };
    const claimResolution = vi.fn(async (envelope) => ({
      status: "created" as const,
      resolution: { resolutionId: "resolution:test", ...envelope },
    }));
    const applyResolution = vi.fn(async () => ({
      status: "completed" as const,
      resolutionId: "resolution:test",
      completionId: "completion:test",
      completedAt: new Date("2026-09-26T20:10:00.000Z"),
      replayed: false,
    }));
    const reward = { pokemonXpPool: 0, playerXp: null, itemDrops: [] } as const;
    const evidence: SoloHuntCompletedEncounterEvidence = {
      rewardSourceIdentity: "reward:test:empty",
      huntRunIdentity: "hunt:test",
      encounterId: "encounter:test:empty" as never,
      encounterOrdinal: 2,
      pendingSelectionIdentity: "pending:test:empty",
      encounterDefinitionId: "encounter-definition:test" as never,
      speciesId,
      level: 10,
      completionKind: "defeat",
      participantPokemonInstanceIds: [],
      rewardEnvelope: reward,
      contentVersion: "content-v1",
      contentHash: "sha256:content",
      gameDataVersion: "game-data:historical" as never,
      rulesVersion: "rules:historical" as never,
      completedAtHuntTimeMs: 200,
    };
    const replayValidator = rewardReplayValidator({ evidence, pinnedTeam: [] });
    const service = new SoloHuntRewardApplicationService(authority, {
      claimResolution,
      applyResolution,
    }, replayValidator);

    const result = await service.resolveAndApply({
      huntState: {} as never,
      huntInputs: {} as never,
      rewardSourceIdentity: evidence.rewardSourceIdentity,
      rewardRng: { algorithm: "xorshift32-v1", state: 1234567 },
    });

    expect(result.claimStatus).toBe("created");
    expect(result.application).toMatchObject({ status: "completed", replayed: false });
    expect(claimResolution).toHaveBeenCalledOnce();
    expect(claimResolution).toHaveBeenCalledWith(result.resolution.envelope, undefined);
    expect(result.resolution.envelope.effects).toEqual([]);
    expect(applyResolution).toHaveBeenCalledWith("resolution:test", undefined);
    expect(result.resolution.rngAfter).toEqual(result.resolution.rngBefore);
  });

  it("rejects a reward source before historical lookup when Solo Hunt replay validation fails", async () => {
    const authority = historical();
    const replayValidator: SoloHuntRewardSourceReplayValidator = {
      validate: vi.fn(() => ({
        accepted: false as const,
        reason: "Solo Hunt reward source is absent from replay-validated completed Encounter history",
      })),
    };
    const service = new SoloHuntRewardResolutionService(authority, replayValidator);

    await expect(service.resolve({
      huntState: {} as never,
      huntInputs: {} as never,
      rewardSourceIdentity: "reward:forged",
      rewardRng: { algorithm: "xorshift32-v1", state: 123 },
    })).rejects.toThrow(/failed replay validation/);
    expect(authority.load).not.toHaveBeenCalled();
  });
});
