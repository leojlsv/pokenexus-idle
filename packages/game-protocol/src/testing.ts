import {
  COMBAT_PRESENTATION_SCHEMA_VERSION_V1,
  type CombatPresentationBootstrapEnvelopeV1,
  type CombatPresentationContinuationEnvelopeV1,
} from "./combat-presentation";

/**
 * Renderer-neutral, engine-producible fixture segments for TASK-029/TASK-030 behavior tests.
 * Segment 1 mirrors battle initialization (`BattleStarted` only when there are no battle-start reactions).
 * Segment 2 mirrors the authoritative immunity branch (`MoveUsed` then `MoveImmune`).
 */
export const COMBAT_PRESENTATION_FIXTURE_V1 = {
  bootstrap: {
    kind: "bootstrap",
    schemaVersion: COMBAT_PRESENTATION_SCHEMA_VERSION_V1,
    sourceCombatEventSchemaVersion: "events-v1",
    battleId: "battle:fixture",
    initialSides: [
      {
        sideId: "side:player",
        combatantIds: ["combatant:owned", "combatant:owned-reserve"],
        activeCombatantIds: ["combatant:owned"],
      },
      {
        sideId: "side:wild",
        combatantIds: ["combatant:wild"],
        activeCombatantIds: ["combatant:wild"],
      },
    ],
    initialParticipants: [
      {
        combatantId: "combatant:owned",
        sideId: "side:player",
        identity: {
          kind: "owned_pokemon",
          pokemonInstanceId: "pokemon:owned",
          speciesId: "species:owned",
          level: 10,
          shiny: false,
        },
        vitality: { visibility: "exact", state: "conscious", currentHp: 30, maxHp: 30 },
      },
      {
        combatantId: "combatant:owned-reserve",
        sideId: "side:player",
        identity: {
          kind: "owned_pokemon",
          pokemonInstanceId: "pokemon:owned-reserve",
          speciesId: "species:owned-reserve",
          level: 10,
          shiny: false,
        },
        vitality: { visibility: "exact", state: "conscious", currentHp: 30, maxHp: 30 },
      },
      {
        combatantId: "combatant:wild",
        sideId: "side:wild",
        identity: {
          kind: "wild_pokemon",
          speciesId: "species:wild",
          level: 10,
          shiny: true,
        },
        vitality: { visibility: "hidden", state: "conscious" },
      },
    ],
    events: [{ kind: "BattleStarted", sequence: 1, combatTimeMs: 0, battleId: "battle:fixture" }],
  } satisfies CombatPresentationBootstrapEnvelopeV1,
  continuations: [
    {
      kind: "continuation",
      schemaVersion: COMBAT_PRESENTATION_SCHEMA_VERSION_V1,
      sourceCombatEventSchemaVersion: "events-v1",
      battleId: "battle:fixture",
      events: [
        {
          kind: "MoveUsed",
          sequence: 2,
          combatTimeMs: 0,
          actorId: "combatant:owned",
          moveId: "shock",
          targetIds: ["combatant:wild"],
        },
        {
          kind: "MoveImmune",
          sequence: 3,
          combatTimeMs: 0,
          actorId: "combatant:owned",
          moveId: "shock",
          targetId: "combatant:wild",
        },
      ],
    } satisfies CombatPresentationContinuationEnvelopeV1,
  ],
} as const;
