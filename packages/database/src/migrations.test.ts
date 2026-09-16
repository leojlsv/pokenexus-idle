import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverMigrations } from "./migrations";

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
});
