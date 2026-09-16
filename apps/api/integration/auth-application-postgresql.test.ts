import { createHash } from "node:crypto";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  generateUuidV7,
  issueWebAuthnChallenge,
  withPgClient,
} from "@pokenexus/database";
import { runMigrations } from "@pokenexus/database/migrations";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AuthenticationApplication, type AuthSessionPrincipal } from "../src/auth/application";
import { createAuthConfig } from "../src/auth/config";
import { FakeEmailActionSender } from "../src/auth/email-sender.fake";
import { createApiApp } from "../src/auth/http";
import { accountIdToUserHandle } from "../src/auth/webauthn";

const testDatabaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL is required for API PostgreSQL integration tests");
}
const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
if (!/^pokenexus_test(?:_|$)/.test(databaseName)) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL must target pokenexus_test or pokenexus_test_*");
}

async function resetSchema(): Promise<void> {
  await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
    await client.query("DROP SCHEMA IF EXISTS pokenexus CASCADE");
  });
}

async function prepareSchema(): Promise<void> {
  await resetSchema();
  await runMigrations({ connectionString: testDatabaseUrl });
}

function sha256(label: string): Buffer {
  return createHash("sha256").update(label).digest();
}

function application(sender: FakeEmailActionSender): AuthenticationApplication {
  return new AuthenticationApplication(
    createAuthConfig({
      HYPERDRIVE: { connectionString: testDatabaseUrl },
      AUTH_RP_ID: "example.com",
      AUTH_ALLOWED_ORIGINS: "https://example.com",
      AUTH_TARGET_HMAC_KEY: "integration-target-key-material-32-bytes",
      AUTH_CSRF_KEY: "integration-csrf-key-material---32-bytes",
    }),
    sender,
    { now: () => new Date("2026-09-16T14:00:00.000Z") },
  );
}

beforeEach(prepareSchema);
afterAll(resetSchema);

