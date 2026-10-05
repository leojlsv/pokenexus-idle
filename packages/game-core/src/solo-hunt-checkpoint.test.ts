import { describe, expect, it } from "vitest";
import type { SoloHuntRuntimeState } from "./solo-hunt";
import {
  SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V1,
  SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V2,
  SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V3,
  SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V4,
  decodeSoloHuntCheckpoint,
  decodeSoloHuntCheckpointV1,
  decodeSoloHuntCheckpointV2,
  decodeSoloHuntCheckpointV3,
  decodeSoloHuntCheckpointV4,
  encodeSoloHuntCheckpointV1,
  encodeSoloHuntCheckpointV2,
  encodeSoloHuntCheckpointV3,
  encodeSoloHuntCheckpointV4,
} from "./solo-hunt-checkpoint";
import {
  NO_SAVED_AUTO_POTION_POLICY,
  NO_SAVED_AUTO_REVIVE_POLICY,
} from "./hunt-automation-policy";

function checkpointState(): SoloHuntRuntimeState {
  return {
    huntRunIdentity: "hunt-run:checkpoint",
    playerId: "player:checkpoint",
    zoneId: "zone:test",
    huntDefinitionId: "hunt:test",
    contentVersion: "pve-content:test",
    contentHash: "sha256:test",
    gameDataVersion: "game:v3",
    rulesVersion: "rules:v4",
    interBattleGapMs: 0,
    pinnedTeam: [],
    logicalTimeMs: 123,
    nextEncounterOrdinal: 2,
    selectionStreamOrigin: { kind: "rng", policyRng: { algorithm: "xorshift32-v1", state: 11 } },
    combatDeterministicOrigin: { rng: { algorithm: "xorshift32-v1", state: 8 } },
    policyRng: { algorithm: "xorshift32-v1", state: 12 },
    combatDeterministicState: { rng: { algorithm: "xorshift32-v1", state: 10 } },
    interBattle: {
      cadence: {
        effects: [],
        hpByParticipant: {},
        maxHpByParticipant: {},
        readinessByParticipant: {},
        actionLockRemainingMsByParticipant: {},
      },
      policy: { nextMoveSlotByParticipant: {} },
      remainingGapMs: 0,
    },
    completedEncounters: [{
      rewardSourceIdentity: "[\"soloHuntEncounterReward\",\"hunt-run:checkpoint\",1]",
      huntRunIdentity: "hunt-run:checkpoint",
      encounterId: "[\"soloHuntEncounter\",\"hunt-run:checkpoint\",1]",
      encounterOrdinal: 1,
      pendingSelectionIdentity: "pending:1",
      encounterDefinitionId: "encounter-definition:1",
      speciesId: "species:1",
      level: 5,
      completionKind: "defeat",
      participantPokemonInstanceIds: [],
      rewardEnvelope: { exact: 5n },
      contentVersion: "pve-content:test",
      contentHash: "sha256:test",
      gameDataVersion: "game:v3",
      rulesVersion: "rules:v4",
      completedAtHuntTimeMs: 100,
    }],
    completedEncounterProvenance: [{
      encounterId: "[\"soloHuntEncounter\",\"hunt-run:checkpoint\",1]",
      encounterOrdinal: 1,
      consumedPendingEncounterSelection: {
        pendingSelectionIdentity: "pending:1",
        playerId: "player:checkpoint",
        zoneId: "zone:test",
        huntDefinitionId: "hunt:test",
        contentVersion: "pve-content:test",
        contentHash: "sha256:test",
        gameDataVersion: "game:v3",
        rulesVersion: "rules:v4",
        encounterDefinitionId: "encounter-definition:1",
        speciesId: "species:1",
        level: 5,
        policyRngBeforeSelection: { algorithm: "xorshift32-v1", state: 11 },
        policyRngAfterSelection: { algorithm: "xorshift32-v1", state: 12 },
      },
      participantActivations: [],
      battleStimuli: [],
      battleStartedAtHuntTimeMs: 0,
      completedAtHuntTimeMs: 100,
      terminalBattleTimeMs: 100,
      terminalEventSequence: 1,
    }],
    status: "active",
  } as unknown as SoloHuntRuntimeState;
}

