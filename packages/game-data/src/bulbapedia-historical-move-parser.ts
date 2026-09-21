export const BULBAPEDIA_HISTORICAL_MOVE_PARSER_VERSION =
  "bulbapedia-historical-move-availability-v1" as const;

export const BULBAPEDIA_GEN8_MOVE_LIST_URL =
  "https://bulbapedia.bulbagarden.net/wiki/List_of_moves_by_availability_(Generation_VIII)";

export const BULBAPEDIA_GEN7_MOVE_LIST_URL =
  "https://bulbapedia.bulbagarden.net/wiki/List_of_moves_by_availability_in_Generation_VII";

export interface BulbapediaHistoricalHtmlSource {
  url: string;
  sourceRecordId: string;
  html: string;
}

export type HistoricalMoveAvailability = "usable" | "unusable";

export interface HistoricalMoveFacts {
  index: number;
  sourceName: string;
  sourceKey: string;
  typeSourceKey: string;
  category: "physical" | "special" | "status";
  basePp: number;
  power: number | null;
  accuracy: number | null;
  sourceRecordId: string;
}

export interface ExtractedBulbapediaGen8Move extends HistoricalMoveFacts {
  swordShieldAvailability: HistoricalMoveAvailability;
  bdspAvailability: HistoricalMoveAvailability;
  legendsArceusAvailability: HistoricalMoveAvailability;
}

export interface ExtractedBulbapediaGen7Move extends HistoricalMoveFacts {
  sunMoonAvailability: HistoricalMoveAvailability;
  ultraSunUltraMoonAvailability: HistoricalMoveAvailability;
  letsGoPikachuEeveeAvailability: HistoricalMoveAvailability;
}

export type TraditionalMoveFallbackGame =
  | "brilliant-diamond-shining-pearl"
  | "sword-shield"
  | "ultra-sun-ultra-moon"
  | "sun-moon";

export interface LatestTraditionalMoveAvailability {
  generation: 8 | 7;
  game: TraditionalMoveFallbackGame;
  sourceKey: string;
  sourceRecordId: string;
}

const GEN8_HEADER = [
  "#",
  "Name",
  "Type",
  "Category",
  "PP",
  "Power",
  "Accuracy",
  "SwSh",
  "BDSP",
  "LA",
] as const;

const GEN7_HEADER = [
  "#",
  "Name",
  "Type",
  "Category",
  "PP",
  "Power",
  "Accuracy",
  "SM",
  "USUM",
  "PE",
] as const;

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  mdash: "—",
  ndash: "–",
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

function headerText(html: string): string {
  const text = visibleText(html);
  const aliases: Record<string, string> = {
    "Sw Sh": "SwSh",
    "BD SP": "BDSP",
    "S M": "SM",
    "US UM": "USUM",
    "P E": "PE",
  };
  return aliases[text] ?? text;
}

function canonicalizeSourceName(name: string, label: string): string {
  const key = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/,(?=\d)/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!key) throw new Error(`unable to canonicalize ${label} ${JSON.stringify(name)}`);
  return key;
}

function requireCanonicalSource(
  source: BulbapediaHistoricalHtmlSource,
  generation: 8 | 7,
  canonicalUrl: string,
): void {
  let actual: URL;
  try {
    actual = new URL(source.url);
  } catch {
    throw new Error(`invalid Bulbapedia source URL: ${source.url}`);
  }
  const expected = new URL(canonicalUrl);
  if (
    actual.protocol !== expected.protocol ||
    actual.hostname !== expected.hostname ||
    decodeURIComponent(actual.pathname) !== decodeURIComponent(expected.pathname) ||
    actual.search !== "" ||
    actual.hash !== ""
  ) {
    throw new Error(`unexpected Bulbapedia Generation ${generation} move-list URL: ${source.url}`);
  }
  if (!source.sourceRecordId.trim()) {
    throw new Error(`Bulbapedia Generation ${generation} move-list sourceRecordId is required`);
  }
}

function headerCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((match) =>
    headerText(match[1]),
  );
}

function dataCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
}

function tableCandidates(html: string): string[] {
  return [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)]
    .map((match) => match[0])
    .filter((table) => {
      const headers = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((match) =>
        headerText(match[1]),
      );
      return ["#", "Name", "Type", "Category", "PP", "Power", "Accuracy"].every((header) =>
        headers.includes(header),
      );
    });
}

function validateHeaderLayout(
  tableHtml: string,
  generation: 8 | 7,
  expectedHeader: readonly string[],
): void {
  const headerRows = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => headerCells(match[1]))
    .filter((cells) => cells.length > 0);
  if (
    headerRows.length !== 1 ||
    headerRows[0].length !== expectedHeader.length ||
    expectedHeader.some((cell, index) => headerRows[0][index] !== cell)
  ) {
    throw new Error(
      `Bulbapedia Generation ${generation} move list: unexpected table header layout ${JSON.stringify(headerRows)}`,
    );
  }
}

