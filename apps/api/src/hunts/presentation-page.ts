import { createHash } from "node:crypto";
import type {
  HuntPresentationPublicEvent,
  HuntPresentationPublicHeader,
} from "@pokenexus/database";
import type {
  CombatPresentationEnvelopeV1,
  CombatPresentationEnvelopeV2,
  CombatPresentationEventV1,
  CombatPresentationEventV2,
  CombatPresentationParticipantV1,
  CombatPresentationSideV1,
} from "@pokenexus/game-protocol";
import type {
  PresentationCursorCodec,
  PresentationCursorContents,
  PresentationCursorPosition,
  PresentationCursorSnapshot,
} from "./presentation-cursor";

const MAX_ENVELOPES = 4;
const MAX_EVENTS = 128;
const MAX_BODY_BYTES = 256 * 1024;
const ID_BYTES = 512;
const encoder = new TextEncoder();

export interface HuntPresentationPageV1 {
  readonly huntId: string;
  readonly presentationSchemaVersion:
    | "pokenexus.combat-presentation.v1"
    | "pokenexus.combat-presentation.v2";
  readonly sourceCombatEventSchemaVersion: string;
  readonly stream: {
    readonly snapshotId: string;
    readonly committedLogicalTimeMs: string;
    readonly isTerminal: boolean;
  };
  readonly battles: readonly {
    readonly encounterId: string;
    readonly encounterOrdinal: number;
    readonly battleStartedAtHuntTimeMs: string;
    readonly presentation: CombatPresentationEnvelopeV1 | CombatPresentationEnvelopeV2;
  }[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  readonly resumeCursor: string | null;
}

type RecordValue = Record<string, unknown>;

function fail(): never {
  throw new Error("The immutable public CombatPresentation envelope is invalid");
}

function record(value: unknown): RecordValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail();
  return value as RecordValue;
}

function keys(value: RecordValue, required: readonly string[], optional: readonly string[] = []): void {
  const actual = Object.keys(value).sort();
  const allowed = new Set([...required, ...optional]);
  if (required.some((field) => !Object.hasOwn(value, field))
    || actual.some((field) => !allowed.has(field))) fail();
}

function opaque(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.length || encoder.encode(value).byteLength > ID_BYTES) fail();
}

function integer(value: unknown, minimum = 0): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) fail();
}

function state(value: unknown): void {
  if (value !== "conscious" && value !== "ko") fail();
}

function textArray(value: unknown): asserts value is string[] {
  if (!Array.isArray(value)) fail();
  for (const item of value) opaque(item);
  if (new Set(value).size !== value.length) fail();
}

interface PublicBindings {
  readonly sides: readonly CombatPresentationSideV1[];
  readonly participants: readonly CombatPresentationParticipantV1[];
  readonly kinds: ReadonlyMap<string, "owned" | "wild">;
  readonly sideByCombatantId: ReadonlyMap<string, string>;
  readonly sideIds: ReadonlySet<string>;
}

