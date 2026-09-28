import type { CombatEvent, CombatEventSchemaVersion } from "@pokenexus/game-core";

export const COMBAT_PRESENTATION_SCHEMA_VERSION_V1 = "pokenexus.combat-presentation.v1" as const;

export type CombatPresentationSchemaVersionV1 = typeof COMBAT_PRESENTATION_SCHEMA_VERSION_V1;

export type CombatPresentationBootstrapParticipantSourceV1 =
  | {
      readonly kind: "owned";
      readonly combatantId: string;
      readonly sideId: string;
      readonly pokemonInstanceId: string;
      readonly speciesId: string;
      readonly level: number;
      readonly shiny: boolean;
      readonly currentHp: number;
      readonly maxHp: number;
    }
  | {
      readonly kind: "wild";
      readonly combatantId: string;
      readonly sideId: string;
      readonly speciesId: string;
      readonly level: number;
      readonly shiny: boolean;
      readonly state: "conscious" | "ko";
    };

export type CombatPresentationParticipantV1 =
  | {
      readonly combatantId: string;
      readonly sideId: string;
      readonly identity: {
        readonly kind: "owned_pokemon";
        readonly pokemonInstanceId: string;
        readonly speciesId: string;
        readonly level: number;
        readonly shiny: boolean;
      };
      readonly vitality: {
        readonly visibility: "exact";
        readonly state: "conscious" | "ko";
        readonly currentHp: number;
        readonly maxHp: number;
      };
    }
  | {
      readonly combatantId: string;
      readonly sideId: string;
      readonly identity: {
        readonly kind: "wild_pokemon";
        readonly speciesId: string;
        readonly level: number;
        readonly shiny: boolean;
      };
      /**
       * Wild v1 vitality is deliberately non-proportional. Renderers may show conscious/KO only;
       * they must not synthesize a bar, percentage, bucket or threshold from hidden HP.
       */
      readonly vitality: {
        readonly visibility: "hidden";
        readonly state: "conscious" | "ko";
      };
    };

export interface CombatPresentationSideV1 {
  readonly sideId: string;
  readonly combatantIds: ReadonlyArray<string>;
  readonly activeCombatantIds: ReadonlyArray<string>;
}

export type CombatPresentationSideSourceV1 = CombatPresentationSideV1;

export type CombatPresentationHpChangeV1 =
  | {
      readonly visibility: "exact";
      readonly amount: number;
      readonly resultingHp: number;
    }
  | {
      readonly visibility: "hidden";
    };

type CombatPresentationEventBaseV1 = {
  readonly sequence: number;
  readonly combatTimeMs: number;
};

export type CombatPresentationEventV1 =
  | (CombatPresentationEventBaseV1 & { readonly kind: "BattleStarted"; readonly battleId: string })
  | (CombatPresentationEventBaseV1 & {
      readonly kind: "MoveUsed";
      readonly actorId: string;
      readonly moveId: string;
      readonly targetIds: ReadonlyArray<string>;
    })
  | (CombatPresentationEventBaseV1 & {
      readonly kind: "MoveMissed" | "MoveImmune" | "CriticalHit";
      readonly actorId: string;
      readonly moveId: string;
      readonly targetId: string;
    })
  | (CombatPresentationEventBaseV1 & {
      readonly kind: "DamageApplied";
      readonly source: "move" | "effect";
      readonly actorId?: string;
      readonly moveId?: string;
      readonly targetId: string;
      readonly hpChange: CombatPresentationHpChangeV1;
    })
  | (CombatPresentationEventBaseV1 & { readonly kind: "CombatantKO"; readonly combatantId: string })
  | (CombatPresentationEventBaseV1 & {
      readonly kind: "CombatantActivated";
      readonly sideId: string;
      readonly combatantId: string;
    })
  | (CombatPresentationEventBaseV1 & {
      readonly kind: "BattleEnded";
      readonly outcome: { readonly kind: "win"; readonly winnerSideId: string } | { readonly kind: "draw" };
    })
  | (CombatPresentationEventBaseV1 & {
      readonly kind: "EffectApplied" | "EffectUpdated";
      readonly effectId: string;
      readonly targetId: string;
      readonly stacks?: number;
    })
  | (CombatPresentationEventBaseV1 & {
      readonly kind: "EffectRemoved";
      readonly effectId: string;
      readonly targetId: string;
    })
  | (CombatPresentationEventBaseV1 & {
      readonly kind: "EffectTicked";
      readonly effectId: string;
      readonly targetId: string;
      readonly consequence: "damage" | "healing";
      readonly hpChange: CombatPresentationHpChangeV1;
    })
  | (CombatPresentationEventBaseV1 & {
      readonly kind: "HealingApplied";
      readonly targetId: string;
      readonly hpChange: CombatPresentationHpChangeV1;
    })
  | (CombatPresentationEventBaseV1 & {
      readonly kind: "StatStageChanged";
      readonly targetId: string;
      readonly stat: "atk" | "def" | "spa" | "spd" | "spe";
      readonly requestedDelta: number;
      readonly appliedDelta: number;
      readonly resultingStage: number;
    });

