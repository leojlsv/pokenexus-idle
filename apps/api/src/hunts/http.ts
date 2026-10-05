import type { AuthSessionPrincipal } from "../auth/application";
import type { ApiApp, ApiContext } from "../auth/http";
import type { StatusCode } from "hono/utils/http-status";
import type { HuntHttpApplication, HuntHttpResult } from "./application";
import {
  HUNT_CATALOG_ARTIFACT_BASE_PATH,
  catalogArtifactName,
  type VerifiedHuntCatalogRelease,
} from "./catalog-release";
import {
  HUNT_MUTATION_BODY_MAX_BYTES,
  HuntProtocolError,
  isCanonicalUuid,
  parseAutoCapturePolicyReplaceBody,
  parseAutoPotionPolicyReplaceBody,
  parseAutoRevivePolicyReplaceBody,
  parseEmptyMutationBodyText,
  parseHuntItemUseBody,
  parseManualCaptureBody,
  parsePokeCenterHealBody,
  parseStartHuntBody,
} from "./protocol";

interface HuntHttpSecurity {
  requireSession(c: ApiContext): Promise<AuthSessionPrincipal | Response>;
  requireCommandSession(c: ApiContext): Promise<AuthSessionPrincipal | Response>;
}

export interface RegisterHuntRoutesOptions {
  readonly huntFor: (c: ApiContext) => HuntHttpApplication;
  readonly playerIdFor: (c: ApiContext, accountId: string) => Promise<string | null>;
  readonly security: HuntHttpSecurity;
  readonly catalogReleaseFor?: (c: ApiContext) => Promise<VerifiedHuntCatalogRelease>;
}

function invalidRequest(c: ApiContext): Response {
  return c.json({ error: "invalid_request" }, 400);
}

function protocolFailure(c: ApiContext, error: HuntProtocolError): Response {
  if (error.code === "auto_capture_policy_invalid" || error.code === "automation_policy_invalid") {
    return c.json({ error: error.code }, 422);
  }
  return invalidRequest(c);
}

