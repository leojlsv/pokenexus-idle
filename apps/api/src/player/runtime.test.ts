import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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
import {
  PRODUCTION_COMBAT_V2_RULES_RELEASE_DESCRIPTOR,
  PRODUCTION_COMBAT_V2_RULES_VERSION,
  PRODUCTION_COMBAT_V3_RULES_RELEASE_DESCRIPTOR,
  PRODUCTION_COMBAT_V3_RULES_VERSION,
} from "../moves/context";

const accountId = "0199472a-0000-7000-8000-000000000010";
const pokemonInstanceId = "0199472a-0000-7000-8000-000000000101";
const now = new Date("2026-09-22T20:00:00.000Z");
const publishedGameDataRoot = resolve(process.cwd(), "../../packages/game-data/published");
const productionGameDataBaseUrl = "https://task-095-game-data.test/";
const V2 = "game-data-core-kanto-johto-v2";
const V3 = "game-data-core-kanto-johto-v3";
const ampharosSpeciesId = "candidate:species:pokedex-ampharos-181:b682912fc8";
const dragonPulseMoveId = "candidate:move:dragon-pulse:54d897ab30";

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

function productionEnvironment(
  gameDataVersion: string,
  rulesVersion: string,
): Partial<PlayerStateEnvironment> {
  return {
    PLAYER_STATE_GAME_DATA_BASE_URL: productionGameDataBaseUrl,
    PLAYER_STATE_MOVE_GAME_DATA_VERSION: gameDataVersion,
    PLAYER_STATE_MOVE_RULES_VERSION: rulesVersion,
    PLAYER_STATE_MOVE_CONTEXT_RELEASES: JSON.stringify([
      {
        gameDataVersion: V2,
        rulesVersion: PRODUCTION_COMBAT_V2_RULES_VERSION,
        newOperationsAllowed: true,
      },
      {
        gameDataVersion: V3,
        rulesVersion: PRODUCTION_COMBAT_V3_RULES_VERSION,
        newOperationsAllowed: true,
      },
    ]),
    PLAYER_STATE_MOVE_GAME_DATA_RELEASES: JSON.stringify([
      { gameDataVersion: V2, newOperationsAllowed: true },
      { gameDataVersion: V3, newOperationsAllowed: true },
    ]),
    PLAYER_STATE_MOVE_RULE_RELEASES: JSON.stringify([
      {
        rulesVersion: PRODUCTION_COMBAT_V2_RULES_RELEASE_DESCRIPTOR.rulesVersion,
        newOperationsAllowed: true,
        productionSelectability: PRODUCTION_COMBAT_V2_RULES_RELEASE_DESCRIPTOR.productionSelectability,
      },
      {
        rulesVersion: PRODUCTION_COMBAT_V3_RULES_RELEASE_DESCRIPTOR.rulesVersion,
        newOperationsAllowed: true,
        productionSelectability: PRODUCTION_COMBAT_V3_RULES_RELEASE_DESCRIPTOR.productionSelectability,
      },
    ]),
  };
}

