import {
  generateUuidV7,
  withPgClient,
} from "@pokenexus/database";
import { runMigrations } from "@pokenexus/database/migrations";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AuthenticationApplication } from "../src/auth/application";
import { createAuthConfig } from "../src/auth/config";
import { digestBearerSecret } from "../src/auth/crypto";
import { createUnavailableEmailActionSender } from "../src/auth/email-sender";
import {
  createApiApp,
  CSRF_HEADER_NAME,
  SESSION_COOKIE_NAME,
} from "../src/auth/http";
import { PlayerApplication } from "../src/player/application";

const testDatabaseUrl = process.env.POKENEXUS_TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL is required for Player API PostgreSQL integration tests");
}
const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
if (!/^pokenexus_test(?:_|$)/.test(databaseName)) {
  throw new Error("POKENEXUS_TEST_DATABASE_URL must target pokenexus_test or pokenexus_test_*");
}

const allowedOrigin = "https://example.com";
const now = new Date("2026-09-17T18:00:00.000Z");
const authConfig = createAuthConfig({
  HYPERDRIVE: { connectionString: testDatabaseUrl },
  AUTH_RP_ID: "example.com",
  AUTH_ALLOWED_ORIGINS: allowedOrigin,
  AUTH_TARGET_HMAC_KEY: "integration-target-key-material-32-bytes",
  AUTH_CSRF_KEY: "integration-csrf-key-material---32-bytes",
});

const auth = new AuthenticationApplication(
  authConfig,
  createUnavailableEmailActionSender(),
  { now: () => now },
);
const player = new PlayerApplication(testDatabaseUrl);
const app = createApiApp({
  resolveAuthRuntime: () => ({ auth, allowedOrigins: [allowedOrigin] }),
  resolvePlayerApplication: () => player,
});

interface SessionFixture {
  readonly accountId: string;
  readonly sessionId: string;
  readonly bearer: string;
  readonly csrf: string;
  readonly initialActivity: Date;
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

async function createActiveSession(label: string): Promise<SessionFixture> {
  const accountId = generateUuidV7();
  const sessionId = generateUuidV7();
  const bearer = `task017-${label}-bearer`;
  const bearerDigest = await digestBearerSecret(bearer);
  const initialActivity = new Date(now.getTime() - 60 * 60 * 1000);
  const absoluteExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
    await client.query(
      `INSERT INTO pokenexus.accounts (
         account_id, auth_state, recovery_email_canonical, recovery_email_delivery,
         recovery_email_verified_at, activated_at, created_at, updated_at
       ) VALUES ($1, 'active', $2, $2, $3, $3, $3, $3)`,
      [accountId, `${label}@example.com`, initialActivity],
    );
    await client.query(
      `INSERT INTO pokenexus.auth_sessions (
         session_id, account_id, bearer_digest, issued_security_epoch,
         authenticated_at, last_activity_at, absolute_expires_at, created_at, updated_at
       ) VALUES ($1, $2, $3, 0, $4, $4, $5, $4, $4)`,
      [sessionId, accountId, Buffer.from(bearerDigest), initialActivity, absoluteExpiresAt],
    );
  });

  return {
    accountId,
    sessionId,
    bearer,
    csrf: await auth.sessionCsrf(sessionId),
    initialActivity,
  };
}

function cookie(fixture: SessionFixture): string {
  return `${SESSION_COOKIE_NAME}=${fixture.bearer}`;
}

beforeEach(prepareSchema);
afterAll(resetSchema);

