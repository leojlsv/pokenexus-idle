import type { AbilityId, MoveId, SpeciesId, TypeId } from "@pokenexus/game-types";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BULBAPEDIA_GEN9_MOVE_LIST_URL,
} from "./bulbapedia-gen9-move-parser.js";
import {
  BULBAPEDIA_GEN7_MOVE_LIST_URL,
  BULBAPEDIA_GEN8_MOVE_LIST_URL,
} from "./bulbapedia-historical-move-parser.js";
import { buildBulbapediaHistoricalScalarProofUrl } from "./bulbapedia-historical-scalar-proof.js";
import {
  BULBAPEDIA_ZA_MOVE_LIST_URL,
  type ExtractedBulbapediaZaBaseMoveCooldown,
} from "./bulbapedia-za-parser.js";
import {
  BULBAPEDIA_ABILITY_LIST_URL,
  BULBAPEDIA_TYPE_CHART_URL,
} from "./bulbapedia-reference-parser.js";
import { BULBAPEDIA_REGIONAL_FORM_LIST_URL } from "./bulbapedia-species-evidence.js";
import {
  assertFullCandidateCoverage,
  buildReviewExcludedSpeciesEvidence,
  enrichMovesWithZaBaseCooldowns,
  fetchConfiguredLearnsetSources,
  mergeFetchedMaintenanceSources,
  parseMaintenanceIngestionProfile,
  resolveBulbapediaStaticFormLabels,
  runMaintenanceIngestion,
} from "./maintenance-ingestion.js";
import type { LocalMappingRoster } from "./mapping-roster.js";
import {
  learnsetInventoryKey,
  normalizeRawExtractedSnapshot,
  type RawExtractedSnapshot,
} from "./normalization.js";
import type {
  ExtractedPokemonDbLearnsetEntry,
  ExtractedPokemonDbMove,
  ExtractedPokemonDbSpecies,
} from "./pokemondb-parser.js";
import type { MappingRegistry, SourceRecord } from "./schema.js";

const POKEMONDB_SOURCE_ID = "source:pokemondb:test-move-page";
const BULBAPEDIA_GEN9_SOURCE_ID = "source:bulbapedia:test-gen9-move-list";
const BULBAPEDIA_ZA_SOURCE_ID = "source:bulbapedia:test-za-move-list";

describe("maintenance fetched-source reconciliation", () => {
  it("deduplicates the same canonical URL and normalizes a fetched/cache overlap deterministically", () => {
    const url =
      "https://bulbapedia.bulbagarden.net/wiki/Mr._Mime_(Pok%C3%A9mon)/Generation_VIII_learnset";
    const bytes = Buffer.from("same source bytes", "utf8");
    const common = {
      url,
      bytes,
      sourceContentHash: "sha256:" + "1".repeat(64),
      fetchedAt: "2026-09-21T15:00:00.000Z",
      fetchStatus: "fetched" as const,
    };
    const proof = { ...common, bytes: Buffer.from(bytes), fetchStatus: "cache" as const };

    expect(mergeFetchedMaintenanceSources([common], [proof])).toEqual([proof]);
    expect(mergeFetchedMaintenanceSources([proof], [proof])).toEqual([proof]);
  });

  it("fails closed when one canonical URL resolves to conflicting immutable evidence", () => {
    const url = "https://bulbapedia.bulbagarden.net/wiki/Test_(Pok%C3%A9mon)";
    const first = {
      url,
      bytes: Buffer.from("first", "utf8"),
      sourceContentHash: "sha256:" + "1".repeat(64),
      fetchedAt: "2026-09-21T15:00:00.000Z",
      fetchStatus: "cache" as const,
    };
    const second = {
      ...first,
      bytes: Buffer.from("second", "utf8"),
      sourceContentHash: "sha256:" + "2".repeat(64),
    };

    expect(() => mergeFetchedMaintenanceSources([first], [second])).toThrow(
      /conflicting immutable evidence/i,
    );
  });
});

function reviewEvidenceSourceRecord(id: string, canonicalUrl: string): SourceRecord {
  const bulbapedia = new URL(canonicalUrl).hostname === "bulbapedia.bulbagarden.net";
  return {
    id,
    provider: bulbapedia ? "bulbapedia" : "pokemondb",
    canonicalUrl,
    fetchedAt: "2026-09-20T10:00:00.000Z",
    parserVersion: bulbapedia ? "bulbapedia-species-page-v16" : "pokemondb-html-v2",
    sourceContentHash:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    fetchStatus: "fetched",
  };
}

function move(
  sourceKey = "tackle",
  sourceName = "Tackle",
): ExtractedPokemonDbMove {
  return {
    sourceKey,
    sourceName,
    sourceSlug: sourceKey,
    introducedGeneration: 1,
    typeSourceKey: "normal",
    category: "physical",
    power: 40,
    accuracy: 100,
    basePp: 35,
    makesContact: true,
    sourceTarget: "any-adjacent",
    mainlineSourceRecordIds: [BULBAPEDIA_GEN9_SOURCE_ID],
    mainlineSelectedSourceRecordId: BULBAPEDIA_GEN9_SOURCE_ID,
    mainlineSelectedGame: "scarlet-violet",
    sourceRecordId: POKEMONDB_SOURCE_ID,
  };
}

function zaCooldown(
  sourceKey = "tackle",
  sourceName = "Tackle",
  milliseconds = 4000,
): ExtractedBulbapediaZaBaseMoveCooldown {
  return {
    sourceKey,
    sourceName,
    zaBaseCooldownMs: milliseconds,
    sourceRecordId: BULBAPEDIA_ZA_SOURCE_ID,
  };
}

function sourceRecords(): SourceRecord[] {
  return [
    {
      id: POKEMONDB_SOURCE_ID,
      provider: "pokemondb",
      canonicalUrl: "https://pokemondb.net/move/tackle",
      fetchedAt: "2026-09-19T12:00:00.000Z",
      parserVersion: "pokemondb-html-v2",
      sourceContentHash:
        "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      fetchStatus: "fetched",
    },
    {
      id: BULBAPEDIA_GEN9_SOURCE_ID,
      provider: "bulbapedia",
      canonicalUrl: BULBAPEDIA_GEN9_MOVE_LIST_URL,
      fetchedAt: "2026-09-19T12:00:00.500Z",
      parserVersion: "bulbapedia-gen9-move-availability-v1",
      sourceContentHash:
        "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      fetchStatus: "fetched",
    },
    {
      id: BULBAPEDIA_ZA_SOURCE_ID,
      provider: "bulbapedia",
      canonicalUrl:
        "https://bulbapedia.bulbagarden.net/wiki/List_of_moves_in_Pok%C3%A9mon_Legends:_Z-A",
      fetchedAt: "2026-09-19T12:00:01.000Z",
      parserVersion: "bulbapedia-za-move-list-v1",
      sourceContentHash:
        "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      fetchStatus: "fetched",
    },
  ];
}

function mappingRegistry(moveSourceKey = "tackle"): MappingRegistry {
  return {
    species: [],
    moves: [
      {
        sourceKey: moveSourceKey,
        canonicalId: moveSourceKey as MoveId,
        status: "accepted",
      },
    ],
    types: [
      {
        sourceKey: "normal",
        canonicalId: "normal" as TypeId,
        status: "accepted",
      },
    ],
    abilities: [],
    items: [],
  };
}

function rawSnapshot(moves: ExtractedPokemonDbMove[]): RawExtractedSnapshot {
  return {
    parserVersion: "mixed-test-v1",
    speciesDiscovery: [],
    discovery: {
      moves: moves.map((record) => record.sourceKey),
      types: ["normal"],
      abilities: [],
      items: [],
      learnsets: [],
      currentTypeEffectiveness: ["current:normal:normal"],
    },
    species: [],
    moves,
    types: [
      {
        sourceKey: "normal",
        sourceName: "Normal",
        sourceSlug: "normal",
        sourceRecordId: POKEMONDB_SOURCE_ID,
      },
    ],
    abilities: [],
    items: [],
    learnsets: [],
    historicalScalarProofs: [],
    currentTypeEffectiveness: [
      {
        attackTypeSourceKey: "normal",
        defenseTypeSourceKey: "normal",
        multiplier: 1,
        sourceRecordId: POKEMONDB_SOURCE_ID,
      },
    ],
  };
}

function pokemonDbMoveHtml(name: string): string {
  return `
    <main><h1>${name} (move)</h1>
    <h2>Move data</h2><table class="vitals-table"><tbody>
      <tr><th>Type</th><td><a href="/type/normal">Normal</a></td></tr>
      <tr><th>Category</th><td>Physical</td></tr>
      <tr><th>Power</th><td>40</td></tr>
      <tr><th>Accuracy</th><td>100</td></tr>
      <tr><th>PP</th><td>35</td></tr>
      <tr><th>Makes contact?</th><td>Yes</td></tr>
      <tr><th>Introduced</th><td>Generation 1</td></tr>
    </tbody></table>
    <h2>Move target</h2><p>Targets a single adjacent Pokémon.</p>
    </main>`;
}

const TYPE_NAMES = [
  "Normal", "Fighting", "Flying", "Poison", "Ground", "Rock", "Bug", "Ghost", "Steel",
  "Fire", "Water", "Grass", "Electric", "Psychic", "Ice", "Dragon", "Dark", "Fairy",
] as const;

function bulbapediaTypeChartHtml(): string {
  const header = TYPE_NAMES.map(
    (name) => `<th><a href="/wiki/${name}_(type)">${name}</a></th>`,
  ).join("");
  const rows = TYPE_NAMES.map(
    (name) => `<tr><th><a href="/wiki/${name}_(type)">${name}</a></th>${TYPE_NAMES.map(() => "<td>1×</td>").join("")}</tr>`,
  ).join("");
  return `<main><h3>Generation VI onward</h3><table>
    <tr><th>⮣</th><th colspan="18">Defending type</th></tr>
    <tr><th>Attacking type</th>${header}</tr>${rows}
  </table><h3>Changes</h3></main>`;
}