async function readBoundedMutationBodyText(c: ApiContext): Promise<string | null> {
  const contentLength = c.req.header("Content-Length");
  if (contentLength !== undefined) {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(contentLength)) return null;
    if (BigInt(contentLength) > BigInt(HUNT_MUTATION_BODY_MAX_BYTES)) return null;
  }

  const stream = c.req.raw.body;
  if (stream === null) return "";

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.byteLength > HUNT_MUTATION_BODY_MAX_BYTES) {
        await reader.cancel("hunt mutation body exceeds transport limit");
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

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

async function parseMutation<T>(
  c: ApiContext,
  parser: (text: string) => T,
): Promise<T | Response> {
  const text = await readBoundedMutationBodyText(c);
  if (text === null) return invalidRequest(c);
  try {
    return parser(text);
  } catch (error) {
    if (error instanceof HuntProtocolError) return protocolFailure(c, error);
    throw error;
  }
}

function canonicalIdempotencyKey(c: ApiContext): string | null {
  const value = c.req.header("Idempotency-Key");
  return value !== undefined && isCanonicalUuid(value) ? value : null;
}

function canonicalHuntId(c: ApiContext): string | null {
  const value = c.req.param("huntId");
  return value !== undefined && isCanonicalUuid(value) ? value : null;
}

function singleQueryValue(c: ApiContext, name: string): string | null | undefined {
  const values = new URL(c.req.url).searchParams.getAll(name);
  if (values.length > 1) return null;
  return values[0];
}

function huntActivityPageInput(
  c: ApiContext,
): { readonly limit: number; readonly afterEncounterOrdinal: number | null } | null {
  const rawLimit = singleQueryValue(c, "limit");
  const rawCursor = singleQueryValue(c, "cursor");
  if (rawLimit === null || rawCursor === null) return null;
  const limit = rawLimit === undefined ? 64 : Number(rawLimit);
  if (
    !Number.isSafeInteger(limit)
    || limit < 1
    || limit > 64
    || (rawLimit !== undefined && String(limit) !== rawLimit)
  ) {
    return null;
  }
  if (rawCursor === undefined) return { limit, afterEncounterOrdinal: null };
  if (!/^[1-9][0-9]*$/u.test(rawCursor)) return null;
  const afterEncounterOrdinal = Number(rawCursor);
  return Number.isSafeInteger(afterEncounterOrdinal)
    ? { limit, afterEncounterOrdinal }
    : null;
}

function applicationResponse(c: ApiContext, result: HuntHttpResult): Response {
  const body = JSON.stringify(result.body);
  if (body === undefined) throw new Error("Hunt HTTP application returned a non-JSON response body");
  return c.newResponse(body, result.httpStatus as StatusCode, {
    "Content-Type": "application/json; charset=UTF-8",
  });
}

async function requirePlayerId(
  c: ApiContext,
  options: RegisterHuntRoutesOptions,
  principal: AuthSessionPrincipal,
): Promise<string | Response> {
  const playerId = await options.playerIdFor(c, principal.accountId);
  return playerId ?? c.json({ error: "not_found" }, 404);
}

function privateCatalogFailure(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Type", "application/json; charset=UTF-8");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function catalogJson(c: ApiContext, body: unknown, status: 200 | 404 | 503): Response {
  return c.newResponse(JSON.stringify(body), status, {
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json; charset=UTF-8",
  });
}

export function registerHuntRoutes(app: ApiApp, options: RegisterHuntRoutesOptions): void {
  app.get("/player/hunts/catalog-release", async (c) => {
    const principal = await options.security.requireSession(c);
    if (principal instanceof Response) return privateCatalogFailure(principal);
    const playerId = await requirePlayerId(c, options, principal);
    if (playerId instanceof Response) return privateCatalogFailure(playerId);
    try {
      if (!options.catalogReleaseFor) throw new Error("Hunt catalog release provider is unavailable");
      const verified = await options.catalogReleaseFor(c);
      return catalogJson(c, verified.descriptor, 200);
    } catch {
      return catalogJson(c, { error: "authority_unavailable" }, 503);
    }
  });

  app.get(`${HUNT_CATALOG_ARTIFACT_BASE_PATH}*`, async (c) => {
    const principal = await options.security.requireSession(c);
    if (principal instanceof Response) return privateCatalogFailure(principal);
    const playerId = await requirePlayerId(c, options, principal);
    if (playerId instanceof Response) return privateCatalogFailure(playerId);
    const path = c.req.path.slice(HUNT_CATALOG_ARTIFACT_BASE_PATH.length);
    if (!/^version-[0-9a-f]{64}\/(?:manifest\.json|catalogs\/(?:zones|hunts)\.json)$/u.test(path)) {
      return catalogJson(c, { error: "not_found" }, 404);
    }
    try {
      if (!options.catalogReleaseFor) throw new Error("Hunt catalog release provider is unavailable");
      const verified = await options.catalogReleaseFor(c);
      const name = catalogArtifactName(path, verified.directoryName);
      if (name === "release_drift") {
        return catalogJson(c, { error: "authority_unavailable" }, 503);
      }
      if (name === null) {
        return catalogJson(c, { error: "not_found" }, 404);
      }
      return c.newResponse(Uint8Array.from(verified.artifacts[name]), 200, {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/json; charset=UTF-8",
      });
    } catch {
      return catalogJson(c, { error: "authority_unavailable" }, 503);
    }
  });

  app.get("/player/hunts/state", async (c) => {
    const principal = await options.security.requireSession(c);
    if (principal instanceof Response) return principal;
    const playerId = await requirePlayerId(c, options, principal);
    if (playerId instanceof Response) return playerId;
    return applicationResponse(c, await options.huntFor(c).getState(playerId));
  });

  app.get("/player/hunts/capture-balls", async (c) => {
    const principal = await options.security.requireSession(c);
    if (principal instanceof Response) return principal;
    const playerId = await requirePlayerId(c, options, principal);
    if (playerId instanceof Response) return playerId;
    return applicationResponse(c, await options.huntFor(c).getCaptureBalls(playerId));
  });

  app.get("/player/hunts/auto-capture-policy", async (c) => {
    const principal = await options.security.requireSession(c);
    if (principal instanceof Response) return principal;
    const playerId = await requirePlayerId(c, options, principal);
    if (playerId instanceof Response) return playerId;
    return applicationResponse(c, await options.huntFor(c).getAutoCapturePolicy(playerId));
  });

  app.get("/player/hunts/auto-potion-policy", async (c) => {
    const principal = await options.security.requireSession(c);
    if (principal instanceof Response) return principal;
    const playerId = await requirePlayerId(c, options, principal);
    if (playerId instanceof Response) return playerId;
    return applicationResponse(c, await options.huntFor(c).getAutoPotionPolicy(playerId));
  });

  app.get("/player/hunts/auto-revive-policy", async (c) => {
    const principal = await options.security.requireSession(c);
    if (principal instanceof Response) return principal;
    const playerId = await requirePlayerId(c, options, principal);
    if (playerId instanceof Response) return playerId;
    return applicationResponse(c, await options.huntFor(c).getAutoRevivePolicy(playerId));
  });

  app.get("/player/hunts/:huntId/activity", async (c) => {
    const principal = await options.security.requireSession(c);
    if (principal instanceof Response) return principal;
    const huntId = canonicalHuntId(c);
    const page = huntActivityPageInput(c);
    if (huntId === null || page === null) return invalidRequest(c);
    const playerId = await requirePlayerId(c, options, principal);
    if (playerId instanceof Response) return playerId;
    return applicationResponse(
      c,
      await options.huntFor(c).getActivity(
        playerId,
        huntId,
        page.afterEncounterOrdinal,
        page.limit,
      ),
    );
  });

  app.post("/player/hunts/start", async (c) => {
    const principal = await options.security.requireCommandSession(c);
    if (principal instanceof Response) return principal;
    const idempotencyKey = canonicalIdempotencyKey(c);
    if (idempotencyKey === null) return invalidRequest(c);
    const input = await parseMutation(c, parseStartHuntBody);
    if (input instanceof Response) return input;
    const playerId = await requirePlayerId(c, options, principal);
    if (playerId instanceof Response) return playerId;
    return applicationResponse(
      c,
      await options.huntFor(c).start(playerId, idempotencyKey, input),
    );
  });

  app.post("/player/pokecenter/heal", async (c) => {
    const principal = await options.security.requireCommandSession(c);
    if (principal instanceof Response) return principal;
    const idempotencyKey = canonicalIdempotencyKey(c);
    if (idempotencyKey === null) return invalidRequest(c);
    const input = await parseMutation(c, parsePokeCenterHealBody);
    if (input instanceof Response) return input;
    const playerId = await requirePlayerId(c, options, principal);
    if (playerId instanceof Response) return playerId;
    return applicationResponse(
      c,
      await options.huntFor(c).healAtPokeCenter(playerId, idempotencyKey, input),
    );
  });

  const registerEmptyHuntCommand = (
    path: string,
    execute: (
      application: HuntHttpApplication,
      playerId: string,
      huntId: string,
      idempotencyKey: string,
    ) => Promise<HuntHttpResult>,
  ): void => {
    app.post(path, async (c) => {
      const principal = await options.security.requireCommandSession(c);
      if (principal instanceof Response) return principal;
      const huntId = canonicalHuntId(c);
      const idempotencyKey = canonicalIdempotencyKey(c);
      if (huntId === null || idempotencyKey === null) return invalidRequest(c);
      const body = await parseMutation(c, parseEmptyMutationBodyText);
      if (body instanceof Response) return body;
      const playerId = await requirePlayerId(c, options, principal);
      if (playerId instanceof Response) return playerId;
      return applicationResponse(
        c,
        await execute(options.huntFor(c), playerId, huntId, idempotencyKey),
      );
    });
  };

  registerEmptyHuntCommand(
    "/player/hunts/:huntId/checkpoint",
    (application, playerId, huntId, idempotencyKey) =>
      application.checkpoint(playerId, idempotencyKey, huntId),
  );
  registerEmptyHuntCommand(
    "/player/hunts/:huntId/claim",
    (application, playerId, huntId, idempotencyKey) =>
      application.claim(playerId, idempotencyKey, huntId),
  );
  registerEmptyHuntCommand(
    "/player/hunts/:huntId/retreat",
    (application, playerId, huntId, idempotencyKey) =>
      application.retreat(playerId, idempotencyKey, huntId),
  );

  app.post("/player/hunts/:huntId/capture", async (c) => {
    const principal = await options.security.requireCommandSession(c);
    if (principal instanceof Response) return principal;
    const huntId = canonicalHuntId(c);
    const idempotencyKey = canonicalIdempotencyKey(c);
    if (huntId === null || idempotencyKey === null) return invalidRequest(c);
    const input = await parseMutation(c, parseManualCaptureBody);
    if (input instanceof Response) return input;
    const playerId = await requirePlayerId(c, options, principal);
    if (playerId instanceof Response) return playerId;
    return applicationResponse(
      c,
      await options.huntFor(c).capture(playerId, idempotencyKey, huntId, input),
    );
  });

  app.post("/player/hunts/:huntId/items/use", async (c) => {
    const principal = await options.security.requireCommandSession(c);
    if (principal instanceof Response) return principal;
    const huntId = canonicalHuntId(c);
    const idempotencyKey = canonicalIdempotencyKey(c);
    if (huntId === null || idempotencyKey === null) return invalidRequest(c);
    const input = await parseMutation(c, parseHuntItemUseBody);
    if (input instanceof Response) return input;
    const playerId = await requirePlayerId(c, options, principal);
    if (playerId instanceof Response) return playerId;
    return applicationResponse(
      c,
      await options.huntFor(c).useItem(playerId, idempotencyKey, huntId, input),
    );
  });

  app.put("/player/hunts/auto-capture-policy", async (c) => {
    const principal = await options.security.requireCommandSession(c);
    if (principal instanceof Response) return principal;
    const idempotencyKey = canonicalIdempotencyKey(c);
    if (idempotencyKey === null) return invalidRequest(c);
    const input = await parseMutation(c, parseAutoCapturePolicyReplaceBody);
    if (input instanceof Response) return input;
    const playerId = await requirePlayerId(c, options, principal);
    if (playerId instanceof Response) return playerId;
    return applicationResponse(
      c,
      await options.huntFor(c).replaceAutoCapturePolicy(playerId, idempotencyKey, input),
    );
  });

  app.put("/player/hunts/auto-potion-policy", async (c) => {
    const principal = await options.security.requireCommandSession(c);
    if (principal instanceof Response) return principal;
    const idempotencyKey = canonicalIdempotencyKey(c);
    if (idempotencyKey === null) return invalidRequest(c);
    const input = await parseMutation(c, parseAutoPotionPolicyReplaceBody);
    if (input instanceof Response) return input;
    const playerId = await requirePlayerId(c, options, principal);
    if (playerId instanceof Response) return playerId;
    return applicationResponse(
      c,
      await options.huntFor(c).replaceAutoPotionPolicy(playerId, idempotencyKey, input),
    );
  });

  app.put("/player/hunts/auto-revive-policy", async (c) => {
    const principal = await options.security.requireCommandSession(c);
    if (principal instanceof Response) return principal;
    const idempotencyKey = canonicalIdempotencyKey(c);
    if (idempotencyKey === null) return invalidRequest(c);
    const input = await parseMutation(c, parseAutoRevivePolicyReplaceBody);
    if (input instanceof Response) return input;
    const playerId = await requirePlayerId(c, options, principal);
    if (playerId instanceof Response) return playerId;
    return applicationResponse(
      c,
      await options.huntFor(c).replaceAutoRevivePolicy(playerId, idempotencyKey, input),
    );
  });
}
