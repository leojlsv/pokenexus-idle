export const BULBAPEDIA_HISTORICAL_SCALAR_PROOF_PARSER_VERSION =
  "bulbapedia-historical-scalar-proof-v1" as const;

export const BULBAPEDIA_BDSP_TRADITIONAL_CUTOFF = "2022-01-27T23:59:59Z" as const;
export const BULBAPEDIA_SWSH_TRADITIONAL_CUTOFF = "2021-11-18T23:59:59Z" as const;
export const BULBAPEDIA_USUM_TRADITIONAL_CUTOFF = "2018-11-15T23:59:59Z" as const;
export const BULBAPEDIA_SM_TRADITIONAL_CUTOFF = "2017-11-16T23:59:59Z" as const;

export type HistoricalScalarSelectedGame =
  | "brilliant-diamond-shining-pearl"
  | "sword-shield"
  | "ultra-sun-ultra-moon"
  | "sun-moon";

export interface BulbapediaHistoricalScalarProofSource {
  url: string;
  sourceRecordId: string;
  json?: unknown;
  text?: string;
}

export interface ExtractedBulbapediaHistoricalScalarProof {
  sourceName: string;
  sourceKey: string;
  selectedGame: HistoricalScalarSelectedGame;
  typeSourceKey: string;
  category: "physical" | "special" | "status";
  basePp: number;
  power: number | null;
  accuracy: number | null;
  sourceRecordId: string;
}

const API_BASE = "https://bulbapedia.bulbagarden.net/w/api.php";

const GAME_ABBREVIATION: Record<HistoricalScalarSelectedGame, "BDSP" | "SwSh" | "USUM" | "SM"> = {
  "brilliant-diamond-shining-pearl": "BDSP",
  "sword-shield": "SwSh",
  "ultra-sun-ultra-moon": "USUM",
  "sun-moon": "SM",
};

function cutoffForGame(selectedGame: HistoricalScalarSelectedGame): string {
  switch (selectedGame) {
    case "brilliant-diamond-shining-pearl":
      return BULBAPEDIA_BDSP_TRADITIONAL_CUTOFF;
    case "sword-shield":
      return BULBAPEDIA_SWSH_TRADITIONAL_CUTOFF;
    case "ultra-sun-ultra-moon":
      return BULBAPEDIA_USUM_TRADITIONAL_CUTOFF;
    case "sun-moon":
      return BULBAPEDIA_SM_TRADITIONAL_CUTOFF;
  }
}

function requireSourceName(sourceName: string): string {
  const normalized = sourceName.normalize("NFC").trim();
  if (!normalized) throw new Error("Bulbapedia historical scalar proof sourceName is required");
  return normalized;
}

