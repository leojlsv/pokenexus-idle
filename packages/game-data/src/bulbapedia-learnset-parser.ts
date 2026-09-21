import type { ExtractedPokemonDbLearnsetEntry } from "./pokemondb-parser.js";

export const BULBAPEDIA_GEN9_LEARNSET_PARSER_VERSION =
  "bulbapedia-gen9-learnset-v1" as const;
export const BULBAPEDIA_GEN8_LEARNSET_PARSER_VERSION =
  "bulbapedia-gen8-learnset-v6" as const;

export interface BulbapediaLearnsetHtmlSource {
  url: string;
  sourceRecordId: string;
  html: string;
}

export interface ExtractedBulbapediaLearnset {
  sourceSpeciesKey: string;
  discoveredSourceKeys: string[];
  records: ExtractedPokemonDbLearnsetEntry[];
  moveFacts: ExtractedBulbapediaLearnsetMoveFacts[];
}

export interface ExtractedBulbapediaLearnsetMoveFacts {
  moveSourceKey: string;
  typeSourceKey: string;
  category: "physical" | "special" | "status";
  basePp: number;
  power: number | null;
  accuracy: number | null;
  sourceGeneration: 8 | 9;
  sourceGame: "Brilliant Diamond/Shining Pearl" | "Scarlet/Violet";
  sourceRecordId: string;
}

type SupportedMethod = "level-up" | "evolution" | "machine" | "egg" | "tutor";

interface DiscoveredLearnsetRow {
  speciesSourceKey: string;
  moveSourceKey: string;
  typeSourceKey?: string;
  category?: "physical" | "special" | "status";
  basePp?: number;
  power?: number | null;
  accuracy?: number | null;
  sourceGeneration: 8 | 9;
  sourceGame: "Brilliant Diamond/Shining Pearl" | "Scarlet/Violet";
  method: SupportedMethod;
  level: number | null;
  machineIdentifier: string | null;
}

interface LearnsetParserConfig {
  generation: 8 | 9;
  generationLabel: "Generation VIII" | "Generation IX";
  pathGeneration: "VIII" | "IX";
  sourceGame: "Brilliant Diamond/Shining Pearl" | "Scarlet/Violet";
}

const GEN9_CONFIG: LearnsetParserConfig = {
  generation: 9,
  generationLabel: "Generation IX",
  pathGeneration: "IX",
  sourceGame: "Scarlet/Violet",
};

const GEN8_BDSP_CONFIG: LearnsetParserConfig = {
  generation: 8,
  generationLabel: "Generation VIII",
  pathGeneration: "VIII",
  sourceGame: "Brilliant Diamond/Shining Pearl",
};

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
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

function visibleValueText(html: string): string {
  return visibleText(
    html.replace(
      /<span\b[^>]*style=["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/span>/gi,
      " ",
    ),
  );
}

export function canonicalizeBulbapediaLearnsetSpeciesName(name: string): string {
  return canonicalizeSourceName(name, "Bulbapedia learnset Species");
}

function canonicalizeSourceName(name: string, label: string): string {
  const key = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/♂/g, " male ")
    .replace(/♀/g, " female ")
    .replace(/[’']/g, "")
    .replace(/,(?=\d)/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!key) throw new Error(`unable to canonicalize ${label} ${JSON.stringify(name)}`);
  return key;
}

function requireCanonicalSource(
  source: BulbapediaLearnsetHtmlSource,
  config: LearnsetParserConfig,
): string {
  let url: URL;
  try {
    url = new URL(source.url);
  } catch {
    throw new Error(`invalid Bulbapedia source URL: ${source.url}`);
  }
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    throw new Error(`invalid Bulbapedia ${config.generationLabel} learnset URL: ${source.url}`);
  }
  const pathMatch = new RegExp(
    `^/wiki/([^/]+)_\\(Pokémon\\)/Generation_${config.pathGeneration}_learnset$`,
    "u",
  ).exec(decodedPath);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "bulbapedia.bulbagarden.net" ||
    !pathMatch ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`unexpected Bulbapedia ${config.generationLabel} learnset URL: ${source.url}`);
  }
  if (!source.sourceRecordId.trim()) {
    throw new Error(`Bulbapedia ${config.generationLabel} learnset sourceRecordId is required`);
  }
  return canonicalizeBulbapediaLearnsetSpeciesName(pathMatch[1].replace(/_/g, " "));
}

