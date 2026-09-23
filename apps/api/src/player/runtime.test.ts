import type { OwnedPokemonRecord } from "@pokenexus/database";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pokemon: null as OwnedPokemonRecord | null,
  loadError: null as Error | null,
}));

vi.mock("@pokenexus/database", async (importOriginal) => {
  const original = await importOriginal<typeof import("@pokenexus/database")>();
  return {
    ...original,
    findPlayerByAccountId: vi.fn(async () => ({
      playerId: "0199472a-0000-7000-8000-000000000001",
    })),
    withPgClient: vi.fn(async (_options, operation) => operation({ query: vi.fn() })),
  };
});

vi.mock("../moves/application", async (importOriginal) => {
  const original = await importOriginal<typeof import("../moves/application")>();
  return {
    ...original,
    createPgMoveLoadoutRepository: vi.fn(() => ({
      loadOwnedPokemon: vi.fn(async () => {
        if (state.loadError) throw state.loadError;
        return state.pokemon;
      }),
      replaceOwnedPokemonMoveLoadout: vi.fn(async () => ({ status: "updated", rowVersion: 8n })),
    })),
  };
});

import { createPlayerApplicationFromEnvironment, type PlayerStateEnvironment } from "./runtime";

const accountId = "0199472a-0000-7000-8000-000000000010";
const pokemonInstanceId = "0199472a-0000-7000-8000-000000000101";
const now = new Date("2026-09-22T20:00:00.000Z");

function pokemon(rowVersion: bigint): OwnedPokemonRecord {
  return {
    pokemonInstanceId,
    ownerPlayerId: "0199472a-0000-7000-8000-000000000001",
    speciesId: "species:test",
    level: 10,
    ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    selectedAbilityId: null,
    moveLoadout: { state: "selected", moveIds: ["move:a"] },
    rowVersion,
    createdAt: now,
    updatedAt: now,
  };
}

function app(env: Partial<PlayerStateEnvironment> = {}) {
  return createPlayerApplicationFromEnvironment({
    HYPERDRIVE: { connectionString: "postgres://unit-test.invalid/pokenexus" },
    ...env,
  });
}

const command = {
  pokemonInstanceId,
  expectedRowVersion: 7n,
  moveIds: ["move:a"],
} as const;

describe("Player Move runtime authority ordering", () => {
  it("preserves not-found and stale results before resolving missing Move authority config", async () => {
    state.loadError = null;
    state.pokemon = null;
    await expect(app().replaceMoveLoadout(accountId, command)).resolves.toEqual({ status: "not_found" });

    state.pokemon = pokemon(9n);
    await expect(app().replaceMoveLoadout(accountId, command)).resolves.toEqual({
      status: "stale",
      rowVersion: 9n,
    });
  });

  it("fails a fresh owned Move command closed when required authority config is missing or malformed", async () => {
    state.loadError = null;
    state.pokemon = pokemon(7n);
    await expect(app().replaceMoveLoadout(accountId, command)).resolves.toEqual({
      status: "authority_unavailable",
    });

    await expect(app({
      PLAYER_STATE_MOVE_GAME_DATA_VERSION: "game-data:test",
      PLAYER_STATE_MOVE_RULES_VERSION: "rules:test",
      PLAYER_STATE_MOVE_CONTEXT_RELEASES: "not-json",
    }).replaceMoveLoadout(accountId, command)).resolves.toEqual({
      status: "authority_unavailable",
    });

    await expect(app({
      PLAYER_STATE_GAME_DATA_BASE_URL: "https://game-data.invalid/",
      PLAYER_STATE_MOVE_GAME_DATA_VERSION: "game-data:test",
      PLAYER_STATE_MOVE_RULES_VERSION: "rules:test",
      PLAYER_STATE_MOVE_CONTEXT_RELEASES: JSON.stringify([{
        gameDataVersion: "game-data:test",
        rulesVersion: "rules:test",
        newOperationsAllowed: true,
      }]),
      PLAYER_STATE_MOVE_GAME_DATA_RELEASES: JSON.stringify([{
        gameDataVersion: "game-data:test",
        newOperationsAllowed: true,
      }]),
      PLAYER_STATE_MOVE_RULE_RELEASES: JSON.stringify([{
        rulesVersion: "rules:test",
        newOperationsAllowed: true,
        productionSelectability: {
          artifactId: "artifact:test",
          semanticHash: `sha256:${"a".repeat(64)}`,
          supportProfileArtifactId: "profile:test",
          supportProfileContentHash: `sha256:${"b".repeat(64)}`,
          combatRuleCatalogArtifactId: "catalog:test",
        },
      }]),
    }).replaceMoveLoadout(accountId, command)).resolves.toEqual({
      status: "authority_unavailable",
    });
  });

  it("does not convert repository infrastructure faults into Move authority failures", async () => {
    const databaseFailure = new Error("database unavailable");
    state.loadError = databaseFailure;
    state.pokemon = null;
    await expect(app().replaceMoveLoadout(accountId, command)).rejects.toBe(databaseFailure);
    state.loadError = null;
  });
});
