import type { ItemId } from "@pokenexus/game-types";

export const PREALPHA_CONTENT_AUTHORITY_VERSION =
  "pokenexus.prealpha-content-authority.v1" as const;

export const PREALPHA_CONTENT_GAME_DATA_VERSION =
  "game-data-core-kanto-johto-v5" as const;

export const PREALPHA_CONTENT_GAME_DATA_BUNDLE_HASH =
  "sha256:565cdd360c1b29dc3607696299244279a8d0c3f488d4544c41c62ed47592f782" as const;

export const PREALPHA_ITEM_IDS = Object.freeze({
  standardPokeBall: "pokenexus:item:poke-ball:v1" as ItemId,
  basicPotion: "pokenexus:item:basic-potion:v1" as ItemId,
  revive25: "pokenexus:item:revive-25:v1" as ItemId,
});

export const PREALPHA_AUTHORED_ITEM_IDS = Object.freeze([
  PREALPHA_ITEM_IDS.standardPokeBall,
  PREALPHA_ITEM_IDS.basicPotion,
  PREALPHA_ITEM_IDS.revive25,
] as const);

export function prealphaAuthoredItemIdSet(): ReadonlySet<string> {
  return new Set(PREALPHA_AUTHORED_ITEM_IDS);
}

export function authoredItemIdsForRuntimeGameData(input: {
  readonly gameDataVersion: string;
  readonly bundleHash: string;
}): ReadonlySet<string> {
  if (input.gameDataVersion !== PREALPHA_CONTENT_GAME_DATA_VERSION) return new Set();
  if (input.bundleHash !== PREALPHA_CONTENT_GAME_DATA_BUNDLE_HASH) {
    throw new Error(
      `Pre-alpha authored content bundle mismatch for ${PREALPHA_CONTENT_GAME_DATA_VERSION}`,
    );
  }
  return prealphaAuthoredItemIdSet();
}
