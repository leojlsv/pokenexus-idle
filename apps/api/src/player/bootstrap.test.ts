import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { canonicalJson } from "@pokenexus/game-data/node";
import {
  GENETIC_COMBAT_RULES_VERSION_V1,
  type EncounterIndividualizationAuthority,
  type GeneticProfile,
} from "@pokenexus/game-core";
import type { CommitPlayerBootstrapInput, CommitPlayerBootstrapResult } from "@pokenexus/database";
import type { MoveEligibilityContext } from "../moves/context";
import { deriveEncounterIndividualizationAuthorityKeyId } from "../hunts/runtime";
import {
  PLAYER_BOOTSTRAP_CONTENT_HASH,
  PLAYER_BOOTSTRAP_CONTENT_AUTHORITY,
  PLAYER_BOOTSTRAP_CONTENT_VERSION,
  PREALPHA_INITIAL_INVENTORY,
  PREALPHA_STARTER_LOADOUTS,
  PlayerBootstrapApplicationService,
  type PlayerBootstrapRepository,
  type StarterGeneticProfileAuthority,
  type StarterIndividualizationAuthorityProvider,
} from "./bootstrap";

const DAMAGE_MOVES = new Set([
  "candidate:move:tackle:ceab38a5be",
  "candidate:move:scratch:5a9cb6b54e",
]);

async function authority(): Promise<EncounterIndividualizationAuthority> {
  const secretKey = new Uint8Array(32).fill(17);
  return {
    rulesVersion: "encounter-individualization-v1",
    authorityVersion: "starter-individualization-v1",
    keyId: await deriveEncounterIndividualizationAuthorityKeyId(secretKey),
    secretKey,
  };
}

function context(overrides: Partial<MoveEligibilityContext> = {}): MoveEligibilityContext {
  const speciesIds = Object.keys(PREALPHA_STARTER_LOADOUTS);
  const moveIds = [...new Set(Object.values(PREALPHA_STARTER_LOADOUTS).flat())];
  const speciesById = new Map(speciesIds.map((id) => [id, {
    id,
    baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
  }] as const));
  const learnsetsBySpecies = new Map(speciesIds.map((speciesId) => [speciesId,
    PREALPHA_STARTER_LOADOUTS[speciesId as keyof typeof PREALPHA_STARTER_LOADOUTS].map((moveId) => ({
      speciesId,
      moveId,
      sourceGeneration: 9,
      sourceGame: "bootstrap-test",
      method: "level-up",
      level: 1,
      machineIdentifier: null,
      sourceRecordIds: ["source:test"],
    })),
  ] as const));
  const moveRules = Object.fromEntries(moveIds.map((moveId) => [moveId, {
    moveId,
    category: DAMAGE_MOVES.has(moveId) ? "physical" : "status",
    targetScope: DAMAGE_MOVES.has(moveId) ? "singleEnemy" : "singleEnemy",
    moveCooldownMs: 3000,
    ...(DAMAGE_MOVES.has(moveId) ? { power: 40, accuracy: 100 } : { accuracy: 100 }),
  }]));
  return {
    pair: {
      gameDataVersion: "game-data-core-kanto-johto-v3",
      rulesVersion: GENETIC_COMBAT_RULES_VERSION_V1,
    },
    rules: { rulesVersion: GENETIC_COMBAT_RULES_VERSION_V1 } as unknown as MoveEligibilityContext["rules"],
    speciesIds: new Set(speciesIds),
    speciesById: speciesById as unknown as MoveEligibilityContext["speciesById"],
    moveIds: new Set(moveIds),
    learnsetsBySpecies: learnsetsBySpecies as unknown as MoveEligibilityContext["learnsetsBySpecies"],
    productionExecutableMoveIds: moveIds,
    productionCatalog: { moveRules } as unknown as MoveEligibilityContext["productionCatalog"],
    ...overrides,
  };
}

function accepted(input: CommitPlayerBootstrapInput): CommitPlayerBootstrapResult {
  return {
    status: "accepted",
    replayed: false,
    bootstrap: {
      playerId: input.playerId,
      starterSpeciesId: input.pokemon.speciesId,
      pokemonInstanceId: "pokemon:test",
      teamId: "team:test",
      gameDataVersion: input.pokemon.gameDataVersion,
      rulesVersion: input.rulesVersion,
      contentVersion: input.pokemon.contentVersion,
      contentHash: input.pokemon.contentHash,
      acceptedAt: input.now,
    },
  };
}

async function harness(contextValue = context()): Promise<{
  readonly service: PlayerBootstrapApplicationService;
  readonly commit: ReturnType<typeof vi.fn>;
  readonly resolveProfiles: ReturnType<typeof vi.fn>;
}> {
  const commit = vi.fn(async (input: CommitPlayerBootstrapInput) => accepted(input));
  const repository: PlayerBootstrapRepository = { commit };
  const resolveProfiles = vi.fn(async (): Promise<readonly [GeneticProfile, GeneticProfile]> =>
    ["Harmony", "Might"]);
  const profileAuthority: StarterGeneticProfileAuthority = {
    resolve: resolveProfiles,
  };
  const individualization = await authority();
  const individualizationAuthority: StarterIndividualizationAuthorityProvider = {
    async loadForNewOperation() { return individualization; },
  };
  return {
    service: new PlayerBootstrapApplicationService(
      repository,
      { async loadForNewOperation() { return contextValue; } },
      profileAuthority,
      individualizationAuthority,
    ),
    commit,
    resolveProfiles,
  };
}

