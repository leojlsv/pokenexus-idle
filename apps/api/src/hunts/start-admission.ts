import type { OwnedTeamSnapshot } from "@pokenexus/database";
import { isProductionMoveExecutable } from "@pokenexus/game-core";
import type { MoveEligibilityContext } from "../moves/context";

function selectedMoveIdsAreDense(moveIds: readonly string[]): boolean {
  for (let index = 0; index < moveIds.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(moveIds, index)) return false;
    const moveId = moveIds[index];
    if (typeof moveId !== "string" || moveId.length === 0) return false;
  }
  return new Set(moveIds).size === moveIds.length;
}

export function assertStrictSoloHuntStartTeamAdmission(
  team: OwnedTeamSnapshot,
  moveContext: MoveEligibilityContext,
): void {
  if (team.pokemon.length < 1 || team.pokemon.length > 6) {
    throw new Error("Solo Hunt Start requires a saved Team of 1..6 members");
  }

  const productionCatalog = moveContext.productionCatalog;
  const productionExecutableMoveIds = moveContext.productionExecutableMoveIds;
  if (!productionCatalog || productionExecutableMoveIds === null) {
    throw new Error("Solo Hunt Start production Move authority is unavailable");
  }
  const executableMoveIds = new Set(productionExecutableMoveIds);

  for (const pokemon of team.pokemon) {
    const loadout = pokemon.moveLoadout;
    if (
      loadout.state !== "selected"
      || loadout.moveIds.length < 1
      || loadout.moveIds.length > 4
      || !selectedMoveIdsAreDense(loadout.moveIds)
    ) {
      throw new Error(`Pokémon has no dense 1..4 selected Move loadout: ${pokemon.pokemonInstanceId}`);
    }

    let hasProgressCapableMove = false;
    for (const moveId of loadout.moveIds) {
      const moveRule = productionCatalog.moveRules[moveId];
      if (
        !executableMoveIds.has(moveId)
        || !isProductionMoveExecutable(productionCatalog, moveId)
        || moveRule === undefined
      ) {
        throw new Error(
          `Pokémon selected Move is not production-executable: ${pokemon.pokemonInstanceId}/${moveId}`,
        );
      }
      if (
        (moveRule.category === "physical" || moveRule.category === "special")
        && (moveRule.power ?? 0) > 0
      ) {
        hasProgressCapableMove = true;
      }
    }

    if (!hasProgressCapableMove) {
      throw new Error(
        `Pokémon has no progress-capable production Move: ${pokemon.pokemonInstanceId}`,
      );
    }
  }
}
