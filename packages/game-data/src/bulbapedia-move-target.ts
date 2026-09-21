import type { ExtractedMoveSourceTarget } from "./pokemondb-parser.js";
import { canonicalizeBulbapediaMoveName } from "./bulbapedia-za-parser.js";

export const BULBAPEDIA_MOVE_TARGET_PARSER_VERSION =
  "bulbapedia-move-target-v1" as const;

export interface BulbapediaMoveTargetHtmlSource {
  url: string;
  sourceRecordId: string;
  html: string;
}

export interface ExtractedBulbapediaMoveTarget {
  sourceKey: string;
  sourceName: string;
  sourceTarget: ExtractedMoveSourceTarget;
  sourceRecordId: string;
}

const RANGE_TARGETS: Record<string, ExtractedMoveSourceTarget> = {
  "Normal: May affect anyone adjacent to the user": "any-adjacent",
};

function decodeHtml(text: string): string {
  return text.replace(
    /&(?:#x([0-9a-f]+)|#(\d+)|([a-z][a-z0-9]+));/gi,
    (match, hex: string | undefined, decimal: string | undefined, named: string | undefined) => {
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
      const values: Record<string, string> = {
        amp: "&",
        apos: "'",
        gt: ">",
        lt: "<",
        nbsp: " ",
        quot: '"',
      };
      return values[named!.toLowerCase()] ?? match;
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

function mediaWikiMoveTitle(sourceName: string): string {
  if (!sourceName.trim()) throw new Error("Bulbapedia Move target: source name is required");
  return sourceName.normalize("NFC").replace(/ /g, "_") + "_(move)";
}

export function buildBulbapediaMoveTargetUrl(sourceName: string): string {
  const title = mediaWikiMoveTitle(sourceName);
  return "https://bulbapedia.bulbagarden.net/wiki/" + encodeURIComponent(title)
    .replace(/%2F/gi, "/")
    .replace(/%28/gi, "(")
    .replace(/%29/gi, ")");
}

export function parseBulbapediaMoveTarget(
  source: BulbapediaMoveTargetHtmlSource,
): ExtractedBulbapediaMoveTarget {
  if (!source.sourceRecordId.trim()) {
    throw new Error("Bulbapedia Move target: sourceRecordId is required");
  }
  let url: URL;
  try {
    url = new URL(source.url);
  } catch {
    throw new Error("Bulbapedia Move target: invalid source URL");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "bulbapedia.bulbagarden.net" ||
    !/^\/wiki\/[^/]+_\(move\)$/u.test(decodeURIComponent(url.pathname)) ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("Bulbapedia Move target: unexpected source URL");
  }

  const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(source.html);
  if (!heading) throw new Error("Bulbapedia Move target: page heading is missing");
  const headingText = visibleText(heading[1]).replace(/\s+\(move\)$/u, "");
  if (!headingText) throw new Error("Bulbapedia Move target: page heading is invalid");

  const expectedUrl = new URL(buildBulbapediaMoveTargetUrl(headingText));
  if (decodeURIComponent(expectedUrl.pathname) !== decodeURIComponent(url.pathname)) {
    throw new Error("Bulbapedia Move target: page heading does not match source URL");
  }

  const rangeAnchor = /<a\b[^>]*href=["']\/wiki\/Range["'][^>]*>\s*Range\s*<\/a>/i.exec(
    source.html,
  );
  if (!rangeAnchor || rangeAnchor.index === undefined) {
    throw new Error("Bulbapedia Move target: structured Range block is missing");
  }
  const remainder = source.html.slice(rangeAnchor.index + rangeAnchor[0].length);
  const availability = /<b>\s*Availability\s*<\/b>/i.exec(remainder);
  const rangeBlock = remainder.slice(0, availability?.index ?? remainder.length);
  const normalRangeRows = [...rangeBlock.matchAll(/<small\b[^>]*>([\s\S]*?)<\/small>/gi)]
    .map((match) => visibleText(match[1]))
    .filter((text) => text.startsWith("Normal:"));
  if (normalRangeRows.length !== 1) {
    throw new Error(
      `Bulbapedia Move target: expected exactly one Normal Range row, found ${normalRangeRows.length}`,
    );
  }
  const sourceTarget = RANGE_TARGETS[normalRangeRows[0]];
  if (!sourceTarget) {
    throw new Error(
      `Bulbapedia Move target: unmapped structured Range ${JSON.stringify(normalRangeRows[0])}`,
    );
  }

  return {
    sourceKey: canonicalizeBulbapediaMoveName(headingText),
    sourceName: headingText,
    sourceTarget,
    sourceRecordId: source.sourceRecordId,
  };
}
