import type {
  CombatPresentationBootstrapEnvelopeV1,
  CombatPresentationContinuationEnvelopeV1,
  CombatPresentationEventV1,
  CombatPresentationParticipantV1,
} from "@pokenexus/game-protocol";

export const PIXI_COMBAT_CUE_QUEUE_LIMIT = 64;
export const PIXI_COMBAT_CUE_DURATION_MS = 180;

export function visualCueDurationMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : PIXI_COMBAT_CUE_DURATION_MS;
}

export type PixiVitality =
  | { readonly visibility: "exact"; readonly state: "conscious" | "ko"; readonly currentHp: number; readonly maxHp: number }
  | { readonly visibility: "unavailable"; readonly state: "conscious" | "ko" }
  | { readonly visibility: "hidden"; readonly state: "conscious" | "ko" };

export interface PixiCombatEntityState {
  readonly combatantId: string;
  readonly sideId: string;
  readonly speciesId: string;
  readonly owned: boolean;
  readonly active: boolean;
  readonly ownedMaxHp?: number;
  readonly vitality: PixiVitality;
  readonly effects: ReadonlyArray<{ readonly effectId: string; readonly stacks?: number }>;
}

export interface PixiCombatModel {
  readonly battleId: string;
  readonly sourceCombatEventSchemaVersion: string;
  readonly entities: ReadonlyArray<PixiCombatEntityState>;
  readonly outcome?: string;
  readonly lastSequence: number;
}

export interface PixiVisualCue {
  readonly sequence: number;
  readonly kind:
    | "move"
    | "miss"
    | "immune"
    | "critical"
    | "damage"
    | "ko"
    | "activate"
    | "effect"
    | "heal"
    | "stat"
    | "end";
  readonly subjectId?: string;
  readonly targetId?: string;
}

export function capPixiVisualCues(
  cues: ReadonlyArray<PixiVisualCue>,
): ReadonlyArray<PixiVisualCue> {
  return cues.slice(-PIXI_COMBAT_CUE_QUEUE_LIMIT);
}

function fromParticipant(
  participant: CombatPresentationParticipantV1,
  active: ReadonlySet<string>,
): PixiCombatEntityState {
  return {
    combatantId: participant.combatantId,
    sideId: participant.sideId,
    speciesId: participant.identity.speciesId,
    owned: participant.identity.kind === "owned_pokemon",
    active: active.has(participant.combatantId),
    ...(participant.vitality.visibility === "exact" ? { ownedMaxHp: participant.vitality.maxHp } : {}),
    vitality: participant.vitality,
    effects: [],
  };
}

function withEntity(
  entities: ReadonlyArray<PixiCombatEntityState>,
  combatantId: string,
  update: (entity: PixiCombatEntityState) => PixiCombatEntityState,
): ReadonlyArray<PixiCombatEntityState> {
  let found = false;
  const next = entities.map((entity) => {
    if (entity.combatantId !== combatantId) return entity;
    found = true;
    return update(entity);
  });
  if (!found) throw new Error(`presentation event references unknown combatant ${combatantId}`);
  return next;
}

