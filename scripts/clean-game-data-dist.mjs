import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
await rm(join(root, "packages", "game-data", "dist"), { recursive: true, force: true });
