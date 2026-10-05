import { describe, expect, it } from "vitest";
import {
  cadenceParticipantKey,
  createRngState,
  ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
  GENETIC_COMBAT_RULES_VERSION_V1,
  GENETIC_COMBAT_RULES_VERSION_V2,
  initializeBattle,
  MANAGEMENT_FIRST_COMBAT_EVENT_SCHEMA_VERSION_V1,
  MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1,
  NO_SAVED_AUTO_POTION_POLICY,
  NO_SAVED_AUTO_REVIVE_POLICY,
  resolveCombatStimulus,
  type BattleInitInput,
  type AbilityId,
  type CombatantId,
  type EffectId,
  type MoveId,
  type NonPlayerCadenceIdentity,
  type PokemonInstanceId,
  type ResolvedCombatContext,
  type RulesVersion,
  type SpeciesId,
  type TypeId,
} from "./index";
import { deriveEncounterIndividualizationAuthorityKeyIdV1 } from "./encounter-individualization";
import {
  advanceSoloHuntSegmentedToCutoff,
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
  createFreshSoloHuntCadence,
  initializeSoloHuntEncounterBattle,
  pruneSoloHuntEndedOpponentCadence,
  advanceSoloHuntInterBattleCadence,
  advanceSoloHuntToEncounterBoundaryOrCutoff,
  advanceSoloHuntToAutomationBoundaryOrEncounterBoundaryOrCutoff,
  advanceSoloHuntToCutoff,
  applySoloHuntPostBattleAutoRevive,
  applySoloHuntExplicitHealing,
  createSoloHuntRuntime,
  replayValidateSoloHuntCompletedCaptureSource,
  replayValidateSoloHuntCaptureSource,
  replayValidateSoloHuntRewardSource,
  resolveSoloHuntForcedReplacement,
  createSoloHuntMovePolicyState,
  resolveNextSoloHuntMove,
  selectSoloHuntEncounter,
  type SoloHuntRuntimeState,
  validateSoloHuntOpponentCatalog,
} from "./solo-hunt";
import type {
  BattleId,
  EncounterDefinitionId,
  EncounterId,
  HuntDefinitionId,
  PlayerId,
  ZoneId,
} from "@pokenexus/game-types";

const id = <T extends string>(value: string) => value as T;

const firstMove = id<MoveId>("first");
const secondMove = id<MoveId>("second");
const enemyMove = id<MoveId>("enemy");
const normalType = id<TypeId>("normal");

const context: ResolvedCombatContext = {
  gameDataVersion: id("data"),
  rulesVersion: id("rules"),
  combatEventSchemaVersion: id("events"),
  abilityRules: {},
  effectRules: {},
  typeChart: { normal: { normal: 1 } },
  moveRules: {
    first: {
      moveId: firstMove,
      typeId: normalType,
      category: "physical",
      targetScope: "singleEnemy",
      moveCooldownMs: 2000,
      power: 40,
      accuracy: "always",
      criticalPolicy: "never",
    },
    second: {
      moveId: secondMove,
      typeId: normalType,
      category: "physical",
      targetScope: "singleEnemy",
      moveCooldownMs: 2000,
      power: 40,
      accuracy: "always",
      criticalPolicy: "never",
    },
    enemy: {
      moveId: enemyMove,
      typeId: normalType,
      category: "physical",
      targetScope: "singleEnemy",
      moveCooldownMs: 2000,
      power: 40,
      accuracy: "always",
      criticalPolicy: "never",
    },
  },
};

const playerParticipant = {
  kind: "pokemonInstance" as const,
  identity: id<PokemonInstanceId>("pokemon:player"),
};
const enemyParticipant = {
  kind: "nonPlayer" as const,
  identity: id<NonPlayerCadenceIdentity>("encounter:enemy"),
};

function battle(
  playerCooldowns: Readonly<Record<string, number>> = { first: 0, second: 0 },
  enemyCooldown = 0,
): BattleInitInput {
  const playerId = id<CombatantId>("player");
  const enemyId = id<CombatantId>("enemy");
  return {
    battleId: id("battle:one"),
    context,
    deterministicState: { rng: createRngState(1) },
    sides: [
      {
        sideId: id("player-side"),
        activeCapacity: 1,
        combatantIds: [playerId],
        initialActiveCombatantIds: [playerId],
      },
      {
        sideId: id("enemy-side"),
        activeCapacity: 1,
        combatantIds: [enemyId],
        initialActiveCombatantIds: [enemyId],
      },
    ],
    combatants: [
      {
        combatantId: playerId,
        speciesId: id("species:player"),
        level: 10,
        baseStats: { hp: 80, atk: 70, def: 60, spa: 40, spd: 50, spe: 100 },
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        types: [normalType],
        startingHp: 30,
        moveLoadout: [firstMove, secondMove],
        initialNextActionRemainingMs: 0,
        initialMoveCooldownRemainingMs: playerCooldowns,
        cadenceParticipant: playerParticipant,
      },
      {
        combatantId: enemyId,
        speciesId: id("species:enemy"),
        level: 10,
        baseStats: { hp: 80, atk: 60, def: 60, spa: 40, spd: 50, spe: 10 },
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        types: [normalType],
        startingHp: 30,
        moveLoadout: [enemyMove],
        initialNextActionRemainingMs: 0,
        initialMoveCooldownRemainingMs: { enemy: enemyCooldown },
        cadenceParticipant: enemyParticipant,
      },
    ],
    cadenceBindings: {
      [cadenceParticipantKey(playerParticipant)]: playerId,
      [cadenceParticipantKey(enemyParticipant)]: enemyId,
    },
  };
}

describe("TASK-035 ordered Solo Hunt Move policy", () => {
  it("starts every fresh participant at slot 1 and advances only after an accepted execution", () => {
    const initialized = initializeBattle(battle());
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;

    const policy = createSoloHuntMovePolicyState(initialized.state);
    expect(policy.nextMoveSlotByParticipant[cadenceParticipantKey(playerParticipant)]).toBe(1);
    expect(policy.nextMoveSlotByParticipant[cadenceParticipantKey(enemyParticipant)]).toBe(1);

    const resolved = resolveNextSoloHuntMove(
      initialized.state,
      initialized.deterministicState,
      policy,
    );
    expect(resolved.kind).toBe("resolved");
    if (resolved.kind !== "resolved") return;

    expect(resolved.intent).toEqual({
      kind: "useMove",
      actorId: id<CombatantId>("player"),
      moveId: firstMove,
      targetId: id<CombatantId>("enemy"),
    });
    expect(resolved.events[0]).toMatchObject({
      kind: "MoveUsed",
      actorId: id<CombatantId>("player"),
      moveId: firstMove,
    });
    expect(
      resolved.policy.nextMoveSlotByParticipant[cadenceParticipantKey(playerParticipant)],
    ).toBe(2);
    expect(
      resolved.policy.nextMoveSlotByParticipant[cadenceParticipantKey(enemyParticipant)],
    ).toBe(1);
  });

  it("cyclically skips a cooling slot without moving the cursor except after the accepted Move", () => {
    const initialized = initializeBattle(battle({ first: 5000, second: 0 }));
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;

    const policy = createSoloHuntMovePolicyState(initialized.state);
    const resolved = resolveNextSoloHuntMove(
      initialized.state,
      initialized.deterministicState,
      policy,
    );
    expect(resolved.kind).toBe("resolved");
    if (resolved.kind !== "resolved") return;

    expect(resolved.intent.moveId).toBe(secondMove);
    expect(
      resolved.policy.nextMoveSlotByParticipant[cadenceParticipantKey(playerParticipant)],
    ).toBe(1);
  });

  it("fails closed when a carried cursor is outside the frozen populated loadout", () => {
    const initialized = initializeBattle(battle());
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;

    const policy = createSoloHuntMovePolicyState(initialized.state);
    const playerKey = cadenceParticipantKey(playerParticipant);
    const malformed = {
      nextMoveSlotByParticipant: {
        ...policy.nextMoveSlotByParticipant,
        [playerKey]: 3,
      },
    };
    const result = resolveNextSoloHuntMove(
      initialized.state,
      initialized.deterministicState,
      malformed,
    );

    expect(result).toMatchObject({
      kind: "rejected",
      reason: expect.stringContaining("cursor"),
    });
    expect(result).toMatchObject({
      state: initialized.state,
      deterministicState: initialized.deterministicState,
      policy: malformed,
      events: [],
    });
  });

  it("idles without moving any cursor when no participant has a usable Move at this boundary", () => {
    const initialized = initializeBattle(
      battle({ first: 5000, second: 5000 }, 5000),
    );
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;

    const policy = createSoloHuntMovePolicyState(initialized.state);
    const result = resolveNextSoloHuntMove(
      initialized.state,
      initialized.deterministicState,
      policy,
    );

    expect(result).toEqual({
      kind: "idle",
      state: initialized.state,
      deterministicState: initialized.deterministicState,
      policy,
      nextPolicyBoundaryMs: 5000,
      events: [],
    });
  });

  it("identifies the earliest GCD boundary without polling intermediate milliseconds", () => {
    const input = battle();
    input.combatants = input.combatants.map((combatant) => ({
      ...combatant,
      initialNextActionRemainingMs: combatant.combatantId === id<CombatantId>("player") ? 3000 : 7000,
    }));
    const initialized = initializeBattle(input);
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;

    const policy = createSoloHuntMovePolicyState(initialized.state);
    const result = resolveNextSoloHuntMove(
      initialized.state,
      initialized.deterministicState,
      policy,
    );

    expect(result).toMatchObject({ kind: "idle", nextPolicyBoundaryMs: 3000 });
  });

  it("identifies the earliest per-Move readiness boundary across cyclic slots", () => {
    const initialized = initializeBattle(
      battle({ first: 5000, second: 3000 }, 7000),
    );
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;

    const policy = createSoloHuntMovePolicyState(initialized.state);
    const result = resolveNextSoloHuntMove(
      initialized.state,
      initialized.deterministicState,
      policy,
    );

    expect(result).toMatchObject({ kind: "idle", nextPolicyBoundaryMs: 3000 });
  });

  it("waits for the effective action-lock expiry before reconsidering an otherwise ready actor", () => {
    const initialized = initializeBattle(battle());
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;

    const lockedState = {
      ...initialized.state,
      combatants: {
        ...initialized.state.combatants,
        player: {
          ...initialized.state.combatants.player,
          actionLockExpiresAtMsByScope: { battle: 2500, cadence: 1500 },
        },
        enemy: {
          ...initialized.state.combatants.enemy,
          actionLockExpiresAtMsByScope: { battle: 4000 },
        },
      },
    };
    const policy = createSoloHuntMovePolicyState(lockedState);
    const result = resolveNextSoloHuntMove(
      lockedState,
      initialized.deterministicState,
      policy,
    );

    expect(result).toMatchObject({ kind: "idle", nextPolicyBoundaryMs: 2500 });
  });

  it("reconsiders at an earlier effect tick instead of jumping to later action readiness", () => {
    const input = battle();
    input.combatants = input.combatants.map((combatant) => ({
      ...combatant,
      initialNextActionRemainingMs: 5000,
    }));
    const initialized = initializeBattle(input);
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;

    const effectId = id<EffectId>("policy-boundary-effect");
    const stateWithEffect = {
      ...initialized.state,
      effects: {
        effect: {
          effectId,
          targetCombatantId: id<CombatantId>("player"),
          lifetimeScope: "battle" as const,
          stackingPolicy: "replace" as const,
          applicationSequence: 1,
          scheduleRevision: 1,
          appliedAtMs: 0,
          expiresAtMs: 4000,
          nextTickAtMs: 1000,
          stacks: 1,
        },
      },
    };
    const policy = createSoloHuntMovePolicyState(stateWithEffect);
    const result = resolveNextSoloHuntMove(
      stateWithEffect,
      initialized.deterministicState,
      policy,
    );

    expect(result).toMatchObject({ kind: "idle", nextPolicyBoundaryMs: 1000 });
  });
});

describe("TASK-035 fresh Solo Hunt cadence", () => {
  it("starts every pinned Team member at full derived HP with clean readiness, locks, effects, and slot-1 cursors", () => {
    const result = createFreshSoloHuntCadence([
      {
        pokemonInstanceId: id<PokemonInstanceId>("pokemon:one"),
        speciesId: id("species:one"),
        level: 10,
        baseStats: { hp: 80, atk: 70, def: 60, spa: 40, spd: 50, spe: 100 },
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        types: [normalType],
        moveLoadout: [firstMove, secondMove],
      },
      {
        pokemonInstanceId: id<PokemonInstanceId>("pokemon:two"),
        speciesId: id("species:two"),
        level: 20,
        baseStats: { hp: 100, atk: 60, def: 60, spa: 40, spd: 50, spe: 50 },
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        types: [normalType],
        moveLoadout: [enemyMove],
      },
    ]);

    expect(result.accepted).toBe(true);
    if (!result.accepted) return;

    const one = cadenceParticipantKey({
      kind: "pokemonInstance",
      identity: id<PokemonInstanceId>("pokemon:one"),
    });
    const two = cadenceParticipantKey({
      kind: "pokemonInstance",
      identity: id<PokemonInstanceId>("pokemon:two"),
    });
    expect(result.cadence.effects).toEqual([]);
    expect(result.cadence.hpByParticipant).toEqual({ [one]: 36, [two]: 70 });
    expect(result.cadence.maxHpByParticipant).toEqual({ [one]: 36, [two]: 70 });
    expect(result.cadence.actionLockRemainingMsByParticipant).toEqual({ [one]: 0, [two]: 0 });
    expect(result.cadence.readinessByParticipant[one]).toEqual({
      participant: { kind: "pokemonInstance", identity: id<PokemonInstanceId>("pokemon:one") },
      moveLoadout: [firstMove, secondMove],
      nextActionRemainingMs: 0,
      moveCooldownRemainingMs: { first: 0, second: 0 },
    });
    expect(result.cadence.readinessByParticipant[two]).toEqual({
      participant: { kind: "pokemonInstance", identity: id<PokemonInstanceId>("pokemon:two") },
      moveLoadout: [enemyMove],
      nextActionRemainingMs: 0,
      moveCooldownRemainingMs: { enemy: 0 },
    });
    expect(result.policy.nextMoveSlotByParticipant).toEqual({ [one]: 1, [two]: 1 });
  });

  it("fails closed on duplicate Team cadence identities instead of merging fresh-Hunt state", () => {
    const member = {
      pokemonInstanceId: id<PokemonInstanceId>("pokemon:duplicate"),
      speciesId: id<SpeciesId>("species:one"),
      level: 10,
      baseStats: { hp: 80, atk: 70, def: 60, spa: 40, spd: 50, spe: 100 },
      ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      types: [normalType],
      moveLoadout: [firstMove],
    };
    const result = createFreshSoloHuntCadence([member, member]);

    expect(result).toMatchObject({
      accepted: false,
      reason: expect.stringContaining("duplicate"),
    });
  });

  it("TASK-108 starts forward Hunts from exact persisted HP while preserving Team-order living selection", () => {
    const lead = {
      pokemonInstanceId: id<PokemonInstanceId>("pokemon:lead-ko"),
      speciesId: id<SpeciesId>("species:lead"),
      level: 10,
      baseStats: { hp: 80, atk: 70, def: 60, spa: 40, spd: 50, spe: 100 },
      ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      types: [normalType],
      moveLoadout: [firstMove],
    };
    const reserve = {
      ...lead,
      pokemonInstanceId: id<PokemonInstanceId>("pokemon:reserve-damaged"),
      speciesId: id<SpeciesId>("species:reserve"),
    };
    const leadKey = cadenceParticipantKey({ kind: "pokemonInstance", identity: lead.pokemonInstanceId });
    const reserveKey = cadenceParticipantKey({ kind: "pokemonInstance", identity: reserve.pokemonInstanceId });

    const result = createFreshSoloHuntCadence(
      [lead, reserve],
      undefined,
      {
        [lead.pokemonInstanceId]: 0,
        [reserve.pokemonInstanceId]: 17,
      },
    );

    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.cadence.hpByParticipant).toEqual({ [leadKey]: 0, [reserveKey]: 17 });
    expect(result.cadence.maxHpByParticipant).toEqual({ [leadKey]: 36, [reserveKey]: 36 });

    const allKo = createFreshSoloHuntCadence(
      [lead, reserve],
      undefined,
      {
        [lead.pokemonInstanceId]: 0,
        [reserve.pokemonInstanceId]: 0,
      },
    );
    expect(allKo).toMatchObject({
      accepted: false,
      reason: expect.stringContaining("living"),
    });
  });
});

