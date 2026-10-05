import {
  advanceHuntPresentationLogicalWatermarkInTransaction,
  appendHuntPresentationBattleInTransaction,
  canonicalPresentationJson,
  HUNT_PRESENTATION_SOURCE_EVENT_BATCH_BYTES_MAX,
  loadHuntPresentationPrivateBattle,
  loadHuntPresentationStream,
  markHuntPresentationUnavailableInTransaction,
  type TransactionClient,
} from "@pokenexus/database";
import {
  SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V4,
  type SoloHuntBattleOrigin,
  type SoloHuntRuntimeInputs,
  type SoloHuntRuntimeState,
  type SoloHuntSimulationEvent,
} from "@pokenexus/game-core";
import {
  projectCombatPresentationBootstrapV2,
  projectCombatPresentationContinuationV2,
  type CombatPresentationContinuationContextV2,
  type CombatPresentationEventV2,
} from "@pokenexus/game-protocol";

export interface CommittedPresentationSourceInput {
  readonly transaction: TransactionClient;
  readonly playerId: string;
  readonly huntId: string;
  readonly checkpointSchemaVersion: string;
  readonly committedState: SoloHuntRuntimeState;
  readonly inputs: SoloHuntRuntimeInputs;
  readonly generatedEvents: ReadonlyArray<SoloHuntSimulationEvent>;
}

type WrappedCombatSource = Extract<SoloHuntSimulationEvent, { readonly kind: "combat" }>;

function matchingOrigin(
  state: SoloHuntRuntimeState,
  encounterId: string,
): { readonly ordinal: number; readonly battleStartedAtHuntTimeMs: number; readonly origin?: SoloHuntBattleOrigin } | null {
  const current = state.currentEncounter;
  if (current?.encounterId === encounterId) {
    return {
      ordinal: current.encounterOrdinal,
      battleStartedAtHuntTimeMs: current.battleStartedAtHuntTimeMs,
      origin: current.battleOrigin,
    };
  }
  // One bounded advancement segment may end its current Encounter, but cannot
  // consume more than the most recently completed Encounter boundary.
  const tail = state.completedEncounterProvenance[state.completedEncounterProvenance.length - 1];
  const completed = tail?.encounterId === encounterId ? tail : undefined;
  return completed ? {
    ordinal: completed.encounterOrdinal,
    battleStartedAtHuntTimeMs: completed.battleStartedAtHuntTimeMs,
    origin: completed.battleOrigin,
  } : null;
}

function groupCombatEvents(
  events: ReadonlyArray<SoloHuntSimulationEvent>,
): ReadonlyArray<{ readonly encounterId: string; readonly events: ReadonlyArray<WrappedCombatSource> }> {
  const grouped: { encounterId: string; events: WrappedCombatSource[] }[] = [];
  for (const event of events) {
    if (event.kind !== "combat") continue;
    const encounterId = String(event.encounterId);
    const tail = grouped[grouped.length - 1];
    if (tail?.encounterId === encounterId) {
      tail.events.push(event);
    } else {
      grouped.push({ encounterId, events: [event] });
    }
  }
  return grouped;
}

function sourceBytes(event: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalPresentationJson(event));
}

function batchFields(
  projected: ReadonlyArray<CombatPresentationEventV2>,
  generated: ReadonlyArray<WrappedCombatSource>,
): ReadonlyArray<{
  readonly sequence: number;
  readonly combatTimeMs: number;
  readonly publicEvent: CombatPresentationEventV2;
  readonly publicBytes: Uint8Array;
  readonly privateSourceBytes: Uint8Array;
}> {
  if (projected.length !== generated.length) {
    throw new Error("TASK-028 projection changed the source event cardinality");
  }
  return projected.map((event, index) => {
    const raw = generated[index]!.event;
    if (event.sequence !== raw.sequence || event.combatTimeMs !== raw.combatTimeMs) {
      throw new Error("TASK-028 projected event source sequence/time drifted");
    }
    return {
      sequence: raw.sequence,
      combatTimeMs: raw.combatTimeMs,
      publicEvent: event,
      publicBytes: sourceBytes(event),
      privateSourceBytes: sourceBytes(raw),
    };
  });
}

/**
 * A private, writer-only projection. Invoked within the same SQL transaction
 * as the successful checkpoint OCC update. Never called by GET.
 */
