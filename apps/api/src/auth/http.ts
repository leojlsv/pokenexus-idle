import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  AuthenticationApplication,
  type AuthSessionPrincipal,
  type RestrictedPrincipal,
  type SessionIssueResult,
} from "./application";
import { createAuthConfig, type AuthEnvironment } from "./config";
import {
  createUnavailableEmailActionSender,
  type EmailActionSender,
} from "./email-sender";
import { PlayerApplication, type PlayerHttpApplication } from "../player/application";
import { registerPlayerRoutes } from "../player/http";

export const SESSION_COOKIE_NAME = "__Host-pokenexus_session";
export const RESTRICTED_COOKIE_NAME = "__Host-pokenexus_restricted";
export const CSRF_HEADER_NAME = "X-CSRF-Token";

export type ApiBindings = AuthEnvironment;
export interface ApiVariables {
  securityAuditCorrelationId: string;
}
export type ApiContext = Context<{ Bindings: ApiBindings; Variables: ApiVariables }>;
export type ApiApp = Hono<{ Bindings: ApiBindings; Variables: ApiVariables }>;

export interface AuthHttpApplication {
  requestEnrollment(rawEmail: string, correlationId?: string | null): Promise<void>;
  requestRecovery(rawEmail: string, correlationId?: string | null): Promise<void>;
  redeemEmailAction(rawSecret: string, correlationId?: string | null): Promise<{
    bearer: string;
    csrf: string;
    expiresAt: Date;
    purpose: "activation" | "recovery";
  } | null>;
  authenticateRestricted(rawBearer: string): Promise<RestrictedPrincipal | null>;
  verifyRestrictedCsrf(flowId: string, token: string): Promise<boolean>;
  beginRestrictedRegistration(restricted: RestrictedPrincipal): ReturnType<AuthenticationApplication["beginRestrictedRegistration"]>;
  completeRestrictedRegistration(input: Parameters<AuthenticationApplication["completeRestrictedRegistration"]>[0]): Promise<SessionIssueResult | null>;
  beginSignIn(networkSignal: string, correlationId?: string | null): ReturnType<AuthenticationApplication["beginSignIn"]>;
  completeSignIn(input: Parameters<AuthenticationApplication["completeSignIn"]>[0]): Promise<SessionIssueResult | null>;
  authenticateSession(rawBearer: string, touchActivity?: boolean): Promise<AuthSessionPrincipal | null>;
  verifySessionCsrf(sessionId: string, token: string): Promise<boolean>;
  sessionCsrf(sessionId: string): Promise<string>;
  beginReauthentication(principal: AuthSessionPrincipal): ReturnType<AuthenticationApplication["beginReauthentication"]>;
  completeReauthentication(input: Parameters<AuthenticationApplication["completeReauthentication"]>[0]): Promise<SessionIssueResult | null>;
  beginPasskeyAddition(principal: AuthSessionPrincipal): ReturnType<AuthenticationApplication["beginPasskeyAddition"]>;
  completePasskeyAddition(input: Parameters<AuthenticationApplication["completePasskeyAddition"]>[0]): Promise<boolean>;
  removePasskey(input: Parameters<AuthenticationApplication["removePasskey"]>[0]): Promise<boolean>;
  requestRecoveryEmailChange(input: Parameters<AuthenticationApplication["requestRecoveryEmailChange"]>[0]): Promise<boolean>;
  completeRecoveryEmailChange(input: Parameters<AuthenticationApplication["completeRecoveryEmailChange"]>[0]): Promise<boolean>;
  listSessions(principal: AuthSessionPrincipal): ReturnType<AuthenticationApplication["listSessions"]>;
  revokeSession(input: Parameters<AuthenticationApplication["revokeSession"]>[0]): Promise<boolean>;
  revokeEverySession(principal: AuthSessionPrincipal, correlationId?: string | null): Promise<boolean>;
  logout(principal: AuthSessionPrincipal, correlationId?: string | null): Promise<boolean>;
  authorizeSecurityOperation(principal: AuthSessionPrincipal): Promise<boolean>;
  deleteAccount(input: Parameters<AuthenticationApplication["deleteAccount"]>[0]): Promise<boolean>;
}

export interface AuthHttpRuntime {
  readonly auth: AuthHttpApplication;
  readonly allowedOrigins: readonly string[];
}

