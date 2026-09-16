import { createHash } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  authorizeSensitiveSession,
  completeReauthentication,
  completeRestrictedRegistration,
  completeSignIn,
  findCredentialById,
  getRestrictedFlowByDigest,
  getWebAuthnChallenge,
  issueEmailAction,
  issueWebAuthnChallenge,
  loadSessionByDigest,
  redeemEmailActionToRestrictedFlow,
  removePasskey,
  replaceRecoveryEmail,
  reserveIssuance,
  revokeOneSession,
  setAccountDisabled,
  touchSessionActivity,
  type NewCredentialRecord,
  type NewSessionRecord,
} from "../src/auth-repository";
import { generateUuidV7 } from "../src/uuid-v7";
import { runMigrations } from "../src/migrations";

const testDatabaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    "POKENEXUS_TEST_DATABASE_URL is required for the real PostgreSQL integration suite",
  );
}

const parsedTestDatabaseUrl = new URL(testDatabaseUrl);
const testDatabaseName = decodeURIComponent(parsedTestDatabaseUrl.pathname.slice(1));
if (!/^pokenexus_test(?:_|$)/.test(testDatabaseName)) {
  throw new Error(
    "POKENEXUS_TEST_DATABASE_URL must target a disposable database named pokenexus_test or pokenexus_test_*",
  );
}

async function withClient<T>(operation: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

async function resetSchema(): Promise<void> {
  await withClient(async (client) => {
    await client.query("DROP SCHEMA IF EXISTS pokenexus CASCADE");
  });
}

async function prepareSchema(): Promise<void> {
  await resetSchema();
  await runMigrations({ connectionString: testDatabaseUrl });
}

function digest(label: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(label).digest());
}

function userHandle(accountId: string): Uint8Array {
  return new Uint8Array(Buffer.from(accountId.replaceAll("-", ""), "hex"));
}

function credential(accountId: string, label: string, signCount = 0): NewCredentialRecord {
  return {
    credentialId: digest(`credential:${label}`),
    userHandle: userHandle(accountId),
    publicKey: digest(`public-key:${label}`),
    signCount,
    backupEligible: true,
    backedUp: false,
  };
}

function session(
  label: string,
  now: Date,
  absoluteExpiresAt = new Date(now.getTime() + 60 * 60 * 1000),
): NewSessionRecord {
  return {
    sessionId: generateUuidV7(),
    bearerDigest: digest(`session:${label}`),
    authenticatedAt: now,
    lastActivityAt: now,
    absoluteExpiresAt,
  };
}

async function createActiveAccount(
  client: Client,
  email: string,
  now: Date,
): Promise<string> {
  const accountId = generateUuidV7();
  await client.query(
    `INSERT INTO pokenexus.accounts (
       account_id, auth_state, security_epoch,
       recovery_email_canonical, recovery_email_delivery, recovery_email_verified_at,
       activated_at, created_at, updated_at
     ) VALUES ($1, 'active', 0, $2, $2, $3, $3, $3, $3)`,
    [accountId, email, now],
  );
  return accountId;
}

async function insertCredential(
  client: Client,
  accountId: string,
  value: NewCredentialRecord,
  now: Date,
  status: "active" | "quarantined" | "revoked" = "active",
): Promise<void> {
  await client.query(
    `INSERT INTO pokenexus.webauthn_credentials (
       credential_id, account_id, user_handle, public_key, sign_count,
       backup_eligible, backed_up, credential_status, created_at,
       quarantined_at, revoked_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
       CASE WHEN $8 = 'quarantined' THEN $9::timestamptz ELSE NULL END,
       CASE WHEN $8 = 'revoked' THEN $9::timestamptz ELSE NULL END)`,
    [
      Buffer.from(value.credentialId),
      accountId,
      Buffer.from(value.userHandle),
      Buffer.from(value.publicKey),
      value.signCount,
      value.backupEligible,
      value.backedUp,
      status,
      now,
    ],
  );
}

async function insertSession(
  client: Client,
  accountId: string,
  value: NewSessionRecord,
  now: Date,
  recentAuthAt: Date | null = now,
  lastActivityAt: Date = value.lastActivityAt,
): Promise<void> {
  await client.query(
    `INSERT INTO pokenexus.auth_sessions (
       session_id, account_id, bearer_digest, issued_security_epoch,
       authenticated_at, recent_auth_at, last_activity_at, absolute_expires_at,
       created_at, updated_at
     ) VALUES ($1, $2, $3, 0, $4, $5, $6, $7, $4, $4)`,
    [
      value.sessionId,
      accountId,
      Buffer.from(value.bearerDigest),
      value.authenticatedAt,
      recentAuthAt,
      lastActivityAt,
      value.absoluteExpiresAt,
    ],
  );
}

beforeEach(async () => {
  await prepareSchema();
});

afterAll(async () => {
  await resetSchema();
});