export function buildBulbapediaHistoricalScalarProofUrl(
  sourceName: string,
  selectedGame: HistoricalScalarSelectedGame,
): string {
  const normalizedSourceName = requireSourceName(sourceName);
  const title = `${normalizedSourceName} (move)`;
  const cutoff = cutoffForGame(selectedGame);
  return (
    `${API_BASE}?action=query&format=json&formatversion=2&prop=revisions` +
    `&titles=${encodeURIComponent(title)}` +
    `&rvprop=ids%7Ctimestamp%7Ccontent&rvslots=main&rvlimit=1` +
    `&rvstart=${encodeURIComponent(cutoff)}&rvdir=older`
  );
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label}: expected object`);
  }
  return value as Record<string, unknown>;
}

function parsePayload(source: BulbapediaHistoricalScalarProofSource): Record<string, unknown> {
  const hasJson = source.json !== undefined;
  const hasText = source.text !== undefined;
  if (hasJson === hasText) {
    throw new Error("Bulbapedia historical scalar proof requires exactly one of json or text");
  }
  if (hasText) {
    if (typeof source.text !== "string" || !source.text.trim()) {
      throw new Error("Bulbapedia historical scalar proof text payload must be non-empty JSON");
    }
    try {
      return asRecord(JSON.parse(source.text), "Bulbapedia historical scalar proof response");
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error("Bulbapedia historical scalar proof response contains malformed JSON");
      }
      throw error;
    }
  }
  return asRecord(source.json, "Bulbapedia historical scalar proof response");
}

interface HistoricalRevision {
  timestamp: string;
  content: string;
}

function parseHistoricalRevision(
  payload: Record<string, unknown>,
  expectedTitle: string,
  cutoff: string,
): HistoricalRevision {
  const query = asRecord(payload.query, "Bulbapedia historical scalar proof query");
  if (!Array.isArray(query.pages) || query.pages.length !== 1) {
    throw new Error("Bulbapedia historical scalar proof response must contain exactly one page");
  }
  const page = asRecord(query.pages[0], "Bulbapedia historical scalar proof page");
  if (page.title !== expectedTitle) {
    throw new Error(
      `Bulbapedia historical scalar proof title mismatch: expected ${JSON.stringify(expectedTitle)}, got ${JSON.stringify(page.title)}`,
    );
  }
  if (!Number.isSafeInteger(page.pageid) || (page.pageid as number) < 1 || page.ns !== 0) {
    throw new Error("Bulbapedia historical scalar proof page metadata is malformed");
  }
  if (!Array.isArray(page.revisions) || page.revisions.length !== 1) {
    throw new Error("Bulbapedia historical scalar proof response must contain exactly one revision");
  }
  const revision = asRecord(page.revisions[0], "Bulbapedia historical scalar proof revision");
  if (!Number.isSafeInteger(revision.revid) || (revision.revid as number) < 1) {
    throw new Error("Bulbapedia historical scalar proof revision id is malformed");
  }
  if (!Number.isSafeInteger(revision.parentid) || (revision.parentid as number) < 0) {
    throw new Error("Bulbapedia historical scalar proof parent revision id is malformed");
  }
  if (typeof revision.timestamp !== "string") {
    throw new Error("Bulbapedia historical scalar proof revision timestamp is missing");
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(revision.timestamp)) {
    throw new Error("Bulbapedia historical scalar proof revision timestamp is malformed");
  }
  const timestampDate = new Date(revision.timestamp);
  if (Number.isNaN(timestampDate.valueOf())) {
    throw new Error("Bulbapedia historical scalar proof revision timestamp is malformed");
  }
  if (timestampDate.valueOf() > new Date(cutoff).valueOf()) {
    throw new Error(
      `Bulbapedia historical scalar proof revision timestamp ${revision.timestamp} exceeds cutoff ${cutoff}`,
    );
  }
  const slots = asRecord(revision.slots, "Bulbapedia historical scalar proof revision slots");
  const main = asRecord(slots.main, "Bulbapedia historical scalar proof main slot");
  if (typeof main.content !== "string") {
    throw new Error("Bulbapedia historical scalar proof main slot content must be a string");
  }
  return { timestamp: revision.timestamp, content: main.content };
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

interface BalancedTemplate {
  text: string;
  start: number;
  end: number;
}

function extractBalancedTemplate(text: string, start: number, label: string): BalancedTemplate {
  if (text.slice(start, start + 2) !== "{{") {
    throw new Error(`${label}: template does not start with {{`);
  }
  let depth = 0;
  for (let index = start; index < text.length - 1; index += 1) {
    const pair = text.slice(index, index + 2);
    if (pair === "{{") {
      depth += 1;
      index += 1;
      continue;
    }
    if (pair === "}}") {
      depth -= 1;
      index += 1;
      if (depth === 0) {
        const end = index + 1;
        return { text: text.slice(start, end), start, end };
      }
      if (depth < 0) break;
    }
  }
  throw new Error(`${label}: unbalanced template braces`);
}

function findMoveInfobox(wikitext: string): string {
  const matches = [...wikitext.matchAll(/\{\{\s*MoveInfobox\b/gi)];
  if (matches.length !== 1) {
    throw new Error(
      `Bulbapedia historical scalar proof requires exactly one MoveInfobox; found ${matches.length}`,
    );
  }
  const start = matches[0].index;
  if (start === undefined) throw new Error("Bulbapedia historical scalar proof MoveInfobox index is missing");
  return extractBalancedTemplate(wikitext, start, "Bulbapedia MoveInfobox").text;
}

function stripComments(value: string, label: string): string {
  const withoutComments = value.replace(/<!--[\s\S]*?-->/g, "");
  if (/<!--|-->/u.test(withoutComments)) {
    throw new Error(`${label}: malformed HTML comment`);
  }
  return withoutComments;
}

function splitTopLevel(value: string, delimiter: "|" | "="): string[] {
  const parts: string[] = [];
  let templateDepth = 0;
  let linkDepth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const pair = value.slice(index, index + 2);
    if (pair === "{{") {
      templateDepth += 1;
      index += 1;
      continue;
    }
    if (pair === "}}") {
      templateDepth -= 1;
      if (templateDepth < 0) throw new Error("Bulbapedia template structure is unbalanced");
      index += 1;
      continue;
    }
    if (pair === "[[") {
      linkDepth += 1;
      index += 1;
      continue;
    }
    if (pair === "]]" && linkDepth > 0) {
      linkDepth -= 1;
      index += 1;
      continue;
    }
    if (value[index] === delimiter && templateDepth === 0 && linkDepth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  if (templateDepth !== 0 || linkDepth !== 0) {
    throw new Error("Bulbapedia template/link structure is unbalanced");
  }
  parts.push(value.slice(start));
  return parts;
}

function parseInfoboxFields(infobox: string): Map<string, string[]> {
  const inner = stripComments(infobox.slice(2, -2), "Bulbapedia MoveInfobox");
  const segments = splitTopLevel(inner, "|");
  if (segments.shift()?.trim().toLowerCase() !== "moveinfobox") {
    throw new Error("Bulbapedia historical scalar proof contains malformed MoveInfobox name");
  }
  const fields = new Map<string, string[]>();
  for (const segment of segments) {
    if (!segment.trim()) continue;
    const equals = splitTopLevel(segment, "=");
    if (equals.length < 2) {
      throw new Error(`Bulbapedia MoveInfobox contains malformed parameter ${JSON.stringify(segment.trim())}`);
    }
    const key = equals.shift()!.trim().toLowerCase();
    const value = equals.join("=").trim();
    if (!key) throw new Error("Bulbapedia MoveInfobox contains an empty parameter name");
    const values = fields.get(key) ?? [];
    values.push(value);
    fields.set(key, values);
  }
  return fields;
}

function requiredField(fields: Map<string, string[]>, key: string): string {
  const values = fields.get(key) ?? [];
  if (values.length !== 1) {
    throw new Error(`Bulbapedia MoveInfobox field ${key} must appear exactly once; found ${values.length}`);
  }
  return values[0];
}

function parseTtVisible(value: string, label: string): string {
  const trimmed = stripComments(value, label).trim();
  if (!trimmed.includes("{{") && !trimmed.includes("}}")) return trimmed;
  if (!trimmed.startsWith("{{")) {
    throw new Error(`${label}: unknown nested template structure`);
  }
  const template = extractBalancedTemplate(trimmed, 0, label);
  if (template.end !== trimmed.length) {
    throw new Error(`${label}: nested template must occupy the entire field value`);
  }
  const inner = template.text.slice(2, -2);
  const parts = splitTopLevel(inner, "|");
  const templateName = parts.shift()?.trim().toLowerCase();
  if (templateName !== "tt") {
    throw new Error(`${label}: unknown nested template ${JSON.stringify(templateName)}`);
  }
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
    throw new Error(`${label}: tt template must contain visible and annotation arguments`);
  }
  if (parts[0].includes("{{") || parts[0].includes("}}") || parts[1].includes("{{") || parts[1].includes("}}")) {
    throw new Error(`${label}: nested templates inside tt arguments are not supported`);
  }
  const annotation = parts[1].trim();
  if (
    /\b(?:BDSP|SwSh|USUM|SM)\b/u.test(annotation) ||
    /\b(?:Brilliant Diamond|Shining Pearl|Sword and Shield|Ultra Sun|Ultra Moon|Sun and Moon)\b/iu.test(
      annotation,
    )
  ) {
    throw new Error(
      `${label}: tt annotation contains game-specific scalar evidence and is ambiguous for selected-game proof`,
    );
  }
  return parts[0].trim();
}

function exactInteger(value: string, label: string, minimum: number): number {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${label}: expected exact integer, got ${JSON.stringify(value)}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${label}: integer outside accepted domain`);
  }
  return parsed;
}

