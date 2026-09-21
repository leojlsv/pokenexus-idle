import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BULBAPEDIA_ROBOTS_URL,
  BULBAPEDIA_MOVE_REFERENCE_URLS,
  fetchBulbapediaMoveReferenceSources,
  fetchBulbapediaZaMoveListSource,
} from "./bulbapedia-ingestion";
import { BULBAPEDIA_ZA_MOVE_LIST_URL } from "./bulbapedia-za-parser";

const tempRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "pokenexus-bulbapedia-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
  vi.restoreAllMocks();
});

const robots = [
  "User-agent: *",
  "Allow: /wiki/",
  "Disallow: /wiki/Special:Search",
  "Crawl-delay: 5",
  "",
].join("\n");

describe("Bulbapedia maintenance-only fetching", () => {
  it("uses Bulbapedia robots independently and observes its crawl delay", async () => {
    const cacheDirectory = await temporaryRoot();
    const calls: string[] = [];
    const sleeps: number[] = [];
    const fetchImpl: typeof fetch = vi.fn(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === BULBAPEDIA_ROBOTS_URL) return new Response(robots, { status: 200 });
      return new Response("<html>z-a source bytes</html>", { status: 200 });
    }) as typeof fetch;

    const result = await fetchBulbapediaZaMoveListSource({
      cacheDirectory,
      fetchImpl,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      random: () => 0,
      now: () => "2026-09-19T12:00:00.000Z",
    });

    expect(calls).toEqual([BULBAPEDIA_ROBOTS_URL, BULBAPEDIA_ZA_MOVE_LIST_URL]);
    expect(sleeps).toContain(5000);
    expect(result.robotsPolicy.allows(new URL(BULBAPEDIA_ZA_MOVE_LIST_URL))).toBe(true);
    expect(
      result.robotsPolicy.allows(
        new URL("https://bulbapedia.bulbagarden.net/wiki/Special:Search"),
      ),
    ).toBe(false);
    expect(result.sources[0].sourceContentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("rechecks Bulbapedia robots while serving cached source bytes", async () => {
    const cacheDirectory = await temporaryRoot();
    let pageRequests = 0;
    const fetchImpl: typeof fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === BULBAPEDIA_ROBOTS_URL) return new Response(robots, { status: 200 });
      pageRequests += 1;
      return new Response("stable-z-a-source", { status: 200 });
    }) as typeof fetch;
    const options = {
      cacheDirectory,
      fetchImpl,
      sleep: async () => undefined,
      random: () => 0,
      now: () => "2026-09-19T12:00:00.000Z",
    };

    const first = await fetchBulbapediaZaMoveListSource(options);
    const second = await fetchBulbapediaZaMoveListSource(options);

    expect(pageRequests).toBe(1);
    expect(second.sources[0].bytes).toEqual(first.sources[0].bytes);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("fetches the complete Move reference set under one independently evaluated robots policy", async () => {
    const cacheDirectory = await temporaryRoot();
    const calls: string[] = [];
    const fetchImpl: typeof fetch = vi.fn(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === BULBAPEDIA_ROBOTS_URL) return new Response(robots, { status: 200 });
      return new Response(`<html data-source="${url}"></html>`, { status: 200 });
    }) as typeof fetch;

    const result = await fetchBulbapediaMoveReferenceSources({
      cacheDirectory,
      fetchImpl,
      sleep: async () => undefined,
      random: () => 0,
      now: () => "2026-09-19T12:00:00.000Z",
    });

    expect(calls).toEqual([BULBAPEDIA_ROBOTS_URL, ...BULBAPEDIA_MOVE_REFERENCE_URLS]);
    expect(result.sources.map((source) => source.url)).toEqual(BULBAPEDIA_MOVE_REFERENCE_URLS);
  });
});