function bulbapediaZaHtml(): string {
  return `<main>
    <h1>List of moves in Pokémon Legends: Z-A</h1>
    <table class="roundy sortable">
      <tr><th>#</th><th>Name</th><th>Type</th><th>Category</th><th>Power</th>
        <th>Duration</th><th>Cooldown</th><th>Frames</th><th>Range</th></tr>
      <tr><th>Wind-up</th><th>Exec.</th><th>Min</th><th>Max</th><th>Eff.</th></tr>
      <tr><td>33</td><td><a href="/wiki/Tackle_(move)">Tackle</a></td><td>Normal</td>
        <td>Physical</td><td>40</td><td>—</td><td>4</td><td>10</td><td>20</td>
        <td>0.5</td><td>2</td><td>99</td></tr>
    </table>
  </main>`;
}

function bulbaMoveRow(
  index: number,
  name: string,
  pp: number,
  power: number,
  accuracy: number,
  first: string,
  second: string,
  third?: string,
): string {
  const path = name.replace(/ /g, "_");
  return `<tr><td>${index}</td><td><a href="/wiki/${path}_(move)">${name}</a></td>
    <td><a href="/wiki/Normal_(type)">Normal</a></td><td>Physical</td>
    <td>${pp}</td><td>${power}</td><td>${accuracy}%</td><td>${first}</td><td>${second}</td>
    ${third === undefined ? "" : `<td>${third}</td>`}</tr>`;
}

function bulbapediaGen9Html(legacyAvailability = "✓"): string {
  return `<main><table class="roundy sortable">
    <tr><th>#</th><th>Name</th><th>Type</th><th>Category</th><th>PP</th><th>Power</th><th>Accuracy</th><th>SV</th><th>ZA</th></tr>
    ${bulbaMoveRow(33, "Tackle", 35, 40, 100, "✓", "")}
    ${bulbaMoveRow(900, "Legacy Move", 10, 99, 90, legacyAvailability, "")}
  </table></main>`;
}

function bulbapediaGen8Html(): string {
  return `<main><table class="roundy sortable">
    <tr><th>#</th><th>Name</th><th>Type</th><th>Category</th><th>PP</th><th>Power</th><th>Accuracy</th><th>SwSh</th><th>BDSP</th><th>LA</th></tr>
    ${bulbaMoveRow(900, "Legacy Move", 15, 70, 95, "✓", "", "")}
  </table></main>`;
}

function bulbapediaGen7Html(): string {
  return `<main><table class="roundy sortable">
    <tr><th>#</th><th>Name</th><th>Type</th><th>Category</th><th>PP</th><th>Power</th><th>Accuracy</th><th>SM</th><th>USUM</th><th>PE</th></tr>
    ${bulbaMoveRow(1, "Pound", 35, 40, 100, "✓", "✓", "")}
  </table></main>`;
}

function historicalScalarProofResponse(
  name: string,
  game: "brilliant-diamond-shining-pearl" | "sword-shield" | "ultra-sun-ultra-moon" | "sun-moon",
  overrides: Partial<{
    type: string;
    category: "Physical" | "Special" | "Status";
    basePp: number;
    power: number | "—";
    accuracy: number | "—";
    gameEvidence: string;
    timestamp: string;
  }> = {},
): string {
  const defaults = {
    type: "Normal",
    category: "Physical" as const,
    basePp: 17,
    power: 77 as number | "—",
    accuracy: 88 as number | "—",
  };
  const facts = { ...defaults, ...overrides };
  const gameEvidence =
    overrides.gameEvidence ??
    (game === "brilliant-diamond-shining-pearl"
      ? "{{gameabbrev8|SwShBDSP}}"
      : game === "sword-shield"
        ? "{{gameabbrev8|SwSh}}"
        : game === "ultra-sun-ultra-moon"
          ? "{{gameabbrev7|SMUSUM}}"
          : "{{gameabbrev7|SM}}");
  const timestamp =
    overrides.timestamp ??
    (game === "brilliant-diamond-shining-pearl"
      ? "2022-01-27T20:00:00Z"
      : game === "sword-shield"
        ? "2021-11-18T20:00:00Z"
        : game === "ultra-sun-ultra-moon"
          ? "2018-11-15T20:00:00Z"
          : "2017-11-16T20:00:00Z");
  return JSON.stringify({
    batchcomplete: true,
    query: {
      pages: [
        {
          pageid: 123,
          ns: 0,
          title: `${name} (move)`,
          revisions: [
            {
              revid: 456,
              parentid: 455,
              timestamp,
              slots: {
                main: {
                  content: `{{MoveInfobox
|name=${name}
|type=${facts.type}
|damagecategory=${facts.category}
|basepp=${facts.basePp}
|power=${facts.power}
|accuracy=${facts.accuracy}
|target=anyadjacent
}}
==Description==
{{movedescentry|${gameEvidence}|Historical structured game evidence.}}`,
                },
              },
            },
          ],
        },
      ],
    },
  });
}

function pokemonDbBulbasaurHtml(weightKg = "6.9", displayName = "Bulbasaur"): string {
  return `<main><h1>${displayName}</h1>
    <p>${displayName} is a Grass / Poison type Pokémon introduced in Generation 1.</p>
    <div class="sv-tabs-tab-list"><a class="sv-tabs-tab active" href="#tab-basic-1">${displayName}</a></div>
    <div class="sv-tabs-panel active" id="tab-basic-1"><table><tbody>
      <tr><th>National №</th><td>0001</td></tr>
      <tr><th>Type</th><td><a href="/type/grass">grass</a><a href="/type/poison">poison</a></td></tr>
      <tr><th>Height</th><td>0.7 m</td></tr>
      <tr><th>Weight</th><td>${weightKg} kg</td></tr>
      <tr><th>Abilities</th><td>1. <a href="/ability/overgrow">Overgrow</a><br><small><a href="/ability/chlorophyll">Chlorophyll</a> (hidden ability)</small></td></tr>
      <tr><th>Catch rate</th><td>45</td></tr>
      <tr><th>Growth Rate</th><td>Medium Slow</td></tr>
      <tr><th>Base Exp.</th><td>64</td></tr>
      <tr><th>Base Friendship</th><td>50</td></tr>
      <tr><th>Egg cycles</th><td>20</td></tr>
      <tr><th>Egg Groups</th><td><a href="/egg-group/monster">monster</a><a href="/egg-group/grass">grass</a></td></tr>
      <tr><th>Gender</th><td>87.5% male, 12.5% female</td></tr>
      <tr><th>HP</th><td>45</td></tr><tr><th>Attack</th><td>49</td></tr>
      <tr><th>Defense</th><td>49</td></tr><tr><th>Sp. Atk</th><td>65</td></tr>
      <tr><th>Sp. Def</th><td>65</td></tr><tr><th>Speed</th><td>45</td></tr>
      <tr><th>EV yield</th><td>1 Sp. Atk</td></tr>
    </tbody></table></div>
  </main>`;
}

function bulbaStaticField(label: string, href: string, table: string, attributes = ""): string {
  return `<td ${attributes}><b><a href="${href}">${label}</a></b>${table}</td>`;
}

function bulbaOneCell(value: string): string {
  return `<table><tr><td>${value}</td></tr></table>`;
}

function bulbasaurBulbapediaHtml(): string {
  const abilities = `<table>
    <tr><td><a href="/wiki/Overgrow_(Ability)">Overgrow</a></td></tr>
    <tr><td><a href="/wiki/Chlorophyll_(Ability)">Chlorophyll</a><br><small>Bulbasaur Hidden Ability</small></td></tr>
  </table>`;
  const breeding = bulbaStaticField(
    "Breeding",
    "/wiki/Pok%C3%A9mon_breeding",
    `<table><tr>
      ${bulbaStaticField("Egg Group", "/wiki/Egg_Group", bulbaOneCell('<a href="/wiki/Monster_(Egg_Group)">Monster</a> <a href="/wiki/Grass_(Egg_Group)">Grass</a>'))}
      ${bulbaStaticField("Hatch time", "/wiki/Egg_cycle", bulbaOneCell("20 cycles"))}
    </tr></table>`,
    'colspan="2"',
  );
  const ev = `<table><tr><td colspan="6">Total: 1</td></tr><tr>
    <td>0<br><small>HP</small></td><td>0<br><small>Atk</small></td>
    <td>0<br><small>Def</small></td><td>1<br><small>Sp.Atk</small></td>
    <td>0<br><small>Sp.Def</small></td><td>0<br><small>Speed</small></td>
  </tr></table>`;
  const stats = [
    ["HP", "/wiki/HP", 45],
    ["Attack", "/wiki/Stat#Attack", 49],
    ["Defense", "/wiki/Stat#Defense", 49],
    ["Sp. Atk", "/wiki/Stat#Special_Attack", 65],
    ["Sp. Def", "/wiki/Stat#Special_Defense", 65],
    ["Speed", "/wiki/Stat#Speed", 45],
  ]
    .map(
      ([label, href, value]) =>
        `<tr><th><div><a href="${href}">${label}</a>:</div><div>${value}</div></th><td>ignored range</td></tr>`,
    )
    .join("");

  return `<main><h1>Bulbasaur (Pokémon)</h1>
    <table><tr>${bulbaStaticField("Abilities", "/wiki/Ability", abilities, 'colspan="2"')}</tr>
      <tr>${bulbaStaticField("Gender ratio", "/wiki/List_of_Pok%C3%A9mon_by_gender_ratio", bulbaOneCell("87.5% male, 12.5% female"))}
        ${bulbaStaticField("Catch rate", "/wiki/Catch_rate", bulbaOneCell("45"))}</tr>
      <tr>${breeding}</tr>
      <tr>${bulbaStaticField("Height", "/wiki/List_of_Pok%C3%A9mon_by_height", '<table><tr><td>2\'04&quot;</td><td>0.7 m</td></tr></table>')}
        ${bulbaStaticField("Weight", "/wiki/Weight", '<table><tr><td>15.2 lbs.</td><td>6.9 kg</td></tr></table>')}</tr>
      <tr>${bulbaStaticField("Base experience yield", "/wiki/Experience", bulbaOneCell("64<br><small>V+</small>"))}
        ${bulbaStaticField("Leveling rate", "/wiki/Experience", bulbaOneCell("Medium Slow"))}</tr>
      <tr>${bulbaStaticField("EV yield", "/wiki/List_of_Pok%C3%A9mon_by_effort_value_yield", ev, 'colspan="2"')}</tr>
      <tr><td>Other</td>${bulbaStaticField("Base friendship", "/wiki/List_of_Pok%C3%A9mon_by_base_friendship", bulbaOneCell("50"))}</tr>
    </table>
    <p><b>Bulbasaur</b> (Japanese: フシギダネ) is a dual-type <a href="/wiki/Grass_(type)">Grass</a>/<a href="/wiki/Poison_(type)">Poison</a> <a href="/wiki/Pok%C3%A9mon_(species)" title="Pokémon (species)">Pokémon</a> introduced in <a href="/wiki/Generation_I">Generation I</a>.</p>
    <h4><span class="mw-headline" id="Base_stats">Base stats</span></h4>
    <table>${stats}</table>
    <h4><span class="mw-headline" id="Other_stats">Other stats</span></h4>
  </main>`;
}