export interface CombatPresentationBootstrapInputV1 {
  readonly battleId: string;
  readonly combatEventSchemaVersion: CombatEventSchemaVersion;
  readonly sides: ReadonlyArray<CombatPresentationSideSourceV1>;
  /** Battle-origin identities and owned HP. This snapshot is accepted only by the bootstrap projector. */
  readonly participants: ReadonlyArray<CombatPresentationBootstrapParticipantSourceV1>;
  /** Must start with the authoritative BattleStarted origin event. */
  readonly events: ReadonlyArray<CombatEvent>;
}

export interface CombatPresentationBootstrapEnvelopeV1 {
  readonly kind: "bootstrap";
  readonly schemaVersion: CombatPresentationSchemaVersionV1;
  readonly sourceCombatEventSchemaVersion: string;
  readonly battleId: string;
  readonly initialSides: ReadonlyArray<CombatPresentationSideV1>;
  readonly initialParticipants: ReadonlyArray<CombatPresentationParticipantV1>;
  readonly events: ReadonlyArray<CombatPresentationEventV1>;
}

export interface CombatPresentationContinuationEnvelopeV1 {
  readonly kind: "continuation";
  readonly schemaVersion: CombatPresentationSchemaVersionV1;
  readonly sourceCombatEventSchemaVersion: string;
  readonly battleId: string;
  /** Continuations deliberately contain no participant/snapshot field. */
  readonly events: ReadonlyArray<CombatPresentationEventV1>;
}

export type CombatPresentationEnvelopeV1 =
  | CombatPresentationBootstrapEnvelopeV1
  | CombatPresentationContinuationEnvelopeV1;

export interface CombatPresentationParticipantBindingV1 {
  readonly kind: "owned" | "wild";
  readonly combatantId: string;
  readonly sideId: string;
}

/**
 * Producer-side cursor for projecting later authoritative event segments.
 * It intentionally excludes currentHp/maxHp and all display identities so continuation projection cannot
 * republish a fresh owned-HP snapshot and create a cross-batch differential oracle.
 */
export interface CombatPresentationContinuationContextV1 {
  readonly schemaVersion: CombatPresentationSchemaVersionV1;
  readonly battleId: string;
  readonly sourceCombatEventSchemaVersion: string;
  readonly participantBindings: ReadonlyArray<CombatPresentationParticipantBindingV1>;
  readonly lastSequence: number;
  readonly lastCombatTimeMs: number;
}

export interface CombatPresentationContinuationInputV1 {
  readonly context: CombatPresentationContinuationContextV1;
  readonly events: ReadonlyArray<CombatEvent>;
}

export interface CombatPresentationBootstrapResultV1 {
  readonly envelope: CombatPresentationBootstrapEnvelopeV1;
  readonly continuationContext: CombatPresentationContinuationContextV1;
}

export interface CombatPresentationContinuationResultV1 {
  readonly envelope: CombatPresentationContinuationEnvelopeV1;
  readonly continuationContext: CombatPresentationContinuationContextV1;
}

