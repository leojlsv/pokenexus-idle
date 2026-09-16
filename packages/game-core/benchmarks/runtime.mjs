import { URL } from "node:url";
import { registerGameCoreDistResolver } from "./dist-resolver.mjs";

const DIST_ROOT_URL = new URL("../dist/", import.meta.url);

export async function loadBuiltRuntime() {
  registerGameCoreDistResolver(DIST_ROOT_URL);
  const [engine, fixtures] = await Promise.all([
    import(new URL("../dist/index.js", import.meta.url).href),
    import(new URL("../dist/testing/combat-fixtures.js", import.meta.url).href),
  ]);
  return { engine, fixtures };
}
