export const BULBAPEDIA_TYPE_CHART_URL =
  "https://bulbapedia.bulbagarden.net/wiki/Type/Type_chart";
export const BULBAPEDIA_TYPE_CHART_PARSER_VERSION =
  "bulbapedia-current-type-chart-v1" as const;

export const BULBAPEDIA_ABILITY_LIST_URL =
  "https://bulbapedia.bulbagarden.net/wiki/Ability";
export const BULBAPEDIA_ABILITY_LIST_PARSER_VERSION =
  "bulbapedia-ability-list-v1" as const;

export const BULBAPEDIA_ITEM_LIST_URL =
  "https://bulbapedia.bulbagarden.net/wiki/List_of_items_by_name";
export const BULBAPEDIA_ITEM_LIST_ALIAS_URL =
  "https://bulbapedia.bulbagarden.net/wiki/Alphabetical_list_of_items";
export const BULBAPEDIA_ITEM_LIST_PARSER_VERSION =
  "bulbapedia-item-list-v1" as const;

export interface BulbapediaReferenceHtmlSource {
  url: string;
  sourceRecordId: string;
  html: string;
}

export interface ExtractedBulbapediaType {
  sourceKey: string;
  sourceName: string;
  sourceSlug: string;
  sourceRecordId: string;
}

export interface ExtractedBulbapediaTypeEffectiveness {
  attackTypeSourceKey: string;
  defenseTypeSourceKey: string;
  multiplier: 0 | 0.5 | 1 | 2;
  sourceRecordId: string;
}

export interface ExtractedBulbapediaTypeChart {
  types: ExtractedBulbapediaType[];
  currentTypeEffectiveness: ExtractedBulbapediaTypeEffectiveness[];
}

export interface ExtractedBulbapediaAbility {
  sourceKey: string;
  sourceName: string;
  sourceSlug: string;
  introducedGeneration: number;
  sourceRecordId: string;
}

export interface ExtractedBulbapediaItem {
  sourceKey: string;
  sourceName: string;
  sourceSlug: string;
  introducedGeneration: number;
  sourceRecordId: string;
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
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

function identityCellText(html: string): string {
  return visibleText(
    html
      .replace(/<span\b[^>]*class=["'][^"']*\bexplain\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, " ")
      .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, " "),
  );
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

function requireSourceRecordId(source: BulbapediaReferenceHtmlSource, label: string): void {
  if (!source.sourceRecordId.trim()) {
    throw new Error(`${label} sourceRecordId is required`);
  }
}

function requireCanonicalUrl(
  source: BulbapediaReferenceHtmlSource,
  acceptedPaths: readonly string[],
  label: string,
): void {
  let url: URL;
  try {
    url = new URL(source.url);
  } catch {
    throw new Error(`invalid Bulbapedia source URL: ${source.url}`);
  }
  const decodedPath = decodeURIComponent(url.pathname);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "bulbapedia.bulbagarden.net" ||
    !acceptedPaths.includes(decodedPath) ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`unexpected Bulbapedia ${label} URL: ${source.url}`);
  }
  requireSourceRecordId(source, `Bulbapedia ${label}`);
}

function headerCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((match) =>
    visibleText(match[1]),
  );
}

function dataCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
}