function bulbasaurBulbapediaHtmlWithUnrepresentedAlolanForm(): string {
  return bulbasaurBulbapediaHtml()
    .replace(
      '<table><tr><td>2\'04&quot;</td><td>0.7 m</td></tr></table>',
      `<table>
        <tr><td>2'04&quot;</td><td>0.7 m</td></tr>
        <tr><td colspan="2"><small>Bulbasaur</small></td></tr>
        <tr><td>2'08&quot;</td><td>0.8 m</td></tr>
        <tr><td colspan="2"><small>Alolan Form</small></td></tr>
      </table>`,
    )
    .replace(
    '<table><tr><td>15.2 lbs.</td><td>6.9 kg</td></tr></table>',
    `<table>
      <tr><td>15.2 lbs.</td><td>6.9 kg</td></tr>
      <tr><td colspan="2"><small>Bulbasaur</small></td></tr>
      <tr><td>15.4 lbs.</td><td>7.0 kg</td></tr>
      <tr><td colspan="2"><small>Alolan Form</small></td></tr>
    </table>`,
    );
}

function pokemonDbBulbasaurHtmlWithExcludedMegaForm(): string {
  return pokemonDbBulbasaurHtml()
    .replace(
      '<div class="sv-tabs-tab-list"><a class="sv-tabs-tab active" href="#tab-basic-1">Bulbasaur</a></div>',
      '<div class="sv-tabs-tab-list"><a class="sv-tabs-tab active" href="#tab-basic-1">Bulbasaur</a><a class="sv-tabs-tab" href="#tab-basic-10002">Mega Bulbasaur</a></div>',
    )
    .replace(
      "</main>",
      '<div class="sv-tabs-panel" id="tab-basic-10002"></div></main>',
    );
}

function bulbasaurBulbapediaHtmlWithExcludedMegaForm(): string {
  return bulbasaurBulbapediaHtml()
    .replace(
      '<table><tr><td>2\'04&quot;</td><td>0.7 m</td></tr></table>',
      `<table>
        <tr><td>2'04&quot;</td><td>0.7 m</td></tr>
        <tr><td colspan="2"><small>Bulbasaur</small></td></tr>
        <tr><td>3'03&quot;</td><td>1.0 m</td></tr>
        <tr><td colspan="2"><small>Mega Bulbasaur</small></td></tr>
      </table>`,
    )
    .replace(
    '<table><tr><td>15.2 lbs.</td><td>6.9 kg</td></tr></table>',
    `<table>
      <tr><td>15.2 lbs.</td><td>6.9 kg</td></tr>
      <tr><td colspan="2"><small>Bulbasaur</small></td></tr>
      <tr><td>220.5 lbs.</td><td>100.0 kg</td></tr>
      <tr><td colspan="2"><small>Mega Bulbasaur</small></td></tr>
    </table>`,
    );
}

function bulbapediaAbilityListHtml(): string {
  return `<main><h2>List of Abilities</h2><table><thead><tr>
    <th>#</th><th>Name</th><th>Description</th><th>Gen.</th></tr></thead><tbody>
    <tr><td>65</td><td><a href="/wiki/Overgrow_(Ability)">Overgrow</a></td><td>ignored</td><td>III</td></tr>
    <tr><td>34</td><td><a href="/wiki/Chlorophyll_(Ability)">Chlorophyll</a></td><td>ignored</td><td>III</td></tr>
  </tbody></table><h2>In other languages</h2></main>`;
}

function bulbapediaRegionalFormsHtml(): string {
  return `<main><h2><span class="mw-headline" id="List_of_regional_forms">List of regional forms</span></h2>
    <table><tr><th>Ndex</th><th>Pokémon</th><th>Original form</th><th>Region<br>(Generation)</th><th>Regional form</th></tr>
      <tr><td>#0019</td><td><a href="/wiki/Rattata_(Pok%C3%A9mon)">Rattata</a></td><td>Normal</td>
        <td><a href="/wiki/Alola">Alola</a><br><a href="/wiki/Generation_VII">VII</a></td>
        <td><a href="/wiki/Dark_(type)">Dark</a><a href="/wiki/Normal_(type)">Normal</a></td></tr>
    </table><h2><span class="mw-headline" id="Other">Other</span></h2></main>`;
}

function endToEndRoster(): LocalMappingRoster {
  return {
    version: "mapping-roster-v1",
    mappings: {
      species: [],
      moves: [
        { sourceKey: "tackle", canonicalId: "tackle" as MoveId, status: "accepted" },
        {
          sourceKey: "legacy-move",
          canonicalId: "legacy-move" as MoveId,
          status: "accepted",
        },
      ],
      types: TYPE_NAMES.map((name) => {
        const sourceKey = name.toLowerCase();
        return { sourceKey, canonicalId: sourceKey as TypeId, status: "accepted" as const };
      }),
      abilities: [],
      items: [],
    },
    excludedOrDeferred: {},
  };
}

function speciesEndToEndRoster(): LocalMappingRoster {
  return {
    version: "mapping-roster-v1",
    mappings: {
      species: [
        {
          sourceKey: "pokedex:bulbasaur:1",
          canonicalId: "bulbasaur" as SpeciesId,
          baseSpeciesId: null,
          status: "accepted",
        },
      ],
      moves: [],
      types: TYPE_NAMES.map((name) => {
        const sourceKey = name.toLowerCase();
        return { sourceKey, canonicalId: sourceKey as TypeId, status: "accepted" as const };
      }),
      abilities: [
        {
          sourceKey: "overgrow",
          canonicalId: "overgrow" as AbilityId,
          status: "accepted",
        },
        {
          sourceKey: "chlorophyll",
          canonicalId: "chlorophyll" as AbilityId,
          status: "accepted",
        },
      ],
      items: [],
    },
    excludedOrDeferred: {},
  };
}

