import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalJson, sha256 } from "./canonical.js";
import {
  loadPokeApiLowAmbiguityFacts,
  pokeApiSourceRecordsForFact,
  POKEAPI_LOW_AMBIGUITY_FILES,
} from "./pokeapi-local-snapshot.js";
import { finalizeSourceSnapshotRecordV5 } from "./source-snapshot-v5.js";

const roots: string[] = [];
const REVISION = "b".repeat(40);

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function csvFixture(): Record<string, string> {
  const root = "data/v2/csv/";
  return {
    [`${root}languages.csv`]: "id,identifier\n9,en\n",
    [`${root}pokemon.csv`]: "id,identifier,species_id,height,weight,base_experience,order,is_default\n1,bulbasaur,1,7,69,64,1,1\n",
    [`${root}pokemon_species.csv`]: "id,identifier,generation_id,gender_rate,capture_rate,growth_rate_id\n1,bulbasaur,1,1,45,4\n",
    [`${root}pokemon_species_names.csv`]: "pokemon_species_id,local_language_id,name\n1,9,Bulbasaur\n",
    [`${root}pokemon_types.csv`]: "pokemon_id,type_id,slot\n1,1,1\n",
    [`${root}pokemon_stats.csv`]: "pokemon_id,stat_id,base_stat,effort\n1,1,45,0\n1,2,49,0\n1,3,49,0\n1,4,65,1\n1,5,65,0\n1,6,45,0\n",
    [`${root}stats.csv`]: "id,identifier\n1,hp\n2,attack\n3,defense\n4,special-attack\n5,special-defense\n6,speed\n",
    [`${root}pokemon_abilities.csv`]: "pokemon_id,ability_id,is_hidden,slot\n1,1,0,1\n",
    [`${root}pokemon_dex_numbers.csv`]: "species_id,pokedex_id,pokedex_number\n1,1,1\n",
    [`${root}pokedexes.csv`]: "id,identifier\n1,national\n",
    [`${root}pokemon_egg_groups.csv`]: "species_id,egg_group_id\n1,1\n1,2\n",
    [`${root}egg_groups.csv`]: "id,identifier\n1,monster\n2,plant\n",
    [`${root}growth_rates.csv`]: "id,identifier,formula\n4,medium-slow,x\n",
    [`${root}moves.csv`]: "id,identifier,target_id\n1,tackle,1\n",
    [`${root}move_targets.csv`]: "id,identifier\n1,selected-pokemon\n",
    [`${root}move_flags.csv`]: "id,identifier\n1,contact\n2,protect\n",
    [`${root}move_flag_map.csv`]: "move_id,move_flag_id\n1,1\n1,2\n",
    [`${root}types.csv`]: "id,identifier,generation_id\n1,normal,1\n",
    [`${root}type_names.csv`]: "type_id,local_language_id,name\n1,9,Normal\n",
    [`${root}type_efficacy.csv`]: "damage_type_id,target_type_id,damage_factor\n1,1,100\n",
    [`${root}abilities.csv`]: "id,identifier,generation_id,is_main_series\n1,overgrow,3,1\n",
    [`${root}ability_names.csv`]: "ability_id,local_language_id,name\n1,9,Overgrow\n",
    [`${root}items.csv`]: "id,identifier,category_id\n1,potion,1\n",
    [`${root}item_categories.csv`]: "id,pocket_id,identifier\n1,1,medicine\n",
    [`${root}item_names.csv`]: "item_id,local_language_id,name\n1,9,Potion\n",
  };
}

async function writeSnapshot(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pokenexus-pokeapi-fixture-"));
  roots.push(root);
  const descriptors = [];
  for (const [logicalPath, content] of Object.entries(files)) {
    const path = join(root, ...logicalPath.split("/"));
    await mkdir(join(root, ...logicalPath.split("/").slice(0, -1)), { recursive: true });
    await writeFile(path, content, "utf8");
    descriptors.push({
      logicalPath,
      sourceLocator: `https://github.com/PokeAPI/pokeapi/blob/${REVISION}/${logicalPath}`,
      sourceContentHash: sha256(Buffer.from(content, "utf8")),
    });
  }
  const record = finalizeSourceSnapshotRecordV5({
    provider: "pokeapi",
    upstreamRevision: REVISION,
    acquiredAt: "2026-10-02T21:34:09.000Z",
    files: descriptors,
  });
  await writeFile(join(root, "source-snapshot.json"), canonicalJson(record), "utf8");
  return root;
}

