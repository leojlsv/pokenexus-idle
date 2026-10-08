import { describe, expect, it } from "vitest";
import { HuntApiError, type HuntPrestartPreview } from "./hunt-api";
import { HuntCommandStore } from "./hunt-command-store";
import type { PublishedHuntChoices } from "./hunt-published-choices";
import {
  automaticHuntSyncPausedMessage,
  clearDefinitiveStartCorrelation,
  isDefinitiveStartRejection,
  prestartPreviewMatchesSelection,
} from "./hunt-pages";

const preview: HuntPrestartPreview = {
  gameDataVersion: "game-data:v5",
  bundleHash: `sha256:${"a".repeat(64)}`,
  huntDefinitionId: "hunt:a",
  preview: {
    possibleSpeciesIds: ["species:a"],
    playerXp: null,
    pokemonXpPool: { min: 1, max: 1 },
    itemDrops: [],
  },
};

const catalog: PublishedHuntChoices = {
  source: "approved_published_content",
  gameDataVersion: "game-data:v5",
  bundleHash: `sha256:${"a".repeat(64)}`,
  hunts: [{ zoneId: "zone:a", zoneLabel: "A", huntDefinitionId: "hunt:a", huntLabel: "A" }],
};

describe("SPEC-024 prestart render binding", () => {
  it("accepts a preview only for the exact selected Hunt and catalog release", () => {
    expect(prestartPreviewMatchesSelection(preview, "hunt:a", catalog)).toBe(true);
    expect(prestartPreviewMatchesSelection(preview, "hunt:b", catalog)).toBe(false);
    expect(prestartPreviewMatchesSelection(preview, "hunt:a", { ...catalog, gameDataVersion: "game-data:v6" })).toBe(false);
    expect(prestartPreviewMatchesSelection(preview, "hunt:a", { ...catalog, bundleHash: `sha256:${"b".repeat(64)}` })).toBe(false);
    expect(prestartPreviewMatchesSelection(null, "hunt:a", catalog)).toBe(false);
  });

  it("replaces stale progress text with the real synchronization failure", () => {
    expect(automaticHuntSyncPausedMessage(new HuntApiError(503, "authority_unavailable")))
      .toBe("Automatic Hunt synchronization paused: HTTP 503: authority_unavailable");
  });

  it("treats server-terminal hunt_not_admissible as safe to clear while preserving uncertain retries", () => {
    expect(isDefinitiveStartRejection(new HuntApiError(422, "hunt_not_admissible"))).toBe(true);
    expect(isDefinitiveStartRejection(new HuntApiError(503, "authority_unavailable"))).toBe(false);
    expect(isDefinitiveStartRejection(new HuntApiError(409, "recovery_pending"))).toBe(false);
  });

  it("clears only a terminal Start correlation and preserves an uncertain retry key", async () => {
    const values = new Map<string, string>();
    const store = new HuntCommandStore({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    });
    const playerId = "019a7f50-0000-7000-8000-000000000102";
    const intent = { huntDefinitionId: "hunt:verdant-edge:wilds", teamId: "019a7f50-0000-7000-8000-000000000202" };
    const first = await store.begin(playerId, "start", intent);

    await expect(clearDefinitiveStartCorrelation(
      store,
      playerId,
      first.key,
      new HuntApiError(503, "authority_unavailable"),
    )).resolves.toBe(false);
    await expect(store.inspect(playerId)).resolves.toMatchObject({ kind: "resume", key: first.key });

    await expect(clearDefinitiveStartCorrelation(
      store,
      playerId,
      first.key,
      new HuntApiError(422, "hunt_not_admissible"),
    )).resolves.toBe(true);
    await expect(store.inspect(playerId)).resolves.toEqual({ kind: "none" });
  });
});
