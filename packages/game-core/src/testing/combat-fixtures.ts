import type {
  AbilityId,
  BattleCombatantInit,
  BattleId,
  BattleInitInput,
  BattleSideId,
  CadenceCarryState,
  CadenceParticipant,
  CombatEventSchemaVersion,
  CombatStimulus,
  CombatantId,
  DeterministicState,
  EffectId,
  GameDataVersion,
  MoveId,
  MoveRule,
  NonPlayerCadenceIdentity,
  PokemonInstanceId,
  ResolvedCombatContext,
  RulesVersion,
  SpeciesId,
  StatBlock,
  TypeEffectivenessValue,
  TypeId,
} from "../types";
import { cadenceParticipantKey } from "../types";

export type FixtureVersions = Readonly<{
  gameDataVersion: string;
  rulesVersion: string;
  combatEventSchemaVersion: string;
}>;

export type CombatReplayFixture = Readonly<{
  fixtureId: string;
  metadata?: Readonly<{
    family?: string;
    orchestratorLabel?: string;
    propertyCaseId?: string;
  }>;
  initialBattle: BattleInitInput;
  stimuli: ReadonlyArray<CombatStimulus>;
}>;

const DEFAULT_VERSIONS: FixtureVersions = {
  gameDataVersion: "fixture-data-v1",
  rulesVersion: "fixture-rules-v1",
  combatEventSchemaVersion: "fixture-events-v1",
};

const BASE_STATS: StatBlock<number> = {
  hp: 100,
  atk: 50,
  def: 50,
  spa: 50,
  spd: 50,
  spe: 50,
};

const ZERO_IVS: StatBlock<number> = {
  hp: 0,
  atk: 0,
  def: 0,
  spa: 0,
  spd: 0,
  spe: 0,
};

function id<T extends string>(value: string): T {
  return value as T;
}

function ownRecord<T>(entries: ReadonlyArray<readonly [string, T]>): Record<string, T> {
  const record = Object.create(null) as Record<string, T>;
  for (const [key, value] of entries) record[key] = value;
  return record;
}

function versions(value: FixtureVersions = DEFAULT_VERSIONS): Pick<
  ResolvedCombatContext,
  "gameDataVersion" | "rulesVersion" | "combatEventSchemaVersion"
> {
  return {
    gameDataVersion: id<GameDataVersion>(value.gameDataVersion),
    rulesVersion: id<RulesVersion>(value.rulesVersion),
    combatEventSchemaVersion: id<CombatEventSchemaVersion>(value.combatEventSchemaVersion),
  };
}

function context(
  catalogs: Pick<ResolvedCombatContext, "moveRules" | "abilityRules" | "effectRules" | "typeChart">,
  pinnedVersions: FixtureVersions = DEFAULT_VERSIONS,
): ResolvedCombatContext {
  return { ...versions(pinnedVersions), ...catalogs };
}

function cooldowns(moveLoadout: ReadonlyArray<MoveId>, values: Readonly<Record<string, number>> = {}): Record<string, number> {
  return ownRecord(moveLoadout.map((moveId) => [moveId, Object.prototype.hasOwnProperty.call(values, moveId) ? values[moveId] : 0]));
}

function combatant(options: Readonly<{
  combatantId: string;
  moveLoadout: ReadonlyArray<MoveId>;
  types?: ReadonlyArray<string>;
  startingHp?: number;
  initialNextActionRemainingMs?: number;
  initialMoveCooldownRemainingMs?: Readonly<Record<string, number>>;
  baseStats?: Partial<StatBlock<number>>;
  abilityId?: AbilityId;
  cadenceParticipant?: CadenceParticipant;
}>): BattleCombatantInit {
  return {
    combatantId: id<CombatantId>(options.combatantId),
    speciesId: id<SpeciesId>(`species:${options.combatantId}`),
    level: 20,
    baseStats: { ...BASE_STATS, ...options.baseStats },
    ivs: { ...ZERO_IVS },
    types: (options.types ?? ["normal"]).map((value) => id<TypeId>(value)),
    startingHp: options.startingHp ?? 70,
    moveLoadout: [...options.moveLoadout],
    initialNextActionRemainingMs: options.initialNextActionRemainingMs ?? 0,
    initialMoveCooldownRemainingMs: cooldowns(options.moveLoadout, options.initialMoveCooldownRemainingMs),
    ...(options.abilityId ? { abilityId: options.abilityId } : {}),
    ...(options.cadenceParticipant ? { cadenceParticipant: options.cadenceParticipant } : {}),
  };
}

