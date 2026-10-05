import { useId } from "react";
import type {
  CombatPresentationBootstrapEnvelopeV1,
  CombatPresentationBootstrapEnvelopeV2,
  CombatPresentationContinuationEnvelopeV1,
  CombatPresentationContinuationEnvelopeV2,
  CombatPresentationEventV1,
  CombatPresentationEventV2,
  CombatPresentationParticipantV1,
} from "@pokenexus/game-protocol";
import "./combat-card.css";

export const CARD_COMBAT_EVENT_FEED_LIMIT = 100;

type ParticipantVitality =
  | { readonly visibility: "exact"; readonly state: "conscious" | "ko"; readonly currentHp: number; readonly maxHp: number }
  | { readonly visibility: "unavailable"; readonly state: "conscious" | "ko" }
  | { readonly visibility: "hidden"; readonly state: "conscious" | "ko" };

export interface CardCombatParticipantState {
  readonly combatantId: string;
  readonly sideId: string;
  readonly speciesId: string;
  readonly owned: boolean;
  readonly shiny: boolean;
  readonly level: number;
  readonly active: boolean;
  readonly ownedMaxHp?: number;
  readonly vitality: ParticipantVitality;
  readonly effects: ReadonlyArray<{ readonly effectId: string; readonly stacks?: number }>;
}

export interface CardCombatState {
  readonly battleId: string;
  readonly participants: ReadonlyArray<CardCombatParticipantState>;
  readonly eventFeed: ReadonlyArray<string>;
  readonly outcome?: string;
}

export type CardCombatBootstrapEnvelope =
  | CombatPresentationBootstrapEnvelopeV1
  | CombatPresentationBootstrapEnvelopeV2;
export type CardCombatContinuationEnvelope =
  | CombatPresentationContinuationEnvelopeV1
  | CombatPresentationContinuationEnvelopeV2;
export type CardCombatEvent = CombatPresentationEventV1 | CombatPresentationEventV2;

function assertEnvelopeBinding(
  battleId: string,
  schemaVersion: string,
  sourceSchemaVersion: string,
  envelope: CardCombatContinuationEnvelope,
): void {
  if (
    envelope.battleId !== battleId ||
    envelope.schemaVersion !== schemaVersion ||
    envelope.sourceCombatEventSchemaVersion !== sourceSchemaVersion
  ) {
    throw new Error("combat presentation continuation binding mismatch");
  }
}

function participantFromBootstrap(
  participant: CombatPresentationParticipantV1,
  activeIds: ReadonlySet<string>,
): CardCombatParticipantState {
  return {
    combatantId: participant.combatantId,
    sideId: participant.sideId,
    speciesId: participant.identity.speciesId,
    owned: participant.identity.kind === "owned_pokemon",
    shiny: participant.identity.shiny,
    level: participant.identity.level,
    active: activeIds.has(participant.combatantId),
    ...(participant.vitality.visibility === "exact" ? { ownedMaxHp: participant.vitality.maxHp } : {}),
    vitality: participant.vitality,
    effects: [],
  };
}

function withParticipant(
  participants: ReadonlyArray<CardCombatParticipantState>,
  combatantId: string,
  update: (participant: CardCombatParticipantState) => CardCombatParticipantState,
): ReadonlyArray<CardCombatParticipantState> {
  let found = false;
  const next = participants.map((participant) => {
    if (participant.combatantId !== combatantId) return participant;
    found = true;
    return update(participant);
  });
  if (!found) throw new Error(`presentation event references unknown combatant ${combatantId}`);
  return next;
}