function exactInteger(text: string, label: string, minimum: number): number {
  const normalized = text.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label}: expected exact integer, got ${JSON.stringify(text)}`);
  }
  const value = Number(normalized);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label}: integer outside accepted domain`);
  }
  return value;
}

function nullableInteger(cellHtml: string, label: string, minimum: number): number | null {
  const text = visibleText(cellHtml);
  if (text === "—") return null;
  return exactInteger(text, label, minimum);
}

function nullableAccuracyPercent(
  cellHtml: string,
  label: string,
  generation: 8 | 7,
  availability: readonly HistoricalMoveAvailability[],
): number | null {
  const text = visibleText(cellHtml);
  if (text === "—") return null;
  const match = /^(\d+)%$/.exec(text);
  if (match) return exactInteger(match[1], label, 1);

  // Generation VIII encodes Legends: Arceus-only accuracy as a bare integer.
  // Those rows can establish LA availability but can never supply a traditional fallback snapshot.
  if (
    generation === 8 &&
    /^\d+$/.test(text) &&
    availability[0] === "unusable" &&
    availability[1] === "unusable" &&
    availability[2] === "usable"
  ) {
    return exactInteger(text, label, 1);
  }

  throw new Error(`${label}: expected exact percentage or source dash, got ${JSON.stringify(text)}`);
}

