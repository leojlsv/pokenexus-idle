import {
  loadOwnedPokemon,
  replaceOwnedPokemonMoveLoadout,
  withPgClient,
  type OccMutationResult,
  type OwnedPokemonRecord,
} from "@pokenexus/database";
import {
  deriveLevelAvailableMoves,
  selectBootstrapMoveLoadout,
} from "@pokenexus/game-core";
import type { MoveEligibilityContextLoader } from "./context";

export interface MoveLoadoutRepository {
  loadOwnedPokemon(
    ownerPlayerId: string,
    pokemonInstanceId: string,
  ): Promise<OwnedPokemonRecord | null>;
  replaceOwnedPokemonMoveLoadout(input: {
    readonly ownerPlayerId: string;
    readonly pokemonInstanceId: string;
    readonly expectedRowVersion: bigint;
    readonly moveIds: readonly string[];
    readonly now: Date;
  }): Promise<OccMutationResult>;
}

export function createPgMoveLoadoutRepository(connectionString: string): MoveLoadoutRepository {
  return {
    loadOwnedPokemon(ownerPlayerId, pokemonInstanceId) {
      return withPgClient({ connectionString }, (client) =>
        loadOwnedPokemon(client, ownerPlayerId, pokemonInstanceId));
    },
    replaceOwnedPokemonMoveLoadout(input) {
      return withPgClient({ connectionString }, (client) =>
        replaceOwnedPokemonMoveLoadout(client, input));
    },
  };
}

export type MoveLoadoutMutationResult =
  | { readonly status: "updated"; readonly rowVersion: bigint; readonly moveIds: readonly string[] }
  | { readonly status: "stale"; readonly rowVersion: bigint }
  | { readonly status: "not_found" }
  | {
    readonly status: "invalid";
    readonly reason:
      | "invalid_structure"
      | "unresolved_species"
      | "unresolved_move"
      | "ineligible_move";
    readonly moveId?: string;
  };

export type MoveLoadoutBootstrapResult =
  | MoveLoadoutMutationResult
  | { readonly status: "already_selected"; readonly rowVersion: bigint; readonly moveIds: readonly string[] };

function invalidStructure(moveIds: readonly string[]): boolean {
  if (moveIds.length < 1 || moveIds.length > 4) return true;
  const seen = new Set<string>();
  for (const moveId of moveIds) {
    if (typeof moveId !== "string" || moveId.length === 0 || seen.has(moveId)) return true;
    seen.add(moveId);
  }
  return false;
}

function mapOccResult(
  result: OccMutationResult,
  moveIds: readonly string[],
): MoveLoadoutMutationResult {
  if (result.status === "updated") {
    return { status: "updated", rowVersion: result.rowVersion, moveIds: [...moveIds] };
  }
  return result;
}

export class MoveEligibilityApplicationService {
  constructor(
    private readonly repository: MoveLoadoutRepository,
    private readonly contextLoader: MoveEligibilityContextLoader,
  ) {}

  async replaceMoveLoadout(input: {
    readonly ownerPlayerId: string;
    readonly pokemonInstanceId: string;
    readonly expectedRowVersion: bigint;
    readonly moveIds: readonly string[];
    readonly now: Date;
  }): Promise<MoveLoadoutMutationResult> {
    const pokemon = await this.repository.loadOwnedPokemon(
      input.ownerPlayerId,
      input.pokemonInstanceId,
    );
    if (pokemon === null) return { status: "not_found" };
    if (pokemon.rowVersion !== input.expectedRowVersion) {
      return { status: "stale", rowVersion: pokemon.rowVersion };
    }
    if (invalidStructure(input.moveIds)) {
      return { status: "invalid", reason: "invalid_structure" };
    }

    const context = await this.contextLoader.loadForNewOperation();
    if (!context.speciesIds.has(pokemon.speciesId)) {
      return { status: "invalid", reason: "unresolved_species" };
    }

    for (const moveId of input.moveIds) {
      if (!context.moveIds.has(moveId)) {
        return { status: "invalid", reason: "unresolved_move", moveId };
      }
    }

    const eligibleMoves = deriveLevelAvailableMoves({
      speciesId: pokemon.speciesId,
      currentLevel: pokemon.level,
      learnset: context.learnsetsBySpecies.get(pokemon.speciesId) ?? [],
    });
    const eligibleMoveIds = new Set(eligibleMoves.map(({ moveId }) => moveId));
    for (const moveId of input.moveIds) {
      if (!eligibleMoveIds.has(moveId)) {
        return { status: "invalid", reason: "ineligible_move", moveId };
      }
    }

    const result = await this.repository.replaceOwnedPokemonMoveLoadout({
      ownerPlayerId: input.ownerPlayerId,
      pokemonInstanceId: input.pokemonInstanceId,
      expectedRowVersion: pokemon.rowVersion,
      moveIds: input.moveIds,
      now: input.now,
    });
    return mapOccResult(result, input.moveIds);
  }

  async bootstrapMoveLoadout(input: {
    readonly ownerPlayerId: string;
    readonly pokemonInstanceId: string;
    readonly now: Date;
  }): Promise<MoveLoadoutBootstrapResult> {
    const pokemon = await this.repository.loadOwnedPokemon(
      input.ownerPlayerId,
      input.pokemonInstanceId,
    );
    if (pokemon === null) return { status: "not_found" };
    if (pokemon.moveLoadout.state === "selected") {
      return {
        status: "already_selected",
        rowVersion: pokemon.rowVersion,
        moveIds: [...pokemon.moveLoadout.moveIds],
      };
    }

    const context = await this.contextLoader.loadForNewOperation();
    if (!context.speciesIds.has(pokemon.speciesId)) {
      return { status: "invalid", reason: "unresolved_species" };
    }
    const eligibleMoves = deriveLevelAvailableMoves({
      speciesId: pokemon.speciesId,
      currentLevel: pokemon.level,
      learnset: context.learnsetsBySpecies.get(pokemon.speciesId) ?? [],
    });
    const moveIds = selectBootstrapMoveLoadout(eligibleMoves);
    for (const moveId of moveIds) {
      if (!context.moveIds.has(moveId)) {
        return { status: "invalid", reason: "unresolved_move", moveId };
      }
    }

    const result = await this.repository.replaceOwnedPokemonMoveLoadout({
      ownerPlayerId: input.ownerPlayerId,
      pokemonInstanceId: input.pokemonInstanceId,
      expectedRowVersion: pokemon.rowVersion,
      moveIds,
      now: input.now,
    });
    return mapOccResult(result, moveIds);
  }
}
