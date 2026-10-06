import { applyResponsePolicy, type ClientDirective } from "./client-policy";

export interface CollectionPokemon {
  readonly pokemonInstanceId: string;
  readonly speciesId: string;
  readonly level: number;
  readonly selectedAbilityId: string | null;
  readonly rowVersion: string;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface PokemonDetail extends CollectionPokemon {
  readonly ivs: {
    readonly hp: number;
    readonly atk: number;
    readonly def: number;
    readonly spa: number;
    readonly spd: number;
    readonly spe: number;
  };
  readonly moveLoadout: { readonly state: "uninitialized" | "selected"; readonly moveIds: readonly string[] };
}

export interface PokemonProgression {
  readonly pokemonInstanceId: string;
  readonly level: number;
  readonly totalExperience: string;
  readonly rowVersion: string;
}

export interface TeamSummary {
  readonly teamId: string;
  readonly rowVersion: string;
}

export interface TeamPage {
  readonly teamLimit: number;
  readonly teams: readonly TeamSummary[];
  readonly nextCursor: string | null;
}

export interface SavedTeam extends TeamSummary {
  readonly pokemonInstanceIds: readonly string[];
}

export interface PlayerProfile {
  readonly playerId: string;
}

export class PlayerApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly directive: ClientDirective,
    readonly retryAfter: string | null,
    readonly detail?: { readonly pokemonInstanceId?: string; readonly moveId?: string; readonly reason?: string },
  ) {
    super(code);
    this.name = "PlayerApiError";
  }
}

type Fetcher = typeof fetch;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DECIMAL_PATTERN = /^(0|[1-9][0-9]*)$/;
const PG_SIGNED_BIGINT_MAX = 9_223_372_036_854_775_807n;
const PLAYER_CURSOR_MAX_LENGTH = 4096;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Player API response");
  return value as Record<string, unknown>;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new Error("Invalid Player API resource identity");
  return value;
}

function decimal(value: unknown): string {
  if (
    typeof value !== "string" ||
    !DECIMAL_PATTERN.test(value) ||
    BigInt(value) > PG_SIGNED_BIGINT_MAX
  ) throw new Error("Invalid Player API decimal version");
  return value;
}

function pageCursor(value: unknown): string | null {
  if (value !== null && (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > PLAYER_CURSOR_MAX_LENGTH
  )) {
    throw new Error("Invalid Player API pagination cursor");
  }
  return value;
}

function pokemonSummary(value: unknown): CollectionPokemon {
  const data = record(value);
  if (typeof data.speciesId !== "string" || data.speciesId.length === 0 ||
      !Number.isInteger(data.level) || (data.level as number) < 1 ||
      !(typeof data.selectedAbilityId === "string" || data.selectedAbilityId === null)) {
    throw new Error("Invalid Player API Pokémon summary");
  }
  return {
    pokemonInstanceId: uuid(data.pokemonInstanceId),
    speciesId: data.speciesId,
    level: data.level as number,
    selectedAbilityId: data.selectedAbilityId,
    rowVersion: decimal(data.rowVersion),
  } as CollectionPokemon;
}

function teamSummary(value: unknown): TeamSummary {
  const data = record(value);
  return { teamId: uuid(data.teamId), rowVersion: decimal(data.rowVersion) };
}

function roster(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 6) throw new Error("Invalid Player API Team roster");
  const ids = value.map(uuid);
  if (new Set(ids).size !== ids.length) throw new Error("Invalid duplicate Player API Team member");
  return ids;
}

function savedTeam(value: unknown): SavedTeam {
  const data = record(value);
  return { ...teamSummary(data), pokemonInstanceIds: roster(data.pokemonInstanceIds) };
}

interface RequestSettings {
  readonly signal?: AbortSignal;
  readonly method?: "GET" | "POST" | "PUT" | "DELETE";
  readonly csrfToken?: string;
  readonly idempotencyKey?: string;
  readonly body?: object;
  readonly expectedSuccessStatus?: number;
}

function errorFields(value: unknown): {
  code: string;
  detail?: { readonly pokemonInstanceId?: string; readonly moveId?: string; readonly reason?: string };
} {
  if (typeof value !== "object" || value === null) return { code: "invalid_response" };
  const body = value as Record<string, unknown>;
  return {
    code: typeof body.error === "string" ? body.error : "invalid_response",
    detail: {
      ...(typeof body.pokemonInstanceId === "string" ? { pokemonInstanceId: body.pokemonInstanceId } : {}),
      ...(typeof body.moveId === "string" ? { moveId: body.moveId } : {}),
      ...(typeof body.reason === "string" ? { reason: body.reason } : {}),
    },
  };
}

