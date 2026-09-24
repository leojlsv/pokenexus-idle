import { describe, expect, it } from "vitest";
import {
  cadenceParticipantKey,
  createRngState,
  initializeBattle,
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
import {
  createFreshSoloHuntCadence,
  initializeSoloHuntEncounterBattle,
  pruneSoloHuntEndedOpponentCadence,
  advanceSoloHuntInterBattleCadence,
  advanceSoloHuntToCutoff,
  createSoloHuntRuntime,
  resolveSoloHuntForcedReplacement,
  createSoloHuntMovePolicyState,
  resolveNextSoloHuntMove,
  selectSoloHuntEncounter,
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
});
