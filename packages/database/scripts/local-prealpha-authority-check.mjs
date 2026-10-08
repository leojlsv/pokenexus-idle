import process from "node:process";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { encodeOpaqueStringDbV1, withPgClient } from "../dist/index.js";

const connectionString = process.env.POKENEXUS_LOCAL_DATABASE_URL;
const version = process.env.POKENEXUS_LOCAL_AUTHORITY_VERSION;
const keyId = process.env.POKENEXUS_LOCAL_AUTHORITY_KEY_ID;
if (!connectionString || version !== "local-prealpha-individualization-v1" || !/^key-v1:[a-f0-9]{64}$/u.test(keyId ?? "")) {
  throw new Error("Local authority preflight requires the validated local authority identity");
}
const url = new URL(connectionString);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
  !/^\/pokenexus_local_prealpha(?:_|$)/u.test(url.pathname) ||
  !["postgres:", "postgresql:"].includes(url.protocol) || url.search || url.hash) {
  throw new Error("Local authority preflight refuses an untrusted database target");
}
const sources = [
  ["pokemon_instances", "derivation_authority_version", "derivation_authority_key_id"],
  ["hunt_input_authorities", "individualization_authority_version", "individualization_authority_key_id"],
];
await withPgClient({ connectionString }, async (client) => {
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    for (const [table, versionColumn, keyColumn] of sources) {
      const present = await client.query("SELECT to_regclass($1) IS NOT NULL AS present", [`pokenexus.${table}`]);
      if (!present.rows[0]?.present) continue;
      const result = await client.query(`SELECT EXISTS (
        SELECT 1 FROM pokenexus.${table}
        WHERE ${versionColumn} IS DISTINCT FROM $1::bytea OR ${keyColumn} IS DISTINCT FROM $2::bytea
      ) AS mismatch`, [Buffer.from(encodeOpaqueStringDbV1(version)), Buffer.from(encodeOpaqueStringDbV1(keyId))]);
      if (result.rows[0]?.mismatch !== false) {
        throw new Error("Preserved local Pokemon/Hunt authority differs from the supplied individualization key; restore the original authority");
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
});
process.stdout.write("Local preserved individualization authority preflight PASS (read-only).\n");