function validatePublicOrigin(header: HuntPresentationPublicHeader): PublicBindings {
  const sides: CombatPresentationSideV1[] = [];
  const participants: CombatPresentationParticipantV1[] = [];
  const kinds = new Map<string, "owned" | "wild">();
  const sideByCombatantId = new Map<string, string>();
  const sideIds = new Set<string>();
  if (!Array.isArray(header.initialSides) || !Array.isArray(header.initialParticipants)
    || header.initialSides.length === 0 || header.initialParticipants.length === 0) fail();
  for (const entry of header.initialParticipants) {
    const participant = record(entry);
    keys(participant, ["combatantId", "sideId", "identity", "vitality"]);
    opaque(participant.combatantId);
    opaque(participant.sideId);
    if (kinds.has(participant.combatantId)) fail();
    const identity = record(participant.identity);
    const vitality = record(participant.vitality);
    if (identity.kind === "wild_pokemon") {
      keys(identity, ["kind", "speciesId", "level", "shiny"]);
      keys(vitality, ["visibility", "state"]);
      opaque(identity.speciesId);
      integer(identity.level, 1);
      if (typeof identity.shiny !== "boolean" || vitality.visibility !== "hidden") fail();
      state(vitality.state);
      kinds.set(participant.combatantId, "wild");
    } else if (identity.kind === "owned_pokemon") {
      keys(identity, ["kind", "pokemonInstanceId", "speciesId", "level", "shiny"]);
      keys(vitality, ["visibility", "state", "currentHp", "maxHp"]);
      opaque(identity.pokemonInstanceId);
      opaque(identity.speciesId);
      integer(identity.level, 1);
      integer(vitality.currentHp);
      integer(vitality.maxHp, 1);
      if (typeof identity.shiny !== "boolean" || vitality.visibility !== "exact"
        || vitality.currentHp > vitality.maxHp) fail();
      state(vitality.state);
      if ((vitality.currentHp === 0) !== (vitality.state === "ko")) fail();
      kinds.set(participant.combatantId, "owned");
    } else fail();
    sideByCombatantId.set(participant.combatantId, participant.sideId);
    participants.push(participant as unknown as CombatPresentationParticipantV1);
  }
  const assigned = new Set<string>();
  for (const entry of header.initialSides) {
    const side = record(entry);
    keys(side, ["sideId", "combatantIds", "activeCombatantIds"]);
    opaque(side.sideId);
    textArray(side.combatantIds);
    textArray(side.activeCombatantIds);
    if (sideIds.has(side.sideId) || side.combatantIds.length === 0) fail();
    sideIds.add(side.sideId);
    for (const combatantId of side.combatantIds) {
      if (assigned.has(combatantId) || sideByCombatantId.get(combatantId) !== side.sideId) fail();
      assigned.add(combatantId);
    }
    for (const active of side.activeCombatantIds) {
      if (!side.combatantIds.includes(active)) fail();
      const participant = participants.find((candidate) => candidate.combatantId === active);
      if (!participant || participant.vitality.state !== "conscious") fail();
    }
    sides.push({
      sideId: side.sideId,
      combatantIds: side.combatantIds,
      activeCombatantIds: side.activeCombatantIds,
    });
  }
  if (assigned.size !== kinds.size) fail();
  return { sides, participants, kinds, sideByCombatantId, sideIds };
}

function validatePublicHp(value: unknown, exactAllowed: boolean): void {
  const hp = record(value);
  if (hp.visibility === "hidden") {
    keys(hp, ["visibility"]);
  } else if (hp.visibility === "exact" && exactAllowed) {
    keys(hp, ["visibility", "amount", "resultingHp"]);
    integer(hp.amount);
    integer(hp.resultingHp);
  } else fail();
}

function validatePublicEvent(
  event: RecordValue,
  battleId: string,
  bindings: PublicBindings,
  presentationSchemaVersion: PresentationCursorSnapshot["presentationSchemaVersion"],
): CombatPresentationEventV1 | CombatPresentationEventV2 {
  integer(event.sequence, 1);
  integer(event.combatTimeMs);
  const common = ["kind", "sequence", "combatTimeMs"];
  const known = (id: unknown): "owned" | "wild" => {
    opaque(id);
    return bindings.kinds.get(id) ?? fail();
  };
  switch (event.kind) {
    case "BattleStarted":
      keys(event, [...common, "battleId"]);
      if (event.sequence !== 1 || event.combatTimeMs !== 0 || event.battleId !== battleId) fail();
      break;
    case "MoveUsed":
      keys(event, [...common, "actorId", "moveId", "targetIds"]);
      known(event.actorId); opaque(event.moveId); textArray(event.targetIds);
      for (const id of event.targetIds) known(id);
      break;
    case "MoveMissed":
    case "MoveImmune":
    case "CriticalHit":
      keys(event, [...common, "actorId", "moveId", "targetId"]);
      known(event.actorId); opaque(event.moveId); known(event.targetId);
      break;
    case "DamageApplied": {
      keys(event, [...common, "source", "targetId", "hpChange"], ["actorId", "moveId"]);
      if (event.source !== "move" && event.source !== "effect") fail();
      const target = known(event.targetId);
      const actor = event.actorId === undefined ? null : known(event.actorId);
      if (event.moveId !== undefined) opaque(event.moveId);
      validatePublicHp(event.hpChange, target === "owned" && actor === "owned");
      break;
    }
    case "CombatantKO":
      keys(event, [...common, "combatantId"]);
      known(event.combatantId);
      break;
    case "CombatantRevived": {
      if (presentationSchemaVersion !== "pokenexus.combat-presentation.v2") fail();
      keys(event, [...common, "combatantId", "hpChange"]);
      const revived = known(event.combatantId);
      validatePublicHp(event.hpChange, revived === "owned");
      break;
    }
    case "CombatantActivated":
      keys(event, [...common, "sideId", "combatantId"]);
      known(event.combatantId); opaque(event.combatantId); opaque(event.sideId);
      if (bindings.sideByCombatantId.get(event.combatantId) !== event.sideId) fail();
      break;
    case "BattleEnded": {
      keys(event, [...common, "outcome"]);
      const outcome = record(event.outcome);
      if (outcome.kind === "draw") keys(outcome, ["kind"]);
      else if (outcome.kind === "win") {
        keys(outcome, ["kind", "winnerSideId"]);
        opaque(outcome.winnerSideId);
        if (!bindings.sideIds.has(outcome.winnerSideId)) fail();
      } else fail();
      break;
    }
    case "EffectApplied":
    case "EffectUpdated":
      keys(event, [...common, "effectId", "targetId"], ["stacks"]);
      opaque(event.effectId); known(event.targetId);
      if (event.stacks !== undefined) integer(event.stacks);
      break;
    case "EffectRemoved":
      keys(event, [...common, "effectId", "targetId"]);
      opaque(event.effectId); known(event.targetId);
      break;
    case "EffectTicked":
      keys(event, [...common, "effectId", "targetId", "consequence", "hpChange"]);
      opaque(event.effectId); known(event.targetId);
      if (event.consequence !== "damage" && event.consequence !== "healing") fail();
      validatePublicHp(event.hpChange, false);
      break;
    case "HealingApplied":
      keys(event, [...common, "targetId", "hpChange"]);
      known(event.targetId);
      validatePublicHp(event.hpChange, false);
      break;
    case "StatStageChanged":
      keys(event, [...common, "targetId", "stat", "requestedDelta", "appliedDelta", "resultingStage"]);
      known(event.targetId);
      if (!["atk", "def", "spa", "spd", "spe"].includes(String(event.stat))) fail();
      integer(event.requestedDelta, -Number.MAX_SAFE_INTEGER);
      integer(event.appliedDelta, -Number.MAX_SAFE_INTEGER);
      integer(event.resultingStage, -6);
      if (event.resultingStage > 6) fail();
      break;
    default:
      fail();
  }
  return event as CombatPresentationEventV1 | CombatPresentationEventV2;
}