export interface CreateApiAppOptions {
  readonly resolveAuthRuntime?: (env: AuthEnvironment) => AuthHttpRuntime;
  readonly resolvePlayerApplication?: (env: AuthEnvironment) => PlayerHttpApplication;
  readonly emailSender?: EmailActionSender;
  readonly deferPublicWork?: (work: Promise<void>) => void;
  readonly createSecurityAuditCorrelationId?: () => string;
  readonly resolveNetworkSignal?: (request: Request) => string | null;
}

interface JsonObject {
  [key: string]: unknown;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonObject(c: ApiContext): Promise<JsonObject | null> {
  try {
    const value: unknown = await c.req.json();
    return isJsonObject(value) ? value : null;
  } catch {
    return null;
  }
}

function stringField(body: JsonObject, field: string, maximumLength = 4096): string | null {
  const value = body[field];
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength ? value : null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isBase64urlBytes(value: unknown, maximumBytes: number): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > Math.ceil((maximumBytes * 4) / 3) ||
    !BASE64URL_PATTERN.test(value)
  ) {
    return false;
  }
  const decoded = Buffer.from(value, "base64url");
  return decoded.byteLength > 0 && decoded.byteLength <= maximumBytes && decoded.toString("base64url") === value;
}

function isRegistrationResponse(value: unknown): value is RegistrationResponseJSON {
  if (!isJsonObject(value) || value.type !== "public-key") return false;
  if (!isBase64urlBytes(value.id, 1024) || !isBase64urlBytes(value.rawId, 1024)) return false;
  if (!isJsonObject(value.response) || !isJsonObject(value.clientExtensionResults)) return false;
  if (
    !isBase64urlBytes(value.response.clientDataJSON, 65_536) ||
    !isBase64urlBytes(value.response.attestationObject, 65_536)
  ) {
    return false;
  }
  const credProps = value.clientExtensionResults.credProps;
  if (credProps !== undefined) {
    if (!isJsonObject(credProps)) return false;
    if (credProps.rk !== undefined && typeof credProps.rk !== "boolean") return false;
  }
  return true;
}

function isAuthenticationResponse(value: unknown): value is AuthenticationResponseJSON {
  if (!isJsonObject(value) || value.type !== "public-key") return false;
  if (!isBase64urlBytes(value.id, 1024) || !isBase64urlBytes(value.rawId, 1024)) return false;
  if (!isJsonObject(value.response) || !isJsonObject(value.clientExtensionResults)) return false;
  if (
    !isBase64urlBytes(value.response.clientDataJSON, 65_536) ||
    !isBase64urlBytes(value.response.authenticatorData, 16_384) ||
    !isBase64urlBytes(value.response.signature, 16_384)
  ) {
    return false;
  }
  const userHandle = value.response.userHandle;
  return userHandle === null || userHandle === undefined || isBase64urlBytes(userHandle, 64);
}

function correlationId(c: ApiContext): string {
  return c.get("securityAuditCorrelationId");
}

function defaultNetworkSignal(request: Request): string | null {
  const value = request.headers.get("CF-Connecting-IP");
  if (!value || value.length > 64 || !/^[0-9A-Fa-f:.]+$/.test(value)) {
    return null;
  }
  return value.toLowerCase();
}

function isAllowedOrigin(c: ApiContext, allowedOrigins: readonly string[]): boolean {
  const origin = c.req.header("Origin");
  return typeof origin === "string" && allowedOrigins.includes(origin);
}

function requireOrigin(c: ApiContext, runtime: AuthHttpRuntime): Response | null {
  return isAllowedOrigin(c, runtime.allowedOrigins)
    ? null
    : c.json({ error: "forbidden" }, 403);
}

function sessionCookieOptions(expires: Date) {
  return {
    secure: true as const,
    httpOnly: true,
    path: "/" as const,
    sameSite: "Lax" as const,
    expires,
  };
}

function restrictedCookieOptions(expires: Date) {
  return {
    secure: true as const,
    httpOnly: true,
    path: "/" as const,
    sameSite: "Strict" as const,
    expires,
  };
}

function clearSessionCookie(c: ApiContext): void {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    secure: true,
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
  });
}