describe("TASK-035 deterministic encounter selection", () => {
  const encounters = [
    {
      encounterDefinitionId: id<EncounterDefinitionId>("encounter:first"),
      speciesId: id<SpeciesId>("species:first"),
      weight: 3,
      levelBand: { min: 3, max: 5 },
      rewardEnvelope: { key: "reward:first" },
    },
    {
      encounterDefinitionId: id<EncounterDefinitionId>("encounter:second"),
      speciesId: id<SpeciesId>("species:second"),
      weight: 1,
      levelBand: { min: 7, max: 7 },
      rewardEnvelope: { key: "reward:second" },
    },
  ] as const;

  it("replays weighted definition + level selection from its own RNG stream without touching combat RNG", () => {
    const policyRng = createRngState(12345);
    const combatState = { rng: createRngState(98765) };

    const first = selectSoloHuntEncounter(encounters, policyRng);
    const replay = selectSoloHuntEncounter(encounters, policyRng);

    expect(first).toEqual(replay);
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    expect(first.rng).not.toEqual(policyRng);
    expect(first.selection.level).toBeGreaterThanOrEqual(first.selection.levelBand.min);
    expect(first.selection.level).toBeLessThanOrEqual(first.selection.levelBand.max);
    expect(combatState).toEqual({ rng: createRngState(98765) });
  });

  it("fails closed atomically for invalid weights, duplicate ids, or invalid level bands", () => {
    const rng = createRngState(7);
    const invalidSets = [
      [{ ...encounters[0], weight: 0 }],
      [encounters[0], { ...encounters[0] }],
      [{ ...encounters[0], levelBand: { min: 5, max: 3 } }],
      [{ ...encounters[0], levelBand: { min: 1, max: 201 } }],
      [
        { ...encounters[0], weight: 0xffffffff },
        { ...encounters[1], weight: 1 },
      ],
    ] as const;

    for (const invalid of invalidSets) {
      const result = selectSoloHuntEncounter(invalid, rng);
      expect(result.accepted).toBe(false);
      if (result.accepted) continue;
      expect(result.rng).toBe(rng);
    }
  });
});

describe("TASK-035 caller-resolved opponent catalog", () => {
  const options = [
    {
      encounterDefinitionId: id<EncounterDefinitionId>("encounter:first"),
      speciesId: id<SpeciesId>("species:first"),
      weight: 3,
      levelBand: { min: 3, max: 4 },
      rewardEnvelope: { key: "reward:first" },
    },
    {
      encounterDefinitionId: id<EncounterDefinitionId>("encounter:second"),
      speciesId: id<SpeciesId>("species:second"),
      weight: 1,
      levelBand: { min: 7, max: 7 },
      rewardEnvelope: { key: "reward:second" },
    },
  ] as const;

  const template = (
    encounterDefinitionId: EncounterDefinitionId,
    speciesId: SpeciesId,
    level: number,
  ) => ({
    encounterDefinitionId,
    speciesId,
    level,
    gameDataVersion: context.gameDataVersion,
    rulesVersion: context.rulesVersion,
    baseStats: { hp: 80, atk: 60, def: 60, spa: 40, spd: 50, spe: 10 },
    ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    types: [normalType],
    moveLoadout: [enemyMove],
  });

  const catalog = [
    template(options[0].encounterDefinitionId, options[0].speciesId, 3),
    template(options[0].encounterDefinitionId, options[0].speciesId, 4),
    template(options[1].encounterDefinitionId, options[1].speciesId, 7),
  ];

  it("accepts exact template coverage for every selectable definition+level", () => {
    expect(validateSoloHuntOpponentCatalog(options, catalog, context)).toEqual({ accepted: true });
  });

  it("fails closed for missing, duplicate, extra, context-mismatched, or Battle-invalid templates", () => {
    const invalidCatalogs = [
      catalog.slice(0, -1),
      [...catalog, catalog[0]],
      [
        ...catalog,
        template(
          id<EncounterDefinitionId>("encounter:extra"),
          id<SpeciesId>("species:extra"),
          5,
        ),
      ],
      catalog.map((entry, index) => index === 0
        ? { ...entry, rulesVersion: id<RulesVersion>("other-rules") }
        : entry),
      catalog.map((entry, index) => index === 0
        ? { ...entry, moveLoadout: [id<MoveId>("unresolved")] }
        : entry),
    ];

    for (const invalid of invalidCatalogs) {
      expect(validateSoloHuntOpponentCatalog(options, invalid, context)).toMatchObject({
        accepted: false,
      });
    }
  });
});

describe("TASK-035 Encounter Battle construction", () => {
  const team = [
    {
      pokemonInstanceId: id<PokemonInstanceId>("pokemon:lead"),
      speciesId: id<SpeciesId>("species:lead"),
      level: 10,
      baseStats: { hp: 80, atk: 70, def: 60, spa: 40, spd: 50, spe: 100 },
      ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      types: [normalType],
      moveLoadout: [firstMove, secondMove],
    },
    {
      pokemonInstanceId: id<PokemonInstanceId>("pokemon:reserve"),
      speciesId: id<SpeciesId>("species:reserve"),
      level: 10,
      baseStats: { hp: 80, atk: 60, def: 60, spa: 40, spd: 50, spe: 50 },
      ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      types: [normalType],
      moveLoadout: [firstMove],
    },
  ] as const;
  const encounterDefinitionId = id<EncounterDefinitionId>("encounter:wild"),
    opponentSpeciesId = id<SpeciesId>("species:wild");
  const selection = {
    encounterDefinitionId,
    speciesId: opponentSpeciesId,
    weight: 1,
    levelBand: { min: 5, max: 5 },
    rewardEnvelope: { pokemonXpPool: 10 },
    level: 5,
  } as const;
  const opponentTemplates = [{
    encounterDefinitionId,
    speciesId: opponentSpeciesId,
    level: 5,
    gameDataVersion: context.gameDataVersion,
    rulesVersion: context.rulesVersion,
    baseStats: { hp: 80, atk: 60, def: 60, spa: 40, spd: 50, spe: 10 },
    ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    types: [normalType],
    moveLoadout: [enemyMove],
  }] as const;

  it("rebinds stable player cadence into a new Battle and gives the encounter opponent fresh cadence state", () => {
    const fresh = createFreshSoloHuntCadence(team);
    expect(fresh.accepted).toBe(true);
    if (!fresh.accepted) return;

    const initialized = initializeSoloHuntEncounterBattle({
      huntRunIdentity: "hunt-run:one",
      encounterOrdinal: 1,
      team,
      cadence: fresh.cadence,
      policy: fresh.policy,
      selection,
      opponentTemplates,
      context,
      deterministicState: { rng: createRngState(99) },
    });

    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    expect(initialized.state.status).toBe("active");
    expect(initialized.state.sides[0].activeCombatantIds).toHaveLength(1);
    const activePlayer = initialized.state.combatants[initialized.state.sides[0].activeCombatantIds[0]];
    expect(activePlayer.cadenceParticipant).toEqual({
      kind: "pokemonInstance",
      identity: team[0].pokemonInstanceId,
    });
    expect(activePlayer.currentHp).toBe(activePlayer.maxHp);

    const opponentId = initialized.state.sides[1].activeCombatantIds[0];
    const opponent = initialized.state.combatants[opponentId];
    expect(opponent.cadenceParticipant).toMatchObject({ kind: "nonPlayer" });
    expect(opponent.currentHp).toBe(opponent.maxHp);
    expect(opponent.nextActionAtMs).toBe(0);
    expect(opponent.moveReadyAtMs).toEqual({ enemy: 0 });
    expect(
      initialized.policy.nextMoveSlotByParticipant[cadenceParticipantKey(opponent.cadenceParticipant!)],
    ).toBe(1);
  });

  it("starts with the first living pinned Team member when an earlier reserve is already KO in cadence", () => {
    const fresh = createFreshSoloHuntCadence(team);
    expect(fresh.accepted).toBe(true);
    if (!fresh.accepted) return;
    const leadKey = cadenceParticipantKey({ kind: "pokemonInstance", identity: team[0].pokemonInstanceId });
    const koCadence = {
      ...fresh.cadence,
      hpByParticipant: { ...fresh.cadence.hpByParticipant, [leadKey]: 0 },
    };

    const initialized = initializeSoloHuntEncounterBattle({
      huntRunIdentity: "hunt-run:two",
      encounterOrdinal: 2,
      team,
      cadence: koCadence,
      policy: fresh.policy,
      selection,
      opponentTemplates,
      context,
      deterministicState: { rng: createRngState(99) },
    });

    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const activePlayer = initialized.state.combatants[initialized.state.sides[0].activeCombatantIds[0]];
    expect(activePlayer.cadenceParticipant).toEqual({
      kind: "pokemonInstance",
      identity: team[1].pokemonInstanceId,
    });
  });

  it("fails closed before Battle creation when no player is living or selected template is absent", () => {
    const fresh = createFreshSoloHuntCadence(team);
    expect(fresh.accepted).toBe(true);
    if (!fresh.accepted) return;
    const zeroHp = Object.fromEntries(Object.keys(fresh.cadence.hpByParticipant).map((key) => [key, 0]));
    const noLiving = initializeSoloHuntEncounterBattle({
      huntRunIdentity: "hunt-run:three",
      encounterOrdinal: 1,
      team,
      cadence: { ...fresh.cadence, hpByParticipant: zeroHp as never },
      policy: fresh.policy,
      selection,
      opponentTemplates,
      context,
      deterministicState: { rng: createRngState(99) },
    });
    expect(noLiving).toMatchObject({ accepted: false, reason: expect.stringContaining("living") });

    const missingTemplate = initializeSoloHuntEncounterBattle({
      huntRunIdentity: "hunt-run:three",
      encounterOrdinal: 1,
      team,
      cadence: fresh.cadence,
      policy: fresh.policy,
      selection: { ...selection, level: 6 },
      opponentTemplates,
      context,
      deterministicState: { rng: createRngState(99) },
    });
    expect(missingTemplate).toMatchObject({ accepted: false, reason: expect.stringContaining("template") });
  });
});

describe("TASK-035 forced replacement orchestration", () => {
  it("selects the first living pinned reserve in Team order at zero combat time", () => {
    const team = [
      {
        pokemonInstanceId: id<PokemonInstanceId>("pokemon:lead"),
        speciesId: id<SpeciesId>("species:lead"),
        level: 10,
        baseStats: { hp: 80, atk: 70, def: 60, spa: 40, spd: 50, spe: 100 },
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        types: [normalType],
        moveLoadout: [firstMove],
      },
      {
        pokemonInstanceId: id<PokemonInstanceId>("pokemon:reserve"),
        speciesId: id<SpeciesId>("species:reserve"),
        level: 10,
        baseStats: { hp: 80, atk: 60, def: 60, spa: 40, spd: 50, spe: 50 },
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        types: [normalType],
        moveLoadout: [firstMove],
      },
    ] as const;
    const fresh = createFreshSoloHuntCadence(team);
    expect(fresh.accepted).toBe(true);
    if (!fresh.accepted) return;
    const leadKey = cadenceParticipantKey({ kind: "pokemonInstance", identity: team[0].pokemonInstanceId });
    const weakenedCadence = {
      ...fresh.cadence,
      hpByParticipant: { ...fresh.cadence.hpByParticipant, [leadKey]: 1 },
      readinessByParticipant: {
        ...fresh.cadence.readinessByParticipant,
        [leadKey]: {
          ...fresh.cadence.readinessByParticipant[leadKey],
          nextActionRemainingMs: 5000,
        },
      },
    };
    const encounterDefinitionId = id<EncounterDefinitionId>("encounter:replacement"),
      opponentSpeciesId = id<SpeciesId>("species:wild");
    const initialized = initializeSoloHuntEncounterBattle({
      huntRunIdentity: "hunt-run:replacement",
      encounterOrdinal: 1,
      team,
      cadence: weakenedCadence,
      policy: fresh.policy,
      selection: {
        encounterDefinitionId,
        speciesId: opponentSpeciesId,
        weight: 1,
        levelBand: { min: 10, max: 10 },
        rewardEnvelope: {},
        level: 10,
      },
      opponentTemplates: [{
        encounterDefinitionId,
        speciesId: opponentSpeciesId,
        level: 10,
        gameDataVersion: context.gameDataVersion,
        rulesVersion: context.rulesVersion,
        baseStats: { hp: 80, atk: 100, def: 60, spa: 40, spd: 50, spe: 120 },
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        types: [normalType],
        moveLoadout: [enemyMove],
      }],
      context,
      deterministicState: { rng: createRngState(1) },
    });
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;
    const playerSide = initialized.state.sides.find((side) => side.sideId === initialized.playerSideId)!;
    const opponentSide = initialized.state.sides.find((side) => side.sideId === initialized.opponentSideId)!;
    const activeLeadId = playerSide.activeCombatantIds[0];
    const opponentId = opponentSide.activeCombatantIds[0];
    const ko = resolveCombatStimulus(
      initialized.state,
      { kind: "useMove", actorId: opponentId, moveId: enemyMove, targetId: activeLeadId },
      initialized.deterministicState,
    );
    expect(ko.accepted).toBe(true);
    if (!ko.accepted) return;
    expect(ko.state.replacementPendingSideIds).toEqual([initialized.playerSideId]);

    const replacement = resolveSoloHuntForcedReplacement(
      ko.state,
      ko.deterministicState,
      team,
      initialized.playerSideId,
    );
    expect(replacement.accepted).toBe(true);
    if (!replacement.accepted) return;
    expect(replacement.state.combatTimeMs).toBe(ko.state.combatTimeMs);
    expect(replacement.events).toEqual([
      expect.objectContaining({ kind: "CombatantActivated", sideId: initialized.playerSideId }),
    ]);
    const active = replacement.state.combatants[
      replacement.state.sides.find((side) => side.sideId === initialized.playerSideId)!.activeCombatantIds[0]
    ];
    expect(active.cadenceParticipant).toEqual({
      kind: "pokemonInstance",
      identity: team[1].pokemonInstanceId,
    });
  });
});