export function combatPresentationEventText(event: CardCombatEvent): string {
  switch (event.kind) {
    case "BattleStarted":
      return "Battle started.";
    case "MoveUsed":
      return `${event.actorId} used ${event.moveId}.`;
    case "MoveMissed":
      return `${event.actorId}'s ${event.moveId} missed ${event.targetId}.`;
    case "MoveImmune":
      return `${event.targetId} is immune to ${event.moveId}.`;
    case "CriticalHit":
      return `Critical hit on ${event.targetId}.`;
    case "DamageApplied":
      return event.hpChange.visibility === "exact"
        ? `${event.targetId} took ${event.hpChange.amount} damage and is at ${event.hpChange.resultingHp} HP.`
        : `${event.targetId} took damage.`;
    case "CombatantKO":
      return `${event.combatantId} was knocked out.`;
    case "CombatantActivated":
      return `${event.combatantId} became active.`;
    case "CombatantRevived":
      return event.hpChange.visibility === "exact"
        ? `${event.combatantId} was revived at ${event.hpChange.resultingHp} HP.`
        : `${event.combatantId} was revived.`;
    case "BattleEnded":
      return event.outcome.kind === "draw" ? "Battle ended in a draw." : `${event.outcome.winnerSideId} won the battle.`;
    case "EffectApplied":
      return `${event.effectId} was applied to ${event.targetId}.`;
    case "EffectUpdated":
      return `${event.effectId} was updated on ${event.targetId}.`;
    case "EffectRemoved":
      return `${event.effectId} was removed from ${event.targetId}.`;
    case "EffectTicked":
      return event.hpChange.visibility === "exact"
        ? `${event.effectId} caused ${event.hpChange.amount} ${event.consequence} on ${event.targetId}; resulting HP ${event.hpChange.resultingHp}.`
        : `${event.effectId} caused ${event.consequence} on ${event.targetId}.`;
    case "HealingApplied":
      return event.hpChange.visibility === "exact"
        ? `${event.targetId} recovered ${event.hpChange.amount} HP and is at ${event.hpChange.resultingHp} HP.`
        : `${event.targetId} recovered HP.`;
    case "StatStageChanged":
      return `${event.targetId} ${event.stat} stage changed by ${event.appliedDelta} to ${event.resultingStage}.`;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

function applyEvent(
  state: CardCombatState,
  event: CardCombatEvent,
): CardCombatState {
  let participants = state.participants;
  let outcome = state.outcome;

  switch (event.kind) {
    case "CombatantKO":
      participants = withParticipant(participants, event.combatantId, (participant) => ({
        ...participant,
        active: false,
        vitality: participant.vitality.visibility === "hidden"
          ? { visibility: "hidden", state: "ko" }
          : { visibility: "unavailable", state: "ko" },
      }));
      break;
    case "CombatantActivated":
      participants = withParticipant(participants, event.combatantId, (participant) => ({
        ...participant,
        active: true,
      }));
      break;
    case "CombatantRevived":
      participants = withParticipant(participants, event.combatantId, (participant) => {
        if (event.hpChange.visibility === "exact") {
          if (participant.vitality.visibility === "hidden" || participant.ownedMaxHp === undefined) {
            throw new Error("numeric revived HP cannot target hidden vitality");
          }
          return {
            ...participant,
            vitality: {
              visibility: "exact",
              state: "conscious",
              currentHp: event.hpChange.resultingHp,
              maxHp: participant.ownedMaxHp,
            },
          };
        }
        return {
          ...participant,
          vitality: participant.vitality.visibility === "hidden"
            ? { visibility: "hidden", state: "conscious" }
            : { visibility: "unavailable", state: "conscious" },
        };
      });
      break;
    case "DamageApplied":
    case "HealingApplied":
    case "EffectTicked":
      if (event.hpChange.visibility === "exact") {
        const hpChange = event.hpChange;
        participants = withParticipant(participants, event.targetId, (participant) => {
          if (participant.vitality.visibility === "hidden" || participant.ownedMaxHp === undefined) {
            throw new Error("numeric HP consequence cannot target hidden vitality");
          }
          return {
            ...participant,
            vitality: {
              visibility: "exact",
              currentHp: hpChange.resultingHp,
              maxHp: participant.ownedMaxHp,
              state: participant.vitality.state,
            },
          };
        });
      } else {
        participants = withParticipant(participants, event.targetId, (participant) => participant.vitality.visibility === "hidden"
          ? participant
          : {
              ...participant,
              vitality: { visibility: "unavailable", state: participant.vitality.state },
            });
      }
      break;
    case "EffectApplied":
    case "EffectUpdated":
      participants = withParticipant(participants, event.targetId, (participant) => ({
        ...participant,
        effects: [
          ...participant.effects.filter(({ effectId }) => effectId !== event.effectId),
          { effectId: event.effectId, ...(event.stacks === undefined ? {} : { stacks: event.stacks }) },
        ],
      }));
      break;
    case "EffectRemoved":
      participants = withParticipant(participants, event.targetId, (participant) => ({
        ...participant,
        effects: participant.effects.filter(({ effectId }) => effectId !== event.effectId),
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
    ...state,
    participants,
    ...(outcome === undefined ? {} : { outcome }),
    eventFeed: [...state.eventFeed, combatPresentationEventText(event)].slice(-CARD_COMBAT_EVENT_FEED_LIMIT),
  };
}

export function createCardCombatState(
  bootstrap: CardCombatBootstrapEnvelope,
): CardCombatState {
  const activeIds = new Set(bootstrap.initialSides.flatMap(({ activeCombatantIds }) => activeCombatantIds));
  const participantsById = new Map(
    bootstrap.initialParticipants.map((participant) => [participant.combatantId, participant] as const),
  );
  const orderedParticipants = bootstrap.initialSides.flatMap(({ combatantIds }) => combatantIds.map((combatantId) => {
    const participant = participantsById.get(combatantId);
    if (!participant) throw new Error(`initial side references unknown combatant ${combatantId}`);
    return participantFromBootstrap(participant, activeIds);
  }));
  let state: CardCombatState = {
    battleId: bootstrap.battleId,
    participants: orderedParticipants,
    eventFeed: [],
  };
  for (const event of bootstrap.events) state = applyEvent(state, event);
  return state;
}

export function applyCardCombatContinuation(
  state: CardCombatState,
  bootstrap: CardCombatBootstrapEnvelope,
  continuation: CardCombatContinuationEnvelope,
): CardCombatState {
  assertEnvelopeBinding(
    bootstrap.battleId,
    bootstrap.schemaVersion,
    bootstrap.sourceCombatEventSchemaVersion,
    continuation,
  );
  if (state.battleId !== bootstrap.battleId) throw new Error("card combat state battle mismatch");
  let next = state;
  for (const event of continuation.events) next = applyEvent(next, event);
  return next;
}

export function buildCardCombatState(
  bootstrap: CardCombatBootstrapEnvelope,
  continuations: ReadonlyArray<CardCombatContinuationEnvelope> = [],
): CardCombatState {
  let state = createCardCombatState(bootstrap);
  for (const continuation of continuations) {
    state = applyCardCombatContinuation(state, bootstrap, continuation);
  }
  return state;
}

function ParticipantCard({ participant }: { participant: CardCombatParticipantState }) {
  return (
    <article
      className="combat-card__combatant"
      data-active={participant.active ? "true" : "false"}
      data-state={participant.vitality.state}
      aria-label={`${participant.speciesId}, level ${participant.level}`}
    >
      <div className="combat-card__combatant-heading">
        <strong>{participant.speciesId}</strong>
        <span>{participant.active ? "Active" : participant.vitality.state === "ko" ? "KO" : "Reserve"}</span>
      </div>
      <div className="combat-card__meta">Level {participant.level}{participant.shiny ? " · Shiny" : ""}</div>
      {participant.vitality.visibility === "exact" ? (
        <div className="combat-card__hp">
          <span>HP {participant.vitality.currentHp} / {participant.vitality.maxHp}</span>
          <progress
            aria-label={`${participant.speciesId} HP`}
            value={participant.vitality.currentHp}
            max={participant.vitality.maxHp}
          />
        </div>
      ) : participant.vitality.visibility === "hidden" ? (
        <div className="combat-card__hp combat-card__hp--hidden">
          HP hidden · {participant.vitality.state === "ko" ? "KO" : "Conscious"}
        </div>
      ) : (
        <div className="combat-card__hp combat-card__hp--hidden">
          HP unavailable · {participant.vitality.state === "ko" ? "KO" : "Conscious"}
        </div>
      )}
      {participant.effects.length > 0 ? (
        <ul className="combat-card__effects" aria-label="Effects">
          {participant.effects.map((effect) => (
            <li key={effect.effectId}>
              {effect.effectId}{effect.stacks === undefined ? "" : ` ×${effect.stacks}`}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function CardCombatRenderer({
  bootstrap,
  continuations = [],
}: {
  bootstrap: CardCombatBootstrapEnvelope;
  continuations?: ReadonlyArray<CardCombatContinuationEnvelope>;
}) {
  const headingId = useId();
  const state = buildCardCombatState(bootstrap, continuations);
  const sideIds = bootstrap.initialSides.map(({ sideId }) => sideId);

  return (
    <section className="combat-card" aria-label="Combat">
      <div className="combat-card__sides">
        {sideIds.map((sideId, index) => (
          <section className="combat-card__side" key={sideId} aria-labelledby={`${headingId}-side-${index}`}>
            <h2 id={`${headingId}-side-${index}`}>{sideId}</h2>
            <div className="combat-card__combatants">
              {state.participants
                .filter((participant) => participant.sideId === sideId)
                .map((participant) => <ParticipantCard key={participant.combatantId} participant={participant} />)}
            </div>
          </section>
        ))}
      </div>
      <section className="combat-card__feed" aria-labelledby={`${headingId}-feed`}>
        <h2 id={`${headingId}-feed`}>Combat events</h2>
        <p className="combat-card__live" aria-live="polite" aria-atomic="true">
          {state.eventFeed.at(-1) ?? ""}
        </p>
        <ol>
          {state.eventFeed.map((entry, index) => <li key={index}>{entry}</li>)}
        </ol>
      </section>
    </section>
  );
}