function side(sideId: string, combatantIds: ReadonlyArray<string>, activeCombatantIds: ReadonlyArray<string>, activeCapacity = activeCombatantIds.length) {
  return {
    sideId: id<BattleSideId>(sideId),
    activeCapacity,
    combatantIds: combatantIds.map((value) => id<CombatantId>(value)),
    initialActiveCombatantIds: activeCombatantIds.map((value) => id<CombatantId>(value)),
  };
}

function deterministicState(seed: number): DeterministicState {
  return { rng: { algorithm: "xorshift32-v1", state: seed } };
}

function battleInput(options: Readonly<{
  battleId: string;
  context: ResolvedCombatContext;
  sides: BattleInitInput["sides"];
  combatants: BattleInitInput["combatants"];
  seed: number;
  cadenceCarry?: CadenceCarryState;
  cadenceBindings?: BattleInitInput["cadenceBindings"];
  deterministicState?: DeterministicState;
}>): BattleInitInput {
  return {
    battleId: id<BattleId>(options.battleId),
    context: options.context,
    sides: options.sides,
    combatants: options.combatants,
    deterministicState: options.deterministicState ?? deterministicState(options.seed),
    ...(options.cadenceCarry ? { cadenceCarry: options.cadenceCarry } : {}),
    ...(options.cadenceBindings ? { cadenceBindings: options.cadenceBindings } : {}),
  };
}

export type DamageBranchFixtureOptions = Readonly<{
  fixtureId: string;
  seed: number;
  category: "physical" | "special";
  typeId: string;
  power: number;
  accuracy: number | "always";
  criticalPolicy: "normal" | "always" | "never";
  actorTypes: ReadonlyArray<string>;
  targetTypes: ReadonlyArray<ReadonlyArray<string>>;
  targetIds?: ReadonlyArray<string>;
  typeChart?: Readonly<Record<string, Readonly<Record<string, TypeEffectivenessValue>>>>;
  targetScope?: "singleEnemy" | "allEnemies";
  actorBaseStats?: Partial<StatBlock<number>>;
  targetBaseStats?: Partial<StatBlock<number>>;
  targetStartingHp?: number;
  versions?: FixtureVersions;
  orchestratorLabel?: string;
}>;

export function createDamageBranchReplayFixture(options: DamageBranchFixtureOptions): CombatReplayFixture {
  const moveId = id<MoveId>("fixture-damage");
  const moveRule: MoveRule = {
    moveId,
    typeId: id<TypeId>(options.typeId),
    category: options.category,
    targetScope: options.targetScope ?? "singleEnemy",
    moveCooldownMs: 2000,
    power: options.power,
    accuracy: options.accuracy,
    criticalPolicy: options.criticalPolicy,
  };
  const resolvedContext = context({
    moveRules: ownRecord([[moveId, moveRule]]),
    abilityRules: ownRecord([]),
    effectRules: ownRecord([]),
    typeChart: options.typeChart ?? ownRecord([[options.typeId, ownRecord(options.targetTypes.flat().map((targetType) => [targetType, 1 as const]))]]),
  }, options.versions);
  if (options.targetIds && options.targetIds.length !== options.targetTypes.length) {
    throw new Error("damage-branch targetIds must match targetTypes length");
  }
  const targetIds = options.targetTypes.map((_, index) => options.targetIds?.[index] ?? `target-${index + 1}`);
  const actor = combatant({
    combatantId: "actor",
    moveLoadout: [moveId],
    types: options.actorTypes,
    baseStats: options.actorBaseStats,
  });
  const targets = targetIds.map((targetId, index) => combatant({
    combatantId: targetId,
    moveLoadout: [moveId],
    types: options.targetTypes[index],
    startingHp: options.targetStartingHp,
    initialNextActionRemainingMs: 10_000,
    baseStats: options.targetBaseStats,
  }));
  const stimulus: CombatStimulus = {
    kind: "useMove",
    actorId: actor.combatantId,
    moveId,
    ...(moveRule.targetScope === "singleEnemy" ? { targetId: targets[0].combatantId } : {}),
  };
  return {
    fixtureId: options.fixtureId,
    metadata: {
      family: "damage-branch",
      ...(options.orchestratorLabel ? { orchestratorLabel: options.orchestratorLabel } : {}),
    },
    initialBattle: battleInput({
      battleId: `battle:${options.fixtureId}`,
      context: resolvedContext,
      sides: [
        side("side-actor", [actor.combatantId], [actor.combatantId]),
        side("side-target", targetIds, targetIds, targetIds.length),
      ],
      combatants: [actor, ...targets],
      seed: options.seed,
    }),
    stimuli: [stimulus],
  };
}