function geneticCheckpointState(): SoloHuntRuntimeState {
  const source = checkpointState();
  const provenance = source.completedEncounterProvenance[0]!;
  const consumedPendingEncounterSelection = {
    ...provenance.consumedPendingEncounterSelection,
    compatibleProfiles: ["Might", "Clarity"] as const,
    individualizationRulesVersion: "encounter-individualization-v1" as const,
    derivationAuthorityVersion: "authority:v1",
    derivationAuthorityKeyId: "key:v1",
  };
  const individualizationSnapshot = {
    pendingSelectionIdentity: "pending:1",
    speciesId: "species:1",
    level: 5,
    ivs: { hp: 10, atk: 11, def: 12, spa: 13, spd: 14, spe: 15 },
    geneticScore: 83,
    geneticGrade: "Epic" as const,
    geneticBudget: 35,
    compatibleProfiles: ["Might", "Clarity"] as const,
    birthProfile: "Might" as const,
    birthGeneticBonuses: { hp: 5, atk: 10, def: 5, spa: 4, spd: 5, spe: 6 },
    profileAllocations: [
      { profile: "Might" as const, bonuses: { hp: 5, atk: 10, def: 5, spa: 4, spd: 5, spe: 6 } },
      { profile: "Clarity" as const, bonuses: { hp: 5, atk: 4, def: 5, spa: 10, spd: 5, spe: 6 } },
    ] as const,
    shiny: false,
    isAscendant: false,
    individualizationRulesVersion: "encounter-individualization-v1" as const,
    derivationAuthorityVersion: "authority:v1",
    derivationAuthorityKeyId: "key:v1",
    individualizationSnapshotIdentity: "snapshot:1",
    individualizationSnapshotCommitment: "commitment:1",
  };
  return {
    ...source,
    completedEncounters: [{
      ...source.completedEncounters[0]!,
      individualizationSnapshotIdentity: "snapshot:1",
      individualizationSnapshotCommitment: "commitment:1",
      individualizationRulesVersion: "encounter-individualization-v1",
      derivationAuthorityVersion: "authority:v1",
      derivationAuthorityKeyId: "key:v1",
    }],
    completedEncounterProvenance: [{
      ...provenance,
      consumedPendingEncounterSelection,
      individualizationSnapshot,
    }],
  } as unknown as SoloHuntRuntimeState;
}

