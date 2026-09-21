import { describe, expect, it } from "vitest";
import {
  POKEMONDB_PARSER_VERSION,
  discoverPokemonDbSpeciesForms,
  parsePokemonDbAbilityPage,
  parsePokemonDbItemPage,
  parsePokemonDbLearnsetPage,
  parsePokemonDbMovePage,
  parsePokemonDbSpeciesPage,
  parsePokemonDbTypeChartPage,
} from "./pokemondb-parser";

const source = (url: string, html: string) => ({
  url,
  sourceRecordId: `source:${url}`,
  html,
});

const bulbasaurHtml = `
<main id="main">
  <h1>Bulbasaur</h1>
  <p><em>Bulbasaur</em> is a Grass / Poison type Pokémon introduced in <abbr>Generation 1</abbr>.</p>
  <img alt="Mega Fake 999kg Generation 99" src="forbidden.jpg">
  <div class="sv-tabs-tab-list"><a class="sv-tabs-tab active" href="#tab-basic-1">Bulbasaur</a></div>
  <div class="sv-tabs-panel active" id="tab-basic-1">
    <h2>Pokédex data</h2>
    <table class="vitals-table"><tbody>
      <tr><th>National &#8470;</th><td><strong>0001</strong></td></tr>
      <tr><th>Type</th><td><a href="/type/grass">Grass</a><a href="/type/poison">Poison</a></td></tr>
      <tr><th>Height</th><td>0.7&nbsp;m (2′04″)</td></tr>
      <tr><th>Weight</th><td>6.9&nbsp;kg (15.2 lbs)</td></tr>
      <tr><th>Abilities</th><td><span>1. <a href="/ability/overgrow">Overgrow</a></span><br><small><a href="/ability/chlorophyll">Chlorophyll</a> (hidden ability)</small></td></tr>
    </tbody></table>
    <h2>Training</h2>
    <table class="vitals-table"><tbody>
      <tr><th>EV yield</th><td>1 Sp. Atk</td></tr>
      <tr><th>Catch rate</th><td>45 <small>(5.9%)</small></td></tr>
      <tr><th>Base <a href="/glossary#def-friendship">Friendship</a></th><td>50 <small>(normal)</small></td></tr>
      <tr><th>Base Exp.</th><td>64</td></tr>
      <tr><th>Growth Rate</th><td>Medium Slow</td></tr>
    </tbody></table>
    <h2>Breeding</h2>
    <table class="vitals-table"><tbody>
      <tr><th>Egg Groups</th><td><a href="/egg-group/grass">Grass</a>, <a href="/egg-group/monster">Monster</a></td></tr>
      <tr><th>Gender</th><td><span>87.5% male</span>, <span>12.5% female</span></td></tr>
      <tr><th><a href="/glossary#def-eggcycle">Egg cycles</a></th><td>20 <small>(steps)</small></td></tr>
    </tbody></table>
    <h2>Base stats</h2>
    <table class="vitals-table"><tbody>
      <tr><th>HP</th><td class="cell-num">45</td></tr>
      <tr><th>Attack</th><td class="cell-num">49</td></tr>
      <tr><th>Defense</th><td class="cell-num">49</td></tr>
      <tr><th>Sp. Atk</th><td class="cell-num">65</td></tr>
      <tr><th>Sp. Def</th><td class="cell-num">65</td></tr>
      <tr><th>Speed</th><td class="cell-num">45</td></tr>
    </tbody></table>
  </div>
  <h2>Effects</h2><p>Forbidden prose says Friendship 255 and weighs 999 kg.</p>
</main>`;