function sourceNameFromCell(cellHtml: string, generation: 8 | 7, index: number): string {
  const moveLinks = [...cellHtml.matchAll(
    /<a\b[^>]*href=["']\/wiki\/[^"'#?]+_\(move\)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )];
  if (moveLinks.length !== 1) {
    throw new Error(
      `Bulbapedia Generation ${generation} move index ${index}: expected exactly one structured Move link`,
    );
  }
  const sourceName = visibleText(moveLinks[0][1]);
  if (!sourceName) {
    throw new Error(`Bulbapedia Generation ${generation} move index ${index}: move name is empty`);
  }
  if (visibleText(cellHtml) !== sourceName) {
    throw new Error(
      `Bulbapedia Generation ${generation} move index ${index}: ambiguous Move name cell ${JSON.stringify(visibleText(cellHtml))}`,
    );
  }
  return sourceName;
}

function typeSourceKeyFromCell(cellHtml: string, moveName: string): string {
  const typeLinks = [...cellHtml.matchAll(
    /<a\b[^>]*href=["']\/wiki\/([^"'#?]+)_\(type\)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )];
  if (typeLinks.length !== 1) {
    throw new Error(`${moveName} Type: expected exactly one structured Type link`);
  }
  let pathName: string;
  try {
    pathName = decodeURIComponent(decodeHtml(typeLinks[0][1])).replace(/_/g, " ");
  } catch {
    throw new Error(`${moveName} Type: invalid structured Type link`);
  }
  const pathKey = canonicalizeSourceName(pathName, `${moveName} Type link`);
  const displayText = visibleText(typeLinks[0][2]);
  const displayKey = canonicalizeSourceName(displayText, `${moveName} Type label`);
  if (pathKey !== displayKey || visibleText(cellHtml) !== displayText) {
    throw new Error(`${moveName} Type: structured link and displayed Type disagree`);
  }
  return pathKey;
}

function parseCategory(cellHtml: string, moveName: string): HistoricalMoveFacts["category"] {
  const category = visibleText(cellHtml).toLowerCase();
  if (category !== "physical" && category !== "special" && category !== "status") {
    throw new Error(`${moveName} Category: unknown source value ${JSON.stringify(category)}`);
  }
  return category;
}

function parseAvailability(cellHtml: string, label: string): HistoricalMoveAvailability {
  const text = visibleText(cellHtml);
  if (text === "") return "unusable";
  const markers = text.match(/[✓✔✗✘✕×]/g) ?? [];
  if (markers.length !== 1) {
    throw new Error(`${label}: unknown availability marker ${JSON.stringify(text)}`);
  }
  const annotation = text.replace(markers[0], "").replace(/\s+/g, "");
  if (annotation !== "" && annotation !== "*") {
    throw new Error(`${label}: unsupported availability annotation ${JSON.stringify(text)}`);
  }
  const marker = markers[0];
  if (marker === "✓" || marker === "✔") return "usable";
  if (marker === "✗" || marker === "✘" || marker === "✕" || marker === "×") {
    return "unusable";
  }
  throw new Error(`${label}: unknown availability marker ${JSON.stringify(text)}`);
}

interface ParsedHistoricalRow extends HistoricalMoveFacts {
  availability: [HistoricalMoveAvailability, HistoricalMoveAvailability, HistoricalMoveAvailability];
}

function parseHistoricalRows(
  source: BulbapediaHistoricalHtmlSource,
  generation: 8 | 7,
  canonicalUrl: string,
  expectedHeader: readonly string[],
): ParsedHistoricalRow[] {
  requireCanonicalSource(source, generation, canonicalUrl);
  const tables = tableCandidates(source.html);
  if (tables.length !== 1) {
    throw new Error(
      `Bulbapedia Generation ${generation} move list: expected exactly one structured availability table, found ${tables.length}`,
    );
  }
  validateHeaderLayout(tables[0], generation, expectedHeader);

  const rows: ParsedHistoricalRow[] = [];
  const seenIndexes = new Set<number>();

  for (const rowMatch of tables[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = dataCells(rowMatch[1]);
    if (cells.length === 0) continue;
    if (cells.length !== expectedHeader.length) {
      throw new Error(
        `Bulbapedia Generation ${generation} move list: data row has ${cells.length} cells; expected ${expectedHeader.length}`,
      );
    }

    const index = exactInteger(
      visibleText(cells[0]),
      `Bulbapedia Generation ${generation} move index`,
      1,
    );
    if (seenIndexes.has(index)) {
      throw new Error(`Bulbapedia Generation ${generation} move list: duplicate move index ${index}`);
    }
    seenIndexes.add(index);

    const ppText = visibleText(cells[4]);
    // Explicit no-PP rows are battle-mechanic entries, not standalone learnable Moves.
    if (ppText === "—") continue;

    const sourceName = sourceNameFromCell(cells[1], generation, index);
    const sourceKey = canonicalizeSourceName(sourceName, "Bulbapedia move name");
    const availability: [
      HistoricalMoveAvailability,
      HistoricalMoveAvailability,
      HistoricalMoveAvailability,
    ] = [
      parseAvailability(cells[7], `${sourceName} ${expectedHeader[7]} availability`),
      parseAvailability(cells[8], `${sourceName} ${expectedHeader[8]} availability`),
      parseAvailability(cells[9], `${sourceName} ${expectedHeader[9]} availability`),
    ];

    rows.push({
      index,
      sourceName,
      sourceKey,
      typeSourceKey: typeSourceKeyFromCell(cells[2], sourceName),
      category: parseCategory(cells[3], sourceName),
      basePp: exactInteger(ppText, `${sourceName} PP`, 1),
      power: nullableInteger(cells[5], `${sourceName} Power`, 0),
      accuracy: nullableAccuracyPercent(cells[6], `${sourceName} Accuracy`, generation, availability),
      availability,
      sourceRecordId: source.sourceRecordId,
    });
  }

  if (rows.length === 0) {
    throw new Error(`Bulbapedia Generation ${generation} move list: no Moves were extracted`);
  }
  return rows;
}

export function parseBulbapediaGen8Moves(
  source: BulbapediaHistoricalHtmlSource,
): ExtractedBulbapediaGen8Move[] {
  return parseHistoricalRows(source, 8, BULBAPEDIA_GEN8_MOVE_LIST_URL, GEN8_HEADER).map(
    ({ availability, ...facts }) => ({
      ...facts,
      swordShieldAvailability: availability[0],
      bdspAvailability: availability[1],
      legendsArceusAvailability: availability[2],
    }),
  );
}

export function parseBulbapediaGen7Moves(
  source: BulbapediaHistoricalHtmlSource,
): ExtractedBulbapediaGen7Move[] {
  return parseHistoricalRows(source, 7, BULBAPEDIA_GEN7_MOVE_LIST_URL, GEN7_HEADER).map(
    ({ availability, ...facts }) => ({
      ...facts,
      sunMoonAvailability: availability[0],
      ultraSunUltraMoonAvailability: availability[1],
      letsGoPikachuEeveeAvailability: availability[2],
    }),
  );
}

export function selectLatestTraditionalMoveAvailability(
  generation8: ExtractedBulbapediaGen8Move | null | undefined,
  generation7: ExtractedBulbapediaGen7Move | null | undefined,
): LatestTraditionalMoveAvailability | null {
  if (generation8 && generation7 && generation8.sourceKey !== generation7.sourceKey) {
    throw new Error(
      `historical Move fallback sourceKey mismatch: ${generation8.sourceKey} vs ${generation7.sourceKey}`,
    );
  }
  if (generation8?.bdspAvailability === "usable") {
    return {
      generation: 8,
      game: "brilliant-diamond-shining-pearl",
      sourceKey: generation8.sourceKey,
      sourceRecordId: generation8.sourceRecordId,
    };
  }
  if (generation8?.swordShieldAvailability === "usable") {
    return {
      generation: 8,
      game: "sword-shield",
      sourceKey: generation8.sourceKey,
      sourceRecordId: generation8.sourceRecordId,
    };
  }
  if (generation7?.ultraSunUltraMoonAvailability === "usable") {
    return {
      generation: 7,
      game: "ultra-sun-ultra-moon",
      sourceKey: generation7.sourceKey,
      sourceRecordId: generation7.sourceRecordId,
    };
  }
  if (generation7?.sunMoonAvailability === "usable") {
    return {
      generation: 7,
      game: "sun-moon",
      sourceKey: generation7.sourceKey,
      sourceRecordId: generation7.sourceRecordId,
    };
  }
  return null;
}
