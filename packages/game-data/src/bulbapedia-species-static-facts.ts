import type { StatBlock } from "@pokenexus/game-types";
import {
  EGG_GROUP_KEYS,
  type AbilitySlot,
  type EggGroupKey,
  type GenderRatio,
  type GrowthRate,
} from "./schema.js";

export const BULBAPEDIA_SPECIES_STATIC_FACTS_PARSER_VERSION =
  "bulbapedia-species-static-facts-v12" as const;

export const BULBAPEDIA_SPECIES_STATIC_FACTS_URL_PREFIX =
  "https://bulbapedia.bulbagarden.net/wiki/" as const;

export const BULBAPEDIA_KANTO_JOHTO_SPECIES_DISCOVERY_URL =
  "https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_by_National_Pok%C3%A9dex_number" as const;

export const BULBAPEDIA_KANTO_JOHTO_SPECIES_DISCOVERY_PARSER_VERSION =
  "bulbapedia-kanto-johto-species-discovery-v1" as const;

export interface BulbapediaSpeciesStaticFactsHtmlSource {
  url: string;
  sourceRecordId: string;
  html: string;
}

export type BulbapediaStaticFact<T> =
  | { status: "known"; value: T }
  | { status: "source-unavailable" };

export type BulbapediaFormLabel = string | null;

export interface BulbapediaScopedFact<T> {
  /** Exact persistent forms explicitly covered by this single source value. */
  formLabels: BulbapediaFormLabel[];
  fact: BulbapediaStaticFact<T>;
}

export interface BulbapediaScopedAbilityEvidence {
  formLabels: BulbapediaFormLabel[];
  abilitySourceKey: string;
  sourceName: string;
  sourceAbilitySlot: AbilitySlot;
}

export interface ExtractedBulbapediaSpeciesStaticFacts {
  sourceName: string;
  /** null is the base page form; other values are exact visible structured form labels. */
  formLabels: BulbapediaFormLabel[];
  abilities: BulbapediaScopedAbilityEvidence[];
  catchRate: BulbapediaScopedFact<number>[];
  growthRate: BulbapediaScopedFact<GrowthRate>[];
  baseExperience: BulbapediaScopedFact<number>[];
  baseFriendship: BulbapediaScopedFact<number>[];
  eggCycles: BulbapediaScopedFact<number>[];
  eggGroups: BulbapediaScopedFact<EggGroupKey[]>[];
  genderRatio: BulbapediaScopedFact<GenderRatio>[];
  heightMillimeters: BulbapediaScopedFact<number>[];
  weightGrams: BulbapediaScopedFact<number>[];
  metricComplementFormLabels: {
    heightMillimeters: string[];
    weightGrams: string[];
  };
  metricHiddenPlaceholderFormLabels: {
    heightMillimeters: string[];
    weightGrams: string[];
  };
  evYield: BulbapediaScopedFact<StatBlock<number>>[];
  sourceRecordId: string;
}

export interface ExtractedBulbapediaCoreSpeciesDiscovery {
  nationalDexNumber: number;
  sourceName: string;
  sourcePageUrl: string;
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

interface HtmlElement {
  attributes: string;
  innerHtml: string;
  start: number;
  end: number;
}

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

const VOID_HTML_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function maskInertHtml(html: string): string {
  const mask = (match: string): string => " ".repeat(match.length);
  return html
    .replace(/<!--[\s\S]*?-->/g, mask)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, mask)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, mask);
}

function hiddenSubtreeEnd(
  html: string,
  start: number,
  tagName: string,
  openingTag: string,
  structuralHtml = maskInertHtml(html),
): number {
  const normalizedTag = tagName.toLowerCase();
  if (/\/\s*>$/.test(openingTag) || VOID_HTML_ELEMENTS.has(normalizedTag)) {
    return start + openingTag.length;
  }
  const sameTag = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  sameTag.lastIndex = start;
  let depth = 0;
  for (let token = sameTag.exec(structuralHtml); token !== null; token = sameTag.exec(structuralHtml)) {
    const tokenText = token[0];
    if (/^<\//.test(tokenText)) {
      depth -= 1;
    } else if (!/\/\s*>$/.test(tokenText)) {
      depth += 1;
    }
    if (depth === 0) return token.index + tokenText.length;
    if (depth < 0) break;
  }
  throw new Error(`Bulbapedia Species static facts: hidden <${tagName}> subtree is unbalanced`);
}

function withoutHiddenSubtrees(html: string): string {
  let result = html;
  for (let pass = 0; pass < 1024; pass += 1) {
    const structuralHtml = maskInertHtml(result);
    const openingTag = /<([a-z][a-z0-9:-]*)\b([^>]*)>/gi;
    let hidden: RegExpExecArray | null = null;
    for (let match = openingTag.exec(structuralHtml); match !== null; match = openingTag.exec(structuralHtml)) {
      if (isHiddenAttributes(match[2] ?? "")) {
        hidden = match;
        break;
      }
    }
    if (!hidden || hidden.index === undefined) return result;
    const end = hiddenSubtreeEnd(result, hidden.index, hidden[1], hidden[0], structuralHtml);
    result = `${result.slice(0, hidden.index)} ${result.slice(end)}`;
  }
  throw new Error("Bulbapedia Species static facts: too many hidden subtrees");
}

