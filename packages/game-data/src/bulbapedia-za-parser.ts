export const BULBAPEDIA_ZA_MOVE_PARSER_VERSION = "bulbapedia-za-move-list-v1" as const;

export const BULBAPEDIA_ZA_MOVE_LIST_URL =
  "https://bulbapedia.bulbagarden.net/wiki/List_of_moves_in_Pok%C3%A9mon_Legends:_Z-A";

export interface BulbapediaHtmlSource {
  url: string;
  sourceRecordId: string;
  html: string;
}

export interface ExtractedBulbapediaZaBaseMoveCooldown {
  sourceKey: string;
  sourceName: string;
  zaBaseCooldownMs: number;
  sourceRecordId: string;
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

function requireZaMoveListUrl(source: BulbapediaHtmlSource): void {
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
    decodedPath !== "/wiki/List_of_moves_in_Pokémon_Legends:_Z-A"
  ) {
    throw new Error(`unexpected Bulbapedia Z-A move-list URL: ${source.url}`);
  }
  if (!source.sourceRecordId.trim()) {
    throw new Error("Bulbapedia Z-A move-list sourceRecordId is required");
  }
}

export function canonicalizeBulbapediaMoveName(name: string): string {
  const key = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/,(?=\d)/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!key) throw new Error(`unable to canonicalize Bulbapedia move name ${JSON.stringify(name)}`);
  return key;
}

function tableCandidates(html: string): string[] {
  return [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)]
    .map((match) => match[0])
    .filter((table) => {
      const text = visibleText(table);
      return (
        /\bName\b/.test(text) &&
        /\bCooldown\b/.test(text) &&
        /\bWind-up\b/.test(text) &&
        /\bExec\.?\b/.test(text) &&
        /\bRange\b/.test(text)
      );
    });
}

function dataCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
}

function headerCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((match) =>
    visibleText(match[1]),
  );
}

function validateMoveTableHeader(tableHtml: string): void {
  const headerRows = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => headerCells(match[1]))
    .filter((cells) => cells.length > 0);
  const expected = [
    ["#", "Name", "Type", "Category", "Power", "Duration", "Cooldown", "Frames", "Range"],
    ["Wind-up", "Exec.", "Min", "Max", "Eff."],
  ];
  if (
    headerRows.length !== expected.length ||
    expected.some(
      (row, rowIndex) =>
        headerRows[rowIndex].length !== row.length ||
        row.some((cell, cellIndex) => headerRows[rowIndex][cellIndex] !== cell),
    )
  ) {
    throw new Error(
      `Bulbapedia Z-A move list: unexpected table header layout ${JSON.stringify(headerRows)}`,
    );
  }
}

type VariantKind = "base" | "plus" | "rogue";

function variantKind(index: number, nameCell: string): VariantKind {
  const nameText = visibleText(nameCell);
  const hasPlusMarker = /\+\s*$/.test(nameText) || /<sup\b[^>]*>[\s\S]*?\+[\s\S]*?<\/sup>/i.test(nameCell);
  const hasRogueMarker =
    /\bR\s*$/.test(nameText) ||
    /<sup\b[^>]*>[\s\S]*?(?:\^?R)[\s\S]*?<\/sup>/i.test(nameCell);

  if (hasPlusMarker && hasRogueMarker) {
    throw new Error(`Z-A move index ${index}: ambiguous Plus/Rogue variant markers`);
  }
  if (index >= 2000) {
    if (!hasRogueMarker || hasPlusMarker) {
      throw new Error(`Z-A move index ${index}: variant marker conflicts with Rogue ID range`);
    }
    return "rogue";
  }
  if (index >= 1000) {
    if (!hasPlusMarker || hasRogueMarker) {
      throw new Error(`Z-A move index ${index}: variant marker conflicts with Plus ID range`);
    }
    return "plus";
  }
  if (hasPlusMarker || hasRogueMarker) {
    throw new Error(`Z-A move index ${index}: variant marker conflicts with base ID range`);
  }
  return "base";
}

function exactCooldownMilliseconds(cellHtml: string, moveName: string): number {
  const text = visibleText(cellHtml);
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(text);
  if (!match) {
    throw new Error(
      `Z-A Base Cooldown for ${moveName}: expected exact seconds convertible to integer milliseconds, got ${JSON.stringify(text)}`,
    );
  }
  const milliseconds =
    Number(match[1]) * 1000 + Number(((match[2] ?? "") + "000").slice(0, 3));
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    throw new Error(`Z-A Base Cooldown for ${moveName}: value outside positive integer millisecond source domain`);
  }
  return milliseconds;
}

export function parseBulbapediaZaBaseMoveCooldowns(
  source: BulbapediaHtmlSource,
): ExtractedBulbapediaZaBaseMoveCooldown[] {
  requireZaMoveListUrl(source);
  const tables = tableCandidates(source.html);
  if (tables.length !== 1) {
    throw new Error(
      `Bulbapedia Z-A move list: expected exactly one structured move table, found ${tables.length}`,
    );
  }
  validateMoveTableHeader(tables[0]);

  const records: ExtractedBulbapediaZaBaseMoveCooldown[] = [];
  const seenIndexes = new Set<number>();
  const seenKeys = new Map<string, string>();

  for (const rowMatch of tables[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = dataCells(rowMatch[1]);
    if (cells.length === 0) continue;
    if (cells.length < 7) {
      throw new Error(`Bulbapedia Z-A move list: data row has ${cells.length} cells; expected at least 7`);
    }

    const indexText = visibleText(cells[0]);
    if (!/^\d+$/.test(indexText)) {
      throw new Error(`Bulbapedia Z-A move list: invalid move index ${JSON.stringify(indexText)}`);
    }
    const index = Number(indexText);
    if (!Number.isSafeInteger(index) || index <= 0) {
      throw new Error(`Bulbapedia Z-A move list: move index outside accepted domain ${indexText}`);
    }
    if (variantKind(index, cells[1]) !== "base") continue;

    if (seenIndexes.has(index)) {
      throw new Error(`Bulbapedia Z-A move list: duplicate base move index ${index}`);
    }
    seenIndexes.add(index);

    const sourceName = visibleText(cells[1]);
    if (!sourceName) throw new Error(`Bulbapedia Z-A move index ${index}: move name is empty`);
    const sourceKey = canonicalizeBulbapediaMoveName(sourceName);
    const existingName = seenKeys.get(sourceKey);
    if (existingName !== undefined) {
      throw new Error(
        `Bulbapedia Z-A move list: duplicate/ambiguous canonical source key ${sourceKey} for ${JSON.stringify(existingName)} and ${JSON.stringify(sourceName)}`,
      );
    }
    seenKeys.set(sourceKey, sourceName);

    records.push({
      sourceKey,
      sourceName,
      zaBaseCooldownMs: exactCooldownMilliseconds(cells[6], sourceName),
      sourceRecordId: source.sourceRecordId,
    });
  }

  if (records.length === 0) {
    throw new Error("Bulbapedia Z-A move list: no normal base moves were extracted");
  }
  return records;
}