describe("TASK-109 trusted Player bootstrap authority", () => {
  it("binds durable bootstrap contentHash to the canonical starter/loadout/Inventory authority", () => {
    const actual = `sha256:${createHash("sha256")
      .update(canonicalJson(PLAYER_BOOTSTRAP_CONTENT_AUTHORITY), "utf8")
      .digest("hex")}`;
    expect(actual).toBe(PLAYER_BOOTSTRAP_CONTENT_HASH);
  });

  it("materializes every accepted starter with exact Level-1 loadout and 50/20/5 Inventory", async () => {
    for (const [starterSpeciesId, expectedMoveIds] of Object.entries(PREALPHA_STARTER_LOADOUTS)) {
      const { service, commit } = await harness();
      const result = await service.bootstrap({
        playerId: `player:${starterSpeciesId}`,
        starterSpeciesId,
        now: new Date("2026-10-03T11:00:00.000Z"),
      });
      expect(result.status).toBe("accepted");
      expect(commit).toHaveBeenCalledOnce();
      const input = commit.mock.calls[0]![0] as CommitPlayerBootstrapInput;
      expect(input.pokemon).toMatchObject({
        speciesId: starterSpeciesId,
        level: 1,
        totalExperience: 0n,
        selectedAbilityId: null,
        moveIds: expectedMoveIds,
        contentVersion: PLAYER_BOOTSTRAP_CONTENT_VERSION,
        contentHash: PLAYER_BOOTSTRAP_CONTENT_HASH,
        gameDataVersion: "game-data-core-kanto-johto-v3",
      });
      expect(input.pokemon.originIdentity).toBe(`player-bootstrap-starter-v1:player:${starterSpeciesId}`);
      expect(input.pokemon.initialCurrentHp).toBeGreaterThan(0);
      expect(input.inventoryGrants).toEqual(PREALPHA_INITIAL_INVENTORY);
    }
  });

  it("resolves starter Genetic Profiles against the exact selected game-data/rules pair", async () => {
    const starterSpeciesId = Object.keys(PREALPHA_STARTER_LOADOUTS)[0]!;
    const { service, resolveProfiles } = await harness();
    await service.bootstrap({ playerId: "player:pair", starterSpeciesId, now: new Date() });
    expect(resolveProfiles).toHaveBeenCalledWith({
      gameDataVersion: "game-data-core-kanto-johto-v3",
      rulesVersion: GENETIC_COMBAT_RULES_VERSION_V1,
      speciesId: starterSpeciesId,
    });
  });

  it("derives stable individualization identity for retry of the same Player/starter authority", async () => {
    const { service, commit } = await harness();
    const request = {
      playerId: "player:stable",
      starterSpeciesId: Object.keys(PREALPHA_STARTER_LOADOUTS)[0]!,
      now: new Date("2026-10-03T11:00:00.000Z"),
    };
    await service.bootstrap(request);
    await service.bootstrap(request);
    const first = commit.mock.calls[0]![0] as CommitPlayerBootstrapInput;
    const second = commit.mock.calls[1]![0] as CommitPlayerBootstrapInput;
    expect(second.pokemon.individualizationSnapshotIdentity)
      .toBe(first.pokemon.individualizationSnapshotIdentity);
    expect(second.pokemon.individualizationSnapshotCommitment)
      .toBe(first.pokemon.individualizationSnapshotCommitment);
    expect(second.pokemon.ivs).toEqual(first.pokemon.ivs);
    expect(second.pokemon.geneticScore).toBe(first.pokemon.geneticScore);
    expect(second.pokemon.shiny).toBe(first.pokemon.shiny);
  });

  it("rejects non-starter identity before touching authorities or persistence", async () => {
    const { service, commit } = await harness();
    await expect(service.bootstrap({
      playerId: "player:x",
      starterSpeciesId: "species:not-a-starter",
      now: new Date(),
    })).resolves.toEqual({ status: "invalid_starter" });
    expect(commit).not.toHaveBeenCalled();
  });

  it("fails closed if an exact starter Move is not level-available", async () => {
    const starterSpeciesId = Object.keys(PREALPHA_STARTER_LOADOUTS)[0]!;
    const base = context();
    const brokenLearnsets = new Map(base.learnsetsBySpecies);
    brokenLearnsets.set(starterSpeciesId, []);
    const { service, commit } = await harness(context({ learnsetsBySpecies: brokenLearnsets }));
    await expect(service.bootstrap({ playerId: "player:x", starterSpeciesId, now: new Date() }))
      .resolves.toEqual({ status: "authority_unavailable", reason: "starter_moves" });
    expect(commit).not.toHaveBeenCalled();
  });

  it("fails closed if the accepted starter loadout has no progress-capable production Move", async () => {
    const base = context();
    const statusOnlyRules = Object.fromEntries(
      Object.keys(base.productionCatalog!.moveRules).map((moveId) => [moveId, {
        moveId,
        category: "status",
        targetScope: "singleEnemy",
        moveCooldownMs: 3000,
        accuracy: 100,
      }]),
    );
    const { service, commit } = await harness(context({
      productionCatalog: { moveRules: statusOnlyRules } as unknown as MoveEligibilityContext["productionCatalog"],
    }));
    await expect(service.bootstrap({
      playerId: "player:x",
      starterSpeciesId: Object.keys(PREALPHA_STARTER_LOADOUTS)[0]!,
      now: new Date(),
    })).resolves.toEqual({ status: "authority_unavailable", reason: "production_moves" });
    expect(commit).not.toHaveBeenCalled();
  });
});
