import { describe, expect, it } from "vitest";
import { PrivateClientCache } from "./private-cache";

describe("PrivateClientCache", () => {
  it("drops all private cached data at a session boundary", () => {
    const cache = new PrivateClientCache();
    cache.set("player", { level: "10" });
    cache.set("inventory", ["item"]);
    expect(cache.size).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("player")).toBeUndefined();
  });
});
