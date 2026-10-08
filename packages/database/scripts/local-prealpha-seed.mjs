import {
  createOrLoadPlayerByAccountId,
  withPgClient,
  withTransaction,
} from "../dist/index.js";
import process from "node:process";
import { URL } from "node:url";

const connectionString = process.env.POKENEXUS_LOCAL_DATABASE_URL;
if (!connectionString) throw new Error("POKENEXUS_LOCAL_DATABASE_URL is required");
const url = new URL(connectionString);
const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
const databaseName = decodeURIComponent(url.pathname.slice(1));
if (!loopback || !/^pokenexus_local_prealpha(?:_|$)/u.test(databaseName) ||
  (url.protocol !== "postgres:" && url.protocol !== "postgresql:") || url.search || url.hash) {
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

async function ensureBootstrapTeamHistoricalReferenceCompatibility(client) {
  const constraint = await client.query(
    `SELECT pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'pokenexus'
        AND t.relname = 'player_bootstraps'
        AND c.conname = 'player_bootstraps_player_id_team_id_fkey'`,
  );
  if (constraint.rows.length > 1) {
    throw new Error("Local Pre-alpha bootstrap Team FK identity is ambiguous");
  }
  if (constraint.rows[0] && !/^FOREIGN KEY \(player_id, team_id\) REFERENCES (?:pokenexus\.)?pokemon_teams\(owner_player_id, team_id\)$/u.test(
    constraint.rows[0].definition,
  )) {
    throw new Error("Local Pre-alpha bootstrap Team FK definition drifted from the reviewed schema");
  }

  await client.query(`
    CREATE OR REPLACE FUNCTION pokenexus.validate_local_prealpha_bootstrap_team_reference()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      PERFORM 1
      FROM pokenexus.pokemon_teams
      WHERE owner_player_id = NEW.player_id
        AND team_id = NEW.team_id
      FOR KEY SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Bootstrap Team reference must identify an existing owned saved Team'
          USING ERRCODE = '23503';
      END IF;
      RETURN NEW;
    END
    $$;
  `);
  await client.query(`DROP TRIGGER IF EXISTS local_prealpha_bootstrap_team_reference_check ON pokenexus.player_bootstraps`);
  await client.query(`
    CREATE TRIGGER local_prealpha_bootstrap_team_reference_check
    BEFORE INSERT OR UPDATE OF player_id, team_id ON pokenexus.player_bootstraps
    FOR EACH ROW
    EXECUTE FUNCTION pokenexus.validate_local_prealpha_bootstrap_team_reference()
  `);
  if (constraint.rows[0]) {
    await client.query(`
      ALTER TABLE pokenexus.player_bootstraps
      DROP CONSTRAINT player_bootstraps_player_id_team_id_fkey
    `);
  }
}

const result = await withPgClient({ connectionString }, (client) =>
  withTransaction(client, async (transaction) => {
    const now = new Date();
    const rows = [];
    await ensureBootstrapTeamHistoricalReferenceCompatibility(transaction);
    for (const fixture of fixtures) {
      await transaction.query(
        `INSERT INTO pokenexus.accounts (
           account_id, auth_state, security_epoch,
           recovery_email_canonical, recovery_email_delivery, recovery_email_verified_at,
           activated_at, created_at, updated_at
         ) VALUES ($1, 'active', 0, $2, $2, $3, $3, $3, $3)
         ON CONFLICT (account_id) DO NOTHING`,
        [fixture.accountId, fixture.email, now],
      );
      const persisted = await transaction.query(
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
      const player = await createOrLoadPlayerByAccountId(transaction, fixture.accountId, fixture.playerId);
      if (player.playerId !== fixture.playerId) {
        throw new Error(`Local fixture account ${fixture.label} is associated with an unexpected Player`);
      }
      rows.push({ label: fixture.label, accountId: fixture.accountId, playerId: player.playerId });
    }
    return rows;
  }));

process.stdout.write(JSON.stringify({
  fixtureVersion: "pokenexus.local-prealpha-identities.v1",
  players: result,
  gameplayBootstrap: "not_attempted_identity_seed_only",
  bootstrapTeamReference: "historical-after-valid-creation",
}, null, 2) + "\n");
