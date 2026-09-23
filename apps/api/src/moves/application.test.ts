import { describe, expect, it, vi } from "vitest";
import type { OwnedPokemonRecord } from "@pokenexus/database";
import {
  MoveEligibilityApplicationService,
  type MoveLoadoutRepository,
} from "./application";
import type { MoveEligibilityContext } from "./context";

const NOW = new Date("2026-09-22T19:00:00.000Z");

function pokemon(overrides: Partial<OwnedPokemonRecord> = {}): OwnedPokemonRecord {
  return {
    pokemonInstanceId: "00000000-0000-0000-0000-000000000101",
    ownerPlayerId: "00000000-0000-0000-0000-000000000001",
    speciesId: "species:test",
    level: 10,
    ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    selectedAbilityId: null,
    moveLoadout: { state: "uninitialized", moveIds: [] },
    rowVersion: 7n,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function context(
  levels: Record<string, number> = {
    "move:one": 1,
    "move:two": 5,
    "move:later": 20,
  },
  productionExecutableMoveIds: readonly string[] | null = null,
): MoveEligibilityContext {
  return {
    pair: { gameDataVersion: "game-data:test", rulesVersion: "rules:test" },
    rules: {
      rulesVersion: "rules:test",
      moveEligibilityRuleArtifactId: "pokenexus.move-eligibility.level-up-only.v1",
      moveEligibilityRuleSemanticsHash:
        "sha256:810632522a8d12834ad7aec2beb5f2ade3c45f11dcac08dce4d5a43206235363",
    },
    speciesIds: new Set(["species:test"]),
    moveIds: new Set(Object.keys(levels)),
    learnsetsBySpecies: new Map([[
      "species:test",
      Object.entries(levels).map(([moveId, level]) => ({
        speciesId: "species:test" as never,
        moveId: moveId as never,
        sourceGeneration: 8,
        sourceGame: "test",
        method: "level-up" as const,
        level,
        machineIdentifier: null,
        sourceRecordIds: ["source:test"],
      })),
    ]]),
    productionExecutableMoveIds: productionExecutableMoveIds === null
      ? null
      : [...productionExecutableMoveIds],
    productionCatalog: null,
  };
}

function harness(options: {
  pokemon?: OwnedPokemonRecord | null;
  context?: MoveEligibilityContext;
  replaceResult?: Awaited<ReturnType<MoveLoadoutRepository["replaceOwnedPokemonMoveLoadout"]>>;
} = {}) {
  const repository: MoveLoadoutRepository = {
    loadOwnedPokemon: vi.fn(async () => options.pokemon === undefined ? pokemon() : options.pokemon),
    replaceOwnedPokemonMoveLoadout: vi.fn(async () =>
      options.replaceResult ?? ({ status: "updated", rowVersion: 8n } as const)),
  };
  const contextLoader = {
    loadForNewOperation: vi.fn(async () => options.context ?? context()),
  };
  return {
    repository,
    contextLoader,
    service: new MoveEligibilityApplicationService(repository, contextLoader),
  };
}

describe("MoveEligibilityApplicationService.replaceMoveLoadout", () => {
  it("validates the complete ordered proposal against current eligibility and preserves order", async () => {
    const h = harness();
    const result = await h.service.replaceMoveLoadout({
      ownerPlayerId: pokemon().ownerPlayerId,
      pokemonInstanceId: pokemon().pokemonInstanceId,
      expectedRowVersion: 7n,
      moveIds: ["move:two", "move:one"],
      now: NOW,
    });

    expect(result).toEqual({
      status: "updated",
      rowVersion: 8n,
      moveIds: ["move:two", "move:one"],
    });
    expect(h.repository.replaceOwnedPokemonMoveLoadout).toHaveBeenCalledWith({
      ownerPlayerId: pokemon().ownerPlayerId,
      pokemonInstanceId: pokemon().pokemonInstanceId,
      expectedRowVersion: 7n,
      moveIds: ["move:two", "move:one"],
      now: NOW,
    });
  });

  it("rejects not-owned/not-found and initially stale state before context resolution", async () => {
    const missing = harness({ pokemon: null });
    await expect(missing.service.replaceMoveLoadout({
      ownerPlayerId: "owner",
      pokemonInstanceId: "pokemon",
      expectedRowVersion: 0n,
      moveIds: ["move:one"],
      now: NOW,
    })).resolves.toEqual({ status: "not_found" });
    expect(missing.contextLoader.loadForNewOperation).not.toHaveBeenCalled();

    const stale = harness({ pokemon: pokemon({ rowVersion: 9n }) });
    await expect(stale.service.replaceMoveLoadout({
      ownerPlayerId: pokemon().ownerPlayerId,
      pokemonInstanceId: pokemon().pokemonInstanceId,
      expectedRowVersion: 7n,
      moveIds: ["move:one"],
      now: NOW,
    })).resolves.toEqual({ status: "stale", rowVersion: 9n });
    expect(stale.contextLoader.loadForNewOperation).not.toHaveBeenCalled();
  });

  it("rejects invalid structure, unresolved Moves and current ineligibility without mutation", async () => {
    for (const moveIds of [[], ["move:one", "move:one"], ["a", "b", "c", "d", "e"]]) {
      const h = harness();
      const result = await h.service.replaceMoveLoadout({
        ownerPlayerId: pokemon().ownerPlayerId,
        pokemonInstanceId: pokemon().pokemonInstanceId,
        expectedRowVersion: 7n,
        moveIds,
        now: NOW,
      });
      expect(result).toEqual({ status: "invalid", reason: "invalid_structure" });
      expect(h.repository.replaceOwnedPokemonMoveLoadout).not.toHaveBeenCalled();
    }

    const unresolved = harness();
    await expect(unresolved.service.replaceMoveLoadout({
      ownerPlayerId: pokemon().ownerPlayerId,
      pokemonInstanceId: pokemon().pokemonInstanceId,
      expectedRowVersion: 7n,
      moveIds: ["move:unknown"],
      now: NOW,
    })).resolves.toEqual({
      status: "invalid",
      reason: "unresolved_move",
      moveId: "move:unknown",
    });

    const ineligible = harness();
    await expect(ineligible.service.replaceMoveLoadout({
      ownerPlayerId: pokemon().ownerPlayerId,
      pokemonInstanceId: pokemon().pokemonInstanceId,
      expectedRowVersion: 7n,
      moveIds: ["move:later"],
      now: NOW,
    })).resolves.toEqual({
      status: "invalid",
      reason: "ineligible_move",
      moveId: "move:later",
    });

    const unsupported = harness({ context: context(undefined, ["move:one"]) });
    await expect(unsupported.service.replaceMoveLoadout({
      ownerPlayerId: pokemon().ownerPlayerId,
      pokemonInstanceId: pokemon().pokemonInstanceId,
      expectedRowVersion: 7n,
      moveIds: ["move:two"],
      now: NOW,
    })).resolves.toEqual({
      status: "invalid",
      reason: "ineligible_move",
      moveId: "move:two",
    });
    expect(unsupported.repository.replaceOwnedPokemonMoveLoadout).not.toHaveBeenCalled();
  });

  it("preserves selected-only grandfathering but does not carry a legacy-ineligible Move through replacement", async () => {
    const legacy = pokemon({
      moveLoadout: { state: "selected", moveIds: ["move:legacy"] },
    });
    const h = harness({
      pokemon: legacy,
      context: {
        ...context(),
        moveIds: new Set(["move:legacy", "move:one", "move:two", "move:later"]),
      },
    });

    expect(legacy.moveLoadout).toEqual({ state: "selected", moveIds: ["move:legacy"] });
    await expect(h.service.replaceMoveLoadout({
      ownerPlayerId: legacy.ownerPlayerId,
      pokemonInstanceId: legacy.pokemonInstanceId,
      expectedRowVersion: legacy.rowVersion,
      moveIds: ["move:legacy", "move:one"],
      now: NOW,
    })).resolves.toEqual({
      status: "invalid",
      reason: "ineligible_move",
      moveId: "move:legacy",
    });
    expect(h.repository.replaceOwnedPokemonMoveLoadout).not.toHaveBeenCalled();
  });

  it("surfaces the persistence OCC race without reloading or retrying stale eligibility", async () => {
    const h = harness({ replaceResult: { status: "stale", rowVersion: 8n } });
    await expect(h.service.replaceMoveLoadout({
      ownerPlayerId: pokemon().ownerPlayerId,
      pokemonInstanceId: pokemon().pokemonInstanceId,
      expectedRowVersion: 7n,
      moveIds: ["move:one"],
      now: NOW,
    })).resolves.toEqual({ status: "stale", rowVersion: 8n });
    expect(h.repository.loadOwnedPokemon).toHaveBeenCalledOnce();
    expect(h.contextLoader.loadForNewOperation).toHaveBeenCalledOnce();
    expect(h.repository.replaceOwnedPokemonMoveLoadout).toHaveBeenCalledOnce();
  });
});

describe("MoveEligibilityApplicationService.bootstrapMoveLoadout", () => {
  it("never bootstraps an already-selected persisted loadout", async () => {
    const selected = pokemon({
      moveLoadout: { state: "selected", moveIds: ["move:legacy"] },
    });
    const h = harness({ pokemon: selected });
    await expect(h.service.bootstrapMoveLoadout({
      ownerPlayerId: selected.ownerPlayerId,
      pokemonInstanceId: selected.pokemonInstanceId,
      now: NOW,
    })).resolves.toEqual({
      status: "already_selected",
      rowVersion: selected.rowVersion,
      moveIds: ["move:legacy"],
    });
    expect(h.contextLoader.loadForNewOperation).not.toHaveBeenCalled();
    expect(h.repository.replaceOwnedPokemonMoveLoadout).not.toHaveBeenCalled();
  });

  it("bootstraps an uninitialized loadout deterministically and persists under the loaded rowVersion", async () => {
    const h = harness({
      pokemon: pokemon({ level: 10 }),
      context: context({
        "move:a": 10,
        "move:b": 10,
        "move:c": 7,
        "move:d": 5,
        "move:e": 1,
      }),
    });
    const result = await h.service.bootstrapMoveLoadout({
      ownerPlayerId: pokemon().ownerPlayerId,
      pokemonInstanceId: pokemon().pokemonInstanceId,
      now: NOW,
    });

    expect(result).toEqual({
      status: "updated",
      rowVersion: 8n,
      moveIds: ["move:a", "move:b", "move:c", "move:d"],
    });
    expect(h.repository.replaceOwnedPokemonMoveLoadout).toHaveBeenCalledWith({
      ownerPlayerId: pokemon().ownerPlayerId,
      pokemonInstanceId: pokemon().pokemonInstanceId,
      expectedRowVersion: 7n,
      moveIds: ["move:a", "move:b", "move:c", "move:d"],
      now: NOW,
    });
  });

  it("bootstraps only the level-eligible intersection with exact executable production support", async () => {
    const h = harness({
      pokemon: pokemon({ level: 10 }),
      context: context({
        "move:a": 10,
        "move:b": 10,
        "move:c": 7,
        "move:d": 5,
        "move:e": 1,
      }, ["move:b", "move:d", "move:e"]),
    });
    await expect(h.service.bootstrapMoveLoadout({
      ownerPlayerId: pokemon().ownerPlayerId,
      pokemonInstanceId: pokemon().pokemonInstanceId,
      now: NOW,
    })).resolves.toEqual({
      status: "updated",
      rowVersion: 8n,
      moveIds: ["move:b", "move:d", "move:e"],
    });
  });

  it("fails a production bootstrap closed with the existing ineligible result when the intersection is empty", async () => {
    const h = harness({ context: context({ "move:one": 1 }, []) });
    await expect(h.service.bootstrapMoveLoadout({
      ownerPlayerId: pokemon().ownerPlayerId,
      pokemonInstanceId: pokemon().pokemonInstanceId,
      now: NOW,
    })).resolves.toEqual({ status: "invalid", reason: "ineligible_move" });
    expect(h.repository.replaceOwnedPokemonMoveLoadout).not.toHaveBeenCalled();
  });

  it("fails closed when the exact context has no currently eligible bootstrap Move", async () => {
    const h = harness({ context: context({ "move:later": 20 }) });
    await expect(h.service.bootstrapMoveLoadout({
      ownerPlayerId: pokemon().ownerPlayerId,
      pokemonInstanceId: pokemon().pokemonInstanceId,
      now: NOW,
    })).rejects.toThrow(/without an eligible Move/);
    expect(h.repository.replaceOwnedPokemonMoveLoadout).not.toHaveBeenCalled();
  });
});
