import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  POKEMONDB_ROBOTS_URL,
  fetchPokemonDbSources,
  parseRobotsPolicy,
} from "./ingestion";

const tempRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "pokenexus-ingestion-"));
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
  "Disallow: /pokebase/search?",
  "Crawl-delay: 2",
  "",
].join("\n");

describe("PokémonDB robots policy", () => {
  it("reads crawl delay and disallowed paths for the descriptive crawler", () => {
    const policy = parseRobotsPolicy(robots, "PokeNexusGameDataBot/1.0");
    expect(policy.crawlDelayMs).toBe(2000);
    expect(policy.disallowPaths).toContain("/pokebase/search?");
    expect(policy.allows(new URL("https://pokemondb.net/pokedex/bulbasaur"))).toBe(true);
    expect(
      policy.allows(new URL("https://pokemondb.net/pokebase/search?q=x")),
    ).toBe(false);
  });

  it("fails closed on malformed applicable crawl-delay policy", () => {
    expect(() =>
      parseRobotsPolicy(
        "User-agent: *\nCrawl-delay: someday\n",
        "PokeNexusGameDataBot/1.0",
      ),
    ).toThrow(/crawl-delay/i);
  });
});

describe("PokémonDB controlled fetching", () => {
  it("fetches robots first, stays sequential, and observes the crawl delay", async () => {
    const cacheDirectory = await temporaryRoot();
    const calls: string[] = [];
    const active: number[] = [];
    let inFlight = 0;
    const fetchImpl: typeof fetch = vi.fn(async (input) => {
      const url = String(input);
      calls.push(url);
      inFlight += 1;
      active.push(inFlight);
      await Promise.resolve();
      inFlight -= 1;
      if (url === POKEMONDB_ROBOTS_URL) {
        return new Response(robots, { status: 200 });
      }
      return new Response(`<main data-url="${url}"></main>`, { status: 200 });
    }) as typeof fetch;
    const sleeps: number[] = [];

    const result = await fetchPokemonDbSources(
      [
        "https://pokemondb.net/pokedex/bulbasaur",
        "https://pokemondb.net/move/tackle",
      ],
      {
        cacheDirectory,
        fetchImpl,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        random: () => 0,
      },
    );

    expect(calls[0]).toBe(POKEMONDB_ROBOTS_URL);
    expect(calls.slice(1)).toEqual([
      "https://pokemondb.net/pokedex/bulbasaur",
      "https://pokemondb.net/move/tackle",
    ]);
    expect(Math.max(...active)).toBe(1);
    expect(sleeps.filter((value) => value >= 2000)).toHaveLength(2);
    expect(result.sources.map((source) => source.sourceContentHash)).toEqual([
      expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    ]);
  });

  it("rechecks robots every run but serves page bytes from local cache", async () => {
    const cacheDirectory = await temporaryRoot();
    const pageUrl = "https://pokemondb.net/pokedex/bulbasaur";
    let pageRequests = 0;
    const fetchImpl: typeof fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === POKEMONDB_ROBOTS_URL) {
        return new Response(robots, { status: 200 });
      }
      pageRequests += 1;
      return new Response("exact-source-bytes", { status: 200 });
    }) as typeof fetch;
    const options = {
      cacheDirectory,
      fetchImpl,
      sleep: async () => undefined,
      random: () => 0,
    };

    const first = await fetchPokemonDbSources([pageUrl], options);
    const second = await fetchPokemonDbSources([pageUrl], options);

    expect(pageRequests).toBe(1);
    expect(second.sources[0].bytes).toEqual(first.sources[0].bytes);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("retries transient responses with backoff and never falls back to another provider", async () => {
    const cacheDirectory = await temporaryRoot();
    let attempts = 0;
    const sleeps: number[] = [];
    const fetchImpl: typeof fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === POKEMONDB_ROBOTS_URL) {
        return new Response(robots, { status: 200 });
      }
      attempts += 1;
      return attempts === 1
        ? new Response("retry", { status: 503 })
        : new Response("ok", { status: 200 });
    }) as typeof fetch;

    await fetchPokemonDbSources(["https://pokemondb.net/move/tackle"], {
      cacheDirectory,
      fetchImpl,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
      retryBaseDelayMs: 250,
    });

    expect(attempts).toBe(2);
    expect(sleeps).toContain(250);
    await expect(
      fetchPokemonDbSources(["https://pokeapi.co/api/v2/pokemon/1"], {
        cacheDirectory,
        fetchImpl,
        sleep: async () => undefined,
        random: () => 0,
      }),
    ).rejects.toThrow(/pokemondb\.net/i);
  });

  it("fails immediately on permanent HTTP errors instead of retrying them", async () => {
    const cacheDirectory = await temporaryRoot();
    let pageAttempts = 0;
    const fetchImpl: typeof fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === POKEMONDB_ROBOTS_URL) return new Response(robots, { status: 200 });
      pageAttempts += 1;
      return new Response("missing", { status: 404 });
    }) as typeof fetch;

    await expect(
      fetchPokemonDbSources(["https://pokemondb.net/move/missing"], {
        cacheDirectory,
        fetchImpl,
        sleep: async () => undefined,
        random: () => 0,
        maxRetries: 3,
      }),
    ).rejects.toThrow(/HTTP 404/);
    expect(pageAttempts).toBe(1);
  });
});