function requireScarletVioletAvailability(html: string): void {
  const candidates = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].filter(
    (match) =>
      /href=["']\/wiki\/Pok%C3%A9mon_Scarlet_and_Violet["']/i.test(match[1]) &&
      /\b(?:is|are) available in Scarlet and Violet(?: Version [0-9.]+\+?)?\./u.test(
        visibleText(match[1]),
      ),
  );
  if (candidates.length !== 1) {
    throw new Error(
      "Bulbapedia Generation IX learnset: explicit Scarlet/Violet availability sentence is required",
    );
  }
}

function requireBdspAvailability(html: string): void {
  const candidates = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].filter(
    (match) =>
      /href=["']\/wiki\/Pok%C3%A9mon_Brilliant_Diamond_and_Shining_Pearl["']/i.test(match[1]) &&
      /\bis available in\b.*\bBrilliant Diamond and Shining Pearl\b/u.test(visibleText(match[1])),
  );
  if (candidates.length !== 1) {
    throw new Error(
      "Bulbapedia Generation VIII learnset: explicit Brilliant Diamond/Shining Pearl availability sentence is required",
    );
  }
}

function requireGameAvailability(html: string, config: LearnsetParserConfig): void {
  if (config.generation === 9) {
    requireScarletVioletAvailability(html);
    return;
  }
  requireBdspAvailability(html);
}

function h4Id(attributes: string, body: string): string | null {
  for (const span of body.matchAll(/<span\b([^>]*)>/gi)) {
    if (!/\bclass=["'][^"']*\bmw-headline\b[^"']*["']/i.test(span[1])) continue;
    const headlineId = /\bid=["']([^"']+)["']/i.exec(span[1])?.[1];
    if (headlineId) return decodeHtml(headlineId);
  }
  const ownId = /\bid=["']([^"']+)["']/i.exec(attributes)?.[1];
  if (ownId) return decodeHtml(ownId);
  const nestedId = /\bid=["']([^"']+)["']/i.exec(body)?.[1];
  return nestedId ? decodeHtml(nestedId) : null;
}

function sectionHasMoveLink(html: string): boolean {
  return /href=["']\/wiki\/[^"'#?]+_\(move\)["']/i.test(html);
}

function tables(html: string): string[] {
  return [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map((match) => match[0]);
}

function rows(tableHtml: string): string[] {
  return [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
}

function headerCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((match) =>
    visibleText(match[1]),
  );
}

function headerCellHtml(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((match) => match[1]);
}

function dataCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
}

function uniqueHeaderIndex(
  headers: string[],
  label: string,
  sectionId: string,
  config: LearnsetParserConfig,
): number {
  const indexes = headers
    .map((header, index) => (header === label ? index : -1))
    .filter((index) => index >= 0);
  if (indexes.length !== 1) {
    throw new Error(
      `Bulbapedia ${config.generationLabel} learnset ${sectionId}: expected exactly one ${label} column`,
    );
  }
  return indexes[0];
}

function exactInteger(text: string, label: string): number {
  const normalized = text.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label}: expected exact positive integer, got ${JSON.stringify(text)}`);
  }
  const value = Number(normalized);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label}: integer outside accepted domain`);
  }
  return value;
}

function exactNonNegativeInteger(text: string, label: string): number {
  const normalized = text.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label}: expected exact non-negative integer, got ${JSON.stringify(text)}`);
  }
  const value = Number(normalized);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label}: integer outside accepted domain`);
  }
  return value;
}

function nullablePower(cellHtml: string, label: string): number | null {
  const value = visibleValueText(cellHtml);
  if (value === "—") return null;
  return exactNonNegativeInteger(value, label);
}

function nullableAccuracy(cellHtml: string, label: string): number | null {
  const value = visibleValueText(cellHtml);
  if (value === "—" || value === "—%") return null;
  const match = /^(\d+)%$/u.exec(value);
  if (!match) {
    throw new Error(`${label}: expected exact percentage or source dash, got ${JSON.stringify(value)}`);
  }
  return exactInteger(match[1], label);
}