function assertNonEmptyString(value: string, label: string): void {
  if (value.length === 0) throw new Error(`${label} must not be empty`);
}

function assertSafeInteger(value: number, label: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a safe integer >= ${minimum}`);
  }
}

function projectBootstrapParticipant(
  source: CombatPresentationBootstrapParticipantSourceV1,
): CombatPresentationParticipantV1 {
  assertNonEmptyString(source.combatantId, "combatantId");
  assertNonEmptyString(source.sideId, "sideId");
  assertNonEmptyString(source.speciesId, "speciesId");
  assertSafeInteger(source.level, "level", 1);
  if (typeof source.shiny !== "boolean") throw new Error("shiny must be boolean");

  if (source.kind === "wild") {
    if (source.state !== "conscious" && source.state !== "ko") {
      throw new Error("wild vitality state must be conscious or ko");
    }
    return {
      combatantId: source.combatantId,
      sideId: source.sideId,
      identity: {
        kind: "wild_pokemon",
        speciesId: source.speciesId,
        level: source.level,
        shiny: source.shiny,
      },
      vitality: { visibility: "hidden", state: source.state },
    };
  }

  assertNonEmptyString(source.pokemonInstanceId, "pokemonInstanceId");
  assertSafeInteger(source.currentHp, "currentHp");
  assertSafeInteger(source.maxHp, "maxHp", 1);
  if (source.currentHp > source.maxHp) throw new Error("currentHp must not exceed maxHp");
  return {
    combatantId: source.combatantId,
    sideId: source.sideId,
    identity: {
      kind: "owned_pokemon",
      pokemonInstanceId: source.pokemonInstanceId,
      speciesId: source.speciesId,
      level: source.level,
      shiny: source.shiny,
    },
    vitality: {
      visibility: "exact",
      state: source.currentHp === 0 ? "ko" : "conscious",
      currentHp: source.currentHp,
      maxHp: source.maxHp,
    },
  };
}

function assertNever(value: never): never {
  throw new Error(`Unsupported authoritative CombatEvent kind: ${String((value as { kind?: unknown }).kind)}`);
}

function bindingsMap(
  bindings: ReadonlyArray<CombatPresentationParticipantBindingV1>,
): ReadonlyMap<string, CombatPresentationParticipantBindingV1> {
  const byId = new Map<string, CombatPresentationParticipantBindingV1>();
  for (const binding of bindings) {
    assertNonEmptyString(binding.combatantId, "combatantId");
    assertNonEmptyString(binding.sideId, "sideId");
    if (binding.kind !== "owned" && binding.kind !== "wild") throw new Error("invalid participant binding kind");
    if (byId.has(binding.combatantId)) throw new Error(`duplicate presentation combatantId: ${binding.combatantId}`);
    byId.set(binding.combatantId, binding);
  }
  return byId;
}

function requireBinding(
  bindings: ReadonlyMap<string, CombatPresentationParticipantBindingV1>,
  combatantId: string,
): CombatPresentationParticipantBindingV1 {
  const binding = bindings.get(combatantId);
  if (!binding) throw new Error(`CombatEvent references unknown combatantId: ${combatantId}`);
  return binding;
}

function projectInitialSides(
  sources: ReadonlyArray<CombatPresentationSideSourceV1>,
  bootstrapParticipants: ReadonlyMap<string, CombatPresentationBootstrapParticipantSourceV1>,
): ReadonlyArray<CombatPresentationSideV1> {
  const sideIds = new Set<string>();
  const assignedCombatants = new Set<string>();
  const projected = sources.map((side) => {
    assertNonEmptyString(side.sideId, "sideId");
    if (sideIds.has(side.sideId)) throw new Error(`duplicate presentation sideId: ${side.sideId}`);
    sideIds.add(side.sideId);
    if (side.combatantIds.length === 0) throw new Error("presentation side must contain at least one combatant");

    const roster = new Set<string>();
    for (const combatantId of side.combatantIds) {
      if (roster.has(combatantId)) throw new Error(`duplicate side combatantId: ${combatantId}`);
      if (assignedCombatants.has(combatantId)) throw new Error(`combatantId appears in multiple sides: ${combatantId}`);
      const participant = bootstrapParticipants.get(combatantId);
      if (!participant) throw new Error(`side references unknown combatantId: ${combatantId}`);
      if (participant.sideId !== side.sideId) throw new Error(`participant sideId mismatch: ${combatantId}`);
      roster.add(combatantId);
      assignedCombatants.add(combatantId);
    }

    const active = new Set<string>();
    for (const combatantId of side.activeCombatantIds) {
      if (active.has(combatantId)) throw new Error(`duplicate active combatantId: ${combatantId}`);
      if (!roster.has(combatantId)) throw new Error(`active combatant is absent from side roster: ${combatantId}`);
      const participant = bootstrapParticipants.get(combatantId);
      if (!participant) throw new Error(`active combatant is unknown: ${combatantId}`);
      const conscious = participant.kind === "owned" ? participant.currentHp > 0 : participant.state === "conscious";
      if (!conscious) throw new Error(`initial active combatant must be conscious: ${combatantId}`);
      active.add(combatantId);
    }
    return { sideId: side.sideId, combatantIds: [...side.combatantIds], activeCombatantIds: [...side.activeCombatantIds] };
  });

  for (const combatantId of bootstrapParticipants.keys()) {
    if (!assignedCombatants.has(combatantId)) throw new Error(`participant is absent from side rosters: ${combatantId}`);
  }
  return projected;
}

function projectHpChange(
  bindings: ReadonlyMap<string, CombatPresentationParticipantBindingV1>,
  targetId: string,
  amount: number,
  resultingHp: number,
  exactAllowed: boolean,
): CombatPresentationHpChangeV1 {
  const target = requireBinding(bindings, targetId);
  if (target.kind === "wild" || !exactAllowed) return { visibility: "hidden" };
  assertSafeInteger(amount, "owned HP change amount");
  assertSafeInteger(resultingHp, "owned resultingHp");
  return { visibility: "exact", amount, resultingHp };
}

function projectStageStat(
  stat: Extract<CombatEvent, { kind: "StatStageChanged" }>["stat"],
): Extract<CombatPresentationEventV1, { kind: "StatStageChanged" }>["stat"] {
  switch (stat) {
    case "atk":
    case "def":
    case "spa":
    case "spd":
    case "spe":
      return stat;
    default: {
      const unsupported: never = stat;
      throw new Error(`Unsupported authoritative stage stat: ${String(unsupported)}`);
    }
  }
}

function projectEvent(
  event: CombatEvent,
  battleId: string,
  bindings: ReadonlyMap<string, CombatPresentationParticipantBindingV1>,
  sideIds: ReadonlySet<string>,
): CombatPresentationEventV1 {
  const base = { sequence: event.sequence, combatTimeMs: event.combatTimeMs };
  switch (event.kind) {
    case "BattleStarted":
      if (event.battleId !== battleId) throw new Error("BattleStarted battleId does not match presentation battle");
      return { ...base, kind: event.kind, battleId: event.battleId };
    case "MoveUsed":
      requireBinding(bindings, event.actorId);
      event.targetIds.forEach((targetId) => requireBinding(bindings, targetId));
      return { ...base, kind: event.kind, actorId: event.actorId, moveId: event.moveId, targetIds: [...event.targetIds] };
    case "MoveMissed":
    case "MoveImmune":
    case "CriticalHit":
      requireBinding(bindings, event.actorId);
      requireBinding(bindings, event.targetId);
      return { ...base, kind: event.kind, actorId: event.actorId, moveId: event.moveId, targetId: event.targetId };
    case "DamageApplied": {
      const actor = event.actorId === undefined ? null : requireBinding(bindings, event.actorId);
      const target = requireBinding(bindings, event.targetId);
      const hpChange = projectHpChange(
        bindings,
        event.targetId,
        event.amount,
        event.resultingHp,
        actor?.kind === "owned" && target.kind === "owned",
      );
      return {
        ...base,
        kind: event.kind,
        source: event.source,
        ...(event.actorId !== undefined ? { actorId: event.actorId } : {}),
        ...(event.moveId !== undefined ? { moveId: event.moveId } : {}),
        targetId: event.targetId,
        hpChange,
      };
    }
    case "CombatantKO":
      requireBinding(bindings, event.combatantId);
      return { ...base, kind: event.kind, combatantId: event.combatantId };
    case "CombatantActivated": {
      const binding = requireBinding(bindings, event.combatantId);
      if (binding.sideId !== event.sideId) throw new Error("CombatantActivated sideId does not match participant");
      return { ...base, kind: event.kind, sideId: event.sideId, combatantId: event.combatantId };
    }
    case "BattleEnded":
      if (event.outcome.kind === "draw") return { ...base, kind: event.kind, outcome: { kind: "draw" } };
      if (!sideIds.has(event.outcome.winnerSideId)) throw new Error("BattleEnded winnerSideId is unknown");
      return { ...base, kind: event.kind, outcome: { kind: "win", winnerSideId: event.outcome.winnerSideId } };
    case "EffectApplied":
    case "EffectUpdated":
      requireBinding(bindings, event.targetId);
      return {
        ...base,
        kind: event.kind,
        effectId: event.effectId,
        targetId: event.targetId,
        ...(event.stacks !== undefined ? { stacks: event.stacks } : {}),
      };
    case "EffectRemoved":
      requireBinding(bindings, event.targetId);
      return { ...base, kind: event.kind, effectId: event.effectId, targetId: event.targetId };
    case "EffectTicked":
      return {
        ...base,
        kind: event.kind,
        effectId: event.effectId,
        targetId: event.targetId,
        consequence: event.consequence,
        hpChange: projectHpChange(bindings, event.targetId, event.amount, event.resultingHp, false),
      };
    case "HealingApplied":
      return {
        ...base,
        kind: event.kind,
        targetId: event.targetId,
        hpChange: projectHpChange(bindings, event.targetId, event.amount, event.resultingHp, false),
      };
    case "StatStageChanged":
      requireBinding(bindings, event.targetId);
      return {
        ...base,
        kind: event.kind,
        targetId: event.targetId,
        stat: projectStageStat(event.stat),
        requestedDelta: event.requestedDelta,
        appliedDelta: event.appliedDelta,
        resultingStage: event.resultingStage,
      };
    default:
      return assertNever(event);
  }
}

function projectEventBatch(
  events: ReadonlyArray<CombatEvent>,
  battleId: string,
  bindings: ReadonlyMap<string, CombatPresentationParticipantBindingV1>,
  sideIds: ReadonlySet<string>,
  previousSequence: number,
  previousCombatTimeMs: number,
  allowBattleStarted: boolean,
): {
  readonly events: ReadonlyArray<CombatPresentationEventV1>;
  readonly lastSequence: number;
  readonly lastCombatTimeMs: number;
} {
  let lastSequence = previousSequence;
  let lastCombatTimeMs = previousCombatTimeMs;
  const projected = events.map((event) => {
    assertSafeInteger(event.sequence, "CombatEvent.sequence", 1);
    assertSafeInteger(event.combatTimeMs, "CombatEvent.combatTimeMs");
    if (event.sequence !== lastSequence + 1) {
      throw new Error("CombatEvent.sequence must be contiguous across presentation batches");
    }
    if (event.combatTimeMs < lastCombatTimeMs) {
      throw new Error("CombatEvent.combatTimeMs must be monotonic across presentation batches");
    }
    if (!allowBattleStarted && event.kind === "BattleStarted") {
      throw new Error("BattleStarted is valid only in the one-time presentation bootstrap");
    }
    lastSequence = event.sequence;
    lastCombatTimeMs = event.combatTimeMs;
    return projectEvent(event, battleId, bindings, sideIds);
  });
  return { events: projected, lastSequence, lastCombatTimeMs };
}

export function projectCombatPresentationBootstrapV1(
  input: CombatPresentationBootstrapInputV1,
): CombatPresentationBootstrapResultV1 {
  assertNonEmptyString(input.battleId, "battleId");
  const sourceCombatEventSchemaVersion = String(input.combatEventSchemaVersion);
  assertNonEmptyString(sourceCombatEventSchemaVersion, "combatEventSchemaVersion");
  if (input.events.length === 0 || input.events[0]?.kind !== "BattleStarted") {
    throw new Error("presentation bootstrap must begin with BattleStarted");
  }
  const origin = input.events[0];
  if (origin.sequence !== 1 || origin.combatTimeMs !== 0 || origin.battleId !== input.battleId) {
    throw new Error("presentation bootstrap BattleStarted must be the sequence-1 time-0 battle origin");
  }

  const bootstrapById = new Map<string, CombatPresentationBootstrapParticipantSourceV1>();
  const bindings: CombatPresentationParticipantBindingV1[] = [];
  const initialParticipants = input.participants.map((source) => {
    if (bootstrapById.has(source.combatantId)) throw new Error(`duplicate presentation combatantId: ${source.combatantId}`);
    bootstrapById.set(source.combatantId, source);
    bindings.push({ kind: source.kind, combatantId: source.combatantId, sideId: source.sideId });
    return projectBootstrapParticipant(source);
  });
  const initialSides = projectInitialSides(input.sides, bootstrapById);
  const bindingMap = bindingsMap(bindings);
  const sideIds = new Set(initialSides.map(({ sideId }) => sideId));
  const batch = projectEventBatch(input.events, input.battleId, bindingMap, sideIds, 0, 0, true);

  const continuationContext: CombatPresentationContinuationContextV1 = {
    schemaVersion: COMBAT_PRESENTATION_SCHEMA_VERSION_V1,
    battleId: input.battleId,
    sourceCombatEventSchemaVersion,
    participantBindings: bindings,
    lastSequence: batch.lastSequence,
    lastCombatTimeMs: batch.lastCombatTimeMs,
  };
  return {
    envelope: {
      kind: "bootstrap",
      schemaVersion: COMBAT_PRESENTATION_SCHEMA_VERSION_V1,
      sourceCombatEventSchemaVersion,
      battleId: input.battleId,
      initialSides,
      initialParticipants,
      events: batch.events,
    },
    continuationContext,
  };
}

export function projectCombatPresentationContinuationV1(
  input: CombatPresentationContinuationInputV1,
): CombatPresentationContinuationResultV1 {
  const { context } = input;
  if (context.schemaVersion !== COMBAT_PRESENTATION_SCHEMA_VERSION_V1) {
    throw new Error("unsupported combat presentation continuation schemaVersion");
  }
  assertNonEmptyString(context.battleId, "battleId");
  assertNonEmptyString(context.sourceCombatEventSchemaVersion, "sourceCombatEventSchemaVersion");
  assertSafeInteger(context.lastSequence, "lastSequence", 1);
  assertSafeInteger(context.lastCombatTimeMs, "lastCombatTimeMs");
  const bindingMap = bindingsMap(context.participantBindings);
  const sideIds = new Set(context.participantBindings.map(({ sideId }) => sideId));
  const batch = projectEventBatch(
    input.events,
    context.battleId,
    bindingMap,
    sideIds,
    context.lastSequence,
    context.lastCombatTimeMs,
    false,
  );
  const continuationContext: CombatPresentationContinuationContextV1 = {
    ...context,
    participantBindings: context.participantBindings.map((binding) => ({ ...binding })),
    lastSequence: batch.lastSequence,
    lastCombatTimeMs: batch.lastCombatTimeMs,
  };
  return {
    envelope: {
      kind: "continuation",
      schemaVersion: COMBAT_PRESENTATION_SCHEMA_VERSION_V1,
      sourceCombatEventSchemaVersion: context.sourceCombatEventSchemaVersion,
      battleId: context.battleId,
      events: batch.events,
    },
    continuationContext,
  };
}
