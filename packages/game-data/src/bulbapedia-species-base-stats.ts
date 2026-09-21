import type { StatBlock } from "@pokenexus/game-types";

export const BULBAPEDIA_SPECIES_BASE_STATS_PARSER_VERSION =
  "bulbapedia-species-base-stats-v4" as const;

export const BULBAPEDIA_SPECIES_BASE_STATS_URL_PREFIX =
  "https://bulbapedia.bulbagarden.net/wiki/" as const;

export interface BulbapediaSpeciesBaseStatsHtmlSource {
  url: string;
  sourceRecordId: string;
  html: string;
}

export type BulbapediaSpeciesBaseStatsScope =
  | { kind: "exact"; sourceFormNames: string[] }
  | { kind: "all-forms-of"; sourceFormGroupName: string };

export interface ExtractedBulbapediaSpeciesBaseStats {
  sourceName: string;
  scope: BulbapediaSpeciesBaseStatsScope;
  baseStats: StatBlock<number>;
  sourceRecordId: string;
}

type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

const STAT_LINKS: ReadonlyArray<readonly [StatKey, RegExp]> = [
  ["hp", /href=["']\/wiki\/HP["']/i],
  ["atk", /href=["']\/wiki\/Stat#Attack["']/i],
  ["def", /href=["']\/wiki\/Stat#Defense["']/i],
  ["spa", /href=["']\/wiki\/Stat#Special_Attack["']/i],
  ["spd", /href=["']\/wiki\/Stat#Special_Defense["']/i],
  ["spe", /href=["']\/wiki\/Stat#Speed["']/i],
];

interface HeadingSlice {
  name: string;
  contentStart: number;
  headingStart: number;
}

interface TableMatch {
  html: string;
  start: number;
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

function withoutHiddenSubtrees(html: string): string {
  let result = html;
  const hiddenElement =
    /<([a-z][a-z0-9:-]*)\b(?=[^>]*(?:\bhidden\b|\baria-hidden\s*=\s*["']true["']|\bstyle\s*=\s*["'][^"']*display\s*:\s*none))[^>]*>[\s\S]*?<\/\1>/gi;
  for (let pass = 0; pass < 8; pass += 1) {
    const next = result.replace(hiddenElement, " ");
    if (next === result) break;
    result = next;
  }
  return result;
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

function isHiddenAttributes(attributes: string): boolean {
  return (
    /(?:^|\s)hidden(?:\s|=|$)/i.test(attributes) ||
    /\baria-hidden\s*=\s*["']true["']/i.test(attributes) ||
    /\bstyle\s*=\s*["'][^"']*display\s*:\s*none/i.test(attributes)
  );
}

function exactInteger(text: string, label: string): number {
  if (!/^\d+$/.test(text.trim())) {
    throw new Error(`${label}: expected exact integer`);
  }
  const value = Number(text.trim());
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label}: integer outside accepted domain`);
  }
  return value;
}

function parseSourceName(source: BulbapediaSpeciesBaseStatsHtmlSource): string {
  let url: URL;
  try {
    url = new URL(source.url);
  } catch {
    throw new Error(`invalid Bulbapedia Species Base Stats source URL: ${source.url}`);
  }
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    throw new Error(`invalid Bulbapedia Species Base Stats source URL: ${source.url}`);
  }
  const pathMatch = /^\/wiki\/([^/]+)_\(Pokémon\)$/u.exec(decodedPath);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "bulbapedia.bulbagarden.net" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !pathMatch
  ) {
    throw new Error(`unexpected canonical Bulbapedia Species page URL: ${source.url}`);
  }
  if (!source.sourceRecordId.trim()) {
    throw new Error("Bulbapedia Species Base Stats sourceRecordId is required");
  }
  const sourceName = pathMatch[1].replace(/_/g, " ").normalize("NFC");
  if (!sourceName.trim()) {
    throw new Error("Bulbapedia Species Base Stats URL Species name is empty");
  }
  const h1s = [...source.html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) =>
    visibleText(match[1]),
  );
  if (h1s.length !== 1 || h1s[0] !== `${sourceName} (Pokémon)`) {
    throw new Error(
      `Bulbapedia Species Base Stats h1 mismatch: expected ${JSON.stringify(`${sourceName} (Pokémon)`)}`,
    );
  }
  return sourceName;
}

function baseStatsSection(html: string): string {
  const markers = [
    ...html.matchAll(
      /<span\b[^>]*class=["'][^"']*\bmw-headline\b[^"']*["'][^>]*id=["']Base_stats["'][^>]*>/g,
    ),
  ];
  if (markers.length !== 1 || markers[0].index === undefined) {
    throw new Error("Bulbapedia Species Base Stats: required Base_stats heading is missing or ambiguous");
  }
  const markerIndex = markers[0].index;
  const headingStarts = [...html.slice(0, markerIndex).matchAll(/<h([1-6])\b[^>]*>/gi)];
  const heading = headingStarts.at(-1);
  if (!heading || heading.index === undefined) {
    throw new Error("Bulbapedia Species Base Stats: Base_stats marker is not inside a heading");
  }
  const level = Number(heading[1]);
  const close = new RegExp(`<\\/h${level}>`, "i").exec(html.slice(markerIndex));
  if (!close || close.index === undefined) {
    throw new Error("Bulbapedia Species Base Stats: Base_stats heading is not closed");
  }
  const start = markerIndex + close.index + close[0].length;
  const remainder = html.slice(start);
  const next = new RegExp(`<h[1-${level}]\\b`, "i").exec(remainder);
  return next?.index === undefined ? remainder : remainder.slice(0, next.index);
}

function allTableMatches(html: string): TableMatch[] {
  return [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map((match) => ({
    html: match[0],
    start: match.index ?? 0,
  }));
}

function statKeyInHtml(html: string): StatKey | null {
  const matches = STAT_LINKS.filter(([, pattern]) => pattern.test(html));
  if (matches.length > 1) {
    throw new Error("Bulbapedia Species Base Stats: one stat cell references multiple stat identities");
  }
  return matches[0]?.[0] ?? null;
}

function hasAnyStatLink(html: string): boolean {
  return STAT_LINKS.some(([, pattern]) => pattern.test(html));
}

function structuredStatTables(html: string): TableMatch[] {
  return allTableMatches(html).filter((table) => hasAnyStatLink(table.html));
}

function parseStatTable(tableHtml: string, label: string): StatBlock<number> {
  const values = new Map<StatKey, number>();
  for (const row of tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    for (const cell of row[1].matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      const key = statKeyInHtml(cell[3]);
      if (!key) continue;
      if (isHiddenAttributes(cell[2])) {
        throw new Error(`${label}: hidden structured stat cell is not accepted`);
      }
      if (values.has(key)) {
        throw new Error(`${label}: duplicate ${key} stat row`);
      }
      const divs = [...cell[3].matchAll(/<div\b([^>]*)>([\s\S]*?)<\/div>/gi)]
        .filter((match) => !isHiddenAttributes(match[1]))
        .map((match) => visibleText(match[2]));
      if (divs.length !== 2) {
        throw new Error(`${label}: ${key} stat row has unexpected structured value shape`);
      }
      values.set(key, exactInteger(divs[1], `${label} ${key}`));
    }
  }
  if (values.size !== STAT_LINKS.length) {
    throw new Error(`${label}: incomplete six-stat evidence`);
  }
  return {
    hp: values.get("hp")!,
    atk: values.get("atk")!,
    def: values.get("def")!,
    spa: values.get("spa")!,
    spd: values.get("spd")!,
    spe: values.get("spe")!,
  };
}

function h5Headings(section: string): HeadingSlice[] {
  return [...section.matchAll(/<h5\b[^>]*>([\s\S]*?)<\/h5>/gi)].map((match) => ({
    name: visibleText(match[1]).normalize("NFC"),
    headingStart: match.index ?? 0,
    contentStart: (match.index ?? 0) + match[0].length,
  }));
}

function h6Headings(section: string): HeadingSlice[] {
  return [...section.matchAll(/<h6\b[^>]*>([\s\S]*?)<\/h6>/gi)].map((match) => ({
    name: visibleText(match[1]).normalize("NFC"),
    headingStart: match.index ?? 0,
    contentStart: (match.index ?? 0) + match[0].length,
  }));
}

const CURRENT_BASE_STATS_VERSION_PAIRS = new Set<string>([
  "Generations I-V\u0000Generation VI onward",
  "Generations I - V\u0000Generation VI onward",
  "Generations I to V\u0000Generation VI onwards",
  "Generation I to V\u0000Generation VI onwards",
  "Generations I-V\u0000Generation VI onwards",
  "Generations I-VI\u0000Generation VII onward",
  "Generations I-VI\u0000Generation VII onwards",
  "Generation I to VI\u0000Generation VII onwards",
  "Generations II-V\u0000Generation VI onward",
  "Generations II-VI\u0000Generation VII onward",
  "Generations II-VI\u0000Generation VII onwards",
  "Generation II to VI\u0000Generation VII onwards",
]);

function currentStructuredStatTable(html: string, label: string): TableMatch {
  const versionHeadings = h6Headings(html);
  if (versionHeadings.length === 0) {
    const tables = structuredStatTables(html);
    if (tables.length !== 1) {
      throw new Error(label + ": expected exactly one structured six-stat table, found " + tables.length);
    }
    return tables[0];
  }
  if (versionHeadings.length !== 2) {
    throw new Error(label + ": unsupported base-stat version-heading structure");
  }
  const pairKey = versionHeadings[0].name + "\u0000" + versionHeadings[1].name;
  if (!CURRENT_BASE_STATS_VERSION_PAIRS.has(pairKey)) {
    throw new Error(
      label + ": unsupported base-stat version headings " +
        JSON.stringify(versionHeadings.map((heading) => heading.name)),
    );
  }
  const prefixTables = structuredStatTables(html.slice(0, versionHeadings[0].headingStart));
  if (prefixTables.length !== 0) {
    throw new Error(label + ": structured table appears outside an h6 version scope");
  }
  const tablesByVersion = versionHeadings.map((heading, index) => {
    const end = versionHeadings[index + 1]?.headingStart ?? html.length;
    const tables = structuredStatTables(html.slice(heading.contentStart, end));
    if (tables.length !== 1) {
      throw new Error(
        label + " " + heading.name + ": expected exactly one structured six-stat table, found " + tables.length,
      );
    }
    return tables[0];
  });
  const current = tablesByVersion[1];
  return {
    ...current,
    start: versionHeadings[1].contentStart + current.start,
  };
}

function isBattleOnlyTransformationHeading(name: string): boolean {
  return /^Mega\s/u.test(name);
}

function scopeStatementBeforeSelectedTable(html: string, table: TableMatch): string | null {
  const versionHeadings = h6Headings(html);
  const boundary = versionHeadings.length === 0 ? table.start : versionHeadings[0].headingStart;
  return paragraphImmediatelyBefore(html, boundary);
}

function paragraphImmediatelyBefore(html: string, tableStart: number): string | null {
  const prefix = html
    .slice(0, tableStart)
    .replace(/<!--[\s\S]*?-->/g, "")
    .trimEnd();
  const match = /<p\b[^>]*>([\s\S]*?)<\/p>\s*$/i.exec(prefix);
  return match ? visibleText(match[1]).normalize("NFC") : null;
}

function allSameStatsParagraphs(html: string): string[] {
  return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => visibleText(match[1]).normalize("NFC"))
    .filter(
      (text) =>
        /\b(?:same|identical)\s+base\s+stats?\b/i.test(text) ||
        (/^All forms of\b/i.test(text) && /\bbase\s+stats?\b/i.test(text)),
    );
}

function parseSharedExactStatement(statement: string): string[] | null {
  const match = /^(.+?) and (.+?) have the same base stats\.$/u.exec(statement);
  if (!match) return null;
  const names = [match[1].trim().normalize("NFC"), match[2].trim().normalize("NFC")];
  if (names.some((name) => !name) || names[0] === names[1]) {
    throw new Error("Bulbapedia Species Base Stats: invalid shared exact-form statement");
  }
  return names;
}

function parseAllFormsStatement(statement: string): string | null {
  const match = /^All forms of (.+?) have the same base stats\.$/u.exec(statement);
  if (!match) return null;
  const groupName = match[1].trim().normalize("NFC");
  if (!groupName) {
    throw new Error("Bulbapedia Species Base Stats: invalid all-forms statement");
  }
  return groupName;
}

function assertNoUnaccountedSameStatsStatements(
  html: string,
  recognizedStatements: ReadonlySet<string>,
): void {
  for (const statement of allSameStatsParagraphs(html)) {
    if (!recognizedStatements.has(statement)) {
      throw new Error(
        `Bulbapedia Species Base Stats: unrecognized or non-immediate scope statement ${JSON.stringify(statement)}`,
      );
    }
  }
}

export function parseBulbapediaSpeciesBaseStats(
  source: BulbapediaSpeciesBaseStatsHtmlSource,
): ExtractedBulbapediaSpeciesBaseStats[] {
  const sourceName = parseSourceName(source);
  const section = baseStatsSection(source.html);
  const headings = h5Headings(section);
  const recognizedStatements = new Set<string>();
  const result: ExtractedBulbapediaSpeciesBaseStats[] = [];

  if (headings.length === 0) {
    const tables = [currentStructuredStatTable(section, "Bulbapedia Species Base Stats")];
    const statement = scopeStatementBeforeSelectedTable(section, tables[0]);
    const sharedNames = statement ? parseSharedExactStatement(statement) : null;
    const allForms = statement ? parseAllFormsStatement(statement) : null;
    if (allForms) {
      throw new Error("Bulbapedia Species Base Stats: all-forms scope requires an h5 group heading");
    }
    if (sharedNames && statement) recognizedStatements.add(statement);
    result.push({
      sourceName,
      scope: { kind: "exact", sourceFormNames: sharedNames ?? [sourceName] },
      baseStats: parseStatTable(tables[0].html, `${sourceName} Base Stats`),
      sourceRecordId: source.sourceRecordId,
    });
    assertNoUnaccountedSameStatsStatements(section, recognizedStatements);
    return result;
  }

  const prefix = section.slice(0, headings[0].headingStart);
  const prefixTables = structuredStatTables(prefix);
  const prefixVersionHeadings = h6Headings(prefix);
  if (prefixTables.length !== 0 || prefixVersionHeadings.length !== 0) {
    if (headings[0].name === sourceName) {
      throw new Error("Bulbapedia Species Base Stats: structured table appears outside an h5 form scope");
    }
    const table = currentStructuredStatTable(prefix, "Bulbapedia Species Base Stats " + sourceName);
    const statement = scopeStatementBeforeSelectedTable(prefix, table);
    const sharedNames = statement ? parseSharedExactStatement(statement) : null;
    const allForms = statement ? parseAllFormsStatement(statement) : null;
    if (allForms) {
      throw new Error("Bulbapedia Species Base Stats: all-forms scope requires an h5 group heading");
    }
    if (sharedNames && statement) recognizedStatements.add(statement);
    result.push({
      sourceName,
      scope: { kind: "exact", sourceFormNames: sharedNames ?? [sourceName] },
      baseStats: parseStatTable(table.html, sourceName + " Base Stats"),
      sourceRecordId: source.sourceRecordId,
    });
  }
  const seenHeadings = new Set<string>();
  for (const [index, heading] of headings.entries()) {
    if (!heading.name) {
      throw new Error("Bulbapedia Species Base Stats: empty h5 form heading");
    }
    if (seenHeadings.has(heading.name)) {
      throw new Error(`Bulbapedia Species Base Stats: duplicate h5 form heading ${heading.name}`);
    }
    seenHeadings.add(heading.name);
    const end = headings[index + 1]?.headingStart ?? section.length;
    const content = section.slice(heading.contentStart, end);
    if (isBattleOnlyTransformationHeading(heading.name)) continue;
    const tables = [
      currentStructuredStatTable(content, "Bulbapedia Species Base Stats " + heading.name),
    ];
    const statement = scopeStatementBeforeSelectedTable(content, tables[0]);
    const allForms = statement ? parseAllFormsStatement(statement) : null;
    const sharedNames = statement ? parseSharedExactStatement(statement) : null;
    if (sharedNames) {
      throw new Error(
        `Bulbapedia Species Base Stats ${heading.name}: shared X/Y statement is not an accepted h5 form scope`,
      );
    }
    let scope: BulbapediaSpeciesBaseStatsScope;
    if (allForms !== null) {
      if (allForms !== heading.name) {
        throw new Error(
          `Bulbapedia Species Base Stats ${heading.name}: all-forms statement names ${JSON.stringify(allForms)}`,
        );
      }
      recognizedStatements.add(statement!);
      scope = { kind: "all-forms-of", sourceFormGroupName: allForms };
    } else {
      scope = { kind: "exact", sourceFormNames: [heading.name] };
    }
    result.push({
      sourceName,
      scope,
      baseStats: parseStatTable(tables[0].html, `${sourceName} ${heading.name} Base Stats`),
      sourceRecordId: source.sourceRecordId,
    });
  }
  assertNoUnaccountedSameStatsStatements(section, recognizedStatements);
  return result;
}