describe("TASK-035 inter-Battle cadence pruning", () => {
  it("removes ended opponent carry/cursor and opponent-targeted effects while retaining every pinned player and player-targeted effects", () => {
    const team = [
      {
        pokemonInstanceId: id<PokemonInstanceId>("pokemon:lead"),
        speciesId: id<SpeciesId>("species:lead"),
        level: 10,
        baseStats: { hp: 80, atk: 70, def: 60, spa: 40, spd: 50, spe: 100 },
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        types: [normalType],
        moveLoadout: [firstMove],
      },
      {
        pokemonInstanceId: id<PokemonInstanceId>("pokemon:reserve"),
        speciesId: id<SpeciesId>("species:reserve"),
        level: 10,
        baseStats: { hp: 80, atk: 60, def: 60, spa: 40, spd: 50, spe: 50 },
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        types: [normalType],
        moveLoadout: [firstMove],
      },
    ] as const;
    const fresh = createFreshSoloHuntCadence(team);
    expect(fresh.accepted).toBe(true);
    if (!fresh.accepted) return;
    const encounterDefinitionId = id<EncounterDefinitionId>("encounter:prune"),
      opponentSpeciesId = id<SpeciesId>("species:wild");
    const initialized = initializeSoloHuntEncounterBattle({
      huntRunIdentity: "hunt-run:prune",
      encounterOrdinal: 1,
      team,
      cadence: fresh.cadence,
      policy: fresh.policy,
      selection: {
        encounterDefinitionId,
        speciesId: opponentSpeciesId,
        weight: 1,
        levelBand: { min: 5, max: 5 },
        rewardEnvelope: {},
        level: 5,
      },
      opponentTemplates: [{
        encounterDefinitionId,
        speciesId: opponentSpeciesId,
        level: 5,
        gameDataVersion: context.gameDataVersion,
        rulesVersion: context.rulesVersion,
        baseStats: { hp: 80, atk: 60, def: 60, spa: 40, spd: 50, spe: 10 },
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        types: [normalType],
        moveLoadout: [enemyMove],
      }],
      context,
      deterministicState: { rng: createRngState(1) },
    });
    expect(initialized.accepted).toBe(true);
    if (!initialized.accepted) return;

    const playerId = initialized.state.sides[0].activeCombatantIds[0];
    const opponentId = initialized.state.sides[1].activeCombatantIds[0];
    const playerCadence = initialized.state.combatants[playerId].cadenceParticipant!;
    const opponentCadence = initialized.state.combatants[opponentId].cadenceParticipant!;
    const playerEffectId = id<EffectId>("effect:player-target"),
      opponentEffectId = id<EffectId>("effect:opponent-target");
    const ended = {
      ...initialized.state,
      status: "ended" as const,
      combatants: {
        ...initialized.state.combatants,
        [playerId]: { ...initialized.state.combatants[playerId], currentHp: 0 },
        [opponentId]: { ...initialized.state.combatants[opponentId], currentHp: 0 },
      },
      effects: {
        player: {
          effectId: playerEffectId,
          targetCombatantId: playerId,
          targetCadenceParticipant: playerCadence,
          lifetimeScope: "cadence" as const,
          stackingPolicy: "replace" as const,
          applicationSequence: 1,
          scheduleRevision: 1,
          appliedAtMs: 0,
          expiresAtMs: 5000,
          stacks: 1,
        },
        opponent: {
          effectId: opponentEffectId,
          targetCombatantId: opponentId,
          targetCadenceParticipant: opponentCadence,
          lifetimeScope: "cadence" as const,
          stackingPolicy: "replace" as const,
          applicationSequence: 2,
          scheduleRevision: 1,
          appliedAtMs: 0,
          expiresAtMs: 5000,
          stacks: 1,
        },
      },
    };

    const pruned = pruneSoloHuntEndedOpponentCadence(ended, initialized.policy, team);
    expect(pruned.accepted).toBe(true);
    if (!pruned.accepted) return;
    const playerKeys = team.map((member) => cadenceParticipantKey({
      kind: "pokemonInstance",
      identity: member.pokemonInstanceId,
    }));
    for (const record of [
      pruned.cadence.hpByParticipant,
      pruned.cadence.maxHpByParticipant,
      pruned.cadence.readinessByParticipant,
      pruned.cadence.actionLockRemainingMsByParticipant,
      pruned.policy.nextMoveSlotByParticipant,
    ]) {
      expect(Object.keys(record).sort()).toEqual([...playerKeys].sort());
    }
    expect(pruned.cadence.hpByParticipant[playerKeys[0]]).toBe(0);
    expect(pruned.cadence.effects).toEqual([
      expect.objectContaining({ effectId: playerEffectId, targetCadenceParticipant: playerCadence }),
    ]);
  });

  it("stops at the exact cadence-effect KO boundary instead of consuming the rest of the inter-Battle gap", () => {
    const member = {
      pokemonInstanceId: id<PokemonInstanceId>("pokemon:solo"),
      speciesId: id<SpeciesId>("species:solo"),
      level: 10,
      baseStats: { hp: 80, atk: 70, def: 60, spa: 40, spd: 50, spe: 100 },
      ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      types: [normalType],
      moveLoadout: [firstMove],
    } as const;
    const fresh = createFreshSoloHuntCadence([member]);
    expect(fresh.accepted).toBe(true);
    if (!fresh.accepted) return;
    const key = cadenceParticipantKey({ kind: "pokemonInstance", identity: member.pokemonInstanceId });
    const poison = id<EffectId>("effect:poison");
    const cadence = {
      ...fresh.cadence,
      hpByParticipant: { ...fresh.cadence.hpByParticipant, [key]: 5 },
      readinessByParticipant: {
        ...fresh.cadence.readinessByParticipant,
        [key]: {
          ...fresh.cadence.readinessByParticipant[key],
          nextActionRemainingMs: 5000,
          moveCooldownRemainingMs: { first: 5000 },
        },
      },
      effects: [{
        effectId: poison,
        targetCadenceParticipant: { kind: "pokemonInstance" as const, identity: member.pokemonInstanceId },
        lifetimeScope: "cadence" as const,
        stackingPolicy: "replace" as const,
        applicationSequence: 1,
        scheduleRevision: 1,
        remainingDurationMs: 5000,
        remainingToNextTickMs: 1000,
        stacks: 1,
      }],
    };
    const effectContext: ResolvedCombatContext = {
      ...context,
      effectRules: {
        [poison]: {
          effectId: poison,
          lifetimeScope: "cadence",
          stackingPolicy: "replace",
          durationMs: 5000,
          periodic: { kind: "damage", intervalMs: 1000, magnitude: { kind: "integer", amount: 10 } },
        },
      },
    };

    const advanced = advanceSoloHuntInterBattleCadence(
      cadence,
      effectContext,
      { rng: createRngState(5) },
      5000,
    );

    expect(advanced.accepted).toBe(true);
    if (!advanced.accepted) return;
    expect(advanced.elapsedMs).toBe(1000);
    expect(advanced.noLivingPlayer).toBe(true);
    expect(advanced.cadence.hpByParticipant[key]).toBe(0);
    expect(advanced.cadence.readinessByParticipant[key].nextActionRemainingMs).toBe(4000);
    expect(advanced.cadence.readinessByParticipant[key].moveCooldownRemainingMs.first).toBe(4000);
    expect(advanced.consequences).toContainEqual(
      expect.objectContaining({ atOffsetMs: 1000, consequence: expect.objectContaining({ kind: "ko" }) }),
    );
  });
});

