import type { StatBlock } from "@pokenexus/game-types";
import { parseBulbapediaSpeciesBaseStats } from "./bulbapedia-species-base-stats.js";

export const BULBAPEDIA_BASE_SPECIES_EVIDENCE_PARSER_VERSION =
  "bulbapedia-base-species-evidence-v8" as const;

export const BULBAPEDIA_SPECIES_PAGE_PARSER_VERSION =
  "bulbapedia-species-page-v17" as const;

export const BULBAPEDIA_REGIONAL_FORM_EVIDENCE_PARSER_VERSION =
  "bulbapedia-regional-form-evidence-v2" as const;

export const BULBAPEDIA_SPECIES_PAGE_URL_PREFIX =
  "https://bulbapedia.bulbagarden.net/wiki/" as const;

export const BULBAPEDIA_REGIONAL_FORM_LIST_URL =
  "https://bulbapedia.bulbagarden.net/wiki/Regional_form" as const;

export interface BulbapediaSpeciesEvidenceHtmlSource {
  url: string;
  sourceRecordId: string;
  html: string;
}

export interface ExtractedBulbapediaBaseSpeciesEvidence {
  sourceName: string;
  introducedGeneration: number;
  typeSourceKeys: string[];
  baseStats: StatBlock<number>;
  sourceRecordId: string;
}

export interface ExtractedBulbapediaRegionalFormEvidence {
  nationalDexNumber: number;
  sourceName: string;
  formLabel: string;
  region: string;
  introducedGeneration: number;
  regionalTypeSourceKeys: string[];
  sourceRecordId: string;
}


const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

const GENERATION_BY_ROMAN: Readonly<Record<string, number>> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
};

const REGION_ADJECTIVES: Readonly<Record<string, string>> = {
  Alola: "Alolan",
  Galar: "Galarian",
  Hisui: "Hisuian",
  Paldea: "Paldean",
};

const REGIONAL_FORM_HEADER = [
  "Ndex",
  "Pokémon",
  "Original form",
  "Region (Generation)",
  "Regional form",
] as const;


