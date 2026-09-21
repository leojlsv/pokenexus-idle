import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "./canonical.js";

export const POKEMONDB_ROBOTS_URL = "https://pokemondb.net/robots.txt";
export const DEFAULT_INGESTION_USER_AGENT =
  "PokeNexusGameDataBot/1.0 (static-data maintenance; no runtime crawling)";

interface RobotsRule {
  kind: "allow" | "disallow";
  pattern: string;
}

export interface RobotsPolicy {
  crawlDelayMs: number;
  disallowPaths: string[];
  allowPaths: string[];
  allows(url: URL): boolean;
}

export interface FetchedMaintenanceSource {
  url: string;
  bytes: Buffer;
  sourceContentHash: string;
  fetchedAt: string;
  fetchStatus: "fetched" | "cache";
}

export type FetchedPokemonDbSource = FetchedMaintenanceSource;

export interface MaintenanceFetchOptions {
  cacheDirectory: string;
  fetchImpl?: typeof fetch;
  userAgent?: string;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  retryBaseDelayMs?: number;
  maxRetries?: number;
  minimumDelayMs?: number;
  now?: () => string;
}

export type PokemonDbFetchOptions = MaintenanceFetchOptions;

export interface PokemonDbFetchResult {
  robotsPolicy: RobotsPolicy;
  sources: FetchedPokemonDbSource[];
}

export interface MaintenanceFetchProvider {
  hostname: string;
  robotsUrl: string;
  providerLabel: string;
}

export interface MaintenanceFetchResult {
  robotsPolicy: RobotsPolicy;
  sources: FetchedMaintenanceSource[];
}

export const POKEMONDB_PROVIDER: MaintenanceFetchProvider = {
  hostname: "pokemondb.net",
  robotsUrl: POKEMONDB_ROBOTS_URL,
  providerLabel: "PokémonDB",
};

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelaySeconds: number | null;
}

class PermanentFetchError extends Error {}

export class MaintenanceFetchHttpError extends PermanentFetchError {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MaintenanceFetchHttpError";
  }
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stripComment(line: string): string {
  const comment = line.indexOf("#");
  return (comment >= 0 ? line.slice(0, comment) : line).trim();
}

function parseDirective(line: string): { key: string; value: string } | null {
  const separator = line.indexOf(":");
  if (separator < 0) return null;
  return {
    key: line.slice(0, separator).trim().toLowerCase(),
    value: line.slice(separator + 1).trim(),
  };
}

function robotsPatternRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`);
}

function ruleMatchLength(rule: RobotsRule, target: string): number {
  if (rule.pattern === "") return rule.kind === "allow" ? 0 : -1;
  return robotsPatternRegex(rule.pattern).test(target)
    ? rule.pattern.replace(/[*$]/g, "").length
    : -1;
}

function selectApplicableGroups(groups: RobotsGroup[], userAgent: string): RobotsGroup[] {
  const token = userAgent.split(/[\s/]/, 1)[0].toLowerCase();
  const specific = groups.filter((group) =>
    group.agents.some((agent) => agent !== "*" && token.startsWith(agent.toLowerCase())),
  );
  if (specific.length > 0) return specific;
  return groups.filter((group) => group.agents.includes("*"));
}

export function parseRobotsPolicyForHost(
  text: string,
  userAgent: string,
  hostname: string,
): RobotsPolicy {
  if (!userAgent.trim()) throw new Error("robots policy requires a descriptive User-Agent");
  if (!hostname.trim()) throw new Error("robots policy requires an expected hostname");
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let sawRules = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine);
    if (!line) continue;
    const directive = parseDirective(line);
    if (!directive) continue;
    if (directive.key === "user-agent") {
      if (!directive.value) throw new Error("robots.txt contains an empty User-agent directive");
      if (current === null || sawRules) {
        current = { agents: [], rules: [], crawlDelaySeconds: null };
        groups.push(current);
        sawRules = false;
      }
      current.agents.push(directive.value.toLowerCase());
      continue;
    }
    if (current === null) continue;
    if (directive.key === "allow" || directive.key === "disallow") {
      current.rules.push({ kind: directive.key, pattern: directive.value });
      sawRules = true;
      continue;
    }
    if (directive.key === "crawl-delay") {
      sawRules = true;
      if (!/^\d+(?:\.\d+)?$/.test(directive.value)) {
        current.crawlDelaySeconds = Number.NaN;
      } else {
        current.crawlDelaySeconds = Number(directive.value);
      }
    }
  }

  const applicable = selectApplicableGroups(groups, userAgent);
  if (applicable.length === 0) {
    throw new Error("robots.txt has no safely applicable User-agent policy");
  }
  const delays = applicable
    .map((group) => group.crawlDelaySeconds)
    .filter((value): value is number => value !== null);
  if (delays.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("robots.txt contains malformed applicable Crawl-delay policy");
  }
  const rules = applicable.flatMap((group) => group.rules);
  const crawlDelayMs = delays.length > 0 ? Math.ceil(Math.max(...delays) * 1000) : 0;
  const disallowPaths = rules.filter((rule) => rule.kind === "disallow" && rule.pattern).map((rule) => rule.pattern);
  const allowPaths = rules.filter((rule) => rule.kind === "allow" && rule.pattern).map((rule) => rule.pattern);

  return {
    crawlDelayMs,
    disallowPaths,
    allowPaths,
    allows(url: URL): boolean {
      if (url.protocol !== "https:" || url.hostname !== hostname) return false;
      const target = `${url.pathname}${url.search}`;
      let selected: RobotsRule | null = null;
      let longest = -1;
      for (const rule of rules) {
        const length = ruleMatchLength(rule, target);
        if (length > longest || (length === longest && length >= 0 && rule.kind === "allow")) {
          selected = rule;
          longest = length;
        }
      }
      return selected?.kind !== "disallow";
    },
  };
}

export function parseRobotsPolicy(text: string, userAgent: string): RobotsPolicy {
  return parseRobotsPolicyForHost(text, userAgent, "pokemondb.net");
}

function assertProviderUrl(rawUrl: string, provider: MaintenanceFetchProvider): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`invalid source URL: ${rawUrl}`);
  }
  if (url.protocol !== "https:" || url.hostname !== provider.hostname) {
    throw new Error(
      `${provider.providerLabel} maintenance ingestion only permits https://${provider.hostname} URLs: ${rawUrl}`,
    );
  }
  return url;
}