export function eventToPixiCue(event: CombatPresentationEventV1): PixiVisualCue | null {
  switch (event.kind) {
    case "BattleStarted":
      return null;
    case "MoveUsed":
      return { sequence: event.sequence, kind: "move", subjectId: event.actorId, targetId: event.targetIds[0] };
    case "MoveMissed":
      return { sequence: event.sequence, kind: "miss", subjectId: event.actorId, targetId: event.targetId };
    case "MoveImmune":
      return { sequence: event.sequence, kind: "immune", subjectId: event.actorId, targetId: event.targetId };
    case "CriticalHit":
      return { sequence: event.sequence, kind: "critical", subjectId: event.actorId, targetId: event.targetId };
    case "DamageApplied":
      return { sequence: event.sequence, kind: "damage", subjectId: event.actorId, targetId: event.targetId };
    case "CombatantKO":
      return { sequence: event.sequence, kind: "ko", targetId: event.combatantId };
    case "CombatantActivated":
      return { sequence: event.sequence, kind: "activate", targetId: event.combatantId };
    case "BattleEnded":
      return { sequence: event.sequence, kind: "end" };
    case "EffectApplied":
    case "EffectUpdated":
    case "EffectRemoved":
    case "EffectTicked":
      return { sequence: event.sequence, kind: "effect", targetId: event.targetId };
    case "HealingApplied":
      return { sequence: event.sequence, kind: "heal", targetId: event.targetId };
    case "StatStageChanged":
      return { sequence: event.sequence, kind: "stat", targetId: event.targetId };
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

function applyEvent(model: PixiCombatModel, event: CombatPresentationEventV1): PixiCombatModel {
  let entities = model.entities;
  let outcome = model.outcome;

  switch (event.kind) {
    case "CombatantKO":
      entities = withEntity(entities, event.combatantId, (entity) => ({
        ...entity,
        active: false,
        vitality: entity.vitality.visibility === "hidden"
          ? { visibility: "hidden", state: "ko" }
          : { visibility: "unavailable", state: "ko" },
      }));
      break;
    case "CombatantActivated":
      entities = withEntity(entities, event.combatantId, (entity) => ({ ...entity, active: true }));
      break;
    case "DamageApplied":
    case "HealingApplied":
    case "EffectTicked":
      if (event.hpChange.visibility === "exact") {
        const hpChange = event.hpChange;
        entities = withEntity(entities, event.targetId, (entity) => {
          if (entity.vitality.visibility === "hidden" || entity.ownedMaxHp === undefined) {
            throw new Error("numeric HP consequence cannot target hidden vitality");
          }
          return {
            ...entity,
            vitality: {
              visibility: "exact",
              currentHp: hpChange.resultingHp,
              maxHp: entity.ownedMaxHp,
              state: entity.vitality.state,
            },
          };
        });
      } else {
        entities = withEntity(entities, event.targetId, (entity) => entity.vitality.visibility === "hidden"
          ? entity
          : { ...entity, vitality: { visibility: "unavailable", state: entity.vitality.state } });
      }
      break;
    case "EffectApplied":
    case "EffectUpdated":
      entities = withEntity(entities, event.targetId, (entity) => ({
        ...entity,
        effects: [
          ...entity.effects.filter(({ effectId }) => effectId !== event.effectId),
          { effectId: event.effectId, ...(event.stacks === undefined ? {} : { stacks: event.stacks }) },
        ],
      }));
      break;
    case "EffectRemoved":
      entities = withEntity(entities, event.targetId, (entity) => ({
        ...entity,
        effects: entity.effects.filter(({ effectId }) => effectId !== event.effectId),
      }));
      break;
    case "BattleEnded":
      outcome = event.outcome.kind === "draw" ? "draw" : event.outcome.winnerSideId;
      break;
    case "BattleStarted":
    case "MoveUsed":
    case "MoveMissed":
    case "MoveImmune":
    case "CriticalHit":
    case "StatStageChanged":
      break;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }

  return {
    ...model,
    entities,
    lastSequence: event.sequence,
    ...(outcome === undefined ? {} : { outcome }),
  };
}

export function buildPixiCombatModel(
  bootstrap: CombatPresentationBootstrapEnvelopeV1,
  continuations: ReadonlyArray<CombatPresentationContinuationEnvelopeV1> = [],
): { readonly model: PixiCombatModel; readonly cues: ReadonlyArray<PixiVisualCue> } {
  const active = new Set(bootstrap.initialSides.flatMap(({ activeCombatantIds }) => activeCombatantIds));
  const participantsById = new Map(
    bootstrap.initialParticipants.map((participant) => [participant.combatantId, participant] as const),
  );
  const orderedEntities = bootstrap.initialSides.flatMap(({ combatantIds }) => combatantIds.map((combatantId) => {
    const participant = participantsById.get(combatantId);
    if (!participant) throw new Error(`initial side references unknown combatant ${combatantId}`);
    return fromParticipant(participant, active);
  }));
  let model: PixiCombatModel = {
    battleId: bootstrap.battleId,
    sourceCombatEventSchemaVersion: bootstrap.sourceCombatEventSchemaVersion,
    entities: orderedEntities,
    lastSequence: 0,
  };
  const cues: PixiVisualCue[] = [];

  const applyBatch = (events: ReadonlyArray<CombatPresentationEventV1>) => {
    for (const event of events) {
      model = applyEvent(model, event);
      const cue = eventToPixiCue(event);
      if (cue) cues.push(cue);
    }
  };
  applyBatch(bootstrap.events);

  for (const continuation of continuations) {
    if (
      continuation.battleId !== bootstrap.battleId ||
      continuation.schemaVersion !== bootstrap.schemaVersion ||
      continuation.sourceCombatEventSchemaVersion !== bootstrap.sourceCombatEventSchemaVersion
    ) throw new Error("combat presentation continuation binding mismatch");
    applyBatch(continuation.events);
  }

  return { model, cues: capPixiVisualCues(cues) };
}