export function createReadinessReplayFixture(orchestratorLabel?: string): CombatReplayFixture {
  const slow = id<MoveId>("slow-strike");
  const alternate = id<MoveId>("alternate-strike");
  const makeRule = (moveId: MoveId, moveCooldownMs: number): MoveRule => ({
    moveId,
    typeId: id<TypeId>("normal"),
    category: "physical",
    targetScope: "singleEnemy",
    moveCooldownMs,
    power: 1,
    accuracy: "always",
    criticalPolicy: "never",
  });
  const resolvedContext = context({
    moveRules: ownRecord([[slow, makeRule(slow, 8000)], [alternate, makeRule(alternate, 2000)]]),
    abilityRules: ownRecord([]),
    effectRules: ownRecord([]),
    typeChart: ownRecord([["normal", ownRecord([["normal", 1]])]]),
  });
  const actor = combatant({ combatantId: "ready-actor", moveLoadout: [slow, alternate], types: ["normal"] });
  const target = combatant({
    combatantId: "ready-target",
    moveLoadout: [slow],
    initialNextActionRemainingMs: 10_000,
    types: ["normal"],
  });
  const targetId = target.combatantId;
  return {
    fixtureId: "readiness-rejection-and-alternate",
    metadata: {
      family: "readiness-rejection",
      ...(orchestratorLabel ? { orchestratorLabel } : {}),
    },
    initialBattle: battleInput({
      battleId: "battle:readiness",
      context: resolvedContext,
      sides: [side("ready-a", [actor.combatantId], [actor.combatantId]), side("ready-b", [targetId], [targetId])],
      combatants: [actor, target],
      seed: 17,
    }),
    stimuli: [
      { kind: "useMove", actorId: actor.combatantId, moveId: slow, targetId },
      { kind: "useMove", actorId: actor.combatantId, moveId: alternate, targetId },
      { kind: "advanceTime", toMs: 2000 },
      { kind: "useMove", actorId: actor.combatantId, moveId: slow, targetId },
      { kind: "useMove", actorId: actor.combatantId, moveId: alternate, targetId },
    ],
  };
}

export function createPartitionReplayFixture(options: Readonly<{
  propertyCaseId: string;
  seed: number;
  stageDelta: number;
  initialNextActionRemainingMs: number;
  partition: "direct" | "split";
}>): CombatReplayFixture {
  const strike = id<MoveId>("partition-strike");
  const regen = id<EffectId>("partition-regen");
  const setup = id<AbilityId>("partition-setup");
  const resolvedContext = context({
    moveRules: ownRecord([[strike, {
      moveId: strike,
      typeId: id<TypeId>("normal"),
      category: "physical",
      targetScope: "singleEnemy",
      moveCooldownMs: 3000,
      power: 40,
      accuracy: 100,
      criticalPolicy: "normal",
    }]]),
    abilityRules: ownRecord([[setup, {
      abilityId: setup,
      reactions: [{
        trigger: "battleStart",
        target: "self",
        order: 1,
        effects: [
          { kind: "statStage", stat: "atk", delta: options.stageDelta },
          { kind: "applyEffect", effectId: regen },
        ],
      }],
    }]]),
    effectRules: ownRecord([[regen, {
      effectId: regen,
      lifetimeScope: "battle",
      stackingPolicy: "refresh",
      durationMs: 10,
      periodic: { kind: "healing", intervalMs: 5, magnitude: { kind: "integer", amount: 3 } },
    }]]),
    typeChart: ownRecord([["normal", ownRecord([["normal", 1]])]]),
  });
  const actor = combatant({
    combatantId: "partition-actor",
    moveLoadout: [strike],
    startingHp: 20,
    initialNextActionRemainingMs: options.initialNextActionRemainingMs,
    abilityId: setup,
    types: ["normal"],
  });
  const target = combatant({
    combatantId: "partition-target",
    moveLoadout: [strike],
    startingHp: 70,
    initialNextActionRemainingMs: 10_000,
    types: ["normal"],
  });
  const timing: ReadonlyArray<CombatStimulus> = options.partition === "direct"
    ? [{ kind: "advanceTime", toMs: 10 }]
    : [{ kind: "advanceTime", toMs: 5 }, { kind: "advanceTime", toMs: 10 }];
  return {
    fixtureId: `${options.propertyCaseId}:${options.partition}`,
    metadata: { family: "time-partition", propertyCaseId: options.propertyCaseId },
    initialBattle: battleInput({
      battleId: `battle:${options.propertyCaseId}`,
      context: resolvedContext,
      sides: [side("partition-a", [actor.combatantId], [actor.combatantId]), side("partition-b", [target.combatantId], [target.combatantId])],
      combatants: [actor, target],
      seed: options.seed,
    }),
    stimuli: [...timing, { kind: "useMove", actorId: actor.combatantId, moveId: strike, targetId: target.combatantId }],
  };
}

