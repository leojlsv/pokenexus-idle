import type { StatBlock } from "@pokenexus/game-types";
import type {
  AbilitySlot,
  GenderRatio,
  GrowthRate,
  LearnMethod,
  SourceFact,
} from "./schema";

export const POKEMONDB_PARSER_VERSION = "pokemondb-html-v2" as const;

export interface PokemonDbHtmlSource {
  url: string;
  sourceRecordId: string;
  html: string;
}

export type SourceUnavailable = { status: "source-unavailable" };

export interface ExtractedSpeciesAbility {
  abilitySourceKey: string;
  sourceAbilitySlot: AbilitySlot;
}

export interface ExtractedPokemonDbSpecies {
  sourceKey: string;
  sourceName: string;
  sourceSlug: string;
  formLabel: string | null;
  nationalDexNumber: number;
  introducedGeneration: number;
  typeSourceKeys: string[];
  heightMillimeters: number;
  weightGrams: number;
  abilities: ExtractedSpeciesAbility[];
  catchRate: number;
  growthRate: GrowthRate;
  baseExperience: SourceFact<number>;
  baseFriendship: SourceFact<number>;
  eggCycles: SourceFact<number>;
  eggGroupSourceKeys: string[];
  genderRatio: GenderRatio;
  baseStats: StatBlock<number>;
  evYield: StatBlock<number>;
  sourceRecordId: string;
  supportingSourceRecordIds?: string[];
}

export interface ExtractedPokemonDbMove {
  sourceKey: string;
  sourceName: string;
  sourceSlug: string;
  introducedGeneration: number;
  typeSourceKey: string;
  category: "physical" | "special" | "status";
  power: number | null;
  accuracy: number | null;
  basePp: number;
  makesContact: boolean;
  sourceTarget: ExtractedMoveSourceTarget;
  /**
   * Variant-specific factual input. PokémonDB mainline parsing never supplies
   * this field. An approved external Z-A source/enrichment step must provide
   * either an integer millisecond value or explicit null before normalization.
   */
  zaBaseCooldownMs?: number | null;
  /**
   * Exact source record consulted for the Z-A Base Cooldown conclusion.
   * Upstream enrichment must provide this together with zaBaseCooldownMs,
   * including when the concluded value is explicit null.
   */
  zaBaseCooldownSourceRecordId?: string;
  /**
   * Exact Bulbapedia traditional-mainline source records consulted/selected
   * under MOVE-01 before canonical normalization. The Generation IX source is
   * always retained; historical fallback sources are appended when required.
   */
  mainlineSourceRecordIds?: string[];
  /** Exact MOVE-01 winner selected by upstream Bulbapedia reconciliation. */
  mainlineSelectedSourceRecordId?: string;
  mainlineSelectedGame?:
    | "scarlet-violet"
    | "brilliant-diamond-shining-pearl"
    | "sword-shield"
    | "ultra-sun-ultra-moon"
    | "sun-moon";
  sourceRecordId: string;
  supportingSourceRecordIds?: string[];
}

export type ExtractedMoveSourceTarget =
  | "any-adjacent"
  | "any-other"
  | "self-or-adjacent-ally"
  | "adjacent-ally"
  | "adjacent-foe"
  | "all-adjacent"
  | "all-adjacent-foes"
  | "self-and-allies"
  | "all-allies"
  | "self"
  | "all-pokemon"
  | "random-opponent"
  | "entire-field"
  | "opponents-side"
  | "users-side"
  | "varies";

export interface ExtractedPokemonDbType {
  sourceKey: string;
  sourceName: string;
  sourceSlug: string;
  sourceRecordId: string;
  supportingSourceRecordIds?: string[];
}

export interface ExtractedPokemonDbTypeEffectiveness {
  attackTypeSourceKey: string;
  defenseTypeSourceKey: string;
  multiplier: 0 | 0.5 | 1 | 2;
  sourceRecordId: string;
  supportingSourceRecordIds?: string[];
}

export interface ExtractedPokemonDbTypeChart {
  types: ExtractedPokemonDbType[];
  currentTypeEffectiveness: ExtractedPokemonDbTypeEffectiveness[];
}

export interface ExtractedPokemonDbAbility {
  sourceKey: string;
  sourceName: string;
  sourceSlug: string;
  introducedGeneration: number | null;
  sourceRecordId: string;
  supportingSourceRecordIds?: string[];
}

export interface ExtractedPokemonDbItem {
  sourceKey: string;
  sourceName: string;
  sourceSlug: string;
  sourceCategory: string | null;
  sourceRecordId: string;
  supportingSourceRecordIds?: string[];
}

