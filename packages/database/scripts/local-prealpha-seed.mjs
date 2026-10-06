import {
  createOrLoadPlayerByAccountId,
  withPgClient,
} from "../dist/index.js";
import process from "node:process";
import { URL } from "node:url";

const connectionString = process.env.POKENEXUS_LOCAL_DATABASE_URL;
if (!connectionString) throw new Error("POKENEXUS_LOCAL_DATABASE_URL is required");
const url = new URL(connectionString);
const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
const databaseName = decodeURIComponent(url.pathname.slice(1));
if (!loopback || !/^pokenexus_local_prealpha(?:_|$)/u.test(databaseName)) {
  throw new Error("Local Pre-alpha seeding refuses non-loopback or non-pokenexus_local_prealpha databases");
}

const fixtures = [
  {
    label: "A",
    accountId: "019a7f50-0000-7000-8000-000000000001",
    playerId: "019a7f50-0000-7000-8000-000000000101",
    email: "prealpha-a@example.invalid",
  },
  {
    label: "B",
    accountId: "019a7f50-0000-7000-8000-000000000002",
    playerId: "019a7f50-0000-7000-8000-000000000102",
    email: "prealpha-b@example.invalid",
  },
];

const result = await withPgClient({ connectionString }, async (client) => {
  const now = new Date();
  const rows = [];
  for (const fixture of fixtures) {
    await client.query(
      `INSERT INTO pokenexus.accounts (
         account_id, auth_state, security_epoch,
         recovery_email_canonical, recovery_email_delivery, recovery_email_verified_at,
         activated_at, created_at, updated_at
       ) VALUES ($1, 'active', 0, $2, $2, $3, $3, $3, $3)
       ON CONFLICT (account_id) DO NOTHING`,
      [fixture.accountId, fixture.email, now],
    );
    const persisted = await client.query(
      `SELECT auth_state, security_epoch, recovery_email_canonical
       FROM pokenexus.accounts WHERE account_id = $1`,
      [fixture.accountId],
    );
    if (persisted.rows.length !== 1 ||
      persisted.rows[0].auth_state !== "active" ||
      persisted.rows[0].security_epoch !== "0" ||
      persisted.rows[0].recovery_email_canonical !== fixture.email) {
      throw new Error(`Local fixture account ${fixture.label} does not match the expected isolated identity`);
    }
    const player = await createOrLoadPlayerByAccountId(client, fixture.accountId, fixture.playerId);
    rows.push({ label: fixture.label, accountId: fixture.accountId, playerId: player.playerId });
  }
  return rows;
});

process.stdout.write(JSON.stringify({
  fixtureVersion: "pokenexus.local-prealpha-identities.v1",
  players: result,
  gameplayBootstrap: "blocked_missing_accepted_genetic_profile_pairs",
}, null, 2) + "\n");