describe("TASK-035 integrated Solo Hunt runtime", () => {
  const playerId = id<PlayerId>("player:runtime"),
    zoneId = id<ZoneId>("zone:runtime"),
    huntDefinitionId = id<HuntDefinitionId>("hunt:runtime"),
    encounterDefinitionId = id<EncounterDefinitionId>("encounter:runtime"),
    opponentSpeciesId = id<SpeciesId>("species:runtime-opponent");
  const runtimeContext: ResolvedCombatContext = {
    ...context,
    moveRules: {
      ...context.moveRules,
      first: { ...context.moveRules.first, power: 1000 },
      enemy: { ...context.moveRules.enemy, power: 1 },
    },
  };
  const runtimeTeam = [{
    pokemonInstanceId: id<PokemonInstanceId>("pokemon:runtime"),
    speciesId: id<SpeciesId>("species:runtime-player"),
    level: 10,
    baseStats: { hp: 80, atk: 100, def: 100, spa: 40, spd: 50, spe: 100 },
    ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    types: [normalType],
    moveLoadout: [firstMove],
  }] as const;

  function runtimeInputs(contextOverride: ResolvedCombatContext = runtimeContext) {
    return {
      playerId,
      zoneId,
      huntDefinitionId,
      contentVersion: "pve-content:test",
      contentHash: "sha256:test-runtime",
      context: contextOverride,
      team: runtimeTeam,
      encounterOptions: [{
        encounterDefinitionId,
        speciesId: opponentSpeciesId,
        weight: 1,
        levelBand: { min: 5, max: 5 },
        rewardEnvelope: { pokemonXpPool: 25, playerXp: 5 },
      }],
      opponentTemplates: [{
        encounterDefinitionId,
        speciesId: opponentSpeciesId,
        level: 5,
        gameDataVersion: contextOverride.gameDataVersion,
        rulesVersion: contextOverride.rulesVersion,
        baseStats: { hp: 10, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 },
        ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        types: [normalType],
        moveLoadout: [enemyMove],
      }],
      interBattleGapMs: 0,
    } as const;
  }

  function geneticRuntimeInputs(
    rulesVersion: RulesVersion = GENETIC_COMBAT_RULES_VERSION_V1,
  ) {
    const geneticContext: ResolvedCombatContext = {
      ...runtimeContext,
      rulesVersion,
    };
    const secretKey = new Uint8Array(32).fill(41);
    return {
      ...runtimeInputs(geneticContext),
      team: runtimeTeam.map((member) => ({
        ...member,
        geneticBonuses: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      })),
      opponentTemplates: runtimeInputs(geneticContext).opponentTemplates.map((template) => ({
        ...template,
        compatibleProfiles: ["Might", "Clarity"] as const,
      })),
      individualizationAuthority: {
        rulesVersion: ENCOUNTER_INDIVIDUALIZATION_RULES_VERSION_V1,
        authorityVersion: "test-authority-v1",
        keyId: deriveEncounterIndividualizationAuthorityKeyIdV1(secretKey),
        secretKey,
      },
    };
  }

  it("replays identically, carries GCD across Encounters, and never generates a Move exactly at cutoff L", () => {
    const inputs = runtimeInputs();
    const make = () => createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:runtime-replay",
      inputs,
      policyRng: createRngState(123),
      combatDeterministicState: { rng: createRngState(999) },
    });
    const first = make();
    const replay = make();
    expect(first).toEqual(replay);
    expect(first.accepted).toBe(true);
    if (!first.accepted || !replay.accepted) return;
    expect(first.state.combatDeterministicState.rng).toEqual(createRngState(999));

    const advanced = advanceSoloHuntToCutoff(first.state, inputs, 2000);
    const replayAdvanced = advanceSoloHuntToCutoff(replay.state, inputs, 2000);
    expect(advanced).toEqual(replayAdvanced);
    expect(advanced.accepted).toBe(true);
    if (!advanced.accepted) return;
    expect(advanced.state.status).toBe("active");
    expect(advanced.stopReason).toBe("cutoff");
    expect(advanced.state.logicalTimeMs).toBe(2000);
    expect(advanced.state.completedEncounters).toHaveLength(1);
    expect(advanced.state.completedEncounters[0]).toMatchObject({
      completionKind: "defeat",
      encounterDefinitionId,
      speciesId: opponentSpeciesId,
      participantPokemonInstanceIds: [runtimeTeam[0].pokemonInstanceId],
      rewardEnvelope: { pokemonXpPool: 25, playerXp: 5 },
    });
    expect(advanced.state.pendingEncounterSelection).toBeDefined();
    expect(advanced.state.pendingCaptureDecision?.encounterId).toBe(
      advanced.state.completedEncounters[0].encounterId,
    );
    expect(advanced.events.some((event) =>
      event.kind === "combat"
      && event.huntTimeMs === 2000
      && event.event.kind === "MoveUsed"
      && event.event.actorId === advanced.state.currentEncounter?.battle.sides[0].activeCombatantIds[0],
    )).toBe(false);
  });

  it("can stop exactly after one successful Encounter before later productive history", () => {
    const inputs = runtimeInputs();
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:encounter-boundary",
      inputs,
      policyRng: createRngState(123),
      combatDeterministicState: { rng: createRngState(999) },
    });
    expect(created.accepted, created.accepted ? undefined : created.reason).toBe(true);
    if (!created.accepted) return;

    const initialState = structuredClone(created.state);
    const bounded = advanceSoloHuntToEncounterBoundaryOrCutoff(created.state, inputs, 10_000);
    expect(bounded.accepted).toBe(true);
    if (!bounded.accepted) return;
    expect(bounded.stopReason).toBe("encounterBoundary");
    expect(bounded.state.completedEncounters).toHaveLength(1);
    expect(bounded.state.currentEncounter).toBeUndefined();
    expect(bounded.state.interBattle).toBeDefined();
    expect(bounded.state.interBattle?.activePokemonInstanceId).toBeUndefined();
    expect(bounded.state.logicalTimeMs).toBeLessThan(10_000);
    const historicalRoundTrip = decodeSoloHuntCheckpointV2(encodeSoloHuntCheckpointV2(bounded.state));
    expect(historicalRoundTrip.accepted).toBe(true);
    if (!historicalRoundTrip.accepted) return;
    expect(historicalRoundTrip.state.interBattle?.activePokemonInstanceId).toBeUndefined();
    expect(historicalRoundTrip.state.logicalTimeMs).toBe(bounded.state.logicalTimeMs);
    expect(historicalRoundTrip.state.completedEncounters).toEqual(bounded.state.completedEncounters);

    const boundaryState = structuredClone(bounded.state);
    const resumed = advanceSoloHuntToCutoff(bounded.state, inputs, 10_000);
    const direct = advanceSoloHuntToCutoff(created.state, inputs, 10_000);
    expect(resumed.accepted).toBe(true);
    expect(direct.accepted).toBe(true);
    if (!resumed.accepted || !direct.accepted) return;
    expect(resumed.state).toEqual(direct.state);
    expect(resumed.stopReason).toBe(direct.stopReason);
    expect([...bounded.events, ...resumed.events]).toEqual(direct.events);
    expect(created.state).toEqual(initialState);
    expect(bounded.state).toEqual(boundaryState);
  });

  it("persists the real pre-reaction Battle source under strict v4 across bounded same-Battle yields", () => {
    const base = geneticRuntimeInputs();
    const inputs = {
      ...base,
      context: {
        ...base.context,
        moveRules: {
          ...base.context.moveRules,
          first: { ...base.context.moveRules.first, power: 10 },
        },
      },
      opponentTemplates: base.opponentTemplates.map((template) => ({
        ...template,
        baseStats: { ...template.baseStats, hp: 120 },
      })),
      team: base.team.map((member) => ({ ...member, shiny: true })),
      automationPolicies: {
        capture: { policyVersion: null, rowVersion: "0", enabled: false },
        potion: NO_SAVED_AUTO_POTION_POLICY,
        revive: NO_SAVED_AUTO_REVIVE_POLICY,
      },
    };
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:versioned-source-yield",
      inputs,
      policyRng: createRngState(123),
      combatDeterministicState: { rng: createRngState(999) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;
    const initialOrigin = created.state.currentEncounter?.battleOrigin;
    expect(initialOrigin?.participants.find((participant) => participant.kind === "owned")).toMatchObject({
      shiny: true,
      pokemonInstanceId: inputs.team[0]!.pokemonInstanceId,
    });
    expect(initialOrigin?.initialEvents[0]).toMatchObject({
      kind: "BattleStarted", sequence: 1, combatTimeMs: 0,
    });
    const initialBytes = encodeSoloHuntCheckpointV4(created.state);
    const initialDecoded = decodeSoloHuntCheckpointV4(initialBytes);
    expect(initialDecoded).toEqual({ accepted: true, state: {
      ...created.state, appliedHealingEvents: [],
    } });
    if (!initialDecoded.accepted) return;

    const cutoff = 4000;
    const direct = advanceSoloHuntToEncounterBoundaryOrCutoff(initialDecoded.state, inputs, cutoff);
    expect(direct.accepted).toBe(true);
    if (!direct.accepted) return;
    let current = initialDecoded.state;
    const emitted: typeof direct.events[number][] = [];
    let yielded = 0;
    for (let count = 0; count < 40; count += 1) {
      const step = advanceSoloHuntToEncounterBoundaryOrCutoff(current, inputs, cutoff, 3);
      expect(step.accepted, step.accepted ? undefined : step.reason).toBe(true);
      if (!step.accepted) return;
      expect(step.events.filter((candidate) => candidate.kind === "combat").length).toBeLessThanOrEqual(3);
      emitted.push(...step.events);
      const restored = decodeSoloHuntCheckpointV4(encodeSoloHuntCheckpointV4(step.state));
      expect(restored.accepted).toBe(true);
      if (!restored.accepted) return;
      current = restored.state;
      if (step.stopReason !== "projectionBudget") break;
      yielded += 1;
    }
    expect(yielded).toBeGreaterThan(0);
    expect(current).toEqual(direct.state);
    expect(emitted).toEqual(direct.events);
  });

  it.each([1, 2] as const)(
    "counts the later Battle bootstrap before applying a multi-event stimulus with budget %s",
    (budget) => {
      const inputs = runtimeInputs();
      const created = createSoloHuntRuntime({
        huntRunIdentity: "hunt-run:next-battle-budget",
        inputs,
        policyRng: createRngState(123),
        combatDeterministicState: { rng: createRngState(999) },
      });
      expect(created.accepted).toBe(true);
      if (!created.accepted) return;
      const completed = advanceSoloHuntToEncounterBoundaryOrCutoff(created.state, inputs, 10_000);
      expect(completed.accepted).toBe(true);
      if (!completed.accepted) return;
      expect(completed.stopReason).toBe("encounterBoundary");
      expect(completed.state.interBattle?.remainingGapMs).toBe(0);
      const cutoff = completed.state.logicalTimeMs + 10_000;
      const first = advanceSoloHuntToEncounterBoundaryOrCutoff(completed.state, inputs, cutoff, budget);
      expect(first.accepted).toBe(true);
      if (!first.accepted) return;
      expect(first.stopReason).toBe("projectionBudget");
      expect(first.events.filter((entry) => entry.kind === "combat")).toHaveLength(1);
      expect(first.events[0]).toMatchObject({ kind: "combat", event: { kind: "BattleStarted" } });
      const resumed = advanceSoloHuntToEncounterBoundaryOrCutoff(first.state, inputs, cutoff, 128);
      const direct = advanceSoloHuntToEncounterBoundaryOrCutoff(completed.state, inputs, cutoff);
      expect(resumed.accepted).toBe(true);
      expect(direct.accepted).toBe(true);
      if (!resumed.accepted || !direct.accepted) return;
      expect(resumed.state).toEqual(direct.state);
      expect([...first.events, ...resumed.events]).toEqual(direct.events);
    },
  );

  it("does not split the next Battle bootstrap when the byte ceiling is smaller than the indivisible group", () => {
    const inputs = runtimeInputs();
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:next-battle-source-byte-budget",
      inputs,
      policyRng: createRngState(123),
      combatDeterministicState: { rng: createRngState(999) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;
    const completed = advanceSoloHuntToEncounterBoundaryOrCutoff(created.state, inputs, 10_000);
    expect(completed.accepted).toBe(true);
    if (!completed.accepted) return;
    expect(completed.stopReason).toBe("encounterBoundary");
    const cutoff = completed.state.logicalTimeMs + 10_000;
    const before = structuredClone(completed.state);
    const bounded = advanceSoloHuntToEncounterBoundaryOrCutoff(
      completed.state, inputs, cutoff, 128, 1,
    );
    expect(bounded.accepted).toBe(true);
    if (!bounded.accepted) return;
    expect(bounded.stopReason).toBe("projectionBudget");
    expect(bounded.events[0]).toMatchObject({
      kind: "combat", event: { kind: "BattleStarted" },
    });
    expect(bounded.events.filter((entry) => entry.kind === "combat")).toHaveLength(1);
    expect(completed.state).toEqual(before);
    const remainder = advanceSoloHuntToEncounterBoundaryOrCutoff(bounded.state, inputs, cutoff);
    const direct = advanceSoloHuntToEncounterBoundaryOrCutoff(completed.state, inputs, cutoff);
    expect(remainder.accepted).toBe(true);
    expect(direct.accepted).toBe(true);
    if (!remainder.accepted || !direct.accepted) return;
    expect(remainder.state).toEqual(direct.state);
    expect([...bounded.events, ...remainder.events]).toEqual(direct.events);
  });

  it("defers a two-event Move after 126 events instead of exceeding a 127-event limit", () => {
    const base = runtimeInputs({
      ...runtimeContext,
      typeChart: { normal: { normal: 0 } },
    });
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:127-plus-2",
      inputs: base,
      policyRng: createRngState(123),
      combatDeterministicState: { rng: createRngState(999) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;
    const cutoff = 100_000;
    const first = advanceSoloHuntToEncounterBoundaryOrCutoff(created.state, base, cutoff, 127);
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    expect(first.stopReason).toBe("projectionBudget");
    expect(first.events.filter((entry) => entry.kind === "combat")).toHaveLength(126);
    const second = advanceSoloHuntToEncounterBoundaryOrCutoff(first.state, base, cutoff, 127);
    const direct = advanceSoloHuntToEncounterBoundaryOrCutoff(created.state, base, cutoff);
    expect(second.accepted).toBe(true);
    expect(direct.accepted).toBe(true);
    if (!second.accepted || !direct.accepted) return;
    expect([...first.events, ...second.events])
      .toEqual(direct.events.slice(0, first.events.length + second.events.length));
  });

  it("defers a complete two-event Move after exactly 127 source events at the production 128-event cap", () => {
    const oneTickEffectId = id<EffectId>("effect:source-budget-one-tick");
    const oneTickAbilityId = id<AbilityId>("ability:source-budget-one-tick");
    const sourceContext: ResolvedCombatContext = {
      ...runtimeContext,
      typeChart: { normal: { normal: 0 } },
      abilityRules: {
        [oneTickAbilityId]: {
          abilityId: oneTickAbilityId,
          reactions: [{
            trigger: "battleStart",
            target: "self",
            order: 1,
            effects: [{ kind: "applyEffect", effectId: oneTickEffectId }],
          }],
        },
      },
      effectRules: {
        [oneTickEffectId]: {
          effectId: oneTickEffectId,
          lifetimeScope: "battle",
          stackingPolicy: "replace",
          durationMs: 1,
        },
      },
    };
    const base = runtimeInputs(sourceContext);
    const inputs = {
      ...base,
      team: base.team.map((member) => ({ ...member, abilityId: oneTickAbilityId })),
    };
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:precise-127-plus-2",
      inputs,
      policyRng: createRngState(123),
      combatDeterministicState: { rng: createRngState(999) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;
    expect(created.events.filter((entry) =>
      entry.kind === "combat" && entry.event.kind === "EffectApplied")).toHaveLength(1);
    const cutoff = 100_000;
    const initialCheckpoint = structuredClone(created.state);
    const first = advanceSoloHuntToEncounterBoundaryOrCutoff(created.state, inputs, cutoff, 128);
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    expect(created.state).toEqual(initialCheckpoint);
    expect(first.stopReason).toBe("projectionBudget");
    const published = first.events.filter((entry) => entry.kind === "combat");
    expect(published).toHaveLength(127);
    expect(published.filter((entry) => entry.event.kind === "EffectRemoved")).toHaveLength(1);
    expect(published.filter((entry) => entry.event.kind === "MoveUsed")).toHaveLength(63);
    expect(published.filter((entry) => entry.event.kind === "MoveImmune")).toHaveLength(63);
    const firstCheckpoint = structuredClone(first.state);
    const second = advanceSoloHuntToEncounterBoundaryOrCutoff(first.state, inputs, cutoff, 128);
    expect(first.state).toEqual(firstCheckpoint);
    const direct = advanceSoloHuntToEncounterBoundaryOrCutoff(created.state, inputs, cutoff);
    expect(second.accepted).toBe(true);
    expect(direct.accepted).toBe(true);
    if (!second.accepted || !direct.accepted) return;
    expect(second.events.slice(0, 2).map((entry) => entry.kind === "combat"
      ? entry.event.kind : entry.kind)).toEqual(["MoveUsed", "MoveImmune"]);
    expect([...first.events, ...second.events])
      .toEqual(direct.events.slice(0, first.events.length + second.events.length));
  });

  it("defers complete source stimuli at a cumulative conservative UTF-8 budget without changing gameplay", () => {
    const inputs = runtimeInputs({
      ...runtimeContext,
      typeChart: { normal: { normal: 0 } },
    });
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:source-byte-yield",
      inputs,
      policyRng: createRngState(123),
      combatDeterministicState: { rng: createRngState(999) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;
    const cutoff = 10_000;
    const original = structuredClone(created.state);
    const direct = advanceSoloHuntToEncounterBoundaryOrCutoff(created.state, inputs, cutoff);
    expect(direct.accepted).toBe(true);
    if (!direct.accepted) return;
    const directCombat = direct.events.flatMap((entry) =>
      entry.kind === "combat" ? [entry.event] : []);
    expect(directCombat.slice(0, 4).map((event) => event.kind))
      .toEqual(["MoveUsed", "MoveImmune", "MoveUsed", "MoveImmune"]);
    const utf8 = new TextEncoder();
    const upperBound = (events: typeof directCombat): number => events.reduce((sum, event) =>
      sum + 2 * utf8.encode(JSON.stringify(event)).byteLength + 128, 0);
    const firstStimulusBytes = upperBound(directCombat.slice(0, 2));
    const twoStimuliBytes = upperBound(directCombat.slice(0, 4));
    expect(firstStimulusBytes).toBeGreaterThan(1);
    expect(twoStimuliBytes).toBeGreaterThan(firstStimulusBytes);

    // If a single complete stimulus exceeds the conservative estimate, it is
    // still applied once; the exact publisher decides presentation availability.
    const indivisible = advanceSoloHuntToEncounterBoundaryOrCutoff(
      created.state, inputs, cutoff, 128, firstStimulusBytes - 1,
    );
    expect(indivisible.accepted).toBe(true);
    if (!indivisible.accepted) return;
    expect(indivisible.stopReason).toBe("projectionBudget");
    expect(indivisible.events).toEqual(direct.events.slice(0, 2));
    expect(indivisible.state).not.toEqual(created.state);

    const oneStimulus = advanceSoloHuntToEncounterBoundaryOrCutoff(
      created.state, inputs, cutoff, 128, twoStimuliBytes - 1,
    );
    const twoStimuli = advanceSoloHuntToEncounterBoundaryOrCutoff(
      created.state, inputs, cutoff, 128, twoStimuliBytes,
    );
    expect(oneStimulus.accepted).toBe(true);
    expect(twoStimuli.accepted).toBe(true);
    if (!oneStimulus.accepted || !twoStimuli.accepted) return;
    expect(oneStimulus.stopReason).toBe("projectionBudget");
    expect(oneStimulus.events).toEqual(direct.events.slice(0, 2));
    expect(twoStimuli.stopReason).toBe("projectionBudget");
    expect(twoStimuli.events).toEqual(direct.events.slice(0, 4));
    expect(created.state).toEqual(original);

    let current = created.state;
    const segmented: typeof direct.events[number][] = [];
    let yields = 0;
    for (let index = 0; index < 100; index += 1) {
      const step = advanceSoloHuntToEncounterBoundaryOrCutoff(
        current, inputs, cutoff, 128, twoStimuliBytes - 1,
      );
      expect(step.accepted, step.accepted ? undefined : step.reason).toBe(true);
      if (!step.accepted) return;
      expect(step.events.filter((entry) => entry.kind === "combat").length)
        .toBeLessThanOrEqual(128);
      segmented.push(...step.events);
      current = step.state;
      if (step.stopReason !== "projectionBudget") break;
      expect(step.events.some((entry) => entry.kind === "combat")).toBe(true);
      yields += 1;
    }
    expect(yields).toBeGreaterThan(1);
    expect(current).toEqual(direct.state);
    expect(segmented).toEqual(direct.events);
  });

  it.each([
    ["1h", 60 * 60 * 1000],
    ["8h", 8 * 60 * 60 * 1000],
  ] as const)("keeps direct and segmented %s advancement exactly equivalent", (_label, cutoffMs) => {
    const inputs = {
      ...runtimeInputs(),
      // Keep the fixture alive for the full wall-clock horizon while still producing Encounters.
      // The gap fully clears the carried 2s player cooldown before the next fresh opponent appears.
      interBattleGapMs: 60_000,
    };
    const created = createSoloHuntRuntime({
      huntRunIdentity: `hunt-run:segmented:${cutoffMs}`,
      inputs,
      policyRng: createRngState(123),
      combatDeterministicState: { rng: createRngState(999) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;

    const direct = advanceSoloHuntToCutoff(created.state, inputs, cutoffMs);
    const segmented = advanceSoloHuntSegmentedToCutoff(
      created.state,
      inputs,
      cutoffMs,
      15 * 60 * 1000,
    );
    expect(direct.accepted).toBe(true);
    expect(segmented.accepted).toBe(true);
    if (!direct.accepted || !segmented.accepted) return;
    expect(direct.state.status).toBe("active");
    expect(direct.state.logicalTimeMs).toBe(cutoffMs);
    expect(direct.state.completedEncounters.length).toBeGreaterThanOrEqual(
      cutoffMs === 60 * 60 * 1000 ? 50 : 400,
    );
    expect(segmented.state).toEqual(direct.state);
    expect(segmented.stopReason).toBe(direct.stopReason);
    expect(segmented.events).toEqual(direct.events);
  }, 20_000);

  it("round-trips a live Genetic Hunt checkpoint with exact individualization provenance", () => {
    const inputs = geneticRuntimeInputs();
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:genetic-checkpoint-codec",
      inputs,
      policyRng: createRngState(211),
      combatDeterministicState: { rng: createRngState(212) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;
    const advanced = advanceSoloHuntToCutoff(created.state, inputs, 1);
    expect(advanced.accepted).toBe(true);
    if (!advanced.accepted) return;

    const encoded = encodeSoloHuntCheckpointV1(advanced.state);
    const decoded = decodeSoloHuntCheckpointV1(encoded);
    expect(decoded).toEqual({ accepted: true, state: advanced.state });
    if (!decoded.accepted) return;
    expect(decoded.state.completedEncounterProvenance).toEqual(advanced.state.completedEncounterProvenance);
    expect(decoded.state.pendingCaptureDecision).toEqual(advanced.state.pendingCaptureDecision);
    const restoredEvidence = decoded.state.completedEncounters[0];
    const restoredPendingCapture = decoded.state.pendingCaptureDecision;
    expect(restoredEvidence).toBeDefined();
    expect(restoredPendingCapture).toBeDefined();
    if (!restoredEvidence || !restoredPendingCapture || restoredEvidence.completionKind !== "defeat") return;
    const restoredReward = replayValidateSoloHuntRewardSource(
      decoded.state,
      inputs,
      restoredEvidence.rewardSourceIdentity,
    );
    expect(
      restoredReward.accepted,
      restoredReward.accepted ? undefined : restoredReward.reason,
    ).toBe(true);
    const restoredCapture = replayValidateSoloHuntCaptureSource(
      decoded.state,
      inputs,
      restoredPendingCapture.encounterId,
    );
    expect(
      restoredCapture.accepted,
      restoredCapture.accepted ? undefined : restoredCapture.reason,
    ).toBe(true);
  });

  it("runs the same Genetic Hunt semantics under the v2 Genetic rules identity", () => {
    const inputs = geneticRuntimeInputs(GENETIC_COMBAT_RULES_VERSION_V2);
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:genetic-v2-rebind",
      inputs,
      policyRng: createRngState(311),
      combatDeterministicState: { rng: createRngState(312) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;
    expect(created.state.currentEncounter?.battle.context.rulesVersion)
      .toBe(GENETIC_COMBAT_RULES_VERSION_V2);
    expect(created.state.currentEncounter?.individualizationSnapshot).toBeDefined();
    const advanced = advanceSoloHuntToCutoff(created.state, inputs, 1);
    expect(advanced.accepted).toBe(true);
  });

  it("TASK-108 round-trips forward persisted HP through checkpoint restart without resetting to max", () => {
    const inputs = {
      ...runtimeInputs(),
      initialHpByPokemonInstanceId: {
        [runtimeTeam[0].pokemonInstanceId]: 17,
      },
    };
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:persistent-vitality-restart",
      inputs,
      policyRng: createRngState(221),
      combatDeterministicState: { rng: createRngState(222) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;

    const initialPlayer = created.state.currentEncounter?.battle.combatants[
      created.state.currentEncounter.battle.sides[0]!.combatantIds[0]!
    ];
    expect(initialPlayer?.currentHp).toBe(17);

    const decoded = decodeSoloHuntCheckpointV2(encodeSoloHuntCheckpointV2(created.state));
    expect(decoded.accepted).toBe(true);
    if (!decoded.accepted) return;
    const decodedPlayer = decoded.state.currentEncounter?.battle.combatants[
      decoded.state.currentEncounter.battle.sides[0]!.combatantIds[0]!
    ];
    expect(decodedPlayer?.currentHp).toBe(17);

    const resumed = advanceSoloHuntToCutoff(decoded.state, inputs, decoded.state.logicalTimeMs);
    expect(resumed.accepted).toBe(true);
    if (!resumed.accepted) return;
    const resumedPlayer = resumed.state.currentEncounter?.battle.combatants[
      resumed.state.currentEncounter.battle.sides[0]!.combatantIds[0]!
    ];
    expect(resumedPlayer?.currentHp).toBe(17);
  });

  it("rejects a checkpoint whose current Battle context no longer matches the Hunt context", () => {
    const inputs = geneticRuntimeInputs();
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:checkpoint-context-forgery",
      inputs,
      policyRng: createRngState(213),
      combatDeterministicState: { rng: createRngState(214) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted || !created.state.currentEncounter) return;
    const currentEncounter = created.state.currentEncounter;
    const malformed = {
      ...created.state,
      currentEncounter: {
        ...currentEncounter,
        battle: {
          ...currentEncounter.battle,
          context: {
            ...currentEncounter.battle.context,
            rulesVersion: "rules:forged",
          },
        },
      },
    } as SoloHuntRuntimeState;
    expect(decodeSoloHuntCheckpointV1(encodeSoloHuntCheckpointV1(malformed))).toMatchObject({
      accepted: false,
      reason: expect.stringMatching(/current Encounter does not match its pending selection/),
    });
  });

  it("rejects a checkpoint whose current Battle id no longer matches Hunt identity and ordinal", () => {
    const inputs = geneticRuntimeInputs();
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:checkpoint-battle-id-forgery",
      inputs,
      policyRng: createRngState(215),
      combatDeterministicState: { rng: createRngState(216) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted || !created.state.currentEncounter) return;
    const currentEncounter = created.state.currentEncounter;
    const malformed = {
      ...created.state,
      currentEncounter: {
        ...currentEncounter,
        battle: {
          ...currentEncounter.battle,
          battleId: "battle:forged",
        },
      },
    } as SoloHuntRuntimeState;
    expect(decodeSoloHuntCheckpointV1(encodeSoloHuntCheckpointV1(malformed))).toMatchObject({
      accepted: false,
      reason: expect.stringMatching(/current Encounter does not match its pending selection/),
    });
  });

  it("rejects a checkpoint whose current participant summary disagrees with activation provenance", () => {
    const inputs = geneticRuntimeInputs();
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:checkpoint-current-participant-forgery",
      inputs,
      policyRng: createRngState(217),
      combatDeterministicState: { rng: createRngState(218) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted || !created.state.currentEncounter) return;
    const currentEncounter = created.state.currentEncounter;
    const malformed = {
      ...created.state,
      currentEncounter: {
        ...currentEncounter,
        participantPokemonInstanceIds: ["pokemon:forged" as PokemonInstanceId],
      },
    } as SoloHuntRuntimeState;
    expect(decodeSoloHuntCheckpointV1(encodeSoloHuntCheckpointV1(malformed))).toMatchObject({
      accepted: false,
      reason: expect.stringMatching(/current Encounter does not match its pending selection/),
    });
  });

  it("exposes reward source authority only from replay-validated completed Encounter history", () => {
    const inputs = runtimeInputs();
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:reward-source-validation",
      inputs,
      policyRng: createRngState(123),
      combatDeterministicState: { rng: createRngState(999) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;
    const advanced = advanceSoloHuntToCutoff(created.state, inputs, 2000);
    expect(advanced.accepted).toBe(true);
    if (!advanced.accepted) return;
    const evidence = advanced.state.completedEncounters[0]!;
    expect(evidence.completionKind).toBe("defeat");
    if (evidence.completionKind !== "defeat") return;

    const validated = replayValidateSoloHuntRewardSource(
      advanced.state,
      inputs,
      evidence.rewardSourceIdentity,
    );
    expect(validated).toMatchObject({
      accepted: true,
      source: {
        subjectPlayerId: playerId,
        evidence,
        pinnedTeam: runtimeTeam,
      },
    });
    expect(replayValidateSoloHuntRewardSource(
      advanced.state,
      inputs,
      "reward:forged",
    )).toEqual({
      accepted: false,
      reason: "Solo Hunt reward source is absent from replay-validated completed Encounter history",
    });
    expect(replayValidateSoloHuntRewardSource(
      {
        ...advanced.state,
        completedEncounters: [{ ...evidence, rewardSourceIdentity: "reward:forged" }],
      },
      inputs,
      "reward:forged",
    )).toMatchObject({
      accepted: false,
      reason: expect.stringMatching(/completed Encounter|reward source|replay/i),
    });
  });

  it("settles mandatory forced replacement exactly at cutoff L without generating a same-time Move", () => {
    const cutoffEffectId = id<EffectId>("effect:cutoff-ko");
    const leadAbilityId = id<AbilityId>("ability:cutoff-lead");
    const opponentAbilityId = id<AbilityId>("ability:cutoff-opponent");
    const cutoffContext: ResolvedCombatContext = {
      ...runtimeContext,
      abilityRules: {
        [leadAbilityId]: {
          abilityId: leadAbilityId,
          reactions: [{
            trigger: "battleStart",
            target: "self",
            order: 1,
            effects: [
              { kind: "applyEffect", effectId: cutoffEffectId },
              { kind: "actionLock", durationMs: 2000, lifetimeScope: "battle" },
            ],
          }],
        },
        [opponentAbilityId]: {
          abilityId: opponentAbilityId,
          reactions: [{
            trigger: "battleStart",
            target: "self",
            order: 1,
            effects: [{ kind: "actionLock", durationMs: 2000, lifetimeScope: "battle" }],
          }],
        },
      },
      effectRules: {
        [cutoffEffectId]: {
          effectId: cutoffEffectId,
          lifetimeScope: "battle",
          stackingPolicy: "replace",
          durationMs: 2000,
          periodic: {
            kind: "damage",
            intervalMs: 1000,
            magnitude: { kind: "integer", amount: 100 },
          },
        },
      },
    };
    const lead = { ...runtimeTeam[0], abilityId: leadAbilityId };
    const reserve = {
      ...runtimeTeam[0],
      pokemonInstanceId: id<PokemonInstanceId>("pokemon:runtime-reserve"),
      speciesId: id<SpeciesId>("species:runtime-reserve"),
      baseStats: { ...runtimeTeam[0].baseStats, spe: 50 },
    };
    const baseInputs = runtimeInputs(cutoffContext);
    const inputs = {
      ...baseInputs,
      team: [lead, reserve],
      opponentTemplates: [{
        ...baseInputs.opponentTemplates[0],
        abilityId: opponentAbilityId,
      }],
    };
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:cutoff-replacement",
      inputs,
      policyRng: createRngState(51),
      combatDeterministicState: { rng: createRngState(52) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted || !created.state.currentEncounter) return;

    const encounter = created.state.currentEncounter;
    const advanced = advanceSoloHuntToCutoff(created.state, inputs, 1000);
    expect(advanced.accepted).toBe(true);
    if (!advanced.accepted || !advanced.state.currentEncounter) return;
    expect(advanced.stopReason).toBe("cutoff");
    expect(advanced.state.logicalTimeMs).toBe(1000);
    expect(advanced.events).toContainEqual(
      expect.objectContaining({
        kind: "combat",
        huntTimeMs: 1000,
        event: expect.objectContaining({
          kind: "CombatantActivated",
          sideId: encounter.playerSideId,
        }),
      }),
    );
    expect(advanced.events.some((event) =>
      event.kind === "combat"
      && event.huntTimeMs === 1000
      && event.event.kind === "MoveUsed",
    )).toBe(false);
    const byteSplit = advanceSoloHuntToEncounterBoundaryOrCutoff(
      created.state, inputs, 1000, 128, 1,
    );
    expect(byteSplit.accepted).toBe(true);
    if (!byteSplit.accepted) return;
    expect(byteSplit.stopReason).toBe("projectionBudget");
    expect(byteSplit.state.currentEncounter?.battle.replacementPendingSideIds)
      .toEqual([encounter.playerSideId]);
    const byteResumed = advanceSoloHuntToEncounterBoundaryOrCutoff(
      byteSplit.state, inputs, 1000, 128, 1,
    );
    expect(byteResumed.accepted).toBe(true);
    if (!byteResumed.accepted) return;
    expect(byteResumed.state).toEqual(advanced.state);
    expect([...byteSplit.events, ...byteResumed.events]).toEqual(advanced.events);
    const activeId = advanced.state.currentEncounter.battle.sides
      .find((side) => side.sideId === encounter.playerSideId)!.activeCombatantIds[0];
    expect(advanced.state.currentEncounter.battle.combatants[activeId].cadenceParticipant).toEqual({
      kind: "pokemonInstance",
      identity: reserve.pokemonInstanceId,
    });
  });

  it("checkpoints and resumes a non-zero inter-Battle gap while carrying readiness event-driven", () => {
    const inputs = { ...runtimeInputs(), interBattleGapMs: 3000 };
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:gap-resume",
      inputs,
      policyRng: createRngState(61),
      combatDeterministicState: { rng: createRngState(62) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;

    const firstCheckpoint = advanceSoloHuntToCutoff(created.state, inputs, 1000);
    expect(firstCheckpoint.accepted).toBe(true);
    if (!firstCheckpoint.accepted || !firstCheckpoint.state.interBattle) return;
    expect(firstCheckpoint.stopReason).toBe("cutoff");
    expect(firstCheckpoint.state.completedEncounters).toHaveLength(1);
    expect(firstCheckpoint.state.currentEncounter).toBeUndefined();
    expect(firstCheckpoint.state.logicalTimeMs).toBe(1000);
    expect(firstCheckpoint.state.interBattle.remainingGapMs).toBe(2000);
    const playerKey = cadenceParticipantKey({
      kind: "pokemonInstance",
      identity: runtimeTeam[0].pokemonInstanceId,
    });
    expect(firstCheckpoint.state.interBattle.cadence.readinessByParticipant[playerKey])
      .toMatchObject({ nextActionRemainingMs: 1000 });

    const resumed = advanceSoloHuntToCutoff(firstCheckpoint.state, inputs, 3000);
    expect(resumed.accepted).toBe(true);
    if (!resumed.accepted || !resumed.state.interBattle) return;
    expect(resumed.stopReason).toBe("cutoff");
    expect(resumed.state.logicalTimeMs).toBe(3000);
    expect(resumed.state.interBattle.remainingGapMs).toBe(0);
    expect(resumed.state.interBattle.cadence.readinessByParticipant[playerKey])
      .toMatchObject({
        nextActionRemainingMs: 0,
        moveCooldownRemainingMs: { first: 0 },
      });
    expect(resumed.state.pendingEncounterSelection).toBeUndefined();
  });

  it("terminalizes at the exact inter-Battle no-living boundary before constructing another Encounter", () => {
    const cadenceEffectId = id<EffectId>("effect:runtime-cadence-ko");
    const cadenceAbilityId = id<AbilityId>("ability:runtime-cadence-ko");
    const effectContext: ResolvedCombatContext = {
      ...runtimeContext,
      abilityRules: {
        [cadenceAbilityId]: {
          abilityId: cadenceAbilityId,
          reactions: [{
            trigger: "battleStart",
            target: "self",
            order: 1,
            effects: [{ kind: "applyEffect", effectId: cadenceEffectId }],
          }],
        },
      },
      effectRules: {
        [cadenceEffectId]: {
          effectId: cadenceEffectId,
          lifetimeScope: "cadence",
          stackingPolicy: "replace",
          durationMs: 5000,
          periodic: {
            kind: "damage",
            intervalMs: 1000,
            magnitude: { kind: "integer", amount: 100 },
          },
        },
      },
    };
    const inputs = {
      ...runtimeInputs(effectContext),
      team: [{ ...runtimeTeam[0], abilityId: cadenceAbilityId }],
      interBattleGapMs: 5000,
    };
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:gap-ko",
      inputs,
      policyRng: createRngState(71),
      combatDeterministicState: { rng: createRngState(72) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;
    const terminal = advanceSoloHuntToCutoff(created.state, inputs, 5000);
    expect(terminal.accepted).toBe(true);
    if (!terminal.accepted) return;
    expect(terminal.stopReason).toBe("noLivingTeam");
    expect(terminal.state.status).toBe("terminal");
    expect(terminal.state.terminalReason).toBe("noLivingTeam");
    expect(terminal.state.logicalTimeMs).toBe(1000);
    expect(terminal.state.currentEncounter).toBeUndefined();
    expect(terminal.state.pendingEncounterSelection).toBeUndefined();
    expect(terminal.state.completedEncounters).toHaveLength(1);
  });

  it("replays an explicit heal applied mid-gap and preserves it across checkpoint round-trip", () => {
    const cadenceEffectId = id<EffectId>("effect:runtime-cadence-chip");
    const cadenceAbilityId = id<AbilityId>("ability:runtime-cadence-chip");
    const effectContext: ResolvedCombatContext = {
      ...runtimeContext,
      abilityRules: {
        [cadenceAbilityId]: {
          abilityId: cadenceAbilityId,
          reactions: [{
            trigger: "battleStart",
            target: "self",
            order: 1,
            effects: [{ kind: "applyEffect", effectId: cadenceEffectId }],
          }],
        },
      },
      effectRules: {
        [cadenceEffectId]: {
          effectId: cadenceEffectId,
          lifetimeScope: "cadence",
          stackingPolicy: "replace",
          durationMs: 5000,
          periodic: {
            kind: "damage",
            intervalMs: 1000,
            magnitude: { kind: "integer", amount: 5 },
          },
        },
      },
    };
    const inputs = {
      ...runtimeInputs(effectContext),
      team: [{ ...runtimeTeam[0], abilityId: cadenceAbilityId }],
      interBattleGapMs: 5000,
    };
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:gap-heal",
      inputs,
      policyRng: createRngState(81),
      combatDeterministicState: { rng: createRngState(82) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;

    const damaged = advanceSoloHuntToCutoff(created.state, inputs, 1000);
    expect(damaged.accepted).toBe(true);
    if (!damaged.accepted || !damaged.state.interBattle) return;
    const playerKey = cadenceParticipantKey({
      kind: "pokemonInstance",
      identity: runtimeTeam[0].pokemonInstanceId,
    });
    const hpBefore = damaged.state.interBattle.cadence.hpByParticipant[playerKey];
    const maxHp = damaged.state.interBattle.cadence.maxHpByParticipant[playerKey];
    expect(hpBefore).toBeLessThan(maxHp);

    const healed = applySoloHuntExplicitHealing(damaged.state, inputs, {
      sourceIdentity: "heal-command:1",
      acceptanceSequence: "7",
      targetPokemonInstanceId: runtimeTeam[0].pokemonInstanceId,
      magnitude: { kind: "integer", amount: 3 },
    });
    expect(healed.accepted).toBe(true);
    if (!healed.accepted || !healed.state.interBattle) return;
    expect(healed.event.healedHp).toBe(3);
    expect(healed.state.interBattle.cadence.hpByParticipant[playerKey]).toBe(hpBefore + 3);

    const decoded = decodeSoloHuntCheckpointV2(encodeSoloHuntCheckpointV2(healed.state));
    expect(decoded.accepted).toBe(true);
    if (!decoded.accepted) return;
    expect(decoded.state.appliedHealingEvents).toEqual([healed.event]);

    const resumed = advanceSoloHuntToCutoff(decoded.state, inputs, 2000);
    expect(resumed.accepted).toBe(true);
    if (!resumed.accepted || !resumed.state.interBattle) return;
    expect(resumed.state.interBattle.cadence.hpByParticipant[playerKey]).toBe(hpBefore - 2);
  });

  it("fails closed atomically when completed Encounter evidence or capture handoff is forged", () => {
    const inputs = runtimeInputs();
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:evidence-integrity",
      inputs,
      policyRng: createRngState(81),
      combatDeterministicState: { rng: createRngState(82) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;
    const checkpoint = advanceSoloHuntToCutoff(created.state, inputs, 1);
    expect(checkpoint.accepted).toBe(true);
    if (!checkpoint.accepted) return;
    expect(checkpoint.state.completedEncounters).toHaveLength(1);
    expect(checkpoint.state.pendingCaptureDecision).toBeDefined();

    const evidence = checkpoint.state.completedEncounters[0]!;
    const capture = checkpoint.state.pendingCaptureDecision!;
    const invalidStates = [
      {
        ...checkpoint.state,
        completedEncounters: [{ ...evidence, encounterId: id<EncounterId>("encounter:forged") }],
      },
      {
        ...checkpoint.state,
        completedEncounters: [{ ...evidence, rewardSourceIdentity: "reward:forged" }],
      },
      {
        ...checkpoint.state,
        completedEncounters: [{ ...evidence, encounterOrdinal: 2 }],
      },
      {
        ...checkpoint.state,
        completedEncounters: [{ ...evidence, rewardEnvelope: { pokemonXpPool: 999999 } }],
      },
      {
        ...checkpoint.state,
        completedEncounters: [{
          ...evidence,
          participantPokemonInstanceIds: [id<PokemonInstanceId>("pokemon:forged")],
        }],
      },
      {
        ...checkpoint.state,
        pendingCaptureDecision: { ...capture, speciesId: id<SpeciesId>("species:forged") },
      },
      {
        ...checkpoint.state,
        pendingCaptureDecision: { ...capture, level: capture.level + 1 },
      },
      {
        ...checkpoint.state,
        pendingCaptureDecision: { ...capture, contentHash: "sha256:forged" },
      },
    ];

    for (const invalid of invalidStates) {
      const result = advanceSoloHuntToCutoff(invalid, inputs, invalid.logicalTimeMs);
      expect(result.accepted).toBe(false);
      if (result.accepted) continue;
      expect(result.state).toBe(invalid);
    }
  });

  it("rejects a coherent rewrite to another valid Encounter option because consumed-selection provenance is pinned", () => {
    const secondEncounterDefinitionId = id<EncounterDefinitionId>("encounter:runtime-second"),
      secondSpeciesId = id<SpeciesId>("species:runtime-second");
    const base = runtimeInputs();
    const options = [
      base.encounterOptions[0],
      {
        encounterDefinitionId: secondEncounterDefinitionId,
        speciesId: secondSpeciesId,
        weight: 1,
        levelBand: { min: 6, max: 6 },
        rewardEnvelope: { pokemonXpPool: 999, playerXp: 99 },
      },
    ] as const;
    const policySeed = Array.from({ length: 100 }, (_, index) => index + 1).find((seed) => {
      const selected = selectSoloHuntEncounter(options, createRngState(seed));
      return selected.accepted
        && selected.selection.encounterDefinitionId === encounterDefinitionId;
    });
    expect(policySeed).toBeDefined();
    if (!policySeed) return;
    const inputs = {
      ...base,
      encounterOptions: options,
      opponentTemplates: [
        base.opponentTemplates[0],
        {
          ...base.opponentTemplates[0],
          encounterDefinitionId: secondEncounterDefinitionId,
          speciesId: secondSpeciesId,
          level: 6,
        },
      ],
    };
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:coherent-option-forgery",
      inputs,
      policyRng: createRngState(policySeed),
      combatDeterministicState: { rng: createRngState(102) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;
    const checkpoint = advanceSoloHuntToCutoff(created.state, inputs, 1);
    expect(checkpoint.accepted).toBe(true);
    if (!checkpoint.accepted) return;
    const evidence = checkpoint.state.completedEncounters[0]!;
    expect(evidence.encounterDefinitionId).toBe(encounterDefinitionId);
    const other = options[1];
    const forgedEvidence = {
      ...evidence,
      encounterDefinitionId: other.encounterDefinitionId,
      speciesId: other.speciesId,
      level: other.levelBand.min,
      rewardEnvelope: other.rewardEnvelope,
    };
    const forged = {
      ...checkpoint.state,
      completedEncounters: [forgedEvidence],
      pendingCaptureDecision: {
        ...checkpoint.state.pendingCaptureDecision!,
        encounterDefinitionId: other.encounterDefinitionId,
        speciesId: other.speciesId,
        level: other.levelBand.min,
      },
    };

    const result = advanceSoloHuntToCutoff(forged, inputs, forged.logicalTimeMs);
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.state).toBe(forged);
  });

  it("rejects alternate valid-Team participant evidence even when its activation provenance is coherently rewritten", () => {
    const reserve = {
      ...runtimeTeam[0],
      pokemonInstanceId: id<PokemonInstanceId>("pokemon:runtime-valid-reserve"),
      speciesId: id<SpeciesId>("species:runtime-valid-reserve"),
    };
    const inputs = {
      ...runtimeInputs(),
      team: [...runtimeTeam, reserve],
    };
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:participant-forgery",
      inputs,
      policyRng: createRngState(111),
      combatDeterministicState: { rng: createRngState(112) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;
    const checkpoint = advanceSoloHuntToCutoff(created.state, inputs, 1);
    expect(checkpoint.accepted).toBe(true);
    if (!checkpoint.accepted) return;
    const evidence = checkpoint.state.completedEncounters[0]!;
    const provenance = checkpoint.state.completedEncounterProvenance[0]!;
    expect(evidence.participantPokemonInstanceIds).toEqual([runtimeTeam[0].pokemonInstanceId]);
    const forged = {
      ...checkpoint.state,
      completedEncounters: [{
        ...evidence,
        participantPokemonInstanceIds: [reserve.pokemonInstanceId],
      }],
      completedEncounterProvenance: [{
        ...provenance,
        participantActivations: [{
          ...provenance.participantActivations[0],
          pokemonInstanceId: reserve.pokemonInstanceId,
          combatantId: id<CombatantId>(JSON.stringify([
            "soloHuntPlayer",
            checkpoint.state.huntRunIdentity,
            1,
            reserve.pokemonInstanceId,
          ])),
        }],
      }],
    };

    const result = advanceSoloHuntToCutoff(forged, inputs, forged.logicalTimeMs);
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.state).toBe(forged);
  });

  it("rejects a forged extra forced-replacement participant when no authoritative replacement stimulus occurred", () => {
    const reserve = {
      ...runtimeTeam[0],
      pokemonInstanceId: id<PokemonInstanceId>("pokemon:runtime-forged-replacement"),
      speciesId: id<SpeciesId>("species:runtime-forged-replacement"),
    };
    const inputs = { ...runtimeInputs(), team: [...runtimeTeam, reserve] };
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:forged-replacement-provenance",
      inputs,
      policyRng: createRngState(121),
      combatDeterministicState: { rng: createRngState(122) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;
    const checkpoint = advanceSoloHuntToCutoff(created.state, inputs, 1);
    expect(checkpoint.accepted).toBe(true);
    if (!checkpoint.accepted) return;
    const evidence = checkpoint.state.completedEncounters[0]!;
    const provenance = checkpoint.state.completedEncounterProvenance[0]!;
    const forgedActivation = {
      pokemonInstanceId: reserve.pokemonInstanceId,
      combatantId: id<CombatantId>(JSON.stringify([
        "soloHuntPlayer",
        checkpoint.state.huntRunIdentity,
        1,
        reserve.pokemonInstanceId,
      ])),
      activationKind: "forcedReplacement" as const,
      combatTimeMs: 0,
      eventSequence: Math.max(1, provenance.terminalEventSequence - 1),
    };
    const forged = {
      ...checkpoint.state,
      completedEncounters: [{
        ...evidence,
        participantPokemonInstanceIds: [
          ...evidence.participantPokemonInstanceIds,
          reserve.pokemonInstanceId,
        ],
      }],
      completedEncounterProvenance: [{
        ...provenance,
        participantActivations: [...provenance.participantActivations, forgedActivation],
      }],
    };

    const result = advanceSoloHuntToCutoff(forged, inputs, forged.logicalTimeMs);
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.state).toBe(forged);
  });

  it("rejects a later-Encounter initial participant rewrite against replayed prior cadence", () => {
    const reserve = {
      ...runtimeTeam[0],
      pokemonInstanceId: id<PokemonInstanceId>("pokemon:runtime-later-reserve"),
      speciesId: id<SpeciesId>("species:runtime-later-reserve"),
    };
    const inputs = { ...runtimeInputs(), team: [...runtimeTeam, reserve] };
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:later-participant-forgery",
      inputs,
      policyRng: createRngState(131),
      combatDeterministicState: { rng: createRngState(132) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;
    const checkpoint = advanceSoloHuntToCutoff(created.state, inputs, 2001);
    expect(checkpoint.accepted).toBe(true);
    if (!checkpoint.accepted) return;
    expect(checkpoint.state.completedEncounters).toHaveLength(2);
    const evidence = checkpoint.state.completedEncounters[1]!;
    const provenance = checkpoint.state.completedEncounterProvenance[1]!;
    expect(evidence.participantPokemonInstanceIds).toEqual([runtimeTeam[0].pokemonInstanceId]);
    const forged = {
      ...checkpoint.state,
      completedEncounters: checkpoint.state.completedEncounters.map((row, index) => index === 1
        ? { ...row, participantPokemonInstanceIds: [reserve.pokemonInstanceId] }
        : row),
      completedEncounterProvenance: checkpoint.state.completedEncounterProvenance.map((row, index) => index === 1
        ? {
            ...row,
            participantActivations: [{
              ...provenance.participantActivations[0],
              pokemonInstanceId: reserve.pokemonInstanceId,
              combatantId: id<CombatantId>(JSON.stringify([
                "soloHuntPlayer",
                checkpoint.state.huntRunIdentity,
                2,
                reserve.pokemonInstanceId,
              ])),
            }],
          }
        : row),
    };

    const result = advanceSoloHuntToCutoff(forged, inputs, forged.logicalTimeMs);
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.state).toBe(forged);
  });

  it("fails closed atomically when current Battle side, outcome, id, or exact context is forged", () => {
    const inputs = runtimeInputs();
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:battle-integrity",
      inputs,
      policyRng: createRngState(91),
      combatDeterministicState: { rng: createRngState(92) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted || !created.state.currentEncounter) return;
    const encounter = created.state.currentEncounter;
    const alteredContext: ResolvedCombatContext = {
      ...encounter.battle.context,
      moveRules: {
        ...encounter.battle.context.moveRules,
        first: { ...encounter.battle.context.moveRules.first, power: 1 },
      },
    };
    const invalidStates = [
      {
        ...created.state,
        currentEncounter: {
          ...encounter,
          playerSideId: encounter.opponentSideId,
          opponentSideId: encounter.playerSideId,
        },
      },
      {
        ...created.state,
        currentEncounter: {
          ...encounter,
          battleOutcome: { kind: "win" as const, winnerSideId: encounter.playerSideId },
        },
      },
      {
        ...created.state,
        currentEncounter: {
          ...encounter,
          battle: {
            ...encounter.battle,
            battleId: id<BattleId>("battle:forged"),
          },
        },
      },
      {
        ...created.state,
        currentEncounter: {
          ...encounter,
          battle: {
            ...encounter.battle,
            context: alteredContext,
          },
        },
      },
    ];

    for (const invalid of invalidStates) {
      const result = advanceSoloHuntToCutoff(invalid, inputs, 1);
      expect(result.accepted).toBe(false);
      if (result.accepted) continue;
      expect(result.state).toBe(invalid);
    }
  });

  it("rejects stored advanceTime that skips past an earlier automatic Move-policy boundary", () => {
    const playerLockAbility = id<AbilityId>("ability:policy-bound-player"),
      opponentLockAbility = id<AbilityId>("ability:policy-bound-opponent");
    const lockedContext: ResolvedCombatContext = {
      ...runtimeContext,
      abilityRules: {
        [playerLockAbility]: {
          abilityId: playerLockAbility,
          reactions: [{
            trigger: "battleStart",
            target: "self",
            order: 1,
            effects: [{ kind: "actionLock", durationMs: 2000, lifetimeScope: "battle" }],
          }],
        },
        [opponentLockAbility]: {
          abilityId: opponentLockAbility,
          reactions: [{
            trigger: "battleStart",
            target: "self",
            order: 1,
            effects: [{ kind: "actionLock", durationMs: 2000, lifetimeScope: "battle" }],
          }],
        },
      },
    };
    const base = runtimeInputs(lockedContext);
    const inputs = {
      ...base,
      team: [{ ...runtimeTeam[0], abilityId: playerLockAbility }],
      opponentTemplates: [{
        ...base.opponentTemplates[0],
        abilityId: opponentLockAbility,
      }],
    };
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:forged-time-skip",
      inputs,
      policyRng: createRngState(141),
      combatDeterministicState: { rng: createRngState(142) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted || !created.state.currentEncounter) return;

    const encounter = created.state.currentEncounter;
    const policyAtStart = resolveNextSoloHuntMove(
      encounter.battle,
      created.state.combatDeterministicState,
      encounter.policy,
    );
    expect(policyAtStart).toMatchObject({
      kind: "idle",
      nextPolicyBoundaryMs: 2000,
    });
    const engineOnlyAdvance = resolveCombatStimulus(
      encounter.battle,
      { kind: "advanceTime", toMs: 3000 },
      created.state.combatDeterministicState,
    );
    expect(engineOnlyAdvance.accepted).toBe(true);
    if (!engineOnlyAdvance.accepted) return;

    const forged = {
      ...created.state,
      logicalTimeMs: 3000,
      combatDeterministicState: engineOnlyAdvance.deterministicState,
      currentEncounter: {
        ...encounter,
        battle: engineOnlyAdvance.state,
        battleStimuli: [{ kind: "advanceTime" as const, toMs: 3000 }],
      },
    };
    const result = advanceSoloHuntToCutoff(forged, inputs, 3000);
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.state).toBe(forged);
    expect(result.reason).toContain("policy boundary");
  });

  it("reuses an unresolved exact-context pending selection without a new draw and consumes it only after player victory", () => {
    const inputs = runtimeInputs();
    const original = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:pending-origin",
      inputs,
      policyRng: createRngState(11),
      combatDeterministicState: { rng: createRngState(22) },
    });
    expect(original.accepted).toBe(true);
    if (!original.accepted) return;
    const stopped = advanceSoloHuntToCutoff(original.state, inputs, 0);
    expect(stopped.accepted).toBe(true);
    if (!stopped.accepted) return;
    const pending = stopped.state.pendingEncounterSelection;
    expect(pending).toBeDefined();
    if (!pending) return;

    const restarted = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:pending-restart",
      inputs,
      policyRng: createRngState(999999),
      combatDeterministicState: { rng: createRngState(33) },
      pendingEncounterSelection: pending,
    });
    expect(restarted.accepted).toBe(true);
    if (!restarted.accepted) return;
    expect(restarted.state.currentEncounter?.selection).toMatchObject({
      encounterDefinitionId: pending.encounterDefinitionId,
      speciesId: pending.speciesId,
      level: pending.level,
    });
    expect(restarted.state.policyRng).toEqual(pending.policyRngAfterSelection);
    expect(restarted.state.pendingEncounterSelection?.pendingSelectionIdentity).toBe(
      pending.pendingSelectionIdentity,
    );

    const won = advanceSoloHuntToCutoff(restarted.state, inputs, 1);
    expect(won.accepted).toBe(true);
    if (!won.accepted) return;
    expect(won.state.completedEncounters[0]?.pendingSelectionIdentity).toBe(
      pending.pendingSelectionIdentity,
    );
    expect(won.state.pendingEncounterSelection?.pendingSelectionIdentity).not.toBe(
      pending.pendingSelectionIdentity,
    );

    const mismatchedInputs = { ...inputs, contentHash: "sha256:different" };
    const rejectedRestart = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:pending-mismatch",
      inputs: mismatchedInputs,
      policyRng: createRngState(123456),
      combatDeterministicState: { rng: createRngState(44) },
      pendingEncounterSelection: pending,
    });
    expect(rejectedRestart).toMatchObject({
      accepted: false,
      reason: expect.stringContaining("exact context"),
    });

    const atomicAdvance = advanceSoloHuntToCutoff(original.state, mismatchedInputs, 1);
    expect(atomicAdvance.accepted).toBe(false);
    if (atomicAdvance.accepted) return;
    expect(atomicAdvance.state).toBe(original.state);
  });

  it("binds one Genetic individual to PendingEncounterSelection across restart/new EncounterId and into capture", () => {
    const inputs = geneticRuntimeInputs();
    const original = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:genetic-origin",
      inputs,
      policyRng: createRngState(211),
      combatDeterministicState: { rng: createRngState(212) },
    });
    expect(original.accepted).toBe(true);
    if (!original.accepted || !original.state.currentEncounter) return;
    const pending = original.state.pendingEncounterSelection;
    const firstIndividual = original.state.currentEncounter.individualizationSnapshot;
    const firstEncounterId = original.state.currentEncounter.encounterId;
    expect(pending).toBeDefined();
    expect(firstIndividual).toBeDefined();
    if (!pending || !firstIndividual) return;
    expect(pending.compatibleProfiles).toEqual(["Might", "Clarity"]);
    expect(firstIndividual.compatibleProfiles).toEqual(pending.compatibleProfiles);

    const restarted = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:genetic-restart",
      inputs,
      policyRng: createRngState(999_999),
      combatDeterministicState: { rng: createRngState(213) },
      pendingEncounterSelection: pending,
    });
    expect(restarted.accepted).toBe(true);
    if (!restarted.accepted || !restarted.state.currentEncounter) return;
    expect(restarted.state.currentEncounter.encounterId).not.toBe(firstEncounterId);
    expect(restarted.state.currentEncounter.individualizationSnapshot).toEqual(firstIndividual);
    expect(restarted.state.currentEncounter.pendingSelectionIdentity).toBe(pending.pendingSelectionIdentity);

    const won = advanceSoloHuntToCutoff(restarted.state, inputs, 1);
    expect(won.accepted).toBe(true);
    if (!won.accepted) return;
    const evidence = won.state.completedEncounters[0];
    const provenance = won.state.completedEncounterProvenance[0];
    expect(evidence).toMatchObject({
      pendingSelectionIdentity: pending.pendingSelectionIdentity,
      individualizationSnapshotIdentity: firstIndividual.individualizationSnapshotIdentity,
      individualizationSnapshotCommitment: firstIndividual.individualizationSnapshotCommitment,
      individualizationRulesVersion: firstIndividual.individualizationRulesVersion,
      derivationAuthorityVersion: firstIndividual.derivationAuthorityVersion,
      derivationAuthorityKeyId: firstIndividual.derivationAuthorityKeyId,
    });
    expect(provenance?.individualizationSnapshot).toEqual(firstIndividual);
    expect(won.state.pendingCaptureDecision).toMatchObject({
      pendingSelectionIdentity: pending.pendingSelectionIdentity,
      individualizationSnapshotIdentity: firstIndividual.individualizationSnapshotIdentity,
      individualizationSnapshotCommitment: firstIndividual.individualizationSnapshotCommitment,
      individualizationRulesVersion: firstIndividual.individualizationRulesVersion,
      derivationAuthorityVersion: firstIndividual.derivationAuthorityVersion,
      derivationAuthorityKeyId: firstIndividual.derivationAuthorityKeyId,
    });
    const captureSource = replayValidateSoloHuntCaptureSource(
      won.state,
      inputs,
      won.state.pendingCaptureDecision!.encounterId,
    );
    expect(captureSource).toMatchObject({
      accepted: true,
      source: {
        subjectPlayerId: playerId,
        pendingCapture: won.state.pendingCaptureDecision,
        snapshot: firstIndividual,
      },
    });
    expect(replayValidateSoloHuntCompletedCaptureSource(
      {
        ...won.state,
        pendingCaptureDecision: undefined,
      },
      inputs,
      won.state.completedEncounters[0]!.encounterId,
    )).toMatchObject({
      accepted: true,
      source: {
        subjectPlayerId: playerId,
        snapshot: firstIndividual,
      },
    });
    expect(replayValidateSoloHuntCaptureSource(
      {
        ...won.state,
        completedEncounterProvenance: won.state.completedEncounterProvenance.map((row, index) =>
          index === 0 && row.individualizationSnapshot
            ? {
                ...row,
                individualizationSnapshot: {
                  ...row.individualizationSnapshot,
                  geneticGrade: row.individualizationSnapshot.geneticGrade === "Apex" ? "Normal" : "Apex",
                },
              }
            : row),
      },
      inputs,
      won.state.pendingCaptureDecision!.encounterId,
    )).toMatchObject({ accepted: false });
  });

  it("fails closed instead of rerolling when the authored Profile pair drifts for an unresolved pending token", () => {
    const inputs = geneticRuntimeInputs();
    const original = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:genetic-profile-origin",
      inputs,
      policyRng: createRngState(214),
      combatDeterministicState: { rng: createRngState(215) },
    });
    expect(original.accepted).toBe(true);
    if (!original.accepted || !original.state.pendingEncounterSelection) return;
    const pending = original.state.pendingEncounterSelection;
    expect(pending.compatibleProfiles).toEqual(["Might", "Clarity"]);

    const driftedInputs = {
      ...inputs,
      opponentTemplates: inputs.opponentTemplates.map((template) => ({
        ...template,
        compatibleProfiles: ["Might", "Endurance"] as const,
      })),
    };
    const restarted = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:genetic-profile-drift",
      inputs: driftedInputs,
      policyRng: createRngState(999_998),
      combatDeterministicState: { rng: createRngState(216) },
      pendingEncounterSelection: pending,
    });
    expect(restarted.accepted).toBe(false);
    if (restarted.accepted) return;
    expect(restarted.reason).toMatch(/PendingEncounterSelection|Profile|pending selection/i);
  });

  it("rejects forward opponent templates with non-zero IV placeholders and cadence without explicit Genetic context", () => {
    const inputs = geneticRuntimeInputs();
    const invalidTemplateInputs = {
      ...inputs,
      opponentTemplates: inputs.opponentTemplates.map((template) => ({
        ...template,
        ivs: { ...template.ivs, hp: 1 },
      })),
    };
    const invalidTemplate = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:genetic-template-iv",
      inputs: invalidTemplateInputs,
      policyRng: createRngState(217),
      combatDeterministicState: { rng: createRngState(218) },
    });
    expect(invalidTemplate).toMatchObject({
      accepted: false,
      reason: expect.stringContaining("IV placeholders must be zero"),
    });

    const cadenceWithoutContext = createFreshSoloHuntCadence(inputs.team);
    expect(cadenceWithoutContext).toMatchObject({
      accepted: false,
      reason: expect.stringContaining("requires an explicit combat context"),
    });
  });

  it("fails closed if a persisted current Genetic snapshot is tampered", () => {
    const inputs = geneticRuntimeInputs();
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:genetic-tamper",
      inputs,
      policyRng: createRngState(221),
      combatDeterministicState: { rng: createRngState(222) },
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted || !created.state.currentEncounter?.individualizationSnapshot) return;
    const current = created.state.currentEncounter;
    const individual = current.individualizationSnapshot!;
    const forged = {
      ...created.state,
      currentEncounter: {
        ...current,
        individualizationSnapshot: {
          ...individual,
          geneticScore: individual.geneticScore === 100 ? 99 : individual.geneticScore + 1,
        },
      },
    };
    const advanced = advanceSoloHuntToCutoff(forged, inputs, forged.logicalTimeMs);
    expect(advanced.accepted).toBe(false);
    if (advanced.accepted) return;
    expect(advanced.reason).toContain("individualization snapshot does not replay exactly");
    expect(advanced.state).toBe(forged);
  });

  it("maps opposing victory and draw to terminal Hunt without completion evidence or pending-selection consumption", () => {
    const lossContext: ResolvedCombatContext = {
      ...runtimeContext,
      moveRules: {
        ...runtimeContext.moveRules,
        enemy: { ...runtimeContext.moveRules.enemy, power: 1000 },
      },
    };
    const lossInputs = {
      ...runtimeInputs(lossContext),
      opponentTemplates: [{
        ...runtimeInputs(lossContext).opponentTemplates[0],
        baseStats: { hp: 10, atk: 200, def: 10, spa: 10, spd: 10, spe: 200 },
      }],
    };
    const loss = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:loss",
      inputs: lossInputs,
      policyRng: createRngState(1),
      combatDeterministicState: { rng: createRngState(2) },
    });
    expect(loss.accepted).toBe(true);
    if (!loss.accepted) return;
    const lossPending = loss.state.pendingEncounterSelection;
    const lost = advanceSoloHuntToCutoff(loss.state, lossInputs, 1);
    expect(lost.accepted).toBe(true);
    if (!lost.accepted) return;
    expect(lost.state.terminalReason).toBe("opponentVictory");
    expect(lost.state.completedEncounters).toEqual([]);
    expect(lost.state.pendingEncounterSelection).toEqual(lossPending);

    const drawContext: ResolvedCombatContext = {
      ...lossContext,
      moveRules: {
        ...lossContext.moveRules,
        enemy: { ...lossContext.moveRules.enemy, targetScope: "allActive", power: 1000 },
      },
    };
    const drawInputs = {
      ...runtimeInputs(drawContext),
      opponentTemplates: [{
        ...runtimeInputs(drawContext).opponentTemplates[0],
        baseStats: { hp: 10, atk: 200, def: 10, spa: 10, spd: 10, spe: 200 },
      }],
    };
    const draw = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:draw",
      inputs: drawInputs,
      policyRng: createRngState(3),
      combatDeterministicState: { rng: createRngState(4) },
    });
    expect(draw.accepted).toBe(true);
    if (!draw.accepted) return;
    const drawPending = draw.state.pendingEncounterSelection;
    const drawn = advanceSoloHuntToCutoff(draw.state, drawInputs, 1);
    expect(drawn.accepted).toBe(true);
    if (!drawn.accepted) return;
    expect(drawn.state.terminalReason).toBe("draw");
    expect(drawn.state.completedEncounters).toEqual([]);
    expect(drawn.state.pendingEncounterSelection).toEqual(drawPending);
  });

  it("D-F16 preserves a sealed draw while post-Battle Revive consumes the pending selection as resolved_non_win", () => {
    const managementInputs = geneticRuntimeInputs(MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1);
    const drawContext: ResolvedCombatContext = {
      ...managementInputs.context,
      combatEventSchemaVersion: MANAGEMENT_FIRST_COMBAT_EVENT_SCHEMA_VERSION_V1,
      moveRules: {
        ...managementInputs.context.moveRules,
        enemy: { ...managementInputs.context.moveRules.enemy, targetScope: "allActive", power: 1000 },
      },
    };
    const baseInputs = {
      ...managementInputs,
      context: drawContext,
    };
    const inputs = {
      ...baseInputs,
      opponentTemplates: [{
        ...baseInputs.opponentTemplates[0],
        baseStats: { hp: 10, atk: 200, def: 10, spa: 10, spd: 10, spe: 200 },
      }],
      automationPolicies: {
        capture: { policyVersion: null, rowVersion: "0", enabled: false },
        potion: NO_SAVED_AUTO_POTION_POLICY,
        revive: NO_SAVED_AUTO_REVIVE_POLICY,
      },
    } as const;
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:post-battle-revive",
      inputs,
      policyRng: createRngState(3),
      combatDeterministicState: { rng: createRngState(4) },
    });
    expect(created.accepted, created.accepted ? undefined : created.reason).toBe(true);
    if (!created.accepted) return;
    const pending = created.state.pendingEncounterSelection;
    expect(pending).toBeDefined();

    let state = created.state;
    for (let step = 0; step < 16; step += 1) {
      const advanced = advanceSoloHuntToAutomationBoundaryOrEncounterBoundaryOrCutoff(
        state,
        inputs,
        10,
        { skipInitialAutomationBoundary: true },
      );
      expect(advanced.accepted).toBe(true);
      if (!advanced.accepted) return;
      state = advanced.state;
      if (state.currentEncounter?.battle.status === "ended") break;
    }
    const sealed = state.currentEncounter;
    expect(sealed?.battle.status).toBe("ended");
    expect(sealed?.battleOutcome).toEqual({ kind: "draw" });
    expect(state.status).toBe("active");
    expect(state.pendingEncounterSelection).toEqual(pending);
    if (!sealed) return;
    const sealedBattle = sealed.battle;
    const sealedStimuli = [...sealed.battleStimuli];
    const activation = sealed.participantActivations.at(-1);
    expect(activation).toBeDefined();
    if (!activation) return;
    const combatant = sealed.battle.combatants[activation.combatantId];
    expect(combatant?.currentHp).toBe(0);
    if (!combatant) return;

    const revived = applySoloHuntPostBattleAutoRevive(state, inputs, {
      provenanceId: "automation:post-battle-revive:1",
      targetPokemonInstanceId: activation.pokemonInstanceId,
      restoredHp: Math.max(1, Math.floor(combatant.maxHp / 2)),
    });
    expect(revived.accepted, revived.accepted ? undefined : revived.reason).toBe(true);
    if (!revived.accepted) return;
    expect(sealed.battle).toEqual(sealedBattle);
    expect(sealed.battleStimuli).toEqual(sealedStimuli);
    expect(revived.state.currentEncounter).toBeUndefined();
    expect(revived.state.pendingEncounterSelection).toBeUndefined();
    expect(revived.state.pendingCaptureDecision).toBeUndefined();
    expect(revived.state.completedEncounters).toHaveLength(1);
    expect(revived.state.completedEncounters[0]).toMatchObject({
      encounterId: sealed.encounterId,
      completionKind: "resolved_non_win",
    });
    expect("rewardSourceIdentity" in revived.state.completedEncounters[0]!).toBe(false);
    expect("rewardEnvelope" in revived.state.completedEncounters[0]!).toBe(false);
    expect(revived.state.appliedAutomationEvents?.at(-1)).toMatchObject({
      kind: "revive",
      provenanceId: "automation:post-battle-revive:1",
      afterEncounterId: sealed.encounterId,
      resultingHp: revived.resultingHp,
    });
    const targetKey = cadenceParticipantKey({
      kind: "pokemonInstance",
      identity: activation.pokemonInstanceId,
    });
    expect(revived.state.interBattle?.cadence.hpByParticipant[targetKey]).toBe(revived.resultingHp);

    const bytes = encodeSoloHuntCheckpointV3(revived.state);
    expect(decodeSoloHuntCheckpointV3(bytes)).toEqual({ accepted: true, state: revived.state });
    expect(replayValidateSoloHuntRewardSource(
      revived.state,
      inputs,
      "reward:forbidden-after-draw",
    )).toMatchObject({ accepted: false });
    expect(replayValidateSoloHuntCompletedCaptureSource(
      revived.state,
      inputs,
      sealed.encounterId,
    )).toMatchObject({
      accepted: false,
      reason: expect.stringMatching(/resolved_non_win/i),
    });
  });

  it("settles a same-time forward Battle action at cutoff before exposing its new KO automation boundary", () => {
    const managementInputs = geneticRuntimeInputs(MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1);
    const lethalContext: ResolvedCombatContext = {
      ...managementInputs.context,
      combatEventSchemaVersion: MANAGEMENT_FIRST_COMBAT_EVENT_SCHEMA_VERSION_V1,
      moveRules: {
        ...managementInputs.context.moveRules,
        enemy: { ...managementInputs.context.moveRules.enemy, power: 1000 },
      },
    };
    const baseInputs = {
      ...managementInputs,
      context: lethalContext,
    };
    const inputs = {
      ...baseInputs,
      opponentTemplates: [{
        ...baseInputs.opponentTemplates[0],
        baseStats: { hp: 10, atk: 200, def: 10, spa: 10, spd: 10, spe: 200 },
      }],
      automationPolicies: {
        capture: { policyVersion: null, rowVersion: "0", enabled: false },
        potion: NO_SAVED_AUTO_POTION_POLICY,
        revive: NO_SAVED_AUTO_REVIVE_POLICY,
      },
    } as const;
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:retreat-exact-cutoff",
      inputs,
      policyRng: createRngState(81),
      combatDeterministicState: { rng: createRngState(82) },
    });
    expect(created.accepted, created.accepted ? undefined : created.reason).toBe(true);
    if (!created.accepted) return;

    const cutoff = created.state.logicalTimeMs;
    const advanced = advanceSoloHuntToAutomationBoundaryOrEncounterBoundaryOrCutoff(
      created.state,
      inputs,
      cutoff,
      { skipInitialAutomationBoundary: true },
    );
    expect(advanced.accepted, advanced.accepted ? undefined : advanced.reason).toBe(true);
    if (!advanced.accepted) return;
    expect(advanced.stopReason).toBe("automationBoundary");
    expect(advanced.state.logicalTimeMs).toBe(cutoff);
    expect(advanced.state.currentEncounter?.battle.status).toBe("active");
    expect(advanced.state.currentEncounter?.battle.koInterventionPending).toMatchObject({
      sideId: advanced.state.currentEncounter?.playerSideId,
      combatantId: expect.any(String),
    });
    expect(advanced.events.some((event) =>
      event.kind === "combat"
      && event.huntTimeMs === cutoff
      && event.event.kind === "MoveUsed"
    )).toBe(true);
  });

  it("stops a forward Hunt after settled inter-Battle effects before initializing Encounter N+1", () => {
    const managementInputs = geneticRuntimeInputs(MANAGEMENT_FIRST_COMBAT_RULES_VERSION_V1);
    const inputs = {
      ...managementInputs,
      context: {
        ...managementInputs.context,
        combatEventSchemaVersion: MANAGEMENT_FIRST_COMBAT_EVENT_SCHEMA_VERSION_V1,
      },
      automationPolicies: {
        capture: { policyVersion: null, rowVersion: "0", enabled: false },
        potion: NO_SAVED_AUTO_POTION_POLICY,
        revive: NO_SAVED_AUTO_REVIVE_POLICY,
      },
    } as const;
    const created = createSoloHuntRuntime({
      huntRunIdentity: "hunt-run:activity-gate",
      inputs,
      policyRng: createRngState(71),
      combatDeterministicState: { rng: createRngState(72) },
    });
    expect(created.accepted, created.accepted ? undefined : created.reason).toBe(true);
    if (!created.accepted) return;

    let state = created.state;
    let encounterBoundaryReached = false;
    for (let step = 0; step < 32; step += 1) {
      const advanced = advanceSoloHuntToAutomationBoundaryOrEncounterBoundaryOrCutoff(
        state,
        inputs,
        60_000,
        { skipInitialAutomationBoundary: true },
      );
      expect(advanced.accepted).toBe(true);
      if (!advanced.accepted) return;
      state = advanced.state;
      if (advanced.stopReason === "encounterBoundary") {
        encounterBoundaryReached = true;
        break;
      }
    }
    expect(encounterBoundaryReached).toBe(true);
    expect(state.completedEncounters).toHaveLength(1);
    expect(state.currentEncounter).toBeUndefined();

    let activityBoundaryReached = false;
    for (let step = 0; step < 32; step += 1) {
      const advanced = advanceSoloHuntToAutomationBoundaryOrEncounterBoundaryOrCutoff(
        state,
        inputs,
        60_000,
        {
          skipInitialAutomationBoundary: true,
          stopBeforeNextEncounter: true,
        },
      );
      expect(advanced.accepted).toBe(true);
      if (!advanced.accepted) return;
      state = advanced.state;
      if (advanced.stopReason === "activityBoundary") {
        activityBoundaryReached = true;
        break;
      }
    }
    expect(activityBoundaryReached).toBe(true);
    expect(state.interBattle?.remainingGapMs).toBe(0);
    expect(state.interBattle?.activePokemonInstanceId).toBe(inputs.team[0]!.pokemonInstanceId);
    expect(state.currentEncounter).toBeUndefined();
    expect(state.completedEncounters).toHaveLength(1);

    const released = advanceSoloHuntToAutomationBoundaryOrEncounterBoundaryOrCutoff(
      state,
      inputs,
      60_000,
      {
        skipInitialAutomationBoundary: true,
        stopBeforeNextEncounter: false,
      },
    );
    expect(released.accepted).toBe(true);
    if (!released.accepted) return;
    expect(released.state.currentEncounter?.encounterOrdinal).toBe(2);
  });
});
