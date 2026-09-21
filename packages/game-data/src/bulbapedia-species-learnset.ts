import type { ExtractedPokemonDbLearnsetEntry } from "./pokemondb-parser.js";

export const BULBAPEDIA_GEN7_FORM_LEARNSET_PARSER_VERSION =
  "bulbapedia-gen7-form-learnset-v1" as const;

export interface BulbapediaSpeciesLearnsetHtmlSource {
  url: string;
  sourceRecordId: string;
  html: string;
}

type SupportedMethod = "level-up" | "machine" | "egg" | "tutor";

interface Heading {
  level: number;
  label: string;
  start: number;
  end: number;
}

interface HtmlElement {
  attributes: string;
  innerHtml: string;
  start: number;
  end: number;
}

interface TraditionalMoveTable {
  html: string;
  start: number;
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

function visibleValueText(html: string): string {
  return visibleText(
    html.replace(
      /<span\b[^>]*style=["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/span>/gi,
      " ",
    ),
  );
}

function stripExactVersionOnwardsStar(html: string): string {
  return html.replace(/<span\b([^>]*)>\s*\*\s*<\/span>/gi, (match, attributes: string) => {
    const hasExplainClass = /\bclass=["'][^"']*\bexplain\b[^"']*["']/i.test(attributes);
    const hasExactVersionTitle = /\btitle=["']Version \d+\.\d+\.\d+ onwards["']/i.test(attributes);
    return hasExplainClass && hasExactVersionTitle ? " " : match;
  });
}

function headings(html: string): Heading[] {
  return [...html.matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((match) => ({
    level: Number(match[1]),
    label: visibleText(match[2]),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function sectionAfterHeading(html: string, allHeadings: readonly Heading[], heading: Heading): string {
  const next = allHeadings.find(
    (candidate) => candidate.start > heading.start && candidate.level <= heading.level,
  );
  return html.slice(heading.end, next?.start ?? html.length);
}

function elements(html: string, tag: string): HtmlElement[] {
  const expression = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  const stack: Array<{ attributes: string; start: number; openEnd: number }> = [];
  const result: HtmlElement[] = [];
  for (const match of html.matchAll(expression)) {
    if (match.index === undefined) continue;
    if (/^<\//.test(match[0])) {
      const open = stack.pop();
      if (!open) throw new Error(`Bulbapedia learnset: unbalanced <${tag}> markup`);
      result.push({
        attributes: open.attributes,
        innerHtml: html.slice(open.openEnd, match.index),
        start: open.start,
        end: match.index + match[0].length,
      });
    } else {
      const attrs = new RegExp(`^<${tag}\\b([^>]*)>`, "i").exec(match[0])?.[1] ?? "";
      stack.push({
        attributes: attrs,
        start: match.index,
        openEnd: match.index + match[0].length,
      });
    }
  }
  if (stack.length !== 0) throw new Error(`Bulbapedia learnset: unbalanced <${tag}> markup`);
  return result.sort((left, right) => left.start - right.start);
}

function rows(tableHtml: string): string[] {
  return [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
}

function headerCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((match) =>
    visibleText(match[1]),
  );
}

function dataCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
}

function exactPositiveInteger(text: string, label: string): number {
  if (!/^\d+$/u.test(text.trim())) throw new Error(`${label}: expected positive integer`);
  const value = Number(text.trim());
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label}: integer outside domain`);
  return value;
}

function canonicalizeMoveName(name: string): string {
  const key = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/,(?=\d)/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!key) throw new Error(`Bulbapedia learnset: invalid Move name ${JSON.stringify(name)}`);
  return key;
}

function moveSourceKey(cellHtml: string, label: string): string {
  const links = [...cellHtml.matchAll(
    /<a\b[^>]*href=["']\/wiki\/([^"'#?]+)_\(move\)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )];
  if (links.length !== 1) throw new Error(`${label}: expected exactly one Move link`);
  const sourceName = visibleText(links[0][2]);
  if (!sourceName) throw new Error(`${label}: empty Move name`);
  return canonicalizeMoveName(sourceName);
}

function methodFromHeading(label: string): SupportedMethod | null {
  const normalized = label.replace(/\s+/g, " ").trim();
  if (normalized === "By leveling up") return "level-up";
  if (normalized === "By TM" || normalized === "By TM / TR" || normalized === "By TM/TR") {
    return "machine";
  }
  if (normalized === "By breeding") return "egg";
  if (normalized === "By tutoring") return "tutor";
  return null;
}

function formHeadingAliases(baseSourceName: string, formLabel: string): string[] {
  if (
    baseSourceName === "Tauros" &&
    (formLabel === "Combat Breed" || formLabel === "Blaze Breed" || formLabel === "Aqua Breed")
  ) {
    return [`Paldean Tauros (${formLabel})`];
  }
  return [formLabel];
}

function findExactFormBlock(
  sectionHtml: string,
  aliases: readonly string[],
  expectedHeadingLevel: number,
): string {
  const all = headings(sectionHtml);
  const matches = all.filter(
    (heading) =>
      heading.level === expectedHeadingLevel &&
      aliases.some((alias) => alias.normalize("NFC") === heading.label.normalize("NFC")),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Bulbapedia learnset: expected exactly one form heading ${aliases.join(" | ")}, found ${matches.length}`,
    );
  }
  return sectionAfterHeading(sectionHtml, all, matches[0]);
}

function targetBlock(
  methodHtml: string,
  aliases: readonly string[],
  headingLevel: number,
  allowUnscopedBase: boolean,
  allowUnscopedSharedForm: boolean,
): string {
  const methodHeadings = headings(methodHtml).filter((heading) => heading.level === headingLevel);
  if (methodHeadings.length === 0) {
    if (allowUnscopedBase || allowUnscopedSharedForm) return methodHtml;
    throw new Error(
      `Bulbapedia learnset: form-scoped section is missing ${aliases.join(" | ")}`,
    );
  }
  const matching = methodHeadings.filter((heading) =>
    aliases.some((alias) => alias.normalize("NFC") === heading.label.normalize("NFC")),
  );
  if (matching.length === 1) {
    return sectionAfterHeading(methodHtml, headings(methodHtml), matching[0]);
  }
  if (matching.length > 1) {
    throw new Error(
      `Bulbapedia learnset: expected exactly one form heading ${aliases.join(" | ")}, found ${matching.length}`,
    );
  }
  if (allowUnscopedBase) {
    return methodHtml.slice(0, methodHeadings[0].start);
  }
  return findExactFormBlock(methodHtml, aliases, headingLevel);
}

function moveBearingSortableTables(formBlock: string): HtmlElement[] {
  return elements(formBlock, "table")
    .filter((table) => /\bclass=["'][^"']*\bsortable\b[^"']*["']/i.test(table.attributes))
    .filter((table) => /href=["']\/wiki\/[^"'#?]+_\(move\)["']/i.test(table.innerHtml));
}

function traditionalMoveTables(formBlock: string): TraditionalMoveTable[] {
  return moveBearingSortableTables(formBlock)
    .filter((table) => {
      const headers = rows(table.innerHtml).flatMap(headerCells);
      return headers.includes("Move") && headers.includes("PP") && !headers.includes("CD");
    })
    .map((table) => ({
      html: table.innerHtml,
      start: table.start,
    }));
}

function traditionalMoveTable(formBlock: string, label: string): TraditionalMoveTable | null {
  const moveBearing = moveBearingSortableTables(formBlock);
  const candidates = traditionalMoveTables(formBlock);
  if (candidates.length !== 1) {
    if (candidates.length === 0 && moveBearing.length > 0) {
      const nonTraditional = moveBearing.filter((table) => {
        const headers = rows(table.innerHtml).flatMap(headerCells);
        return headers.includes("Move") && headers.includes("CD") && !headers.includes("PP");
      });
      if (nonTraditional.length === moveBearing.length) return null;
    }
    throw new Error(`${label}: expected exactly one traditional sortable Move table, found ${candidates.length}`);
  }
  return candidates[0];
}

function traditionalMoveTableForGeneration(
  formBlock: string,
  label: string,
  generation: 7 | 8 | 9,
): TraditionalMoveTable | null {
  const traditional = traditionalMoveTables(formBlock);
  const candidates = traditional.filter(
    (table) => generationForTraditionalTable(formBlock, table) === generation,
  );
  if (candidates.length === 0) {
    if (traditional.length > 0) return null;
    const moveBearing = moveBearingSortableTables(formBlock);
    if (moveBearing.length > 0) {
      const nonTraditional = moveBearing.filter((table) => {
        const headers = rows(table.innerHtml).flatMap(headerCells);
        return headers.includes("Move") && headers.includes("CD") && !headers.includes("PP");
      });
      if (nonTraditional.length === moveBearing.length) return null;
    }
    throw new Error(
      `${label}: expected exactly one Generation ${generation} traditional sortable Move table, found 0`,
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `${label}: expected exactly one Generation ${generation} traditional sortable Move table, found ${candidates.length}`,
    );
  }
  return candidates[0];
}

function explicitlyEmptyKnownMethodBlock(formBlock: string, method: SupportedMethod): boolean {
  const sourceLabel =
    method === "machine"
      ? "TM"
      : method === "egg"
        ? "breeding"
        : method === "tutor"
          ? "tutoring"
          : null;
  if (sourceLabel === null) return false;
  const sentence = `This Pok\u00e9mon learns no moves by ${sourceLabel}.`;
  return visibleText(formBlock).includes(sentence);
}

function generationForTraditionalTable(formBlock: string, table: TraditionalMoveTable): 7 | 8 | 9 {
  const prefix = formBlock.slice(0, table.start);
  const matches = [...prefix.matchAll(
    /<big\b[^>]*>\s*<big\b[^>]*>\s*<big\b[^>]*>\s*Generation\s+(VII|VIII|IX)\s*<\/big>\s*<\/big>\s*<\/big>/gi,
  )];
  if (matches.length === 0) {
    throw new Error("Bulbapedia learnset: traditional Move table is missing its structured generation header");
  }
  const generation = matches[matches.length - 1][1].toUpperCase();
  return generation === "IX" ? 9 : generation === "VIII" ? 8 : 7;
}

function uniqueHeaderIndex(headers: readonly string[], names: readonly string[], label: string): number {
  const indexes = headers
    .map((header, index) => (names.includes(header) ? index : -1))
    .filter((index) => index >= 0);
  if (indexes.length !== 1) {
    throw new Error(`${label}: expected exactly one ${names.join("/")} column`);
  }
  return indexes[0];
}

function machineIdentifier(cellHtml: string, generation: 7 | 8 | 9): string {
  const normalizedCell = generation === 9
    ? stripExactVersionOnwardsStar(cellHtml)
    : cellHtml;
  const text = visibleValueText(normalizedCell).replace(/\s+/g, "");
  const expected =
    generation === 9
      ? /^TM\d{3}$/u
      : generation === 8
        ? /^(?:TM|TR)(?:0\d|\d{2}|100)$/u
        : /^TM(?:0[1-9]|[1-9]\d|100)$/u;
  if (!expected.test(text)) {
    throw new Error(`Bulbapedia learnset: invalid Generation ${generation} machine identifier ${JSON.stringify(text)}`);
  }
  return text;
}

function isMoveReminderLevelCell(cellHtml: string): boolean {
  if (visibleValueText(cellHtml) !== "Rem.") return false;
  return [...cellHtml.matchAll(/<span\b([^>]*)>\s*Rem\.\s*<\/span>/gi)].some((match) => {
    const attributes = match[1];
    return (
      /\bclass=["'][^"']*\bexplain\b[^"']*["']/i.test(attributes) &&
      /\btitle=["']Can only be learned via Move Reminder["']/i.test(attributes)
    );
  });
}

function parseMethodTable(input: {
  table: string;
  speciesSourceKey: string;
  sourceRecordId: string;
  generation: 7 | 8 | 9;
  sourceGame: string;
  method: SupportedMethod;
}): ExtractedPokemonDbLearnsetEntry[] {
  const tableRows = rows(input.table);
  const headerRows = tableRows.map(headerCells).filter((headers) => headers.includes("Move"));
  if (headerRows.length !== 1) {
    throw new Error(`Bulbapedia learnset ${input.method}: expected one Move header row`);
  }
  const headers = headerRows[0];
  const moveIndex = uniqueHeaderIndex(headers, ["Move"], input.method);
  const levelIndex =
    input.method === "level-up" ? uniqueHeaderIndex(headers, ["Level"], input.method) : -1;
  const machineIndex =
    input.method === "machine"
      ? uniqueHeaderIndex(headers, ["TM", "TM / TR", "TM/TR"], input.method)
      : -1;
  const result: ExtractedPokemonDbLearnsetEntry[] = [];
  let structuredMoveRows = 0;
  let skippedReminderRows = 0;
  for (const rowHtml of tableRows) {
    const cells = dataCells(rowHtml);
    if (cells.length === 0 || !/href=["']\/wiki\/[^"'#?]+_\(move\)["']/i.test(rowHtml)) continue;
    structuredMoveRows += 1;
    if (moveIndex >= cells.length) throw new Error(`Bulbapedia learnset ${input.method}: malformed row`);
    const levelText =
      input.method === "level-up"
        ? visibleValueText(
            input.generation === 9
              ? stripExactVersionOnwardsStar(cells[levelIndex])
              : cells[levelIndex],
          )
        : null;
    if (input.method === "level-up" && isMoveReminderLevelCell(cells[levelIndex])) {
      skippedReminderRows += 1;
      continue;
    }
    const moveCell =
      input.method === "tutor"
        ? (() => {
            const candidates = cells.filter((cell) =>
              /href=["']\/wiki\/[^"'#?]+_\(move\)["']/i.test(cell),
            );
            if (candidates.length !== 1) {
              throw new Error(
                `Bulbapedia learnset tutor: expected exactly one data cell with a Move link, found ${candidates.length}`,
              );
            }
            return candidates[0];
          })()
        : cells[moveIndex];
    const moveKey = moveSourceKey(moveCell, `${input.method} Move`);
    const method = input.method === "level-up" && levelText === "Evo." ? "evolution" : input.method;
    result.push({
      speciesSourceKey: input.speciesSourceKey,
      moveSourceKey: moveKey,
      sourceGeneration: input.generation,
      sourceGame: input.sourceGame,
      method,
      level: method === "level-up" ? exactPositiveInteger(levelText!, `${moveKey} level`) : null,
      machineIdentifier:
        input.method === "machine" ? machineIdentifier(cells[machineIndex], input.generation) : null,
      sourceRecordId: input.sourceRecordId,
    });
  }
  if (result.length === 0) {
    if (
      input.method === "level-up" &&
      structuredMoveRows > 0 &&
      skippedReminderRows === structuredMoveRows
    ) {
      return [];
    }
    throw new Error(`Bulbapedia learnset ${input.method}: no structured Move rows for form`);
  }
  return result;
}

function sourceGameForCurrentForm(formLabel: string, generation: 7 | 8 | 9): string {
  if (generation === 9) return "Scarlet/Violet";
  if (generation === 8 && formLabel.startsWith("Galarian ")) return "Sword/Shield";
  throw new Error(
    `Bulbapedia current Species learnset: unsupported current game scope for ${formLabel} Generation ${generation}`,
  );
}

function parseFormMethods(input: {
  html: string;
  speciesSourceKey: string;
  sourceRecordId: string;
  baseSourceName: string;
  formLabel: string;
  rootHeadingLabel: string | null;
  rootHeadingLevel: number;
  formHeadingLevel: number;
  forcedGeneration?: 7 | 8;
  forcedSourceGame?: string;
  allowUnscopedBase?: boolean;
  allowUnscopedSharedForm?: boolean;
  requireGeneration?: 7 | 8 | 9;
}): ExtractedPokemonDbLearnsetEntry[] {
  const allHeadings = headings(input.html);
  const rootHeadingLabel = input.rootHeadingLabel;
  const rootHtml =
    rootHeadingLabel === null
      ? input.html
      : (() => {
          const roots = allHeadings.filter(
            (heading) =>
              heading.level === input.rootHeadingLevel &&
              heading.label.normalize("NFC") === rootHeadingLabel.normalize("NFC"),
          );
          if (roots.length !== 1) {
            throw new Error(`Bulbapedia learnset: expected root heading ${rootHeadingLabel}`);
          }
          return sectionAfterHeading(input.html, allHeadings, roots[0]);
        })();
  const rootHeadings = headings(rootHtml);
  const aliases = formHeadingAliases(input.baseSourceName, input.formLabel);
  const records: ExtractedPokemonDbLearnsetEntry[] = [];
  for (const methodHeading of rootHeadings) {
    const method = methodFromHeading(methodHeading.label);
    if (!method || methodHeading.level !== input.rootHeadingLevel + 1) continue;
    const methodHtml = sectionAfterHeading(rootHtml, rootHeadings, methodHeading);
    let formBlock: string;
    try {
      formBlock = targetBlock(
        methodHtml,
        aliases,
        input.formHeadingLevel,
        input.allowUnscopedBase === true,
        input.allowUnscopedSharedForm === true,
      );
    } catch (error) {
      if (method === "tutor") continue;
      throw error;
    }
    if (explicitlyEmptyKnownMethodBlock(formBlock, method)) {
      const conflictingTraditionalTables = traditionalMoveTables(formBlock).filter(
        (table) =>
          input.requireGeneration === undefined ||
          generationForTraditionalTable(formBlock, table) === input.requireGeneration,
      );
      if (conflictingTraditionalTables.length > 0) {
        throw new Error(`Bulbapedia learnset: ${input.formLabel} ${method} declares no moves but contains Move rows`);
      }
      continue;
    }
    const table =
      input.requireGeneration === undefined
        ? traditionalMoveTable(formBlock, `${input.formLabel} ${method}`)
        : traditionalMoveTableForGeneration(
            formBlock,
            `${input.formLabel} ${method}`,
            input.requireGeneration,
          );
    if (table === null) continue;
    const generation = input.forcedGeneration ?? generationForTraditionalTable(formBlock, table);
    const sourceGame = input.forcedSourceGame ?? sourceGameForCurrentForm(input.formLabel, generation);
    records.push(
      ...parseMethodTable({
        table: table.html,
        speciesSourceKey: input.speciesSourceKey,
        sourceRecordId: input.sourceRecordId,
        generation,
        sourceGame,
        method,
      }),
    );
  }
  if (records.length === 0) {
    throw new Error(`Bulbapedia learnset: no accepted methods found for ${input.formLabel}`);
  }
  const keys = records.map((record) =>
    JSON.stringify([
      record.speciesSourceKey,
      record.moveSourceKey,
      record.sourceGeneration,
      record.sourceGame,
      record.method,
      record.level,
      record.machineIdentifier,
    ]),
  );
  if (new Set(keys).size !== keys.length) {
    throw new Error(`Bulbapedia learnset: duplicate logical entry for ${input.formLabel}`);
  }
  return records;
}

function requireCurrentSpeciesUrl(url: string): void {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "bulbapedia.bulbagarden.net" ||
    !/^\/wiki\/[^/]+_\(Pok%C3%A9mon\)$/u.test(parsed.pathname) ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`unexpected Bulbapedia Species URL for form Learnset: ${url}`);
  }
}

function requireGen8LearnsetUrl(url: string): void {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "bulbapedia.bulbagarden.net" ||
    !/^\/wiki\/[^/]+_\(Pok%C3%A9mon\)\/Generation_VIII_learnset$/u.test(parsed.pathname) ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`unexpected Bulbapedia Generation VIII form Learnset URL: ${url}`);
  }
}

function requireGen7LearnsetUrl(url: string): void {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "bulbapedia.bulbagarden.net" ||
    !/^\/wiki\/[^/]+_\(Pok%C3%A9mon\)\/Generation_VII_learnset$/u.test(parsed.pathname) ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`unexpected Bulbapedia Generation VII form Learnset URL: ${url}`);
  }
}

export function parseBulbapediaCurrentSpeciesFormLearnset(input: {
  source: BulbapediaSpeciesLearnsetHtmlSource;
  speciesSourceKey: string;
  baseSourceName: string;
  formLabel: string;
}): ExtractedPokemonDbLearnsetEntry[] {
  requireCurrentSpeciesUrl(input.source.url);
  if (!input.source.sourceRecordId.trim()) throw new Error("form Learnset sourceRecordId is required");
  return parseFormMethods({
    html: input.source.html,
    speciesSourceKey: input.speciesSourceKey,
    sourceRecordId: input.source.sourceRecordId,
    baseSourceName: input.baseSourceName,
    formLabel: input.formLabel,
    rootHeadingLabel: "Learnset",
    rootHeadingLevel: 3,
    formHeadingLevel: 5,
    allowUnscopedSharedForm: true,
  });
}

export function parseBulbapediaCurrentSpeciesBaseGen9Learnset(input: {
  source: BulbapediaSpeciesLearnsetHtmlSource;
  speciesSourceKey: string;
  baseSourceName: string;
}): ExtractedPokemonDbLearnsetEntry[] | null {
  requireCurrentSpeciesUrl(input.source.url);
  if (!input.source.sourceRecordId.trim()) throw new Error("base Learnset sourceRecordId is required");
  const all = headings(input.source.html);
  const learnset = all.filter(
    (heading) => heading.level === 3 && heading.label.normalize("NFC") === "Learnset",
  );
  if (learnset.length !== 1) throw new Error("Bulbapedia learnset: expected exactly one Learnset heading");
  const learnsetHtml = sectionAfterHeading(input.source.html, all, learnset[0]);
  const learnsetHeadings = headings(learnsetHtml);
  const leveling = learnsetHeadings.find(
    (heading) => heading.level === 4 && methodFromHeading(heading.label) === "level-up",
  );
  if (!leveling) throw new Error("Bulbapedia learnset: missing By leveling up section");
  const levelingHtml = sectionAfterHeading(learnsetHtml, learnsetHeadings, leveling);
  const baseBlock = targetBlock(levelingHtml, [input.baseSourceName], 5, true, false);
  const table = traditionalMoveTableForGeneration(
    baseBlock,
    `${input.baseSourceName} level-up`,
    9,
  );
  if (table === null) return null;
  return parseFormMethods({
    html: input.source.html,
    speciesSourceKey: input.speciesSourceKey,
    sourceRecordId: input.source.sourceRecordId,
    baseSourceName: input.baseSourceName,
    formLabel: input.baseSourceName,
    rootHeadingLabel: "Learnset",
    rootHeadingLevel: 3,
    formHeadingLevel: 5,
    allowUnscopedBase: true,
    requireGeneration: 9,
  });
}

export function parseBulbapediaGen8GalarianFormLearnset(input: {
  source: BulbapediaSpeciesLearnsetHtmlSource;
  speciesSourceKey: string;
  baseSourceName: string;
  formLabel: string;
}): ExtractedPokemonDbLearnsetEntry[] {
  requireGen8LearnsetUrl(input.source.url);
  if (!input.source.sourceRecordId.trim()) {
    throw new Error("Generation VIII Galarian form Learnset sourceRecordId is required");
  }
  if (!input.formLabel.startsWith("Galarian ")) {
    throw new Error(
      `Generation VIII Sword/Shield form parser requires a Galarian form, received ${input.formLabel}`,
    );
  }
  return parseFormMethods({
    html: input.source.html,
    speciesSourceKey: input.speciesSourceKey,
    sourceRecordId: input.source.sourceRecordId,
    baseSourceName: input.baseSourceName,
    formLabel: input.formLabel,
    rootHeadingLabel: null,
    rootHeadingLevel: 3,
    formHeadingLevel: 5,
    forcedGeneration: 8,
    forcedSourceGame: "Sword/Shield",
  });
}

export function parseBulbapediaGen7FormLearnset(input: {
  source: BulbapediaSpeciesLearnsetHtmlSource;
  speciesSourceKey: string;
  baseSourceName: string;
  formLabel: string;
}): ExtractedPokemonDbLearnsetEntry[] {
  requireGen7LearnsetUrl(input.source.url);
  if (!input.source.sourceRecordId.trim()) throw new Error("Generation VII form Learnset sourceRecordId is required");
  return parseFormMethods({
    html: input.source.html,
    speciesSourceKey: input.speciesSourceKey,
    sourceRecordId: input.source.sourceRecordId,
    baseSourceName: input.baseSourceName,
    formLabel: input.formLabel,
    rootHeadingLabel: "Pokémon Sun, Moon , Ultra Sun and Ultra Moon",
    rootHeadingLevel: 4,
    formHeadingLevel: 6,
    forcedGeneration: 7,
    forcedSourceGame: "Sun/Moon/Ultra Sun/Ultra Moon",
    allowUnscopedSharedForm: true,
  });
}
