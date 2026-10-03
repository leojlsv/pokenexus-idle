import type { OwnedPokemonRecord, OwnedTeamSnapshot } from "@pokenexus/database";
import type { ProductionCombatRuleCatalog } from "@pokenexus/game-core";
import { describe, expect, it } from "vitest";
import type { MoveEligibilityContext } from "../moves/context";
import { assertStrictSoloHuntStartTeamAdmission } from "./start-admission";

const NOW = new Date("2026-10-03T10:00:00.000Z");

function pokemon(
  pokemonInstanceId: string,
  moveIds: readonly string[] = ["move:damage"],
): OwnedPokemonRecord {
  return {
    pokemonInstanceId,
    ownerPlayerId: "00000000-0000-0000-0000-000000000001",
    speciesId: "species:test",
    level: 10,
    ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    individualization: {
      geneticScore: 50,
      compatibleProfiles: ["Harmony", "Endurance"],
      birthProfile: "Harmony",
      expressedProfile: "Harmony",
      shiny: false,
      individualizationRulesVersion: "encounter-individualization-v1",
      derivationAuthorityVersion: "authority-v1",
      derivationAuthorityKeyId: "key-v1:test",
      originPendingSelectionIdentity: "pending:test",
      individualizationSnapshotIdentity: `snapshot:${pokemonInstanceId}`,
      individualizationSnapshotCommitment: "sha256:test",
      contentVersion: "content:test",
      contentHash: "sha256:content",
      gameDataVersion: "game-data:test",
    },
    selectedAbilityId: null,
    moveLoadout: { state: "selected", moveIds },
    rowVersion: 0n,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function team(pokemonRows: readonly OwnedPokemonRecord[]): OwnedTeamSnapshot {
  return {
    team: {
      teamId: "00000000-0000-0000-0000-000000000010",
      ownerPlayerId: "00000000-0000-0000-0000-000000000001",
      pokemonInstanceIds: pokemonRows.map(({ pokemonInstanceId }) => pokemonInstanceId),
      rowVersion: 0n,
      createdAt: NOW,
      updatedAt: NOW,
    },
    pokemon: pokemonRows,
  };
}

function moveContext(overrides: {
  executableMoveIds?: readonly string[];
  damagePower?: number;
} = {}): MoveEligibilityContext {
  const executableMoveIds = overrides.executableMoveIds ?? ["move:damage", "move:status"];
  const moveSupportById = Object.fromEntries(executableMoveIds.map((moveId) => [
    moveId,
    {
      moveId,
      sourceKey: `source:${moveId}`,
      support: "executable-authored",
      reasonCode: "test",
      rule: moveId === "move:damage"
        ? { category: "physical", power: overrides.damagePower ?? 40 }
        : { category: "status", power: null },
    },
  ]));
  const moveRules = Object.fromEntries(executableMoveIds.map((moveId) => [
    moveId,
    moveId === "move:damage"
      ? { category: "physical", power: overrides.damagePower ?? 40 }
      : { category: "status", power: null },
  ]));
  const productionCatalog = {
    moveSupportById,
    moveRules,
  } as unknown as ProductionCombatRuleCatalog;

  return {
    pair: { gameDataVersion: "game-data:test", rulesVersion: "rules:test" },
    rules: {
      rulesVersion: "rules:test",
      moveEligibilityRuleArtifactId: "pokenexus.move-eligibility.level-up-only.v1",
      moveEligibilityRuleSemanticsHash:
        "sha256:810632522a8d12834ad7aec2beb5f2ade3c45f11dcac08dce4d5a43206235363",
    },
    speciesIds: new Set(["species:test"]),
    speciesById: new Map(),
    moveIds: new Set(["move:damage", "move:status", "move:unsupported"]),
    learnsetsBySpecies: new Map(),
    productionExecutableMoveIds: executableMoveIds,
    productionCatalog,
  };
}

describe("strict Solo Hunt Start Team admission", () => {
  it("accepts 1..6 members when every selected loadout is executable and progress-capable", () => {
    expect(() => assertStrictSoloHuntStartTeamAdmission(
      team([
        pokemon("pokemon:one", ["move:status", "move:damage"]),
        pokemon("pokemon:two", ["move:damage"]),
      ]),
      moveContext(),
    )).not.toThrow();
  });

  it("rejects Team sizes outside 1..6", () => {
    expect(() => assertStrictSoloHuntStartTeamAdmission(team([]), moveContext()))
      .toThrow(/1\.\.6/);
    expect(() => assertStrictSoloHuntStartTeamAdmission(
      team(Array.from({ length: 7 }, (_, index) => pokemon(`pokemon:${index + 1}`))),
      moveContext(),
    )).toThrow(/1\.\.6/);
  });

  it("rejects uninitialized, zero, duplicate, sparse and excess selected Move loadouts", () => {
    const uninitialized = pokemon("pokemon:uninitialized");
    expect(() => assertStrictSoloHuntStartTeamAdmission(team([{
      ...uninitialized,
      moveLoadout: { state: "uninitialized", moveIds: [] },
    }]), moveContext())).toThrow(/dense 1\.\.4/);

    expect(() => assertStrictSoloHuntStartTeamAdmission(team([{
      ...pokemon("pokemon:zero"),
      moveLoadout: { state: "selected", moveIds: [] },
    }]), moveContext())).toThrow(/dense 1\.\.4/);

    expect(() => assertStrictSoloHuntStartTeamAdmission(
      team([pokemon("pokemon:duplicate", ["move:damage", "move:damage"])]),
      moveContext(),
    )).toThrow(/dense 1\.\.4/);

    const sparse = new Array<string>(2);
    sparse[1] = "move:damage";
    expect(() => assertStrictSoloHuntStartTeamAdmission(
      team([pokemon("pokemon:sparse", sparse)]),
      moveContext(),
    )).toThrow(/dense 1\.\.4/);

    expect(() => assertStrictSoloHuntStartTeamAdmission(
      team([pokemon("pokemon:excess", ["move:damage", "move:status", "move:a", "move:b", "move:c"])]),
      moveContext(),
    )).toThrow(/dense 1\.\.4/);
  });

  it("rejects any selected Move outside exact production executable support", () => {
    expect(() => assertStrictSoloHuntStartTeamAdmission(
      team([pokemon("pokemon:unsupported", ["move:damage", "move:unsupported"])]),
      moveContext(),
    )).toThrow(/not production-executable/);
  });

  it("rejects a member whose executable loadout cannot make progress", () => {
    expect(() => assertStrictSoloHuntStartTeamAdmission(
      team([pokemon("pokemon:status-only", ["move:status"])]),
      moveContext(),
    )).toThrow(/no progress-capable production Move/);

    expect(() => assertStrictSoloHuntStartTeamAdmission(
      team([pokemon("pokemon:zero-power", ["move:damage"])]),
      moveContext({ damagePower: 0 }),
    )).toThrow(/no progress-capable production Move/);
  });
});