interface ParsedCell {
  tag: "td" | "th";
  attributes: string;
  html: string;
  rowspan: number;
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

function isHiddenAttributes(attributes: string): boolean {
  const attributeNames = attributes.replace(/"[^"]*"|'[^']*'/g, " ");
  return /(?:^|\s)hidden(?:\s|=|$)/i.test(attributeNames) ||
    /\baria-hidden\s*=\s*["']true["']/i.test(attributes) ||
    /\bstyle\s*=\s*["'][^"']*display\s*:\s*none/i.test(attributes);
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
  throw new Error(`Bulbapedia Species page: hidden <${tagName}> subtree is unbalanced`);
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
  throw new Error("Bulbapedia Species page: too many hidden subtrees");
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

function normalizeHeaderText(html: string): string {
  return visibleText(html).replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
}

function exactInteger(text: string, label: string, minimum: number): number {
  if (!/^\d+$/.test(text.trim())) {
    throw new Error(`${label}: expected exact integer, got ${JSON.stringify(text)}`);
  }
  const value = Number(text.trim());
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label}: integer outside accepted domain`);
  }
  return value;
}

function canonicalizeSourceName(name: string, label: string): string {
  const key = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!key) throw new Error(`unable to canonicalize ${label} ${JSON.stringify(name)}`);
  return key;
}

function generationFromRoman(roman: string, label: string): number {
  const generation = GENERATION_BY_ROMAN[roman];
  if (generation === undefined) {
    throw new Error(`${label}: unsupported Generation ${roman}`);
  }
  return generation;
}

export function canonicalizeBulbapediaRegionAdjective(region: string): string {
  const adjective = REGION_ADJECTIVES[region.normalize("NFC")];
  if (!adjective) {
    throw new Error(`unsupported Bulbapedia regional-form region ${JSON.stringify(region)}`);
  }
  return adjective;
}

function requireSourceRecordId(source: BulbapediaSpeciesEvidenceHtmlSource, label: string): void {
  if (!source.sourceRecordId.trim()) throw new Error(`${label} sourceRecordId is required`);
}

function parseBaseSpeciesTitleFromUrl(source: BulbapediaSpeciesEvidenceHtmlSource): string {
  let url: URL;
  try {
    url = new URL(source.url);
  } catch {
    throw new Error(`invalid Bulbapedia source URL: ${source.url}`);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "bulbapedia.bulbagarden.net" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`unexpected Bulbapedia Species page URL: ${source.url}`);
  }
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    throw new Error(`invalid Bulbapedia Species page URL encoding: ${source.url}`);
  }
  const match = /^\/wiki\/([^/]+)_\(Pokémon\)$/u.exec(decodedPath);
  if (!match) throw new Error(`unexpected Bulbapedia Species page URL: ${source.url}`);
  requireSourceRecordId(source, "Bulbapedia Species page");
  return match[1].replace(/_/g, " ").normalize("NFC");
}

function typeSourceKeysFromHtml(html: string, label: string): string[] {
  const links = [...html.matchAll(
    /<a\b[^>]*href=["']\/wiki\/([^"'#?]+)_\(type\)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )];
  const keys = links.map((link) => {
    let pathName: string;
    try {
      pathName = decodeURIComponent(decodeHtml(link[1])).replace(/_/g, " ");
    } catch {
      throw new Error(`${label}: invalid structured Type link`);
    }
    const pathKey = canonicalizeSourceName(pathName, `${label} Type link`);
    const display = visibleText(link[2]);
    const displayKey = canonicalizeSourceName(
      display.replace(/-type$/i, ""),
      `${label} Type label`,
    );
    if (pathKey !== displayKey) {
      throw new Error(`${label}: structured Type link and displayed Type disagree`);
    }
    return pathKey;
  });
  if (keys.length < 1 || keys.length > 2 || new Set(keys).size !== keys.length) {
    throw new Error(`${label}: expected one or two unique structured Type links`);
  }
  return keys;
}

function parseIntroEvidence(
  source: BulbapediaSpeciesEvidenceHtmlSource,
  pageTitle: string,
): Pick<ExtractedBulbapediaBaseSpeciesEvidence, "sourceName" | "introducedGeneration" | "typeSourceKeys"> {
  const candidates = [...source.html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].filter((match) => {
    const html = withoutHiddenSubtrees(match[1]);
    const leadingName = /^\s*<b>([\s\S]*?)<\/b>/i.exec(html);
    return (
      leadingName !== null &&
      /href=["']\/wiki\/Generation_[IVX]+["']/i.test(html) &&
      /\bintroduced in\b/i.test(visibleText(html))
    );
  });
  if (candidates.length !== 1) {
    throw new Error(`Bulbapedia Species page: expected exactly one introductory species sentence, found ${candidates.length}`);
  }
  const introHtml = withoutHiddenSubtrees(candidates[0][1]);
  const nameMatch = /^\s*<b>([\s\S]*?)<\/b>/i.exec(introHtml);
  if (!nameMatch) throw new Error("Bulbapedia Species page: introductory species name is missing");
  const sourceName = visibleText(nameMatch[1]).normalize("NFC");
  if (!sourceName || sourceName !== pageTitle) {
    throw new Error(
      `Bulbapedia Species page: URL title ${JSON.stringify(pageTitle)} and introductory name ${JSON.stringify(sourceName)} disagree`,
    );
  }

  const introductionEnd = /\bintroduced in\s+<a\b[^>]*href=["']\/wiki\/Generation_([IVX]+)["'][^>]*>([\s\S]*?)<\/a>\s*\./i.exec(introHtml);
  if (!introductionEnd || introductionEnd.index === undefined) {
    throw new Error("Bulbapedia Species page: introductory species sentence has unexpected structure");
  }
  const introSentenceHtml = introHtml.slice(0, introductionEnd.index + introductionEnd[0].length);
  const introText = visibleText(introSentenceHtml).normalize("NFC");
  if (!new RegExp(`^${escapeRegExp(sourceName)}(?=\\s)[\\s\\S]*\\bintroduced in Generation [IVX]+\\s*\\.$`, "u").test(introText)) {
    throw new Error("Bulbapedia Species page: introductory species sentence has unexpected structure");
  }
  const introducedOccurrences = [...introText.matchAll(/\bintroduced in\b/gi)];
  if (introducedOccurrences.length !== 1) {
    throw new Error("Bulbapedia Species page: introductory species sentence must contain exactly one introduced-in phrase");
  }
  const structuralIntroduction = /\bintroduced in Generation [IVX]+\s*\.$/u.exec(introText);
  if (!structuralIntroduction || structuralIntroduction.index === undefined) {
    throw new Error("Bulbapedia Species page: introductory species sentence has unexpected structure");
  }
  const preIntroductionText = introText.slice(sourceName.length, structuralIntroduction.index);
  if (/[.!?]/u.test(preIntroductionText)) {
    throw new Error("Bulbapedia Species page: introduction Generation evidence must terminate the first sentence");
  }
  const generationLinks = [...introSentenceHtml.matchAll(
    /<a\b[^>]*href=["']\/wiki\/Generation_([IVX]+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )];
  if (generationLinks.length !== 1) {
    throw new Error("Bulbapedia Species page: expected exactly one structured introduction Generation link");
  }
  const roman = generationLinks[0][1].toUpperCase();
  const generationLabel = visibleText(generationLinks[0][2]);
  if (generationLabel !== `Generation ${roman}`) {
    throw new Error("Bulbapedia Species page: introduction Generation link label disagrees with href");
  }

  return {
    sourceName,
    introducedGeneration: generationFromRoman(roman, `${sourceName} introduction`),
    typeSourceKeys: typeSourceKeysFromHtml(introSentenceHtml, `${sourceName} introduction`),
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function boundedSectionByHeadlineId(html: string, id: string, label: string): string {
  const markers = [
    ...html.matchAll(
      new RegExp(
        `<span\\b[^>]*class=["'][^"']*\\bmw-headline\\b[^"']*["'][^>]*id=["']${escapeRegExp(id)}["'][^>]*>`,
        "gi",
      ),
    ),
  ];
  if (markers.length !== 1 || markers[0].index === undefined) {
    throw new Error(`${label}: required ${id} heading is missing or ambiguous`);
  }
  const markerIndex = markers[0].index;
  const headingStarts = [
    ...html.slice(0, markerIndex).matchAll(/<h([1-6])\b[^>]*>/gi),
  ];
  const headingStart = headingStarts.at(-1);
  if (!headingStart || headingStart.index === undefined) {
    throw new Error(`${label}: ${id} marker is not inside a heading`);
  }
  const level = headingStart[1];
  const closePattern = new RegExp(`<\\/h${level}>`, "i");
  const close = closePattern.exec(html.slice(markerIndex));
  if (!close || close.index === undefined) {
    throw new Error(`${label}: ${id} heading is not closed`);
  }
  const start = markerIndex + close.index + close[0].length;
  const headingOpenEnd = headingStart.index + headingStart[0].length;
  if (headingOpenEnd > markerIndex) {
    throw new Error(`${label}: invalid ${id} heading structure`);
  }
  const remainder = html.slice(start);
  const nextHeading = /<h[1-6]\b[^>]*>/i.exec(remainder);
  return nextHeading?.index === undefined ? remainder : remainder.slice(0, nextHeading.index);
}

export function parseBulbapediaBaseSpeciesEvidence(
  source: BulbapediaSpeciesEvidenceHtmlSource,
): ExtractedBulbapediaBaseSpeciesEvidence {
  const pageTitle = parseBaseSpeciesTitleFromUrl(source);
  const intro = parseIntroEvidence(source, pageTitle);
  const baseStatsEvidence = parseBulbapediaSpeciesBaseStats(source).filter(
    (entry) =>
      entry.scope.kind === "exact" &&
      entry.scope.sourceFormNames.some(
        (sourceFormName) => sourceFormName.normalize("NFC") === intro.sourceName.normalize("NFC"),
      ),
  );
  if (baseStatsEvidence.length !== 1) {
    throw new Error(
      `${intro.sourceName} Base stats: expected exactly one Bulbapedia base-form evidence record, found ${baseStatsEvidence.length}`,
    );
  }
  return {
    ...intro,
    baseStats: baseStatsEvidence[0].baseStats,
    sourceRecordId: source.sourceRecordId,
  };
}

function requireRegionalFormListSource(source: BulbapediaSpeciesEvidenceHtmlSource): void {
  let url: URL;
  try {
    url = new URL(source.url);
  } catch {
    throw new Error(`invalid Bulbapedia source URL: ${source.url}`);
  }
  const expected = new URL(BULBAPEDIA_REGIONAL_FORM_LIST_URL);
  if (
    url.protocol !== expected.protocol ||
    url.hostname !== expected.hostname ||
    decodeURIComponent(url.pathname) !== decodeURIComponent(expected.pathname) ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`unexpected Bulbapedia regional-form list URL: ${source.url}`);
  }
  requireSourceRecordId(source, "Bulbapedia regional-form list");
}

function parseSpan(attributes: string, name: "rowspan" | "colspan"): number {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:["'](\\d+)["']|(\\d+))`, "i").exec(attributes);
  if (!match) return 1;
  return exactInteger(match[1] ?? match[2], `regional-form ${name}`, 1);
}

function parseRowCells(rowHtml: string): ParsedCell[] {
  const structuralHtml = maskInertHtml(rowHtml);
  return [...structuralHtml.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)].map((match) => {
    if (match.index === undefined) {
      throw new Error("Bulbapedia regional-form list: cell location is unavailable");
    }
    if (isHiddenAttributes(match[2])) {
      throw new Error("Bulbapedia regional-form list: hidden data/header cell is not supported");
    }
    const colspan = parseSpan(match[2], "colspan");
    if (colspan !== 1) throw new Error("Bulbapedia regional-form list: data/header colspan is not supported");
    const originalHtml = rowHtml.slice(match.index, match.index + match[0].length);
    const originalMatch = /^<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>$/i.exec(originalHtml);
    if (!originalMatch) {
      throw new Error("Bulbapedia regional-form list: structured cell reconstruction failed");
    }
    return {
      tag: originalMatch[1].toLowerCase() as "td" | "th",
      attributes: originalMatch[2],
      html: originalMatch[3],
      rowspan: parseSpan(originalMatch[2], "rowspan"),
    };
  });
}

function regionalFormTable(html: string): string {
  const section = boundedSectionByHeadlineId(html, "List_of_regional_forms", "Bulbapedia regional-form list");
  const structuralSection = maskInertHtml(section);
  const candidates = [...structuralSection.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)]
    .map((match) => {
      if (match.index === undefined) return "";
      return section.slice(match.index, match.index + match[0].length);
    })
    .filter((table) => {
      const firstRow = /<tr\b[^>]*>([\s\S]*?)<\/tr>/i.exec(table);
      if (!firstRow) return false;
      const header = parseRowCells(firstRow[1]).map((cell) => normalizeHeaderText(cell.html));
      return header.length === REGIONAL_FORM_HEADER.length && REGIONAL_FORM_HEADER.every((value, index) => header[index] === value);
    });
  if (candidates.length !== 1) {
    throw new Error(`Bulbapedia regional-form list: expected exactly one structured table, found ${candidates.length}`);
  }
  return candidates[0];
}