function visibleText(html: string): string {
  return decodeHtml(
    withoutHiddenSubtrees(html)
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function stripHistoricalEvYieldAnnotations(html: string): string {
  return html.replace(
    /<span\b([^>]*)>([\s\S]*?)<\/span>/gi,
    (match, attributes: string, innerHtml: string) => {
      if (visibleText(innerHtml) !== "*") return match;
      const classValue = /\bclass=["']([^"']+)["']/i.exec(attributes)?.[1] ?? "";
      if (!classValue.split(/\s+/).includes("explain")) {
        throw new Error("EV yield: unsupported asterisk annotation");
      }
      const title = /\btitle=["']([^"']+)["']/i.exec(attributes)?.[1];
      const decodedTitle = title ? decodeHtml(title) : "";
      if (
        decodedTitle !== "1 in Generation III" &&
        decodedTitle !== "2 in Generation III" &&
        decodedTitle !== "3 prior to generation VIII"
      ) {
        throw new Error("EV yield: unsupported historical annotation");
      }
      return "";
    },
  );
}

function isHiddenAttributes(attributes: string): boolean {
  const attributeNames = attributes.replace(/"[^"]*"|'[^']*'/g, " ");
  return /(?:^|\s)hidden(?:\s|=|$)/i.test(attributeNames) ||
    /\bstyle\s*=\s*["'][^"']*display\s*:\s*none/i.test(attributes) ||
    /\baria-hidden\s*=\s*["']true["']/i.test(attributes);
}

function elements(html: string, tag: string): HtmlElement[] {
  const expression = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  const stack: Array<{ attributes: string; start: number; openEnd: number }> = [];
  const result: HtmlElement[] = [];
  const structuralHtml = maskInertHtml(html);
  for (const match of structuralHtml.matchAll(expression)) {
    if (match.index === undefined) continue;
    if (/^<\//.test(match[0])) {
      const open = stack.pop();
      if (!open) throw new Error(`Bulbapedia Species static facts: unbalanced <${tag}> markup`);
      result.push({
        attributes: open.attributes,
        innerHtml: html.slice(open.openEnd, match.index),
        start: open.start,
        end: match.index + match[0].length,
      });
    } else {
      const attrs = new RegExp(`^<${tag}\\b([^>]*)>`, "i").exec(match[0])?.[1] ?? "";
      stack.push({ attributes: attrs, start: match.index, openEnd: match.index + match[0].length });
    }
  }
  if (stack.length !== 0) throw new Error(`Bulbapedia Species static facts: unbalanced <${tag}> markup`);
  return result.sort((left, right) => left.start - right.start);
}

function hiddenSubtreeRanges(html: string): Array<{ start: number; end: number }> {
  const result: Array<{ start: number; end: number }> = [];
  const structuralHtml = maskInertHtml(html);
  const openingTag = /<([a-z][a-z0-9:-]*)\b([^>]*)>/gi;
  for (let match = openingTag.exec(structuralHtml); match !== null; match = openingTag.exec(structuralHtml)) {
    if (match.index === undefined || !isHiddenAttributes(match[2] ?? "")) continue;
    const end = hiddenSubtreeEnd(html, match.index, match[1], match[0], structuralHtml);
    result.push({ start: match.index, end });
    openingTag.lastIndex = end;
  }
  return result;
}

function visibleElements(html: string, tag: string): HtmlElement[] {
  const hiddenRanges = hiddenSubtreeRanges(html);
  return elements(html, tag).filter((element) =>
    !isHiddenAttributes(element.attributes) &&
    !hiddenRanges.some((range) => range.start < element.start && element.end <= range.end),
  );
}

function firstTable(html: string, label: string): HtmlElement {
  const tables = elements(html, "table");
  if (tables.length === 0) throw new Error(`${label}: structured value table is missing`);
  return tables[0];
}

function fieldContainer(
  html: string,
  label: string | readonly string[],
  hrefPattern: RegExp,
): HtmlElement {
  const labels = typeof label === "string" ? [label] : [...label];
  const context = labels[0] ?? "structured field";
  const candidates = visibleElements(html, "td").filter((cell) => {
    const tableIndex = cell.innerHtml.search(/<table\b/i);
    if (tableIndex < 0) return false;
    const header = cell.innerHtml.slice(0, tableIndex);
    if (!hrefPattern.test(header)) return false;
    return labels.includes(visibleText(header));
  });
  if (candidates.length !== 1) {
    throw new Error(`${context}: expected exactly one visible structured field, found ${candidates.length}`);
  }
  return candidates[0];
}

function visibleRows(table: HtmlElement): HtmlElement[] {
  return visibleElements(table.innerHtml, "tr");
}

function visibleCells(row: HtmlElement): HtmlElement[] {
  return visibleElements(row.innerHtml, "td");
}

function exactInteger(text: string, label: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!/^\d+$/.test(text.trim())) throw new Error(`${label}: expected exact integer`);
  const value = Number(text.trim());
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label}: integer outside accepted domain`);
  }
  return value;
}

function explicitFact<T>(text: string, label: string, parser: (value: string) => T): BulbapediaStaticFact<T> {
  const normalized = text.trim();
  if (normalized === "—" || /^unavailable$/i.test(normalized)) return { status: "source-unavailable" };
  if (!normalized) throw new Error(`${label}: missing visible structured value`);
  return { status: "known", value: parser(normalized) };
}

function canonicalizeName(name: string, label: string): string {
  const key = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!key) throw new Error(`${label}: empty canonical source key`);
  return key;
}

function requireCanonicalSpeciesSource(source: BulbapediaSpeciesStaticFactsHtmlSource): string {
  let url: URL;
  try {
    url = new URL(source.url);
  } catch {
    throw new Error(`invalid Bulbapedia Species static-facts URL: ${source.url}`);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "bulbapedia.bulbagarden.net" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`unexpected Bulbapedia Species static-facts URL: ${source.url}`);
  }
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    throw new Error(`invalid Bulbapedia Species static-facts URL encoding: ${source.url}`);
  }
  const pathMatch = /^\/wiki\/([^/]+)_\(Pokémon\)$/u.exec(decodedPath);
  if (!pathMatch) throw new Error(`unexpected Bulbapedia Species static-facts URL: ${source.url}`);
  if (!source.sourceRecordId.trim()) throw new Error("Bulbapedia Species static-facts sourceRecordId is required");
  const sourceName = pathMatch[1].replace(/_/g, " ").normalize("NFC");
  const headings = [...source.html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((match) => visibleText(match[1]))
    .filter(Boolean);
  if (headings.length !== 1 || headings[0] !== `${sourceName} (Pokémon)`) {
    throw new Error("Bulbapedia Species static facts: URL and unique page h1 disagree");
  }
  return sourceName;
}

function requireExactUrl(
  source: BulbapediaSpeciesStaticFactsHtmlSource,
  expectedUrl: string,
  label: string,
): void {
  let actual: URL;
  let expected: URL;
  try {
    actual = new URL(source.url);
    expected = new URL(expectedUrl);
  } catch {
    throw new Error(`${label}: invalid source URL`);
  }
  if (
    actual.href !== expected.href ||
    actual.username !== "" ||
    actual.password !== "" ||
    actual.port !== ""
  ) {
    throw new Error(`${label}: unexpected canonical URL ${source.url}`);
  }
  if (!source.sourceRecordId.trim()) throw new Error(`${label}: sourceRecordId is required`);
}

function headingSection(html: string, id: string, label: string): string {
  const marker = new RegExp(
    `<h3\\b[^>]*>[\\s\\S]*?<span\\b[^>]*id=["']${id}["'][^>]*>[\\s\\S]*?<\\/span>[\\s\\S]*?<\\/h3>`,
    "i",
  ).exec(html);
  if (!marker || marker.index === undefined) throw new Error(`${label}: required heading ${id} is missing`);
  const start = marker.index + marker[0].length;
  const next = /<h3\b/i.exec(html.slice(start));
  return next?.index === undefined ? html.slice(start) : html.slice(start, start + next.index);
}

function parseDiscoveryGenerationSection(
  html: string,
  headingId: "Generation_I" | "Generation_II",
): ExtractedBulbapediaCoreSpeciesDiscovery[] {
  const section = headingSection(html, headingId, "Bulbapedia Kanto/Johto species discovery");
  const tables = elements(section, "table").filter((table) => {
    if (/<table\b/i.test(table.innerHtml)) return false;
    const rows = visibleRows(table);
    if (rows.length === 0) return false;
    const header = visibleText(rows[0].innerHtml);
    return header.includes("Ndex") && header.includes("MS") && header.includes("Pokémon") && header.includes("Type");
  });
  if (tables.length !== 1) {
    throw new Error(
      `Bulbapedia Kanto/Johto species discovery ${headingId}: expected exactly one structured species table, found ${tables.length}`,
    );
  }

  const result: ExtractedBulbapediaCoreSpeciesDiscovery[] = [];
  let activeBase: { sourceName: string; remainingFormRows: number; formLabels: Set<string> } | null = null;
  for (const row of visibleRows(tables[0]).slice(1)) {
    const cells = visibleCells(row);
    if (cells.length === 0) continue;
    const dexText = visibleText(cells[0].innerHtml);
    const dexMatch = /^#(\d{4})$/.exec(dexText);
    if (!dexMatch) {
      if (activeBase === null || activeBase.remainingFormRows <= 0) {
        throw new Error(
          `Bulbapedia Kanto/Johto species discovery: row without National Dex is not attached to a base Species`,
        );
      }
      if (cells.length !== 3 && cells.length !== 4) {
        throw new Error(`Bulbapedia Kanto/Johto species discovery ${headingId}: malformed alternate-form row`);
      }
      const identityCell = cells[1];
      const formLabels = allSmallLabels(identityCell.innerHtml);
      if (formLabels.length !== 1 || !formLabels[0]) {
        throw new Error(`Bulbapedia Kanto/Johto species discovery: alternate row requires one explicit form label`);
      }
      if (activeBase.formLabels.has(formLabels[0])) {
        throw new Error(`Bulbapedia Kanto/Johto species discovery: duplicate form label ${formLabels[0]}`);
      }
      const formLinks = [...withoutHiddenSubtrees(identityCell.innerHtml).matchAll(
        /<a\b[^>]*href=["']\/wiki\/([^"'#?]+)_\(Pok%C3%A9mon\)["'][^>]*>([\s\S]*?)<\/a>/gi,
      )];
      let formPathName = "";
      if (formLinks.length === 1) {
        try {
          formPathName = decodeURIComponent(decodeHtml(formLinks[0][1])).replace(/_/g, " ").normalize("NFC");
        } catch {
          throw new Error(`Bulbapedia Kanto/Johto species discovery: alternate row has invalid Species link`);
        }
      }
      if (
        formLinks.length !== 1 ||
        visibleText(formLinks[0][2]).normalize("NFC") !== activeBase.sourceName ||
        formPathName !== activeBase.sourceName
      ) {
        throw new Error(`Bulbapedia Kanto/Johto species discovery: alternate row Species identity is ambiguous`);
      }
      activeBase.formLabels.add(formLabels[0]);
      activeBase.remainingFormRows -= 1;
      continue;
    }
    if (activeBase?.remainingFormRows) {
      throw new Error(`Bulbapedia Kanto/Johto species discovery: National Dex rowspan ended early`);
    }
    if (cells.length !== 4 && cells.length !== 5) {
      throw new Error(`Bulbapedia Kanto/Johto species discovery ${headingId}: expected 4 or 5 base-row data cells`);
    }
    const dex = exactInteger(dexMatch[1], "Bulbapedia Kanto/Johto National Dex", 1);
    const formLabels = allSmallLabels(cells[2].innerHtml);
    if (formLabels.length !== 1) {
      throw new Error(`Bulbapedia Kanto/Johto #${dex}: expected exactly one structured form marker`);
    }
    // The National Dex-bearing row is the single Species identity row. Most
    // base rows use an empty marker, while some Species (notably Unown) use a
    // structured marker such as "One form" even though the row still carries
    // the Species' sole National Dex identity.
    const links = [...withoutHiddenSubtrees(cells[2].innerHtml).matchAll(
      /<a\b[^>]*href=["']\/wiki\/([^"'#?]+)_\(Pok%C3%A9mon\)["'][^>]*>([\s\S]*?)<\/a>/gi,
    )];
    if (links.length !== 1) {
      throw new Error(`Bulbapedia Kanto/Johto #${dex}: expected exactly one base Species identity link`);
    }
    const sourceName = visibleText(links[0][2]).normalize("NFC");
    let decodedPathName: string;
    try {
      decodedPathName = decodeURIComponent(decodeHtml(links[0][1])).replace(/_/g, " ").normalize("NFC");
    } catch {
      throw new Error(`Bulbapedia Kanto/Johto #${dex}: invalid Species page link`);
    }
    if (!sourceName || sourceName !== decodedPathName) {
      throw new Error(`Bulbapedia Kanto/Johto #${dex}: Species link/display identity disagreement`);
    }
    // Preserve Bulbapedia's canonical wiki-title escaping rather than asset/image URLs.
    const sourcePageUrl = `https://bulbapedia.bulbagarden.net/wiki/${links[0][1]}_(Pok%C3%A9mon)`;
    result.push({ nationalDexNumber: dex, sourceName, sourcePageUrl });
    const rowspanMatch = /\browspan\s*=\s*(?:["'](\d+)["']|(\d+))/i.exec(cells[0].attributes);
    const rowspan = rowspanMatch
      ? exactInteger(rowspanMatch[1] ?? rowspanMatch[2], `Bulbapedia Kanto/Johto #${dex} rowspan`, 1)
      : 1;
    activeBase = { sourceName, remainingFormRows: rowspan - 1, formLabels: new Set<string>() };
  }
  if (activeBase?.remainingFormRows) {
    throw new Error(`Bulbapedia Kanto/Johto species discovery: unterminated National Dex rowspan`);
  }
  return result;
}

export function parseBulbapediaKantoJohtoSpeciesDiscovery(
  source: BulbapediaSpeciesStaticFactsHtmlSource,
): ExtractedBulbapediaCoreSpeciesDiscovery[] {
  requireExactUrl(
    source,
    BULBAPEDIA_KANTO_JOHTO_SPECIES_DISCOVERY_URL,
    "Bulbapedia Kanto/Johto species discovery",
  );
  const records = [
    ...parseDiscoveryGenerationSection(source.html, "Generation_I"),
    ...parseDiscoveryGenerationSection(source.html, "Generation_II"),
  ];
  const byDex = new Map<number, ExtractedBulbapediaCoreSpeciesDiscovery>();
  const names = new Set<string>();
  for (const record of records) {
    if (record.nationalDexNumber < 1 || record.nationalDexNumber > 251) {
      throw new Error(`Bulbapedia Kanto/Johto species discovery: out-of-scope Dex ${record.nationalDexNumber}`);
    }
    if (byDex.has(record.nationalDexNumber)) {
      throw new Error(`Bulbapedia Kanto/Johto species discovery: duplicate base Dex ${record.nationalDexNumber}`);
    }
    const nameKey = record.sourceName.normalize("NFC");
    if (names.has(nameKey)) {
      throw new Error(`Bulbapedia Kanto/Johto species discovery: duplicate base Species ${record.sourceName}`);
    }
    byDex.set(record.nationalDexNumber, record);
    names.add(nameKey);
  }
  for (let dex = 1; dex <= 251; dex += 1) {
    if (!byDex.has(dex)) {
      throw new Error(`Bulbapedia Kanto/Johto species discovery: missing base National Dex ${dex}`);
    }
  }
  if (records.length !== 251) {
    throw new Error(`Bulbapedia Kanto/Johto species discovery: expected exactly 251 base Species, found ${records.length}`);
  }
  return [...records].sort((left, right) => left.nationalDexNumber - right.nationalDexNumber);
}

function smallLabels(html: string): string[] {
  const visibleHtml = withoutHiddenSubtrees(html);
  return [...visibleHtml.matchAll(/<small\b([^>]*)>([\s\S]*?)<\/small>/gi)]
    .filter((match) => !isHiddenAttributes(match[1]))
    .map((match) => visibleText(match[2]).normalize("NFC"))
    .filter(Boolean);
}

function allSmallLabels(html: string): string[] {
  const visibleHtml = withoutHiddenSubtrees(html);
  return [...visibleHtml.matchAll(/<small\b([^>]*)>([\s\S]*?)<\/small>/gi)]
    .filter((match) => !isHiddenAttributes(match[1]))
    .map((match) => visibleText(match[2]).normalize("NFC"));
}

function formLabelFromDisplay(label: string, sourceName: string): string | null {
  const cleaned = label
    .replace(/(?:^|\s+)Hidden Ability$/i, "")
    .trim()
    .replace(/^\((.+)\)$/u, "$1")
    .trim()
    .normalize("NFC");
  return !cleaned || cleaned === sourceName ? null : cleaned;
}

function generationScopedAbilityLabel(
  label: string,
  sourceName: string,
): "current-base" | "historical" | null {
  const cleaned = label
    .replace(/(?:^|\s+)Hidden Ability$/i, "")
    .trim()
    .normalize("NFC");
  const escapedSourceName = sourceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (
    new RegExp(`^Gen [IVX]+\\+(?: ${escapedSourceName})?$`, "u").test(cleaned) ||
    new RegExp(`^${escapedSourceName} Gen [IVX]+\\+$`, "u").test(cleaned)
  ) {
    return "current-base";
  }
  if (
    new RegExp(`^Gen [IVX]+(?:-[IVX]+)? \\*(?: ${escapedSourceName})?$`, "u").test(cleaned) ||
    new RegExp(`^${escapedSourceName} Gen [IVX]+-[IVX]+$`, "u").test(cleaned)
  ) {
    return "historical";
  }
  return null;
}

function isDeferredBattleTransformationLabel(label: string): boolean {
  const normalized = label
    .replace(/(?:^|\s+)Hidden Ability$/i, "")
    .trim()
    .replace(/^\((.+)\)$/u, "$1")
    .trim()
    .normalize("NFC");
  return /^(?:Gigantamax|Eternamax|Mega(?: Evolution)?(?: [XY])?)$/u.test(normalized);
}

function explicitFormLabelsFromDisplay(label: string, sourceName: string): Array<string | null> {
  return explicitFormDisplayParts(label).map((part) => formLabelFromDisplay(part, sourceName));
}

function explicitFormDisplayParts(label: string): string[] {
  const cleaned = label
    .replace(/(?:^|\s+)Hidden Ability$/i, "")
    .trim()
    .replace(/^\((.+)\)$/u, "$1")
    .trim();
  return cleaned.split(/\s+and\s+/u);
}

function visibleFormCandidates(field: HtmlElement, sourceName: string): string[] {
  const result: string[] = [];
  const table = firstTable(field.innerHtml, "form discovery");
  for (const row of visibleRows(table)) {
    for (const cell of visibleCells(row)) {
      for (const label of smallLabels(cell.innerHtml)) {
        if (/^(?:Gen\.|[IVX]+\+?$|cycles$)/i.test(label)) continue;
        const generationScope = generationScopedAbilityLabel(label, sourceName);
        if (generationScope !== null) continue;
        if (/\bGen(?:eration)?\b/i.test(label)) {
          throw new Error(`form discovery: unsupported generation-scoped label ${JSON.stringify(label)}`);
        }
        if (isDeferredBattleTransformationLabel(label)) continue;
        for (const normalized of explicitFormLabelsFromDisplay(label, sourceName)) {
          if (normalized !== null && !normalized.includes("{{{")) result.push(normalized);
        }
      }
    }
  }
  return result;
}

function discoverFormLabels(sourceName: string, html: string): BulbapediaFormLabel[] {
  const abilityField = fieldContainer(html, ["Abilities", "Ability"], /href=["']\/wiki\/Ability["']/i);
  const heightField = fieldContainer(html, "Height", /height/i);
  const weightField = fieldContainer(html, "Weight", /href=["']\/wiki\/Weight["']/i);
  const evField = fieldContainer(html, "EV yield", /effort_value_yield/i);
  const candidates = [
    ...visibleFormCandidates(abilityField, sourceName),
    ...visibleFormCandidates(heightField, sourceName),
    ...visibleFormCandidates(weightField, sourceName),
  ];
  const evTable = firstTable(evField.innerHtml, "EV yield");
  for (const row of visibleRows(evTable)) {
    const cells = visibleCells(row);
    if (cells.length !== 1) continue;
    const text = visibleText(stripHistoricalEvYieldAnnotations(cells[0].innerHtml)).normalize("NFC");
    if (!text || /^Total:\s*\d+$/i.test(text) || /^(?:\d+\s*(?:HP|Atk|Def|Sp\.Atk|Sp\.Def|Speed)\b)/i.test(text)) continue;
    if (text === sourceName) continue;
    const generationScope = generationScopedAbilityLabel(text, sourceName);
    if (generationScope !== null) continue;
    if (/\bGen(?:eration)?\b/i.test(text)) {
      throw new Error(`form discovery: unsupported generation-scoped EV label ${JSON.stringify(text)}`);
    }
    if (isDeferredBattleTransformationLabel(text)) continue;
    if (!/^\{\{\{/.test(text)) candidates.push(text);
  }
  const unique = [...new Set(candidates)];
  const exact = unique.filter(
    (label) => !unique.some((other) => other !== label && other.startsWith(`${label} (`)),
  );
  return [null, ...exact.sort()];
}

function scopeForLabel(
  label: string | null,
  sourceName: string,
  forms: BulbapediaFormLabel[],
  context: string,
): BulbapediaFormLabel[] {
  if (label === null || label === "") return [...forms];
  const normalized = formLabelFromDisplay(label, sourceName);
  if (normalized === null) return [null];
  if (forms.includes(normalized)) return [normalized];
  const grouped = forms.filter(
    (form): form is string => typeof form === "string" && form.startsWith(`${normalized} (`),
  );
  if (grouped.length > 0) return grouped;
  throw new Error(`${context}: visible form label ${JSON.stringify(label)} has no exact persistent-form association`);
}

function shared<T>(forms: BulbapediaFormLabel[], fact: BulbapediaStaticFact<T>): BulbapediaScopedFact<T>[] {
  return [{ formLabels: [...forms], fact }];
}

function singleFieldText(field: HtmlElement, label: string): string {
  const table = firstTable(field.innerHtml, label);
  const cells = visibleRows(table).flatMap(visibleCells);
  if (cells.length !== 1) throw new Error(`${label}: expected exactly one visible structured value cell`);
  return visibleText(cells[0].innerHtml);
}

function parseCatchRate(html: string, forms: BulbapediaFormLabel[]): BulbapediaScopedFact<number>[] {
  const field = fieldContainer(html, "Catch rate", /href=["']\/wiki\/Catch_rate["']/i);
  const text = singleFieldText(field, "Catch rate");
  const fact = explicitFact(text, "Catch rate", (value) => {
    const match = /^(\d+)\b/.exec(value);
    if (!match) throw new Error("Catch rate: expected leading integer");
    return exactInteger(match[1], "Catch rate", 0);
  });
  return shared(forms, fact);
}

function parseGrowthRate(html: string, forms: BulbapediaFormLabel[]): BulbapediaScopedFact<GrowthRate>[] {
  const field = fieldContainer(html, "Leveling rate", /href=["']\/wiki\/Experience["']/i);
  const fact = explicitFact(singleFieldText(field, "Leveling rate"), "Leveling rate", (value) => {
    const normalized = value.toLowerCase().replace(/\s+/g, "-") as GrowthRate;
    const allowed: GrowthRate[] = ["slow", "medium-slow", "medium-fast", "fast", "erratic", "fluctuating"];
    if (!allowed.includes(normalized)) throw new Error(`Leveling rate: unsupported value ${JSON.stringify(value)}`);
    return normalized;
  });
  return shared(forms, fact);
}

function parseLatestBaseExperience(html: string, forms: BulbapediaFormLabel[]): BulbapediaScopedFact<number>[] {
  const field = fieldContainer(html, "Base experience yield", /href=["']\/wiki\/Experience["']/i);
  const table = firstTable(field.innerHtml, "Base experience yield");
  const cells = visibleRows(table).flatMap(visibleCells);
  if (cells.length === 0) throw new Error("Base experience yield: no visible structured values");
  const parsed = cells.map((cell, index) => {
    const labels = smallLabels(cell.innerHtml);
    const historicalNote = labels.find((label) => /^\(\d+ in V-VI\)$/.test(label));
    const versionLabels = labels.filter((label) => label !== historicalNote);
    if (historicalNote && labels.filter((label) => label === historicalNote).length !== 1) {
      throw new Error("Base experience yield: duplicate historical annotation");
    }
    if (cells.length > 1 && versionLabels.length !== 1) {
      throw new Error("Base experience yield: multiple visible values require one explicit version label each");
    }
    if (versionLabels.length > 1) throw new Error("Base experience yield: ambiguous version labels");
    let fullText = visibleText(cell.innerHtml);
    const versionLabel = versionLabels[0] ?? null;
    if (historicalNote) {
      if (versionLabel !== "V+") {
        throw new Error("Base experience yield: historical annotation is only accepted before V+");
      }
      const expectedSuffix = `${historicalNote} ${versionLabel}`;
      if (!fullText.endsWith(expectedSuffix)) {
        throw new Error("Base experience yield: historical annotation structure is ambiguous");
      }
      fullText = fullText.slice(0, -expectedSuffix.length).trim() + ` ${versionLabel}`;
    }
    const valueText = versionLabel === null
      ? fullText
      : fullText.endsWith(versionLabel)
        ? fullText.slice(0, -versionLabel.length).trim()
        : (() => { throw new Error("Base experience yield: value/version label structure is ambiguous"); })();
    const fact = explicitFact(valueText, "Base experience yield", (value) =>
      exactInteger(value, "Base experience yield", 0),
    );
    if (versionLabel === null) return { fact, currentRank: 0, index };
    const romanTokens = [...versionLabel.matchAll(/[IVX]+/gi)].map((match) => match[0].toUpperCase());
    const romanValues = romanTokens.map((roman) => {
      const values: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
      const generation = values[roman];
      if (generation === undefined) throw new Error(`Base experience yield: unsupported version label ${JSON.stringify(versionLabel)}`);
      return generation;
    });
    if (romanValues.length === 0) {
      throw new Error(`Base experience yield: unsupported version label ${JSON.stringify(versionLabel)}`);
    }
    const maxGeneration = Math.max(...romanValues);
    const currentRank = /\+\s*$/.test(versionLabel) ? 100 + maxGeneration : maxGeneration;
    return { fact, currentRank, index };
  });
  const bestRank = Math.max(...parsed.map((entry) => entry.currentRank));
  const latest = parsed.filter((entry) => entry.currentRank === bestRank);
  if (latest.length !== 1) throw new Error("Base experience yield: latest visible value is ambiguous");
  if (cells.length > 1 && bestRank === 0) {
    throw new Error("Base experience yield: multiple unversioned visible values are ambiguous");
  }
  const fact = latest[0].fact;
  return shared(forms, fact);
}

function parseBaseFriendship(html: string, forms: BulbapediaFormLabel[]): BulbapediaScopedFact<number>[] {
  const field = fieldContainer(html, "Base friendship", /base_friendship/i);
  return shared(
    forms,
    explicitFact(singleFieldText(field, "Base friendship"), "Base friendship", (value) =>
      exactInteger(value, "Base friendship", 0, 255),
    ),
  );
}

function breedingSubfield(html: string, label: "Egg Group" | "Hatch time", href: RegExp): HtmlElement {
  const breeding = fieldContainer(html, "Breeding", /Pok%C3%A9mon_breeding|Pokémon_breeding/i);
  return fieldContainer(
    breeding.innerHtml,
    label === "Egg Group" ? ["Egg Group", "Egg Groups"] : label,
    href,
  );
}

function parseEggGroups(html: string, forms: BulbapediaFormLabel[]): BulbapediaScopedFact<EggGroupKey[]>[] {
  const field = breedingSubfield(html, "Egg Group", /href=["']\/wiki\/Egg_Group["']/i);
  const table = firstTable(field.innerHtml, "Egg Group");
  let visible = visibleRows(table)
    .flatMap(visibleCells)
    .map((cell) => withoutHiddenSubtrees(cell.innerHtml))
    .join(" ");
  visible = visible.replace(
    /<a\b[^>]*href=["']\/wiki\/No_Eggs_Discovered_\(Egg_Group\)["'][^>]*>[\s\S]*?<\/a>\s*<sup\b[^>]*>\s*<a\b[^>]*href=["']\/wiki\/Cosplay_Pikachu["'][^>]*>[\s\S]*?<\/a>\s*\/\s*<a\b[^>]*href=["']\/wiki\/Pikachu_in_a_cap["'][^>]*>[\s\S]*?<\/a>\s*<\/sup>/gi,
    " ",
  );
  if (visibleText(visible) === "—" || /^unavailable$/i.test(visibleText(visible))) {
    return shared(forms, { status: "source-unavailable" });
  }
  const groups = [...visible.matchAll(/<a\b[^>]*href=["']\/wiki\/([^"'#?]+)_\(Egg_Group\)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => {
    let hrefName: string;
    try {
      hrefName = decodeURIComponent(decodeHtml(match[1])).replace(/_/g, " ");
    } catch {
      throw new Error("Egg Group: invalid structured identity href");
    }
    const canonicalKey = canonicalizeName(hrefName, "Egg Group");
    const key = (canonicalKey === "no-eggs-discovered" ? "undiscovered" : canonicalKey) as EggGroupKey;
    if (!(EGG_GROUP_KEYS as readonly string[]).includes(key)) {
      throw new Error(`Egg Group: unsupported structured identity ${JSON.stringify(hrefName)}`);
    }
    return key;
  });
  if (groups.length < 1 || groups.length > 2 || new Set(groups).size !== groups.length) {
    throw new Error("Egg Group: expected one or two unique visible structured links");
  }
  return shared(forms, { status: "known", value: groups });
}

function parseEggCycles(html: string, forms: BulbapediaFormLabel[]): BulbapediaScopedFact<number>[] {
  const field = breedingSubfield(html, "Hatch time", /href=["']\/wiki\/Egg_cycle["']/i);
  const text = singleFieldText(field, "Hatch time");
  const fact = explicitFact(text, "Hatch time", (value) => {
    const match = /^(\d+)\s*cycles(?:\s+Egg not obtainable)?$/i.exec(value);
    if (!match) throw new Error("Hatch time: expected exact cycles value");
    return exactInteger(match[1], "Hatch time", 1);
  });
  return shared(forms, fact);
}

function parseGender(html: string, forms: BulbapediaFormLabel[]): BulbapediaScopedFact<GenderRatio>[] {
  const field = fieldContainer(html, "Gender ratio", /gender_ratio/i);
  const table = firstTable(field.innerHtml, "Gender ratio");
  const text = visibleRows(table).flatMap(visibleCells).map((cell) => visibleText(cell.innerHtml)).join(" ").trim();
  const fact = explicitFact(text, "Gender ratio", (value): GenderRatio => {
    if (/^(?:Genderless|Gender unknown)$/i.test(value)) return { kind: "genderless" };
    const male = /([0-9]+(?:\.[0-9]+)?)%\s*male/i.exec(value);
    const female = /([0-9]+(?:\.[0-9]+)?)%\s*female/i.exec(value);
    if (!male && !female) throw new Error("Gender ratio: expected structured male/female percentage or Genderless");
    const bp = (raw: string): number => {
      const [whole, fraction = ""] = raw.split(".");
      const result = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
      if (!Number.isSafeInteger(result) || result < 0 || result > 10_000) throw new Error("Gender ratio: percentage outside domain");
      return result;
    };
    const maleBasisPoints = male ? bp(male[1]) : 10_000 - bp(female![1]);
    const femaleBasisPoints = female ? bp(female[1]) : 10_000 - maleBasisPoints;
    if (maleBasisPoints + femaleBasisPoints !== 10_000) throw new Error("Gender ratio: percentages do not sum to 100%");
    return { kind: "ratio", maleBasisPoints, femaleBasisPoints };
  });
  return shared(forms, fact);
}

function metricFacts(
  html: string,
  forms: BulbapediaFormLabel[],
  sourceName: string,
  label: "Height" | "Weight",
  href: RegExp,
  unit: "m" | "kg",
  scale: number,
): {
  facts: BulbapediaScopedFact<number>[];
  complementFormLabels: string[];
  hiddenPlaceholderFormLabels: string[];
} {
  const field = fieldContainer(html, label, href);
  const table = firstTable(field.innerHtml, label);
  const rows = elements(table.innerHtml, "tr");
  const result: BulbapediaScopedFact<number>[] = [];
  const complementFormLabels: string[] = [];
  const hiddenPlaceholderFormLabels: string[] = [];
  let pending: BulbapediaStaticFact<number> | null = null;
  const hiddenZeroMetric = (row: HtmlElement | undefined): boolean => {
    if (!row || !isHiddenAttributes(row.attributes)) return false;
    const text = visibleText(row.innerHtml);
    return new RegExp(`(?:^|\\s)0(?:\\.0+)?\\s*${unit}\\s*$`, "i").test(text);
  };
  for (const [rowIndex, row] of rows.entries()) {
    if (isHiddenAttributes(row.attributes)) {
      const hiddenCells = elements(row.innerHtml, "td");
      const hiddenLabels = hiddenCells.flatMap((cell) => allSmallLabels(cell.innerHtml)).filter(Boolean);
      if (hiddenLabels.length === 1 && hiddenZeroMetric(rows[rowIndex - 1])) {
        const candidate = hiddenLabels[0].normalize("NFC");
        if (
          candidate !== sourceName.normalize("NFC") &&
          candidate !== "One form" &&
          !candidate.startsWith("{{{") &&
          !isDeferredBattleTransformationLabel(candidate)
        ) {
          hiddenPlaceholderFormLabels.push(candidate);
          if (forms.includes(candidate)) complementFormLabels.push(candidate);
        }
      }
      if (pending === null) continue;
      if (hiddenLabels.length === 1 && hiddenLabels[0].normalize("NFC") === sourceName.normalize("NFC")) {
        result.push({ formLabels: [null], fact: pending });
        pending = null;
        continue;
      }
      if (
        hiddenLabels.length === 1 &&
        hiddenLabels[0] === "One form" &&
        forms.length === 1 &&
        forms[0] === null
      ) {
        result.push({ formLabels: [null], fact: pending });
        pending = null;
        continue;
      }
      if (hiddenLabels.length === 1) {
        if (hiddenLabels[0].startsWith("{{{")) {
          continue;
        }
      }
      if (hiddenLabels.length > 0) {
        throw new Error(
          `${label}: hidden form-label association is not an accepted inactive scope; labels=${JSON.stringify(hiddenLabels)} forms=${JSON.stringify(forms)}`,
        );
      }
      continue;
    }
    const cells = visibleCells(row);
    const text = cells.map((cell) => visibleText(cell.innerHtml)).join(" ").trim();
    const metric = new RegExp(`^(?:[\\s\\S]*?\\s)?(—|Unavailable|\\d+(?:\\.\\d+)?)\\s*${unit.replace("kg", "kg")}\\s*$`, "i").exec(text);
    if (metric) {
      if (pending !== null) throw new Error(`${label}: consecutive visible values lack an explicit form label`);
      pending = explicitFact(metric[1], label, (value) => {
        const [whole, fraction = ""] = value.split(".");
        const decimals = Math.log10(scale);
        if (fraction.length > decimals) throw new Error(`${label}: source precision exceeds target unit`);
        return Number(whole) * scale + Number((fraction + "0".repeat(decimals)).slice(0, decimals));
      });
      continue;
    }
    const labels = cells.flatMap((cell) => smallLabels(cell.innerHtml));
    if (labels.length > 0) {
      if (labels.length !== 1) throw new Error(`${label}: ambiguous visible form-label association`);
      if (isDeferredBattleTransformationLabel(labels[0])) {
        pending = null;
        continue;
      }
      if (pending === null) throw new Error(`${label}: ambiguous visible form-label association`);
      result.push({ formLabels: scopeForLabel(labels[0], sourceName, forms, label), fact: pending });
      pending = null;
    }
  }
  if (pending !== null) {
    if (result.length !== 0 || forms.length !== 1 || forms[0] !== null) {
      throw new Error(`${label}: trailing unlabelled value is ambiguous`);
    }
    result.push({ formLabels: [null], fact: pending });
  }
  if (result.length === 0) throw new Error(`${label}: no visible structured metric value`);
  const explicitForms = new Set(
    result.flatMap((entry) => entry.formLabels).filter((form): form is string => form !== null),
  );
  return {
    facts: result,
    complementFormLabels: [...new Set(complementFormLabels)]
      .filter((form) => !explicitForms.has(form))
      .sort((left, right) => left.localeCompare(right, "en")),
    hiddenPlaceholderFormLabels: [...new Set(hiddenPlaceholderFormLabels)]
      .filter((form) => !explicitForms.has(form))
      .sort((left, right) => left.localeCompare(right, "en")),
  };
}

function parseEvYield(html: string, forms: BulbapediaFormLabel[], sourceName: string): BulbapediaScopedFact<StatBlock<number>>[] {
  const field = fieldContainer(html, "EV yield", /effort_value_yield/i);
  const table = firstTable(field.innerHtml, "EV yield");
  const rows = visibleRows(table);
  const result: BulbapediaScopedFact<StatBlock<number>>[] = [];
  let pendingLabel: string | null | undefined;
  let unlabelledCount = 0;
  for (const row of rows) {
    const cells = visibleCells(row);
    if (cells.length === 0) continue;
    const sanitizedCells = cells.map((cell) => stripHistoricalEvYieldAnnotations(cell.innerHtml));
    const text = sanitizedCells.map((cellHtml) => visibleText(cellHtml)).join(" ").trim();
    if (/^Total:\s*\d+$/i.test(text)) continue;
    if (cells.length === 1 && !/<small\b/i.test(cells[0].innerHtml)) {
      if (/^(?:—|Unavailable)$/i.test(text)) {
        result.push({ formLabels: pendingLabel === undefined ? [...forms] : scopeForLabel(pendingLabel, sourceName, forms, "EV yield"), fact: { status: "source-unavailable" } });
        pendingLabel = undefined;
        continue;
      }
      pendingLabel = text === sourceName ? sourceName : text;
      continue;
    }
    if (cells.length === 6) {
      const stats: Partial<StatBlock<number>> = {};
      const labels: Record<string, keyof StatBlock<number>> = { HP: "hp", Atk: "atk", Def: "def", "Sp.Atk": "spa", "Sp.Def": "spd", Speed: "spe" };
      for (const cellHtml of sanitizedCells) {
        const cellText = visibleText(cellHtml);
        const match = /^(\d+)\s*(HP|Atk|Def|Sp\.Atk|Sp\.Def|Speed)$/.exec(cellText);
        if (!match) throw new Error(`EV yield: malformed stat cell ${JSON.stringify(cellText)}`);
        const key = labels[match[2]];
        if (stats[key] !== undefined) throw new Error(`EV yield: duplicate ${match[2]} stat`);
        stats[key] = exactInteger(match[1], `EV yield ${match[2]}`, 0);
      }
      if (Object.keys(stats).length !== 6) throw new Error("EV yield: incomplete six-stat row");
      const fact = { status: "known", value: stats as StatBlock<number> } as const;
      if (pendingLabel === undefined) {
        unlabelledCount += 1;
        result.push({ formLabels: [...forms], fact });
      } else {
        result.push({ formLabels: scopeForLabel(pendingLabel, sourceName, forms, "EV yield"), fact });
        pendingLabel = undefined;
      }
    }
  }
  if (pendingLabel !== undefined) throw new Error("EV yield: form label is not followed by a visible value row");
  if (unlabelledCount > 1 || (unlabelledCount === 1 && result.length > 1)) {
    throw new Error("EV yield: unlabelled value is ambiguous beside form-specific values");
  }
  if (result.length === 0) throw new Error("EV yield: no visible structured values");
  return result;
}

function parseAbilities(html: string, forms: BulbapediaFormLabel[], sourceName: string): BulbapediaScopedAbilityEvidence[] {
  const field = fieldContainer(html, ["Abilities", "Ability"], /href=["']\/wiki\/Ability["']/i);
  const table = firstTable(field.innerHtml, "Abilities");
  const result: BulbapediaScopedAbilityEvidence[] = [];
  const occupied = new Set<string>();

  const appendEvidence = (valueHtml: string, rawLabel: string | null): void => {
    const visibleValueHtml = withoutHiddenSubtrees(valueHtml);
    const links = [...visibleValueHtml.matchAll(/<a\b[^>]*href=["']\/wiki\/([^"'#?]+)_\(Ability\)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    if (links.length === 0) return;
    const hidden = rawLabel !== null && /(?:^|\s+)Hidden Ability$/i.test(rawLabel);
    if (hidden && links.length !== 1) throw new Error("Abilities: Hidden Ability value must contain exactly one Ability link");
    if (!hidden && links.length > 2) throw new Error("Abilities: normal Ability value contains more than two links");

    const generationScope = rawLabel === null ? null : generationScopedAbilityLabel(rawLabel, sourceName);
    if (generationScope === "historical") return;
    if (rawLabel !== null && generationScope === null && /\bGen(?:eration)?\b/i.test(rawLabel)) {
      throw new Error(`Abilities: unsupported generation-scoped label ${JSON.stringify(rawLabel)}`);
    }
    const scope = generationScope === "current-base"
      ? [null]
      : rawLabel === null
        ? [...forms]
        : [...new Set(
            explicitFormDisplayParts(rawLabel).flatMap((label) =>
              scopeForLabel(label, sourceName, forms, "Abilities"),
            ),
          )];
    if (scope.length === 0) throw new Error("Abilities: explicit form label resolved to no persistent forms");

    links.forEach((link, index) => {
      const sourceNameValue = visibleText(link[2]).normalize("NFC");
      let hrefName: string;
      try {
        hrefName = decodeURIComponent(decodeHtml(link[1])).replace(/_/g, " ").normalize("NFC");
      } catch {
        throw new Error("Abilities: invalid structured Ability href");
      }
      if (canonicalizeName(sourceNameValue, "Ability display") !== canonicalizeName(hrefName, "Ability href")) {
        throw new Error("Abilities: structured href/display identity disagreement");
      }
      const slot: AbilitySlot = hidden ? "hidden" : index === 0 ? "normal-1" : "normal-2";
      for (const form of scope) {
        const key = `${form ?? "<base>"}\u0000${slot}`;
        if (occupied.has(key)) throw new Error(`Abilities: duplicate ${slot} evidence for ${form ?? sourceName}`);
        occupied.add(key);
      }
      result.push({ formLabels: [...scope], abilitySourceKey: canonicalizeName(sourceNameValue, "Ability"), sourceName: sourceNameValue, sourceAbilitySlot: slot });
    });
  };

  for (const row of visibleRows(table)) {
    for (const cell of visibleCells(row)) {
      const visibleCellHtml = withoutHiddenSubtrees(cell.innerHtml);
      const smallMatches = [...visibleCellHtml.matchAll(/<small\b([^>]*)>([\s\S]*?)<\/small>/gi)]
        .filter((match) => !isHiddenAttributes(match[1]));
      if (smallMatches.length === 0) {
        appendEvidence(visibleCellHtml, null);
        continue;
      }
      let segmentStart = 0;
      for (const small of smallMatches) {
        if (small.index === undefined) continue;
        appendEvidence(
          visibleCellHtml.slice(segmentStart, small.index),
          visibleText(small[2]).normalize("NFC"),
        );
        segmentStart = small.index + small[0].length;
      }
      if (/<a\b[^>]*href=["']\/wiki\/[^"'#?]+_\(Ability\)["']/i.test(visibleCellHtml.slice(segmentStart))) {
        throw new Error("Abilities: trailing Ability value has no explicit form label");
      }
    }
  }
  if (result.length === 0) throw new Error("Abilities: no visible structured Ability evidence");
  return result;
}

export function parseBulbapediaSpeciesStaticFacts(
  source: BulbapediaSpeciesStaticFactsHtmlSource,
): ExtractedBulbapediaSpeciesStaticFacts {
  const sourceName = requireCanonicalSpeciesSource(source);
  const formLabels = discoverFormLabels(sourceName, source.html);
  const height = metricFacts(source.html, formLabels, sourceName, "Height", /height/i, "m", 1000);
  const weight = metricFacts(source.html, formLabels, sourceName, "Weight", /href=["']\/wiki\/Weight["']/i, "kg", 1000);
  return {
    sourceName,
    formLabels,
    abilities: parseAbilities(source.html, formLabels, sourceName),
    catchRate: parseCatchRate(source.html, formLabels),
    growthRate: parseGrowthRate(source.html, formLabels),
    baseExperience: parseLatestBaseExperience(source.html, formLabels),
    baseFriendship: parseBaseFriendship(source.html, formLabels),
    eggCycles: parseEggCycles(source.html, formLabels),
    eggGroups: parseEggGroups(source.html, formLabels),
    genderRatio: parseGender(source.html, formLabels),
    heightMillimeters: height.facts,
    weightGrams: weight.facts,
    metricComplementFormLabels: {
      heightMillimeters: height.complementFormLabels,
      weightGrams: weight.complementFormLabels,
    },
    metricHiddenPlaceholderFormLabels: {
      heightMillimeters: height.hiddenPlaceholderFormLabels,
      weightGrams: weight.hiddenPlaceholderFormLabels,
    },
    evYield: parseEvYield(source.html, formLabels, sourceName),
    sourceRecordId: source.sourceRecordId,
  };
}