function moveTypeSourceKey(cellHtml: string, label: string): string {
  const links = [...cellHtml.matchAll(
    /<a\b[^>]*href=["']\/wiki\/([^"'#?]+)_\(type\)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )];
  if (links.length !== 1) {
    throw new Error(`${label}: expected exactly one structured Type link`);
  }
  let pathName: string;
  try {
    pathName = decodeURIComponent(decodeHtml(links[0][1])).replace(/_/g, " ");
  } catch {
    throw new Error(`${label}: invalid structured Type link`);
  }
  const pathKey = canonicalizeSourceName(pathName, `${label} link`);
  const labelText = visibleText(links[0][2]);
  const labelKey = canonicalizeSourceName(labelText, `${label} label`);
  if (pathKey !== labelKey || visibleValueText(cellHtml) !== labelText) {
    throw new Error(`${label}: structured Type link and displayed Type disagree`);
  }
  return pathKey;
}

function moveCategory(cellHtml: string, label: string): "physical" | "special" | "status" {
  const value = visibleValueText(cellHtml).toLowerCase();
  if (value !== "physical" && value !== "special" && value !== "status") {
    throw new Error(`${label}: unknown source value ${JSON.stringify(value)}`);
  }
  return value;
}

function uniqueHeaderAliasIndex(
  headers: string[],
  aliases: readonly string[],
  label: string,
  sectionId: string,
  config: LearnsetParserConfig,
): number {
  const indexes = headers
    .map((header, index) => (aliases.includes(header) ? index : -1))
    .filter((index) => index >= 0);
  if (indexes.length !== 1) {
    throw new Error(
      `Bulbapedia ${config.generationLabel} learnset ${sectionId}: expected exactly one ${label} column`,
    );
  }
  return indexes[0];
}

function moveFactsFromCells(
  cells: string[],
  indexes: { type: number; category: number; power: number; accuracy: number; pp: number },
  moveSourceKey: string,
): Pick<
  DiscoveredLearnsetRow,
  "typeSourceKey" | "category" | "basePp" | "power" | "accuracy"
> {
  return {
    typeSourceKey: moveTypeSourceKey(cells[indexes.type], `${moveSourceKey} Type`),
    category: moveCategory(cells[indexes.category], `${moveSourceKey} Category`),
    power: nullablePower(cells[indexes.power], `${moveSourceKey} Power`),
    accuracy: nullableAccuracy(cells[indexes.accuracy], `${moveSourceKey} Accuracy`),
    basePp: exactInteger(visibleValueText(cells[indexes.pp]), `${moveSourceKey} PP`),
  };
}

function moveSourceKey(
  cellHtml: string,
  label: string,
  allowBreedingAnnotation = false,
): string {
  const links = [...cellHtml.matchAll(
    /<a\b[^>]*href=["']\/wiki\/([^"'#?]+)_\(move\)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )];
  if (links.length !== 1) {
    throw new Error(`${label}: expected exactly one structured Move link`);
  }
  const sourceName = visibleText(links[0][2]);
  const cellText = visibleText(cellHtml);
  const suffix = cellText.startsWith(sourceName)
    ? cellText.slice(sourceName.length).replace(/\s+/g, "")
    : null;
  const grandUndergroundQualifier =
    (suffix === "^" || suffix === "^†") &&
    /href=["']\/wiki\/Grand_Underground["']/i.test(cellHtml);
  const acceptedText =
    suffix === "" ||
    (allowBreedingAnnotation &&
      (
        suffix === "*" ||
        suffix === "†" ||
        suffix === "‡" ||
        suffix === "*†" ||
        grandUndergroundQualifier
      ));
  if (!sourceName || !acceptedText) {
    throw new Error(`${label}: ambiguous Move identity cell`);
  }
  return canonicalizeSourceName(sourceName, label);
}

function bdspMoveSourceKey(
  cellHtml: string,
  label: string,
  allowBreedingAnnotation = false,
): string | null {
  const gameLinks = [...cellHtml.matchAll(
    /href=["']\/wiki\/Pok%C3%A9mon_([^"'#?]+)["']/gi,
  )].map((match) => match[1]);
  if (gameLinks.length === 0) {
    return moveSourceKey(cellHtml, label, allowBreedingAnnotation);
  }

  const moveLinks = [...cellHtml.matchAll(
    /<a\b[^>]*href=["']\/wiki\/([^"'#?]+)_\(move\)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )];
  if (moveLinks.length !== 1) {
    throw new Error(`${label}: expected exactly one structured Move link`);
  }
  const sourceName = visibleText(moveLinks[0][2]);
  const cellText = visibleText(cellHtml);
  const suffix = cellText.startsWith(sourceName)
    ? cellText.slice(sourceName.length).replace(/\s+/g, "")
    : null;
  const onlyBdsp =
    gameLinks.length === 1 &&
    gameLinks[0] === "Brilliant_Diamond_and_Shining_Pearl" &&
    suffix === "BDSP";
  if (onlyBdsp) return canonicalizeSourceName(sourceName, label);

  const onlySwSh =
    gameLinks.length === 1 &&
    gameLinks[0] === "Sword_and_Shield" &&
    suffix === "SwSh";
  if (onlySwSh) return null;

  throw new Error(`${label}: unsupported game-scoped Move annotation`);
}

function machineIdentifier(
  cellHtml: string,
  label: string,
  config: LearnsetParserConfig,
): string {
  const identifier = visibleText(cellHtml);
  const expected =
    config.generation === 9
      ? /^TM\d{3}$/u
      : /^TM(?:0[1-9]|[1-9]\d|100)$/u;
  if (!expected.test(identifier)) {
    throw new Error(`${label}: expected exact ${config.generationLabel} TM identifier`);
  }
  return identifier;
}

function sectionMethod(sectionId: string): SupportedMethod | null {
  if (sectionId === "By_leveling_up") return "level-up";
  if (sectionId === "By_TM" || sectionId === "By_TM/TR") return "machine";
  if (sectionId === "By_breeding") return "egg";
  return null;
}

function explicitlyEmptyKnownMethodSection(
  sectionHtml: string,
  method: SupportedMethod,
): boolean {
  const sourceLabel =
    method === "machine"
      ? "TM"
      : method === "egg"
        ? "breeding"
        : method === "tutor"
          ? "tutoring"
          : null;
  if (sourceLabel === null) return false;
  return new RegExp(`This Pokémon learns no moves by ${sourceLabel}\\.`, "u").test(
    visibleText(sectionHtml),
  );
}

function bdspScopedSectionHtml(sectionHtml: string): string {
  const gameMarkers = [...sectionHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .filter((match) =>
      /href=["']\/wiki\/Pok%C3%A9mon_(?:Sword_and_Shield|Brilliant_Diamond_and_Shining_Pearl|Legends(?::|%3A)_Arceus)["']/i.test(
        match[1],
      ),
    )
    .map((match) => ({
      index: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      bdsp: /href=["']\/wiki\/Pok%C3%A9mon_Brilliant_Diamond_and_Shining_Pearl["']/i.test(
        match[1],
      ),
    }));
  if (gameMarkers.length === 0) return sectionHtml;
  const bdsp = gameMarkers.find((marker) => marker.bdsp);
  if (!bdsp) return "";
  const next = gameMarkers.find((marker) => marker.index > bdsp.index);
  return sectionHtml.slice(bdsp.end, next?.index ?? sectionHtml.length);
}

function bdspScopedSectionWithGameHeadings(sectionHtml: string): string {
  const paragraphScoped = bdspScopedSectionHtml(sectionHtml);
  if (!paragraphScoped) return "";
  const paragraphScopeApplied = paragraphScoped !== sectionHtml;

  const headings = [...paragraphScoped.matchAll(/<h5\b[^>]*>([\s\S]*?)<\/h5>/gi)].map((match) => ({
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    label: visibleText(match[1]),
  }));
  const gameHeadings = headings.filter(
    (heading) =>
      heading.label === "Pokémon Sword, Shield, Brilliant Diamond, and Shining Pearl" ||
      heading.label === "Pokémon Legends: Arceus",
  );
  if (gameHeadings.length === 0) return paragraphScoped;
  const combined = headings.filter(
    (heading) =>
      heading.label === "Pokémon Sword, Shield, Brilliant Diamond, and Shining Pearl",
  );
  if (combined.length === 0) {
    if (!paragraphScopeApplied) return "";
    const firstGameHeading = gameHeadings[0];
    if (firstGameHeading.label !== "Pokémon Legends: Arceus") {
      throw new Error(
        `Bulbapedia Generation VIII learnset: unexpected h5 game scope ${JSON.stringify(firstGameHeading.label)}`,
      );
    }
    return paragraphScoped.slice(0, firstGameHeading.index);
  }
  if (combined.length !== 1) {
    throw new Error(
      "Bulbapedia Generation VIII learnset: ambiguous combined Sword/Shield/BDSP h5 scope",
    );
  }
  const start = combined[0];
  const next = headings.find((heading) => heading.index > start.index);
  if (next && next.label !== "Pokémon Legends: Arceus") {
    throw new Error(
      `Bulbapedia Generation VIII learnset: unexpected h5 game scope ${JSON.stringify(next.label)}`,
    );
  }
  return paragraphScoped.slice(start.end, next?.index ?? paragraphScoped.length);
}

function isNonSpeciesH5Label(label: string): boolean {
  return (
    label === "Pokémon Sword, Shield, Brilliant Diamond, and Shining Pearl" ||
    label === "Pokémon Legends: Arceus" ||
    /^By transfer\s*,\s*only via prior Evolution$/u.test(label)
  );
}

function baseSpeciesScopedSectionHtml(
  sectionHtml: string,
  sourceSpeciesKey: string,
  config: LearnsetParserConfig,
): string {
  const headings = [...sectionHtml.matchAll(/<h5\b[^>]*>([\s\S]*?)<\/h5>/gi)].map((match) => ({
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    label: visibleText(match[1]),
  }));
  if (headings.length === 0) return sectionHtml;
  const speciesHeadings = headings.filter((heading) => !isNonSpeciesH5Label(heading.label));
  if (speciesHeadings.length === 0) return sectionHtml;
  const matching = speciesHeadings.filter((heading) => {
    try {
      return canonicalizeSourceName(heading.label, "learnset h5 label") === sourceSpeciesKey;
    } catch {
      return false;
    }
  });
  if (matching.length === 0) {
    throw new Error(
      `Bulbapedia ${config.generationLabel} learnset: form-scoped h5 blocks do not contain base Species ${sourceSpeciesKey}`,
    );
  }
  if (matching.length !== 1) {
    throw new Error(
      `Bulbapedia ${config.generationLabel} learnset: expected exactly one base-Species h5 block for ${sourceSpeciesKey}`,
    );
  }
  const base = matching[0];
  const next = headings.find((heading) => heading.index > base.index);
  return sectionHtml.slice(base.end, next?.index ?? sectionHtml.length);
}

function parseBdspTutorSection(
  sectionHtml: string,
  speciesSourceKey: string,
  config: LearnsetParserConfig,
): DiscoveredLearnsetRow[] {
  const discovered: DiscoveredLearnsetRow[] = [];
  let sawGameScopedRow = false;
  for (const rowHtml of rows(sectionHtml)) {
    const headerHtml = headerCellHtml(rowHtml);
    const headerText = headerHtml.map(visibleText);
    const cells = dataCells(rowHtml);
    if (cells.length === 0 || !sectionHasMoveLink(rowHtml)) continue;
    if (
      headerText.length !== 5 ||
      ["Sw", "Sh", "EP", "BD", "SP"].some((label, index) => headerText[index] !== label) ||
      cells.length !== 6
    ) {
      throw new Error(
        `Bulbapedia ${config.generationLabel} learnset By_tutoring: unexpected game-scoped row layout`,
      );
    }
    sawGameScopedRow = true;
    const bdLinked = /href=["']\/wiki\/Pok%C3%A9mon_Brilliant_Diamond_and_Shining_Pearl["']/i.test(
      headerHtml[3],
    );
    const spLinked = /href=["']\/wiki\/Pok%C3%A9mon_Brilliant_Diamond_and_Shining_Pearl["']/i.test(
      headerHtml[4],
    );
    if (bdLinked !== spLinked) {
      throw new Error(
        `Bulbapedia ${config.generationLabel} learnset By_tutoring: BD/SP applicability disagrees`,
      );
    }
    if (!bdLinked) continue;
    const moveKey = moveSourceKey(cells[0], "By_tutoring Move");
    discovered.push({
      speciesSourceKey,
      moveSourceKey: moveKey,
      ...moveFactsFromCells(
        cells,
        { type: 1, category: 2, power: 3, accuracy: 4, pp: 5 },
        moveKey,
      ),
      sourceGeneration: config.generation,
      sourceGame: config.sourceGame,
      method: "tutor",
      level: null,
      machineIdentifier: null,
    });
  }
  if (!sawGameScopedRow && sectionHasMoveLink(sectionHtml)) {
    throw new Error(
      `Bulbapedia ${config.generationLabel} learnset By_tutoring: no structured game-scoped Move rows found`,
    );
  }
  if (
    !sawGameScopedRow &&
    !sectionHasMoveLink(sectionHtml) &&
    !explicitlyEmptyKnownMethodSection(sectionHtml, "tutor")
  ) {
    throw new Error(
      `Bulbapedia ${config.generationLabel} learnset By_tutoring: empty section lacks explicit source evidence`,
    );
  }
  return discovered;
}

function assertSwShOnlyTransferSection(sectionHtml: string, config: LearnsetParserConfig): void {
  const statements = [...sectionHtml.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].filter(
    (match) =>
      /href=["']\/wiki\/Pok%C3%A9mon_Sword_and_Shield["']/i.test(match[1]) &&
      /Transferred Pokémon only retain these moves in Pokémon Sword and Shield/u.test(
        visibleText(match[1]),
      ),
  );
  if (statements.length !== 1) {
    throw new Error(
      `Bulbapedia ${config.generationLabel} learnset transfer section is not explicitly Sword/Shield-only`,
    );
  }
}

function directTransferSectionHtml(sectionHtml: string, config: LearnsetParserConfig): string {
  const priorEvolutionHeadings = [...sectionHtml.matchAll(/<h5\b[^>]*>([\s\S]*?)<\/h5>/gi)]
    .filter((match) => /^By transfer\s*,\s*only via prior Evolution$/u.test(visibleText(match[1])))
    .map((match) => match.index ?? 0);
  if (priorEvolutionHeadings.length > 1) {
    throw new Error(
      `Bulbapedia ${config.generationLabel} learnset transfer section has ambiguous prior-Evolution subblocks`,
    );
  }
  return priorEvolutionHeadings.length === 1
    ? sectionHtml.slice(0, priorEvolutionHeadings[0])
    : sectionHtml;
}

function parseStructuredSection(
  sectionId: string,
  sectionHtml: string,
  speciesSourceKey: string,
  sourceSpeciesKey: string,
  config: LearnsetParserConfig,
): DiscoveredLearnsetRow[] {
  if (config.generation === 8 && sectionId === "By_events") {
    // Event-distribution learnsets are outside the accepted Core LearnMethod vocabulary.
    return [];
  }
  if (
    config.generation === 8 &&
    (sectionId === "By_a_prior_Evolution" || sectionId === "By_a_prior_evolution")
  ) {
    // Retention from a pre-evolution is eligibility/evolution-rule evidence owned outside TASK-087.
    return [];
  }
  if (config.generation === 8 && sectionId === "By_reminder") {
    // Move Reminder is explicitly excluded from the Core baseline.
    return [];
  }
  if (config.generation === 8 && sectionId === "By_tutoring") {
    const scopedTutor = baseSpeciesScopedSectionHtml(
      sectionHtml,
      sourceSpeciesKey,
      config,
    );
    const bdspTutor = bdspScopedSectionWithGameHeadings(scopedTutor);
    if (!bdspTutor) return [];
    return parseBdspTutorSection(bdspTutor, speciesSourceKey, config);
  }
  if (config.generation === 8 && sectionId === "By_transfer_from_another_generation") {
    const baseTransfer = baseSpeciesScopedSectionHtml(sectionHtml, sourceSpeciesKey, config);
    assertSwShOnlyTransferSection(directTransferSectionHtml(baseTransfer, config), config);
    return [];
  }
  const scopedSectionHtml =
    config.generation === 8
      ? bdspScopedSectionWithGameHeadings(
          baseSpeciesScopedSectionHtml(sectionHtml, sourceSpeciesKey, config),
        )
      : sectionHtml;
  const method = sectionMethod(sectionId);
  if (method === null) {
    if (sectionHasMoveLink(scopedSectionHtml)) {
      throw new Error(
        `Bulbapedia ${config.generationLabel} learnset: unknown move-bearing h4 section ${sectionId}`,
      );
    }
    return [];
  }
  if (!sectionHasMoveLink(scopedSectionHtml)) {
    if (explicitlyEmptyKnownMethodSection(scopedSectionHtml, method)) return [];
    throw new Error(
      `Bulbapedia ${config.generationLabel} learnset ${sectionId}: approved game scope has no structured Move rows`,
    );
  }

  const candidates = tables(scopedSectionHtml).filter(sectionHasMoveLink);
  if (candidates.length !== 1) {
    throw new Error(
      `Bulbapedia ${config.generationLabel} learnset ${sectionId}: expected exactly one structured Move table, found ${candidates.length}`,
    );
  }
  const tableRows = rows(candidates[0]);
  const headerRows = tableRows.map(headerCells).filter((cells) => cells.length > 0);
  if (headerRows.length !== 1) {
    throw new Error(
      `Bulbapedia ${config.generationLabel} learnset ${sectionId}: expected exactly one header row`,
    );
  }
  const headers = headerRows[0];
  const moveIndex = uniqueHeaderIndex(headers, "Move", sectionId, config);
  const levelIndex = method === "level-up" ? uniqueHeaderIndex(headers, "Level", sectionId, config) : -1;
  const machineIndex = method === "machine" ? uniqueHeaderIndex(headers, "TM", sectionId, config) : -1;
  const typeIndex = uniqueHeaderIndex(headers, "Type", sectionId, config);
  const categoryIndex = uniqueHeaderIndex(headers, "Cat.", sectionId, config);
  const powerIndex = uniqueHeaderAliasIndex(headers, ["Power", "Pwr."], "Power/Pwr.", sectionId, config);
  const accuracyIndex = uniqueHeaderIndex(headers, "Acc.", sectionId, config);
  const ppIndex = uniqueHeaderIndex(headers, "PP", sectionId, config);

  const discovered: DiscoveredLearnsetRow[] = [];
  for (const rowHtml of tableRows) {
    const cells = dataCells(rowHtml);
    if (cells.length === 0) continue;
    if (cells.length !== headers.length) {
      throw new Error(
        `Bulbapedia ${config.generationLabel} learnset ${sectionId}: data row has ${cells.length} cells; expected ${headers.length}`,
      );
    }
    const moveKey =
      config.generation === 8
        ? bdspMoveSourceKey(
            cells[moveIndex],
            `${sectionId} Move`,
            method === "egg",
          )
        : moveSourceKey(
            cells[moveIndex],
            `${sectionId} Move`,
            method === "egg",
          );
    if (moveKey === null) continue;
    const facts =
      config.generation === 8
        ? moveFactsFromCells(
            cells,
            {
              type: typeIndex,
              category: categoryIndex,
              power: powerIndex,
              accuracy: accuracyIndex,
              pp: ppIndex,
            },
            moveKey,
          )
        : {};
    const levelText = method === "level-up" ? visibleValueText(cells[levelIndex]) : null;
    const rowMethod: SupportedMethod =
      method === "level-up" && levelText === "Evo." ? "evolution" : method;
    discovered.push({
      speciesSourceKey,
      moveSourceKey: moveKey,
      ...facts,
      sourceGeneration: config.generation,
      sourceGame: config.sourceGame,
      method: rowMethod,
      level:
        rowMethod === "level-up"
          ? exactInteger(levelText!, `${moveKey} level`)
          : null,
      machineIdentifier:
        method === "machine"
          ? machineIdentifier(cells[machineIndex], `${moveKey} TM`, config)
          : null,
    });
  }
  if (discovered.length === 0) {
    throw new Error(`Bulbapedia ${config.generationLabel} learnset ${sectionId}: no structured Move rows found`);
  }
  return discovered;
}

function learnsetDiscoveryKey(row: DiscoveredLearnsetRow): string {
  return JSON.stringify([
    row.speciesSourceKey.normalize("NFC"),
    row.moveSourceKey.normalize("NFC"),
    row.sourceGeneration,
    row.sourceGame,
    row.method,
    row.level,
    row.machineIdentifier?.normalize("NFC") ?? null,
  ]);
}

export function bulbapediaLearnsetDiscoveryKey(
  row: Pick<
    DiscoveredLearnsetRow,
    "speciesSourceKey" | "moveSourceKey" | "method" | "level" | "machineIdentifier"
  >,
): string {
  return learnsetDiscoveryKey({
    ...row,
    sourceGeneration: 9,
    sourceGame: "Scarlet/Violet",
  });
}

function parseBulbapediaLearnset(
  source: BulbapediaLearnsetHtmlSource,
  speciesSourceKey: string,
  config: LearnsetParserConfig,
): ExtractedBulbapediaLearnset {
  const sourceSpeciesKey = requireCanonicalSource(source, config);
  requireGameAvailability(source.html, config);
  if (!speciesSourceKey.trim()) {
    throw new Error(`Bulbapedia ${config.generationLabel} learnset speciesSourceKey is required`);
  }

  const headings = [...source.html.matchAll(/<h4\b([^>]*)>([\s\S]*?)<\/h4>/gi)].map((match) => ({
    id: h4Id(match[1], match[2]),
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
  if (headings.length === 0) {
    throw new Error(`Bulbapedia ${config.generationLabel} learnset: no h4 sections found`);
  }

  const discoveredRows: DiscoveredLearnsetRow[] = [];
  for (const [index, heading] of headings.entries()) {
    const afterHeading = source.html.slice(heading.end);
    const nextAnyHeadingOffset = /<h[1-4]\b/i.exec(afterHeading)?.index;
    const next =
      nextAnyHeadingOffset === undefined
        ? headings[index + 1]?.index ?? source.html.length
        : heading.end + nextAnyHeadingOffset;
    const sectionHtml = source.html.slice(heading.end, next);
    const sectionId = heading.id;
    if (sectionId === null) {
      if (sectionHasMoveLink(sectionHtml)) {
        throw new Error(`Bulbapedia ${config.generationLabel} learnset: move-bearing h4 section has no stable id`);
      }
      continue;
    }
    discoveredRows.push(
      ...parseStructuredSection(
        sectionId,
        sectionHtml,
        speciesSourceKey,
        sourceSpeciesKey,
        config,
      ),
    );
  }

  const discoveredSourceKeys = discoveredRows.map(learnsetDiscoveryKey);
  if (discoveredSourceKeys.length === 0) {
    throw new Error(`Bulbapedia ${config.generationLabel} learnset: no eligible structured rows discovered`);
  }
  const seen = new Set<string>();
  for (const key of discoveredSourceKeys) {
    if (seen.has(key)) {
      throw new Error(`Bulbapedia ${config.generationLabel} learnset: duplicate logical entry ${key}`);
    }
    seen.add(key);
  }

  const records: ExtractedPokemonDbLearnsetEntry[] = discoveredRows.map((row) => ({
    speciesSourceKey: row.speciesSourceKey,
    moveSourceKey: row.moveSourceKey,
    sourceGeneration: row.sourceGeneration,
    sourceGame: row.sourceGame,
    method: row.method,
    level: row.level,
    machineIdentifier: row.machineIdentifier,
    sourceRecordId: source.sourceRecordId,
  }));
  const moveFacts: ExtractedBulbapediaLearnsetMoveFacts[] =
    config.generation === 8
      ? discoveredRows.map((row) => {
          if (
            row.typeSourceKey === undefined ||
            row.category === undefined ||
            row.basePp === undefined ||
            row.power === undefined ||
            row.accuracy === undefined
          ) {
            throw new Error(
              `Bulbapedia ${config.generationLabel} learnset ${row.moveSourceKey}: selected-game scalar tuple is incomplete`,
            );
          }
          return {
            moveSourceKey: row.moveSourceKey,
            typeSourceKey: row.typeSourceKey,
            category: row.category,
            basePp: row.basePp,
            power: row.power,
            accuracy: row.accuracy,
            sourceGeneration: row.sourceGeneration,
            sourceGame: row.sourceGame,
            sourceRecordId: source.sourceRecordId,
          };
        })
      : [];

  return { sourceSpeciesKey, discoveredSourceKeys, records, moveFacts };
}

export function parseBulbapediaGen9Learnset(
  source: BulbapediaLearnsetHtmlSource,
  speciesSourceKey: string,
): ExtractedBulbapediaLearnset {
  return parseBulbapediaLearnset(source, speciesSourceKey, GEN9_CONFIG);
}

export function parseBulbapediaGen8BdspLearnset(
  source: BulbapediaLearnsetHtmlSource,
  speciesSourceKey: string,
): ExtractedBulbapediaLearnset {
  return parseBulbapediaLearnset(source, speciesSourceKey, GEN8_BDSP_CONFIG);
}