describe("maintenance ingestion profile guards", () => {
  it("accepts regional static-fact aliases only under exact regional identity proof", () => {
    const regional = {
      nationalDexNumber: 222,
      sourceName: "Corsola",
      formLabel: "Galarian Corsola",
      region: "Galar",
      introducedGeneration: 8,
      regionalTypeSourceKeys: ["ghost"],
      sourceRecordId: "source:bulbapedia:regional-corsola",
    };

    expect(resolveBulbapediaStaticFormLabels("Corsola", null, undefined)).toEqual([null]);
    expect(
      resolveBulbapediaStaticFormLabels("Corsola", "Galarian Corsola", regional),
    ).toEqual(["Galarian Form", "Galarian Corsola"]);

    expect(() =>
      resolveBulbapediaStaticFormLabels("Corsola", "Galarian Corsola", {
        ...regional,
        sourceName: "Meowth",
      }),
    ).toThrow(/does not bind exact identity/i);

    expect(() =>
      resolveBulbapediaStaticFormLabels("Corsola", "Galarian Corsola", undefined),
    ).toThrow(/no approved exact-form relationship/i);
  });

  it("accepts only exact approved origins and surface paths", () => {
    expect(
      parseMaintenanceIngestionProfile({
        speciesPages: [
          {
            pokemonDbUrl: "https://pokemondb.net/pokedex/bulbasaur",
            bulbapediaUrl:
              "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)",
            bulbapediaExcludedOrDeferredForms: [
              {
                formLabel: "Pale",
                disposition: "deferred",
                reason: "bulbapedia-only-form-identity-unresolved",
              },
            ],
          },
        ],
        movePages: ["https://pokemondb.net/move/tackle"],
        items: [
          { sourceKey: "potion", pokemonDbUrl: "https://pokemondb.net/item/potion" },
        ],
        learnsetPages: [
          {
            speciesSourceKey: "pokedex:bulbasaur:1",
            bulbapediaUrl:
              "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)/Generation_IX_learnset",
          },
        ],
      }),
    ).toMatchObject({
      movePages: ["https://pokemondb.net/move/tackle"],
      speciesPages: [
        expect.objectContaining({
          bulbapediaExcludedOrDeferredForms: [
            {
              formLabel: "Pale",
              disposition: "deferred",
              reason: "bulbapedia-only-form-identity-unresolved",
            },
          ],
        }),
      ],
    });

    expect(() =>
      parseMaintenanceIngestionProfile({
        speciesPages: [
          {
            pokemonDbUrl: "https://pokemondb.net/pokedex/bulbasaur",
            bulbapediaUrl:
              "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)",
            bulbapediaExcludedOrDeferredForms: [
              { formLabel: "Pale", disposition: "deferred", reason: "one" },
              { formLabel: "Pale", disposition: "deferred", reason: "two" },
            ],
          },
        ],
      }),
    ).toThrow(/duplicate.*formLabel/i);

    expect(() =>
      parseMaintenanceIngestionProfile({
        movePages: ["https://pokemondb.net:444/move/tackle"],
      }),
    ).toThrow(/approved canonical URL/i);
    expect(() =>
      parseMaintenanceIngestionProfile({
        movePages: ["https://user@pokemondb.net/move/tackle"],
      }),
    ).toThrow(/approved canonical URL/i);
    expect(() =>
      parseMaintenanceIngestionProfile({
        movePages: ["https://pokemondb.net/move/tackle/extra"],
      }),
    ).toThrow(/approved canonical URL/i);
    expect(() =>
      parseMaintenanceIngestionProfile({
        speciesPages: [
          {
            pokemonDbUrl: "https://pokemondb.net/pokedex/bulbasaur",
            bulbapediaUrl: "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur",
          },
        ],
      }),
    ).toThrow(/approved canonical URL/i);
  });

  it("uses the approved BDSP learnset fallback only for an exact Generation IX HTTP 404", async () => {
    const primaryUrl =
      "https://bulbapedia.bulbagarden.net/wiki/Rattata_(Pok%C3%A9mon)/Generation_IX_learnset";
    const fallbackUrl =
      "https://bulbapedia.bulbagarden.net/wiki/Rattata_(Pok%C3%A9mon)/Generation_VIII_learnset";
    const profile = {
      learnsetPages: [
        {
          speciesSourceKey: "pokedex:rattata:19",
          bulbapediaUrl: primaryUrl,
          bdspFallbackUrl: fallbackUrl,
        },
      ],
    };
    const policy = {
      crawlDelayMs: 0,
      disallowPaths: [],
      allowPaths: [],
      allows: () => true,
    };

    const primaryRoot = await mkdtemp(join(tmpdir(), "pokenexus-learnset-primary-"));
    const primaryRequests: string[] = [];
    try {
      const result = await fetchConfiguredLearnsetSources(
        profile,
        {
          cacheDirectory: primaryRoot,
          maxRetries: 0,
          fetchImpl: async (input) => {
            primaryRequests.push(String(input));
            return new Response("primary", { status: 200 });
          },
        },
        policy,
      );
      expect(primaryRequests).toEqual([primaryUrl]);
      expect(result.selectedUrlBySpeciesSourceKey.get("pokedex:rattata:19")).toBe(primaryUrl);
    } finally {
      await rm(primaryRoot, { recursive: true, force: true });
    }

    const fallbackRoot = await mkdtemp(join(tmpdir(), "pokenexus-learnset-fallback-"));
    const fallbackRequests: string[] = [];
    try {
      const result = await fetchConfiguredLearnsetSources(
        profile,
        {
          cacheDirectory: fallbackRoot,
          maxRetries: 0,
          fetchImpl: async (input) => {
            const url = String(input);
            fallbackRequests.push(url);
            return url === primaryUrl
              ? new Response("missing", { status: 404 })
              : new Response("fallback", { status: 200 });
          },
        },
        policy,
      );
      expect(fallbackRequests).toEqual([primaryUrl, fallbackUrl]);
      expect(result.selectedUrlBySpeciesSourceKey.get("pokedex:rattata:19")).toBe(fallbackUrl);
    } finally {
      await rm(fallbackRoot, { recursive: true, force: true });
    }

    const failureRoot = await mkdtemp(join(tmpdir(), "pokenexus-learnset-no-fallback-"));
    const failureRequests: string[] = [];
    try {
      await expect(
        fetchConfiguredLearnsetSources(
          profile,
          {
            cacheDirectory: failureRoot,
            maxRetries: 0,
            fetchImpl: async (input) => {
              failureRequests.push(String(input));
              return new Response("provider failure", { status: 500 });
            },
          },
          policy,
        ),
      ).rejects.toThrow(/HTTP 500/i);
      expect(failureRequests).toEqual([primaryUrl]);
    } finally {
      await rm(failureRoot, { recursive: true, force: true });
    }
  });

  it("binds review exclusion evidence only to the Species page that discovered the excluded form", () => {
    const alphaUrl = "https://pokemondb.net/pokedex/alpha";
    const betaUrl = "https://pokemondb.net/pokedex/beta";
    const betaMegaKey = "pokedex:beta:10001";
    const sourceRecordsForReview = [
      reviewEvidenceSourceRecord("source:alpha", alphaUrl),
      reviewEvidenceSourceRecord("source:beta", betaUrl),
    ];
    const discoveries = new Map([
      [
        alphaUrl,
        [
          {
            sourceKey: "pokedex:alpha:1",
            sourceName: "Alpha",
            sourceSlug: "alpha",
            formLabel: null,
          },
        ],
      ],
      [
        betaUrl,
        [
          {
            sourceKey: "pokedex:beta:1",
            sourceName: "Beta",
            sourceSlug: "beta",
            formLabel: null,
          },
          {
            sourceKey: betaMegaKey,
            sourceName: "Mega Beta",
            sourceSlug: "beta",
            formLabel: "Mega Beta",
          },
        ],
      ],
    ]);
    const alphaBulbapediaUrl =
      "https://bulbapedia.bulbagarden.net/wiki/Alpha_(Pok%C3%A9mon)";
    const betaBulbapediaUrl =
      "https://bulbapedia.bulbagarden.net/wiki/Beta_(Pok%C3%A9mon)";

    expect(() =>
      buildReviewExcludedSpeciesEvidence(
        {
          speciesPages: [
            {
              pokemonDbUrl: alphaUrl,
              bulbapediaUrl: alphaBulbapediaUrl,
              excludedOrDeferred: [
                {
                  sourceKey: betaMegaKey,
                  disposition: "deferred",
                  reason: "battle-only-transformation",
                },
              ],
            },
            { pokemonDbUrl: betaUrl, bulbapediaUrl: betaBulbapediaUrl },
          ],
        },
        sourceRecordsForReview,
        discoveries,
        [{ sourceKey: betaMegaKey, disposition: "deferred", reason: "battle-only-transformation" }],
      ),
    ).toThrow(/not discovered from its declaring Species page/i);

    expect(
      buildReviewExcludedSpeciesEvidence(
        {
          speciesPages: [
            { pokemonDbUrl: alphaUrl, bulbapediaUrl: alphaBulbapediaUrl },
            {
              pokemonDbUrl: betaUrl,
              bulbapediaUrl: betaBulbapediaUrl,
              excludedOrDeferred: [
                {
                  sourceKey: betaMegaKey,
                  disposition: "deferred",
                  reason: "battle-only-transformation",
                },
              ],
            },
          ],
        },
        sourceRecordsForReview,
        discoveries,
        [{ sourceKey: betaMegaKey, disposition: "deferred", reason: "battle-only-transformation" }],
      ),
    ).toEqual([{ sourceKey: betaMegaKey, sourceRecordIds: ["source:beta"] }]);

    expect(
      buildReviewExcludedSpeciesEvidence(
        {
          speciesPages: [
            { pokemonDbUrl: alphaUrl, bulbapediaUrl: alphaBulbapediaUrl },
            {
              pokemonDbUrl: betaUrl,
              bulbapediaUrl: betaBulbapediaUrl,
              bulbapediaExcludedOrDeferredForms: [
                {
                  formLabel: "Pale",
                  disposition: "deferred",
                  reason: "bulbapedia-only-form-identity-unresolved",
                },
              ],
            },
          ],
        },
        [
          ...sourceRecordsForReview,
          reviewEvidenceSourceRecord("source:beta-bulbapedia", betaBulbapediaUrl),
        ],
        discoveries,
        [{
          sourceKey: "bulbapedia-form:Beta:Pale",
          disposition: "deferred",
          reason: "bulbapedia-only-form-identity-unresolved",
        }],
      ),
    ).toEqual([
      {
        sourceKey: "bulbapedia-form:Beta:Pale",
        sourceRecordIds: ["source:beta-bulbapedia"],
      },
    ]);

    expect(
      buildReviewExcludedSpeciesEvidence(
        {
          speciesPages: [
            { pokemonDbUrl: alphaUrl, bulbapediaUrl: alphaBulbapediaUrl },
            { pokemonDbUrl: betaUrl, bulbapediaUrl: betaBulbapediaUrl },
          ],
        },
        sourceRecordsForReview,
        discoveries,
        [{
          sourceKey: betaMegaKey,
          disposition: "excluded",
          reason: "human-owner-permanent-exclusion",
        }],
      ),
    ).toEqual([{ sourceKey: betaMegaKey, sourceRecordIds: ["source:beta"] }]);
  });
});

function fullCandidateCoverageFixture() {
  const coreSpeciesDiscovery = Array.from({ length: 251 }, (_, index) => {
    const nationalDexNumber = index + 1;
    const suffix = String(nationalDexNumber).padStart(3, "0");
    return {
      nationalDexNumber,
      sourceName: `Species ${suffix}`,
      sourcePageUrl: `https://bulbapedia.bulbagarden.net/wiki/Species_${suffix}_(Pok%C3%A9mon)`,
    };
  });
  const species: ExtractedPokemonDbSpecies[] = coreSpeciesDiscovery.map((entry) => {
    const suffix = String(entry.nationalDexNumber).padStart(3, "0");
    return {
      sourceKey: `pokedex:species-${suffix}:1`,
      sourceName: entry.sourceName,
      sourceSlug: `species-${suffix}`,
      formLabel: null,
      nationalDexNumber: entry.nationalDexNumber,
      introducedGeneration: entry.nationalDexNumber <= 151 ? 1 : 2,
      typeSourceKeys: ["normal"],
      heightMillimeters: 1000,
      weightGrams: 1000,
      abilities: [{ abilitySourceKey: "test-ability", sourceAbilitySlot: "normal-1" }],
      catchRate: 45,
      growthRate: "medium-fast",
      baseExperience: { status: "known", value: 100 },
      baseFriendship: { status: "known", value: 70 },
      eggCycles: { status: "known", value: 20 },
      eggGroupSourceKeys: ["field"],
      genderRatio: { kind: "ratio", maleBasisPoints: 5000, femaleBasisPoints: 5000 },
      baseStats: { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 },
      evYield: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 1 },
      sourceRecordId: `source:bulbapedia:species-${suffix}`,
    };
  });
  const learnsets: ExtractedPokemonDbLearnsetEntry[] = species.map((entry) => ({
    speciesSourceKey: entry.sourceKey,
    moveSourceKey: "tackle",
    sourceGeneration: 9,
    sourceGame: "Scarlet/Violet",
    method: "level-up",
    level: 1,
    machineIdentifier: null,
    sourceRecordId: `source:bulbapedia:learnset:${entry.sourceKey}`,
  }));
  const profile = {
    speciesPages: coreSpeciesDiscovery.map((entry) => ({
      pokemonDbUrl: `https://pokemondb.net/pokedex/${entry.sourceName.toLowerCase().replace(/ /g, "-")}`,
      bulbapediaUrl: entry.sourcePageUrl,
    })),
    movePages: ["https://pokemondb.net/move/tackle"],
    learnsetPages: species.map((entry, index) => ({
      speciesSourceKey: entry.sourceKey,
      bulbapediaUrl: `${coreSpeciesDiscovery[index].sourcePageUrl}/Generation_IX_learnset`,
    })),
    items: [{ sourceKey: "potion", pokemonDbUrl: "https://pokemondb.net/item/potion" }],
  };
  return {
    coreSpeciesDiscovery,
    profile,
    speciesDiscovery: species.map((entry) => ({ sourceKey: entry.sourceKey, formLabel: null })),
    species,
    moves: [move()],
    learnsets,
    learnsetDiscovery: learnsets.map(learnsetInventoryKey),
    typeSourceKeys: TYPE_NAMES.map((name) => name.toLowerCase()),
    typeEffectivenessCount: 324,
    itemSourceKeys: ["potion"],
    excludedSpeciesKeys: new Set<string>(),
  };
}