function singleProductionReleaseEnvironment(
  gameDataVersion: string,
  rulesVersion: string,
  productionSelectability: NonNullable<
    typeof PRODUCTION_COMBAT_V2_RULES_RELEASE_DESCRIPTOR.productionSelectability
  >,
): Partial<PlayerStateEnvironment> {
  return {
    ...productionEnvironment(gameDataVersion, rulesVersion),
    PLAYER_STATE_MOVE_CONTEXT_RELEASES: JSON.stringify([
      { gameDataVersion, rulesVersion, newOperationsAllowed: true },
    ]),
    PLAYER_STATE_MOVE_GAME_DATA_RELEASES: JSON.stringify([
      { gameDataVersion, newOperationsAllowed: true },
    ]),
    PLAYER_STATE_MOVE_RULE_RELEASES: JSON.stringify([
      { rulesVersion, newOperationsAllowed: true, productionSelectability },
    ]),
  };
}

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

  it("resolves the exact v3 + new production rules pair through environment configuration", async () => {
    state.loadError = null;
    state.pokemon = {
      ...pokemon(7n),
      speciesId: ampharosSpeciesId,
      level: 20,
      moveLoadout: { state: "selected", moveIds: [dragonPulseMoveId] },
    };
    const fetchedPaths: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (url.origin !== new URL(productionGameDataBaseUrl).origin) {
        throw new Error("unexpected test fetch origin");
      }
      const relativePath = url.pathname.replace(/^\/+/, "");
      fetchedPaths.push(relativePath);
      try {
        const bytes = await readFile(resolve(publishedGameDataRoot, relativePath));
        return new Response(Uint8Array.from(bytes).buffer, { status: 200 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return new Response(null, { status: 404 });
        }
        throw error;
      }
    });

    try {
      await expect(app(productionEnvironment(V3, PRODUCTION_COMBAT_V3_RULES_VERSION))
        .replaceMoveLoadout(accountId, {
          pokemonInstanceId,
          expectedRowVersion: 7n,
          moveIds: [dragonPulseMoveId],
        })).resolves.toEqual({
          status: "updated",
          rowVersion: 8n,
          moveIds: [dragonPulseMoveId],
        });
      expect(fetchedPaths).toHaveLength(6);
      expect(fetchedPaths[0]).toMatch(/^version-[0-9a-f]{64}\/manifest\.json$/);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("rejects v3 + retained-v2 rules before any game-data fetch", async () => {
    state.loadError = null;
    state.pokemon = {
      ...pokemon(7n),
      speciesId: ampharosSpeciesId,
      level: 20,
      moveLoadout: { state: "selected", moveIds: [dragonPulseMoveId] },
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      await expect(app(productionEnvironment(V3, PRODUCTION_COMBAT_V2_RULES_VERSION))
        .replaceMoveLoadout(accountId, {
          pokemonInstanceId,
          expectedRowVersion: 7n,
          moveIds: [dragonPulseMoveId],
        })).resolves.toEqual({ status: "authority_unavailable" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("rejects explicitly listed production cross-pairs with canonical descriptors before fetch", async () => {
    state.loadError = null;
    state.pokemon = {
      ...pokemon(7n),
      speciesId: ampharosSpeciesId,
      level: 20,
      moveLoadout: { state: "selected", moveIds: [dragonPulseMoveId] },
    };
    const retainedProductionSelectability = PRODUCTION_COMBAT_V2_RULES_RELEASE_DESCRIPTOR.productionSelectability;
    const reboundProductionSelectability = PRODUCTION_COMBAT_V3_RULES_RELEASE_DESCRIPTOR.productionSelectability;
    if (!retainedProductionSelectability || !reboundProductionSelectability) {
      throw new Error("production test fixtures require selectability descriptors");
    }
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch must not occur"));
    try {
      const explicitCrossPairs = [
        singleProductionReleaseEnvironment(
          V3,
          PRODUCTION_COMBAT_V2_RULES_VERSION,
          retainedProductionSelectability,
        ),
        singleProductionReleaseEnvironment(
          V2,
          PRODUCTION_COMBAT_V3_RULES_VERSION,
          reboundProductionSelectability,
        ),
      ];
      for (const env of explicitCrossPairs) {
        await expect(app(env).replaceMoveLoadout(accountId, {
          pokemonInstanceId,
          expectedRowVersion: 7n,
          moveIds: [dragonPulseMoveId],
        })).resolves.toEqual({ status: "authority_unavailable" });
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("rejects descriptor-swapped known production rulesVersions before any game-data fetch", async () => {
    state.loadError = null;
    state.pokemon = {
      ...pokemon(7n),
      speciesId: ampharosSpeciesId,
      level: 20,
      moveLoadout: { state: "selected", moveIds: [dragonPulseMoveId] },
    };
    const retainedProductionSelectability = PRODUCTION_COMBAT_V2_RULES_RELEASE_DESCRIPTOR.productionSelectability;
    const reboundProductionSelectability = PRODUCTION_COMBAT_V3_RULES_RELEASE_DESCRIPTOR.productionSelectability;
    if (!retainedProductionSelectability || !reboundProductionSelectability) {
      throw new Error("production test fixtures require selectability descriptors");
    }
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch must not occur"));
    try {
      const swappedCases = [
        singleProductionReleaseEnvironment(
          V3,
          PRODUCTION_COMBAT_V2_RULES_VERSION,
          reboundProductionSelectability,
        ),
        singleProductionReleaseEnvironment(
          V2,
          PRODUCTION_COMBAT_V3_RULES_VERSION,
          retainedProductionSelectability,
        ),
      ];
      for (const env of swappedCases) {
        await expect(app(env).replaceMoveLoadout(accountId, {
          pokemonInstanceId,
          expectedRowVersion: 7n,
          moveIds: [dragonPulseMoveId],
        })).resolves.toEqual({ status: "authority_unavailable" });
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("rejects an explicitly listed production catalog alias before any game-data fetch", async () => {
    state.loadError = null;
    state.pokemon = {
      ...pokemon(7n),
      speciesId: ampharosSpeciesId,
      level: 20,
      moveLoadout: { state: "selected", moveIds: [dragonPulseMoveId] },
    };
    const reboundProductionSelectability = PRODUCTION_COMBAT_V3_RULES_RELEASE_DESCRIPTOR.productionSelectability;
    if (!reboundProductionSelectability) {
      throw new Error("production test fixture requires selectability descriptor");
    }
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fetch must not occur"));
    try {
      await expect(app(singleProductionReleaseEnvironment(
        V3,
        "rules:production-alias",
        reboundProductionSelectability,
      )).replaceMoveLoadout(accountId, {
        pokemonInstanceId,
        expectedRowVersion: 7n,
        moveIds: [dragonPulseMoveId],
      })).resolves.toEqual({ status: "authority_unavailable" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