function clearRestrictedCookie(c: ApiContext): void {
  deleteCookie(c, RESTRICTED_COOKIE_NAME, {
    secure: true,
    httpOnly: true,
    path: "/",
    sameSite: "Strict",
  });
}

function issueSessionCookie(c: ApiContext, session: SessionIssueResult): void {
  setCookie(
    c,
    SESSION_COOKIE_NAME,
    session.bearer,
    sessionCookieOptions(session.absoluteExpiresAt),
  );
}

async function requireSession(
  c: ApiContext,
  runtime: AuthHttpRuntime,
  touchActivity: boolean,
): Promise<AuthSessionPrincipal | Response> {
  const bearer = getCookie(c, SESSION_COOKIE_NAME);
  if (!bearer) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const principal = await runtime.auth.authenticateSession(bearer, touchActivity);
  if (!principal) {
    clearSessionCookie(c);
    return c.json({ error: "unauthorized" }, 401);
  }
  return principal;
}

async function requireRestricted(
  c: ApiContext,
  runtime: AuthHttpRuntime,
): Promise<RestrictedPrincipal | Response> {
  const bearer = getCookie(c, RESTRICTED_COOKIE_NAME);
  if (!bearer) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const principal = await runtime.auth.authenticateRestricted(bearer);
  if (!principal) {
    clearRestrictedCookie(c);
    return c.json({ error: "unauthorized" }, 401);
  }
  return principal;
}

async function requireSessionMutation(
  c: ApiContext,
  runtime: AuthHttpRuntime,
  touchActivity: boolean,
): Promise<AuthSessionPrincipal | Response> {
  const originFailure = requireOrigin(c, runtime);
  if (originFailure) {
    return originFailure;
  }
  const principal = await requireSession(c, runtime, touchActivity);
  if (principal instanceof Response) {
    return principal;
  }
  const token = c.req.header(CSRF_HEADER_NAME);
  if (!token || !(await runtime.auth.verifySessionCsrf(principal.sessionId, token))) {
    return c.json({ error: "forbidden" }, 403);
  }
  return principal;
}

async function requireRestrictedMutation(
  c: ApiContext,
  runtime: AuthHttpRuntime,
): Promise<RestrictedPrincipal | Response> {
  const originFailure = requireOrigin(c, runtime);
  if (originFailure) {
    return originFailure;
  }
  const principal = await requireRestricted(c, runtime);
  if (principal instanceof Response) {
    return principal;
  }
  const token = c.req.header(CSRF_HEADER_NAME);
  if (!token || !(await runtime.auth.verifyRestrictedCsrf(principal.flow.flowId, token))) {
    return c.json({ error: "forbidden" }, 403);
  }
  return principal;
}

function defaultRuntimeResolver(emailSender: EmailActionSender) {
  return (env: AuthEnvironment): AuthHttpRuntime => {
    const config = createAuthConfig(env);
    return {
      auth: new AuthenticationApplication(config, emailSender),
      allowedOrigins: config.allowedOrigins,
    };
  };
}

function defaultPlayerApplicationResolver(env: AuthEnvironment): PlayerHttpApplication {
  const connectionString = env.HYPERDRIVE?.connectionString;
  if (!connectionString) {
    throw new Error("HYPERDRIVE connectionString is required");
  }
  return new PlayerApplication(connectionString);
}

function applyCredentialedCors(
  c: ApiContext,
  runtime: AuthHttpRuntime,
  allowedMethods: string,
): Response | null {
  const origin = c.req.header("Origin");
  if (!origin || !runtime.allowedOrigins.includes(origin)) {
    return null;
  }
  c.header("Access-Control-Allow-Origin", origin);
  c.header("Access-Control-Allow-Credentials", "true");
  c.header("Vary", "Origin");
  if (c.req.method === "OPTIONS") {
    c.header("Access-Control-Allow-Methods", allowedMethods);
    c.header("Access-Control-Allow-Headers", `Content-Type, ${CSRF_HEADER_NAME}`);
    return c.body(null, 204);
  }
  return null;
}