describe("full-candidate maintenance completeness", () => {
  it("accepts an exact 251-Species Core closure independent of profile order", () => {
    const fixture = fullCandidateCoverageFixture();
    expect(() => assertFullCandidateCoverage(fixture)).not.toThrow();
    expect(() =>
      assertFullCandidateCoverage({
        ...fixture,
        profile: {
          ...fixture.profile,
          speciesPages: [...fixture.profile.speciesPages].reverse(),
          learnsetPages: [...fixture.profile.learnsetPages].reverse(),
        },
        species: [...fixture.species].reverse(),
        learnsets: [...fixture.learnsets].reverse(),
        learnsetDiscovery: [...fixture.learnsetDiscovery].reverse(),
      }),
    ).not.toThrow();
  });

  it("binds Core Species display-name casing consistently with the cross-provider identity rule", () => {
    const fixture = fullCandidateCoverageFixture();
    const species = [
      { ...fixture.species[0], sourceName: fixture.species[0].sourceName.toLocaleLowerCase("en-US") },
      ...fixture.species.slice(1),
    ];
    expect(() => assertFullCandidateCoverage({ ...fixture, species })).not.toThrow();
    expect(() =>
      assertFullCandidateCoverage({
        ...fixture,
        species: [{ ...species[0], nationalDexNumber: 999 }, ...species.slice(1)],
      }),
    ).toThrow(/Core Species binding mismatch/i);
  });

  it("fails when a Core Species page is omitted or a Core base is excluded", () => {
    const fixture = fullCandidateCoverageFixture();
    expect(() =>
      assertFullCandidateCoverage({
        ...fixture,
        profile: { ...fixture.profile, speciesPages: fixture.profile.speciesPages.slice(0, -1) },
      }),
    ).toThrow(/Core Species page profile.*coverage mismatch/i);

    expect(() =>
      assertFullCandidateCoverage({
        ...fixture,
        excludedSpeciesKeys: new Set([fixture.species[0].sourceKey]),
      }),
    ).toThrow(/Core base Species cannot be excluded/i);
  });

  it("requires an extracted modern learnset for every Core base Species", () => {
    const fixture = fullCandidateCoverageFixture();
    const learnsets = fixture.learnsets.slice(1);
    expect(() =>
      assertFullCandidateCoverage({
        ...fixture,
        learnsets,
        learnsetDiscovery: learnsets.map(learnsetInventoryKey),
      }),
    ).toThrow(/extracted modern learnset Species coverage.*missing/i);
  });

  it("requires Move pages to equal the Move closure from Core learnsets", () => {
    const fixture = fullCandidateCoverageFixture();
    expect(() => assertFullCandidateCoverage({ ...fixture, moves: [] })).toThrow(
      /Move closure from Core learnsets.*missing/i,
    );
    expect(() =>
      assertFullCandidateCoverage({
        ...fixture,
        moves: [...fixture.moves, move("growl", "Growl")],
      }),
    ).toThrow(/Move closure from Core learnsets.*extra/i);
  });

  it("fails closed on Type matrix/reference drift and Item scope drift", () => {
    const fixture = fullCandidateCoverageFixture();
    expect(() =>
      assertFullCandidateCoverage({ ...fixture, typeEffectivenessCount: 323 }),
    ).toThrow(/18 Types and 324 ordered pairs/i);
    expect(() =>
      assertFullCandidateCoverage({
        ...fixture,
        species: [{ ...fixture.species[0], typeSourceKeys: ["unknown-type"] }, ...fixture.species.slice(1)],
      }),
    ).toThrow(/unknown modern Type/i);
    expect(() =>
      assertFullCandidateCoverage({ ...fixture, itemSourceKeys: ["potion", "extra-item"] }),
    ).toThrow(/Item profile scope.*extra/i);
  });
});

