import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeHoennStaging, type HoennStagingArtifact } from "./data";
import { isBaseSpecies, type AbilityRecord, type LearnsetRecord, type MoveRecord, type SpeciesRecord, type TypeRecord } from "./model";

const publishedRoot = resolve(
  process.cwd(),
  "../../packages/game-data/published/version-38ed5230053095b7ef69290f55f40278e681f20eb530788040be5639cdde3c19",
);

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("TASK-117 Hoenn workbench staging", () => {
  it("extends the pinned v5 publication to exact base National Dex 001..386 without dangling references", () => {
    const stagingPath = resolve(process.cwd(), "src/pokemon-analysis/hoenn-staging.json");
    const stagingBytes = readFileSync(stagingPath);
    expect(`sha256:${createHash("sha256").update(stagingBytes).digest("hex")}`).toBe(
      "sha256:2012d517189be550c470aa6a3a59059270cd41d7c452d9741fe8a23ad8507752",
    );
    const staging = JSON.parse(stagingBytes.toString("utf8")) as HoennStagingArtifact;
    const data = mergeHoennStaging({
      base: {
        schemaVersion: "5",
        gameDataVersion: "game-data-core-kanto-johto-v5",
        bundleHash: "sha256:565cdd360c1b29dc3607696299244279a8d0c3f488d4544c41c62ed47592f782",
        provenanceHash: "sha256:fcb28b7ee90680cf28778acc48f9aad5dd24578f620ce0e30705484bd4b3dd68",
      },
      species: json<SpeciesRecord[]>(resolve(publishedRoot, "catalogs/species.json")),
      moves: json<MoveRecord[]>(resolve(publishedRoot, "catalogs/moves.json")),
      types: json<TypeRecord[]>(resolve(publishedRoot, "catalogs/types.json")),
      abilities: json<AbilityRecord[]>(resolve(publishedRoot, "catalogs/abilities.json")),
      learnsets: json<LearnsetRecord[]>(resolve(publishedRoot, "catalogs/learnsets.json")),
    }, staging);

    const baseSpecies = data.species
      .filter((record) => isBaseSpecies(record) && record.nationalDexNumber <= 386 && record.introducedGeneration <= 3)
      .sort((left, right) => left.nationalDexNumber - right.nationalDexNumber);
    expect(baseSpecies).toHaveLength(386);
    expect(baseSpecies.map(({ nationalDexNumber }) => nationalDexNumber)).toEqual(
      Array.from({ length: 386 }, (_, index) => index + 1),
    );
    expect(data.moves).toHaveLength(564);
    expect(data.abilities).toHaveLength(166);
    expect(data.learnsets).toHaveLength(26_363);

    const speciesIds = new Set(data.species.map(({ id }) => id));
    const moveIds = new Set(data.moves.map(({ id }) => id));
    const typeIds = new Set(data.types.map(({ id }) => id));
    const abilityIds = new Set(data.abilities.map(({ id }) => id));
    for (const species of data.species) {
      expect(species.typeIds.every((id) => typeIds.has(id))).toBe(true);
      expect(species.abilities.every(({ abilityId }) => abilityIds.has(abilityId))).toBe(true);
    }
    for (const move of data.moves) expect(typeIds.has(move.typeId)).toBe(true);
    for (const learnset of data.learnsets) {
      expect(speciesIds.has(learnset.speciesId)).toBe(true);
      expect(moveIds.has(learnset.moveId)).toBe(true);
    }
  });
});
