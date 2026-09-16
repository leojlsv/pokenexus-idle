import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { AuthSessionPrincipal, RestrictedPrincipal, SessionIssueResult } from "./application";
import type { AuthEnvironment } from "./config";
import {
  createApiApp,
  CSRF_HEADER_NAME,
  RESTRICTED_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  type AuthHttpApplication,
} from "./http";

const allowedOrigin = "https://example.com";
const now = new Date("2026-09-16T14:00:00.000Z");
const sessionPrincipal: AuthSessionPrincipal = {
  accountId: "0199472a-0000-7000-8000-000000000001",
  sessionId: "0199472a-0000-7000-8000-000000000002",
  bearerDigest: new Uint8Array(32).fill(7),
  securityEpoch: 0n,
  recentAuthAt: now,
  postRecoveryHoldUntil: null,
};
const restrictedPrincipal: RestrictedPrincipal = {
  flow: {
    flowId: "0199472a-0000-7000-8000-000000000003",
    accountId: sessionPrincipal.accountId,
    purpose: "activation",
    securityEpoch: 0n,
    expectedAccountState: "pending_activation",
    expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
  },
};

function authenticationOptions(): PublicKeyCredentialRequestOptionsJSON {
  return {
    challenge: "challenge",
    rpId: "example.com",
    allowCredentials: [],
    timeout: 300_000,
    userVerification: "required",
    extensions: {},
  };
}

function registrationOptions(): PublicKeyCredentialCreationOptionsJSON {
  return {
    challenge: "challenge",
    rp: { id: "example.com", name: "PokeNexus" },
    user: {
      id: "AZlHKgAAcACAAAAAAAAAAQ",
      name: sessionPrincipal.accountId,
      displayName: "PokeNexus account",
    },
    pubKeyCredParams: [{ alg: -7, type: "public-key" }],
    timeout: 300_000,
    attestation: "none",
    excludeCredentials: [],
    authenticatorSelection: {
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
    },
    extensions: { credProps: true },
  };
}

class FakeAuthApplication implements AuthHttpApplication {
  readonly enrollmentEmails: string[] = [];
  readonly recoveryEmails: string[] = [];
  readonly sessionTouches: boolean[] = [];
  readonly calls: string[] = [];
  readonly correlationIds: string[] = [];
  publicWorkGate: Promise<void> | null = null;
  publicWorkFailure: Error | null = null;
  sessionAuthenticationSucceeds = true;
  restrictedAuthenticationSucceeds = true;
  sessionCsrfValid = true;
  restrictedCsrfValid = true;
  securityOperationAllowed = true;

