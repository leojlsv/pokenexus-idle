import type {
  AbilityId,
  BattleId,
  CombatantId,
  EffectId,
  MoveId,
  PokemonInstanceId,
  SpeciesId,
  StatBlock,
  TypeId,
} from "@pokenexus/game-types";

export type {
  AbilityId,
  BattleId,
  CombatantId,
  EffectId,
  MoveId,
  PokemonInstanceId,
  SpeciesId,
  StatBlock,
  TypeId,
} from "@pokenexus/game-types";

type NominalId<Brand extends string> = string & { readonly __brand: Brand };

export type BattleSideId = NominalId<"BattleSideId">;
export type GameDataVersion = NominalId<"GameDataVersion">;
export type RulesVersion = NominalId<"RulesVersion">;
export type CombatEventSchemaVersion = NominalId<"CombatEventSchemaVersion">;
export type NonPlayerCadenceIdentity = NominalId<"NonPlayerCadenceIdentity">;
export type LifetimeScope = "battle" | "cadence";
export type EffectStackingPolicy = "replace" | "refresh" | "stack";
export type EffectTarget = "self" | "target";
export type EffectExecutionScope = "perResolvedTarget" | "oncePerAction";
export type AbilityReactionTrigger =
  | "battleStart"
  | "afterDirectDamageDealt"
  | "afterDirectDamageTaken"
  | "afterContactDealt"
  | "afterContactReceived";
export type AbilityReactionTarget = "self" | "counterpart";
export type AbilityEffectInstruction =
  | { kind: "heal"; magnitude: EffectMagnitude }
  | { kind: "statStage"; stat: StageStat; delta: number }
  | { kind: "actionLock"; durationMs: number; lifetimeScope: LifetimeScope }
  | { kind: "applyEffect"; effectId: EffectId }
  | { kind: "removeEffect"; effectId: EffectId };
export type AbilityReaction = {
  trigger: AbilityReactionTrigger;
  target: AbilityReactionTarget;
  order: number;
  effects: ReadonlyArray<AbilityEffectInstruction>;
};
export type CadenceParticipant =
  | { kind: "pokemonInstance"; identity: PokemonInstanceId }
  | { kind: "nonPlayer"; identity: NonPlayerCadenceIdentity };
export type CadenceParticipantKey = NominalId<"CadenceParticipantKey">;

export function cadenceParticipantKey(participant: CadenceParticipant): CadenceParticipantKey {
  return JSON.stringify([participant.kind, participant.identity]) as CadenceParticipantKey;
}

export function battleEffectKey(targetCombatantId: CombatantId, effectId: EffectId): string {
  return JSON.stringify([targetCombatantId, effectId]);
}

export type MoveCategory = "physical" | "special" | "status";
export type TargetScope =
  | "self"
  | "singleAlly"
  | "singleEnemy"
  | "allAllies"
  | "allEnemies"
  | "allActive";
export type CriticalPolicy = "normal" | "always" | "never";
export type StageStat = "atk" | "def" | "spa" | "spd" | "spe";
export type StageBlock = Record<StageStat, number>;

export type MoveRule = {
  moveId: MoveId;
  typeId?: TypeId;
  category: MoveCategory;
  targetScope: TargetScope;
  moveCooldownMs: number;
  power?: number;
  accuracy?: number | "always";
  criticalPolicy?: CriticalPolicy;
  makesContact?: boolean;
  effects?: ReadonlyArray<EffectInstruction>;
};

export type AbilityRule = {
  abilityId: AbilityId;
  reactions?: ReadonlyArray<AbilityReaction>;
};

export type EffectMagnitude =
  | { kind: "integer"; amount: number }
  | { kind: "maxHpFraction"; numerator: number; denominator: number };

export type EffectInstruction =
  | { kind: "heal"; scope: EffectExecutionScope; target: EffectTarget; magnitude: EffectMagnitude }
  | { kind: "statStage"; scope: EffectExecutionScope; target: EffectTarget; stat: StageStat; delta: number }
  | { kind: "actionLock"; scope: EffectExecutionScope; target: EffectTarget; durationMs: number; lifetimeScope: LifetimeScope }
  | { kind: "applyEffect"; scope: EffectExecutionScope; target: EffectTarget; effectId: EffectId }
  | { kind: "removeEffect"; scope: EffectExecutionScope; target: EffectTarget; effectId: EffectId };

export type EffectRule = {
  effectId: EffectId;
  lifetimeScope: LifetimeScope;
  stackingPolicy: EffectStackingPolicy;
  durationMs: number;
  periodic?: {
    kind: "damage" | "healing";
    intervalMs: number;
    magnitude: EffectMagnitude;
  };
  maxStacks?: number;
};