export function createTerminalReplacementReplayFixture(): CombatReplayFixture {
  const finisher = id<MoveId>("terminal-finisher");
  const resolvedContext = context({
    moveRules: ownRecord([[finisher, {
      moveId: finisher,
      typeId: id<TypeId>("normal"),
      category: "physical",
      targetScope: "singleEnemy",
      moveCooldownMs: 2000,
      power: 100_000,
      accuracy: "always",
      criticalPolicy: "never",
    }]]),
    abilityRules: ownRecord([]),
    effectRules: ownRecord([]),
    typeChart: ownRecord([["normal", ownRecord([["normal", 1]])]]),
  });
  const actor = combatant({ combatantId: "terminal-actor", moveLoadout: [finisher], types: ["normal"], baseStats: { spe: 80 } });
  const firstTarget = combatant({
    combatantId: "terminal-first",
    moveLoadout: [finisher],
    startingHp: 1,
    initialNextActionRemainingMs: 10_000,
    types: ["normal"],
  });
  const reserve = combatant({ combatantId: "terminal-reserve", moveLoadout: [finisher], types: ["normal"], baseStats: { spe: 100 } });
  const targetSide = id<BattleSideId>("terminal-b");
  return {
    fixtureId: "terminal-replacement-and-post-end",
    metadata: { family: "terminal-replacement" },
    initialBattle: battleInput({
      battleId: "battle:terminal",
      context: resolvedContext,
      sides: [
        side("terminal-a", [actor.combatantId], [actor.combatantId]),
        side(targetSide, [firstTarget.combatantId, reserve.combatantId], [firstTarget.combatantId], 1),
      ],
      combatants: [actor, firstTarget, reserve],
      seed: 29,
    }),
    stimuli: [
      { kind: "useMove", actorId: actor.combatantId, moveId: finisher, targetId: firstTarget.combatantId },
      { kind: "useMove", actorId: actor.combatantId, moveId: finisher, targetId: firstTarget.combatantId },
      { kind: "forcedReplacement", sideId: targetSide, combatantId: reserve.combatantId },
      { kind: "useMove", actorId: reserve.combatantId, moveId: finisher, targetId: actor.combatantId },
      { kind: "advanceTime", toMs: 1 },
      { kind: "forcedReplacement", sideId: id<BattleSideId>("terminal-a"), combatantId: actor.combatantId },
      { kind: "useMove", actorId: reserve.combatantId, moveId: finisher, targetId: actor.combatantId },
    ],
  };
}

