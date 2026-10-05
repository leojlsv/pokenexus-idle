import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalMigrationsDirectory, discoverMigrations } from "./migrations";

const temporaryDirectories: string[] = [];

async function makeMigrationDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pokenexus-migrations-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("discoverMigrations", () => {
  it("sorts stable IDs and hashes the exact migration bytes", async () => {
    const directory = await makeMigrationDirectory();
    await writeFile(join(directory, "0002_second.sql"), "SELECT 2;\r\n");
    await writeFile(join(directory, "0001_first.sql"), "SELECT 1;\n");

    const migrations = await discoverMigrations(directory);

    expect(migrations.map(({ id }) => id)).toEqual(["0001_first", "0002_second"]);
    expect(migrations[0].checksum.toString("hex")).toBe(
      "b4e0497804e46e0a0b0b8c31975b062152d551bac49c3c2e80932567b4085dcd",
    );
  });

  it("rejects malformed SQL migration names", async () => {
    const directory = await makeMigrationDirectory();
    await writeFile(join(directory, "1_bad.sql"), "SELECT 1;");

    await expect(discoverMigrations(directory)).rejects.toThrow(/Malformed migration filename/);
  });

  it("rejects duplicate migration order IDs", async () => {
    const directory = await makeMigrationDirectory();
    await writeFile(join(directory, "0001_first.sql"), "SELECT 1;");
    await writeFile(join(directory, "0001_second.sql"), "SELECT 2;");

    await expect(discoverMigrations(directory)).rejects.toThrow(/Duplicate migration ID\/order/);
  });

  it("publishes TASK-097 Genetics migration with fail-closed legacy guards and no fabricated defaults", async () => {
    const migrations = await discoverMigrations();
    const migration = migrations.find(({ fileName }) => fileName === "0006_encounter_individualization_genetics.sql");
    expect(migration?.fileName).toBe("0006_encounter_individualization_genetics.sql");
    const sql = await readFile(
      join(canonicalMigrationsDirectory, "0006_encounter_individualization_genetics.sql"),
      "utf8",
    );
    expect(sql).toContain("LOCK TABLE pokenexus.pokemon_instances IN ACCESS EXCLUSIVE MODE");
    expect(sql).toContain("LOCK TABLE pokenexus.hunt_checkpoints IN ACCESS EXCLUSIVE MODE");
    expect(sql).toContain("refuses to fabricate Genetics/Shiny/provenance");
    expect(sql).toContain("refuses to individualize pre-feature durable Hunt checkpoints");
    expect(sql).toContain("ADD COLUMN genetic_score smallint NOT NULL");
    expect(sql).toContain("ADD COLUMN shiny boolean NOT NULL");
    expect(sql).toContain("ADD COLUMN derivation_authority_key_id bytea NOT NULL");
    expect(sql).toContain("ADD COLUMN individualization_snapshot_identity bytea NOT NULL");
    expect(sql).not.toMatch(/\bDEFAULT\b/i);
  });

  it("publishes TASK-036 capture attempt and Species Research authority after TASK-097", async () => {
    const migrations = await discoverMigrations();
    expect(migrations.find(({ fileName }) => fileName === "0007_capture_resolution.sql")?.fileName)
      .toBe("0007_capture_resolution.sql");
    const sql = await readFile(join(canonicalMigrationsDirectory, "0007_capture_resolution.sql"), "utf8");
    expect(sql).toContain("CREATE TABLE pokenexus.capture_attempts");
    expect(sql).toContain("UNIQUE (subject_player_id, attempt_correlation)");
    expect(sql).toContain("UNIQUE (encounter_id)");
    expect(sql).toContain("CREATE TABLE pokenexus.capture_attempt_moves");
    expect(sql).toContain("CREATE TABLE pokenexus.capture_attempt_constructions");
    expect(sql).toContain("CREATE TABLE pokenexus.species_research_counts");
  });

  it("publishes TASK-037 checkpoint claim authority after capture resolution", async () => {
    const migrations = await discoverMigrations();
    expect(migrations.find(({ fileName }) => fileName === "0008_hunt_checkpoint_claim.sql")?.fileName)
      .toBe("0008_hunt_checkpoint_claim.sql");
    const sql = await readFile(join(canonicalMigrationsDirectory, "0008_hunt_checkpoint_claim.sql"), "utf8");
    expect(sql).toContain("ADD COLUMN hunt_run_identity bytea NOT NULL");
    expect(sql).toContain("ADD COLUMN logical_time_anchor_at timestamptz NOT NULL");
    expect(sql).toContain("UNIQUE (player_id, hunt_run_identity)");
    expect(sql).toContain("CREATE TABLE pokenexus.hunt_checkpoint_advance_commands");
    expect(sql).toContain("UNIQUE (subject_player_id, command_correlation)");
    expect(sql).toContain("target_wall_clock_at timestamptz NOT NULL");
    expect(sql).toContain("command_status text NOT NULL");
    expect(sql).toContain("result_state_bytes bytea");
  });

  it("publishes TASK-038 authoritative Hunt orchestration after checkpoint claims", async () => {
    const migrations = await discoverMigrations();
    expect(migrations.find(({ fileName }) => fileName === "0009_authoritative_hunt_api.sql")?.fileName)
      .toBe("0009_authoritative_hunt_api.sql");
    const sql = await readFile(join(canonicalMigrationsDirectory, "0009_authoritative_hunt_api.sql"), "utf8");
    expect(sql).toContain("CREATE TABLE pokenexus.player_hunt_roots");
    expect(sql).toContain("CREATE UNIQUE INDEX solo_hunts_one_active_per_player_idx");
    expect(sql).toContain("UNIQUE (player_id, idempotency_key)");
    expect(sql).toContain("CREATE TABLE pokenexus.hunt_auto_capture_policies");
    expect(sql).toContain("CREATE TABLE pokenexus.hunt_encounter_boundaries");
    expect(sql).toContain("CREATE TABLE pokenexus.hunt_healing_commands");
  });

  it("publishes TASK-108 persistent Pokémon vitality and PokéCenter authority after Hunt orchestration", async () => {
    const migrations = await discoverMigrations();
    expect(migrations.find(({ fileName }) => fileName === "0010_persistent_pokemon_vitality_pokecenter.sql")?.fileName)
      .toBe("0010_persistent_pokemon_vitality_pokecenter.sql");
    const sql = await readFile(
      join(canonicalMigrationsDirectory, "0010_persistent_pokemon_vitality_pokecenter.sql"),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE pokenexus.pokemon_vitalities");
    expect(sql).toContain("PRIMARY KEY (owner_player_id, pokemon_instance_id)");
    expect(sql).toContain("current_hp integer NOT NULL CHECK (current_hp >= 0)");
    expect(sql).toContain("CREATE TABLE pokenexus.pokecenter_heal_commands");
    expect(sql).toContain("UNIQUE (player_id, idempotency_key)");
  });

  it("publishes TASK-109 one-time Player bootstrap authority after persistent vitality", async () => {
    const migrations = await discoverMigrations();
    expect(migrations.find(({ fileName }) => fileName === "0011_first_prealpha_player_bootstrap.sql")?.fileName)
      .toBe("0011_first_prealpha_player_bootstrap.sql");
    const sql = await readFile(
      join(canonicalMigrationsDirectory, "0011_first_prealpha_player_bootstrap.sql"),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE pokenexus.player_bootstraps");
    expect(sql).toContain("player_id uuid PRIMARY KEY");
    expect(sql).toContain("pokemon_instance_id uuid NOT NULL UNIQUE");
    expect(sql).toContain("team_id uuid NOT NULL UNIQUE");
    expect(sql).toContain("FOREIGN KEY (player_id, pokemon_instance_id)");
    expect(sql).toContain("FOREIGN KEY (player_id, team_id)");
  });

  it("publishes TASK-110 independent Auto-Potion and Auto-Revive policy authority", async () => {
    const migrations = await discoverMigrations();
    expect(migrations.find(({ fileName }) => fileName === "0012_hunt_potion_revive_policies.sql")?.fileName)
      .toBe("0012_hunt_potion_revive_policies.sql");
    const sql = await readFile(
      join(canonicalMigrationsDirectory, "0012_hunt_potion_revive_policies.sql"),
      "utf8",
    );
    expect(sql).toContain("current_auto_potion_policy_version uuid");
    expect(sql).toContain("auto_potion_policy_row_version bigint NOT NULL DEFAULT 0");
    expect(sql).toContain("current_auto_revive_policy_version uuid");
    expect(sql).toContain("auto_revive_policy_row_version bigint NOT NULL DEFAULT 0");
    expect(sql).toContain("CREATE TABLE pokenexus.hunt_auto_potion_policies");
    expect(sql).toContain("CREATE TABLE pokenexus.hunt_auto_revive_policies");
    expect(sql).toContain("CREATE TABLE pokenexus.hunt_auto_potion_policy_intervals");
    expect(sql).toContain("CREATE TABLE pokenexus.hunt_auto_revive_policy_intervals");
    expect(sql).toContain("threshold_percent smallint NOT NULL CHECK (threshold_percent IN (90,80,70,60,50,40,30,20,10))");
    expect(sql).toContain("item_rule_version bytea NOT NULL");
    expect(sql).toContain("game_data_version bytea NOT NULL");
    expect(sql).toContain("rules_version bytea NOT NULL");
  });

  it("publishes TASK-110 automatic Potion/Revive exactly-once item-use provenance", async () => {
    const migrations = await discoverMigrations();
    expect(migrations.find(({ fileName }) => fileName === "0013_hunt_automation_item_uses.sql")?.fileName)
      .toBe("0013_hunt_automation_item_uses.sql");
    const sql = await readFile(
      join(canonicalMigrationsDirectory, "0013_hunt_automation_item_uses.sql"),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE pokenexus.hunt_automation_item_uses");
    expect(sql).toContain("PRIMARY KEY (hunt_id, provenance_identity)");
    expect(sql).toContain("automation_family text NOT NULL CHECK (automation_family IN ('potion', 'revive'))");
    expect(sql).toContain("inventory_row_version_before bigint NOT NULL");
    expect(sql).toContain("inventory_row_version_after bigint NOT NULL");
  });

  it("publishes TASK-103 presentation authority as an additive, non-enabling migration", async () => {
    const migrations = await discoverMigrations();
    expect(migrations.at(-1)?.fileName).toBe("0014_hunt_presentation_feed.sql");
    const sql = await readFile(join(canonicalMigrationsDirectory, "0014_hunt_presentation_feed.sql"), "utf8");
    expect(sql).toContain("CREATE TABLE pokenexus.hunt_presentation_streams");
    expect(sql).toContain("CREATE TABLE pokenexus.hunt_presentation_battles");
    expect(sql).toContain("CREATE TABLE pokenexus.hunt_presentation_events");
    expect(sql).toContain("PRIMARY KEY (hunt_id, event_index)");
    expect(sql).toContain("UNIQUE (hunt_id, battle_id, sequence)");
    expect(sql).toContain("public_header_digest bytea NOT NULL");
    expect(sql).toContain("private_source_bytes bytea NOT NULL");
    expect(sql).toContain("presentation_terminal_recorded_at timestamptz");
    expect(sql).toContain("'pokenexus.combat-presentation.v1'");
    expect(sql).toContain("'pokenexus.combat-presentation.v2'");
    expect(sql).not.toContain("'pokenexus.combat-presentation.v3'");
    expect(sql).not.toMatch(/CREATE\s+(?:OR REPLACE\s+)?(?:FUNCTION|TRIGGER|VIEW)\b/iu);
  });
});
