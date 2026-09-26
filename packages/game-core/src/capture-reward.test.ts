import { describe, expect, it } from "vitest";
import type { PokemonInstanceId, SpeciesId } from "@pokenexus/game-types";
import {
  CAPTURE_RULES_SEMANTICS_HASH_V1,
  CAPTURE_RULES_VERSION_V1,
  SOLO_HUNT_REWARD_SOURCE_AUTHORITY_V1,
  applyCaptureBallPowerBp,
  baseCaptureChanceBp,
  geneticCaptureChanceBp,
  resolveCaptureAttemptV1,
  resolveSoloHuntEncounterReward,
} from "./capture-reward";
import type { EncounterIndividualizationSnapshot } from "./encounter-individualization";
import type { SoloHuntCompletedEncounterEvidence, SoloHuntPendingCaptureDecision, SoloHuntTeamMemberSnapshot } from "./solo-hunt";

const speciesId = "species:test" as SpeciesId;
const pokemonA = "pokemon:a" as PokemonInstanceId;
const pokemonB = "pokemon:b" as PokemonInstanceId;
const pokemonC = "pokemon:c" as PokemonInstanceId;

function teamMember(pokemonInstanceId: PokemonInstanceId, level: number): SoloHuntTeamMemberSnapshot {
  return {
    pokemonInstanceId,
    speciesId,
    level,
    baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    types: [],
    moveLoadout: [],
  };
}

function evidence(rewardEnvelope: unknown): SoloHuntCompletedEncounterEvidence {
  return {
    rewardSourceIdentity: "reward:test:1",
    huntRunIdentity: "hunt-run:test",
    encounterId: "encounter:test" as never,
    encounterOrdinal: 1,
    pendingSelectionIdentity: "pending:test",
    encounterDefinitionId: "encounter-def:test" as never,
    speciesId,
    level: 10,
    completionKind: "defeat",
    participantPokemonInstanceIds: [pokemonA, pokemonB, pokemonC],
    rewardEnvelope,
    contentVersion: "content-v1",
    contentHash: "sha256:test",
    gameDataVersion: "game-data-v1" as never,
    rulesVersion: "rules-v1" as never,
    completedAtHuntTimeMs: 100,
  };
}

describe("TASK-036 reward resolution", () => {
  it("splits Pokémon XP in pinned Team order, excludes Level 200, and resolves every item row", () => {
    const rewardInput = {
      pokemonXpPool: 5,
      playerXp: 7,
      itemDrops: [
        { itemId: "item:a", quantity: 2, chanceBasisPoints: 10_000 },
        { itemId: "item:a", quantity: 3, chanceBasisPoints: 10_000 },
      ],
    } as const;
    const result = resolveSoloHuntEncounterReward({
      subjectPlayerId: "player:test",
      evidence: evidence(rewardInput),
      pinnedTeam: [teamMember(pokemonB, 10), teamMember(pokemonA, 10), teamMember(pokemonC, 200)],
      rewardInput,
      rng: { algorithm: "xorshift32-v1", state: 12345 },
    });
    expect(result.envelope).toEqual({
      subjectPlayerId: "player:test",
      sourceAuthority: SOLO_HUNT_REWARD_SOURCE_AUTHORITY_V1,
      sourceCorrelation: "reward:test:1",
      rulesVersion: "rules-v1",
      gameDataVersion: "game-data-v1",
      effects: [
        { kind: "pokemon_xp", pokemonInstanceId: pokemonB, amount: 3n },
        { kind: "pokemon_xp", pokemonInstanceId: pokemonA, amount: 2n },
        { kind: "player_xp", playerId: "player:test", amount: 7n },
        { kind: "item_grant", itemId: "item:a", quantity: 5n },
      ],
    });
    expect(result.rngAfter).not.toEqual(result.rngBefore);
  });

  it("supports an authentic empty effect set while preserving deterministic continuation", () => {
    const rewardInput = {
      pokemonXpPool: 0,
      playerXp: null,
      itemDrops: [{ itemId: "item:a", quantity: 1, chanceBasisPoints: 0 }],
    } as const;
    const first = resolveSoloHuntEncounterReward({
      subjectPlayerId: "player:test",
      evidence: evidence(rewardInput),
      pinnedTeam: [teamMember(pokemonA, 200), teamMember(pokemonB, 200), teamMember(pokemonC, 200)],
      rewardInput,
      rng: { algorithm: "xorshift32-v1", state: 987654321 },
    });
    const replay = resolveSoloHuntEncounterReward({
      subjectPlayerId: "player:test",
      evidence: evidence(rewardInput),
      pinnedTeam: [teamMember(pokemonA, 200), teamMember(pokemonB, 200), teamMember(pokemonC, 200)],
      rewardInput,
      rng: { algorithm: "xorshift32-v1", state: 987654321 },
    });
    expect(first.envelope.effects).toEqual([]);
    expect(replay).toEqual(first);
    expect(first.rngAfter).not.toEqual(first.rngBefore);
  });

  it("fails closed on rewritten reward data and participant mismatch", () => {
    const rewardInput = { pokemonXpPool: 5, playerXp: null, itemDrops: [] } as const;
    expect(() => resolveSoloHuntEncounterReward({
      subjectPlayerId: "player:test",
      evidence: evidence({ ...rewardInput, pokemonXpPool: 6 }),
      pinnedTeam: [teamMember(pokemonA, 10), teamMember(pokemonB, 10)],
      rewardInput,
      rng: { algorithm: "xorshift32-v1", state: 1 },
    })).toThrow(/rewardEnvelope/);
    expect(() => resolveSoloHuntEncounterReward({
      subjectPlayerId: "player:test",
      evidence: evidence(rewardInput),
      pinnedTeam: [teamMember(pokemonA, 10), teamMember(pokemonB, 10)],
      rewardInput,
      rng: { algorithm: "xorshift32-v1", state: 1 },
    })).toThrow(/not in the pinned Team/);
  });
});