export async function publishCommittedHuntPresentation(
  source: CommittedPresentationSourceInput,
): Promise<void> {
  if (source.checkpointSchemaVersion !== SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V4) return;
  const {
    transaction, playerId, huntId, committedState, inputs, generatedEvents,
  } = source;
  const stream = await loadHuntPresentationStream(transaction, playerId, huntId, true);
  if (!stream) throw new Error("v4 Hunt has no transactionally created presentation stream");
  if (stream.status === "unavailable") return;
  if (stream.isTerminal) throw new Error("v4 Hunt attempted to publish after presentation terminal seal");
  if (
    stream.inputSchemaVersion !== "hunt-runtime-inputs-v4"
    || stream.checkpointSchemaVersion !== SOLO_HUNT_CHECKPOINT_SCHEMA_VERSION_V4
    || stream.gameDataVersion !== committedState.gameDataVersion
    || stream.rulesVersion !== committedState.rulesVersion
    || stream.sourceEventSchemaVersion !== String(inputs.context.combatEventSchemaVersion)
    || stream.presentationSchemaVersion !== "pokenexus.combat-presentation.v2"
  ) {
    await markHuntPresentationUnavailableInTransaction(
      transaction, playerId, huntId, "presentation_source_version_mismatch",
    );
    return;
  }
  const groups = groupCombatEvents(generatedEvents);
  if (groups.length === 0) {
    await advanceHuntPresentationLogicalWatermarkInTransaction(
      transaction, playerId, huntId, committedState.logicalTimeMs,
    );
    return;
  }
  let publishedSourceEvents = 0;
  let publishedSourceBytes = 0;
  for (const group of groups) {
    const metadata = matchingOrigin(committedState, group.encounterId);
    if (!metadata?.origin) {
      await markHuntPresentationUnavailableInTransaction(
        transaction, playerId, huntId, "immutable_battle_origin_unavailable",
      );
      return;
    }
    const origin = metadata.origin;
    const wild = origin.participants.find((participant) => participant.kind === "wild");
    if (
      origin.sourceVersions.gameDataVersion !== stream.gameDataVersion
      || origin.sourceVersions.rulesVersion !== stream.rulesVersion
      || origin.sourceVersions.combatEventSchemaVersion !== stream.sourceEventSchemaVersion
      || !wild
      || wild.shiny !== origin.individualizationSnapshot.shiny
      || wild.speciesId !== origin.individualizationSnapshot.speciesId
      || wild.level !== origin.individualizationSnapshot.level
    ) {
      await markHuntPresentationUnavailableInTransaction(
        transaction, playerId, huntId, "immutable_source_binding_invalid",
      );
      return;
    }
    if (group.events.some((row) => row.huntTimeMs > committedState.logicalTimeMs)) {
      await markHuntPresentationUnavailableInTransaction(
        transaction, playerId, huntId, "uncommitted_source_event",
      );
      return;
    }
    const rawEvents = group.events.map(({ event }) => event);
    const previousBattle = await loadHuntPresentationPrivateBattle(
      transaction, huntId, String(origin.battleId),
    );
    if (previousBattle && !previousBattle.contextValid) {
      await markHuntPresentationUnavailableInTransaction(
        transaction, playerId, huntId, "private_context_commitment_mismatch",
      );
      return;
    }
    let projected;
    try {
      if (rawEvents[0]?.kind === "BattleStarted") {
        if (
          rawEvents.length < origin.initialEvents.length
          || origin.initialEvents.some((initial, index) =>
            canonicalPresentationJson(initial) !== canonicalPresentationJson(rawEvents[index]))
        ) {
          throw new Error("First projected Battle group lacks the full authoritative time-zero events");
        }
        projected = projectCombatPresentationBootstrapV2({
          battleId: String(origin.battleId),
          combatEventSchemaVersion: inputs.context.combatEventSchemaVersion,
          sides: origin.sides,
          participants: origin.participants,
          events: rawEvents,
        });
      } else if (previousBattle) {
        projected = projectCombatPresentationContinuationV2({
          context: previousBattle.continuationContext as CombatPresentationContinuationContextV2,
          events: rawEvents,
        });
      } else {
        throw new Error("Presentation continuation has no committed Battle origin");
      }
    } catch {
      // A deterministic failure to project existing, valid gameplay is
      // presentation-only; keep gameplay and permanently disable this feed.
      await markHuntPresentationUnavailableInTransaction(
        transaction, playerId, huntId, "source_projection_unavailable",
      );
      return;
    }
    let fields;
    try {
      fields = batchFields(projected.envelope.events, group.events);
    } catch {
      await markHuntPresentationUnavailableInTransaction(
        transaction, playerId, huntId, "projected_event_identity_invalid",
      );
      return;
    }
    publishedSourceEvents += fields.length;
    publishedSourceBytes += fields.reduce((sum, event) =>
      sum + event.privateSourceBytes.byteLength + event.publicBytes.byteLength, 0);
    if (publishedSourceEvents > 128
      || publishedSourceBytes > HUNT_PRESENTATION_SOURCE_EVENT_BATCH_BYTES_MAX) {
      // The core normally yields before this point. Retain an exact, fail-closed
      // guard across ALL Battle groups in the same winning OCC transaction.
      await markHuntPresentationUnavailableInTransaction(
        transaction, playerId, huntId, "oversized_projection_batch",
      );
      return;
    }
    const written = await appendHuntPresentationBattleInTransaction(
      transaction, playerId, huntId,
      {
        encounterId: group.encounterId,
        encounterOrdinal: metadata.ordinal,
        battleId: String(origin.battleId),
        battleStartedAtHuntTimeMs: metadata.battleStartedAtHuntTimeMs,
        initialSides: projected.envelope.kind === "bootstrap"
          ? projected.envelope.initialSides
          : previousBattle!.initialSides,
        initialParticipants: projected.envelope.kind === "bootstrap"
          ? projected.envelope.initialParticipants
          : previousBattle!.initialParticipants,
        privateOrigin: origin,
        continuationContext: projected.continuationContext,
        publicEvents: fields,
      },
      committedState.logicalTimeMs,
    );
    if (written === "unavailable") return;
  }
}