describe("Solo Hunt checkpoint codec", () => {
  it("round-trips canonical state deterministically, including bigint evidence", () => {
    const source = checkpointState();
    const first = encodeSoloHuntCheckpointV1(source);
    const second = encodeSoloHuntCheckpointV1(source);
    expect(first).toEqual(second);
    const decoded = decodeSoloHuntCheckpointV1(first);
    expect(decoded).toEqual({ accepted: true, state: source });
  });

  it("is independent of object insertion order", () => {
    const source = checkpointState();
    const reordered = Object.fromEntries(Object.entries(source).reverse()) as unknown as SoloHuntRuntimeState;
    expect(encodeSoloHuntCheckpointV1(reordered)).toEqual(encodeSoloHuntCheckpointV1(source));
  });

  it("keeps v1 immutable and uses v2 for explicit healing provenance", () => {
    const source = checkpointState();
    const healingState = {
      ...source,
      pinnedTeam: [{
        pokemonInstanceId: "pokemon:1",
        speciesId: "species:1",
        level: 5,
        baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        geneticBonuses: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        types: ["type:grass"],
        moveLoadout: ["move:tackle"],
      }],
      appliedHealingEvents: [{
        sourceIdentity: "heal:1",
        acceptanceSequence: "1",
        afterEncounterId: source.completedEncounters[0]!.encounterId,
        afterEncounterOrdinal: 1,
        appliedAtHuntTimeMs: 100,
        targetPokemonInstanceId: "pokemon:1",
        magnitude: { kind: "integer" as const, amount: 5 },
        healedHp: 5,
      }],
    } as unknown as SoloHuntRuntimeState;

    expect(() => encodeSoloHuntCheckpointV1(healingState)).toThrow(/v1 cannot encode explicit healing/);
    const bytes = encodeSoloHuntCheckpointV2(healingState);
    expect(new TextDecoder().decode(bytes)).toContain(SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V2);
    expect(decodeSoloHuntCheckpointV2(bytes)).toEqual({ accepted: true, state: healingState });
  });

  it("uses v3 to retain exact Capture/Potion/Revive authority across restart", () => {
    const state = {
      ...checkpointState(),
      appliedHealingEvents: [],
      appliedAutomationEvents: [],
      automationPolicies: {
        capture: { policyVersion: "policy:capture", rowVersion: "4", enabled: true },
        potion: NO_SAVED_AUTO_POTION_POLICY,
        revive: NO_SAVED_AUTO_REVIVE_POLICY,
      },
    } as unknown as SoloHuntRuntimeState;
    const bytes = encodeSoloHuntCheckpointV3(state);
    expect(new TextDecoder().decode(bytes)).toContain(SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V3);
    expect(decodeSoloHuntCheckpointV3(bytes)).toEqual({ accepted: true, state });
    expect(decodeSoloHuntCheckpoint(bytes)).toEqual({ accepted: true, state });
    expect(decodeSoloHuntCheckpointV2(bytes)).toMatchObject({ accepted: false });

    const missing = { ...state, automationPolicies: undefined } as unknown as SoloHuntRuntimeState;
    expect(() => encodeSoloHuntCheckpointV3(missing)).toThrow(/automation policy authority/i);
  });

  it("requires pinned original Shiny only in v4 and does not reinterpret legacy checkpoints", () => {
    const v2State = {
      ...geneticCheckpointState(),
      pinnedTeam: [{
        pokemonInstanceId: "pokemon:1",
        speciesId: "species:1",
        level: 5,
        baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        types: ["type:grass"],
        moveLoadout: ["move:tackle"],
      }],
      appliedHealingEvents: [],
    } as unknown as SoloHuntRuntimeState;
    const legacyBytes = encodeSoloHuntCheckpointV2(v2State);
    expect(decodeSoloHuntCheckpoint(legacyBytes)).toEqual({ accepted: true, state: v2State });
    const automationPolicies = {
      capture: { policyVersion: "policy:capture", rowVersion: "4", enabled: true },
      potion: NO_SAVED_AUTO_POTION_POLICY,
      revive: NO_SAVED_AUTO_REVIVE_POLICY,
    } as const;
    const missingShinyState = {
      ...v2State,
      automationPolicies,
      appliedAutomationEvents: [],
    } as unknown as SoloHuntRuntimeState;
    const v3Bytes = encodeSoloHuntCheckpointV3(missingShinyState);
    expect(decodeSoloHuntCheckpointV3(v3Bytes)).toEqual({ accepted: true, state: missingShinyState });
    expect(decodeSoloHuntCheckpoint(v3Bytes)).toEqual({ accepted: true, state: missingShinyState });
    expect(() => encodeSoloHuntCheckpointV4(missingShinyState)).toThrow(/original owned Shiny/);

    const shinyState = {
      ...v2State,
      automationPolicies,
      appliedAutomationEvents: [],
      pinnedTeam: v2State.pinnedTeam.map((member) => ({ ...member, shiny: true })),
      completedEncounterProvenance: v2State.completedEncounterProvenance.map((provenance) => ({
        ...provenance,
        battleOrigin: {
          battleId: "battle:checkpoint:1",
          sourceVersions: {
            gameDataVersion: v2State.gameDataVersion,
            rulesVersion: v2State.rulesVersion,
            combatEventSchemaVersion: "events:test",
          },
          individualizationSnapshot: v2State.completedEncounterProvenance[0]!.individualizationSnapshot!,
          sides: [
            { sideId: "side:owned", combatantIds: ["combatant:owned"], activeCombatantIds: ["combatant:owned"] },
            { sideId: "side:wild", combatantIds: ["combatant:wild"], activeCombatantIds: ["combatant:wild"] },
          ],
          participants: [
            {
              kind: "owned" as const,
              combatantId: "combatant:owned",
              sideId: "side:owned",
              pokemonInstanceId: "pokemon:1",
              speciesId: "species:1",
              level: 5,
              shiny: true,
              currentHp: 10,
              maxHp: 10,
            },
            {
              kind: "wild" as const,
              combatantId: "combatant:wild",
              sideId: "side:wild",
              speciesId: "species:wild",
              level: 5,
              shiny: false,
              state: "conscious" as const,
            },
          ],
          initialEvents: [{
            kind: "BattleStarted" as const,
            battleId: "battle:checkpoint:1",
            sequence: 1,
            combatTimeMs: 0,
          }],
        },
      })),
    } as unknown as SoloHuntRuntimeState;
    const v4Bytes = encodeSoloHuntCheckpointV4(shinyState);
    expect(new TextDecoder().decode(v4Bytes)).toContain(SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V4);
    expect(decodeSoloHuntCheckpointV4(v4Bytes)).toEqual({ accepted: true, state: shinyState });
    expect(decodeSoloHuntCheckpoint(v4Bytes)).toEqual({ accepted: true, state: shinyState });
    expect(decodeSoloHuntCheckpointV3(v4Bytes)).toMatchObject({ accepted: false });
    expect(decodeSoloHuntCheckpointV2(v4Bytes)).toMatchObject({ accepted: false });
    const {
      automationPolicies: _automationPolicies,
      appliedAutomationEvents: _appliedAutomationEvents,
      ...legacyShinyState
    } = shinyState;
    expect(decodeSoloHuntCheckpointV2(encodeSoloHuntCheckpointV2(
      legacyShinyState as unknown as SoloHuntRuntimeState,
    ))).toMatchObject({
      accepted: false,
      reason: expect.stringMatching(/unknown field shiny/),
    });

    const malformedShiny = {
      ...shinyState,
      pinnedTeam: shinyState.pinnedTeam.map((member) => ({ ...member, shiny: "yes" })),
    } as unknown as SoloHuntRuntimeState;
    expect(() => encodeSoloHuntCheckpointV4(malformedShiny)).toThrow(/original owned Shiny/);
  });

  it("fails closed for malformed or unknown schemas", () => {
    expect(decodeSoloHuntCheckpointV1(new Uint8Array())).toMatchObject({ accepted: false });
    expect(decodeSoloHuntCheckpointV1(new TextEncoder().encode("not-json"))).toMatchObject({ accepted: false });
    expect(decodeSoloHuntCheckpointV1(new TextEncoder().encode(JSON.stringify({
      schemaVersion: `${SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V1}:future`,
      state: ["null"],
    })))).toEqual({ accepted: false, reason: "Unsupported Solo Hunt checkpoint schema" });
  });

  it("rejects alternate non-canonical byte representations of the same state", () => {
    const canonical = new TextDecoder().decode(encodeSoloHuntCheckpointV1(checkpointState()));
    expect(decodeSoloHuntCheckpointV1(new TextEncoder().encode(` ${canonical}`))).toEqual({
      accepted: false,
      reason: "Solo Hunt checkpoint bytes are not canonical",
    });
  });

  it.each([
    ["missing policy RNG", { policyRng: undefined }],
    ["missing deterministic origin", { combatDeterministicOrigin: undefined }],
    ["missing runtime phase", { interBattle: undefined }],
    ["two runtime phases", { currentEncounter: {}, interBattle: {} }],
    ["malformed selection origin", { selectionStreamOrigin: { kind: "rng" } }],
  ] as const)("fails closed for canonical bytes with %s", (_label, override) => {
    const malformed = { ...checkpointState(), ...override } as unknown as SoloHuntRuntimeState;
    expect(decodeSoloHuntCheckpointV1(encodeSoloHuntCheckpointV1(malformed))).toMatchObject({ accepted: false });
  });

  it("fails closed for unknown v1 runtime fields", () => {
    const malformed = { ...checkpointState(), futureField: "future" } as unknown as SoloHuntRuntimeState;
    expect(decodeSoloHuntCheckpointV1(encodeSoloHuntCheckpointV1(malformed))).toMatchObject({
      accepted: false,
      reason: expect.stringMatching(/unknown field futureField/),
    });
  });

  it("fails closed for malformed nested cadence entries before replay", () => {
    const source = checkpointState() as unknown as Record<string, unknown>;
    const interBattle = source.interBattle as Record<string, unknown>;
    const cadence = interBattle.cadence as Record<string, unknown>;
    const malformed = {
      ...source,
      interBattle: {
        ...interBattle,
        cadence: {
          ...cadence,
          readinessByParticipant: { malformed: {} },
        },
      },
    } as unknown as SoloHuntRuntimeState;
    expect(decodeSoloHuntCheckpointV1(encodeSoloHuntCheckpointV1(malformed))).toMatchObject({ accepted: false });
  });

  it("fails closed when completed Encounter evidence loses matching provenance", () => {
    const malformed = {
      ...checkpointState(),
      completedEncounterProvenance: [],
    } as unknown as SoloHuntRuntimeState;
    expect(decodeSoloHuntCheckpointV1(encodeSoloHuntCheckpointV1(malformed))).toMatchObject({
      accepted: false,
      reason: expect.stringMatching(/evidence\/provenance length mismatch/),
    });
  });

  it("fails closed when an inter-Battle checkpoint retains a pending selection", () => {
    const source = checkpointState();
    const malformed = {
      ...source,
      pendingEncounterSelection: source.completedEncounterProvenance[0]!.consumedPendingEncounterSelection,
    } as unknown as SoloHuntRuntimeState;
    expect(decodeSoloHuntCheckpointV1(encodeSoloHuntCheckpointV1(malformed))).toMatchObject({
      accepted: false,
      reason: expect.stringMatching(/inter-Battle phase cannot retain a pending selection/),
    });
  });

  it("fails closed when pending capture is not bound to its completed Encounter evidence", () => {
    const source = checkpointState();
    const malformed = {
      ...source,
      pendingCaptureDecision: {
        encounterId: "[\"soloHuntEncounter\",\"hunt-run:checkpoint\",1]",
        encounterDefinitionId: "encounter-definition:1",
        speciesId: "species:forged",
        level: 5,
        contentVersion: "pve-content:test",
        contentHash: "sha256:test",
        gameDataVersion: "game:v3",
        rulesVersion: "rules:v4",
      },
    } as unknown as SoloHuntRuntimeState;
    expect(decodeSoloHuntCheckpointV1(encodeSoloHuntCheckpointV1(malformed))).toMatchObject({
      accepted: false,
      reason: expect.stringMatching(/pending capture does not match completed Encounter evidence/),
    });
  });

  it("fails closed when completed selection provenance carries a forged runtime context", () => {
    const source = checkpointState();
    const provenance = source.completedEncounterProvenance[0]!;
    const malformed = {
      ...source,
      completedEncounterProvenance: [{
        ...provenance,
        consumedPendingEncounterSelection: {
          ...provenance.consumedPendingEncounterSelection,
          zoneId: "zone:forged",
        },
      }],
    } as unknown as SoloHuntRuntimeState;
    expect(decodeSoloHuntCheckpointV1(encodeSoloHuntCheckpointV1(malformed))).toMatchObject({
      accepted: false,
      reason: expect.stringMatching(/evidence\/provenance is context-incompatible/),
    });
  });

  it("fails closed when completed Encounter count does not match next ordinal", () => {
    const malformed = {
      ...checkpointState(),
      nextEncounterOrdinal: 3,
    } as unknown as SoloHuntRuntimeState;
    expect(decodeSoloHuntCheckpointV1(encodeSoloHuntCheckpointV1(malformed))).toMatchObject({
      accepted: false,
      reason: expect.stringMatching(/count does not match encounter progression/),
    });
  });

  it("fails closed for an unsupported individualization rules version", () => {
    const source = geneticCheckpointState();
    const provenance = source.completedEncounterProvenance[0]!;
    const malformed = {
      ...source,
      completedEncounterProvenance: [{
        ...provenance,
        consumedPendingEncounterSelection: {
          ...provenance.consumedPendingEncounterSelection,
          individualizationRulesVersion: "encounter-individualization-v2",
        },
      }],
    } as unknown as SoloHuntRuntimeState;
    expect(decodeSoloHuntCheckpointV1(encodeSoloHuntCheckpointV1(malformed))).toMatchObject({
      accepted: false,
      reason: expect.stringMatching(/unsupported individualizationRulesVersion/),
    });
  });

  it("fails closed for unsupported or duplicate compatible Genetic Profiles", () => {
    const source = geneticCheckpointState();
    const provenance = source.completedEncounterProvenance[0]!;
    for (const compatibleProfiles of [["Might", "Unknown"], ["Might", "Might"]]) {
      const malformed = {
        ...source,
        completedEncounterProvenance: [{
          ...provenance,
          consumedPendingEncounterSelection: {
            ...provenance.consumedPendingEncounterSelection,
            compatibleProfiles,
          },
        }],
      } as unknown as SoloHuntRuntimeState;
      expect(decodeSoloHuntCheckpointV1(encodeSoloHuntCheckpointV1(malformed))).toMatchObject({
        accepted: false,
        reason: expect.stringMatching(/two distinct supported Profiles/),
      });
    }
  });

  it("fails closed for an unsupported Genetic Grade in an individualization snapshot", () => {
    const source = geneticCheckpointState();
    const provenance = source.completedEncounterProvenance[0]!;
    const malformed = {
      ...source,
      completedEncounterProvenance: [{
        ...provenance,
        individualizationSnapshot: {
          ...provenance.individualizationSnapshot!,
          geneticGrade: "Legendary",
        },
      }],
    } as unknown as SoloHuntRuntimeState;
    expect(decodeSoloHuntCheckpointV1(encodeSoloHuntCheckpointV1(malformed))).toMatchObject({
      accepted: false,
      reason: expect.stringMatching(/unsupported geneticGrade/),
    });
  });

  it("fails closed when the birth Profile is outside compatible Profiles", () => {
    const source = geneticCheckpointState();
    const provenance = source.completedEncounterProvenance[0]!;
    const malformed = {
      ...source,
      completedEncounterProvenance: [{
        ...provenance,
        individualizationSnapshot: {
          ...provenance.individualizationSnapshot!,
          birthProfile: "Endurance",
        },
      }],
    } as unknown as SoloHuntRuntimeState;
    expect(decodeSoloHuntCheckpointV1(encodeSoloHuntCheckpointV1(malformed))).toMatchObject({
      accepted: false,
      reason: expect.stringMatching(/birthProfile is not compatible/),
    });
  });

  it("fails closed when Profile allocations disagree with compatible Profiles", () => {
    const source = geneticCheckpointState();
    const provenance = source.completedEncounterProvenance[0]!;
    const snapshot = provenance.individualizationSnapshot!;
    const malformed = {
      ...source,
      completedEncounterProvenance: [{
        ...provenance,
        individualizationSnapshot: {
          ...snapshot,
          profileAllocations: [snapshot.profileAllocations[1], snapshot.profileAllocations[0]],
        },
      }],
    } as unknown as SoloHuntRuntimeState;
    expect(decodeSoloHuntCheckpointV1(encodeSoloHuntCheckpointV1(malformed))).toMatchObject({
      accepted: false,
      reason: expect.stringMatching(/profileAllocations do not match compatibleProfiles/),
    });
  });

  it("fails closed when completed participants disagree with participant activation provenance", () => {
    const source = checkpointState();
    const malformed = {
      ...source,
      completedEncounters: [{
        ...source.completedEncounters[0]!,
        participantPokemonInstanceIds: ["pokemon:forged"],
      }],
    } as unknown as SoloHuntRuntimeState;
    expect(decodeSoloHuntCheckpointV1(encodeSoloHuntCheckpointV1(malformed))).toMatchObject({
      accepted: false,
      reason: expect.stringMatching(/evidence\/provenance is context-incompatible/),
    });
  });
});