describe("versioned PokémonDB DATA-only parser", () => {
  it("extracts only structured Species v2 facts and converts exact source units", () => {
    expect(POKEMONDB_PARSER_VERSION).toBe("pokemondb-html-v2");
    const [record] = parsePokemonDbSpeciesPage(
      source("https://pokemondb.net/pokedex/bulbasaur", bulbasaurHtml),
    );

    expect(record).toMatchObject({
      sourceKey: "pokedex:bulbasaur:1",
      sourceName: "Bulbasaur",
      sourceSlug: "bulbasaur",
      formLabel: null,
      nationalDexNumber: 1,
      introducedGeneration: 1,
      typeSourceKeys: ["grass", "poison"],
      heightMillimeters: 700,
      weightGrams: 6900,
      catchRate: 45,
      growthRate: "medium-slow",
      baseExperience: { status: "known", value: 64 },
      baseFriendship: { status: "known", value: 50 },
      eggCycles: { status: "known", value: 20 },
      eggGroupSourceKeys: ["grass", "monster"],
      genderRatio: { kind: "ratio", maleBasisPoints: 8750, femaleBasisPoints: 1250 },
      baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
      evYield: { hp: 0, atk: 0, def: 0, spa: 1, spd: 0, spe: 0 },
    });
    expect(record.abilities).toEqual([
      { abilitySourceKey: "overgrow", sourceAbilitySlot: "normal-1" },
      { abilitySourceKey: "chlorophyll", sourceAbilitySlot: "hidden" },
    ]);
    expect(JSON.stringify(record)).not.toContain("999");
  });

  it("maps only explicit source dashes to source-unavailable facts", () => {
    const unavailable = bulbasaurHtml
      .replace(/<td>50 <small>\(normal\)<\/small><\/td>/, "<td>&mdash;</td>")
      .replace(/<td>64<\/td>/, "<td>&mdash;</td>")
      .replace(/<td>20 <small>\(steps\)<\/small><\/td>/, "<td>&mdash;</td>");
    const [record] = parsePokemonDbSpeciesPage(
      source("https://pokemondb.net/pokedex/bulbasaur", unavailable),
    );
    expect(record.baseFriendship).toEqual({ status: "source-unavailable" });
    expect(record.baseExperience).toEqual({ status: "source-unavailable" });
    expect(record.eggCycles).toEqual({ status: "source-unavailable" });
  });

  it("fails closed when a required structured Species field disappears", () => {
    expect(() =>
      parsePokemonDbSpeciesPage(
        source(
          "https://pokemondb.net/pokedex/bulbasaur",
          bulbasaurHtml.replace("<tr><th>Weight</th><td>6.9&nbsp;kg (15.2 lbs)</td></tr>", ""),
        ),
      ),
    ).toThrow(/Weight/);
  });

  it("recognizes the exact current PokémonDB Nidoran gender h1 qualifiers as the base panel", () => {
    const femaleHtml = bulbasaurHtml
      .replace("<h1>Bulbasaur</h1>", "<h1>Nidoran♀ (female)</h1>")
      .replace(
        '<a class="sv-tabs-tab active" href="#tab-basic-1">Bulbasaur</a>',
        '<a class="sv-tabs-tab active" href="#tab-basic-1">Nidoran♀</a>',
      );
    const maleHtml = bulbasaurHtml
      .replace("<h1>Bulbasaur</h1>", "<h1>Nidoran♂ (male)</h1>")
      .replace(
        '<a class="sv-tabs-tab active" href="#tab-basic-1">Bulbasaur</a>',
        '<a class="sv-tabs-tab active" href="#tab-basic-1">Nidoran♂</a>',
      );

    expect(
      discoverPokemonDbSpeciesForms(
        source("https://pokemondb.net/pokedex/nidoran-f", femaleHtml),
      ),
    ).toEqual([
      expect.objectContaining({ sourceName: "Nidoran♀", formLabel: null }),
    ]);
    expect(
      discoverPokemonDbSpeciesForms(
        source("https://pokemondb.net/pokedex/nidoran-m", maleHtml),
      ),
    ).toEqual([
      expect.objectContaining({ sourceName: "Nidoran♂", formLabel: null }),
    ]);
    expect(
      parsePokemonDbSpeciesPage(
        source("https://pokemondb.net/pokedex/nidoran-f", femaleHtml),
      )[0],
    ).toMatchObject({ sourceName: "Nidoran♀", formLabel: null });

    const unrelatedQualifier = bulbasaurHtml.replace(
      "<h1>Bulbasaur</h1>",
      "<h1>Bulbasaur (plant)</h1>",
    );
    expect(
      discoverPokemonDbSpeciesForms(
        source("https://pokemondb.net/pokedex/bulbasaur", unrelatedQualifier),
      )[0],
    ).toMatchObject({ sourceName: "Bulbasaur", formLabel: "Bulbasaur" });
  });

  it("requires exact-form generation evidence for persistent alternate forms and can skip explicit battle-only exclusions before normalization", () => {
    const basePanel = /<div class="sv-tabs-panel active" id="tab-basic-1">([\s\S]*?)<\/div>\s*<h2>Effects<\/h2>/.exec(
      bulbasaurHtml,
    )?.[1];
    expect(basePanel).toBeDefined();
    const multiForm = bulbasaurHtml
      .replace(
        '<div class="sv-tabs-tab-list"><a class="sv-tabs-tab active" href="#tab-basic-1">Bulbasaur</a></div>',
        '<div class="sv-tabs-tab-list"><a class="sv-tabs-tab active" href="#tab-basic-1">Bulbasaur</a><a class="sv-tabs-tab" href="#tab-basic-10001">Alolan Bulbasaur</a><a class="sv-tabs-tab" href="#tab-basic-10002">Mega Bulbasaur</a></div>',
      )
      .replace(
        '<h2>Effects</h2>',
        `<div class="sv-tabs-panel" id="tab-basic-10001">${basePanel}</div><div class="sv-tabs-panel" id="tab-basic-10002"><h2>Battle transformation only</h2></div><h2>Effects</h2>`,
      );

    expect(() =>
      parsePokemonDbSpeciesPage(
        source("https://pokemondb.net/pokedex/bulbasaur", multiForm),
        { excludedSourceKeys: new Set(["pokedex:bulbasaur:10002"]) },
      ),
    ).toThrow(/introduced generation.*Alolan Bulbasaur/i);

    const records = parsePokemonDbSpeciesPage(
      source("https://pokemondb.net/pokedex/bulbasaur", multiForm),
      {
        exactFormIntroducedGenerationEvidence: {
          "pokedex:bulbasaur:10001": {
            introducedGeneration: 7,
            sourceRecordId: "source:bulbapedia:regional-forms",
          },
        },
        excludedSourceKeys: new Set(["pokedex:bulbasaur:10002"]),
      },
    );
    expect(records).toHaveLength(2);
    expect(records[0].introducedGeneration).toBe(1);
    expect(records[1]).toMatchObject({
      sourceKey: "pokedex:bulbasaur:10001",
      sourceName: "Alolan Bulbasaur",
      formLabel: "Alolan Bulbasaur",
      introducedGeneration: 7,
    });
    expect(records.some((record) => record.sourceKey.endsWith(":10002"))).toBe(false);
  });

  it("extracts Move facts from Move data and the closed target mapping without effect prose", () => {
    const html = `
      <main><h1>Tackle (move)</h1>
      <h2>Move data</h2><table class="vitals-table"><tbody>
        <tr><th>Type</th><td><a href="/type/normal">Normal</a></td></tr>
        <tr><th>Category</th><td><img alt="Physical" src="cat.png"> Physical</td></tr>
        <tr><th>Power</th><td>40</td></tr><tr><th>Accuracy</th><td>100</td></tr>
        <tr><th>PP</th><td>35 <small>(max. 56)</small></td></tr>
        <tr><th>Makes contact?</th><td>Yes</td></tr><tr><th>Introduced</th><td>Generation 1</td></tr>
      </tbody></table>
      <h2>Effects</h2><p>Forbidden prose mentions power 999.</p>
      <h2>Move target</h2><p>Targets a single adjacent Pokémon.</p>
      </main>`;
    const record = parsePokemonDbMovePage(source("https://pokemondb.net/move/tackle", html));
    expect(record).toMatchObject({
      sourceKey: "tackle",
      sourceName: "Tackle",
      sourceSlug: "tackle",
      introducedGeneration: 1,
      typeSourceKey: "normal",
      category: "physical",
      power: 40,
      accuracy: 100,
      basePp: 35,
      makesContact: true,
      sourceTarget: "any-adjacent",
    });
    expect(record).not.toHaveProperty("zaBaseCooldownMs");
    expect(record.power).not.toBe(999);
  });

  it("maps current foe wording into the Human-approved factual target enum", () => {
    const html = `
      <main><h1>Swift (move)</h1>
      <h2>Move data</h2><table class="vitals-table"><tbody>
        <tr><th>Type</th><td><a href="/type/normal">Normal</a></td></tr>
        <tr><th>Category</th><td>Special</td></tr>
        <tr><th>Power</th><td>60</td></tr><tr><th>Accuracy</th><td>&infin;</td></tr>
        <tr><th>PP</th><td>20</td></tr>
        <tr><th>Makes contact?</th><td>No</td></tr><tr><th>Introduced</th><td>Generation 1</td></tr>
      </tbody></table>
      <h2>Move target</h2><p>Targets all adjacent foes.</p>
      </main>`;
    expect(
      parsePokemonDbMovePage(source("https://pokemondb.net/move/swift", html)).sourceTarget,
    ).toBe("all-adjacent-foes");
    expect(parsePokemonDbMovePage(source("https://pokemondb.net/move/swift", html)).accuracy).toBeNull();
  });

  it("maps current long-range and random-opponent wording into the approved target enum", () => {
    const moveHtml = (name: string, target: string) => `
      <main><h1>${name} (move)</h1>
      <h2>Move data</h2><table class="vitals-table"><tbody>
        <tr><th>Type</th><td><a href="/type/flying">Flying</a></td></tr>
        <tr><th>Category</th><td>Physical</td></tr>
        <tr><th>Power</th><td>60</td></tr><tr><th>Accuracy</th><td>100</td></tr>
        <tr><th>PP</th><td>20</td></tr>
        <tr><th>Makes contact?</th><td>No</td></tr><tr><th>Introduced</th><td>Generation 4</td></tr>
      </tbody></table>
      <h2>Move target</h2><p>${target}</p>
      </main>`;

    expect(
      parsePokemonDbMovePage(
        source(
          "https://pokemondb.net/move/air-slash",
          moveHtml("Air Slash", "Targets any single Pokémon on the field including non-adjacent ones."),
        ),
      ).sourceTarget,
    ).toBe("any-other");

    expect(
      parsePokemonDbMovePage(
        source(
          "https://pokemondb.net/move/thrash",
          moveHtml("Thrash", "Targets the user, but hits a random adjacent opponent."),
        ),
      ).sourceTarget,
    ).toBe("random-opponent");
  });

  it("keeps Ability and Item extraction to identity/structured classification only", () => {
    const ability = parsePokemonDbAbilityPage(
      source(
        "https://pokemondb.net/ability/overgrow",
        "<main><h1>Overgrow (ability)</h1><h2>Effect</h2><p>Forbidden executable prose.</p></main>",
      ),
    );
    const item = parsePokemonDbItemPage(
      source(
        "https://pokemondb.net/item/potion",
        "<main><h1>Potion (item)</h1><h2>Effects</h2><p>Restores 20 HP.</p></main>",
      ),
    );
    expect(ability).toEqual({
      sourceKey: "overgrow",
      sourceName: "Overgrow",
      sourceSlug: "overgrow",
      introducedGeneration: null,
      sourceRecordId: "source:https://pokemondb.net/ability/overgrow",
    });
    expect(item).toEqual({
      sourceKey: "potion",
      sourceName: "Potion",
      sourceSlug: "potion",
      sourceCategory: null,
      sourceRecordId: "source:https://pokemondb.net/item/potion",
    });
  });

  it("extracts the complete structured current Type matrix from cell classes", () => {
    const html = `<main><h2>Type quick-list</h2>
      <p><a class="type-icon type-normal" href="/type/normal">Normal</a><a class="type-icon type-ghost" href="/type/ghost">Ghost</a></p>
      <h2>Type chart</h2><table class="type-table"><thead><tr><th>DEFENSE</th>
        <th><a href="/type/normal" title="Normal">Nor</a></th><th><a href="/type/ghost" title="Ghost">Gho</a></th>
      </tr></thead><tbody>
        <tr><th><a href="/type/normal" title="Normal">Nor</a></th><td class="type-fx-cell type-fx-100"></td><td class="type-fx-cell type-fx-0">0</td></tr>
        <tr><th><a href="/type/ghost" title="Ghost">Gho</a></th><td class="type-fx-cell type-fx-0">0</td><td class="type-fx-cell type-fx-200">2</td></tr>
      </tbody></table></main>`;
    const result = parsePokemonDbTypeChartPage(source("https://pokemondb.net/type", html));
    expect(result.types.map((entry) => entry.sourceKey)).toEqual(["normal", "ghost"]);
    expect(result.currentTypeEffectiveness).toEqual([
      { attackTypeSourceKey: "normal", defenseTypeSourceKey: "normal", multiplier: 1, sourceRecordId: "source:https://pokemondb.net/type" },
      { attackTypeSourceKey: "normal", defenseTypeSourceKey: "ghost", multiplier: 0, sourceRecordId: "source:https://pokemondb.net/type" },
      { attackTypeSourceKey: "ghost", defenseTypeSourceKey: "normal", multiplier: 0, sourceRecordId: "source:https://pokemondb.net/type" },
      { attackTypeSourceKey: "ghost", defenseTypeSourceKey: "ghost", multiplier: 2, sourceRecordId: "source:https://pokemondb.net/type" },
    ]);
  });

  it("extracts generation/game-scoped level-up, egg and machine learnset rows", () => {
    const html = `<main><h1>Bulbasaur - Generation 9 learnset</h1>
      <a class="sv-tabs-tab active" href="#sv">Scarlet/Violet</a>
      <div class="sv-tabs-panel active" id="sv">
        <h3>Moves learnt by level up</h3><table><tbody>
          <tr><td>1</td><td><a href="/move/tackle">Tackle</a></td></tr>
        </tbody></table>
        <h3>Egg moves</h3><table><tbody>
          <tr><td><a href="/move/curse">Curse</a></td></tr>
        </tbody></table>
        <h3>Moves learnt by TM</h3><table><tbody>
          <tr><td><a href="/item/tm01">01</a></td><td><a href="/move/take-down">Take Down</a></td></tr>
        </tbody></table>
      </div></main>`;
    const records = parsePokemonDbLearnsetPage(
      source("https://pokemondb.net/pokedex/bulbasaur/moves/9", html),
      "pokedex:bulbasaur:1",
    );
    expect(records).toEqual([
      expect.objectContaining({ sourceGeneration: 9, sourceGame: "Scarlet/Violet", moveSourceKey: "tackle", method: "level-up", level: 1, machineIdentifier: null }),
      expect.objectContaining({ sourceGeneration: 9, sourceGame: "Scarlet/Violet", moveSourceKey: "curse", method: "egg", level: null, machineIdentifier: null }),
      expect.objectContaining({ sourceGeneration: 9, sourceGame: "Scarlet/Violet", moveSourceKey: "take-down", method: "machine", level: null, machineIdentifier: "01" }),
    ]);
  });
});