  async requestEnrollment(rawEmail: string, correlationId?: string | null): Promise<void> {
    if (this.publicWorkGate) await this.publicWorkGate;
    if (this.publicWorkFailure) throw this.publicWorkFailure;
    this.enrollmentEmails.push(rawEmail);
    if (correlationId) this.correlationIds.push(correlationId);
  }
  async requestRecovery(rawEmail: string, correlationId?: string | null): Promise<void> {
    if (this.publicWorkGate) await this.publicWorkGate;
    if (this.publicWorkFailure) throw this.publicWorkFailure;
    this.recoveryEmails.push(rawEmail);
    if (correlationId) this.correlationIds.push(correlationId);
  }
  async redeemEmailAction(secret: string) {
    this.calls.push(`redeem:${secret}`);
    return secret === "valid"
      ? {
          bearer: "restricted-bearer",
          csrf: "restricted-csrf",
          expiresAt: restrictedPrincipal.flow.expiresAt,
          purpose: "activation" as const,
        }
      : null;
  }
  async authenticateRestricted(): Promise<RestrictedPrincipal | null> {
    return this.restrictedAuthenticationSucceeds ? restrictedPrincipal : null;
  }
  async verifyRestrictedCsrf(_flowId: string, token: string): Promise<boolean> {
    return this.restrictedCsrfValid && token === "restricted-csrf";
  }
  async beginRestrictedRegistration() {
    this.calls.push("restricted-options");
    return { challengeId: "restricted-challenge-id", options: registrationOptions() };
  }
  async completeRestrictedRegistration(input: {
    restricted: RestrictedPrincipal;
    challengeId: string;
    response: RegistrationResponseJSON;
  }): Promise<SessionIssueResult | null> {
    this.calls.push(`restricted-verify:${input.challengeId}`);
    return this.sessionIssue("new-session-bearer");
  }
  async beginSignIn() {
    this.calls.push("signin-options");
    return { challengeId: "0199472a-0000-7000-8000-000000000004", options: authenticationOptions() };
  }
  async completeSignIn(input: {
    challengeId: string;
    response: AuthenticationResponseJSON;
    networkSignal: string;
  }): Promise<SessionIssueResult | null> {
    this.calls.push(`signin-verify:${input.challengeId}`);
    return this.sessionIssue("signin-bearer");
  }
  async authenticateSession(_rawBearer: string, touchActivity = false): Promise<AuthSessionPrincipal | null> {
    this.sessionTouches.push(touchActivity);
    return this.sessionAuthenticationSucceeds ? sessionPrincipal : null;
  }
  async verifySessionCsrf(_sessionId: string, token: string): Promise<boolean> {
    return this.sessionCsrfValid && token === "session-csrf";
  }
  async sessionCsrf(): Promise<string> {
    return "session-csrf";
  }
  async beginReauthentication() {
    this.calls.push("reauth-options");
    return { challengeId: "0199472a-0000-7000-8000-000000000005", options: authenticationOptions() };
  }
  async completeReauthentication(input: {
    principal: AuthSessionPrincipal;
    challengeId: string;
    response: AuthenticationResponseJSON;
  }): Promise<SessionIssueResult | null> {
    this.calls.push(`reauth-verify:${input.challengeId}`);
    return this.sessionIssue("rotated-bearer");
  }
  async beginPasskeyAddition() {
    this.calls.push("passkey-options");
    return { challengeId: "0199472a-0000-7000-8000-000000000006", options: registrationOptions() };
  }
  async completePasskeyAddition(): Promise<boolean> {
    this.calls.push("passkey-add");
    return true;
  }
  async removePasskey(): Promise<boolean> {
    this.calls.push("passkey-remove");
    return true;
  }
  async requestRecoveryEmailChange(): Promise<boolean> {
    this.calls.push("email-change-request");
    return true;
  }
  async completeRecoveryEmailChange(): Promise<boolean> {
    this.calls.push("email-change-complete");
    return true;
  }
  async listSessions() {
    this.calls.push("sessions-list");
    return [
      {
        sessionId: sessionPrincipal.sessionId,
        authenticatedAt: now,
        lastActivityAt: now,
        absoluteExpiresAt: new Date(now.getTime() + 60_000),
        revokedAt: null,
        deviceLabel: null,
      },
    ];
  }
  async revokeSession(): Promise<boolean> {
    this.calls.push("session-revoke");
    return true;
  }
  async revokeEverySession(): Promise<boolean> {
    this.calls.push("sessions-revoke-all");
    return true;
  }
  async logout(): Promise<boolean> {
    this.calls.push("logout");
    return true;
  }
  async authorizeSecurityOperation(): Promise<boolean> {
    this.calls.push("security-operation-gate");
    return this.securityOperationAllowed;
  }
  async deleteAccount(): Promise<boolean> {
    this.calls.push("account-delete");
    return true;
  }

  private sessionIssue(bearer: string): SessionIssueResult {
    return {
      bearer,
      csrf: "session-csrf",
      absoluteExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    };
  }
}

function webAuthnResponse(): Record<string, unknown> {
  return {
    id: "Y3JlZGVudGlhbA",
    rawId: "Y3JlZGVudGlhbA",
    type: "public-key",
    response: {
      clientDataJSON: "AA",
      authenticatorData: "AA",
      signature: "AA",
      userHandle: "AA",
    },
    clientExtensionResults: {},
  };
}

function requestHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Origin: allowedOrigin, "CF-Connecting-IP": "203.0.113.10", ...extra };
}