describe("Player profile API with PostgreSQL", () => {
  it("creates, repeats and loads one private Player without touching inactivity", async () => {
    const session = await createActiveSession("primary");

    const beforeCreate = await app.request(
      "/player/profile",
      { headers: { Cookie: cookie(session) } },
      {} as never,
    );
    expect(beforeCreate.status).toBe(404);
    await expect(beforeCreate.json()).resolves.toEqual({ error: "not_found" });

    const missingCsrf = await app.request(
      "/player/profile",
      {
        method: "PUT",
        headers: { Origin: allowedOrigin, Cookie: cookie(session) },
      },
      {} as never,
    );
    expect(missingCsrf.status).toBe(403);

    const badOrigin = await app.request(
      "/player/profile",
      {
        method: "PUT",
        headers: {
          Origin: "https://evil.example",
          Cookie: cookie(session),
          [CSRF_HEADER_NAME]: session.csrf,
        },
      },
      {} as never,
    );
    expect(badOrigin.status).toBe(403);

    const headers = {
      Origin: allowedOrigin,
      Cookie: cookie(session),
      [CSRF_HEADER_NAME]: session.csrf,
    };
    const createdResponses = await Promise.all(
      Array.from({ length: 4 }, () =>
        app.request("/player/profile", { method: "PUT", headers }, {} as never),
      ),
    );
    expect(createdResponses.map(({ status }) => status)).toEqual([200, 200, 200, 200]);
    const createdBodies = await Promise.all(createdResponses.map((response) => response.json()));
    const returnedIds = new Set(
      createdBodies.map((body) => (body as { playerId: string }).playerId),
    );
    expect(returnedIds.size).toBe(1);
    const [persistedPlayerId] = [...returnedIds];

    const loaded = await app.request(
      "/player/profile",
      { headers: { Cookie: cookie(session), "X-User-Activity": "true" } },
      {} as never,
    );
    expect(loaded.status).toBe(200);
    await expect(loaded.json()).resolves.toEqual({ playerId: persistedPlayerId });

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const players = await client.query<{ player_id: string; account_id: string }>(
        "SELECT player_id, account_id FROM pokenexus.players",
      );
      expect(players.rows).toEqual([{ player_id: persistedPlayerId, account_id: session.accountId }]);

      const activity = await client.query<{ last_activity_at: Date }>(
        "SELECT last_activity_at FROM pokenexus.auth_sessions WHERE session_id = $1",
        [session.sessionId],
      );
      expect(activity.rows[0]?.last_activity_at.getTime()).toBe(session.initialActivity.getTime());
    });
  });

  it("keeps profile authority self-scoped across distinct authenticated accounts", async () => {
    const first = await createActiveSession("first");
    const second = await createActiveSession("second");

    async function createProfile(session: SessionFixture): Promise<string> {
      const response = await app.request(
        "/player/profile",
        {
          method: "PUT",
          headers: {
            Origin: allowedOrigin,
            Cookie: cookie(session),
            [CSRF_HEADER_NAME]: session.csrf,
          },
        },
        {} as never,
      );
      expect(response.status).toBe(200);
      return ((await response.json()) as { playerId: string }).playerId;
    }

    const firstPlayerId = await createProfile(first);
    const secondPlayerId = await createProfile(second);
    expect(firstPlayerId).not.toBe(secondPlayerId);

    const secondRead = await app.request(
      "/player/profile",
      { headers: { Cookie: cookie(second) } },
      {} as never,
    );
    expect(secondRead.status).toBe(200);
    await expect(secondRead.json()).resolves.toEqual({
      playerId: secondPlayerId,
    });

    const foreignSelector = await app.request(
      `/player/profile?accountId=${first.accountId}&playerId=${firstPlayerId}`,
      { headers: { Cookie: cookie(second) } },
      {} as never,
    );
    expect(foreignSelector.status).toBe(200);
    await expect(foreignSelector.json()).resolves.toEqual({
      playerId: secondPlayerId,
    });
  });

  it("rejects an invalid session before any Player row is created", async () => {
    const response = await app.request(
      "/player/profile",
      { headers: { Cookie: `${SESSION_COOKIE_NAME}=invalid-bearer` } },
      {} as never,
    );
    expect(response.status).toBe(401);

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const players = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.players",
      );
      expect(players.rows[0]?.count).toBe("0");
    });
  });

  it("rejects revoked, expired, stale-epoch and recovery-invalidated sessions before Player persistence", async () => {
    const cases: Array<{
      label: string;
      mutate: (session: SessionFixture) => Promise<void>;
    }> = [
      {
        label: "revoked",
        mutate: async (session) =>
          withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
            await client.query(
              "UPDATE pokenexus.auth_sessions SET revoked_at = $2 WHERE session_id = $1",
              [session.sessionId, now],
            );
          }),
      },
      {
        label: "expired",
        mutate: async (session) =>
          withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
            await client.query(
              "UPDATE pokenexus.auth_sessions SET absolute_expires_at = $2 WHERE session_id = $1",
              [session.sessionId, now],
            );
          }),
      },
      {
        label: "stale-epoch",
        mutate: async (session) =>
          withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
            await client.query(
              "UPDATE pokenexus.accounts SET security_epoch = security_epoch + 1 WHERE account_id = $1",
              [session.accountId],
            );
          }),
      },
      {
        label: "recovery-invalidated",
        mutate: async (session) =>
          withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
            await client.query(
              `UPDATE pokenexus.accounts
               SET auth_state = 'recovery_pending',
                   security_epoch = security_epoch + 1,
                   recovery_started_at = $2
               WHERE account_id = $1`,
              [session.accountId, now],
            );
          }),
      },
    ];

    for (const testCase of cases) {
      const session = await createActiveSession(testCase.label);
      await testCase.mutate(session);
      const response = await app.request(
        "/player/profile",
        { headers: { Cookie: cookie(session) } },
        {} as never,
      );
      expect(response.status, testCase.label).toBe(401);
    }

    await withPgClient({ connectionString: testDatabaseUrl }, async (client) => {
      const players = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pokenexus.players",
      );
      expect(players.rows[0]?.count).toBe("0");
    });
  });
});
