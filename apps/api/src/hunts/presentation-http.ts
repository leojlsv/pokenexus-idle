import type { AuthSessionPrincipal } from "../auth/application";
import type { ApiContext } from "../auth/http";
import type { StatusCode } from "hono/utils/http-status";
import type { HuntHttpResult } from "./application";
import type { PresentationCursorCodec } from "./presentation-cursor";
import {
  parseHuntPresentationQuery,
  type HuntPresentationReadRequest,
} from "./presentation-read";
import { isCanonicalUuid } from "./protocol";

interface HuntPresentationHttpSecurity {
  requireSession(c: ApiContext): Promise<AuthSessionPrincipal | Response>;
}

export interface HuntPresentationHttpOptions {
  readonly security: HuntPresentationHttpSecurity;
  readonly playerIdFor: (c: ApiContext, accountId: string) => Promise<string | null>;
  readonly cursorCodecFor: (c: ApiContext) => PresentationCursorCodec;
  readonly readFor: (
    c: ApiContext,
    request: HuntPresentationReadRequest,
  ) => Promise<HuntHttpResult>;
  readonly nowMs?: () => number;
}

function privateJson(c: ApiContext, result: HuntHttpResult): Response {
  const body = JSON.stringify(result.body);
  if (body === undefined) {
    throw new Error("Hunt presentation HTTP adapter received a non-JSON response body");
  }
  return c.newResponse(body, result.httpStatus as StatusCode, {
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json; charset=UTF-8",
  });
}

function privateFailure(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Type", "application/json; charset=UTF-8");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Disabled presentation HTTP boundary.
 *
 * The adapter is production-compatible and fully testable, but intentionally
 * has no route registration in createApiApp/registerHuntRoutes. Public exposure
 * remains a separate Human enablement gate.
 */
export async function handleHuntPresentationHttp(
  c: ApiContext,
  options: HuntPresentationHttpOptions,
): Promise<Response> {
  const principal = await options.security.requireSession(c);
  if (principal instanceof Response) return privateFailure(principal);

  const huntId = c.req.param("huntId");
  if (!huntId || !isCanonicalUuid(huntId)) {
    return privateJson(c, { httpStatus: 400, body: { error: "invalid_request" } });
  }
  const query = parseHuntPresentationQuery(new URL(c.req.url).searchParams);
  if (query === null) {
    return privateJson(c, { httpStatus: 400, body: { error: "invalid_request" } });
  }

  const playerId = await options.playerIdFor(c, principal.accountId);
  if (playerId === null) {
    return privateJson(c, { httpStatus: 404, body: { error: "not_found" } });
  }

  return privateJson(c, await options.readFor(c, {
    playerId,
    huntId,
    cursorCodec: options.cursorCodecFor(c),
    nowMs: options.nowMs?.() ?? Date.now(),
    ...query,
  }));
}
