import { describe, expect, it } from "vitest";
import {
  PREALPHA_AUTHORED_ITEM_IDS,
  PREALPHA_CONTENT_GAME_DATA_BUNDLE_HASH,
  PREALPHA_CONTENT_GAME_DATA_VERSION,
  PREALPHA_ITEM_IDS,
  authoredItemIdsForRuntimeGameData,
} from "./prealpha-content-authority.js";

describe("TASK-109 pre-alpha authored content runtime binding", () => {
  it("exposes the exact authored ItemIds only for the exact immutable v5 bundle", () => {
    expect([...authoredItemIdsForRuntimeGameData({
      gameDataVersion: PREALPHA_CONTENT_GAME_DATA_VERSION,
      bundleHash: PREALPHA_CONTENT_GAME_DATA_BUNDLE_HASH,
    })]).toEqual(PREALPHA_AUTHORED_ITEM_IDS);
    expect(PREALPHA_AUTHORED_ITEM_IDS).toEqual([
      PREALPHA_ITEM_IDS.standardPokeBall,
      PREALPHA_ITEM_IDS.basicPotion,
      PREALPHA_ITEM_IDS.revive25,
    ]);
  });

  it("does not widen retained historical game-data versions", () => {
    expect(authoredItemIdsForRuntimeGameData({
      gameDataVersion: "game-data-core-kanto-johto-v4",
      bundleHash: "sha256:fc37e5e9acebca805949780e2adb378b7ace8241b7b13ec7689a67d7abf23346",
    }).size).toBe(0);
  });

  it("fails closed if the v5 logical version is rebound to different bytes", () => {
    expect(() => authoredItemIdsForRuntimeGameData({
      gameDataVersion: PREALPHA_CONTENT_GAME_DATA_VERSION,
      bundleHash: `sha256:${"0".repeat(64)}`,
    })).toThrow(/bundle mismatch/);
  });
});
