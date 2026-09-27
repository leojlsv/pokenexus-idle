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
    expect(migrations.at(-1)?.fileName).toBe("0008_hunt_checkpoint_claim.sql");
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
});