function rows(tableHtml: string): string[] {
  return [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
}

function tables(html: string): string[] {
  return [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map((match) => match[0]);
}

function exactHeader(tableHtml: string, expected: readonly string[]): boolean {
  const candidates = rows(tableHtml)
    .map((row) => headerCells(row))
    .filter((cells) => cells.length > 0);
  return candidates.some(
    (cells) =>
      cells.length === expected.length &&
      expected.every((expectedCell, index) => cells[index] === expectedCell),
  );
}

function sectionAfterHeading(html: string, level: 2 | 3, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startPattern = new RegExp(
    `<h${level}\\b[^>]*>\\s*(?:<span\\b[^>]*>)?\\s*${escaped}\\s*(?:<\\/span>)?\\s*<\\/h${level}>`,
    "i",
  );
  const start = startPattern.exec(html);
  if (!start || start.index === undefined) {
    throw new Error(`Bulbapedia reference parser: required heading ${JSON.stringify(heading)} is missing`);
  }
  const offset = start.index + start[0].length;
  const remainder = html.slice(offset);
  const nextHeading = new RegExp(`<h[1-${level}]\\b`, "i").exec(remainder);
  return nextHeading?.index === undefined ? remainder : remainder.slice(0, nextHeading.index);
}

interface LinkedIdentity {
  sourceKey: string;
  sourceName: string;
  sourceSlug: string;
}

function linkedIdentity(
  cellHtml: string,
  hrefPattern: RegExp,
  label: string,
): LinkedIdentity {
  const links = [...cellHtml.matchAll(hrefPattern)];
  if (links.length !== 1) {
    throw new Error(`${label}: expected exactly one structured identity link`);
  }
  const sourceName = visibleText(links[0][2] ?? links[0][1]);
  if (!sourceName || visibleText(cellHtml) !== sourceName) {
    throw new Error(`${label}: ambiguous structured identity cell`);
  }
  const sourceKey = canonicalizeSourceName(sourceName, label);
  return { sourceKey, sourceName, sourceSlug: sourceKey };
}

function typeIdentity(cellHtml: string, label: string): LinkedIdentity {
  const links = [
    ...cellHtml.matchAll(
      /<a\b([^>]*)href=["']\/wiki\/([^"'#?]+)_\(type\)["']([^>]*)>([\s\S]*?)<\/a>/gi,
    ),
  ];
  if (links.length !== 1) {
    throw new Error(`${label}: expected exactly one structured Type link`);
  }
  const attributes = `${links[0][1]} ${links[0][3]}`;
  const pathName = decodeURIComponent(decodeHtml(links[0][2])).replace(/_/g, " ");
  const pathKey = canonicalizeSourceName(pathName, `${label} href`);
  const visible = visibleText(links[0][4]);
  const title = /\btitle=["']([^"']+)["']/i.exec(attributes)?.[1];
  const titleName = title ? decodeHtml(title).replace(/\s*\(type\)\s*$/i, "").trim() : "";
  const sourceName = visible || titleName || pathName;
  const sourceKey = canonicalizeSourceName(sourceName, label);
  if (sourceKey !== pathKey) {
    throw new Error(`${label}: structured Type href and identity label disagree`);
  }
  if (visible && titleName && canonicalizeSourceName(titleName, `${label} title`) !== sourceKey) {
    throw new Error(`${label}: structured Type title and visible label disagree`);
  }
  return { sourceKey, sourceName, sourceSlug: sourceKey };
}

function parseMultiplier(cellHtml: string, label: string): 0 | 0.5 | 1 | 2 {
  const normalized = visibleText(cellHtml).replace(/\s+/g, "");
  if (normalized === "0×" || normalized === "0x") return 0;
  if (normalized === "½×" || normalized === "1/2×" || normalized === "0.5×") return 0.5;
  if (normalized === "1×" || normalized === "1x") return 1;
  if (normalized === "2×" || normalized === "2x") return 2;
  throw new Error(`${label}: unsupported type-effectiveness multiplier ${JSON.stringify(visibleText(cellHtml))}`);
}

function modernTypeTable(html: string): string {
  const section = sectionAfterHeading(html, 3, "Generation VI onward");
  const candidates = tables(section).filter((table) => {
    const text = visibleText(table);
    return text.includes("Attacking type") && text.includes("Defending type");
  });
  if (candidates.length !== 1) {
    throw new Error(
      `Bulbapedia current Type chart: expected exactly one Generation VI onward matrix, found ${candidates.length}`,
    );
  }
  return candidates[0];
}

export function parseBulbapediaCurrentTypeChart(
  source: BulbapediaReferenceHtmlSource,
): ExtractedBulbapediaTypeChart {
  requireCanonicalUrl(source, ["/wiki/Type/Type_chart"], "current Type chart");
  const table = modernTypeTable(source.html);
  const tableRows = rows(table);
  const defenseHeaderCandidates = tableRows.filter((row) => {
    if (dataCells(row).length !== 0) return false;
    const typeHeaders = [...row.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)]
      .map((match) => match[1])
      .filter((cell) => /_\(type\)/i.test(cell));
    return typeHeaders.length === 18;
  });
  if (defenseHeaderCandidates.length !== 1) {
    throw new Error(
      `Bulbapedia current Type chart: expected exactly one 18-Type defending header row, found ${defenseHeaderCandidates.length}`,
    );
  }
  const defenseCells = [...defenseHeaderCandidates[0].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(
    (match) => match[1],
  );
  const defenseTypes = defenseCells
    .filter((cell) => /_\(type\)/i.test(cell))
    .map((cell, index) => typeIdentity(cell, `Bulbapedia defending Type ${index}`));
  if (defenseTypes.length !== 18) {
    throw new Error(
      `Bulbapedia current Type chart: expected 18 defending Types, found ${defenseTypes.length}`,
    );
  }
  if (new Set(defenseTypes.map((entry) => entry.sourceKey)).size !== defenseTypes.length) {
    throw new Error("Bulbapedia current Type chart: duplicate defending Type identity");
  }

  const effectiveness: ExtractedBulbapediaTypeEffectiveness[] = [];
  const seenAttackTypes = new Set<string>();
  for (const rowHtml of tableRows) {
    const cells = dataCells(rowHtml);
    if (cells.length === 0) continue;
    const rowHeaders = [...rowHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(
      (match) => match[1],
    );
    const attackCells = rowHeaders.filter((cell) => /_\(type\)/i.test(cell));
    if (attackCells.length === 0 && cells.length !== defenseTypes.length) {
      continue;
    }
    const attackCell = attackCells[0];
    if (!attackCell) {
      throw new Error("Bulbapedia current Type chart: data row is missing an attacking Type link");
    }
    const attack = typeIdentity(attackCell, "Bulbapedia attacking Type");
    for (const duplicateCell of attackCells.slice(1)) {
      const duplicateIdentity = typeIdentity(duplicateCell, "Bulbapedia attacking Type duplicate header");
      if (duplicateIdentity.sourceKey !== attack.sourceKey) {
        throw new Error(
          `Bulbapedia current Type chart: attacking Type header identities disagree for ${attack.sourceName}`,
        );
      }
    }
    if (seenAttackTypes.has(attack.sourceKey)) {
      throw new Error(`Bulbapedia current Type chart: duplicate attacking Type ${attack.sourceKey}`);
    }
    seenAttackTypes.add(attack.sourceKey);
    if (cells.length !== defenseTypes.length) {
      throw new Error(
        `Bulbapedia current Type chart: attacking Type ${attack.sourceName} has ${cells.length} cells; expected ${defenseTypes.length}`,
      );
    }
    cells.forEach((cell, index) => {
      effectiveness.push({
        attackTypeSourceKey: attack.sourceKey,
        defenseTypeSourceKey: defenseTypes[index].sourceKey,
        multiplier: parseMultiplier(cell, `${attack.sourceName} -> ${defenseTypes[index].sourceName}`),
        sourceRecordId: source.sourceRecordId,
      });
    });
  }
  if (seenAttackTypes.size !== 18) {
    throw new Error(
      `Bulbapedia current Type chart: expected 18 attacking Types, found ${seenAttackTypes.size}`,
    );
  }
  const defenseKeys = new Set(defenseTypes.map((entry) => entry.sourceKey));
  if ([...seenAttackTypes].some((key) => !defenseKeys.has(key))) {
    throw new Error("Bulbapedia current Type chart: attacking and defending Type identities differ");
  }
  if (effectiveness.length !== 18 * 18) {
    throw new Error("Bulbapedia current Type chart: matrix is not complete 18x18");
  }
  return {
    types: defenseTypes.map((entry) => ({ ...entry, sourceRecordId: source.sourceRecordId })),
    currentTypeEffectiveness: effectiveness,
  };
}

const GENERATION_BY_ROMAN: Record<string, number> = {
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

function parseGeneration(cellHtml: string, label: string): number {
  const text = visibleText(cellHtml).replace(/[.*†‡]+$/g, "").trim();
  const generation = GENERATION_BY_ROMAN[text];
  if (generation === undefined) {
    throw new Error(`${label}: unsupported Generation label ${JSON.stringify(visibleText(cellHtml))}`);
  }
  return generation;
}

function parseNamedGenerationTable<T extends ExtractedBulbapediaAbility | ExtractedBulbapediaItem>(
  source: BulbapediaReferenceHtmlSource,
  tableHtmls: string[],
  expectedHeader: readonly string[],
  nameCellIndex: number,
  generationCellIndex: number,
  identityPattern: RegExp,
  label: string,
): T[] {
  const records = new Map<string, T>();
  const sourceNames = new Map<string, string>();
  for (const table of tableHtmls) {
    if (!exactHeader(table, expectedHeader)) {
      throw new Error(`${label}: unexpected table header layout`);
    }
    for (const rowHtml of rows(table)) {
      const cells = dataCells(rowHtml);
      if (cells.length === 0) continue;
      if (cells.length !== expectedHeader.length) {
        throw new Error(`${label}: data row has ${cells.length} cells; expected ${expectedHeader.length}`);
      }
      const identity = linkedIdentity(cells[nameCellIndex], identityPattern, `${label} name`);
      const generation = parseGeneration(cells[generationCellIndex], `${identity.sourceName} Generation`);
      const existingName = sourceNames.get(identity.sourceKey);
      if (existingName !== undefined && existingName !== identity.sourceName) {
        throw new Error(
          `${label}: duplicate/ambiguous canonical source key ${identity.sourceKey} for ${JSON.stringify(existingName)} and ${JSON.stringify(identity.sourceName)}`,
        );
      }
      sourceNames.set(identity.sourceKey, identity.sourceName);
      const existing = records.get(identity.sourceKey);
      if (existing !== undefined) {
        if (existing.introducedGeneration !== generation) {
          throw new Error(`${label}: duplicate identity ${identity.sourceKey} has conflicting introduced Generation`);
        }
        continue;
      }
      records.set(identity.sourceKey, {
        ...identity,
        introducedGeneration: generation,
        sourceRecordId: source.sourceRecordId,
      } as T);
    }
  }
  if (records.size === 0) throw new Error(`${label}: no records were extracted`);
  return [...records.values()];
}

export function parseBulbapediaAbilityList(
  source: BulbapediaReferenceHtmlSource,
): ExtractedBulbapediaAbility[] {
  requireCanonicalUrl(source, ["/wiki/Ability"], "Ability list");
  const section = sectionAfterHeading(source.html, 2, "List of Abilities");
  const candidates = tables(section).filter((table) => exactHeader(table, ["#", "Name", "Description", "Gen."]));
  if (candidates.length !== 1) {
    throw new Error(
      `Bulbapedia Ability list: expected exactly one structured Ability table, found ${candidates.length}`,
    );
  }
  return parseNamedGenerationTable<ExtractedBulbapediaAbility>(
    source,
    candidates,
    ["#", "Name", "Description", "Gen."],
    1,
    3,
    /<a\b[^>]*href=["']\/wiki\/([^"'#?]+)_\(Ability\)["'][^>]*>([\s\S]*?)<\/a>/gi,
    "Bulbapedia Ability list",
  );
}

export function parseBulbapediaItemList(
  source: BulbapediaReferenceHtmlSource,
): ExtractedBulbapediaItem[] {
  requireCanonicalUrl(
    source,
    ["/wiki/List_of_items_by_name", "/wiki/Alphabetical_list_of_items"],
    "Item list",
  );
  const candidates = tables(source.html).filter((table) =>
    exactHeader(table, ["Icon", "Name", "Gen.", "Description"]),
  );
  if (candidates.length === 0) {
    throw new Error("Bulbapedia Item list: no structured Item tables were found");
  }
  const provisional: Array<{
    nameKey: string;
    sourceName: string;
    hrefKey: string;
    introducedGeneration: number;
  }> = [];
  for (const table of candidates) {
    for (const rowHtml of rows(table)) {
      const cells = dataCells(rowHtml);
      if (cells.length === 0) continue;
      if (cells.length !== 4) {
        throw new Error(`Bulbapedia Item list: data row has ${cells.length} cells; expected 4`);
      }
      const links = [
        ...cells[1].matchAll(
          /<a\b[^>]*href=["']\/wiki\/([^"'?]+)["'][^>]*>([\s\S]*?)<\/a>/gi,
        ),
      ];
      if (links.length !== 1) {
        throw new Error("Bulbapedia Item list name: expected exactly one structured identity link");
      }
      const sourceName = visibleText(links[0][2]);
      if (!sourceName || identityCellText(cells[1]) !== sourceName) {
        throw new Error("Bulbapedia Item list name: ambiguous structured identity cell");
      }
      const nameKey = canonicalizeSourceName(sourceName, "Bulbapedia Item list name");
      let decodedHref: string;
      try {
        decodedHref = decodeURIComponent(decodeHtml(links[0][1])).replace(/_/g, " ");
      } catch {
        throw new Error(`Bulbapedia Item list ${sourceName}: invalid structured href`);
      }
      provisional.push({
        nameKey,
        sourceName,
        hrefKey: canonicalizeSourceName(decodedHref, `${sourceName} href`),
        introducedGeneration: parseGeneration(cells[2], `${sourceName} Generation`),
      });
    }
  }

  const byNameKey = new Map<string, typeof provisional>();
  for (const record of provisional) {
    const group = byNameKey.get(record.nameKey) ?? [];
    group.push(record);
    byNameKey.set(record.nameKey, group);
  }
  const result: ExtractedBulbapediaItem[] = [];
  const emittedKeys = new Set<string>();
  for (const [nameKey, group] of byNameKey) {
    if (new Set(group.map((record) => record.sourceName.normalize("NFC"))).size !== 1) {
      throw new Error(
        `Bulbapedia Item list: duplicate/ambiguous canonical source key ${nameKey}`,
      );
    }
    const byIdentity = new Map<string, (typeof group)[number]>();
    const generationsByHref = new Map<string, Set<number>>();
    for (const record of group) {
      const identityKey = `${record.hrefKey}\u0000${record.introducedGeneration}`;
      if (!byIdentity.has(identityKey)) byIdentity.set(identityKey, record);
      const generations = generationsByHref.get(record.hrefKey) ?? new Set<number>();
      generations.add(record.introducedGeneration);
      generationsByHref.set(record.hrefKey, generations);
    }
    const needsDisambiguation = byIdentity.size > 1;
    for (const record of byIdentity.values()) {
      const sameHrefHasMultipleGenerations =
        (generationsByHref.get(record.hrefKey)?.size ?? 0) > 1;
      const sourceKey = !needsDisambiguation
        ? nameKey
        : sameHrefHasMultipleGenerations
          ? `${record.hrefKey}-gen-${record.introducedGeneration}`
          : record.hrefKey;
      if (emittedKeys.has(sourceKey)) {
        throw new Error(`Bulbapedia Item list: duplicate resolved source key ${sourceKey}`);
      }
      emittedKeys.add(sourceKey);
      result.push({
        sourceKey,
        sourceName: record.sourceName,
        sourceSlug: sourceKey,
        introducedGeneration: record.introducedGeneration,
        sourceRecordId: source.sourceRecordId,
      });
    }
  }
  if (result.length === 0) throw new Error("Bulbapedia Item list: no records were extracted");
  return result;
}