describe("AuthenticationApplication PostgreSQL + email port", () => {
  it("persists only server-generated HTTP audit correlation even when X-Request-Id contains a secret sentinel", async () => {
    const sender = new FakeEmailActionSender();
    const auth = application(sender);
    const deferredWork: Promise<void>[] = [];
    const serverCorrelationId = "0199472a-0000-7000-8000-000000000123";
    const rawHeaderSentinel = "RAW_SESSION_BEARER_SENTINEL_FROM_X_REQUEST_ID";
    const app = createApiApp({
      resolveAuthRuntime: () => ({ auth, allowedOrigins: ["https://example.com"] }),
      deferPublicWork: (work) => deferredWork.push(work),
      createSecurityAuditCorrelationId: () => serverCorrelationId,
    });

    const response = await app.request(
      "/auth/enrollment/request",
      {
        method: "POST",
        headers: {
          Origin: "https://example.com",
          "Content-Type": "application/json",
          "X-Request-Id": rawHeaderSentinel,
        },
        body: JSON.stringify({ email: "correlation@example.com" }),
      },
      {} as never,
    );
    expect(response.status).toBe(202);
    expect(deferredWork).toHaveLength(1);
    await Promise.all(deferredWork);

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const events = await client.query<{ correlation_id: string | null }>(
        "SELECT correlation_id FROM pokenexus.auth_security_events ORDER BY created_at, event_id",
      );
      expect(events.rows).toEqual([{ correlation_id: serverCorrelationId }]);
      expect(JSON.stringify(events.rows)).not.toContain(rawHeaderSentinel);
    });
  });

  it("keeps failed enrollment delivery generic, audited, digest-only, and without pre-proof reservation", async () => {
    const sender = new FakeEmailActionSender();
    sender.failActions = true;
    const auth = application(sender);

    await expect(auth.requestEnrollment("User@Example.com", "request-1")).resolves.toBeUndefined();

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const accounts = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.accounts",
      );
      expect(accounts.rows[0].count).toBe("0");

      const actions = await client.query<{
        bearer_digest_length: number;
        candidate_email_canonical: string;
      }>(
        `SELECT octet_length(bearer_digest) AS bearer_digest_length, candidate_email_canonical
         FROM pokenexus.auth_email_actions`,
      );
      expect(actions.rows).toEqual([
        { bearer_digest_length: 32, candidate_email_canonical: "user@example.com" },
      ]);

      const events = await client.query<{
        event_type: string;
        result: string;
        correlation_id: string | null;
        account_id: string | null;
        target_key_length: number | null;
      }>(
        `SELECT event_type, result, correlation_id, account_id,
                octet_length(target_key) AS target_key_length
         FROM pokenexus.auth_security_events`,
      );
      expect(events.rows).toEqual([
        {
          event_type: "enrollment_requested",
          result: "delivery_failed",
          correlation_id: "request-1",
          account_id: null,
          target_key_length: 32,
        },
      ]);
      expect(JSON.stringify(events.rows)).not.toContain("User@Example.com");
    });
  });

  it("does not roll back a committed passkey removal when security notification delivery fails", async () => {
    const sender = new FakeEmailActionSender();
    sender.failNotifications = true;
    const auth = application(sender);
    const now = new Date("2026-09-16T14:00:00.000Z");
    const accountId = generateUuidV7();
    const sessionId = generateUuidV7();
    const firstCredentialId = sha256("notification-first");
    const secondCredentialId = sha256("notification-second");
    const userHandle = Buffer.from(accountIdToUserHandle(accountId));

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      await client.query(
        `INSERT INTO pokenexus.accounts (
           account_id, auth_state, recovery_email_canonical, recovery_email_delivery,
           recovery_email_verified_at, activated_at, created_at, updated_at
         ) VALUES ($1, 'active', 'notify@example.com', 'notify@example.com', $2, $2, $2, $2)`,
        [accountId, now],
      );
      for (const [credentialId, label] of [
        [firstCredentialId, "first"],
        [secondCredentialId, "second"],
      ] as const) {
        await client.query(
          `INSERT INTO pokenexus.webauthn_credentials (
             credential_id, account_id, user_handle, public_key, sign_count,
             backup_eligible, backed_up, credential_status, created_at
           ) VALUES ($1, $2, $3, $4, 0, true, false, 'active', $5)`,
          [credentialId, accountId, userHandle, sha256(`public-${label}`), now],
        );
      }
      await client.query(
        `INSERT INTO pokenexus.auth_sessions (
           session_id, account_id, bearer_digest, issued_security_epoch,
           authenticated_at, recent_auth_at, last_activity_at, absolute_expires_at,
           created_at, updated_at
         ) VALUES ($1, $2, $3, 0, $4, $4, $4, $5, $4, $4)`,
        [sessionId, accountId, sha256("notification-session"), now, new Date(now.getTime() + 60 * 60 * 1000)],
      );
    });

    const principal: AuthSessionPrincipal = {
      accountId,
      sessionId,
      bearerDigest: new Uint8Array(sha256("notification-session")),
      securityEpoch: 0n,
      recentAuthAt: now,
      postRecoveryHoldUntil: null,
    };
    await expect(
      auth.requestRecoveryEmailChange({
        principal,
        rawEmail: "not-an-addr-spec",
        correlationId: "invalid-email",
      }),
    ).resolves.toBe(false);
    await expect(
      auth.removePasskey({
        principal,
        credentialIdBase64url: secondCredentialId.toString("base64url"),
        correlationId: "request-2",
      }),
    ).resolves.toBe(true);

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const account = await client.query<{ security_epoch: string }>(
        "SELECT security_epoch FROM pokenexus.accounts WHERE account_id = $1",
        [accountId],
      );
      expect(account.rows[0].security_epoch).toBe("1");
      const removed = await client.query<{ credential_status: string }>(
        "SELECT credential_status FROM pokenexus.webauthn_credentials WHERE credential_id = $1",
        [secondCredentialId],
      );
      expect(removed.rows[0].credential_status).toBe("revoked");
      const session = await client.query<{ revoked_at: Date | null }>(
        "SELECT revoked_at FROM pokenexus.auth_sessions WHERE session_id = $1",
        [sessionId],
      );
      expect(session.rows[0].revoked_at).not.toBeNull();
      const deliveryFailure = await client.query<{ result: string; reason_code: string }>(
        `SELECT result, reason_code FROM pokenexus.auth_security_events
         WHERE event_type = 'notification_delivery'`,
      );
      expect(deliveryFailure.rows).toEqual([{ result: "failed", reason_code: "passkey_removed" }]);
    });
  });

  it("fails closed on malformed WebAuthn verification responses instead of throwing", async () => {
    const sender = new FakeEmailActionSender();
    const auth = application(sender);
    const now = new Date("2026-09-16T14:00:00.000Z");
    const accountId = generateUuidV7();
    const credentialId = sha256("malformed-signin-credential");
    const userHandle = Buffer.from(accountIdToUserHandle(accountId));
    const signInChallengeId = generateUuidV7();

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      await client.query(
        `INSERT INTO pokenexus.accounts (
           account_id, auth_state, recovery_email_canonical, recovery_email_delivery,
           recovery_email_verified_at, activated_at, created_at, updated_at
         ) VALUES ($1, 'active', 'malformed@example.com', 'malformed@example.com', $2, $2, $2, $2)`,
        [accountId, now],
      );
      await client.query(
        `INSERT INTO pokenexus.webauthn_credentials (
           credential_id, account_id, user_handle, public_key, sign_count,
           backup_eligible, backed_up, credential_status, created_at
         ) VALUES ($1, $2, $3, $4, 0, true, false, 'active', $5)`,
        [credentialId, accountId, userHandle, sha256("malformed-public-key"), now],
      );
      await issueWebAuthnChallenge(client, {
        challengeId: signInChallengeId,
        purpose: "sign_in",
        challengeDigest: sha256("malformed-challenge"),
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        now,
      });
    });

    const malformedAuthentication = {
      id: credentialId.toString("base64url"),
      rawId: credentialId.toString("base64url"),
      type: "public-key",
      clientExtensionResults: {},
      response: {
        clientDataJSON: "not-valid-webauthn",
        authenticatorData: "not-valid-webauthn",
        signature: "not-valid-webauthn",
        userHandle: userHandle.toString("base64url"),
      },
    } as AuthenticationResponseJSON;
    await expect(
      auth.completeSignIn({
        challengeId: signInChallengeId,
        response: malformedAuthentication,
        networkSignal: "203.0.113.20",
      }),
    ).resolves.toBeNull();

    const pendingAccountId = generateUuidV7();
    const flowId = generateUuidV7();
    const registrationChallengeId = generateUuidV7();
    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      await client.query(
        `INSERT INTO pokenexus.accounts (
           account_id, auth_state, recovery_email_canonical, recovery_email_delivery,
           recovery_email_verified_at, created_at, updated_at
         ) VALUES ($1, 'pending_activation', 'pending@example.com', 'pending@example.com', $2, $2, $2)`,
        [pendingAccountId, now],
      );
      await client.query(
        `INSERT INTO pokenexus.auth_restricted_flows (
           flow_id, account_id, purpose, bearer_digest, security_epoch,
           expected_account_state, expires_at, created_at
         ) VALUES ($1, $2, 'activation', $3, 0, 'pending_activation', $4, $5)`,
        [
          flowId,
          pendingAccountId,
          sha256("malformed-flow"),
          new Date(now.getTime() + 15 * 60 * 1000),
          now,
        ],
      );
      await issueWebAuthnChallenge(client, {
        challengeId: registrationChallengeId,
        purpose: "restricted_registration",
        challengeDigest: sha256("malformed-registration-challenge"),
        accountId: pendingAccountId,
        flowId,
        securityEpoch: 0n,
        expectedAccountState: "pending_activation",
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        now,
      });
    });
    const malformedRegistration = {
      id: "bad",
      rawId: "bad",
      type: "public-key",
      clientExtensionResults: { credProps: { rk: true } },
      response: {
        clientDataJSON: "not-valid-webauthn",
        attestationObject: "not-valid-webauthn",
      },
    } as RegistrationResponseJSON;
    await expect(
      auth.completeRestrictedRegistration({
        restricted: {
          flow: {
            flowId,
            accountId: pendingAccountId,
            purpose: "activation",
            securityEpoch: 0n,
            expectedAccountState: "pending_activation",
            expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
          },
        },
        challengeId: registrationChallengeId,
        response: malformedRegistration,
      }),
    ).resolves.toBeNull();
  });

  it("throttles public sign-in work in PostgreSQL before repeated challenge or verification work", async () => {
    const sender = new FakeEmailActionSender();
    const auth = application(sender);

    const firstOptions = await auth.beginSignIn("203.0.113.40", "signin-options-1");
    expect(firstOptions).not.toBeNull();
    await expect(auth.beginSignIn("203.0.113.40", "signin-options-2")).resolves.toBeNull();

    const verificationResponse = {
      id: "dmVyaWZ5LWNyZWRlbnRpYWw",
      rawId: "dmVyaWZ5LWNyZWRlbnRpYWw",
      type: "public-key",
      clientExtensionResults: {},
      response: {
        clientDataJSON: "AA",
        authenticatorData: "AA",
        signature: "AA",
        userHandle: "AA",
      },
    } as AuthenticationResponseJSON;
    const missingChallengeId = generateUuidV7();
    await expect(
      auth.completeSignIn({
        challengeId: missingChallengeId,
        response: verificationResponse,
        networkSignal: "203.0.113.41",
        correlationId: "signin-verify-1",
      }),
    ).resolves.toBeNull();
    await expect(
      auth.completeSignIn({
        challengeId: missingChallengeId,
        response: verificationResponse,
        networkSignal: "203.0.113.41",
        correlationId: "signin-verify-2",
      }),
    ).resolves.toBeNull();

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const challenges = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.auth_webauthn_challenges WHERE purpose = 'sign_in'",
      );
      expect(challenges.rows[0].count).toBe("1");
      const limits = await client.query<{ action_family: string; backoff_level: number }>(
        `SELECT action_family, backoff_level
         FROM pokenexus.auth_issuance_limits
         WHERE action_family LIKE 'sign_in_%'
         ORDER BY action_family`,
      );
      expect(limits.rows).toEqual([
        { action_family: "sign_in_options_network", backoff_level: 0 },
        { action_family: "sign_in_verify_credential", backoff_level: 0 },
        { action_family: "sign_in_verify_network", backoff_level: 0 },
      ]);
      const throttled = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM pokenexus.auth_security_events
         WHERE event_type = 'authentication_abuse' AND result = 'throttled'`,
      );
      expect(throttled.rows[0].count).toBe("2");
    });
  });

  it("emits distinct account-deletion request/completion audit events and notifications", async () => {
    const sender = new FakeEmailActionSender();
    const auth = application(sender);
    const now = new Date("2026-09-16T14:00:00.000Z");
    const accountId = generateUuidV7();
    const sessionId = generateUuidV7();
    const bearerDigest = sha256("deletion-session");

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      await client.query(
        `INSERT INTO pokenexus.accounts (
           account_id, auth_state, recovery_email_canonical, recovery_email_delivery,
           recovery_email_verified_at, activated_at, created_at, updated_at
         ) VALUES ($1, 'active', 'delete@example.com', 'delete@example.com', $2, $2, $2, $2)`,
        [accountId, now],
      );
      await client.query(
        `INSERT INTO pokenexus.auth_sessions (
           session_id, account_id, bearer_digest, issued_security_epoch,
           authenticated_at, recent_auth_at, last_activity_at, absolute_expires_at,
           created_at, updated_at
         ) VALUES ($1, $2, $3, 0, $4, $4, $4, $5, $4, $4)`,
        [sessionId, accountId, bearerDigest, now, new Date(now.getTime() + 60 * 60 * 1000)],
      );
    });

    const principal: AuthSessionPrincipal = {
      accountId,
      sessionId,
      bearerDigest: new Uint8Array(bearerDigest),
      securityEpoch: 0n,
      recentAuthAt: now,
      postRecoveryHoldUntil: null,
    };
    await expect(auth.deleteAccount({ principal, correlationId: "delete-request" })).resolves.toBe(true);
    expect(sender.notifications).toEqual([
      { kind: "account_deletion_requested", recipient: "delete@example.com" },
      { kind: "account_deletion_completed", recipient: "delete@example.com" },
    ]);

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const events = await client.query<{ event_type: string; result: string }>(
        `SELECT event_type, result
         FROM pokenexus.auth_security_events
         WHERE account_id = $1 AND event_type IN ('account_deletion_requested', 'account_deletion_completed')
         ORDER BY event_type`,
        [accountId],
      );
      expect(events.rows).toEqual([
        { event_type: "account_deletion_completed", result: "success" },
        { event_type: "account_deletion_requested", result: "success" },
      ]);
      const account = await client.query<{ auth_state: string; recovery_email_canonical: string | null }>(
        "SELECT auth_state, recovery_email_canonical FROM pokenexus.accounts WHERE account_id = $1",
        [accountId],
      );
      expect(account.rows[0]).toEqual({ auth_state: "deleted", recovery_email_canonical: null });
    });
  });

  it("persists security audit evidence without raw auth secrets or routine email", async () => {
    const sender = new FakeEmailActionSender();
    const auth = application(sender);
    const rawEmail = "Audit.Sentinel@Example.com";
    await auth.requestEnrollment(rawEmail, "audit-enrollment");
    expect(sender.actions).toHaveLength(1);
    const rawEmailActionSecret = sender.actions[0].secret;

    const now = new Date("2026-09-16T14:00:00.000Z");
    const accountId = generateUuidV7();
    const sessionId = generateUuidV7();
    const rawSessionBearer = "RAW_SESSION_BEARER_SENTINEL";
    const rawChallenge = "RAW_WEBAUTHN_CHALLENGE_SENTINEL";
    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      await client.query(
        `INSERT INTO pokenexus.accounts (
           account_id, auth_state, recovery_email_canonical, recovery_email_delivery,
           recovery_email_verified_at, activated_at, created_at, updated_at
         ) VALUES ($1, 'active', 'audit-account@example.com', 'audit-account@example.com', $2, $2, $2, $2)`,
        [accountId, now],
      );
      await client.query(
        `INSERT INTO pokenexus.auth_sessions (
           session_id, account_id, bearer_digest, issued_security_epoch,
           authenticated_at, recent_auth_at, last_activity_at, absolute_expires_at,
           created_at, updated_at
         ) VALUES ($1, $2, $3, 0, $4, $4, $4, $5, $4, $4)`,
        [
          sessionId,
          accountId,
          createHash("sha256").update(rawSessionBearer).digest(),
          now,
          new Date(now.getTime() + 60 * 60 * 1000),
        ],
      );
      await issueWebAuthnChallenge(client, {
        challengeId: generateUuidV7(),
        purpose: "sign_in",
        challengeDigest: createHash("sha256").update(rawChallenge).digest(),
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        now,
      });
    });
    const principal: AuthSessionPrincipal = {
      accountId,
      sessionId,
      bearerDigest: new Uint8Array(createHash("sha256").update(rawSessionBearer).digest()),
      securityEpoch: 0n,
      recentAuthAt: now,
      postRecoveryHoldUntil: null,
    };
    const rawCsrf = await auth.sessionCsrf(sessionId);
    await expect(auth.logout(principal, "audit-logout")).resolves.toBe(true);

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const events = await client.query<{ evidence: string }>(
        `SELECT row_to_json(e)::text AS evidence
         FROM pokenexus.auth_security_events e
         ORDER BY created_at, event_id`,
      );
      const serialized = events.rows.map((row) => row.evidence).join("\n");
      for (const forbidden of [
        rawEmail,
        rawEmail.toLowerCase(),
        rawEmailActionSecret,
        rawSessionBearer,
        rawChallenge,
        rawCsrf,
        "audit-account@example.com",
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
      expect(serialized).toContain(accountId);
      expect(serialized).toContain(sessionId);
    });
  });
});