function nullableScalar(value: string, label: string): number | null {
  const visible = parseTtVisible(value, label);
  if (visible === "—") return null;
  return exactInteger(visible, label, 0);
}

function parseCategory(value: string): "physical" | "special" | "status" {
  const visible = parseTtVisible(value, "MoveInfobox damagecategory").toLowerCase();
  if (visible !== "physical" && visible !== "special" && visible !== "status") {
    throw new Error(`MoveInfobox damagecategory: unknown value ${JSON.stringify(visible)}`);
  }
  return visible;
}

function gameEvidencePresent(
  wikitext: string,
  selectedGame: HistoricalScalarSelectedGame,
): boolean {
  const expected = GAME_ABBREVIATION[selectedGame];
  const expectedGeneration =
    selectedGame === "brilliant-diamond-shining-pearl" || selectedGame === "sword-shield"
      ? "8"
      : "7";
  const tokens =
    expectedGeneration === "8"
      ? (["SwSh", "BDSP", "LA"] as const)
      : (["USUM", "SM", "PE"] as const);

  const parseBundle = (raw: string): Set<string> | null => {
    let remainder = raw.trim();
    const parsed = new Set<string>();
    while (remainder.length > 0) {
      const token = tokens.find((candidate) => remainder.startsWith(candidate));
      if (!token) return null;
      if (parsed.has(token)) return null;
      parsed.add(token);
      remainder = remainder.slice(token.length);
    }
    return parsed;
  };

  const movedescMatches = [...wikitext.matchAll(/\{\{\s*movedescentry\b/gi)];
  for (const match of movedescMatches) {
    if (match.index === undefined) continue;
    const template = extractBalancedTemplate(wikitext, match.index, "Bulbapedia movedescentry").text;
    const abbreviationPattern = /\{\{\s*gameabbrev(7|8)\s*\|\s*([^{}|]+?)\s*}}/gi;
    for (const abbreviation of template.matchAll(abbreviationPattern)) {
      if (abbreviation[1] !== expectedGeneration) continue;
      const parsed = parseBundle(abbreviation[2]);
      if (parsed?.has(expected)) return true;
    }
  }
  return false;
}

export function parseBulbapediaHistoricalScalarProof(
  source: BulbapediaHistoricalScalarProofSource,
  expectedSourceName: string,
  selectedGame: HistoricalScalarSelectedGame,
): ExtractedBulbapediaHistoricalScalarProof {
  const sourceName = requireSourceName(expectedSourceName);
  if (!source.sourceRecordId.trim()) {
    throw new Error("Bulbapedia historical scalar proof sourceRecordId is required");
  }
  const expectedUrl = buildBulbapediaHistoricalScalarProofUrl(sourceName, selectedGame);
  if (source.url !== expectedUrl) {
    throw new Error(
      `unexpected Bulbapedia historical scalar proof URL: expected ${expectedUrl}, got ${source.url}`,
    );
  }

  const cutoff = cutoffForGame(selectedGame);
  const expectedTitle = `${sourceName} (move)`;
  const revision = parseHistoricalRevision(parsePayload(source), expectedTitle, cutoff);
  if (!gameEvidencePresent(revision.content, selectedGame)) {
    throw new Error(
      `Bulbapedia historical scalar proof lacks movedescentry game-abbrev evidence for ${GAME_ABBREVIATION[selectedGame]}`,
    );
  }

  const fields = parseInfoboxFields(findMoveInfobox(revision.content));
  const parsedName = parseTtVisible(requiredField(fields, "name"), "MoveInfobox name");
  if (parsedName.normalize("NFC") !== sourceName.normalize("NFC")) {
    throw new Error(
      `Bulbapedia historical scalar proof MoveInfobox name mismatch: expected ${JSON.stringify(sourceName)}, got ${JSON.stringify(parsedName)}`,
    );
  }
  const parsedType = parseTtVisible(requiredField(fields, "type"), "MoveInfobox type");
  const basePp = exactInteger(
    parseTtVisible(requiredField(fields, "basepp"), "MoveInfobox basepp"),
    "MoveInfobox basepp",
    1,
  );

  return {
    sourceName: parsedName,
    sourceKey: canonicalizeSourceName(parsedName, "Bulbapedia Move name"),
    selectedGame,
    typeSourceKey: canonicalizeSourceName(parsedType, "Bulbapedia Type name"),
    category: parseCategory(requiredField(fields, "damagecategory")),
    basePp,
    power: nullableScalar(requiredField(fields, "power"), "MoveInfobox power"),
    accuracy: nullableScalar(requiredField(fields, "accuracy"), "MoveInfobox accuracy"),
    sourceRecordId: source.sourceRecordId,
  };
}