export function createApiApp(options: CreateApiAppOptions = {}) {
  const resolveAuthRuntime =
    options.resolveAuthRuntime ??
    defaultRuntimeResolver(options.emailSender ?? createUnavailableEmailActionSender());
  const resolvePlayerApplication =
    options.resolvePlayerApplication ?? defaultPlayerApplicationResolver;
  const app = new Hono<{ Bindings: ApiBindings; Variables: ApiVariables }>();
  const createSecurityAuditCorrelationId =
    options.createSecurityAuditCorrelationId ?? (() => crypto.randomUUID());
  const resolveNetworkSignal = options.resolveNetworkSignal ?? defaultNetworkSignal;

  const runtimeFor = (c: ApiContext): AuthHttpRuntime => resolveAuthRuntime(c.env);
  const playerFor = (c: ApiContext): PlayerHttpApplication => resolvePlayerApplication(c.env);

  app.use("/auth/*", async (c, next) => {
    c.set("securityAuditCorrelationId", createSecurityAuditCorrelationId());
    const runtime = runtimeFor(c);
    const preflight = applyCredentialedCors(c, runtime, "GET, POST, DELETE");
    if (preflight) return preflight;
    await next();
  });

  app.use("/player/*", async (c, next) => {
    const preflight = applyCredentialedCors(c, runtimeFor(c), "GET, PUT");
    if (preflight) return preflight;
    await next();
  });

  app.get("/", (c) => c.text("PokeNexus API"));

  registerPlayerRoutes(app, {
    playerFor,
    security: {
      requireSession: (c) => requireSession(c, runtimeFor(c), false),
      requireSessionMutation: (c) => requireSessionMutation(c, runtimeFor(c), false),
    },
  });

  app.post("/auth/enrollment/request", async (c) => {
    const runtime = runtimeFor(c);
    const originFailure = requireOrigin(c, runtime);
    if (originFailure) return originFailure;
    const body = await readJsonObject(c);
    const email = body ? stringField(body, "email", 320) : null;
    if (email) {
      const work = runtime.auth.requestEnrollment(email, correlationId(c));
      if (options.deferPublicWork) {
        options.deferPublicWork(work);
      } else {
        c.executionCtx.waitUntil(work);
      }
    }
    return c.json({ accepted: true }, 202);
  });

  app.post("/auth/recovery/request", async (c) => {
    const runtime = runtimeFor(c);
    const originFailure = requireOrigin(c, runtime);
    if (originFailure) return originFailure;
    const body = await readJsonObject(c);
    const email = body ? stringField(body, "email", 320) : null;
    if (email) {
      const work = runtime.auth.requestRecovery(email, correlationId(c));
      if (options.deferPublicWork) {
        options.deferPublicWork(work);
      } else {
        c.executionCtx.waitUntil(work);
      }
    }
    return c.json({ accepted: true }, 202);
  });

  app.post("/auth/email-action/redeem", async (c) => {
    const runtime = runtimeFor(c);
    const originFailure = requireOrigin(c, runtime);
    if (originFailure) return originFailure;
    const body = await readJsonObject(c);
    const secret = body ? stringField(body, "secret", 2048) : null;
    if (!secret) return c.json({ error: "invalid_request" }, 400);
    const flow = await runtime.auth.redeemEmailAction(secret, correlationId(c));
    if (!flow) return c.json({ error: "invalid_or_expired" }, 400);
    setCookie(
      c,
      RESTRICTED_COOKIE_NAME,
      flow.bearer,
      restrictedCookieOptions(flow.expiresAt),
    );
    return c.json({ purpose: flow.purpose, csrfToken: flow.csrf });
  });

  app.post("/auth/restricted/passkey/options", async (c) => {
    const runtime = runtimeFor(c);
    const restricted = await requireRestrictedMutation(c, runtime);
    if (restricted instanceof Response) return restricted;
    const result = await runtime.auth.beginRestrictedRegistration(restricted);
    return c.json(result);
  });

  app.post("/auth/restricted/passkey/verify", async (c) => {
    const runtime = runtimeFor(c);
    const restricted = await requireRestrictedMutation(c, runtime);
    if (restricted instanceof Response) return restricted;
    const body = await readJsonObject(c);
    if (!body) return c.json({ error: "invalid_request" }, 400);
    const challengeId = stringField(body, "challengeId");
    const response = body.response;
    if (!challengeId || !isUuid(challengeId) || !isRegistrationResponse(response)) {
      return c.json({ error: "invalid_request" }, 400);
    }
    const session = await runtime.auth.completeRestrictedRegistration({
      restricted,
      challengeId,
      response,
      correlationId: correlationId(c),
    });
    if (!session) return c.json({ error: "verification_failed" }, 401);
    issueSessionCookie(c, session);
    clearRestrictedCookie(c);
    return c.json({ csrfToken: session.csrf });
  });

  app.post("/auth/passkey/sign-in/options", async (c) => {
    const runtime = runtimeFor(c);
    const originFailure = requireOrigin(c, runtime);
    if (originFailure) return originFailure;
    const networkSignal = resolveNetworkSignal(c.req.raw);
    if (!networkSignal) return c.json({ error: "temporarily_unavailable" }, 503);
    const result = await runtime.auth.beginSignIn(networkSignal, correlationId(c));
    return result ? c.json(result) : c.json({ error: "try_later" }, 429);
  });

  app.post("/auth/passkey/sign-in/verify", async (c) => {
    const runtime = runtimeFor(c);
    const originFailure = requireOrigin(c, runtime);
    if (originFailure) return originFailure;
    const body = await readJsonObject(c);
    if (!body) return c.json({ error: "invalid_request" }, 400);
    const challengeId = stringField(body, "challengeId", 36);
    const response = body.response;
    const networkSignal = resolveNetworkSignal(c.req.raw);
    if (!networkSignal) return c.json({ error: "temporarily_unavailable" }, 503);
    if (!challengeId || !isUuid(challengeId) || !isAuthenticationResponse(response)) {
      return c.json({ error: "invalid_request" }, 400);
    }
    const session = await runtime.auth.completeSignIn({
      challengeId,
      response,
      networkSignal,
      correlationId: correlationId(c),
    });
    if (!session) return c.json({ error: "verification_failed" }, 401);
    issueSessionCookie(c, session);
    return c.json({ csrfToken: session.csrf });
  });

  app.get("/auth/session", async (c) => {
    const runtime = runtimeFor(c);
    const principal = await requireSession(c, runtime, false);
    if (principal instanceof Response) return principal;
    return c.json({
      authenticated: true,
      csrfToken: await runtime.auth.sessionCsrf(principal.sessionId),
    });
  });

  app.post("/auth/logout", async (c) => {
    const runtime = runtimeFor(c);
    const principal = await requireSessionMutation(c, runtime, false);
    if (principal instanceof Response) return principal;
    await runtime.auth.logout(principal, correlationId(c));
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  app.post("/auth/passkey/reauth/options", async (c) => {
    const runtime = runtimeFor(c);
    const principal = await requireSessionMutation(c, runtime, true);
    if (principal instanceof Response) return principal;
    return c.json(await runtime.auth.beginReauthentication(principal));
  });

  app.post("/auth/passkey/reauth/verify", async (c) => {
    const runtime = runtimeFor(c);
    const principal = await requireSessionMutation(c, runtime, true);
    if (principal instanceof Response) return principal;
    const body = await readJsonObject(c);
    if (!body) return c.json({ error: "invalid_request" }, 400);
    const challengeId = stringField(body, "challengeId", 36);
    const response = body.response;
    if (!challengeId || !isUuid(challengeId) || !isAuthenticationResponse(response)) {
      return c.json({ error: "invalid_request" }, 400);
    }
    const session = await runtime.auth.completeReauthentication({
      principal,
      challengeId,
      response,
      correlationId: correlationId(c),
    });
    if (!session) return c.json({ error: "verification_failed" }, 401);
    issueSessionCookie(c, session);
    return c.json({ csrfToken: session.csrf });
  });

  app.post("/auth/passkeys/options", async (c) => {
    const runtime = runtimeFor(c);
    const principal = await requireSessionMutation(c, runtime, true);
    if (principal instanceof Response) return principal;
    const result = await runtime.auth.beginPasskeyAddition(principal);
    return result ? c.json(result) : c.json({ error: "reauthentication_required" }, 403);
  });

  app.post("/auth/passkeys/verify", async (c) => {
    const runtime = runtimeFor(c);
    const principal = await requireSessionMutation(c, runtime, true);
    if (principal instanceof Response) return principal;
    const body = await readJsonObject(c);
    if (!body) return c.json({ error: "invalid_request" }, 400);
    const challengeId = stringField(body, "challengeId", 36);
    const response = body.response;
    if (!challengeId || !isUuid(challengeId) || !isRegistrationResponse(response)) {
      return c.json({ error: "invalid_request" }, 400);
    }
    const added = await runtime.auth.completePasskeyAddition({
      principal,
      challengeId,
      response,
      correlationId: correlationId(c),
    });
    return added ? c.body(null, 204) : c.json({ error: "operation_denied" }, 403);
  });

  app.delete("/auth/passkeys/:credentialId", async (c) => {
    const runtime = runtimeFor(c);
    const principal = await requireSessionMutation(c, runtime, true);
    if (principal instanceof Response) return principal;
    const credentialId = c.req.param("credentialId");
    if (!isBase64urlBytes(credentialId, 1024)) return c.json({ error: "invalid_request" }, 400);
    const removed = await runtime.auth.removePasskey({
      principal,
      credentialIdBase64url: credentialId,
      correlationId: correlationId(c),
    });
    return removed ? c.body(null, 204) : c.json({ error: "operation_denied" }, 403);
  });

  app.post("/auth/recovery-email/change/request", async (c) => {
    const runtime = runtimeFor(c);
    const principal = await requireSessionMutation(c, runtime, true);
    if (principal instanceof Response) return principal;
    const body = await readJsonObject(c);
    const email = body ? stringField(body, "email", 320) : null;
    if (!email) return c.json({ error: "invalid_request" }, 400);
    const accepted = await runtime.auth.requestRecoveryEmailChange({
      principal,
      rawEmail: email,
      correlationId: correlationId(c),
    });
    return accepted ? c.json({ accepted: true }, 202) : c.json({ error: "operation_denied" }, 403);
  });

  app.post("/auth/recovery-email/change/complete", async (c) => {
    const runtime = runtimeFor(c);
    const principal = await requireSessionMutation(c, runtime, true);
    if (principal instanceof Response) return principal;
    const body = await readJsonObject(c);
    const secret = body ? stringField(body, "secret", 2048) : null;
    if (!secret) return c.json({ error: "invalid_request" }, 400);
    const changed = await runtime.auth.completeRecoveryEmailChange({
      principal,
      emailActionSecret: secret,
      correlationId: correlationId(c),
    });
    if (!changed) return c.json({ error: "operation_denied" }, 403);
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  app.get("/auth/sessions", async (c) => {
    const runtime = runtimeFor(c);
    const principal = await requireSession(c, runtime, true);
    if (principal instanceof Response) return principal;
    const sessions = await runtime.auth.listSessions(principal);
    return sessions ? c.json({ sessions }) : c.json({ error: "reauthentication_required" }, 403);
  });

  app.delete("/auth/sessions/:sessionId", async (c) => {
    const runtime = runtimeFor(c);
    const principal = await requireSessionMutation(c, runtime, true);
    if (principal instanceof Response) return principal;
    const targetSessionId = c.req.param("sessionId");
    if (!isUuid(targetSessionId)) return c.json({ error: "invalid_request" }, 400);
    const revoked = await runtime.auth.revokeSession({
      principal,
      targetSessionId,
      correlationId: correlationId(c),
    });
    if (!revoked) return c.json({ error: "operation_denied" }, 403);
    if (targetSessionId === principal.sessionId) {
      clearSessionCookie(c);
    }
    return c.body(null, 204);
  });

  app.post("/auth/sessions/revoke-all", async (c) => {
    const runtime = runtimeFor(c);
    const principal = await requireSessionMutation(c, runtime, true);
    if (principal instanceof Response) return principal;
    const revoked = await runtime.auth.revokeEverySession(principal, correlationId(c));
    if (!revoked) return c.json({ error: "operation_denied" }, 403);
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  app.post("/auth/account/delete", async (c) => {
    const runtime = runtimeFor(c);
    const principal = await requireSessionMutation(c, runtime, true);
    if (principal instanceof Response) return principal;
    const body = await readJsonObject(c);
    if (!body || body.confirm !== true) return c.json({ error: "confirmation_required" }, 400);
    const allowed = await runtime.auth.authorizeSecurityOperation(principal);
    if (!allowed) return c.json({ error: "operation_denied" }, 403);
    const deleted = await runtime.auth.deleteAccount({
      principal,
      correlationId: correlationId(c),
    });
    if (!deleted) return c.json({ error: "operation_denied" }, 403);
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  return app;
}