export interface ExtractedPokemonDbLearnsetEntry {
  speciesSourceKey: string;
  moveSourceKey: string;
  sourceGeneration: number;
  sourceGame: string;
  method: LearnMethod;
  level: number | null;
  machineIdentifier: string | null;
  sourceRecordId: string;
  supportingSourceRecordIds?: string[];
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  mdash: "—",
  ndash: "–",
  frac12: "½",
};

function decodeHtml(text: string): string {
  return text.replace(
    /&(?:#x([0-9a-f]+)|#(\d+)|([a-z][a-z0-9]+));/gi,
    (match, hex: string | undefined, decimal: string | undefined, named: string | undefined) => {
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
      return HTML_ENTITIES[named!.toLowerCase()] ?? match;
    },
  );
}

function visibleText(html: string): string {
  return decodeHtml(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function requirePokemonDbUrl(source: PokemonDbHtmlSource, expectedPrefix: string): URL {
  let url: URL;
  try {
    url = new URL(source.url);
  } catch {
    throw new Error(`invalid PokémonDB source URL: ${source.url}`);
  }
  if (
    url.origin !== "https://pokemondb.net" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !url.pathname.startsWith(expectedPrefix)
  ) {
    throw new Error(`unexpected PokémonDB source URL for parser: ${source.url}`);
  }
  if (!source.sourceRecordId.trim()) throw new Error("sourceRecordId is required");
  return url;
}

function exactInteger(text: string, label: string, minimum = 0): number {
  const normalized = text.trim();
  if (!/^\d+$/.test(normalized)) throw new Error(`${label}: expected exact integer, got ${JSON.stringify(text)}`);
  const value = Number(normalized);
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${label}: integer outside accepted domain`);
  return value;
}

function exactScaledDecimal(text: string, scale: number, label: string): number {
  const normalized = text.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) throw new Error(`${label}: expected exact non-negative decimal`);
  const decimalDigits = Math.log10(scale);
  const fraction = match[2] ?? "";
  if (fraction.length > decimalDigits) throw new Error(`${label}: source precision exceeds exact target unit`);
  const value = Number(match[1]) * scale + Number((fraction + "0".repeat(decimalDigits)).slice(0, decimalDigits));
  if (!Number.isSafeInteger(value)) throw new Error(`${label}: exact unit conversion overflow`);
  return value;
}

function exactPercentBasisPoints(text: string, label: string): number {
  const normalized = text.trim();
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new Error(`${label}: expected percentage with at most two decimal places`);
  const value = Number(match[1]) * 100 + Number(((match[2] ?? "") + "00").slice(0, 2));
  if (value < 0 || value > 10_000) throw new Error(`${label}: percentage outside 0..100`);
  return value;
}

function isSourceDash(cellHtml: string): boolean {
  return visibleText(cellHtml) === "—";
}

function sourceFactFromCell(cellHtml: string, label: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER): SourceFact<number> {
  if (isSourceDash(cellHtml)) return { status: "source-unavailable" };
  const text = visibleText(cellHtml).match(/^\d+/)?.[0];
  if (!text) throw new Error(`${label}: expected integer or explicit source dash`);
  const value = exactInteger(text, label, minimum);
  if (value > maximum) throw new Error(`${label}: value exceeds accepted domain`);
  return { status: "known", value };
}

function rowCells(html: string): Map<string, string> {
  const result = new Map<string, string>();
  const rows = /<tr\b[^>]*>\s*<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;
  for (const match of html.matchAll(rows)) {
    const key = visibleText(match[1]);
    if (key && !result.has(key)) result.set(key, match[2]);
  }
  return result;
}

function requiredCell(rows: Map<string, string>, label: string): string {
  const cell = rows.get(label);
  if (cell === undefined) throw new Error(`required structured field ${label} is missing`);
  return cell;
}

function linkedKeys(cellHtml: string, prefix: string): string[] {
  const expression = new RegExp(`href=["']${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^"'#?]+)["']`, "gi");
  return [...cellHtml.matchAll(expression)].map((match) => decodeHtml(match[1]).trim());
}

function parseGrowthRate(cellHtml: string): GrowthRate {
  if (isSourceDash(cellHtml)) throw new Error("Growth Rate: source-unavailable is not valid for a persistent Species/form");
  const normalized = visibleText(cellHtml).toLowerCase().replace(/\s+/g, "-");
  const allowed: GrowthRate[] = ["slow", "medium-slow", "medium-fast", "fast", "erratic", "fluctuating"];
  if (!allowed.includes(normalized as GrowthRate)) throw new Error(`Growth Rate: unknown source value ${JSON.stringify(normalized)}`);
  return normalized as GrowthRate;
}

function parseGender(cellHtml: string): GenderRatio {
  if (isSourceDash(cellHtml)) throw new Error("Gender: source-unavailable is not valid for a persistent Species/form");
  const text = visibleText(cellHtml);
  if (/^genderless$/i.test(text)) return { kind: "genderless" };
  const male = /([0-9]+(?:\.[0-9]+)?)%\s*male/i.exec(text);
  const female = /([0-9]+(?:\.[0-9]+)?)%\s*female/i.exec(text);
  if (!male || !female) throw new Error("Gender: expected explicit male/female percentages or Genderless");
  const maleBasisPoints = exactPercentBasisPoints(male[1], "Gender male");
  const femaleBasisPoints = exactPercentBasisPoints(female[1], "Gender female");
  if (maleBasisPoints + femaleBasisPoints !== 10_000) throw new Error("Gender: source percentages must sum to 100%");
  return { kind: "ratio", maleBasisPoints, femaleBasisPoints };
}

function parseAbilities(cellHtml: string): ExtractedSpeciesAbility[] {
  if (isSourceDash(cellHtml)) throw new Error("Abilities: source-unavailable is not valid for a persistent Species/form");
  const assignments: ExtractedSpeciesAbility[] = [];
  for (const match of cellHtml.matchAll(/([12])\.\s*<a\b[^>]*href=["']\/ability\/([^"'#?]+)["'][^>]*>/gi)) {
    assignments.push({
      abilitySourceKey: decodeHtml(match[2]),
      sourceAbilitySlot: match[1] === "1" ? "normal-1" : "normal-2",
    });
  }
  const hiddenBlock = /<small\b[^>]*>([\s\S]*?hidden ability[\s\S]*?)<\/small>/i.exec(cellHtml);
  if (hiddenBlock) {
    const hidden = /<a\b[^>]*href=["']\/ability\/([^"'#?]+)["'][^>]*>/i.exec(hiddenBlock[1]);
    if (!hidden) throw new Error("Abilities: hidden Ability marker has no structured Ability link");
    assignments.push({ abilitySourceKey: decodeHtml(hidden[1]), sourceAbilitySlot: "hidden" });
  }
  if (assignments.length === 0) throw new Error("Abilities: unable to map structured source Ability slots");
  const slots = new Set(assignments.map((entry) => entry.sourceAbilitySlot));
  if (slots.size !== assignments.length) throw new Error("Abilities: duplicate source Ability slot");
  return assignments;
}

const STAT_LABELS: Record<string, keyof StatBlock<number>> = {
  HP: "hp",
  Attack: "atk",
  Defense: "def",
  "Sp. Atk": "spa",
  "Sp. Def": "spd",
  Speed: "spe",
};

function parseBaseStats(rows: Map<string, string>): StatBlock<number> {
  const stats: StatBlock<number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  for (const [sourceLabel, key] of Object.entries(STAT_LABELS)) {
    const cell = requiredCell(rows, sourceLabel);
    const first = visibleText(cell).match(/^\d+/)?.[0];
    if (!first) throw new Error(`Base stats ${sourceLabel}: expected integer`);
    stats[key] = exactInteger(first, `Base stats ${sourceLabel}`, 1);
  }
  return stats;
}

function parseEvYield(cellHtml: string): StatBlock<number> {
  if (isSourceDash(cellHtml)) throw new Error("EV yield: source-unavailable is not valid for a persistent Species/form");
  const text = visibleText(cellHtml);
  const stats: StatBlock<number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const labels: Record<string, keyof StatBlock<number>> = {
    HP: "hp",
    Attack: "atk",
    Defense: "def",
    "Sp. Atk": "spa",
    "Sp. Def": "spd",
    Speed: "spe",
  };
  const matches = [...text.matchAll(/(\d+)\s+(HP|Attack|Defense|Sp\. Atk|Sp\. Def|Speed)/g)];
  if (matches.length === 0) throw new Error(`EV yield: unknown structured value ${JSON.stringify(text)}`);
  for (const match of matches) stats[labels[match[2]]] = exactInteger(match[1], `EV yield ${match[2]}`, 0);
  return stats;
}

function pageHeading(source: PokemonDbHtmlSource): string {
  const match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(source.html);
  if (!match) throw new Error("required page h1 is missing");
  return visibleText(match[1]);
}

function basePanelLabelForSpeciesPage(slug: string, heading: string): string {
  if (slug === "nidoran-f" && heading === "Nidoran♀ (female)") return "Nidoran♀";
  if (slug === "nidoran-m" && heading === "Nidoran♂ (male)") return "Nidoran♂";
  return heading;
}

function baseIntroducedGeneration(html: string): number {
  const match = /introduced\s+in\s+Generation\s+(\d+)/i.exec(visibleText(html));
  if (!match) throw new Error("required structured introduced Generation is missing");
  return exactInteger(match[1], "introduced Generation", 1);
}

interface BasicFormPanel {
  id: string;
  label: string;
  html: string;
}

export interface DiscoveredPokemonDbSpeciesForm {
  sourceKey: string;
  sourceName: string;
  sourceSlug: string;
  formLabel: string | null;
}

function basicFormPanels(html: string): BasicFormPanel[] {
  const tabs = [...html.matchAll(/<a\b[^>]*class=["'][^"']*sv-tabs-tab[^"']*["'][^>]*href=["']#tab-basic-([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({
    id: match[1],
    label: visibleText(match[2]),
  }));
  if (tabs.length === 0) throw new Error("Species parser: no tab-basic source forms found");
  const starts = tabs.map((tab) => {
    const expression = new RegExp(`<div\\b[^>]*class=["'][^"']*sv-tabs-panel[^"']*["'][^>]*id=["']tab-basic-${tab.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i");
    const match = expression.exec(html);
    if (!match || match.index === undefined) throw new Error(`Species parser: panel tab-basic-${tab.id} is missing`);
    return { ...tab, index: match.index + match[0].length };
  });
  return starts.map((entry, index) => ({
    id: entry.id,
    label: entry.label,
    html: html.slice(entry.index, starts[index + 1]?.index ?? html.length),
  }));
}

export function discoverPokemonDbSpeciesForms(
  source: PokemonDbHtmlSource,
): DiscoveredPokemonDbSpeciesForm[] {
  const url = requirePokemonDbUrl(source, "/pokedex/");
  if (!/^\/pokedex\/[^/]+\/?$/u.test(url.pathname)) {
    throw new Error("Species discovery requires https://pokemondb.net/pokedex/<slug>");
  }
  const slug = url.pathname.split("/").filter(Boolean)[1];
  if (!slug) throw new Error("Species discovery: source slug is missing");
  const heading = pageHeading(source);
  const basePanelLabel = basePanelLabelForSpeciesPage(slug, heading);
  return basicFormPanels(source.html).map((panel) => ({
    sourceKey: `pokedex:${slug}:${panel.id}`,
    sourceName: panel.label,
    sourceSlug: slug,
    formLabel: panel.label === basePanelLabel ? null : panel.label,
  }));
}

export interface PokemonDbSpeciesParseOptions {
  exactFormIntroducedGenerationEvidence?: Readonly<
    Record<string, { introducedGeneration: number; sourceRecordId: string }>
  >;
  excludedSourceKeys?: ReadonlySet<string>;
}

export function parsePokemonDbSpeciesPage(
  source: PokemonDbHtmlSource,
  options: PokemonDbSpeciesParseOptions = {},
): ExtractedPokemonDbSpecies[] {
  const url = requirePokemonDbUrl(source, "/pokedex/");
  if (!/^\/pokedex\/[^/]+\/?$/u.test(url.pathname)) {
    throw new Error("Species parser requires https://pokemondb.net/pokedex/<slug>");
  }
  const slug = url.pathname.split("/").filter(Boolean)[1];
  if (!slug) throw new Error("Species parser: source slug is missing");
  const heading = pageHeading(source);
  const basePanelLabel = basePanelLabelForSpeciesPage(slug, heading);
  const pageGeneration = baseIntroducedGeneration(source.html);
  const panels = basicFormPanels(source.html);

  return panels.flatMap((panel) => {
    const sourceKey = `pokedex:${slug}:${panel.id}`;
    if (options.excludedSourceKeys?.has(sourceKey)) return [];
    const rows = rowCells(panel.html);
    const formLabel = panel.label === basePanelLabel ? null : panel.label;
    const typeSourceKeys = linkedKeys(requiredCell(rows, "Type"), "/type/");
    if (typeSourceKeys.length < 1 || typeSourceKeys.length > 2) throw new Error(`Type: expected one or two structured Type links for ${panel.label}`);

    const nationalText = visibleText(requiredCell(rows, "National №"));
    const heightText = visibleText(requiredCell(rows, "Height"));
    const weightText = visibleText(requiredCell(rows, "Weight"));
    const height = /^(\d+(?:\.\d+)?)\s*m\b/i.exec(heightText);
    const weight = /^(\d+(?:\.\d+)?)\s*kg\b/i.exec(weightText);
    if (!height) throw new Error(`Height: unable to parse exact metres for ${panel.label}`);
    if (!weight) throw new Error(`Weight: unable to parse exact kilograms for ${panel.label}`);

    const catchCell = requiredCell(rows, "Catch rate");
    if (isSourceDash(catchCell)) throw new Error(`Catch rate: source-unavailable is not valid for persistent form ${panel.label}`);
    const catchRate = exactInteger(visibleText(catchCell).match(/^\d+/)?.[0] ?? "", "Catch rate", 0);
    const eggGroupsCell = requiredCell(rows, "Egg Groups");
    if (isSourceDash(eggGroupsCell)) throw new Error(`Egg Groups: source-unavailable is not valid for persistent form ${panel.label}`);
    const eggGroupSourceKeys = linkedKeys(eggGroupsCell, "/egg-group/");
    if (eggGroupSourceKeys.length < 1 || eggGroupSourceKeys.length > 2) {
      throw new Error("Egg Groups: expected one or two structured source links");
    }
    const exactFormEvidence =
      formLabel === null
        ? undefined
        : options.exactFormIntroducedGenerationEvidence?.[sourceKey];
    const introducedGeneration =
      formLabel === null ? pageGeneration : exactFormEvidence?.introducedGeneration;
    if (introducedGeneration === undefined) {
      throw new Error(`introduced generation: exact-form evidence is required for ${panel.label}`);
    }
    if (!Number.isSafeInteger(introducedGeneration) || introducedGeneration < 1) {
      throw new Error(`introduced generation: invalid exact-form value for ${panel.label}`);
    }
    if (exactFormEvidence && !exactFormEvidence.sourceRecordId.trim()) {
      throw new Error(
        `introduced generation: exact-form evidence SourceRecord is required for ${panel.label}`,
      );
    }

    return {
      sourceKey,
      sourceName: panel.label,
      sourceSlug: slug,
      formLabel,
      nationalDexNumber: exactInteger(nationalText.replace(/^0+/, "") || "0", "National №", 1),
      introducedGeneration,
      typeSourceKeys,
      heightMillimeters: exactScaledDecimal(height[1], 1000, "Height"),
      weightGrams: exactScaledDecimal(weight[1], 1000, "Weight"),
      abilities: parseAbilities(requiredCell(rows, "Abilities")),
      catchRate,
      growthRate: parseGrowthRate(requiredCell(rows, "Growth Rate")),
      baseExperience: sourceFactFromCell(requiredCell(rows, "Base Exp."), "Base Exp.", 0),
      baseFriendship: sourceFactFromCell(requiredCell(rows, "Base Friendship"), "Base Friendship", 0, 255),
      eggCycles: sourceFactFromCell(requiredCell(rows, "Egg cycles"), "Egg cycles", 1),
      eggGroupSourceKeys,
      genderRatio: parseGender(requiredCell(rows, "Gender")),
      baseStats: parseBaseStats(rows),
      evYield: parseEvYield(requiredCell(rows, "EV yield")),
      sourceRecordId: source.sourceRecordId,
      supportingSourceRecordIds: exactFormEvidence
        ? [exactFormEvidence.sourceRecordId]
        : undefined,
    };
  });
}

function sourceSlugFromUrl(source: PokemonDbHtmlSource, prefix: string): string {
  const url = requirePokemonDbUrl(source, prefix);
  const remainder = url.pathname.slice(prefix.length);
  if (!/^[^/]+\/?$/u.test(remainder)) {
    throw new Error(`unexpected PokémonDB entity path for parser: ${source.url}`);
  }
  const slug = remainder.replace(/\/$/u, "");
  if (!slug) throw new Error(`source slug missing for ${source.url}`);
  return slug;
}

function headingEntityName(source: PokemonDbHtmlSource, suffix: "move" | "ability" | "item"): string {
  const heading = pageHeading(source);
  return heading.replace(new RegExp(`\\s*\\(${suffix}\\)\\s*$`, "i"), "").trim();
}

function parseNullableMoveNumber(cellHtml: string, label: string, minimum: number): number | null {
  if (isSourceDash(cellHtml)) return null;
  const first = visibleText(cellHtml).match(/^\d+/)?.[0];
  if (!first) throw new Error(`${label}: expected integer or explicit source dash`);
  return exactInteger(first, label, minimum);
}

function parseNullableMoveAccuracy(cellHtml: string): number | null {
  if (/^\s*(?:&infin;|∞)\s*$/iu.test(cellHtml)) return null;
  return parseNullableMoveNumber(cellHtml, "Move Accuracy", 1);
}

const MOVE_TARGET_DESCRIPTIONS: Record<string, ExtractedMoveSourceTarget> = {
  "Targets a single adjacent Pokémon.": "any-adjacent",
  "Targets a single adjacent opponent.": "adjacent-foe",
  "Targets a single adjacent foe, but not an ally.": "adjacent-foe",
  "Targets a random adjacent opponent.": "random-opponent",
  "Targets a random adjacent foe.": "random-opponent",
  "Targets the user, but hits a random adjacent opponent.": "random-opponent",
  "Targets all adjacent opponents.": "all-adjacent-foes",
  "Targets all adjacent foes.": "all-adjacent-foes",
  "Targets all adjacent Pokémon.": "all-adjacent",
  "Targets any Pokémon except the user.": "any-other",
  "Targets any single Pokémon on the field including non-adjacent ones.": "any-other",
  "Targets an adjacent ally.": "adjacent-ally",
  "Targets an adjacent Pokémon on the user's team.": "adjacent-ally",
  "Targets an adjacent Pokémon on the user’s team.": "adjacent-ally",
  "Targets either the user or an adjacent Pokémon on the user's team.": "self-or-adjacent-ally",
  "Targets either the user or an adjacent Pokémon on the user’s team.": "self-or-adjacent-ally",
  "Targets all allies.": "all-allies",
  "Targets the user.": "self",
  "Targets the user and all allies.": "self-and-allies",
  "Targets all Pokémon on the user's team.": "self-and-allies",
  "Targets all Pokémon on the user’s team.": "self-and-allies",
  "Targets all Pokémon.": "all-pokemon",
  "Targets the opposing side.": "opponents-side",
  "Targets all Pokémon on the opposing field.": "opponents-side",
  "Targets the user's side.": "users-side",
  "Targets the user’s side.": "users-side",
  "Targets the entire field.": "entire-field",
  "Varies according to the move.": "varies",
};

function parseMoveTarget(html: string): ExtractedMoveSourceTarget {
  const heading = /<h2\b[^>]*>\s*Move target\s*<\/h2>/i.exec(html);
  if (!heading || heading.index === undefined) throw new Error("Move target: required structured section is missing");
  const remainder = html.slice(heading.index + heading[0].length);
  const paragraph = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(remainder);
  if (!paragraph) throw new Error("Move target: labeled target description is missing");
  const description = visibleText(paragraph[1]);
  const mapped = MOVE_TARGET_DESCRIPTIONS[description];
  if (!mapped) throw new Error(`Move target: unmapped source classification ${JSON.stringify(description)}`);
  return mapped;
}

export function parsePokemonDbMovePage(source: PokemonDbHtmlSource): ExtractedPokemonDbMove {
  const slug = sourceSlugFromUrl(source, "/move/");
  const moveDataHeading = /<h2\b[^>]*>\s*Move data\s*<\/h2>/i.exec(source.html);
  if (!moveDataHeading || moveDataHeading.index === undefined) throw new Error("Move data: required structured section is missing");
  const rows = rowCells(source.html.slice(moveDataHeading.index));
  const typeKeys = linkedKeys(requiredCell(rows, "Type"), "/type/");
  if (typeKeys.length !== 1) throw new Error("Move Type: expected one structured Type link");
  const category = visibleText(requiredCell(rows, "Category")).toLowerCase();
  if (category !== "physical" && category !== "special" && category !== "status") throw new Error(`Move Category: unknown source value ${category}`);
  const introduced = /Generation\s+(\d+)/i.exec(visibleText(requiredCell(rows, "Introduced")));
  if (!introduced) throw new Error("Move Introduced: expected Generation N");
  const contact = visibleText(requiredCell(rows, "Makes contact?")).toLowerCase();
  if (contact !== "yes" && contact !== "no") throw new Error("Move Makes contact?: expected Yes or No");
  return {
    sourceKey: slug,
    sourceName: headingEntityName(source, "move"),
    sourceSlug: slug,
    introducedGeneration: exactInteger(introduced[1], "Move Introduced", 1),
    typeSourceKey: typeKeys[0],
    category,
    power: parseNullableMoveNumber(requiredCell(rows, "Power"), "Move Power", 0),
    accuracy: parseNullableMoveAccuracy(requiredCell(rows, "Accuracy")),
    basePp: exactInteger(visibleText(requiredCell(rows, "PP")).match(/^\d+/)?.[0] ?? "", "Move PP", 1),
    makesContact: contact === "yes",
    sourceTarget: parseMoveTarget(source.html),
    sourceRecordId: source.sourceRecordId,
  };
}

export function parsePokemonDbAbilityPage(source: PokemonDbHtmlSource): ExtractedPokemonDbAbility {
  const slug = sourceSlugFromUrl(source, "/ability/");
  return {
    sourceKey: slug,
    sourceName: headingEntityName(source, "ability"),
    sourceSlug: slug,
    introducedGeneration: null,
    sourceRecordId: source.sourceRecordId,
  };
}

export function parsePokemonDbItemPage(source: PokemonDbHtmlSource): ExtractedPokemonDbItem {
  const slug = sourceSlugFromUrl(source, "/item/");
  let sourceCategory: string | null = null;
  const itemData = /<h2\b[^>]*>\s*Item data\s*<\/h2>/i.exec(source.html);
  if (itemData?.index !== undefined) {
    const rows = rowCells(source.html.slice(itemData.index));
    const category = rows.get("Category") ?? rows.get("Pocket");
    if (category !== undefined && !isSourceDash(category)) sourceCategory = visibleText(category) || null;
  }
  return {
    sourceKey: slug,
    sourceName: headingEntityName(source, "item"),
    sourceSlug: slug,
    sourceCategory,
    sourceRecordId: source.sourceRecordId,
  };
}

function sectionBetween(html: string, startPattern: RegExp, endPattern?: RegExp): string {
  const start = startPattern.exec(html);
  if (!start || start.index === undefined) throw new Error(`required parser section ${startPattern.source} is missing`);
  const offset = start.index + start[0].length;
  const remainder = html.slice(offset);
  const end = endPattern?.exec(remainder);
  return end?.index === undefined ? remainder : remainder.slice(0, end.index);
}

export function parsePokemonDbTypeChartPage(source: PokemonDbHtmlSource): ExtractedPokemonDbTypeChart {
  const url = requirePokemonDbUrl(source, "/type");
  if (url.pathname !== "/type" && url.pathname !== "/type/") throw new Error("Type chart parser requires https://pokemondb.net/type");
  const quickList = sectionBetween(source.html, /<h2\b[^>]*>\s*Type quick-list\s*<\/h2>/i, /<h2\b[^>]*>\s*Type chart\s*<\/h2>/i);
  const types = [...quickList.matchAll(/<a\b[^>]*class=["'][^"']*\btype-icon\b[^"']*["'][^>]*href=["']\/type\/([^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({
    sourceKey: decodeHtml(match[1]),
    sourceName: visibleText(match[2]),
    sourceSlug: decodeHtml(match[1]),
    sourceRecordId: source.sourceRecordId,
  }));
  if (types.length === 0 || new Set(types.map((entry) => entry.sourceKey)).size !== types.length) throw new Error("Type quick-list: expected unique structured Type links");

  const chartSection = sectionBetween(source.html, /<h2\b[^>]*>\s*Type chart\s*<\/h2>/i, /<h2\b[^>]*>\s*Type chart changes\s*<\/h2>/i);
  const table = /<table\b[^>]*class=["'][^"']*\btype-table\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/i.exec(chartSection);
  if (!table) throw new Error("Type chart: required structured type-table is missing");
  const thead = /<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(table[1]);
  const tbody = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(table[1]);
  if (!thead || !tbody) throw new Error("Type chart: thead/tbody structure is missing");
  const defenseKeys = [...thead[1].matchAll(/href=["']\/type\/([^"'#?]+)["']/gi)].map((match) => decodeHtml(match[1]));
  if (defenseKeys.length !== types.length) throw new Error("Type chart: defense headers do not match quick-list completeness");

  const currentTypeEffectiveness: ExtractedPokemonDbTypeEffectiveness[] = [];
  const rows = [...tbody[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rows.length !== types.length) throw new Error("Type chart: attack row count does not match quick-list completeness");
  const multiplierByClass: Record<string, 0 | 0.5 | 1 | 2> = { "0": 0, "50": 0.5, "100": 1, "200": 2 };
  for (const row of rows) {
    const attack = /<th\b[^>]*>[\s\S]*?href=["']\/type\/([^"'#?]+)["']/i.exec(row[1]);
    if (!attack) throw new Error("Type chart: attack row Type link is missing");
    const cells = [...row[1].matchAll(/<td\b[^>]*class=["'][^"']*\btype-fx-cell\b[^"']*\btype-fx-(0|50|100|200)\b[^"']*["'][^>]*>[\s\S]*?<\/td>/gi)];
    if (cells.length !== defenseKeys.length) throw new Error(`Type chart: row ${attack[1]} has incomplete effectiveness cells`);
    cells.forEach((cell, index) => {
      currentTypeEffectiveness.push({
        attackTypeSourceKey: decodeHtml(attack[1]),
        defenseTypeSourceKey: defenseKeys[index],
        multiplier: multiplierByClass[cell[1]],
        sourceRecordId: source.sourceRecordId,
      });
    });
  }
  return { types, currentTypeEffectiveness };
}

interface TabPanel {
  id: string;
  label: string;
  html: string;
}

function gameTabPanels(html: string): TabPanel[] {
  const tabs = [...html.matchAll(/<a\b[^>]*class=["'][^"']*sv-tabs-tab[^"']*["'][^>]*href=["']#([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({ id: match[1], label: visibleText(match[2]) }));
  if (tabs.length === 0) throw new Error("Learnset parser: no game tabs found");
  const starts = tabs.map((tab) => {
    const expression = new RegExp(`<div\\b[^>]*class=["'][^"']*sv-tabs-panel[^"']*["'][^>]*id=["']${tab.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i");
    const match = expression.exec(html);
    if (!match || match.index === undefined) throw new Error(`Learnset parser: tab panel ${tab.id} is missing`);
    return { ...tab, index: match.index + match[0].length };
  });
  return starts.map((entry, index) => ({ id: entry.id, label: entry.label, html: html.slice(entry.index, starts[index + 1]?.index ?? html.length) }));
}

function methodFromHeading(heading: string): LearnMethod | null {
  const normalized = heading.toLowerCase();
  if (normalized === "moves learnt by level up") return "level-up";
  if (normalized === "egg moves") return "egg";
  if (normalized === "moves learnt by tm" || normalized === "moves learnt by hm") return "machine";
  if (normalized === "moves learnt on evolution") return "evolution";
  if (normalized.includes("move tutor")) return "tutor";
  if (normalized.includes("transfer")) return "transfer";
  if (normalized.includes("move reminder")) return "reminder";
  return null;
}

function parseLearnsetTableRows(
  body: string,
  method: LearnMethod,
  speciesSourceKey: string,
  sourceGeneration: number,
  sourceGame: string,
  sourceRecordId: string,
): ExtractedPokemonDbLearnsetEntry[] {
  const records: ExtractedPokemonDbLearnsetEntry[] = [];
  for (const row of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const move = /href=["']\/move\/([^"'#?]+)["']/i.exec(row[1]);
    if (!move) {
      if (visibleText(row[1])) {
        throw new Error(`Learnset ${sourceGame}: structured row is missing a Move link`);
      }
      continue;
    }
    let level: number | null = null;
    let machineIdentifier: string | null = null;
    if (method === "level-up") {
      const firstCell = /<td\b[^>]*>([\s\S]*?)<\/td>/i.exec(row[1]);
      if (!firstCell) throw new Error(`Learnset ${sourceGame}: level-up row missing level cell`);
      level = exactInteger(visibleText(firstCell[1]), `Learnset ${sourceGame} level`, 1);
    } else if (method === "machine") {
      const machine = /href=["']\/item\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i.exec(row[1]);
      if (!machine) throw new Error(`Learnset ${sourceGame}: machine row missing machine identifier link`);
      machineIdentifier = visibleText(machine[1]);
      if (!machineIdentifier) throw new Error(`Learnset ${sourceGame}: empty machine identifier`);
    }
    records.push({
      speciesSourceKey,
      moveSourceKey: decodeHtml(move[1]),
      sourceGeneration,
      sourceGame,
      method,
      level,
      machineIdentifier,
      sourceRecordId,
    });
  }
  return records;
}

export function parsePokemonDbLearnsetPage(source: PokemonDbHtmlSource, speciesSourceKey: string): ExtractedPokemonDbLearnsetEntry[] {
  const url = requirePokemonDbUrl(source, "/pokedex/");
  const generation = /\/moves\/(\d+)\/?$/i.exec(url.pathname);
  if (!generation) throw new Error("Learnset parser requires /pokedex/<slug>/moves/<generation> URL");
  const sourceGeneration = exactInteger(generation[1], "Learnset generation", 1);
  const records: ExtractedPokemonDbLearnsetEntry[] = [];
  for (const panel of gameTabPanels(source.html)) {
    const headings = [...panel.html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)];
    for (const [index, section] of headings.entries()) {
      const heading = visibleText(section[1]);
      const method = methodFromHeading(heading);
      const looksLikeLearnsetSection = /\bmove|moves\b/i.test(heading);
      if (!method) {
        if (looksLikeLearnsetSection) {
          throw new Error(`Learnset ${panel.label}: unmapped structured method heading ${JSON.stringify(heading)}`);
        }
        continue;
      }
      const start = (section.index ?? 0) + section[0].length;
      const end = headings[index + 1]?.index ?? panel.html.length;
      const boundedSection = panel.html.slice(start, end);
      const table = /<table\b[^>]*>[\s\S]*?<tbody\b[^>]*>([\s\S]*?)<\/tbody>\s*<\/table>/i.exec(boundedSection);
      if (!table) {
        throw new Error(`Learnset ${panel.label}: recognized section ${JSON.stringify(heading)} has no bounded table`);
      }
      records.push(...parseLearnsetTableRows(table[1], method, speciesSourceKey, sourceGeneration, panel.label, source.sourceRecordId));
    }
  }
  if (records.length === 0) throw new Error("Learnset parser: no recognized structured learnset rows found");
  return records;
}
