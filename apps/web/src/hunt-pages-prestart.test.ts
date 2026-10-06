import { describe, expect, it } from "vitest";
import type { HuntPrestartPreview } from "./hunt-api";
import type { PublishedHuntChoices } from "./hunt-published-choices";
import { prestartPreviewMatchesSelection } from "./hunt-pages";

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
});