export function createTerminalPropertyReplayFixture(options: Readonly<{
  propertyCaseId: string;
  seed: number;
  terminalKind: "win" | "draw";
}>): CombatReplayFixture {
  const idle = id<MoveId>(`terminal-property-idle:${options.terminalKind}`);
  const idleRule: MoveRule = {
    moveId: idle,
    typeId: id<TypeId>("normal"),
    category: "physical",
    targetScope: "singleEnemy",
    moveCooldownMs: 2000,
    power: 1,
    accuracy: "always",
    criticalPolicy: "never",
  };

  if (options.terminalKind === "win") {
    const finisher = id<MoveId>("terminal-property-finisher");
    const resolvedContext = context({
      moveRules: ownRecord([
        [idle, idleRule],
        [finisher, {
          moveId: finisher,
          typeId: id<TypeId>("normal"),
          category: "physical",
          targetScope: "singleEnemy",
          moveCooldownMs: 2000,
          power: 100_000,
          accuracy: "always",
          criticalPolicy: "never",
        }],
      ]),
      abilityRules: ownRecord([]),
      effectRules: ownRecord([]),
      typeChart: ownRecord([["normal", ownRecord([["normal", 1]])]]),
    });
    const actor = combatant({ combatantId: "terminal-property-winner", moveLoadout: [finisher], types: ["normal"] });
    const target = combatant({
      combatantId: "terminal-property-loser",
      moveLoadout: [idle],
      startingHp: 1,
      initialNextActionRemainingMs: 10_000,
      types: ["normal"],
    });
    return {
      fixtureId: `${options.propertyCaseId}:win`,
      metadata: { family: "terminal-property", propertyCaseId: options.propertyCaseId },
      initialBattle: battleInput({
        battleId: `battle:${options.propertyCaseId}:win`,
        context: resolvedContext,
        sides: [
          side("terminal-property-win-a", [actor.combatantId], [actor.combatantId]),
          side("terminal-property-win-b", [target.combatantId], [target.combatantId]),
        ],
        combatants: [actor, target],
        seed: options.seed,
      }),
      stimuli: [
        { kind: "useMove", actorId: actor.combatantId, moveId: finisher, targetId: target.combatantId },
        { kind: "advanceTime", toMs: 1 },
        { kind: "useMove", actorId: actor.combatantId, moveId: finisher, targetId: target.combatantId },
      ],
    };
  }

  const drawAura = id<AbilityId>("terminal-property-draw-aura");
  const drawDot = id<EffectId>("terminal-property-draw-dot");
  const resolvedContext = context({
    moveRules: ownRecord([[idle, idleRule]]),
    abilityRules: ownRecord([[drawAura, {
      abilityId: drawAura,
      reactions: [{
        trigger: "battleStart",
        target: "self",
        order: 1,
        effects: [{ kind: "applyEffect", effectId: drawDot }],
      }],
    }]]),
    effectRules: ownRecord([[drawDot, {
      effectId: drawDot,
      lifetimeScope: "battle",
      stackingPolicy: "refresh",
      durationMs: 5,
      periodic: { kind: "damage", intervalMs: 5, magnitude: { kind: "integer", amount: 1 } },
    }]]),
    typeChart: ownRecord([["normal", ownRecord([["normal", 1]])]]),
  });
  const left = combatant({
    combatantId: "terminal-property-draw-left",
    moveLoadout: [idle],
    startingHp: 1,
    abilityId: drawAura,
    types: ["normal"],
  });
  const right = combatant({
    combatantId: "terminal-property-draw-right",
    moveLoadout: [idle],
    startingHp: 1,
    abilityId: drawAura,
    types: ["normal"],
  });
  return {
    fixtureId: `${options.propertyCaseId}:draw`,
    metadata: { family: "terminal-property", propertyCaseId: options.propertyCaseId },
    initialBattle: battleInput({
      battleId: `battle:${options.propertyCaseId}:draw`,
      context: resolvedContext,
      sides: [
        side("terminal-property-draw-a", [left.combatantId], [left.combatantId]),
        side("terminal-property-draw-b", [right.combatantId], [right.combatantId]),
      ],
      combatants: [left, right],
      seed: options.seed,
    }),
    stimuli: [
      { kind: "advanceTime", toMs: 5 },
      { kind: "advanceTime", toMs: 6 },
      { kind: "useMove", actorId: left.combatantId, moveId: idle, targetId: right.combatantId },
    ],
  };
}