function cachePath(cacheDirectory: string, url: string): string {
  const digest = createHash("sha256").update(Buffer.from(url, "utf8")).digest("hex");
  return join(cacheDirectory, `${digest}.bin`);
}

function cacheMetadataPath(cacheDirectory: string, url: string): string {
  const digest = createHash("sha256").update(Buffer.from(url, "utf8")).digest("hex");
  return join(cacheDirectory, `${digest}.json`);
}

interface CacheMetadata {
  fetchedAt: string;
  sourceContentHash: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function writeCacheAtomic(path: string, bytes: Buffer): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

function parseCacheMetadata(value: unknown, url: string): CacheMetadata {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid cache metadata for ${url}`);
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.fetchedAt !== "string" ||
    Number.isNaN(Date.parse(record.fetchedAt)) ||
    typeof record.sourceContentHash !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(record.sourceContentHash)
  ) {
    throw new Error(`invalid cache metadata for ${url}`);
  }
  return {
    fetchedAt: record.fetchedAt,
    sourceContentHash: record.sourceContentHash,
  };
}

async function responseBytes(response: Response): Promise<Buffer> {
  return Buffer.from(await response.arrayBuffer());
}

async function fetchRobots(
  fetchImpl: typeof fetch,
  userAgent: string,
  provider: MaintenanceFetchProvider,
  options: Required<Pick<MaintenanceFetchOptions, "sleep" | "random" | "retryBaseDelayMs" | "maxRetries">>,
): Promise<RobotsPolicy> {
  const bytes = await fetchWithRetry(
    new URL(provider.robotsUrl),
    fetchImpl,
    userAgent,
    0,
    provider,
    options,
  );
  return parseRobotsPolicyForHost(bytes.toString("utf8"), userAgent, provider.hostname);
}

export async function fetchMaintenanceRobotsPolicy(
  options: MaintenanceFetchOptions,
  provider: MaintenanceFetchProvider,
): Promise<RobotsPolicy> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const userAgent = options.userAgent ?? DEFAULT_INGESTION_USER_AGENT;
  if (!/pokenexus/i.test(userAgent)) {
    throw new Error("ingestion User-Agent must identify PokeNexus descriptively");
  }
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
  const maxRetries = options.maxRetries ?? 3;
  if (!Number.isFinite(retryBaseDelayMs) || retryBaseDelayMs < 0) {
    throw new TypeError("retryBaseDelayMs must be non-negative");
  }
  if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) {
    throw new TypeError("maxRetries must be a non-negative integer");
  }
  return fetchRobots(fetchImpl, userAgent, provider, {
    sleep,
    random,
    retryBaseDelayMs,
    maxRetries,
  });
}

async function fetchWithRetry(
  url: URL,
  fetchImpl: typeof fetch,
  userAgent: string,
  policyDelayMs: number,
  provider: MaintenanceFetchProvider,
  options: Required<Pick<MaintenanceFetchOptions, "sleep" | "random" | "retryBaseDelayMs" | "maxRetries">>,
): Promise<Buffer> {
  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    if (policyDelayMs > 0) await options.sleep(policyDelayMs);
    try {
      const response = await fetchImpl(url, {
        headers: { "user-agent": userAgent },
        redirect: "error",
      });
      if (response.url) {
        const finalUrl = new URL(response.url);
        if (
          finalUrl.protocol !== "https:" ||
          finalUrl.hostname !== provider.hostname ||
          finalUrl.href !== url.href
        ) {
          throw new PermanentFetchError(
            `${provider.providerLabel} response URL mismatch for ${url.href}: ${finalUrl.href}`,
          );
        }
      }
      if (response.ok) return await responseBytes(response);
      const transient = response.status === 429 || response.status >= 500;
      if (!transient) {
        throw new MaintenanceFetchHttpError(
          `${provider.providerLabel} request failed for ${url.href} with HTTP ${response.status}`,
          response.status,
        );
      }
      if (attempt === options.maxRetries) {
        throw new Error(
          `${provider.providerLabel} request failed for ${url.href} with HTTP ${response.status} after retries`,
        );
      }
    } catch (error) {
      if (error instanceof PermanentFetchError) throw error;
      if (attempt === options.maxRetries) throw error;
    }
    const exponential = options.retryBaseDelayMs * 2 ** attempt;
    const jitter = Math.floor(options.random() * options.retryBaseDelayMs);
    await options.sleep(exponential + jitter);
  }
  throw new Error("unreachable retry state");
}

export async function fetchMaintenanceSources(
  sourceUrls: string[],
  options: MaintenanceFetchOptions,
  provider: MaintenanceFetchProvider,
  preparedRobotsPolicy?: RobotsPolicy,
): Promise<MaintenanceFetchResult> {
  const urls = sourceUrls.map((url) => assertProviderUrl(url, provider));
  const fetchImpl = options.fetchImpl ?? fetch;
  const userAgent = options.userAgent ?? DEFAULT_INGESTION_USER_AGENT;
  if (!/pokenexus/i.test(userAgent)) throw new Error("ingestion User-Agent must identify PokeNexus descriptively");
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
  const maxRetries = options.maxRetries ?? 3;
  const minimumDelayMs = options.minimumDelayMs ?? 0;
  const now = options.now ?? (() => new Date().toISOString());
  if (!Number.isFinite(retryBaseDelayMs) || retryBaseDelayMs < 0) throw new TypeError("retryBaseDelayMs must be non-negative");
  if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) throw new TypeError("maxRetries must be a non-negative integer");
  if (!Number.isFinite(minimumDelayMs) || minimumDelayMs < 0) throw new TypeError("minimumDelayMs must be non-negative");

  const policy =
    preparedRobotsPolicy ??
    (await fetchRobots(fetchImpl, userAgent, provider, {
      sleep,
      random,
      retryBaseDelayMs,
      maxRetries,
    }));
  const effectiveDelayMs = Math.max(policy.crawlDelayMs, minimumDelayMs);
  await mkdir(options.cacheDirectory, { recursive: true });
  const sources: FetchedMaintenanceSource[] = [];

  for (const url of urls) {
    if (!policy.allows(url)) throw new Error(`robots.txt disallows canonical ingestion URL ${url.href}`);
    const path = cachePath(options.cacheDirectory, url.href);
    const metadataPath = cacheMetadataPath(options.cacheDirectory, url.href);
    if ((await exists(path)) && (await exists(metadataPath))) {
      const bytes = await readFile(path);
      const metadata = parseCacheMetadata(
        JSON.parse(await readFile(metadataPath, "utf8")) as unknown,
        url.href,
      );
      const actualHash = sha256(bytes);
      if (actualHash !== metadata.sourceContentHash) {
        throw new Error(`cached source hash mismatch for ${url.href}`);
      }
      sources.push({
        url: url.href,
        bytes,
        sourceContentHash: actualHash,
        fetchedAt: metadata.fetchedAt,
        fetchStatus: "cache",
      });
      continue;
    }
    const bytes = await fetchWithRetry(url, fetchImpl, userAgent, effectiveDelayMs, provider, {
      sleep,
      random,
      retryBaseDelayMs,
      maxRetries,
    });
    const sourceContentHash = sha256(bytes);
    const fetchedAt = now();
    if (Number.isNaN(Date.parse(fetchedAt))) throw new Error("ingestion clock returned an invalid timestamp");
    await writeCacheAtomic(path, bytes);
    await writeCacheAtomic(
      metadataPath,
      Buffer.from(JSON.stringify({ fetchedAt, sourceContentHash } satisfies CacheMetadata), "utf8"),
    );
    sources.push({
      url: url.href,
      bytes,
      sourceContentHash,
      fetchedAt,
      fetchStatus: "fetched",
    });
  }

  return { robotsPolicy: policy, sources };
}

export async function fetchPokemonDbSources(
  sourceUrls: string[],
  options: PokemonDbFetchOptions,
  preparedRobotsPolicy?: RobotsPolicy,
): Promise<PokemonDbFetchResult> {
  return fetchMaintenanceSources(
    sourceUrls,
    options,
    POKEMONDB_PROVIDER,
    preparedRobotsPolicy,
  );
}

export async function fetchPokemonDbRobotsPolicy(
  options: PokemonDbFetchOptions,
): Promise<RobotsPolicy> {
  return fetchMaintenanceRobotsPolicy(options, POKEMONDB_PROVIDER);
}