describe("local PokéAPI source adapter", () => {
  it("extracts approved low-ambiguity facts using only verified local CSV bytes", async () => {
    const root = await writeSnapshot(csvFixture());
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("network access is forbidden in local ingestion");
    }));

    const facts = await loadPokeApiLowAmbiguityFacts(root);
    expect(facts.pokemon).toEqual([expect.objectContaining({
      sourceSlug: "bulbasaur",
      isDefault: true,
      heightMillimeters: 700,
      weightGrams: 6900,
      baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
      evYield: { hp: 0, atk: 0, def: 0, spa: 1, spd: 0, spe: 0 },
      abilities: [{ abilityId: 1, isHidden: false, slot: 1 }],
    })]);
    expect(facts.species).toEqual([expect.objectContaining({
      sourceName: "Bulbasaur",
      nationalDexNumber: 1,
      captureRate: 45,
      growthRate: "medium-slow",
      eggGroups: ["monster", "plant"],
      genderRate: 1,
    })]);
    expect(facts.moves).toEqual([{ moveId: 1, sourceSlug: "tackle", targetIdentifier: "selected-pokemon", makesContact: true }]);
    expect(facts.types).toEqual([{ typeId: 1, sourceSlug: "normal", sourceName: "Normal", introducedGeneration: 1 }]);
    expect(facts.typeEffectiveness).toEqual([{ attackTypeId: 1, defenseTypeId: 1, damageFactor: 100 }]);
    expect(facts.abilities).toEqual([{ abilityId: 1, sourceSlug: "overgrow", sourceName: "Overgrow", introducedGeneration: 3 }]);
    expect(facts.items).toEqual([{ itemId: 1, sourceSlug: "potion", sourceName: "Potion", sourceCategory: "medicine" }]);
    expect(
      pokeApiSourceRecordsForFact(facts.snapshot, "move.makesContact").map((source) => source.logicalPath),
    ).toEqual([
      "data/v2/csv/moves.csv",
      "data/v2/csv/move_flag_map.csv",
      "data/v2/csv/move_flags.csv",
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed before extraction when a required CSV is absent from the local snapshot", async () => {
    const files = csvFixture();
    delete files[POKEAPI_LOW_AMBIGUITY_FILES[0]];
    const root = await writeSnapshot(files);
    await expect(loadPokeApiLowAmbiguityFacts(root)).rejects.toThrow(/missing required file/);
  });

  it("rejects orphan Pokémon relation rows", async () => {
    const files = csvFixture();
    files["data/v2/csv/pokemon_types.csv"] += "999,1,1\n";
    const root = await writeSnapshot(files);
    await expect(loadPokeApiLowAmbiguityFacts(root)).rejects.toThrow(/unknown pokemon_id 999/);
  });

  it("rejects duplicate Type slots even when the Type IDs differ", async () => {
    const files = csvFixture();
    files["data/v2/csv/types.csv"] += "2,fire,1\n";
    files["data/v2/csv/type_names.csv"] += "2,9,Fire\n";
    files["data/v2/csv/pokemon_types.csv"] += "1,2,1\n";
    const root = await writeSnapshot(files);
    await expect(loadPokeApiLowAmbiguityFacts(root)).rejects.toThrow(/duplicate type slot/);
  });

  it("preserves an upstream zero weight instead of inventing a positive value", async () => {
    const files = csvFixture();
    files["data/v2/csv/pokemon.csv"] = files["data/v2/csv/pokemon.csv"].replace(
      "1,bulbasaur,1,7,69,64,1,1",
      "1,bulbasaur,1,7,0,64,1,1",
    );
    const root = await writeSnapshot(files);
    const facts = await loadPokeApiLowAmbiguityFacts(root);
    expect(facts.pokemon[0].weightGrams).toBe(0);
  });

  it("allows an unbound non-default variety to carry no upstream Ability assignment", async () => {
    const files = csvFixture();
    files["data/v2/csv/pokemon.csv"] = files["data/v2/csv/pokemon.csv"].replace(
      "1,bulbasaur,1,7,69,64,1,1",
      "1,bulbasaur-form,1,7,69,64,1,0",
    );
    files["data/v2/csv/pokemon_abilities.csv"] = "pokemon_id,ability_id,is_hidden,slot\n";
    const root = await writeSnapshot(files);
    const facts = await loadPokeApiLowAmbiguityFacts(root);
    expect(facts.pokemon[0]).toEqual(expect.objectContaining({ isDefault: false, abilities: [] }));
  });

  it("still fails closed when a default Pokémon has no Ability assignment", async () => {
    const files = csvFixture();
    files["data/v2/csv/pokemon_abilities.csv"] = "pokemon_id,ability_id,is_hidden,slot\n";
    const root = await writeSnapshot(files);
    await expect(loadPokeApiLowAmbiguityFacts(root)).rejects.toThrow(/missing ability assignments/);
  });

  it("retains an Item with missing English name as incomplete local evidence", async () => {
    const files = csvFixture();
    files["data/v2/csv/item_names.csv"] = "item_id,local_language_id,name\n";
    const root = await writeSnapshot(files);
    const facts = await loadPokeApiLowAmbiguityFacts(root);
    expect(facts.items[0]).toEqual({
      itemId: 1,
      sourceSlug: "potion",
      sourceName: null,
      sourceCategory: "medicine",
    });
  });
});