export function createOpaqueIdentifierReplayFixture(): CombatReplayFixture {
  const actorId = id<CombatantId>("__proto__");
  const firstTargetId = id<CombatantId>("a");
  const secondTargetId = id<CombatantId>("a:b");
  const firstMove = id<MoveId>("move\0opaque");
  const secondMove = id<MoveId>("constructor");
  const firstEffect = id<EffectId>("b:c");
  const secondEffect = id<EffectId>("c");
  const move = (moveId: MoveId, effectId: EffectId): MoveRule => ({
    moveId,
    category: "status",
    targetScope: "singleEnemy",
    moveCooldownMs: 2000,
    accuracy: "always",
    effects: [{ kind: "applyEffect", scope: "perResolvedTarget", target: "target", effectId }],
  });
  const resolvedContext = context({
    moveRules: ownRecord([[firstMove, move(firstMove, firstEffect)], [secondMove, move(secondMove, secondEffect)]]),
    abilityRules: ownRecord([]),
    effectRules: ownRecord([
      [firstEffect, { effectId: firstEffect, lifetimeScope: "battle", stackingPolicy: "refresh", durationMs: 5000 }],
      [secondEffect, { effectId: secondEffect, lifetimeScope: "battle", stackingPolicy: "refresh", durationMs: 5000 }],
    ]),
    typeChart: ownRecord([]),
  }, {
    gameDataVersion: "data:opaque\0v1",
    rulesVersion: "rules:constructor",
    combatEventSchemaVersion: "events:__proto__",
  });
  const actor = combatant({ combatantId: actorId, moveLoadout: [firstMove, secondMove] });
  const firstTarget = combatant({ combatantId: firstTargetId, moveLoadout: [firstMove], initialNextActionRemainingMs: 10_000 });
  const secondTarget = combatant({ combatantId: secondTargetId, moveLoadout: [secondMove], initialNextActionRemainingMs: 10_000 });
  return {
    fixtureId: "opaque-identifiers-and-effect-tuples",
    metadata: { family: "opaque-identifiers" },
    initialBattle: battleInput({
      battleId: "battle:opaque\0id",
      context: resolvedContext,
      sides: [side("opaque-a", [actorId], [actorId]), side("opaque-b", [firstTargetId, secondTargetId], [secondTargetId, firstTargetId], 2)],
      combatants: [actor, firstTarget, secondTarget],
      seed: 37,
    }),
    stimuli: [
      { kind: "useMove", actorId, moveId: firstMove, targetId: firstTargetId },
      { kind: "advanceTime", toMs: 2000 },
      { kind: "useMove", actorId, moveId: secondMove, targetId: secondTargetId },
    ],
  };
}

export function createRejectedInitializationReplayFixture(): CombatReplayFixture {
  const unsupported = id<MoveId>("unsupported-status");
  const resolvedContext = context({
    moveRules: ownRecord([[unsupported, {
      moveId: unsupported,
      category: "status",
      targetScope: "self",
      moveCooldownMs: 2000,
      accuracy: "always",
    }]]),
    abilityRules: ownRecord([]),
    effectRules: ownRecord([]),
    typeChart: ownRecord([]),
  });
  const left = combatant({ combatantId: "invalid-left", moveLoadout: [unsupported] });
  const right = combatant({ combatantId: "invalid-right", moveLoadout: [unsupported] });
  return {
    fixtureId: "fail-closed-invalid-status-context",
    metadata: { family: "fail-closed" },
    initialBattle: battleInput({
      battleId: "battle:invalid-context",
      context: resolvedContext,
      sides: [side("invalid-a", [left.combatantId], [left.combatantId]), side("invalid-b", [right.combatantId], [right.combatantId])],
      combatants: [left, right],
      seed: 41,
    }),
    stimuli: [],
  };
}

const CADENCE_IDENTITY = "cadence\0player:constructor";

export function cadenceFixtureParticipant(kind: "pokemonInstance" | "nonPlayer" = "pokemonInstance"): CadenceParticipant {
  return kind === "pokemonInstance"
    ? { kind, identity: id<PokemonInstanceId>(CADENCE_IDENTITY) }
    : { kind, identity: id<NonPlayerCadenceIdentity>(CADENCE_IDENTITY) };
}

function cadenceContext(): ResolvedCombatContext {
  const mark = id<MoveId>("cadence-mark");
  const finish = id<MoveId>("cadence-finish");
  const burn = id<EffectId>("cadence:burn\0effect");
  return context({
    moveRules: ownRecord([
      [mark, {
        moveId: mark,
        category: "status",
        targetScope: "self",
        moveCooldownMs: 2000,
        accuracy: "always",
        effects: [
          { kind: "statStage", scope: "oncePerAction", target: "self", stat: "atk", delta: 3 },
          { kind: "applyEffect", scope: "oncePerAction", target: "self", effectId: burn },
        ],
      }],
      [finish, {
        moveId: finish,
        typeId: id<TypeId>("normal"),
        category: "physical",
        targetScope: "singleEnemy",
        moveCooldownMs: 10_000,
        power: 100_000,
        accuracy: "always",
        criticalPolicy: "never",
      }],
    ]),
    abilityRules: ownRecord([]),
    effectRules: ownRecord([[burn, {
      effectId: burn,
      lifetimeScope: "cadence",
      stackingPolicy: "refresh",
      durationMs: 5000,
      periodic: { kind: "damage", intervalMs: 2500, magnitude: { kind: "integer", amount: 2 } },
    }]]),
    typeChart: ownRecord([["normal", ownRecord([["normal", 1]])]]),
  }, {
    gameDataVersion: "cadence-data-v1",
    rulesVersion: "cadence-rules-v1",
    combatEventSchemaVersion: "cadence-events-v1",
  });
}

