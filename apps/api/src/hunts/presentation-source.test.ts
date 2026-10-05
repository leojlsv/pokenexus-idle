import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SoloHuntBattleOrigin,
  SoloHuntRuntimeInputs,
  SoloHuntRuntimeState,
  SoloHuntSimulationEvent,
} from "@pokenexus/game-core";

const fake = vi.hoisted(() => ({
  stream: {
    status: "available",
    isTerminal: false,
    inputSchemaVersion: "hunt-runtime-inputs-v4",
    checkpointSchemaVersion: "pokenexus.solo-hunt-checkpoint.v4",
    gameDataVersion: "data:v1",
    rulesVersion: "rules:v1",
    sourceEventSchemaVersion: "events:v1",
    presentationSchemaVersion: "pokenexus.combat-presentation.v2",
  },
  prior: null as null | {
    continuationContext: unknown;
    initialSides: unknown;
    initialParticipants: unknown;
    contextValid: boolean;
  },
  rows: [] as Array<{
    initialSides: unknown;
    initialParticipants: unknown;
    privateOrigin: unknown;
    publicEvents: ReadonlyArray<{
      readonly publicEvent: Record<string, unknown>;
      readonly publicBytes: Uint8Array;
      readonly privateSourceBytes: Uint8Array;
    }>;
  }>,
  unavailable: [] as string[],
}));

vi.mock("@pokenexus/database", () => ({
  HUNT_PRESENTATION_SOURCE_EVENT_BATCH_BYTES_MAX: 1024 * 1024,
  loadHuntPresentationStream: vi.fn(async () => fake.stream),
  loadHuntPresentationPrivateBattle: vi.fn(async () => fake.prior),
  advanceHuntPresentationLogicalWatermarkInTransaction: vi.fn(async () => {}),
  appendHuntPresentationBattleInTransaction: vi.fn(async (
    _client: unknown,
    _playerId: string,
    _huntId: string,
    payload: {
      readonly initialSides: unknown;
      readonly initialParticipants: unknown;
      readonly privateOrigin: unknown;
      readonly continuationContext: unknown;
      readonly publicEvents: ReadonlyArray<{
        readonly publicEvent: Record<string, unknown>;
        readonly publicBytes: Uint8Array;
        readonly privateSourceBytes: Uint8Array;
      }>;
    },
  ) => {
    fake.rows.push(payload);
    fake.prior = {
      continuationContext: payload.continuationContext,
      initialSides: payload.initialSides,
      initialParticipants: payload.initialParticipants,
      contextValid: true,
    };
    return "appended";
  }),
  markHuntPresentationUnavailableInTransaction: vi.fn(async (
    _client: unknown, _playerId: string, _huntId: string, reason: string,
  ) => { fake.unavailable.push(reason); }),
  canonicalPresentationJson: (value: unknown) => JSON.stringify(value),
}));

import { publishCommittedHuntPresentation } from "./presentation-source";

const origin = {
  battleId: "battle:fixture",
  sourceVersions: {
    gameDataVersion: "data:v1",
    rulesVersion: "rules:v1",
    combatEventSchemaVersion: "events:v1",
  },
  individualizationSnapshot: {
    speciesId: "species:wild",
    level: 10,
    shiny: false,
  },
  sides: [
    { sideId: "side:owned", combatantIds: ["owned"], activeCombatantIds: ["owned"] },
    { sideId: "side:wild", combatantIds: ["wild"], activeCombatantIds: ["wild"] },
  ],
  participants: [
    {
      kind: "owned", combatantId: "owned", sideId: "side:owned",
      pokemonInstanceId: "pokemon:owned", speciesId: "species:owned",
      level: 10, shiny: true, currentHp: 31, maxHp: 31,
    },
    {
      kind: "wild", combatantId: "wild", sideId: "side:wild",
      speciesId: "species:wild", level: 10, shiny: false, state: "conscious",
    },
  ],
  initialEvents: [{
    kind: "BattleStarted", battleId: "battle:fixture", sequence: 1, combatTimeMs: 0,
  }],
} as unknown as SoloHuntBattleOrigin;

const state = {
  gameDataVersion: "data:v1",
  rulesVersion: "rules:v1",
  logicalTimeMs: 0,
  currentEncounter: {
    encounterId: "encounter:fixture",
    encounterOrdinal: 1,
    battleStartedAtHuntTimeMs: 0,
    battleOrigin: origin,
  },
  completedEncounterProvenance: [],
} as unknown as SoloHuntRuntimeState;

const inputs = {
  context: { combatEventSchemaVersion: "events:v1" },
} as unknown as SoloHuntRuntimeInputs;

const event = (raw: Record<string, unknown>): SoloHuntSimulationEvent => ({
  kind: "combat",
  huntTimeMs: 0,
  encounterId: "encounter:fixture" as never,
  event: raw as never,
});