function expandedDataRows(tableHtml: string): ParsedCell[][] {
  const structuralTableHtml = maskInertHtml(tableHtml);
  const rows = [...structuralTableHtml.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)]
    .filter((match) => !isHiddenAttributes(match[1]))
    .map((match) => {
      if (match.index === undefined) {
        throw new Error("Bulbapedia regional-form list: row location is unavailable");
      }
      const originalHtml = tableHtml.slice(match.index, match.index + match[0].length);
      const originalMatch = /^<tr\b([^>]*)>([\s\S]*?)<\/tr>$/i.exec(originalHtml);
      if (!originalMatch) {
        throw new Error("Bulbapedia regional-form list: structured row reconstruction failed");
      }
      return {
        attributes: originalMatch[1],
        html: originalMatch[2],
      };
    });
  if (rows.length < 2) throw new Error("Bulbapedia regional-form list: table has no data rows");
  const header = parseRowCells(rows[0].html).map((cell) => normalizeHeaderText(cell.html));
  if (header.length !== REGIONAL_FORM_HEADER.length || REGIONAL_FORM_HEADER.some((value, index) => header[index] !== value)) {
    throw new Error(`Bulbapedia regional-form list: unexpected header layout ${JSON.stringify(header)}`);
  }

  const active: Array<{ cell: ParsedCell; remaining: number } | undefined> = new Array(REGIONAL_FORM_HEADER.length);
  const result: ParsedCell[][] = [];
  for (const rawRow of rows.slice(1)) {
    if (/\bclass=["'][^"']*\bsortbottom\b[^"']*["']/i.test(rawRow.attributes)) {
      continue;
    }
    const incoming = parseRowCells(rawRow.html);
    const logical: ParsedCell[] = [];
    let incomingIndex = 0;
    for (let column = 0; column < REGIONAL_FORM_HEADER.length; column += 1) {
      const span = active[column];
      if (span) {
        logical[column] = span.cell;
        span.remaining -= 1;
        if (span.remaining === 0) active[column] = undefined;
        continue;
      }
      const cell = incoming[incomingIndex++];
      if (!cell) throw new Error(`Bulbapedia regional-form list: incomplete data row at column ${column}`);
      logical[column] = cell;
      if (cell.rowspan > 1) active[column] = { cell, remaining: cell.rowspan - 1 };
    }
    if (incomingIndex !== incoming.length) {
      throw new Error("Bulbapedia regional-form list: data row has unexpected extra cells");
    }
    result.push(logical);
  }
  if (active.some((entry) => entry !== undefined)) {
    throw new Error("Bulbapedia regional-form list: unterminated rowspan at end of table");
  }
  return result;
}

