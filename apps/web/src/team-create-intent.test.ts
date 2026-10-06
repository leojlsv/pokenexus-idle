import { describe, expect, it } from "vitest";
import { TeamCreateIntentStore } from "./team-create-intent";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    },
  };
}

describe("session-reload-safe Team creation identity", () => {
  it("persists the same command UUID before send and replays it after a new component/browser reload", async () => {
    const { storage, values } = memoryStorage();
    const first = new TeamCreateIntentStore(storage);
    expect(await first.inspect("csrf-a")).toEqual({ kind: "none" });
    const key = await first.begin("csrf-a");
    expect(key).toMatch(/^[0-9a-f]{8}-/i);
    expect([...values.values()][0]).not.toContain("csrf-a");

    const afterReload = new TeamCreateIntentStore(storage);
    expect(await afterReload.inspect("csrf-a")).toEqual({ kind: "resume", key });
    expect(await afterReload.begin("csrf-a")).toBe(key);
    expect(await afterReload.clear("csrf-a", key)).toBe(true);
    expect(await first.inspect("csrf-a")).toEqual({ kind: "none" });
  });

  it("will not reuse a prior Player session's key or silently issue a new one", async () => {
    const { storage } = memoryStorage();
    const store = new TeamCreateIntentStore(storage);
    const old = await store.begin("csrf-old-session");
    expect(await store.inspect("csrf-new-session")).toEqual({ kind: "different_session" });
    await expect(store.begin("csrf-new-session")).rejects.toThrow("cannot be safely replaced");
    expect(await store.clear("csrf-new-session", old)).toBe(false);
    expect(await store.inspect("csrf-old-session")).toEqual({ kind: "resume", key: old });
    expect(await store.discardDifferentSession()).toBe(true);
    expect(await store.inspect("csrf-new-session")).toEqual({ kind: "none" });
    const next = await store.begin("csrf-new-session");
    expect(next).not.toBe(old);
  });

  it("fails closed if storage is inaccessible or the pending key is malformed", async () => {
    const unavailable = new TeamCreateIntentStore({
      getItem() { throw new Error("access denied"); },
      setItem() { throw new Error("access denied"); },
      removeItem() { throw new Error("access denied"); },
    });
    expect(await unavailable.inspect("csrf-a")).toEqual({ kind: "unavailable" });
    await expect(unavailable.begin("csrf-a")).rejects.toThrow("cannot be safely replaced");

    const { storage } = memoryStorage();
    storage.setItem("pokenexus:player:pending-team-create:v1", JSON.stringify({ key: "bad", sessionFingerprint: "bad" }));
    const malformed = new TeamCreateIntentStore(storage);
    expect(await malformed.inspect("csrf-a")).toEqual({ kind: "unavailable" });
    await expect(malformed.begin("csrf-a")).rejects.toThrow("cannot be safely replaced");
  });

  it("never emits a usable mutation key when durable storage cannot save it", async () => {
    const store = new TeamCreateIntentStore({
      getItem: () => null,
      setItem: () => { throw new Error("quota exceeded"); },
      removeItem: () => undefined,
    });
    await expect(store.begin("csrf-a")).rejects.toThrow("quota exceeded");
  });
});