describe("authentication HTTP boundary", () => {
  let auth: FakeAuthApplication;
  let app: ReturnType<typeof createApiApp>;
  let deferredWork: Promise<void>[];
  const env = {} as AuthEnvironment;

  beforeEach(() => {
    auth = new FakeAuthApplication();
    deferredWork = [];
    app = createApiApp({
      resolveAuthRuntime: () => ({ auth, allowedOrigins: [allowedOrigin] }),
      deferPublicWork: (work) => deferredWork.push(work),
      createSecurityAuditCorrelationId: () => "0199472a-0000-7000-8000-000000000099",
    });
  });

  it("keeps public enrollment/recovery responses indistinguishable and exact-origin only", async () => {
    const enrollment = await app.request(
      "/auth/enrollment/request",
      { method: "POST", headers: requestHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ email: "new@example.com" }) },
      env,
    );
    const recovery = await app.request(
      "/auth/recovery/request",
      { method: "POST", headers: requestHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ email: "missing@example.com" }) },
      env,
    );
    const malformed = await app.request(
      "/auth/recovery/request",
      { method: "POST", headers: requestHeaders({ "Content-Type": "application/json" }), body: "not-json" },
      env,
    );
    expect([enrollment.status, recovery.status, malformed.status]).toEqual([202, 202, 202]);
    const [enrollmentBody, recoveryBody, malformedBody] = await Promise.all([
      enrollment.text(),
      recovery.text(),
      malformed.text(),
    ]);
    expect(enrollmentBody).toBe(recoveryBody);
    expect(recoveryBody).toBe(malformedBody);
    expect(auth.enrollmentEmails).toEqual(["new@example.com"]);
    expect(auth.recoveryEmails).toEqual(["missing@example.com"]);

    const crossOrigin = await app.request(
      "/auth/enrollment/request",
      { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: JSON.stringify({ email: "x@example.com" }) },
      env,
    );
    expect(crossOrigin.status).toBe(403);
  });

  it("returns generic enrollment/recovery responses before deferred account-dependent work completes", async () => {
    let releasePublicWork!: () => void;
    auth.publicWorkGate = new Promise<void>((resolve) => {
      releasePublicWork = resolve;
    });

    const enrollment = await app.request(
      "/auth/enrollment/request",
      {
        method: "POST",
        headers: requestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email: "deferred@example.com" }),
      },
      env,
    );
    const recovery = await app.request(
      "/auth/recovery/request",
      {
        method: "POST",
        headers: requestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email: "recovery-deferred@example.com" }),
      },
      env,
    );

    expect([enrollment.status, recovery.status]).toEqual([202, 202]);
    await expect(enrollment.json()).resolves.toEqual({ accepted: true });
    await expect(recovery.json()).resolves.toEqual({ accepted: true });
    expect(deferredWork).toHaveLength(2);
    expect(auth.enrollmentEmails).toEqual([]);
    expect(auth.recoveryEmails).toEqual([]);

    releasePublicWork();
    await Promise.all(deferredWork);
    expect(auth.enrollmentEmails).toEqual(["deferred@example.com"]);
    expect(auth.recoveryEmails).toEqual(["recovery-deferred@example.com"]);
  });

  it("keeps deferred public-work failures observable instead of swallowing them", async () => {
    auth.publicWorkFailure = new Error("deferred public auth failure");

    const response = await app.request(
      "/auth/recovery/request",
      {
        method: "POST",
        headers: requestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email: "failure@example.com" }),
      },
      env,
    );

    expect(response.status).toBe(202);
    expect(deferredWork).toHaveLength(1);
    await expect(deferredWork[0]).rejects.toThrow("deferred public auth failure");
  });

  it("never forwards a client X-Request-Id into security-audit correlation", async () => {
    const rawSecretSentinel = "RAW_SESSION_BEARER_SENTINEL_IN_REQUEST_ID";
    const response = await app.request(
      "/auth/enrollment/request",
      {
        method: "POST",
        headers: requestHeaders({
          "Content-Type": "application/json",
          "X-Request-Id": rawSecretSentinel,
        }),
        body: JSON.stringify({ email: "audit@example.com" }),
      },
      env,
    );

    expect(response.status).toBe(202);
    await Promise.all(deferredWork);
    expect(auth.correlationIds).toEqual(["0199472a-0000-7000-8000-000000000099"]);
    expect(auth.correlationIds).not.toContain(rawSecretSentinel);
  });

  it("rejects malformed UUID selectors and nested WebAuthn payloads before application calls", async () => {
    const malformedUuid = await app.request(
      "/auth/passkey/sign-in/verify",
      {
        method: "POST",
        headers: requestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ challengeId: "not-a-uuid", response: webAuthnResponse() }),
      },
      env,
    );
    expect(malformedUuid.status).toBe(400);

    const nestedAuthentication = webAuthnResponse();
    nestedAuthentication.response = { clientDataJSON: "AA", authenticatorData: {}, signature: "AA" };
    const malformedAuthentication = await app.request(
      "/auth/passkey/sign-in/verify",
      {
        method: "POST",
        headers: requestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          challengeId: "0199472a-0000-7000-8000-000000000004",
          response: nestedAuthentication,
        }),
      },
      env,
    );
    expect(malformedAuthentication.status).toBe(400);

    const malformedRegistration = {
      ...webAuthnResponse(),
      response: { clientDataJSON: "AA", attestationObject: { nested: true } },
    };
    const registration = await app.request(
      "/auth/restricted/passkey/verify",
      {
        method: "POST",
        headers: requestHeaders({
          "Content-Type": "application/json",
          Cookie: `${RESTRICTED_COOKIE_NAME}=restricted-bearer`,
          [CSRF_HEADER_NAME]: "restricted-csrf",
        }),
        body: JSON.stringify({
          challengeId: "0199472a-0000-7000-8000-000000000004",
          response: malformedRegistration,
        }),
      },
      env,
    );
    expect(registration.status).toBe(400);

    const sessionSelector = await app.request(
      "/auth/sessions/not-a-uuid",
      {
        method: "DELETE",
        headers: requestHeaders({
          Cookie: `${SESSION_COOKIE_NAME}=bearer`,
          [CSRF_HEADER_NAME]: "session-csrf",
        }),
      },
      env,
    );
    expect(sessionSelector.status).toBe(400);

    const credentialSelector = await app.request(
      "/auth/passkeys/not.valid-base64url",
      {
        method: "DELETE",
        headers: requestHeaders({
          Cookie: `${SESSION_COOKIE_NAME}=bearer`,
          [CSRF_HEADER_NAME]: "session-csrf",
        }),
      },
      env,
    );
    expect(credentialSelector.status).toBe(400);
    expect(auth.calls).not.toContainEqual(expect.stringMatching(/^signin-verify:/));
    expect(auth.calls).not.toContainEqual(expect.stringMatching(/^restricted-verify:/));
    expect(auth.calls).not.toContain("session-revoke");
    expect(auth.calls).not.toContain("passkey-remove");
  });

  it("uses exact credentialed CORS and never emits wildcard origin", async () => {
    const response = await app.request(
      "/auth/passkey/sign-in/options",
      { method: "OPTIONS", headers: { Origin: allowedOrigin } },
      env,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-allow-origin")).not.toBe("*");

    const denied = await app.request(
      "/auth/passkey/sign-in/options",
      { method: "OPTIONS", headers: { Origin: "https://evil.example" } },
      env,
    );
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("redeems email authority only by POST and issues a strict host-only restricted cookie", async () => {
    const get = await app.request("/auth/email-action/redeem", { method: "GET" }, env);
    expect(get.status).toBe(404);
    expect(auth.calls).toEqual([]);

    const response = await app.request(
      "/auth/email-action/redeem",
      { method: "POST", headers: requestHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ secret: "valid" }) },
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ purpose: "activation", csrfToken: "restricted-csrf" });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${RESTRICTED_COOKIE_NAME}=restricted-bearer`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Path=/");
    expect(cookie.toLowerCase()).toContain("samesite=strict");
    expect(cookie.toLowerCase()).not.toContain("domain=");
  });

  it("requires restricted cookie, exact Origin and flow-bound CSRF for restricted mutations", async () => {
    const noCookie = await app.request(
      "/auth/restricted/passkey/options",
      { method: "POST", headers: requestHeaders({ [CSRF_HEADER_NAME]: "restricted-csrf" }) },
      env,
    );
    expect(noCookie.status).toBe(401);

    const badCsrf = await app.request(
      "/auth/restricted/passkey/options",
      { method: "POST", headers: requestHeaders({ Cookie: `${RESTRICTED_COOKIE_NAME}=restricted-bearer`, [CSRF_HEADER_NAME]: "wrong" }) },
      env,
    );
    expect(badCsrf.status).toBe(403);

    const ok = await app.request(
      "/auth/restricted/passkey/options",
      { method: "POST", headers: requestHeaders({ Cookie: `${RESTRICTED_COOKIE_NAME}=restricted-bearer`, [CSRF_HEADER_NAME]: "restricted-csrf" }) },
      env,
    );
    expect(ok.status).toBe(200);
    expect(auth.calls).toContain("restricted-options");
  });

  it("issues a fresh opaque host-only Lax session cookie after sign-in", async () => {
    const response = await app.request(
      "/auth/passkey/sign-in/verify",
      {
        method: "POST",
        headers: requestHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ challengeId: "0199472a-0000-7000-8000-000000000004", response: webAuthnResponse() }),
      },
      env,
    );
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=signin-bearer`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Path=/");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(cookie.toLowerCase()).not.toContain("domain=");
    expect(cookie).not.toContain(sessionPrincipal.accountId);
  });

  it("does not trust a client activity header and uses server route classification", async () => {
    const session = await app.request(
      "/auth/session",
      { headers: { Cookie: `${SESSION_COOKIE_NAME}=bearer`, "X-User-Activity": "true" } },
      env,
    );
    expect(session.status).toBe(200);
    expect(auth.sessionTouches).toEqual([false]);

    const reauth = await app.request(
      "/auth/passkey/reauth/options",
      {
        method: "POST",
        headers: requestHeaders({ Cookie: `${SESSION_COOKIE_NAME}=bearer`, [CSRF_HEADER_NAME]: "session-csrf", "X-User-Activity": "false" }),
      },
      env,
    );
    expect(reauth.status).toBe(200);
    expect(auth.sessionTouches).toEqual([false, true]);
  });

  it("enforces Origin and session-bound CSRF on every cookie-authenticated unsafe route", async () => {
    const routes: Array<{ method: "POST" | "DELETE"; path: string }> = [
      { method: "POST", path: "/auth/logout" },
      { method: "POST", path: "/auth/passkey/reauth/options" },
      { method: "POST", path: "/auth/passkey/reauth/verify" },
      { method: "POST", path: "/auth/passkeys/options" },
      { method: "POST", path: "/auth/passkeys/verify" },
      { method: "DELETE", path: "/auth/passkeys/credential" },
      { method: "POST", path: "/auth/recovery-email/change/request" },
      { method: "POST", path: "/auth/recovery-email/change/complete" },
      { method: "DELETE", path: "/auth/sessions/other" },
      { method: "POST", path: "/auth/sessions/revoke-all" },
      { method: "POST", path: "/auth/account/delete" },
    ];
    for (const route of routes) {
      const missingCsrf = await app.request(
        route.path,
        { method: route.method, headers: requestHeaders({ Cookie: `${SESSION_COOKIE_NAME}=bearer` }) },
        env,
      );
      expect(missingCsrf.status, route.path).toBe(403);
      const badOrigin = await app.request(
        route.path,
        { method: route.method, headers: { Origin: "https://evil.example", Cookie: `${SESSION_COOKIE_NAME}=bearer`, [CSRF_HEADER_NAME]: "session-csrf" } },
        env,
      );
      expect(badOrigin.status, route.path).toBe(403);
    }
  });

  it("requires explicit account-delete confirmation and the reusable security-operation gate", async () => {
    const headers = requestHeaders({
      Cookie: `${SESSION_COOKIE_NAME}=bearer`,
      [CSRF_HEADER_NAME]: "session-csrf",
      "Content-Type": "application/json",
    });
    const noConfirmation = await app.request(
      "/auth/account/delete",
      { method: "POST", headers, body: JSON.stringify({ confirm: false }) },
      env,
    );
    expect(noConfirmation.status).toBe(400);
    expect(auth.calls).not.toContain("account-delete");

    auth.securityOperationAllowed = false;
    const held = await app.request(
      "/auth/account/delete",
      { method: "POST", headers, body: JSON.stringify({ confirm: true }) },
      env,
    );
    expect(held.status).toBe(403);
    expect(auth.calls).toContain("security-operation-gate");
    expect(auth.calls).not.toContain("account-delete");

    auth.securityOperationAllowed = true;
    const deleted = await app.request(
      "/auth/account/delete",
      { method: "POST", headers, body: JSON.stringify({ confirm: true }) },
      env,
    );
    expect(deleted.status).toBe(204);
    expect(auth.calls).toContain("account-delete");
    expect(deleted.headers.get("set-cookie") ?? "").toContain(`${SESSION_COOKIE_NAME}=`);
  });

  it("denies uncategorized auth paths by default", async () => {
    const response = await app.request("/auth/not-a-real-operation", { method: "POST", headers: requestHeaders() }, env);
    expect(response.status).toBe(404);
  });
});