export class PlayerApi {
  constructor(private readonly transport: Fetcher = fetch) {}

  private async request<T>(path: string, settings: RequestSettings = {}): Promise<T> {
    const method = settings.method ?? "GET";
    if (method !== "GET" && !settings.csrfToken) throw new Error("Authenticated CSRF token required");
    const response = await this.transport(path, {
      method,
      credentials: "include",
      redirect: "error",
      headers: {
        Accept: "application/json",
        ...(settings.csrfToken ? { "X-CSRF-Token": settings.csrfToken } : {}),
        ...(settings.idempotencyKey ? { "Idempotency-Key": settings.idempotencyKey } : {}),
        ...(settings.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(settings.body ? { body: JSON.stringify(settings.body) } : {}),
      signal: settings.signal,
    });
    if (response.ok) {
      if (settings.expectedSuccessStatus !== undefined && response.status !== settings.expectedSuccessStatus) {
        throw new Error("Unexpected Player API success status; reconcile authoritative state");
      }
      if (response.status === 204) return undefined as T;
      return await response.json() as T;
    }
    let parsed: unknown = null;
    try {
      parsed = await response.json() as unknown;
    } catch {
      // The status still determines session invalidation even when a proxy returns a non-JSON error.
    }
    const { code, detail } = errorFields(parsed);
    const retryAfter = response.headers.get("Retry-After");
    throw new PlayerApiError(
      response.status,
      code,
      applyResponsePolicy(response.status, code, retryAfter),
      retryAfter,
      detail,
    );
  }

  collection(cursor: string | null = null, signal?: AbortSignal): Promise<Page<CollectionPokemon>> {
    const query = new URLSearchParams({ limit: "50" });
    if (cursor !== null) query.set("cursor", cursor);
    return this.request<unknown>(`/player/collection?${query.toString()}`, { signal }).then((value) => {
      const data = record(value);
      if (!Array.isArray(data.items)) throw new Error("Invalid Player API Collection page");
      const items = data.items.map(pokemonSummary);
      if (new Set(items.map((pokemon) => pokemon.pokemonInstanceId)).size !== items.length) {
        throw new Error("Duplicate Player API Collection identity");
      }
      return { items, nextCursor: pageCursor(data.nextCursor) };
    });
  }

  pokemon(instanceId: string, signal?: AbortSignal): Promise<PokemonDetail> {
    return this.request<unknown>(`/player/pokemon/${encodeURIComponent(instanceId)}`, { signal }).then((value) => {
      const data = record(value);
      const ivs = record(data.ivs);
      const keys = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
      for (const key of keys) {
        if (!Number.isInteger(ivs[key]) || (ivs[key] as number) < 0 || (ivs[key] as number) > 31) {
          throw new Error("Invalid Player API individual values");
        }
      }
      const moves = record(data.moveLoadout);
      if ((moves.state !== "uninitialized" && moves.state !== "selected") || !Array.isArray(moves.moveIds)
        || moves.moveIds.some((move: unknown) => typeof move !== "string" || !move)
        || (moves.state === "uninitialized" && moves.moveIds.length !== 0)
        || (moves.state === "selected" && (moves.moveIds.length < 1 || moves.moveIds.length > 4))
        || new Set(moves.moveIds).size !== moves.moveIds.length) {
        throw new Error("Invalid Player API selected Move state");
      }
      const summary = pokemonSummary(data);
      if (summary.pokemonInstanceId !== instanceId) throw new Error("Player API Pokémon identity mismatch");
      return { ...summary, ivs: ivs as unknown as PokemonDetail["ivs"],
        moveLoadout: { state: moves.state, moveIds: moves.moveIds as string[] } };
    });
  }

  progression(instanceId: string, signal?: AbortSignal): Promise<PokemonProgression> {
    return this.request<unknown>(`/player/pokemon/${encodeURIComponent(instanceId)}/progression`, { signal }).then((value) => {
      const data = record(value);
      if (!Number.isInteger(data.level) || (data.level as number) < 1) throw new Error("Invalid Pokémon progression level");
      const pokemonInstanceId = uuid(data.pokemonInstanceId);
      if (pokemonInstanceId !== instanceId) throw new Error("Player API progression identity mismatch");
      return { pokemonInstanceId, level: data.level as number,
        totalExperience: decimal(data.totalExperience), rowVersion: decimal(data.rowVersion) };
    });
  }

  teams(cursor: string | null = null, signal?: AbortSignal): Promise<TeamPage> {
    const query = new URLSearchParams({ limit: "50" });
    if (cursor !== null) query.set("cursor", cursor);
    return this.request<unknown>(`/player/teams?${query.toString()}`, { signal }).then((value) => {
      const data = record(value);
      if (!Array.isArray(data.teams) || data.teamLimit !== 6) {
        throw new Error("Invalid Player API Teams page");
      }
      const teams = data.teams.map(teamSummary);
      if (new Set(teams.map((team) => team.teamId)).size !== teams.length) {
        throw new Error("Duplicate Player API Team identity");
      }
      return { teamLimit: 6, teams, nextCursor: pageCursor(data.nextCursor) };
    });
  }

  team(teamId: string, signal?: AbortSignal): Promise<SavedTeam> {
    return this.request<unknown>(`/player/teams/${encodeURIComponent(teamId)}`, { signal }).then((value) => {
      const saved = savedTeam(value);
      if (saved.teamId !== teamId) throw new Error("Player API Team identity mismatch");
      return saved;
    });
  }

  createTeam(csrfToken: string, idempotencyKey: string): Promise<TeamSummary> {
    return this.request<unknown>("/player/teams", {
      method: "POST", csrfToken, idempotencyKey, expectedSuccessStatus: 200,
    }).then(teamSummary);
  }

  replaceRoster(teamId: string, csrfToken: string, expectedRowVersion: string, pokemonInstanceIds: readonly string[]): Promise<SavedTeam> {
    return this.request<unknown>(`/player/teams/${encodeURIComponent(teamId)}/roster`, {
      method: "PUT", csrfToken, body: { expectedRowVersion, pokemonInstanceIds }, expectedSuccessStatus: 200,
    }).then((value) => {
      const saved = savedTeam(value);
      if (saved.teamId !== teamId ||
        saved.pokemonInstanceIds.length !== pokemonInstanceIds.length ||
        saved.pokemonInstanceIds.some((id, index) => id !== pokemonInstanceIds[index])) {
        throw new Error("Player API saved roster did not match the submitted intent; reconcile authoritative state");
      }
      return saved;
    });
  }

  deleteTeam(teamId: string, csrfToken: string, expectedRowVersion: string): Promise<void> {
    const query = new URLSearchParams({ expectedRowVersion });
    return this.request(`/player/teams/${encodeURIComponent(teamId)}?${query.toString()}`, {
      method: "DELETE", csrfToken, expectedSuccessStatus: 204,
    });
  }

  createProfile(csrfToken: string): Promise<PlayerProfile> {
    return this.request<unknown>("/player/profile", { method: "PUT", csrfToken, expectedSuccessStatus: 200 })
      .then((value) => {
        const data = record(value);
        return { playerId: uuid(data.playerId) };
      });
  }
}

export function playerErrorText(error: unknown): string {
  if (!(error instanceof PlayerApiError)) {
    return "The request may not have reached the server, or its response was lost. Check the authoritative state before trying again.";
  }
  if (error.directive.kind === "session_lost") return "Your session has expired. Sign in again.";
  if (error.directive.kind === "forbidden") return "The server rejected this command's authorization. Refresh your session before another action.";
  switch (error.code) {
    case "stale": return "This information changed on the server. Reload, compare the current version, and explicitly save again.";
    case "team_limit_reached": return "Saved Team capacity is full. Delete or edit an existing Team to reuse a slot.";
    case "team_create_rate_limited": return `Team creation is temporarily rate-limited${error.directive.kind === "rate_limited"
      && error.directive.retryAfterSeconds !== null ? ` (retry after ${error.directive.retryAfterSeconds} seconds)` : ""}.`;
    case "invalid_member": return `The server rejected an unowned roster member${error.detail?.pokemonInstanceId ? ` (${error.detail.pokemonInstanceId})` : ""}.`;
    case "idempotency_gone": return "The prior Team-create intent was deleted. That key cannot create a Team again.";
    case "not_found": return "This Player resource is unavailable or no longer exists.";
    case "forbidden": return "The server rejected this command's authorization. Refresh your session before another action.";
    case "unauthorized": return "Your session has expired. Sign in again.";
    case "authority_unavailable": return "The server cannot currently resolve this operation's authoritative data.";
    default: return `The server declined the request (${error.code}).`;
  }
}
