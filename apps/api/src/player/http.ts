import type { AuthSessionPrincipal } from "../auth/application";
import type { ApiApp, ApiContext } from "../auth/http";
import type { PlayerHttpApplication } from "./application";
import {
  PLAYER_MUTATION_BODY_MAX_BYTES,
  isBoundedMoveId,
  isCanonicalUuid,
  parsePageLimit,
  parsePgSignedBigintDecimal,
  type InventoryCursor,
  type PlayerCursorCodec,
} from "./protocol";

export interface PlayerRouteSecurity {
  requireSession(c: ApiContext): Promise<AuthSessionPrincipal | Response>;
  requireSessionMutation(c: ApiContext): Promise<AuthSessionPrincipal | Response>;
  requireCommandSession(c: ApiContext): Promise<AuthSessionPrincipal | Response>;
}

export interface RegisterPlayerRoutesOptions {
  readonly playerFor: (c: ApiContext) => PlayerHttpApplication;
  readonly cursorFor: (c: ApiContext) => PlayerCursorCodec;
  readonly security: PlayerRouteSecurity;
}

interface JsonObject {
  [key: string]: unknown;
}

function invalidRequest(c: ApiContext): Response {
  return c.json({ error: "invalid_request" }, 400);
}

function notFound(c: ApiContext): Response {
  return c.json({ error: "not_found" }, 404);
}

function exactKeys(value: JsonObject, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

async function readBoundedBody(c: ApiContext): Promise<Uint8Array | null> {
  const contentLength = c.req.header("Content-Length");
  if (contentLength !== undefined) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(contentLength)) return null;
    if (BigInt(contentLength) > BigInt(PLAYER_MUTATION_BODY_MAX_BYTES)) return null;
  }
  const stream = c.req.raw.body;
  if (stream === null) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.byteLength > PLAYER_MUTATION_BODY_MAX_BYTES) {
        await reader.cancel("player mutation body exceeds transport limit");
        return null;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function requireEmptyBody(c: ApiContext): Promise<boolean> {
  const bytes = await readBoundedBody(c);
  return bytes !== null && bytes.byteLength === 0;
}

async function readJsonObject(c: ApiContext): Promise<JsonObject | null> {
  const bytes = await readBoundedBody(c);
  if (!bytes || bytes.byteLength === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return null;
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? parsed as JsonObject
    : null;
}

function singleQueryValue(c: ApiContext, name: string): string | null | undefined {
  const values = new URL(c.req.url).searchParams.getAll(name);
  if (values.length > 1) return null;
  return values[0];
}

async function collectionPageInput(
  c: ApiContext,
  codec: PlayerCursorCodec,
): Promise<{ limit: number; afterPokemonInstanceId: string | null } | null> {
  const rawLimit = singleQueryValue(c, "limit");
  const rawCursor = singleQueryValue(c, "cursor");
  if (rawLimit === null || rawCursor === null) return null;
  const limit = parsePageLimit(rawLimit);
  if (limit === null) return null;
  if (rawCursor === undefined) return { limit, afterPokemonInstanceId: null };
  const cursor = await codec.decodeCollection(rawCursor);
  return cursor ? { limit, afterPokemonInstanceId: cursor.afterPokemonInstanceId } : null;
}

async function teamPageInput(
  c: ApiContext,
  codec: PlayerCursorCodec,
): Promise<{ limit: number; afterTeamId: string | null } | null> {
  const rawLimit = singleQueryValue(c, "limit");
  const rawCursor = singleQueryValue(c, "cursor");
  if (rawLimit === null || rawCursor === null) return null;
  const limit = parsePageLimit(rawLimit);
  if (limit === null) return null;
  if (rawCursor === undefined) return { limit, afterTeamId: null };
  const cursor = await codec.decodeTeams(rawCursor);
  return cursor ? { limit, afterTeamId: cursor.afterTeamId } : null;
}

async function inventoryPageInput(
  c: ApiContext,
  codec: PlayerCursorCodec,
): Promise<{
  limit: number;
  expectedRowVersion: bigint | null;
  afterItemId: string | null;
} | null> {
  const rawLimit = singleQueryValue(c, "limit");
  const rawCursor = singleQueryValue(c, "cursor");
  if (rawLimit === null || rawCursor === null) return null;
  const limit = parsePageLimit(rawLimit);
  if (limit === null) return null;
  if (rawCursor === undefined) {
    return { limit, expectedRowVersion: null, afterItemId: null };
  }
  const cursor = await codec.decodeInventory(rawCursor);
  return cursor
    ? {
      limit,
      expectedRowVersion: cursor.rowVersion,
      afterItemId: cursor.afterItemId,
    }
    : null;
}

function pokemonLevelNumber(level: bigint): number {
  if (level < 1n || level > 200n) throw new Error("Persisted Pokémon level is outside v1 bounds");
  return Number(level);
}

function uuidArray(value: unknown, maximumLength: number): readonly string[] | null {
  if (!Array.isArray(value) || value.length > maximumLength) return null;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isCanonicalUuid(entry) || seen.has(entry)) return null;
    seen.add(entry);
    ids.push(entry);
  }
  return ids;
}

function moveIdArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) return null;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isBoundedMoveId(entry) || seen.has(entry)) return null;
    seen.add(entry);
    ids.push(entry);
  }
  return ids;
}

function retryAfterSeconds(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 86_400) {
    throw new Error("Team-create Retry-After is outside the accepted bounded range");
  }
  return String(value);
}

export function registerPlayerRoutes(app: ApiApp, options: RegisterPlayerRoutesOptions): void {
  app.get("/player/profile", async (c) => {
    const principal = await options.security.requireSession(c);
    if (principal instanceof Response) return principal;

    const profile = await options.playerFor(c).loadProfile(principal.accountId);
    return profile ? c.json(profile) : c.json({ error: "not_found" }, 404);
  });

  app.put("/player/profile", async (c) => {
    const principal = await options.security.requireSessionMutation(c);
    if (principal instanceof Response) return principal;

    return c.json(await options.playerFor(c).createOrLoadProfile(principal.accountId));
  });

  app.get("/player/collection", async (c) => {
    const principal = await options.security.requireSession(c);
    if (principal instanceof Response) return principal;
    const codec = options.cursorFor(c);
    const input = await collectionPageInput(c, codec);
    if (!input) return invalidRequest(c);
    const page = await options.playerFor(c).listCollection(principal.accountId, input);
    if (!page) return notFound(c);
    const nextCursor = page.nextAfterPokemonInstanceId === null
      ? null
      : await codec.encodeCollection({ afterPokemonInstanceId: page.nextAfterPokemonInstanceId });
    return c.json({
      items: page.items.map((pokemon) => ({
        pokemonInstanceId: pokemon.pokemonInstanceId,
        speciesId: pokemon.speciesId,
        level: pokemon.level,
        selectedAbilityId: pokemon.selectedAbilityId,
        rowVersion: pokemon.rowVersion.toString(),
      })),
      nextCursor,
    });
  });

  app.get("/player/pokemon/:pokemonInstanceId/progression", async (c) => {
    const principal = await options.security.requireSession(c);
    if (principal instanceof Response) return principal;
    const pokemonInstanceId = c.req.param("pokemonInstanceId");
    if (!isCanonicalUuid(pokemonInstanceId)) return invalidRequest(c);
    const progression = await options.playerFor(c).loadPokemonProgression(
      principal.accountId,
      pokemonInstanceId,
    );
    if (!progression) return notFound(c);
    return c.json({
      pokemonInstanceId: progression.pokemonInstanceId,
      level: pokemonLevelNumber(progression.level),
      totalExperience: progression.totalExperience.toString(),
      rowVersion: progression.rowVersion.toString(),
    });
  });

  app.get("/player/pokemon/:pokemonInstanceId", async (c) => {
    const principal = await options.security.requireSession(c);
    if (principal instanceof Response) return principal;
    const pokemonInstanceId = c.req.param("pokemonInstanceId");
    if (!isCanonicalUuid(pokemonInstanceId)) return invalidRequest(c);
    const pokemon = await options.playerFor(c).loadPokemon(principal.accountId, pokemonInstanceId);
    if (!pokemon) return notFound(c);
    return c.json({
      pokemonInstanceId: pokemon.pokemonInstanceId,
      speciesId: pokemon.speciesId,
      level: pokemon.level,
      ivs: pokemon.ivs,
      selectedAbilityId: pokemon.selectedAbilityId,
      moveLoadout: pokemon.moveLoadout,
      rowVersion: pokemon.rowVersion.toString(),
    });
  });

  app.get("/player/progression", async (c) => {
    const principal = await options.security.requireSession(c);
    if (principal instanceof Response) return principal;
    const progression = await options.playerFor(c).loadProgression(principal.accountId);
    if (!progression) return notFound(c);
    return c.json({
      level: progression.level.toString(),
      totalExperience: progression.totalExperience.toString(),
      rowVersion: progression.rowVersion.toString(),
    });
  });

  app.get("/player/inventory", async (c) => {
    const principal = await options.security.requireSession(c);
    if (principal instanceof Response) return principal;
    const codec = options.cursorFor(c);
    const input = await inventoryPageInput(c, codec);
    if (!input) return invalidRequest(c);
    const result = await options.playerFor(c).loadInventoryPage(principal.accountId, input);
    if (result.status === "not_found") return notFound(c);
    if (result.status === "pagination_stale") {
      return c.json({ error: "pagination_stale" }, 409);
    }
    const inventoryCursor: InventoryCursor | null = result.nextAfterItemId === null
      ? null
      : { rowVersion: result.rowVersion, afterItemId: result.nextAfterItemId };
    return c.json({
      rowVersion: result.rowVersion.toString(),
      entries: result.entries.map((entry) => ({
        itemId: entry.itemId,
        quantity: entry.quantity.toString(),
      })),
      nextCursor: inventoryCursor ? await codec.encodeInventory(inventoryCursor) : null,
    });
  });

  app.get("/player/teams", async (c) => {
    const principal = await options.security.requireSession(c);
    if (principal instanceof Response) return principal;
    const codec = options.cursorFor(c);
    const input = await teamPageInput(c, codec);
    if (!input) return invalidRequest(c);
    const page = await options.playerFor(c).listTeams(principal.accountId, input);
    if (!page) return notFound(c);
    const nextCursor = page.nextAfterTeamId === null
      ? null
      : await codec.encodeTeams({ afterTeamId: page.nextAfterTeamId });
    return c.json({
      teamLimit: 6,
      teams: page.teams.map((team) => ({
        teamId: team.teamId,
        rowVersion: team.rowVersion.toString(),
      })),
      nextCursor,
    });
  });

  app.get("/player/teams/:teamId", async (c) => {
    const principal = await options.security.requireSession(c);
    if (principal instanceof Response) return principal;
    const teamId = c.req.param("teamId");
    if (!isCanonicalUuid(teamId)) return invalidRequest(c);
    const team = await options.playerFor(c).loadTeam(principal.accountId, teamId);
    if (!team) return notFound(c);
    return c.json({
      teamId: team.teamId,
      pokemonInstanceIds: team.pokemonInstanceIds,
      rowVersion: team.rowVersion.toString(),
    });
  });

  app.post("/player/teams", async (c) => {
    const principal = await options.security.requireCommandSession(c);
    if (principal instanceof Response) return principal;
    const idempotencyKey = c.req.header("Idempotency-Key");
    if (!isCanonicalUuid(idempotencyKey) || !(await requireEmptyBody(c))) return invalidRequest(c);
    const result = await options.playerFor(c).createTeam(principal.accountId, idempotencyKey);
    switch (result.status) {
      case "accepted":
        return c.json({ teamId: result.teamId, rowVersion: result.rowVersion.toString() });
      case "not_found":
        return notFound(c);
      case "idempotency_gone":
        return c.json({ error: "idempotency_gone" }, 410);
      case "team_limit_reached":
        return c.json({ error: "team_limit_reached" }, 409);
      case "rate_limited":
        c.header("Retry-After", retryAfterSeconds(result.retryAfterSeconds));
        return c.json({ error: "team_create_rate_limited" }, 429);
    }
  });

  app.put("/player/teams/:teamId/roster", async (c) => {
    const principal = await options.security.requireCommandSession(c);
    if (principal instanceof Response) return principal;
    const teamId = c.req.param("teamId");
    if (!isCanonicalUuid(teamId)) return invalidRequest(c);
    const body = await readJsonObject(c);
    if (!body || !exactKeys(body, ["expectedRowVersion", "pokemonInstanceIds"])) {
      return invalidRequest(c);
    }
    const expectedRowVersion = parsePgSignedBigintDecimal(body.expectedRowVersion);
    const pokemonInstanceIds = uuidArray(body.pokemonInstanceIds, 6);
    if (expectedRowVersion === null || pokemonInstanceIds === null) return invalidRequest(c);
    const result = await options.playerFor(c).replaceTeamRoster(principal.accountId, {
      teamId,
      expectedRowVersion,
      pokemonInstanceIds,
    });
    switch (result.status) {
      case "updated":
        return c.json({
          teamId,
          pokemonInstanceIds,
          rowVersion: result.rowVersion.toString(),
        });
      case "stale":
        return c.json({ error: "stale" }, 409);
      case "not_found":
        return notFound(c);
      case "invalid_member":
        return c.json({ error: "invalid_member", pokemonInstanceId: result.pokemonInstanceId }, 422);
    }
  });

  app.delete("/player/teams/:teamId", async (c) => {
    const principal = await options.security.requireCommandSession(c);
    if (principal instanceof Response) return principal;
    const teamId = c.req.param("teamId");
    const rawVersion = singleQueryValue(c, "expectedRowVersion");
    const expectedRowVersion = parsePgSignedBigintDecimal(rawVersion);
    if (
      !isCanonicalUuid(teamId)
      || rawVersion === undefined
      || rawVersion === null
      || expectedRowVersion === null
      || !(await requireEmptyBody(c))
    ) {
      return invalidRequest(c);
    }
    const result = await options.playerFor(c).deleteTeam(principal.accountId, {
      teamId,
      expectedRowVersion,
    });
    switch (result.status) {
      case "deleted":
        return c.body(null, 204);
      case "stale":
        return c.json({ error: "stale" }, 409);
      case "not_found":
        return notFound(c);
    }
  });

  app.put("/player/pokemon/:pokemonInstanceId/moves", async (c) => {
    const principal = await options.security.requireCommandSession(c);
    if (principal instanceof Response) return principal;
    const pokemonInstanceId = c.req.param("pokemonInstanceId");
    if (!isCanonicalUuid(pokemonInstanceId)) return invalidRequest(c);
    const body = await readJsonObject(c);
    if (!body || !exactKeys(body, ["expectedRowVersion", "moveIds"])) return invalidRequest(c);
    const expectedRowVersion = parsePgSignedBigintDecimal(body.expectedRowVersion);
    const moveIds = moveIdArray(body.moveIds);
    if (expectedRowVersion === null || moveIds === null) return invalidRequest(c);
    const result = await options.playerFor(c).replaceMoveLoadout(principal.accountId, {
      pokemonInstanceId,
      expectedRowVersion,
      moveIds,
    });
    switch (result.status) {
      case "updated":
        return c.json({
          pokemonInstanceId,
          moveIds: result.moveIds,
          rowVersion: result.rowVersion.toString(),
        });
      case "stale":
        return c.json({ error: "stale" }, 409);
      case "not_found":
        return notFound(c);
      case "authority_unavailable":
        return c.json({ error: "authority_unavailable" }, 503);
      case "invalid":
        if (result.reason === "invalid_structure") return invalidRequest(c);
        if (result.reason === "unresolved_species") {
          return c.json({ error: "authority_unavailable" }, 503);
        }
        return c.json({
          error: "invalid_move_loadout",
          reason: result.reason,
          ...(result.moveId === undefined ? {} : { moveId: result.moveId }),
        }, 422);
    }
  });
}