function nationalDexNumberFromCell(cell: ParsedCell): number {
  const match = /^#(\d{4})$/.exec(visibleText(cell.html));
  if (!match) throw new Error(`Bulbapedia regional-form list: invalid National Dex cell ${JSON.stringify(visibleText(cell.html))}`);
  return exactInteger(match[1], "Bulbapedia regional-form National Dex number", 1);
}

function sourceNameFromCell(cell: ParsedCell, dex: number): string {
  const visibleHtml = withoutHiddenSubtrees(cell.html);
  const links = [...visibleHtml.matchAll(
    /<a\b[^>]*href=["']\/wiki\/([^"'#?]+)_\(Pok%C3%A9mon\)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )].filter((link) => visibleText(link[2]) !== "");
  if (links.length !== 1) {
    throw new Error(`Bulbapedia regional-form #${dex}: expected exactly one structured Pokémon name link`);
  }
  const sourceName = visibleText(links[0][2]).normalize("NFC");
  let pathName: string;
  try {
    pathName = decodeURIComponent(decodeHtml(links[0][1])).replace(/_/g, " ").normalize("NFC");
  } catch {
    throw new Error(`Bulbapedia regional-form #${dex}: invalid Pokémon link`);
  }
  if (sourceName !== pathName || visibleText(visibleHtml) !== sourceName) {
    throw new Error(`Bulbapedia regional-form #${dex}: Pokémon link and displayed name disagree`);
  }
  return sourceName;
}

function regionAndGenerationFromCell(cell: ParsedCell, sourceName: string): { region: string; introducedGeneration: number } {
  const visibleHtml = withoutHiddenSubtrees(cell.html);
  const anchors = [...visibleHtml.matchAll(/<a\b[^>]*href=["']\/wiki\/([^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ path: decodeHtml(match[1]), text: visibleText(match[2]) }))
    .filter((entry) => entry.text !== "");
  const generationLinks = anchors.filter((entry) => /^Generation_[IVX]+$/i.test(entry.path));
  if (generationLinks.length !== 1) {
    throw new Error(`${sourceName} regional form: expected exactly one Generation link`);
  }
  const roman = /^Generation_([IVX]+)$/i.exec(generationLinks[0].path)![1].toUpperCase();
  if (generationLinks[0].text !== roman && generationLinks[0].text !== `Generation ${roman}`) {
    throw new Error(`${sourceName} regional form: Generation link and label disagree`);
  }
  const regionLinks = anchors.filter((entry) => !/^Generation_[IVX]+$/i.test(entry.path));
  if (regionLinks.length !== 1) {
    throw new Error(`${sourceName} regional form: expected exactly one visible Region link`);
  }
  let regionPathName: string;
  try {
    regionPathName = decodeURIComponent(regionLinks[0].path).replace(/_/g, " ").normalize("NFC");
  } catch {
    throw new Error(`${sourceName} regional form: invalid Region link`);
  }
  const region = regionLinks[0].text.normalize("NFC");
  if (region !== regionPathName) throw new Error(`${sourceName} regional form: Region link and label disagree`);
  canonicalizeBulbapediaRegionAdjective(region);
  return {
    region,
    introducedGeneration: generationFromRoman(roman, `${sourceName} regional form`),
  };
}

function regionalFormLabelFromCell(
  cell: ParsedCell,
  sourceName: string,
  region: string,
): string {
  const visibleHtml = withoutHiddenSubtrees(cell.html);
  const breedLinks = [
    ...visibleHtml.matchAll(
      /<a\b[^>]*href=["']\/wiki\/List_of_Pok%C3%A9mon_with_form_differences#[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi,
    ),
  ]
    .map((match) => visibleText(match[1]).normalize("NFC"))
    .filter(Boolean);
  if (new Set(breedLinks).size > 1) {
    throw new Error(
      `${sourceName} ${region} regional form: ambiguous structured breed labels`,
    );
  }
  if (breedLinks.length > 0) return breedLinks[0];
  return `${canonicalizeBulbapediaRegionAdjective(region)} ${sourceName}`;
}

export function parseBulbapediaRegionalForms(
  source: BulbapediaSpeciesEvidenceHtmlSource,
): ExtractedBulbapediaRegionalFormEvidence[] {
  requireRegionalFormListSource(source);
  const rows = expandedDataRows(regionalFormTable(source.html));
  const records: ExtractedBulbapediaRegionalFormEvidence[] = [];
  const nameByDex = new Map<number, string>();
  const dexByName = new Map<string, number>();
  const generationByRegion = new Map<string, number>();
  const seenSignatures = new Set<string>();

  for (const row of rows) {
    const nationalDexNumber = nationalDexNumberFromCell(row[0]);
    const sourceName = sourceNameFromCell(row[1], nationalDexNumber);
    const priorName = nameByDex.get(nationalDexNumber);
    if (priorName !== undefined && priorName !== sourceName) {
      throw new Error(`Bulbapedia regional-form list: National Dex #${nationalDexNumber} maps to conflicting names`);
    }
    const priorDex = dexByName.get(sourceName);
    if (priorDex !== undefined && priorDex !== nationalDexNumber) {
      throw new Error(`Bulbapedia regional-form list: Pokémon ${sourceName} maps to conflicting National Dex numbers`);
    }
    nameByDex.set(nationalDexNumber, sourceName);
    dexByName.set(sourceName, nationalDexNumber);

    const { region, introducedGeneration } = regionAndGenerationFromCell(row[3], sourceName);
    const priorGeneration = generationByRegion.get(region);
    if (priorGeneration !== undefined && priorGeneration !== introducedGeneration) {
      throw new Error(`Bulbapedia regional-form list: Region ${region} maps to conflicting generations`);
    }
    generationByRegion.set(region, introducedGeneration);

    const regionalTypeSourceKeys = typeSourceKeysFromHtml(
      withoutHiddenSubtrees(row[4].html),
      `${sourceName} ${region} regional form`,
    );
    const formLabel = regionalFormLabelFromCell(row[4], sourceName, region);
    const signature = [
      nationalDexNumber,
      sourceName,
      formLabel,
      region,
      introducedGeneration,
      [...regionalTypeSourceKeys].sort().join(","),
    ].join("|");
    if (seenSignatures.has(signature)) {
      throw new Error(`Bulbapedia regional-form list: duplicate/ambiguous row for ${sourceName} ${region}`);
    }
    seenSignatures.add(signature);
    records.push({
      nationalDexNumber,
      sourceName,
      formLabel,
      region,
      introducedGeneration,
      regionalTypeSourceKeys,
      sourceRecordId: source.sourceRecordId,
    });
  }
  if (records.length === 0) throw new Error("Bulbapedia regional-form list: no regional forms were extracted");
  return records;
}