describe("maintenance Species source hierarchy", () => {
  it("scopes global roster exclusions to Species actually discovered by the current profile", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokenexus-maintenance-global-exclusion-scope-"));
    const pokemonDbSpeciesUrl = "https://pokemondb.net/pokedex/bulbasaur";
    const bulbapediaSpeciesUrl =
      "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)";
    const roster = speciesEndToEndRoster();
    roster.excludedOrDeferred = {
      species: [
        {
          sourceKey: "pokedex:pikachu:11051",
          disposition: "excluded",
          reason: "human-owner-permanent-exclusion",
        },
      ],
    };
    const pokemonDbFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://pokemondb.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === pokemonDbSpeciesUrl) return new Response(pokemonDbBulbasaurHtml(), { status: 200 });
      return new Response("not found", { status: 404 });
    };
    const bulbapediaFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://bulbapedia.bulbagarden.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /wiki/\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === bulbapediaSpeciesUrl) return new Response(bulbasaurBulbapediaHtml(), { status: 200 });
      if (url === BULBAPEDIA_TYPE_CHART_URL) return new Response(bulbapediaTypeChartHtml(), { status: 200 });
      if (url === BULBAPEDIA_ABILITY_LIST_URL) return new Response(bulbapediaAbilityListHtml(), { status: 200 });
      if (url === BULBAPEDIA_REGIONAL_FORM_LIST_URL) return new Response(bulbapediaRegionalFormsHtml(), { status: 200 });
      return new Response("not found", { status: 404 });
    };

    try {
      const result = await runMaintenanceIngestion({
        outputDirectory: join(root, "output"),
        cacheDirectory: join(root, "cache"),
        roster,
        profile: { speciesPages: [{ pokemonDbUrl: pokemonDbSpeciesUrl, bulbapediaUrl: bulbapediaSpeciesUrl }] },
        fetchOptions: { fetchImpl: pokemonDbFetch, sleep: async () => undefined, random: () => 0 },
        bulbapediaFetchOptions: { fetchImpl: bulbapediaFetch, sleep: async () => undefined, random: () => 0 },
      });
      const speciesInventory = result.rawExtracted.species.map((entry) => entry.sourceKey);
      expect(speciesInventory).toEqual(["pokedex:bulbasaur:1"]);
      expect(result.validationReport.candidateValid).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("binds cross-provider Species display names case-insensitively while preserving exact Dex/source structure", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokenexus-maintenance-species-name-case-"));
    const pokemonDbSpeciesUrl = "https://pokemondb.net/pokedex/bulbasaur";
    const bulbapediaSpeciesUrl =
      "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)";
    const pokemonDbFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://pokemondb.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === pokemonDbSpeciesUrl) {
        return new Response(pokemonDbBulbasaurHtml("6.9", "BULBASAUR"), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };
    const bulbapediaFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://bulbapedia.bulbagarden.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /wiki/\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === bulbapediaSpeciesUrl) return new Response(bulbasaurBulbapediaHtml(), { status: 200 });
      if (url === BULBAPEDIA_TYPE_CHART_URL) return new Response(bulbapediaTypeChartHtml(), { status: 200 });
      if (url === BULBAPEDIA_ABILITY_LIST_URL) return new Response(bulbapediaAbilityListHtml(), { status: 200 });
      if (url === BULBAPEDIA_REGIONAL_FORM_LIST_URL) return new Response(bulbapediaRegionalFormsHtml(), { status: 200 });
      return new Response("not found", { status: 404 });
    };

    try {
      const result = await runMaintenanceIngestion({
        outputDirectory: join(root, "output"),
        cacheDirectory: join(root, "cache"),
        roster: speciesEndToEndRoster(),
        profile: { speciesPages: [{ pokemonDbUrl: pokemonDbSpeciesUrl, bulbapediaUrl: bulbapediaSpeciesUrl }] },
        fetchOptions: { fetchImpl: pokemonDbFetch, sleep: async () => undefined, random: () => 0 },
        bulbapediaFetchOptions: { fetchImpl: bulbapediaFetch, sleep: async () => undefined, random: () => 0 },
      });
      expect(result.validationReport.candidateValid).toBe(true);
      expect(result.rawExtracted.species[0]).toMatchObject({ sourceName: "BULBASAUR", nationalDexNumber: 1 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("publishes Bulbapedia-primary Species facts while preserving PokémonDB complement provenance", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokenexus-maintenance-species-primary-"));
    const outputDirectory = join(root, "output");
    const cacheDirectory = join(root, "cache");
    const pokemonDbSpeciesUrl = "https://pokemondb.net/pokedex/bulbasaur";
    const bulbapediaSpeciesUrl =
      "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)";

    const pokemonDbFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://pokemondb.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === pokemonDbSpeciesUrl) {
        return new Response(pokemonDbBulbasaurHtml(), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };
    const bulbapediaFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://bulbapedia.bulbagarden.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /wiki/\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === bulbapediaSpeciesUrl) {
        return new Response(bulbasaurBulbapediaHtml(), { status: 200 });
      }
      if (url === BULBAPEDIA_TYPE_CHART_URL) {
        return new Response(bulbapediaTypeChartHtml(), { status: 200 });
      }
      if (url === BULBAPEDIA_ABILITY_LIST_URL) {
        return new Response(bulbapediaAbilityListHtml(), { status: 200 });
      }
      if (url === BULBAPEDIA_REGIONAL_FORM_LIST_URL) {
        return new Response(bulbapediaRegionalFormsHtml(), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };

    try {
      const result = await runMaintenanceIngestion({
        outputDirectory,
        cacheDirectory,
        roster: speciesEndToEndRoster(),
        profile: {
          speciesPages: [
            {
              pokemonDbUrl: pokemonDbSpeciesUrl,
              bulbapediaUrl: bulbapediaSpeciesUrl,
            },
          ],
        },
        fetchOptions: {
          fetchImpl: pokemonDbFetch,
          sleep: async () => undefined,
          random: () => 0,
          now: () => "2026-09-19T12:10:00.000Z",
        },
        bulbapediaFetchOptions: {
          fetchImpl: bulbapediaFetch,
          sleep: async () => undefined,
          random: () => 0,
          now: () => "2026-09-19T12:10:01.000Z",
        },
      });

      expect(result.validationReport).toMatchObject({
        candidateValid: true,
        publicationReady: false,
      });
      const candidate = JSON.parse(
        await readFile(join(outputDirectory, "normalized-candidate.json"), "utf8"),
      ) as {
        catalogs: {
          species: Array<{
            id: string;
            typeIds: string[];
            baseStats: Record<string, number>;
            abilities: Array<{ abilityId: string; sourceAbilitySlot: string }>;
            catchRate: number;
            baseExperience: { status: string; value?: number };
            growthRate: string;
            heightMillimeters: number;
            weightGrams: number;
            eggGroups: string[];
            genderRatio: unknown;
            eggCycles: { status: string; value?: number };
            evYield: Record<string, number>;
            baseFriendship: { status: string; value?: number };
            sourceRecordIds: string[];
          }>;
        };
        provenance: { sourceRecords: SourceRecord[] };
      };
      expect(candidate.catalogs.species).toHaveLength(1);
      const species = candidate.catalogs.species[0];
      expect(species).toMatchObject({
        id: "bulbasaur",
        typeIds: ["grass", "poison"],
        baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
        abilities: [
          { abilityId: "overgrow", sourceAbilitySlot: "normal-1" },
          { abilityId: "chlorophyll", sourceAbilitySlot: "hidden" },
        ],
        catchRate: 45,
        baseExperience: { status: "known", value: 64 },
        growthRate: "medium-slow",
        heightMillimeters: 700,
        weightGrams: 6900,
        eggGroups: ["monster", "grass"],
        genderRatio: { kind: "ratio", maleBasisPoints: 8750, femaleBasisPoints: 1250 },
        eggCycles: { status: "known", value: 20 },
        evYield: { hp: 0, atk: 0, def: 0, spa: 1, spd: 0, spe: 0 },
        baseFriendship: { status: "known", value: 50 },
      });

      const bulbapediaSpeciesSource = candidate.provenance.sourceRecords.find(
        (record) => record.canonicalUrl === bulbapediaSpeciesUrl,
      );
      const pokemonDbSpeciesSource = candidate.provenance.sourceRecords.find(
        (record) => record.canonicalUrl === pokemonDbSpeciesUrl,
      );
      expect(bulbapediaSpeciesSource).toMatchObject({
        provider: "bulbapedia",
        parserVersion: "bulbapedia-species-page-v17",
      });
      expect(pokemonDbSpeciesSource).toMatchObject({
        provider: "pokemondb",
        parserVersion: "pokemondb-html-v2",
      });
      expect(species.sourceRecordIds[0]).toBe(bulbapediaSpeciesSource?.id);
      expect(species.sourceRecordIds).toContain(pokemonDbSpeciesSource?.id);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps Bulbapedia primary facts when the PokémonDB complement disagrees", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokenexus-maintenance-species-disagreement-"));
    const pokemonDbSpeciesUrl = "https://pokemondb.net/pokedex/bulbasaur";
    const bulbapediaSpeciesUrl =
      "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)";
    const pokemonDbFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://pokemondb.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === pokemonDbSpeciesUrl) {
        return new Response(pokemonDbBulbasaurHtml("7.0"), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };
    const bulbapediaFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://bulbapedia.bulbagarden.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /wiki/\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === bulbapediaSpeciesUrl) return new Response(bulbasaurBulbapediaHtml(), { status: 200 });
      if (url === BULBAPEDIA_TYPE_CHART_URL) return new Response(bulbapediaTypeChartHtml(), { status: 200 });
      if (url === BULBAPEDIA_ABILITY_LIST_URL) return new Response(bulbapediaAbilityListHtml(), { status: 200 });
      if (url === BULBAPEDIA_REGIONAL_FORM_LIST_URL) return new Response(bulbapediaRegionalFormsHtml(), { status: 200 });
      return new Response("not found", { status: 404 });
    };

    try {
      const result = await runMaintenanceIngestion({
          outputDirectory: join(root, "output"),
          cacheDirectory: join(root, "cache"),
          roster: speciesEndToEndRoster(),
          profile: {
            speciesPages: [{ pokemonDbUrl: pokemonDbSpeciesUrl, bulbapediaUrl: bulbapediaSpeciesUrl }],
          },
          fetchOptions: {
            fetchImpl: pokemonDbFetch,
            sleep: async () => undefined,
            random: () => 0,
            now: () => "2026-09-19T12:11:00.000Z",
          },
          bulbapediaFetchOptions: {
            fetchImpl: bulbapediaFetch,
            sleep: async () => undefined,
            random: () => 0,
            now: () => "2026-09-19T12:11:01.000Z",
          },
        });
      expect(result.rawExtracted.species[0]).toMatchObject({
        sourceName: "Bulbasaur",
        weightGrams: 6900,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed when Bulbapedia exposes a persistent form missing from PokémonDB discovery", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokenexus-maintenance-species-form-closure-"));
    const pokemonDbSpeciesUrl = "https://pokemondb.net/pokedex/bulbasaur";
    const bulbapediaSpeciesUrl =
      "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)";
    const pokemonDbFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://pokemondb.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === pokemonDbSpeciesUrl) return new Response(pokemonDbBulbasaurHtml(), { status: 200 });
      return new Response("not found", { status: 404 });
    };
    const bulbapediaFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://bulbapedia.bulbagarden.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /wiki/\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === bulbapediaSpeciesUrl) {
        return new Response(bulbasaurBulbapediaHtmlWithUnrepresentedAlolanForm(), { status: 200 });
      }
      if (url === BULBAPEDIA_TYPE_CHART_URL) return new Response(bulbapediaTypeChartHtml(), { status: 200 });
      if (url === BULBAPEDIA_ABILITY_LIST_URL) return new Response(bulbapediaAbilityListHtml(), { status: 200 });
      if (url === BULBAPEDIA_REGIONAL_FORM_LIST_URL) return new Response(bulbapediaRegionalFormsHtml(), { status: 200 });
      return new Response("not found", { status: 404 });
    };

    try {
      await expect(
        runMaintenanceIngestion({
          outputDirectory: join(root, "output"),
          cacheDirectory: join(root, "cache"),
          roster: speciesEndToEndRoster(),
          profile: {
            speciesPages: [{ pokemonDbUrl: pokemonDbSpeciesUrl, bulbapediaUrl: bulbapediaSpeciesUrl }],
          },
          fetchOptions: {
            fetchImpl: pokemonDbFetch,
            sleep: async () => undefined,
            random: () => 0,
            now: () => "2026-09-19T12:12:00.000Z",
          },
          bulbapediaFetchOptions: {
            fetchImpl: bulbapediaFetch,
            sleep: async () => undefined,
            random: () => 0,
            now: () => "2026-09-19T12:12:01.000Z",
          },
        }),
      ).rejects.toThrow(/persistent-form closure.*Alolan Form/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("stages an exact Bulbapedia-only form as deferred provenance without normalizing a Species", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokenexus-maintenance-species-form-bulbapedia-deferred-"));
    const pokemonDbSpeciesUrl = "https://pokemondb.net/pokedex/bulbasaur";
    const bulbapediaSpeciesUrl =
      "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)";
    const pokemonDbFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://pokemondb.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === pokemonDbSpeciesUrl) return new Response(pokemonDbBulbasaurHtml(), { status: 200 });
      return new Response("not found", { status: 404 });
    };
    const bulbapediaFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://bulbapedia.bulbagarden.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /wiki/\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === bulbapediaSpeciesUrl) {
        return new Response(bulbasaurBulbapediaHtmlWithUnrepresentedAlolanForm(), { status: 200 });
      }
      if (url === BULBAPEDIA_TYPE_CHART_URL) return new Response(bulbapediaTypeChartHtml(), { status: 200 });
      if (url === BULBAPEDIA_ABILITY_LIST_URL) return new Response(bulbapediaAbilityListHtml(), { status: 200 });
      if (url === BULBAPEDIA_REGIONAL_FORM_LIST_URL) return new Response(bulbapediaRegionalFormsHtml(), { status: 200 });
      return new Response("not found", { status: 404 });
    };

    try {
      const result = await runMaintenanceIngestion({
        outputDirectory: join(root, "output"),
        cacheDirectory: join(root, "cache"),
        roster: speciesEndToEndRoster(),
        profile: {
          speciesPages: [
            {
              pokemonDbUrl: pokemonDbSpeciesUrl,
              bulbapediaUrl: bulbapediaSpeciesUrl,
              bulbapediaExcludedOrDeferredForms: [
                {
                  formLabel: "Alolan Form",
                  disposition: "deferred",
                  reason: "bulbapedia-only-form-identity-unresolved",
                },
              ],
            },
          ],
        },
        fetchOptions: {
          fetchImpl: pokemonDbFetch,
          sleep: async () => undefined,
          random: () => 0,
          now: () => "2026-09-20T22:00:00.000Z",
        },
        bulbapediaFetchOptions: {
          fetchImpl: bulbapediaFetch,
          sleep: async () => undefined,
          random: () => 0,
          now: () => "2026-09-20T22:00:01.000Z",
        },
      });
      expect(result.rawExtracted.species).toHaveLength(1);
      expect(result.rawExtracted.species[0]).toMatchObject({
        sourceKey: "pokedex:bulbasaur:1",
        formLabel: null,
      });
      expect(result.rawExtracted.discovery.species).toEqual([
        "bulbapedia-form:Bulbasaur:Alolan%20Form",
      ]);
      const provenance = JSON.parse(
        await readFile(join(root, "output", "provenance-manifest.json"), "utf8"),
      ) as { inventories: Array<{
        surface: string;
        discoveredSourceKeys: string[];
        excludedOrDeferred: Array<{ sourceKey: string; disposition: string; reason: string }>;
      }> };
      const speciesInventory = provenance.inventories.find((entry) => entry.surface === "species");
      expect(speciesInventory?.discoveredSourceKeys).toContain(
        "bulbapedia-form:Bulbasaur:Alolan%20Form",
      );
      expect(speciesInventory?.excludedOrDeferred).toContainEqual({
        sourceKey: "bulbapedia-form:Bulbasaur:Alolan%20Form",
        disposition: "deferred",
        reason: "bulbapedia-only-form-identity-unresolved",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed when a declared Bulbapedia-only form label is absent from primary static facts", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokenexus-maintenance-species-form-bulbapedia-missing-"));
    const pokemonDbSpeciesUrl = "https://pokemondb.net/pokedex/bulbasaur";
    const bulbapediaSpeciesUrl =
      "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)";
    const pokemonDbFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://pokemondb.net/robots.txt") return new Response("User-agent: *\nAllow: /\nCrawl-delay: 0\n", { status: 200 });
      if (url === pokemonDbSpeciesUrl) return new Response(pokemonDbBulbasaurHtml(), { status: 200 });
      return new Response("not found", { status: 404 });
    };
    const bulbapediaFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://bulbapedia.bulbagarden.net/robots.txt") return new Response("User-agent: *\nAllow: /wiki/\nCrawl-delay: 0\n", { status: 200 });
      if (url === bulbapediaSpeciesUrl) return new Response(bulbasaurBulbapediaHtml(), { status: 200 });
      if (url === BULBAPEDIA_TYPE_CHART_URL) return new Response(bulbapediaTypeChartHtml(), { status: 200 });
      if (url === BULBAPEDIA_ABILITY_LIST_URL) return new Response(bulbapediaAbilityListHtml(), { status: 200 });
      if (url === BULBAPEDIA_REGIONAL_FORM_LIST_URL) return new Response(bulbapediaRegionalFormsHtml(), { status: 200 });
      return new Response("not found", { status: 404 });
    };
    try {
      await expect(runMaintenanceIngestion({
        outputDirectory: join(root, "output"),
        cacheDirectory: join(root, "cache"),
        roster: speciesEndToEndRoster(),
        profile: {
          speciesPages: [{
            pokemonDbUrl: pokemonDbSpeciesUrl,
            bulbapediaUrl: bulbapediaSpeciesUrl,
            bulbapediaExcludedOrDeferredForms: [{
              formLabel: "Pale",
              disposition: "deferred",
              reason: "bulbapedia-only-form-identity-unresolved",
            }],
          }],
        },
        fetchOptions: { fetchImpl: pokemonDbFetch, sleep: async () => undefined, random: () => 0 },
        bulbapediaFetchOptions: { fetchImpl: bulbapediaFetch, sleep: async () => undefined, random: () => 0 },
      })).rejects.toThrow(/declared Bulbapedia-only form.*Pale.*not discovered/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("counts an explicitly excluded discovered form as represented for Bulbapedia form closure", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokenexus-maintenance-species-form-excluded-"));
    const pokemonDbSpeciesUrl = "https://pokemondb.net/pokedex/bulbasaur";
    const bulbapediaSpeciesUrl =
      "https://bulbapedia.bulbagarden.net/wiki/Bulbasaur_(Pok%C3%A9mon)";
    const pokemonDbFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://pokemondb.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === pokemonDbSpeciesUrl) {
        return new Response(pokemonDbBulbasaurHtmlWithExcludedMegaForm(), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };
    const bulbapediaFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://bulbapedia.bulbagarden.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /wiki/\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === bulbapediaSpeciesUrl) {
        return new Response(bulbasaurBulbapediaHtmlWithExcludedMegaForm(), { status: 200 });
      }
      if (url === BULBAPEDIA_TYPE_CHART_URL) return new Response(bulbapediaTypeChartHtml(), { status: 200 });
      if (url === BULBAPEDIA_ABILITY_LIST_URL) return new Response(bulbapediaAbilityListHtml(), { status: 200 });
      if (url === BULBAPEDIA_REGIONAL_FORM_LIST_URL) return new Response(bulbapediaRegionalFormsHtml(), { status: 200 });
      return new Response("not found", { status: 404 });
    };

    try {
      const result = await runMaintenanceIngestion({
        outputDirectory: join(root, "output"),
        cacheDirectory: join(root, "cache"),
        roster: speciesEndToEndRoster(),
        profile: {
          speciesPages: [
            {
              pokemonDbUrl: pokemonDbSpeciesUrl,
              bulbapediaUrl: bulbapediaSpeciesUrl,
              excludedOrDeferred: [
                {
                  sourceKey: "pokedex:bulbasaur:10002",
                  disposition: "deferred",
                  reason: "battle-only-transformation",
                },
              ],
            },
          ],
        },
        fetchOptions: {
          fetchImpl: pokemonDbFetch,
          sleep: async () => undefined,
          random: () => 0,
          now: () => "2026-09-19T12:13:00.000Z",
        },
        bulbapediaFetchOptions: {
          fetchImpl: bulbapediaFetch,
          sleep: async () => undefined,
          random: () => 0,
          now: () => "2026-09-19T12:13:01.000Z",
        },
      });
      expect(result.rawExtracted.species).toHaveLength(1);
      expect(result.rawExtracted.species[0]).toMatchObject({
        sourceKey: "pokedex:bulbasaur:1",
        formLabel: null,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("maintenance Move Z-A enrichment", () => {
  it("normalizes a Z-A cooldown with both PokémonDB and Bulbapedia provenance", () => {
    const enriched = enrichMovesWithZaBaseCooldowns(
      [move()],
      [zaCooldown()],
      BULBAPEDIA_ZA_SOURCE_ID,
    );
    const result = normalizeRawExtractedSnapshot(
      rawSnapshot(enriched),
      sourceRecords(),
      mappingRegistry(),
    );

    expect(result.candidate.catalogs.moves).toEqual([
      {
        id: "tackle",
        typeId: "normal",
        category: "physical",
        power: 40,
        accuracy: 100,
        basePp: 35,
        sourceTarget: "any-adjacent",
        makesContact: true,
        zaBaseCooldownMs: 4000,
        sourceRecordIds: [
          BULBAPEDIA_GEN9_SOURCE_ID,
          POKEMONDB_SOURCE_ID,
          BULBAPEDIA_ZA_SOURCE_ID,
        ],
      },
    ]);
    expect(result.candidate.provenance.sourceRecords.map((record) => record.provider)).toEqual([
      "bulbapedia",
      "bulbapedia",
      "pokemondb",
    ]);
  });

  it("emits explicit null only after the Z-A source was consulted and keeps its provenance", () => {
    const splash = move("splash", "Splash");
    const enriched = enrichMovesWithZaBaseCooldowns(
      [splash],
      [zaCooldown()],
      BULBAPEDIA_ZA_SOURCE_ID,
    );

    expect(enriched[0]).toMatchObject({
      sourceKey: "splash",
      zaBaseCooldownMs: null,
      zaBaseCooldownSourceRecordId: BULBAPEDIA_ZA_SOURCE_ID,
    });
  });

  it("fails closed when two mainline Moves collapse to the same cross-provider join key", () => {
    expect(() =>
      enrichMovesWithZaBaseCooldowns(
        [move("kings-shield-a", "King's Shield"), move("kings-shield-b", "Kings Shield")],
        [],
        BULBAPEDIA_ZA_SOURCE_ID,
      ),
    ).toThrow(/ambiguous mainline Move join key/i);
  });

  it("refuses Move normalization when a value/null conclusion has no Z-A source evidence", () => {
    const incomplete = { ...move(), zaBaseCooldownMs: null };
    expect(() =>
      normalizeRawExtractedSnapshot(
        rawSnapshot([incomplete]),
        sourceRecords(),
        mappingRegistry(),
      ),
    ).toThrow(/Z-A Base Cooldown source evidence is required/i);
  });

  it("refuses Move normalization when Bulbapedia mainline evidence is absent", () => {
    const incomplete = {
      ...move(),
      mainlineSourceRecordIds: undefined,
      zaBaseCooldownMs: null,
      zaBaseCooldownSourceRecordId: BULBAPEDIA_ZA_SOURCE_ID,
    };
    expect(() =>
      normalizeRawExtractedSnapshot(
        rawSnapshot([incomplete]),
        sourceRecords(),
        mappingRegistry(),
      ),
    ).toThrow(/Generation IX Bulbapedia SourceRecord ID/i);
  });

  it("refuses fallback normalization when the selected historical source is not preserved", () => {
    const incomplete = {
      ...move(),
      mainlineSelectedGame: "sword-shield" as const,
      mainlineSelectedSourceRecordId: BULBAPEDIA_GEN9_SOURCE_ID,
      zaBaseCooldownMs: null,
      zaBaseCooldownSourceRecordId: BULBAPEDIA_ZA_SOURCE_ID,
    };
    expect(() =>
      normalizeRawExtractedSnapshot(
        rawSnapshot([incomplete]),
        sourceRecords(),
        mappingRegistry(),
      ),
    ).toThrow(/selected game\/source evidence does not match the approved MOVE-01 source surface/i);
  });

  it("runs the maintenance pipeline end-to-end with matched and absent Z-A cooldown evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokenexus-maintenance-z-a-"));
    const outputDirectory = join(root, "output");
    const cacheDirectory = join(root, "cache");
    const moveUrls = [
      "https://pokemondb.net/move/tackle",
      "https://pokemondb.net/move/legacy-move",
    ];
    const pokemonDbFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://pokemondb.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === moveUrls[0]) return new Response(pokemonDbMoveHtml("Tackle"), { status: 200 });
      if (url === moveUrls[1]) return new Response(pokemonDbMoveHtml("Legacy Move"), { status: 200 });
      return new Response("not found", { status: 404 });
    };
    const bulbapediaFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://bulbapedia.bulbagarden.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /wiki/\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === BULBAPEDIA_ZA_MOVE_LIST_URL) {
        return new Response(bulbapediaZaHtml(), { status: 200 });
      }
      if (url === BULBAPEDIA_GEN9_MOVE_LIST_URL) {
        return new Response(bulbapediaGen9Html(), { status: 200 });
      }
      if (url === BULBAPEDIA_GEN8_MOVE_LIST_URL) {
        return new Response(bulbapediaGen8Html(), { status: 200 });
      }
      if (url === BULBAPEDIA_GEN7_MOVE_LIST_URL) {
        return new Response(bulbapediaGen7Html(), { status: 200 });
      }
      if (url === BULBAPEDIA_TYPE_CHART_URL) {
        return new Response(bulbapediaTypeChartHtml(), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };

    try {
      const result = await runMaintenanceIngestion({
        outputDirectory,
        cacheDirectory,
        roster: endToEndRoster(),
        profile: { movePages: moveUrls },
        fetchOptions: {
          fetchImpl: pokemonDbFetch,
          sleep: async () => undefined,
          random: () => 0,
          now: () => "2026-09-19T12:00:00.000Z",
        },
        bulbapediaFetchOptions: {
          fetchImpl: bulbapediaFetch,
          sleep: async () => undefined,
          random: () => 0,
          now: () => "2026-09-19T12:00:01.000Z",
        },
      });

      expect(result.validationReport).toMatchObject({
        candidateValid: true,
        publicationReady: false,
      });
      expect(result.validationReport.findings).toContainEqual(
        expect.objectContaining({ code: "maintenance-smoke-not-publishable" }),
      );
      const candidate = JSON.parse(
        await readFile(join(outputDirectory, "normalized-candidate.json"), "utf8"),
      ) as {
        catalogs: {
          moves: Array<{
            id: string;
            zaBaseCooldownMs: number | null;
            sourceRecordIds: string[];
          }>;
        };
        provenance: { sourceRecords: SourceRecord[] };
      };
      const zASource = candidate.provenance.sourceRecords.find(
        (record) => record.canonicalUrl === BULBAPEDIA_ZA_MOVE_LIST_URL,
      );
      expect(zASource).toMatchObject({
        canonicalUrl: BULBAPEDIA_ZA_MOVE_LIST_URL,
        parserVersion: "bulbapedia-za-move-list-v1",
      });
      const tackle = candidate.catalogs.moves.find((entry) => entry.id === "tackle");
      const legacy = candidate.catalogs.moves.find((entry) => entry.id === "legacy-move");
      const gen9Source = candidate.provenance.sourceRecords.find(
        (record) => record.canonicalUrl === BULBAPEDIA_GEN9_MOVE_LIST_URL,
      );
      const gen8Source = candidate.provenance.sourceRecords.find(
        (record) => record.canonicalUrl === BULBAPEDIA_GEN8_MOVE_LIST_URL,
      );
      expect(tackle?.zaBaseCooldownMs).toBe(4000);
      expect(legacy?.zaBaseCooldownMs).toBeNull();
      expect(legacy).toMatchObject({ power: 99, accuracy: 90, basePp: 10 });
      expect(tackle?.sourceRecordIds).toContain(gen9Source?.id);
      expect(legacy?.sourceRecordIds).toContain(gen9Source?.id);
      expect(legacy?.sourceRecordIds).not.toContain(gen8Source?.id);
      expect(tackle?.sourceRecordIds).toContain(zASource?.id);
      expect(legacy?.sourceRecordIds).toContain(zASource?.id);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fetches selected-game historical scalar proof and uses it instead of generation-wide row scalars", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokenexus-maintenance-historical-proof-"));
    const outputDirectory = join(root, "output");
    const cacheDirectory = join(root, "cache");
    const moveUrl = "https://pokemondb.net/move/legacy-move";
    const proofUrl = buildBulbapediaHistoricalScalarProofUrl("Legacy Move", "sword-shield");
    const pokemonDbFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://pokemondb.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === moveUrl) return new Response(pokemonDbMoveHtml("Legacy Move"), { status: 200 });
      return new Response("not found", { status: 404 });
    };
    const bulbapediaFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://bulbapedia.bulbagarden.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /wiki/\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === BULBAPEDIA_ZA_MOVE_LIST_URL) return new Response(bulbapediaZaHtml(), { status: 200 });
      if (url === BULBAPEDIA_GEN9_MOVE_LIST_URL) return new Response(bulbapediaGen9Html("✘"), { status: 200 });
      if (url === BULBAPEDIA_GEN8_MOVE_LIST_URL) return new Response(bulbapediaGen8Html(), { status: 200 });
      if (url === BULBAPEDIA_GEN7_MOVE_LIST_URL) return new Response(bulbapediaGen7Html(), { status: 200 });
      if (url === BULBAPEDIA_TYPE_CHART_URL) return new Response(bulbapediaTypeChartHtml(), { status: 200 });
      if (url === proofUrl) {
        return new Response(
          historicalScalarProofResponse("Legacy Move", "sword-shield"),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    };

    try {
      await runMaintenanceIngestion({
        outputDirectory,
        cacheDirectory,
        roster: endToEndRoster(),
        profile: { movePages: [moveUrl] },
        fetchOptions: {
          fetchImpl: pokemonDbFetch,
          sleep: async () => undefined,
          random: () => 0,
          now: () => "2026-09-19T12:00:00.000Z",
        },
        bulbapediaFetchOptions: {
          fetchImpl: bulbapediaFetch,
          sleep: async () => undefined,
          random: () => 0,
          now: () => "2026-09-19T12:00:01.000Z",
        },
      });
      const candidate = JSON.parse(
        await readFile(join(outputDirectory, "normalized-candidate.json"), "utf8"),
      ) as {
        catalogs: {
          moves: Array<{
            id: string;
            power: number | null;
            accuracy: number | null;
            basePp: number;
            sourceRecordIds: string[];
          }>;
        };
        provenance: {
          sourceRecords: SourceRecord[];
          moveFactSources: Array<{
            moveId: string;
            mainline: { selectedGame: string; sourceRecordId: string };
          }>;
        };
      };
      const legacy = candidate.catalogs.moves.find((entry) => entry.id === "legacy-move");
      expect(legacy).toMatchObject({ power: 77, accuracy: 88, basePp: 17 });
      const proofSource = candidate.provenance.sourceRecords.find(
        (record) => record.canonicalUrl === proofUrl,
      );
      expect(proofSource).toMatchObject({
        provider: "bulbapedia",
        parserVersion: "bulbapedia-historical-scalar-proof-v1",
      });
      expect(legacy?.sourceRecordIds).toContain(proofSource?.id);
      expect(candidate.provenance.moveFactSources).toContainEqual(
        expect.objectContaining({
          moveId: "legacy-move",
          mainline: {
            selectedGame: "sword-shield",
            sourceRecordId: proofSource?.id,
          },
        }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed when the selected-game historical scalar proof is malformed", async () => {
    const root = await mkdtemp(join(tmpdir(), "pokenexus-maintenance-historical-proof-bad-"));
    const moveUrl = "https://pokemondb.net/move/legacy-move";
    const proofUrl = buildBulbapediaHistoricalScalarProofUrl("Legacy Move", "sword-shield");
    const pokemonDbFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://pokemondb.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === moveUrl) return new Response(pokemonDbMoveHtml("Legacy Move"), { status: 200 });
      return new Response("not found", { status: 404 });
    };
    const bulbapediaFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://bulbapedia.bulbagarden.net/robots.txt") {
        return new Response("User-agent: *\nAllow: /wiki/\nCrawl-delay: 0\n", { status: 200 });
      }
      if (url === BULBAPEDIA_ZA_MOVE_LIST_URL) return new Response(bulbapediaZaHtml(), { status: 200 });
      if (url === BULBAPEDIA_GEN9_MOVE_LIST_URL) return new Response(bulbapediaGen9Html("✘"), { status: 200 });
      if (url === BULBAPEDIA_GEN8_MOVE_LIST_URL) return new Response(bulbapediaGen8Html(), { status: 200 });
      if (url === BULBAPEDIA_GEN7_MOVE_LIST_URL) return new Response(bulbapediaGen7Html(), { status: 200 });
      if (url === BULBAPEDIA_TYPE_CHART_URL) return new Response(bulbapediaTypeChartHtml(), { status: 200 });
      if (url === proofUrl) {
        return new Response(
          historicalScalarProofResponse("Legacy Move", "sword-shield", {
            gameEvidence: "{{gameabbrev8|BDSP}}",
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    };

    try {
      await expect(
        runMaintenanceIngestion({
          outputDirectory: join(root, "output"),
          cacheDirectory: join(root, "cache"),
          roster: endToEndRoster(),
          profile: { movePages: [moveUrl] },
          fetchOptions: {
            fetchImpl: pokemonDbFetch,
            sleep: async () => undefined,
            random: () => 0,
            now: () => "2026-09-19T12:00:00.000Z",
          },
          bulbapediaFetchOptions: {
            fetchImpl: bulbapediaFetch,
            sleep: async () => undefined,
            random: () => 0,
            now: () => "2026-09-19T12:00:01.000Z",
          },
        }),
      ).rejects.toThrow(/lacks movedescentry game-abbrev evidence for SwSh/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