describe("TASK-103 bounded writer consumes TASK-028 privacy projection", () => {
  beforeEach(() => {
    fake.prior = null;
    fake.rows.length = 0;
    fake.unavailable.length = 0;
  });

  it("reuses the exact PUBLIC bootstrap header for subsequent same-Battle continuation", async () => {
    const common = {
      transaction: {} as never,
      playerId: "player:test",
      huntId: "hunt:test",
      checkpointSchemaVersion: "pokenexus.solo-hunt-checkpoint.v4",
      committedState: state,
      inputs,
    };
    await publishCommittedHuntPresentation({
      ...common,
      generatedEvents: [event(origin.initialEvents[0] as unknown as Record<string, unknown>)],
    });
    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0]!.initialParticipants).toEqual(expect.arrayContaining([
      expect.objectContaining({
        vitality: expect.objectContaining({ visibility: "hidden" }),
      }),
    ]));
    const privateParticipants = (fake.rows[0]!.privateOrigin as SoloHuntBattleOrigin).participants;
    expect(privateParticipants).toBe(origin.participants);
    await publishCommittedHuntPresentation({
      ...common,
      generatedEvents: [
        event({ kind: "MoveUsed", sequence: 2, combatTimeMs: 0,
          actorId: "owned", moveId: "shock", targetIds: ["wild"] }),
        event({ kind: "MoveImmune", sequence: 3, combatTimeMs: 0,
          actorId: "owned", moveId: "shock", targetId: "wild" }),
      ],
    });
    expect(fake.unavailable).toEqual([]);
    expect(fake.rows).toHaveLength(2);
    expect(fake.rows[1]!.initialParticipants).toEqual(fake.rows[0]!.initialParticipants);
    expect(fake.rows[1]!.initialSides).toEqual(fake.rows[0]!.initialSides);
    expect(fake.rows[1]!.publicEvents).toHaveLength(2);
    expect(fake.rows[1]!.publicEvents[0]!.publicEvent).toMatchObject({ sequence: 2 });
  });

  it("fails closed on an absent immutable Battle origin without publishing raw events", async () => {
    await publishCommittedHuntPresentation({
      transaction: {} as never,
      playerId: "player:test",
      huntId: "hunt:test",
      checkpointSchemaVersion: "pokenexus.solo-hunt-checkpoint.v4",
      committedState: { ...state, currentEncounter: { ...state.currentEncounter!, battleOrigin: undefined } },
      inputs,
      generatedEvents: [event(origin.initialEvents[0] as unknown as Record<string, unknown>)],
    });
    expect(fake.unavailable).toEqual(["immutable_battle_origin_unavailable"]);
    expect(fake.rows).toHaveLength(0);
  });

  it("guards combined raw+public event bytes across Battle groups in one OCC publication", async () => {
    // Deliberate synthetic projector-shape stress. The 5500-byte move IDs are
    // NOT a claim of admissible production content: this tests the publisher's
    // defense in depth independently of the core's pre-stimulus byte yield.
    const largeMoveId = `move:${"x".repeat(5500)}`;
    const makeGroup = (encounterId: string, battleId: string) => {
      const raw = [
        { kind: "BattleStarted", battleId, sequence: 1, combatTimeMs: 0 },
        ...Array.from({ length: 62 }, (_unused, index) => ({
          kind: "MoveUsed", sequence: index + 2, combatTimeMs: 0,
          actorId: "owned", moveId: largeMoveId, targetIds: ["wild"],
        })),
      ];
      return {
        origin: { ...origin, battleId, initialEvents: raw.slice(0, 1) },
        events: raw.map((entry) => ({
          ...event(entry), encounterId: encounterId as never,
        })),
      };
    };
    const first = makeGroup("encounter:fixture", "battle:fixture");
    const second = makeGroup("encounter:second", "battle:second");
    const twoBattleState = {
      ...state,
      completedEncounterProvenance: [{
        encounterId: "encounter:fixture", encounterOrdinal: 1,
        battleStartedAtHuntTimeMs: 0, battleOrigin: first.origin,
      }],
      currentEncounter: {
        ...state.currentEncounter,
        encounterId: "encounter:second", encounterOrdinal: 2,
        battleOrigin: second.origin,
      },
    } as unknown as SoloHuntRuntimeState;
    await publishCommittedHuntPresentation({
      transaction: {} as never,
      playerId: "player:test",
      huntId: "hunt:test",
      checkpointSchemaVersion: "pokenexus.solo-hunt-checkpoint.v4",
      committedState: twoBattleState,
      inputs,
      generatedEvents: [...first.events, ...second.events],
    });
    expect(fake.rows).toHaveLength(1);
    expect(first.events.length + second.events.length).toBeLessThanOrEqual(128);
    const acceptedGroupBytes = fake.rows[0]!.publicEvents.reduce((sum, entry) =>
      sum + entry.privateSourceBytes.byteLength + entry.publicBytes.byteLength, 0);
    expect(acceptedGroupBytes).toBeLessThan(1024 * 1024);
    expect(acceptedGroupBytes).toBeGreaterThan(1024 * 1024 / 2);
    expect(fake.unavailable).toEqual(["oversized_projection_batch"]);
  });
});