function immutablePublicSnapshotId(huntId: string, snapshot: PresentationCursorSnapshot): string {
  return createHash("sha256")
    .update("pokenexus.hunt-presentation.snapshot.v1\0")
    .update(JSON.stringify({ huntId, snapshot }))
    .digest("base64url");
}

export interface BuildPresentationPageInput {
  readonly cursorCodec: PresentationCursorCodec;
  readonly playerId: string;
  readonly huntId: string;
  readonly nowMs: number;
  readonly limit: number;
  readonly snapshot: PresentationCursorSnapshot;
  readonly after: PresentationCursorPosition;
  readonly events: readonly HuntPresentationPublicEvent[];
  readonly headers: ReadonlyMap<string, HuntPresentationPublicHeader>;
}

/** The calling reader supplies only indexed, authenticated PUBLIC projection rows. */
export async function buildHuntPresentationPage(
  input: BuildPresentationPageInput,
): Promise<HuntPresentationPageV1> {
  const { cursorCodec, playerId, huntId, nowMs, snapshot, headers, limit, after } = input;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_EVENTS
    || input.events.length > limit || input.events.length > MAX_EVENTS) fail();
  const highwater = BigInt(snapshot.publishedEventIndex);
  const startIndex = after.kind === "before_first" ? 0n : BigInt(after.eventIndex);
  if (startIndex > highwater) fail();
  const battles: Array<HuntPresentationPageV1["battles"][number]> = [];
  let priorIndex = startIndex;
  let previousBattleId = after.kind === "event" ? after.battleId : null;
  const visited = new Set<string>();
  const validatedOrigins = new Map<string, PublicBindings>();
  for (const row of input.events) {
    if (row.eventIndex !== priorIndex + 1n || row.eventIndex > highwater) fail();
    const header = headers.get(row.battleId);
    if (!header) fail();
    let bindings = validatedOrigins.get(row.battleId);
    if (!bindings) {
      bindings = validatePublicOrigin(header);
      validatedOrigins.set(row.battleId, bindings);
    }
    const publicEvent = validatePublicEvent(
      row.publicEvent,
      row.battleId,
      bindings,
      snapshot.presentationSchemaVersion,
    );
    if (row.sequence !== publicEvent.sequence || row.combatTimeMs !== publicEvent.combatTimeMs) fail();
    const tail = battles.at(-1);
    if (!tail || tail.presentation.battleId !== row.battleId) {
      if (visited.has(row.battleId) || battles.length >= MAX_ENVELOPES) fail();
      visited.add(row.battleId);
      const bootstrapping = row.sequence === 1;
      if (bootstrapping !== (publicEvent.kind === "BattleStarted")) fail();
      if (previousBattleId === row.battleId && bootstrapping) fail();
      if (previousBattleId !== null && previousBattleId !== row.battleId && !bootstrapping) fail();
      const presentation = snapshot.presentationSchemaVersion === "pokenexus.combat-presentation.v2"
        ? bootstrapping
          ? {
              kind: "bootstrap" as const,
              schemaVersion: "pokenexus.combat-presentation.v2" as const,
              sourceCombatEventSchemaVersion: snapshot.sourceCombatEventSchemaVersion,
              battleId: row.battleId,
              initialSides: bindings.sides,
              initialParticipants: bindings.participants,
              events: [publicEvent as CombatPresentationEventV2],
            }
          : {
              kind: "continuation" as const,
              schemaVersion: "pokenexus.combat-presentation.v2" as const,
              sourceCombatEventSchemaVersion: snapshot.sourceCombatEventSchemaVersion,
              battleId: row.battleId,
              events: [publicEvent as CombatPresentationEventV2],
            }
        : bootstrapping
          ? {
              kind: "bootstrap" as const,
              schemaVersion: "pokenexus.combat-presentation.v1" as const,
              sourceCombatEventSchemaVersion: snapshot.sourceCombatEventSchemaVersion,
              battleId: row.battleId,
              initialSides: bindings.sides,
              initialParticipants: bindings.participants,
              events: [publicEvent as CombatPresentationEventV1],
            }
          : {
              kind: "continuation" as const,
              schemaVersion: "pokenexus.combat-presentation.v1" as const,
              sourceCombatEventSchemaVersion: snapshot.sourceCombatEventSchemaVersion,
              battleId: row.battleId,
              events: [publicEvent as CombatPresentationEventV1],
            };
      battles.push({
        encounterId: header.encounterId,
        encounterOrdinal: header.encounterOrdinal,
        battleStartedAtHuntTimeMs: String(header.battleStartedAtHuntTimeMs),
        presentation,
      });
    } else {
      const index = battles.length - 1;
      if (tail.presentation.schemaVersion === "pokenexus.combat-presentation.v2") {
        battles[index] = {
          ...tail,
          presentation: {
            ...tail.presentation,
            events: [...tail.presentation.events, publicEvent as CombatPresentationEventV2],
          },
        };
      } else {
        if (publicEvent.kind === "CombatantRevived") fail();
        battles[index] = {
          ...tail,
          presentation: {
            ...tail.presentation,
            events: [...tail.presentation.events, publicEvent as CombatPresentationEventV1],
          },
        };
      }
    }
    priorIndex = row.eventIndex;
    previousBattleId = row.battleId;
  }
  if (!input.events.length && startIndex !== highwater) fail();
  const hasMore = priorIndex < highwater;
  const last = input.events.at(-1);
  const position: PresentationCursorPosition = last ? {
    kind: "event",
    eventIndex: last.eventIndex.toString(),
    encounterId: headers.get(last.battleId)!.encounterId,
    encounterOrdinal: headers.get(last.battleId)!.encounterOrdinal,
    battleId: last.battleId,
    lastSequence: last.sequence,
    lastCombatTimeMs: last.combatTimeMs,
  } : after;
  const cursorContents: PresentationCursorContents = {
    playerId, huntId, snapshot, position, limit,
    purpose: hasMore ? "next" : "resume",
  };
  const cursor = hasMore || !snapshot.isTerminal
    ? await cursorCodec.issue(cursorContents, nowMs)
    : null;
  const page: HuntPresentationPageV1 = {
    huntId,
    presentationSchemaVersion: snapshot.presentationSchemaVersion,
    sourceCombatEventSchemaVersion: snapshot.sourceCombatEventSchemaVersion,
    stream: {
      snapshotId: immutablePublicSnapshotId(huntId, snapshot),
      committedLogicalTimeMs: snapshot.committedLogicalTimeMs,
      isTerminal: snapshot.isTerminal,
    },
    battles,
    hasMore,
    nextCursor: hasMore ? cursor : null,
    resumeCursor: hasMore ? null : cursor,
  };
  if (encoder.encode(JSON.stringify(page)).byteLength > MAX_BODY_BYTES) {
    throw new RangeError("Hunt presentation response exceeds the 256-KiB transport budget");
  }
  return page;
}
