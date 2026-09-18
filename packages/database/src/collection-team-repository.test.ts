import { describe, expect, it, vi } from "vitest";
import {
  loadOwnedPokemon,
  loadOwnedTeam,
  replaceOwnedPokemonMoveLoadout,
  replaceOwnedTeamRoster,
  setOwnedPokemonSelectedAbility,
  type CollectionTeamDbClient,
} from "./collection-team-repository";

const ownerPlayerId = "0199472a-0000-7000-8000-000000000001";
const pokemonInstanceId = "0199472a-0000-7000-8000-000000000002";
const teamId = "0199472a-0000-7000-8000-000000000003";

function clientWithRows(rowsByCall: readonly unknown[][]): {
  readonly client: CollectionTeamDbClient;
  readonly query: ReturnType<typeof vi.fn>;
} {
  let call = 0;
  const query = vi.fn(async () => ({
    rows: rowsByCall[call++] ?? [],
    rowCount: rowsByCall[call - 1]?.length ?? 0,
  }));
  return { client: { query } as unknown as CollectionTeamDbClient, query };
}

describe("collection/team repository", () => {
  it("rejects structurally invalid opaque IDs and loadouts before database work", async () => {
    const { client, query } = clientWithRows([]);

    await expect(
      setOwnedPokemonSelectedAbility(client, {
        ownerPlayerId,
        pokemonInstanceId,
        expectedRowVersion: 0n,
        selectedAbilityId: "",
        now: new Date("2026-09-17T20:00:00.000Z"),
      }),
    ).rejects.toThrow(/selectedAbilityId/);
    await expect(
      replaceOwnedPokemonMoveLoadout(client, {
        ownerPlayerId,
        pokemonInstanceId,
        expectedRowVersion: 0n,
        moveIds: [],
        now: new Date("2026-09-17T20:00:00.000Z"),
      }),
    ).rejects.toThrow(/1\.\.4/);
    await expect(
      replaceOwnedPokemonMoveLoadout(client, {
        ownerPlayerId,
        pokemonInstanceId,
        expectedRowVersion: 0n,
        moveIds: ["move:a", "move:a"],
        now: new Date("2026-09-17T20:00:00.000Z"),
      }),
    ).rejects.toThrow(/duplicate MoveId/);
    await expect(
      replaceOwnedTeamRoster(client, {
        ownerPlayerId,
        teamId,
        expectedRowVersion: 0n,
        pokemonInstanceIds: Array.from({ length: 7 }, (_, index) =>
          `0199472a-0000-7000-8000-00000000000${index + 1}`,
        ),
        now: new Date("2026-09-17T20:00:00.000Z"),
      }),
    ).rejects.toThrow(/0\.\.6/);
    await expect(
      replaceOwnedTeamRoster(client, {
        ownerPlayerId,
        teamId,
        expectedRowVersion: 0n,
        pokemonInstanceIds: [pokemonInstanceId, pokemonInstanceId],
        now: new Date("2026-09-17T20:00:00.000Z"),
      }),
    ).rejects.toThrow(/duplicate PokemonInstanceId/);

    expect(query).not.toHaveBeenCalled();
  });

  it("loads a Pokémon aggregate with one snapshot-coherent SQL statement and preserves staged zero-loadout", async () => {
    const { client, query } = clientWithRows([
      [
        {
          pokemon_instance_id: pokemonInstanceId,
          owner_player_id: ownerPlayerId,
          species_id: Buffer.from([0x00, 0x73]),
          level: 10,
          iv_hp: 1,
          iv_atk: 2,
          iv_def: 3,
          iv_spa: 4,
          iv_spd: 5,
          iv_spe: 6,
          selected_ability_id: null,
          row_version: "7",
          created_at: new Date("2026-09-17T19:00:00.000Z"),
          updated_at: new Date("2026-09-17T20:00:00.000Z"),
          slot: null,
          move_id: null,
        },
      ],
    ]);

    await expect(loadOwnedPokemon(client, ownerPlayerId, pokemonInstanceId)).resolves.toMatchObject({
      pokemonInstanceId,
      ownerPlayerId,
      speciesId: "s",
      selectedAbilityId: null,
      rowVersion: 7n,
      moveLoadout: { state: "uninitialized", moveIds: [] },
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("LEFT JOIN pokenexus.pokemon_move_loadout");
  });

  it("fails closed when persisted opaque bytes cannot be decoded", async () => {
    const { client } = clientWithRows([
      [
        {
          pokemon_instance_id: pokemonInstanceId,
          owner_player_id: ownerPlayerId,
          species_id: Buffer.from([0x00]),
          level: 10,
          iv_hp: 1,
          iv_atk: 2,
          iv_def: 3,
          iv_spa: 4,
          iv_spd: 5,
          iv_spe: 6,
          selected_ability_id: null,
          row_version: "0",
          created_at: new Date(),
          updated_at: new Date(),
          slot: null,
          move_id: null,
        },
      ],
    ]);

    await expect(loadOwnedPokemon(client, ownerPlayerId, pokemonInstanceId)).rejects.toThrow(
      /even number of bytes/,
    );
  });

  it("loads a dense ordered Team roster from one SQL statement", async () => {
    const secondPokemonId = "0199472a-0000-7000-8000-000000000004";
    const { client, query } = clientWithRows([
      [
        {
          team_id: teamId,
          owner_player_id: ownerPlayerId,
          row_version: "3",
          created_at: new Date("2026-09-17T19:00:00.000Z"),
          updated_at: new Date("2026-09-17T20:00:00.000Z"),
          slot: 1,
          pokemon_instance_id: pokemonInstanceId,
        },
        {
          team_id: teamId,
          owner_player_id: ownerPlayerId,
          row_version: "3",
          created_at: new Date("2026-09-17T19:00:00.000Z"),
          updated_at: new Date("2026-09-17T20:00:00.000Z"),
          slot: 2,
          pokemon_instance_id: secondPokemonId,
        },
      ],
    ]);

    await expect(loadOwnedTeam(client, ownerPlayerId, teamId)).resolves.toMatchObject({
      teamId,
      ownerPlayerId,
      rowVersion: 3n,
      pokemonInstanceIds: [pokemonInstanceId, secondPokemonId],
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("LEFT JOIN pokenexus.pokemon_team_members");
  });

  it("fails closed on sparse persisted Team order", async () => {
    const { client } = clientWithRows([
      [
        {
          team_id: teamId,
          owner_player_id: ownerPlayerId,
          row_version: "1",
          created_at: new Date(),
          updated_at: new Date(),
          slot: 2,
          pokemon_instance_id: pokemonInstanceId,
        },
      ],
    ]);

    await expect(loadOwnedTeam(client, ownerPlayerId, teamId)).rejects.toThrow(/not dense/);
  });

  it("fails closed on sparse persisted Move Loadout order", async () => {
    const { client } = clientWithRows([
      [
        {
          pokemon_instance_id: pokemonInstanceId,
          owner_player_id: ownerPlayerId,
          species_id: Buffer.from([0x00, 0x73]),
          level: 10,
          iv_hp: 1,
          iv_atk: 2,
          iv_def: 3,
          iv_spa: 4,
          iv_spd: 5,
          iv_spe: 6,
          selected_ability_id: null,
          row_version: "0",
          created_at: new Date(),
          updated_at: new Date(),
          slot: 2,
          move_id: Buffer.from([0x00, 0x6d]),
        },
      ],
    ]);

    await expect(loadOwnedPokemon(client, ownerPlayerId, pokemonInstanceId)).rejects.toThrow(/not dense/);
  });

  it("returns typed not_found without attempting a configuration write", async () => {
    const { client, query } = clientWithRows([[], [], []]);

    await expect(
      setOwnedPokemonSelectedAbility(client, {
        ownerPlayerId,
        pokemonInstanceId,
        expectedRowVersion: 0n,
        selectedAbilityId: "ability:test",
        now: new Date("2026-09-17T20:00:00.000Z"),
      }),
    ).resolves.toEqual({ status: "not_found" });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE pokenexus.pokemon_instances"))).toBe(
      false,
    );
  });
});