describe("TASK-036 capture probability", () => {
  it("materializes the accepted monotone catch-rate anchors and interpolation", () => {
    expect([3, 25, 45, 75, 120, 190, 255].map(baseCaptureChanceBp)).toEqual([
      800, 1500, 2500, 3500, 5000, 6800, 8200,
    ]);
    expect(baseCaptureChanceBp(35)).toBe(2000);
    expect(() => baseCaptureChanceBp(2)).toThrow(/3..255/);
  });

  it("applies Genetics before the deterministic failure-exponent Ball artifact", () => {
    expect(geneticCaptureChanceBp(2500, "Apex")).toBe(2000);
    expect(applyCaptureBallPowerBp(2000, 4)).toBe(2000);
    expect(applyCaptureBallPowerBp(2000, 5)).toBe(2434);
    expect(applyCaptureBallPowerBp(2000, 6)).toBe(2845);
    expect(applyCaptureBallPowerBp(2000, 8)).toBe(3600);
    expect(applyCaptureBallPowerBp(2000, 9)).toBe(3947);
  });

  it("never lets ordinary Ball rules become an exact 100% guarantee", () => {
    expect(applyCaptureBallPowerBp(10_000, 9)).toBe(9999);
  });
});

describe("TASK-036 capture resolution", () => {
  const snapshot: EncounterIndividualizationSnapshot = {
    pendingSelectionIdentity: "pending:test",
    speciesId,
    level: 10,
    ivs: { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 },
    geneticScore: 97,
    geneticGrade: "Apex",
    geneticBudget: 60,
    compatibleProfiles: ["Harmony", "Might"],
    birthProfile: "Harmony",
    birthGeneticBonuses: { hp: 10, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 },
    profileAllocations: [
      { profile: "Harmony", bonuses: { hp: 10, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 } },
      { profile: "Might", bonuses: { hp: 9, atk: 15, def: 9, spa: 6, spd: 9, spe: 12 } },
    ],
    shiny: false,
    isAscendant: false,
    individualizationRulesVersion: "encounter-individualization-v1",
    derivationAuthorityVersion: "authority-v1",
    derivationAuthorityKeyId: "key-v1:test",
    individualizationSnapshotIdentity: "indv1:test",
    individualizationSnapshotCommitment: "sha256:test",
  };
  const pending: SoloHuntPendingCaptureDecision = {
    encounterId: "encounter:test" as never,
    encounterDefinitionId: "encounter-def:test" as never,
    speciesId,
    level: 10,
    contentVersion: "content-v1",
    contentHash: "sha256:content",
    gameDataVersion: "game-data-v1" as never,
    rulesVersion: "rules-v1" as never,
    pendingSelectionIdentity: snapshot.pendingSelectionIdentity,
    individualizationSnapshotIdentity: snapshot.individualizationSnapshotIdentity,
    individualizationSnapshotCommitment: snapshot.individualizationSnapshotCommitment,
    individualizationRulesVersion: snapshot.individualizationRulesVersion,
    derivationAuthorityVersion: snapshot.derivationAuthorityVersion,
    derivationAuthorityKeyId: snapshot.derivationAuthorityKeyId,
  };

  it("binds outcome to the exact individualization lineage and capture RNG", () => {
    const first = resolveCaptureAttemptV1({
      pendingCapture: pending,
      snapshot,
      catchRate: 45,
      ball: { itemId: "item:ultra-ball", powerQuarterUnits: 8 },
      captureRulesVersion: CAPTURE_RULES_VERSION_V1,
      rng: { algorithm: "xorshift32-v1", state: 123456789 },
    });
    const replay = resolveCaptureAttemptV1({
      pendingCapture: pending,
      snapshot,
      catchRate: 45,
      ball: { itemId: "item:ultra-ball", powerQuarterUnits: 8 },
      captureRulesVersion: CAPTURE_RULES_VERSION_V1,
      rng: { algorithm: "xorshift32-v1", state: 123456789 },
    });
    expect(first).toEqual(replay);
    expect(first.captureRulesSemanticsHash).toBe(CAPTURE_RULES_SEMANTICS_HASH_V1);
    expect(first.baseChanceBp).toBe(2500);
    expect(first.geneticChanceBp).toBe(2000);
    expect(first.finalChanceBp).toBe(3600);
  });

  it("rejects a different valid-looking snapshot", () => {
    expect(() => resolveCaptureAttemptV1({
      pendingCapture: pending,
      snapshot: { ...snapshot, individualizationSnapshotIdentity: "indv1:other" },
      catchRate: 45,
      ball: { itemId: "item:poke-ball", powerQuarterUnits: 4 },
      captureRulesVersion: CAPTURE_RULES_VERSION_V1,
      rng: { algorithm: "xorshift32-v1", state: 123 },
    })).toThrow(/snapshot identity mismatch/);
  });
});