describe("ADR-006 PostgreSQL authentication foundation", () => {
  it("materializes purpose-bound auth tables without cascade delete semantics", async () => {
    await withClient(async (client) => {
      const tables = await client.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'pokenexus' AND table_name LIKE 'auth_%'
        ORDER BY table_name
      `);
      expect(tables.rows.map((row) => row.table_name)).toEqual([
        "auth_email_actions",
        "auth_issuance_limits",
        "auth_restricted_flows",
        "auth_security_events",
        "auth_sessions",
        "auth_webauthn_challenges",
      ]);

      const emailActionChecks = await client.query<{ definition: string }>(`
        SELECT pg_get_constraintdef(c.oid, true) AS definition
        FROM pg_constraint c
        JOIN pg_class r ON r.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = r.relnamespace
        WHERE n.nspname = 'pokenexus'
          AND r.relname = 'auth_email_actions'
          AND c.contype = 'c'
        ORDER BY definition
      `);
      expect(emailActionChecks.rows.map((row) => row.definition).join("\n")).toContain(
        "purpose = 'enrollment'::text",
      );
      expect(emailActionChecks.rows.map((row) => row.definition).join("\n")).toContain(
        "purpose = 'email_change'::text",
      );

      const deleteActions = await client.query<{ confdeltype: string }>(`
        SELECT c.confdeltype
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = 'pokenexus' AND c.contype = 'f'
      `);
      expect(new Set(deleteActions.rows.map((row) => row.confdeltype))).toEqual(new Set(["a"]));

      const accountId = generateUuidV7();
      await client.query("INSERT INTO pokenexus.accounts (account_id) VALUES ($1)", [accountId]);
      await expect(
        client.query(
          `INSERT INTO pokenexus.auth_email_actions (
             email_action_id, account_id, purpose, bearer_digest, target_key,
             candidate_email_canonical, candidate_email_delivery,
             issued_security_epoch, expected_account_state, expires_at
           ) VALUES ($1, $2, 'enrollment', $3, $4, $5, $5, 0, 'active', CURRENT_TIMESTAMP + interval '5 minutes')`,
          [generateUuidV7(), accountId, Buffer.from(digest("bad-enroll")), Buffer.from(digest("target")), "x@example.com"],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        client.query(
          `INSERT INTO pokenexus.auth_email_actions (
             email_action_id, account_id, purpose, bearer_digest, target_key,
             candidate_email_canonical, candidate_email_delivery,
             issued_security_epoch, expected_account_state, expires_at
           ) VALUES ($1, $2, 'recovery', $3, $4, $5, $5, 0, 'active', CURRENT_TIMESTAMP + interval '5 minutes')`,
          [generateUuidV7(), accountId, Buffer.from(digest("bad-recovery")), Buffer.from(digest("target2")), "x@example.com"],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });

  it("enforces authoritative bounded issuance cooldown/backoff in PostgreSQL", async () => {
    const now = new Date("2026-09-16T14:00:00.000Z");
    const targetKey = digest("cooldown-target");
    await withClient(async (client) => {
      await expect(
        reserveIssuance(client, {
          targetKey,
          actionFamily: "recovery",
          now,
          baseCooldownMs: 1_000,
          maxCooldownMs: 4_000,
          maxBackoffLevel: 6,
        }),
      ).resolves.toEqual({
        allowed: true,
        nextAllowedAt: new Date(now.getTime() + 1_000),
      });
      await expect(
        reserveIssuance(client, {
          targetKey,
          actionFamily: "recovery",
          now: new Date(now.getTime() + 500),
          baseCooldownMs: 1_000,
          maxCooldownMs: 4_000,
          maxBackoffLevel: 6,
        }),
      ).resolves.toEqual({
        allowed: false,
        nextAllowedAt: new Date(now.getTime() + 1_000),
      });
      await expect(
        reserveIssuance(client, {
          targetKey,
          actionFamily: "recovery",
          now: new Date(now.getTime() + 1_000),
          baseCooldownMs: 1_000,
          maxCooldownMs: 4_000,
          maxBackoffLevel: 6,
        }),
      ).resolves.toEqual({
        allowed: true,
        nextAllowedAt: new Date(now.getTime() + 3_000),
      });
      const stored = await client.query<{ backoff_level: number; next_allowed_at: Date }>(
        `SELECT backoff_level, next_allowed_at
         FROM pokenexus.auth_issuance_limits
         WHERE target_key = $1 AND action_family = 'recovery'`,
        [Buffer.from(targetKey)],
      );
      expect(stored.rows[0]).toEqual({
        backoff_level: 1,
        next_allowed_at: new Date(now.getTime() + 3_000),
      });
    });
  });

  it("does not reserve an account/email before enrollment proof and consumes redemption once", async () => {
    const now = new Date("2026-09-16T14:00:00.000Z");
    await withClient(async (client) => {
      await issueEmailAction(client, {
        emailActionId: generateUuidV7(),
        purpose: "enrollment",
        bearerDigest: digest("enrollment-token"),
        targetKey: digest("enrollment-target"),
        candidateEmailCanonical: "new@example.com",
        candidateEmailDelivery: "New@example.com",
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        now,
      });
      const before = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.accounts WHERE recovery_email_canonical = 'new@example.com'",
      );
      expect(before.rows[0].count).toBe("0");

      const accountId = generateUuidV7();
      const first = await redeemEmailActionToRestrictedFlow(client, {
        bearerDigest: digest("enrollment-token"),
        enrollmentAccountId: accountId,
        flowId: generateUuidV7(),
        flowBearerDigest: digest("activation-flow"),
        flowExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        now,
      });
      expect(first).toMatchObject({ accountId, purpose: "activation", securityEpoch: 0n });
      const account = await client.query<{
        auth_state: string;
        recovery_email_canonical: string;
        recovery_email_verified_at: Date | null;
      }>(
        "SELECT auth_state, recovery_email_canonical, recovery_email_verified_at FROM pokenexus.accounts WHERE account_id = $1",
        [accountId],
      );
      expect(account.rows[0]).toMatchObject({
        auth_state: "pending_activation",
        recovery_email_canonical: "new@example.com",
      });
      expect(account.rows[0].recovery_email_verified_at).not.toBeNull();

      await expect(
        redeemEmailActionToRestrictedFlow(client, {
          bearerDigest: digest("enrollment-token"),
          enrollmentAccountId: generateUuidV7(),
          flowId: generateUuidV7(),
          flowBearerDigest: digest("activation-flow-2"),
          flowExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
          now,
        }),
      ).resolves.toBeNull();

      await issueEmailAction(client, {
        emailActionId: generateUuidV7(),
        purpose: "enrollment",
        bearerDigest: digest("enrollment-token-resume"),
        targetKey: digest("enrollment-target"),
        candidateEmailCanonical: "new@example.com",
        candidateEmailDelivery: "New@example.com",
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        now: new Date(now.getTime() + 1),
      });
      const resumed = await redeemEmailActionToRestrictedFlow(client, {
        bearerDigest: digest("enrollment-token-resume"),
        enrollmentAccountId: generateUuidV7(),
        flowId: generateUuidV7(),
        flowBearerDigest: digest("activation-flow-resume"),
        flowExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        now: new Date(now.getTime() + 1),
      });
      expect(resumed).toMatchObject({ accountId, purpose: "activation", securityEpoch: 0n });
      const accountCount = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.accounts WHERE recovery_email_canonical = 'new@example.com'",
      );
      expect(accountCount.rows[0].count).toBe("1");
      await expect(
        getRestrictedFlowByDigest(client, digest("activation-flow"), new Date(now.getTime() + 1)),
      ).resolves.toBeNull();
    });
  });

  it("rejects duplicate/cross-account credential binding and exact userHandle mismatch", async () => {
    const now = new Date("2026-09-16T14:00:00.000Z");
    await withClient(async (client) => {
      const accountA = await createActiveAccount(client, "cred-a@example.com", now);
      const accountB = await createActiveAccount(client, "cred-b@example.com", now);
      const credentialA = credential(accountA, "global-id");
      await insertCredential(client, accountA, credentialA, now);

      await expect(
        insertCredential(
          client,
          accountB,
          { ...credentialA, userHandle: userHandle(accountB) },
          now,
        ),
      ).rejects.toMatchObject({ code: "23505" });

      await expect(
        client.query(
          `INSERT INTO pokenexus.webauthn_credentials (
             credential_id, account_id, user_handle, public_key, sign_count,
             backup_eligible, backed_up, credential_status, created_at
           ) VALUES ($1, $2, $3, $4, 0, true, false, 'active', $5)`,
          [
            Buffer.from(digest("wrong-handle-id")),
            accountB,
            Buffer.from(userHandle(accountA)),
            Buffer.from(digest("wrong-handle-key")),
            now,
          ],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });

  it("consumes a WebAuthn challenge and restricted flow exactly once", async () => {
    const now = new Date("2026-09-16T14:00:00.000Z");
    await withClient(async (client) => {
      await issueEmailAction(client, {
        emailActionId: generateUuidV7(),
        purpose: "enrollment",
        bearerDigest: digest("once-enrollment"),
        targetKey: digest("once-target"),
        candidateEmailCanonical: "once@example.com",
        candidateEmailDelivery: "once@example.com",
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        now,
      });
      const flow = await redeemEmailActionToRestrictedFlow(client, {
        bearerDigest: digest("once-enrollment"),
        enrollmentAccountId: generateUuidV7(),
        flowId: generateUuidV7(),
        flowBearerDigest: digest("once-flow"),
        flowExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        now,
      });
      expect(flow).not.toBeNull();
      const challengeId = generateUuidV7();
      await issueWebAuthnChallenge(client, {
        challengeId,
        purpose: "restricted_registration",
        challengeDigest: digest("once-challenge"),
        accountId: flow!.accountId,
        flowId: flow!.flowId,
        securityEpoch: flow!.securityEpoch,
        expectedAccountState: flow!.expectedAccountState,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        now,
      });
      const replacement = credential(flow!.accountId, "once-credential");
      const newSession = session("once-session", now);
      await expect(
        completeRestrictedRegistration(client, {
          flow: flow!,
          challengeId,
          credential: replacement,
          session: newSession,
          now,
          recoveryHoldUntil: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        }),
      ).resolves.toBe(true);
      await expect(
        completeRestrictedRegistration(client, {
          flow: flow!,
          challengeId,
          credential: credential(flow!.accountId, "second-illegal"),
          session: session("second-illegal", now),
          now,
          recoveryHoldUntil: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        }),
      ).resolves.toBe(false);
      await expect(getWebAuthnChallenge(client, challengeId, now)).resolves.toBeNull();
      await expect(getRestrictedFlowByDigest(client, digest("once-flow"), now)).resolves.toBeNull();
    });
  });

  it("starts recovery atomically, resumes one epoch, and permanently retires old credentials", async () => {
    const now = new Date("2026-09-16T14:00:00.000Z");
    await withClient(async (client) => {
      const accountId = await createActiveAccount(client, "recover@example.com", now);
      const oldCredential = credential(accountId, "old", 5);
      await insertCredential(client, accountId, oldCredential, now);
      const staleCredentialPrecheck = await findCredentialById(client, oldCredential.credentialId);
      expect(staleCredentialPrecheck?.status).toBe("active");
      const oldSession = session("old", now);
      await insertSession(client, accountId, oldSession, now);

      await issueEmailAction(client, {
        emailActionId: generateUuidV7(),
        purpose: "recovery",
        accountId,
        bearerDigest: digest("recovery-token"),
        targetKey: digest("recovery-target"),
        issuedSecurityEpoch: 0n,
        expectedAccountState: "active",
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        now,
      });
      const recoveryFlow = await redeemEmailActionToRestrictedFlow(client, {
        bearerDigest: digest("recovery-token"),
        enrollmentAccountId: generateUuidV7(),
        flowId: generateUuidV7(),
        flowBearerDigest: digest("recovery-flow"),
        flowExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        now,
      });
      expect(recoveryFlow).toMatchObject({
        accountId,
        purpose: "recovery",
        securityEpoch: 1n,
        expectedAccountState: "recovery_pending",
      });
      const afterStart = await client.query<{
        auth_state: string;
        security_epoch: string;
        revoked_at: Date | null;
        credential_status: string;
      }>(
        `SELECT a.auth_state, a.security_epoch, s.revoked_at, c.credential_status
         FROM pokenexus.accounts a
         JOIN pokenexus.auth_sessions s ON s.account_id = a.account_id
         JOIN pokenexus.webauthn_credentials c ON c.account_id = a.account_id
         WHERE a.account_id = $1`,
        [accountId],
      );
      expect(afterStart.rows[0].auth_state).toBe("recovery_pending");
      expect(afterStart.rows[0].security_epoch).toBe("1");
      expect(afterStart.rows[0].revoked_at).not.toBeNull();
      expect(afterStart.rows[0].credential_status).toBe("quarantined");

      const staleSignInChallenge = generateUuidV7();
      await issueWebAuthnChallenge(client, {
        challengeId: staleSignInChallenge,
        purpose: "sign_in",
        challengeDigest: digest("stale-precheck-signin"),
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        now,
      });
      await expect(
        completeSignIn(client, {
          challengeId: staleSignInChallenge,
          credentialId: staleCredentialPrecheck!.credentialId,
          observedSignCount: 6,
          backedUp: false,
          session: session("stale-precheck-session", now),
          now,
        }),
      ).resolves.toBeNull();

      await issueEmailAction(client, {
        emailActionId: generateUuidV7(),
        purpose: "recovery",
        accountId,
        bearerDigest: digest("recovery-resume-token"),
        targetKey: digest("recovery-target"),
        issuedSecurityEpoch: 1n,
        expectedAccountState: "recovery_pending",
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        now: new Date(now.getTime() + 1000),
      });
      const resumed = await redeemEmailActionToRestrictedFlow(client, {
        bearerDigest: digest("recovery-resume-token"),
        enrollmentAccountId: generateUuidV7(),
        flowId: generateUuidV7(),
        flowBearerDigest: digest("recovery-flow-resume"),
        flowExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        now: new Date(now.getTime() + 1000),
      });
      expect(resumed?.securityEpoch).toBe(1n);
      await expect(
        getRestrictedFlowByDigest(client, digest("recovery-flow"), new Date(now.getTime() + 1000)),
      ).resolves.toBeNull();

      const replacement = credential(accountId, "replacement", 0);
      const replacementSession = session("replacement", new Date(now.getTime() + 2000));
      const challengeId = generateUuidV7();
      await issueWebAuthnChallenge(client, {
        challengeId,
        purpose: "restricted_registration",
        challengeDigest: digest("restricted-challenge"),
        accountId,
        flowId: resumed!.flowId,
        securityEpoch: 1n,
        expectedAccountState: "recovery_pending",
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        now: new Date(now.getTime() + 2000),
      });
      await expect(
        completeRestrictedRegistration(client, {
          flow: resumed!,
          challengeId,
          credential: replacement,
          session: replacementSession,
          now: new Date(now.getTime() + 2000),
          recoveryHoldUntil: new Date(now.getTime() + 24 * 60 * 60 * 1000 + 2000),
        }),
      ).resolves.toBe(true);

      const credentials = await client.query<{ credential_status: string; credential_id: Buffer }>(
        "SELECT credential_status, credential_id FROM pokenexus.webauthn_credentials WHERE account_id = $1 ORDER BY created_at",
        [accountId],
      );
      expect(credentials.rows.map((row) => row.credential_status)).toEqual(["revoked", "active"]);

      const signInChallenge = generateUuidV7();
      await issueWebAuthnChallenge(client, {
        challengeId: signInChallenge,
        purpose: "sign_in",
        challengeDigest: digest("signin-after-recovery"),
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        now: new Date(now.getTime() + 3000),
      });
      await expect(
        completeSignIn(client, {
          challengeId: signInChallenge,
          credentialId: oldCredential.credentialId,
          observedSignCount: 6,
          backedUp: false,
          session: session("illegal-old", new Date(now.getTime() + 3000)),
          now: new Date(now.getTime() + 3000),
        }),
      ).resolves.toBeNull();
    });
  });

  it("keeps signature counters monotonic when stale observations arrive", async () => {
    const now = new Date("2026-09-16T14:00:00.000Z");
    await withClient(async (client) => {
      const accountId = await createActiveAccount(client, "counter@example.com", now);
      const value = credential(accountId, "counter", 5);
      await insertCredential(client, accountId, value, now);

      for (const [index, observed] of [3, 8, 7].entries()) {
        const challengeId = generateUuidV7();
        await issueWebAuthnChallenge(client, {
          challengeId,
          purpose: "sign_in",
          challengeDigest: digest(`counter-challenge-${index}`),
          expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
          now,
        });
        await expect(
          completeSignIn(client, {
            challengeId,
            credentialId: value.credentialId,
            observedSignCount: observed,
            backedUp: false,
            session: session(`counter-${index}`, now),
            now,
          }),
        ).resolves.not.toBeNull();
      }
      const stored = await client.query<{ sign_count: string }>(
        "SELECT sign_count FROM pokenexus.webauthn_credentials WHERE credential_id = $1",
        [Buffer.from(value.credentialId)],
      );
      expect(stored.rows[0].sign_count).toBe("8");
      const sessionCreatedEvents = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.auth_security_events WHERE account_id = $1 AND event_type = 'session_created'",
        [accountId],
      );
      expect(sessionCreatedEvents.rows[0].count).toBe("3");
    });
  });

  it("rejects an in-flight old bearer after reauthentication rotates the same session", async () => {
    const now = new Date("2026-09-16T14:00:00.000Z");
    await withClient(async (staleRequestClient) => {
      const accountId = await createActiveAccount(staleRequestClient, "rotation@example.com", now);
      const passkey = credential(accountId, "rotation", 4);
      await insertCredential(staleRequestClient, accountId, passkey, now);
      const originalSession = session("rotation-old", now);
      await insertSession(staleRequestClient, accountId, originalSession, now, null);

      const stalePrincipal = await loadSessionByDigest(
        staleRequestClient,
        originalSession.bearerDigest,
      );
      expect(stalePrincipal).not.toBeNull();
      expect(stalePrincipal?.recentAuthAt).toBeNull();

      const challengeId = generateUuidV7();
      await issueWebAuthnChallenge(staleRequestClient, {
        challengeId,
        purpose: "reauth",
        challengeDigest: digest("rotation-reauth-challenge"),
        accountId,
        securityEpoch: 0n,
        expectedAccountState: "active",
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        now,
      });

      const rotatedBearerDigest = digest("rotation-new-bearer");
      await withClient(async (rotationClient) => {
        await expect(
          completeReauthentication(rotationClient, {
            challengeId,
            sessionId: originalSession.sessionId,
            accountId,
            expectedBearerDigest: originalSession.bearerDigest,
            credentialId: passkey.credentialId,
            observedSignCount: 5,
            backedUp: false,
            rotatedBearerDigest,
            absoluteExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
            now,
            inactivityLifetimeMs: 7 * 24 * 60 * 60 * 1000,
          }),
        ).resolves.toMatchObject({ previousSignCount: 4n });
      });

      await expect(
        authorizeSensitiveSession(staleRequestClient, {
          accountId,
          sessionId: originalSession.sessionId,
          expectedBearerDigest: originalSession.bearerDigest,
          now,
          inactivityLifetimeMs: 7 * 24 * 60 * 60 * 1000,
          recentAuthLifetimeMs: 10 * 60 * 1000,
        }),
      ).resolves.toBeNull();
      await expect(
        touchSessionActivity(
          staleRequestClient,
          originalSession.sessionId,
          accountId,
          0n,
          originalSession.bearerDigest,
          now,
          7 * 24 * 60 * 60 * 1000,
        ),
      ).resolves.toBe(false);
      await expect(
        authorizeSensitiveSession(staleRequestClient, {
          accountId,
          sessionId: originalSession.sessionId,
          expectedBearerDigest: rotatedBearerDigest,
          now,
          inactivityLifetimeMs: 7 * 24 * 60 * 60 * 1000,
          recentAuthLifetimeMs: 10 * 60 * 1000,
        }),
      ).resolves.not.toBeNull();
      await expect(loadSessionByDigest(staleRequestClient, originalSession.bearerDigest)).resolves.toBeNull();
      await expect(loadSessionByDigest(staleRequestClient, rotatedBearerDigest)).resolves.not.toBeNull();
    });
  });

  it("enforces inactivity boundaries atomically and cannot revive an expired session", async () => {
    const now = new Date("2026-09-16T14:00:00.000Z");
    await withClient(async (client) => {
      const accountId = await createActiveAccount(client, "activity@example.com", now);
      const createdAt = new Date(now.getTime() - 200_000);
      const absoluteExpiry = new Date(now.getTime() + 60 * 60 * 1000);
      const before = session("before", createdAt, absoluteExpiry);
      const exact = session("exact", createdAt, absoluteExpiry);
      const after = session("after", createdAt, absoluteExpiry);
      await insertSession(client, accountId, before, now, now, new Date(now.getTime() - 99_999));
      await insertSession(client, accountId, exact, now, now, new Date(now.getTime() - 100_000));
      await insertSession(client, accountId, after, now, now, new Date(now.getTime() - 100_001));

      await expect(
        touchSessionActivity(client, before.sessionId, accountId, 0n, before.bearerDigest, now, 100_000),
      ).resolves.toBe(true);
      await expect(
        touchSessionActivity(client, exact.sessionId, accountId, 0n, exact.bearerDigest, now, 100_000),
      ).resolves.toBe(false);
      await expect(
        touchSessionActivity(client, after.sessionId, accountId, 0n, after.bearerDigest, now, 100_000),
      ).resolves.toBe(false);
    });
  });

  it("revalidates recent-auth and post-recovery hold inside sensitive transactions", async () => {
    const now = new Date("2026-09-16T14:00:00.000Z");
    await withClient(async (client) => {
      const accountId = await createActiveAccount(client, "sensitive@example.com", now);
      const firstCredential = credential(accountId, "sensitive-first");
      const secondCredential = credential(accountId, "sensitive-second");
      await insertCredential(client, accountId, firstCredential, now);
      await insertCredential(client, accountId, secondCredential, now);
      const authSession = session("sensitive", now);
      await insertSession(client, accountId, authSession, now, now);

      const authorization = {
        accountId,
        sessionId: authSession.sessionId,
        expectedBearerDigest: authSession.bearerDigest,
        now,
        inactivityLifetimeMs: 7 * 24 * 60 * 60 * 1000,
        recentAuthLifetimeMs: 10 * 60 * 1000,
      } as const;
      await expect(authorizeSensitiveSession(client, authorization)).resolves.not.toBeNull();

      await client.query(
        "UPDATE pokenexus.accounts SET post_recovery_hold_until = $2 WHERE account_id = $1",
        [accountId, new Date(now.getTime() + 1)],
      );
      await expect(authorizeSensitiveSession(client, authorization)).resolves.toBeNull();
      await client.query(
        "UPDATE pokenexus.accounts SET post_recovery_hold_until = NULL WHERE account_id = $1",
        [accountId],
      );

      const recentAuthBoundary = {
        ...authorization,
        now: new Date(now.getTime() + 10 * 60 * 1000 + 1),
      };
      await expect(authorizeSensitiveSession(client, recentAuthBoundary)).resolves.toBeNull();
      await client.query(
        "UPDATE pokenexus.auth_sessions SET recent_auth_at = $2 WHERE session_id = $1",
        [authSession.sessionId, new Date(now.getTime() + 2)],
      );
      await expect(authorizeSensitiveSession(client, recentAuthBoundary)).resolves.not.toBeNull();

      const stalePrecheck = await loadSessionByDigest(client, authSession.bearerDigest);
      expect(stalePrecheck).not.toBeNull();
      await expect(
        revokeOneSession(client, {
          ...authorization,
          targetSessionId: authSession.sessionId,
        }),
      ).resolves.toBe(true);
      await expect(
        removePasskey(client, {
          accountId,
          authorizingSessionId: authSession.sessionId,
          authorizingBearerDigest: authSession.bearerDigest,
          credentialId: secondCredential.credentialId,
          now,
          inactivityLifetimeMs: authorization.inactivityLifetimeMs,
          recentAuthLifetimeMs: authorization.recentAuthLifetimeMs,
        }),
      ).resolves.toBe(false);
      const activeCount = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.webauthn_credentials WHERE account_id = $1 AND credential_status = 'active'",
        [accountId],
      );
      expect(activeCount.rows[0].count).toBe("2");
    });
  });

  it("rejects sensitive authorization for absolute-expired, revoked, and stale-epoch sessions", async () => {
    const now = new Date("2026-09-16T14:00:00.000Z");
    await withClient(async (client) => {
      const policy = {
        now,
        inactivityLifetimeMs: 7 * 24 * 60 * 60 * 1000,
        recentAuthLifetimeMs: 10 * 60 * 1000,
      } as const;

      const expiredAccount = await createActiveAccount(client, "expired@example.com", now);
      const expiredStart = new Date(now.getTime() - 2 * 60 * 1000);
      const expiredSession = session(
        "absolute-expired",
        expiredStart,
        new Date(now.getTime() - 1),
      );
      await insertSession(client, expiredAccount, expiredSession, expiredStart, expiredStart);
      await expect(
        authorizeSensitiveSession(client, {
          accountId: expiredAccount,
          sessionId: expiredSession.sessionId,
          expectedBearerDigest: expiredSession.bearerDigest,
          ...policy,
        }),
      ).resolves.toBeNull();

      const revokedAccount = await createActiveAccount(client, "revoked@example.com", now);
      const revokedSession = session("revoked", now);
      await insertSession(client, revokedAccount, revokedSession, now, now);
      await client.query("UPDATE pokenexus.auth_sessions SET revoked_at = $2 WHERE session_id = $1", [
        revokedSession.sessionId,
        now,
      ]);
      await expect(
        authorizeSensitiveSession(client, {
          accountId: revokedAccount,
          sessionId: revokedSession.sessionId,
          expectedBearerDigest: revokedSession.bearerDigest,
          ...policy,
        }),
      ).resolves.toBeNull();

      const staleAccount = await createActiveAccount(client, "stale-epoch@example.com", now);
      const staleSession = session("stale-epoch", now);
      await insertSession(client, staleAccount, staleSession, now, now);
      await client.query("UPDATE pokenexus.accounts SET security_epoch = 1 WHERE account_id = $1", [
        staleAccount,
      ]);
      await expect(
        authorizeSensitiveSession(client, {
          accountId: staleAccount,
          sessionId: staleSession.sessionId,
          expectedBearerDigest: staleSession.bearerDigest,
          ...policy,
        }),
      ).resolves.toBeNull();
    });
  });

  it("keeps a canonical recovery-email swap atomic under a uniqueness race", async () => {
    const now = new Date("2026-09-16T14:00:00.000Z");
    let accountA = "";
    let accountB = "";
    let sessionA!: NewSessionRecord;
    let sessionB!: NewSessionRecord;
    await withClient(async (client) => {
      accountA = await createActiveAccount(client, "race-a@example.com", now);
      accountB = await createActiveAccount(client, "race-b@example.com", now);
      sessionA = session("race-a", now);
      sessionB = session("race-b", now);
      await insertSession(client, accountA, sessionA, now, now);
      await insertSession(client, accountB, sessionB, now, now);
      await issueEmailAction(client, {
        emailActionId: generateUuidV7(),
        purpose: "email_change",
        accountId: accountA,
        bearerDigest: digest("race-email-a"),
        targetKey: digest("race-target"),
        candidateEmailCanonical: "winner@example.com",
        candidateEmailDelivery: "winner@example.com",
        issuedSecurityEpoch: 0n,
        expectedAccountState: "active",
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        now,
      });
      await issueEmailAction(client, {
        emailActionId: generateUuidV7(),
        purpose: "email_change",
        accountId: accountB,
        bearerDigest: digest("race-email-b"),
        targetKey: digest("race-target"),
        candidateEmailCanonical: "winner@example.com",
        candidateEmailDelivery: "winner@example.com",
        issuedSecurityEpoch: 0n,
        expectedAccountState: "active",
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        now,
      });
    });

    const attempts = await Promise.allSettled([
      withClient((client) =>
        replaceRecoveryEmail(client, {
          accountId: accountA,
          authorizingSessionId: sessionA.sessionId,
          authorizingBearerDigest: sessionA.bearerDigest,
          bearerDigest: digest("race-email-a"),
          now,
          inactivityLifetimeMs: 7 * 24 * 60 * 60 * 1000,
          recentAuthLifetimeMs: 10 * 60 * 1000,
        }),
      ),
      withClient((client) =>
        replaceRecoveryEmail(client, {
          accountId: accountB,
          authorizingSessionId: sessionB.sessionId,
          authorizingBearerDigest: sessionB.bearerDigest,
          bearerDigest: digest("race-email-b"),
          now,
          inactivityLifetimeMs: 7 * 24 * 60 * 60 * 1000,
          recentAuthLifetimeMs: 10 * 60 * 1000,
        }),
      ),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    await withClient(async (client) => {
      const rows = await client.query<{ recovery_email_canonical: string }>(
        "SELECT recovery_email_canonical FROM pokenexus.accounts WHERE account_id = ANY($1::uuid[]) ORDER BY recovery_email_canonical",
        [[accountA, accountB]],
      );
      expect(rows.rows.map((row) => row.recovery_email_canonical).sort()).toEqual([
        expect.stringMatching(/^race-[ab]@example\.com$/),
        "winner@example.com",
      ]);
    });
  });

  it("atomically replaces/releases canonical recovery email and invalidates prior sessions", async () => {
    const now = new Date("2026-09-16T14:00:00.000Z");
    await withClient(async (client) => {
      const accountId = await createActiveAccount(client, "old@example.com", now);
      const authSession = session("email-change", now);
      await insertSession(client, accountId, authSession, now, now);
      await issueEmailAction(client, {
        emailActionId: generateUuidV7(),
        purpose: "email_change",
        accountId,
        bearerDigest: digest("email-change-token"),
        targetKey: digest("new-email-target"),
        candidateEmailCanonical: "new@example.com",
        candidateEmailDelivery: "New@example.com",
        issuedSecurityEpoch: 0n,
        expectedAccountState: "active",
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        now,
      });

      const result = await replaceRecoveryEmail(client, {
        accountId,
        authorizingSessionId: authSession.sessionId,
        authorizingBearerDigest: authSession.bearerDigest,
        bearerDigest: digest("email-change-token"),
        now,
        inactivityLifetimeMs: 7 * 24 * 60 * 60 * 1000,
        recentAuthLifetimeMs: 10 * 60 * 1000,
      });
      expect(result).toEqual({ previousDeliveryEmail: "old@example.com", nextSecurityEpoch: 1n });
      const updated = await client.query<{
        recovery_email_canonical: string;
        security_epoch: string;
        revoked_at: Date | null;
      }>(
        `SELECT a.recovery_email_canonical, a.security_epoch, s.revoked_at
         FROM pokenexus.accounts a JOIN pokenexus.auth_sessions s ON s.account_id = a.account_id
         WHERE a.account_id = $1`,
        [accountId],
      );
      expect(updated.rows[0].recovery_email_canonical).toBe("new@example.com");
      expect(updated.rows[0].security_epoch).toBe("1");
      expect(updated.rows[0].revoked_at).not.toBeNull();

      await expect(createActiveAccount(client, "old@example.com", now)).resolves.toEqual(expect.any(String));
    });
  });

  it("cannot promote pending activation or recovery through disable/re-enable", async () => {
    const now = new Date("2026-09-16T14:00:00.000Z");
    await withClient(async (client) => {
      const pending = generateUuidV7();
      const recovering = generateUuidV7();
      const active = generateUuidV7();
      await client.query(
        `INSERT INTO pokenexus.accounts (
           account_id, auth_state, security_epoch,
           recovery_email_canonical, recovery_email_delivery, recovery_email_verified_at,
           created_at, updated_at
         ) VALUES
           ($1, 'pending_activation', 0, NULL, NULL, NULL, $4, $4),
           ($2, 'recovery_pending', 1, 'recovering@example.com', 'recovering@example.com', $4, $4, $4),
           ($3, 'active', 0, 'active@example.com', 'active@example.com', $4, $4, $4)`,
        [pending, recovering, active, now],
      );
      await expect(setAccountDisabled(client, pending, true, now)).resolves.toBe(false);
      await expect(setAccountDisabled(client, recovering, true, now)).resolves.toBe(false);
      await expect(setAccountDisabled(client, active, true, now)).resolves.toBe(true);
      await expect(setAccountDisabled(client, active, false, new Date(now.getTime() + 1))).resolves.toBe(true);

      const states = await client.query<{ account_id: string; auth_state: string }>(
        "SELECT account_id, auth_state FROM pokenexus.accounts WHERE account_id = ANY($1::uuid[]) ORDER BY account_id",
        [[pending, recovering, active]],
      );
      expect(Object.fromEntries(states.rows.map((row) => [row.account_id, row.auth_state]))).toEqual({
        [pending]: "pending_activation",
        [recovering]: "recovery_pending",
        [active]: "active",
      });
    });
  });
});