export type ActiveEffect = {
  effectId: EffectId;
  targetCombatantId: CombatantId;
  targetCadenceParticipant?: CadenceParticipant;
  lifetimeScope: LifetimeScope;
  stackingPolicy: EffectStackingPolicy;
  applicationSequence: number;
  scheduleRevision: number;
  appliedAtMs: number;
  expiresAtMs: number;
  nextTickAtMs?: number;
  stacks: number;
};

export type CadenceEffectCarry = {
  effectId: EffectId;
  targetCadenceParticipant: CadenceParticipant;
  lifetimeScope: "cadence";
  stackingPolicy: EffectStackingPolicy;
  applicationSequence: number;
  scheduleRevision: number;
  remainingDurationMs: number;
  remainingToNextTickMs?: number;
  stacks: number;
};

export type CadenceCarryState = {
  effects: ReadonlyArray<CadenceEffectCarry>;
  hpByParticipant: Readonly<Record<CadenceParticipantKey, number>>;
  maxHpByParticipant: Readonly<Record<CadenceParticipantKey, number>>;
  readinessByParticipant: Readonly<Record<CadenceParticipantKey, CadenceReadinessCarry>>;
  actionLockRemainingMsByParticipant: Readonly<Record<CadenceParticipantKey, number>>;
};
export type CadenceReadinessCarry = {
  participant: CadenceParticipant;
  moveLoadout: ReadonlyArray<MoveId>;
  nextActionRemainingMs: number;
  moveCooldownRemainingMs: Readonly<Record<string, number>>;
};

export type TypeEffectivenessValue = 0 | 0.5 | 1 | 2;

export type ResolvedCombatContext = {
  gameDataVersion: GameDataVersion;
  rulesVersion: RulesVersion;
  combatEventSchemaVersion: CombatEventSchemaVersion;
  moveRules: Readonly<Record<string, MoveRule>>;
  abilityRules: Readonly<Record<string, AbilityRule>>;
  effectRules: Readonly<Record<string, EffectRule>>;
  typeChart: Readonly<Record<string, Readonly<Record<string, TypeEffectivenessValue>>>>;
};

export type DeterministicRngState = {
  algorithm: "xorshift32-v1";
  state: number;
};

export type DeterministicState = {
  rng: DeterministicRngState;
};

export type BattleSideInit = {
  sideId: BattleSideId;
  activeCapacity: number;
  combatantIds: ReadonlyArray<CombatantId>;
  initialActiveCombatantIds: ReadonlyArray<CombatantId>;
};

export type BattleCombatantInit = {
  combatantId: CombatantId;
  speciesId: SpeciesId;
  level: number;
  baseStats: StatBlock<number>;
  ivs: StatBlock<number>;
  types: ReadonlyArray<TypeId>;
  startingHp: number;
  moveLoadout: ReadonlyArray<MoveId>;
  initialNextActionRemainingMs: number;
  initialMoveCooldownRemainingMs: Readonly<Record<string, number>>;
  abilityId?: AbilityId;
  cadenceParticipant?: CadenceParticipant;
};

export type BattleInitInput = {
  battleId: BattleId;
  context: ResolvedCombatContext;
  sides: ReadonlyArray<BattleSideInit>;
  combatants: ReadonlyArray<BattleCombatantInit>;
  deterministicState: DeterministicState;
  cadenceBindings?: Readonly<Record<CadenceParticipantKey, CombatantId>>;
  cadenceCarry?: CadenceCarryState;
};

export type BattleCombatantState = {
  combatantId: CombatantId;
  sideId: BattleSideId;
  speciesId: SpeciesId;
  level: number;
  types: ReadonlyArray<TypeId>;
  maxHp: number;
  derivedStats: StatBlock<number>;
  currentHp: number;
  moveLoadout: ReadonlyArray<MoveId>;
  nextActionAtMs: number;
  moveReadyAtMs: Readonly<Record<string, number>>;
  stages: Readonly<StageBlock>;
  actionLockExpiresAtMsByScope?: Readonly<Partial<Record<LifetimeScope, number>>>;
  abilityId?: AbilityId;
  cadenceParticipant?: CadenceParticipant;
};

export type BattleSideState = {
  sideId: BattleSideId;
  activeCapacity: number;
  combatantIds: ReadonlyArray<CombatantId>;
  activeCombatantIds: ReadonlyArray<CombatantId>;
};