export function createCadenceSourceReplayFixture(): CombatReplayFixture {
  const resolvedContext = cadenceContext();
  const mark = id<MoveId>("cadence-mark");
  const finish = id<MoveId>("cadence-finish");
  const participant = cadenceFixtureParticipant();
  const actor = combatant({
    combatantId: "cadence-source-actor",
    moveLoadout: [mark, finish],
    startingHp: 70,
    cadenceParticipant: participant,
    types: ["normal"],
  });
  const target = combatant({
    combatantId: "cadence-source-target",
    moveLoadout: [finish],
    startingHp: 1,
    initialNextActionRemainingMs: 10_000,
    types: ["normal"],
  });
  const participantKey = cadenceParticipantKey(participant);
  return {
    fixtureId: "cadence-source-battle",
    metadata: { family: "cadence-continuation" },
    initialBattle: battleInput({
      battleId: "battle:cadence-source",
      context: resolvedContext,
      sides: [side("cadence-a", [actor.combatantId], [actor.combatantId]), side("cadence-b", [target.combatantId], [target.combatantId])],
      combatants: [actor, target],
      seed: 43,
      cadenceBindings: ownRecord([[participantKey, actor.combatantId]]) as BattleInitInput["cadenceBindings"],
    }),
    stimuli: [
      { kind: "useMove", actorId: actor.combatantId, moveId: mark },
      { kind: "advanceTime", toMs: 2000 },
      { kind: "useMove", actorId: actor.combatantId, moveId: finish, targetId: target.combatantId },
    ],
  };
}

export function createCadenceRebindReplayFixture(options: Readonly<{
  cadenceCarry: CadenceCarryState;
  deterministicState: DeterministicState;
  participant?: CadenceParticipant;
  actorId?: string;
}>): CombatReplayFixture {
  const resolvedContext = cadenceContext();
  const participant = options.participant ?? cadenceFixtureParticipant();
  const participantKey = cadenceParticipantKey(participant);
  const readiness = options.cadenceCarry.readinessByParticipant[participantKey];
  const carriedHp = options.cadenceCarry.hpByParticipant[participantKey];
  const actorId = options.actorId ?? "cadence-rebound-actor";
  const moveLoadout = readiness?.moveLoadout ?? [id<MoveId>("cadence-mark"), id<MoveId>("cadence-finish")];
  const actor = combatant({
    combatantId: actorId,
    moveLoadout,
    startingHp: carriedHp ?? 1,
    initialNextActionRemainingMs: readiness?.nextActionRemainingMs ?? 0,
    initialMoveCooldownRemainingMs: readiness?.moveCooldownRemainingMs,
    cadenceParticipant: participant,
    types: ["normal"],
  });
  const target = combatant({
    combatantId: "cadence-rebound-target",
    moveLoadout: [id<MoveId>("cadence-finish")],
    startingHp: 70,
    initialNextActionRemainingMs: 10_000,
    types: ["normal"],
  });
  return {
    fixtureId: `cadence-rebind:${participant.kind}`,
    metadata: { family: "cadence-continuation" },
    initialBattle: battleInput({
      battleId: "battle:cadence-rebind",
      context: resolvedContext,
      sides: [side("cadence-rebind-a", [actor.combatantId], [actor.combatantId]), side("cadence-rebind-b", [target.combatantId], [target.combatantId])],
      combatants: [actor, target],
      seed: 1,
      deterministicState: options.deterministicState,
      cadenceCarry: options.cadenceCarry,
      cadenceBindings: ownRecord([[participantKey, actor.combatantId]]) as BattleInitInput["cadenceBindings"],
    }),
    stimuli: [{ kind: "advanceTime", toMs: 2500 }],
  };
}

export const REPLAY_REGRESSION_FIXTURES: ReadonlyArray<CombatReplayFixture> = [
  createReadinessReplayFixture(),
  createTerminalReplacementReplayFixture(),
  createOpaqueIdentifierReplayFixture(),
  createRejectedInitializationReplayFixture(),
];
