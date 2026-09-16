import { createCadenceCarry, initializeBattle, resolveCombatStimulus } from "../battle";
import type {
  BattleState,
  CadenceCarryState,
  CombatEvent,
  CombatEventSchemaVersion,
  CombatStimulus,
  DeterministicState,
  GameDataVersion,
  RulesVersion,
  TransitionResult,
} from "../types";
import type { CombatReplayFixture } from "./combat-fixtures";

type BattleEndedEvent = Extract<CombatEvent, { kind: "BattleEnded" }>;

export type ReplayContextRef = Readonly<{
  gameDataVersion: GameDataVersion;
  rulesVersion: RulesVersion;
  combatEventSchemaVersion: CombatEventSchemaVersion;
}>;

export type ReplayInitialization = Readonly<{
  accepted: boolean;
  events: ReadonlyArray<CombatEvent>;
  state?: BattleState;
  deterministicState: DeterministicState;
}>;

export type ReplayTransition = Readonly<{
  stimulus: CombatStimulus;
  accepted: boolean;
  events: ReadonlyArray<CombatEvent>;
  state?: BattleState;
  deterministicState: DeterministicState;
}>;

export type CombatReplayTranscript = Readonly<{
  contextRef: ReplayContextRef;
  orderedStimuli: ReadonlyArray<CombatStimulus>;
  initialization: ReplayInitialization;
  transitions: ReadonlyArray<ReplayTransition>;
  flattenedEvents: ReadonlyArray<CombatEvent>;
  finalState?: BattleState;
  finalOutcome?: BattleEndedEvent["outcome"];
  finalDeterministicState: DeterministicState;
  finalCadenceCarry?: CadenceCarryState;
}>;

export type ReplayDiagnostics = Readonly<{
  initializationReason?: string;
  transitionReasons: ReadonlyArray<string | undefined>;
}>;

export type CombatReplayExecution = Readonly<{
  transcript: CombatReplayTranscript;
  diagnostics: ReplayDiagnostics;
}>;

function terminalOutcome(events: ReadonlyArray<CombatEvent>): BattleEndedEvent["outcome"] | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.kind === "BattleEnded") return event.outcome;
  }
  return undefined;
}

function transitionReason(result: TransitionResult): string | undefined {
  return result.accepted ? undefined : result.reason;
}

export function runCombatReplayFixture(fixture: CombatReplayFixture): CombatReplayExecution {
  const initialized = initializeBattle(fixture.initialBattle);
  const initialization: ReplayInitialization = {
    accepted: initialized.accepted,
    events: initialized.events,
    ...(initialized.accepted ? { state: initialized.state } : {}),
    deterministicState: initialized.deterministicState,
  };
  const flattenedEvents: CombatEvent[] = [...initialized.events];
  const transitions: ReplayTransition[] = [];
  const transitionReasons: Array<string | undefined> = [];
  let finalState = initialized.accepted ? initialized.state : undefined;
  let deterministicState = initialized.deterministicState;

  if (finalState) {
    for (const stimulus of fixture.stimuli) {
      const result = resolveCombatStimulus(finalState, stimulus, deterministicState);
      transitions.push({
        stimulus,
        accepted: result.accepted,
        events: result.events,
        ...(result.state ? { state: result.state } : {}),
        deterministicState: result.deterministicState,
      });
      transitionReasons.push(transitionReason(result));
      flattenedEvents.push(...result.events);
      finalState = result.state ?? finalState;
      deterministicState = result.deterministicState;
    }
  }

  const transcript: CombatReplayTranscript = {
    contextRef: {
      gameDataVersion: fixture.initialBattle.context.gameDataVersion,
      rulesVersion: fixture.initialBattle.context.rulesVersion,
      combatEventSchemaVersion: fixture.initialBattle.context.combatEventSchemaVersion,
    },
    orderedStimuli: fixture.stimuli,
    initialization,
    transitions,
    flattenedEvents,
    ...(finalState ? { finalState } : {}),
    ...(terminalOutcome(flattenedEvents) ? { finalOutcome: terminalOutcome(flattenedEvents) } : {}),
    finalDeterministicState: deterministicState,
    ...(finalState ? { finalCadenceCarry: createCadenceCarry(finalState) } : {}),
  };

  return {
    transcript,
    diagnostics: {
      ...(initialized.accepted ? {} : { initializationReason: initialized.reason }),
      transitionReasons,
    },
  };
}

type JsonScalar = string | number | boolean | null;
type JsonValue = JsonScalar | JsonValue[] | JsonObject;
interface JsonObject {
  readonly [key: string]: JsonValue;
}

function toStableJsonValue(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("test replay JSON does not support non-finite numbers");
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => {
      const encoded = toStableJsonValue(entry);
      if (encoded === undefined) throw new TypeError("test replay JSON does not support undefined array entries");
      return encoded;
    });
  }
  if (typeof value === "object") {
    const encoded = Object.create(null) as Record<string, JsonValue>;
    for (const key of Object.keys(value).sort()) {
      const child = toStableJsonValue((value as Record<string, unknown>)[key]);
      if (child !== undefined) encoded[key] = child;
    }
    return encoded;
  }
  throw new TypeError(`test replay JSON does not support ${typeof value}`);
}

function stableSerialize(value: unknown): string {
  const encoded = toStableJsonValue(value);
  if (encoded === undefined) throw new TypeError("test replay JSON root cannot be undefined");
  return JSON.stringify(encoded);
}

function decodeEnvelope<T>(serialized: string, format: string): T {
  const parsed = JSON.parse(serialized) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("test replay JSON envelope must be an object");
  }
  const envelope = parsed as Record<string, unknown>;
  if (envelope.format !== format || !("value" in envelope)) {
    throw new TypeError(`unexpected test replay JSON format: ${String(envelope.format)}`);
  }
  return envelope.value as T;
}

const FIXTURE_FORMAT = "pokenexus-test-combat-fixture-v1";
const TRANSCRIPT_FORMAT = "pokenexus-test-combat-transcript-v1";

export function serializeReplayFixtureForTest(fixture: CombatReplayFixture): string {
  return stableSerialize({ format: FIXTURE_FORMAT, value: fixture });
}

export function deserializeReplayFixtureForTest(serialized: string): CombatReplayFixture {
  return decodeEnvelope<CombatReplayFixture>(serialized, FIXTURE_FORMAT);
}

export function serializeReplayTranscriptForTest(transcript: CombatReplayTranscript): string {
  return stableSerialize({ format: TRANSCRIPT_FORMAT, value: transcript });
}

export function deserializeReplayTranscriptForTest(serialized: string): CombatReplayTranscript {
  return decodeEnvelope<CombatReplayTranscript>(serialized, TRANSCRIPT_FORMAT);
}