export type BattleState = {
  battleId: BattleId;
  context: ResolvedCombatContext;
  combatTimeMs: number;
  eventSequence: number;
  status: "active" | "ended";
  sides: ReadonlyArray<BattleSideState>;
  combatants: Readonly<Record<string, BattleCombatantState>>;
  replacementPendingSideIds: ReadonlyArray<BattleSideId>;
  effects: Readonly<Record<string, ActiveEffect>>;
  nextEffectApplicationSequence: number;
};

export type CombatEventBase = {
  sequence: number;
  combatTimeMs: number;
};

export type CombatEvent =
  | (CombatEventBase & {
      kind: "BattleStarted";
      battleId: BattleId;
    })
  | (CombatEventBase & {
      kind: "MoveUsed";
      actorId: CombatantId;
      moveId: MoveId;
      targetIds: ReadonlyArray<CombatantId>;
    })
  | (CombatEventBase & {
      kind: "MoveMissed";
      actorId: CombatantId;
      moveId: MoveId;
      targetId: CombatantId;
    })
  | (CombatEventBase & {
      kind: "MoveImmune";
      actorId: CombatantId;
      moveId: MoveId;
      targetId: CombatantId;
    })
  | (CombatEventBase & {
      kind: "CriticalHit";
      actorId: CombatantId;
      moveId: MoveId;
      targetId: CombatantId;
    })
  | (CombatEventBase & {
      kind: "DamageApplied";
      source: "move" | "effect";
      actorId?: CombatantId;
      moveId?: MoveId;
      targetId: CombatantId;
      amount: number;
      resultingHp: number;
    })
  | (CombatEventBase & {
      kind: "CombatantKO";
      combatantId: CombatantId;
    })
  | (CombatEventBase & {
      kind: "CombatantActivated";
      sideId: BattleSideId;
      combatantId: CombatantId;
    })
  | (CombatEventBase & {
      kind: "BattleEnded";
      outcome: { kind: "win"; winnerSideId: BattleSideId } | { kind: "draw" };
    })
  | (CombatEventBase & {
      kind: "EffectApplied";
      effectId: EffectId;
      targetId: CombatantId;
      stacks?: number;
    })
  | (CombatEventBase & {
      kind: "EffectUpdated";
      effectId: EffectId;
      targetId: CombatantId;
      stacks?: number;
    })
  | (CombatEventBase & {
      kind: "EffectRemoved";
      effectId: EffectId;
      targetId: CombatantId;
    })
  | (CombatEventBase & {
      kind: "EffectTicked";
      effectId: EffectId;
      targetId: CombatantId;
      consequence: "damage" | "healing";
      amount: number;
      resultingHp: number;
    })
  | (CombatEventBase & {
      kind: "HealingApplied";
      targetId: CombatantId;
      amount: number;
      resultingHp: number;
    })
  | (CombatEventBase & {
      kind: "StatStageChanged";
      targetId: CombatantId;
      stat: StageStat;
      requestedDelta: number;
      appliedDelta: number;
      resultingStage: number;
    });

export type UseMoveIntent = {
  kind: "useMove";
  actorId: CombatantId;
  moveId: MoveId;
  targetId?: CombatantId;
};

export type AdvanceTimeStimulus = { kind: "advanceTime"; toMs: number };
export type ForcedReplacementIntent = { kind: "forcedReplacement"; sideId: BattleSideId; combatantId: CombatantId };
export type CombatStimulus = UseMoveIntent | AdvanceTimeStimulus | ForcedReplacementIntent;

export type TransitionAccepted = {
  accepted: true;
  state: BattleState;
  deterministicState: DeterministicState;
  events: ReadonlyArray<CombatEvent>;
};

export type TransitionRejected = {
  accepted: false;
  reason: string;
  state?: BattleState;
  deterministicState: DeterministicState;
  events: ReadonlyArray<CombatEvent>;
};

export type TransitionResult = TransitionAccepted | TransitionRejected;
export type BattleInitResult = TransitionAccepted | TransitionRejected;

export type CadenceConsequence = {
  kind: "tick" | "expiry" | "damage" | "healing" | "ko";
  targetCadenceParticipant: CadenceParticipant;
  effectId?: EffectId;
  amount?: number;
  resultingHp?: number;
};

export type CadenceAdvanceResult = {
  accepted: true;
  cadence: CadenceCarryState;
  deterministicState: DeterministicState;
  consequences: ReadonlyArray<CadenceConsequence>;
} | {
  accepted: false;
  reason: string;
  cadence: CadenceCarryState;
  deterministicState: DeterministicState;
  consequences: ReadonlyArray<CadenceConsequence>;
};
