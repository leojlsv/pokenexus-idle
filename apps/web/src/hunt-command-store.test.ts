import { describe, expect, it } from "vitest";
import { HuntCommandStore } from "./hunt-command-store";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const PLAYER_A = "11111111-1111-4111-8111-111111111111";
const PLAYER_B = "22222222-2222-4222-8222-222222222222";

describe("HuntCommandStore", () => {
  it("freezes one exact Player-bound command and reuses its key for the same intent", async () => {
    const store = new HuntCommandStore(new MemoryStorage());
    const intent = { huntDefinitionId: "hunt:wilds", teamId: "33333333-3333-4333-8333-333333333333" };
    const first = await store.begin(PLAYER_A, "start", intent);
    const replay = await store.begin(PLAYER_A, "start", { teamId: intent.teamId, huntDefinitionId: intent.huntDefinitionId });

    expect(replay.key).toBe(first.key);
    expect(await store.inspect(PLAYER_A)).toMatchObject({ kind: "resume", family: "start", key: first.key });
    await expect(store.begin(PLAYER_A, "start", { ...intent, huntDefinitionId: "hunt:other" })).rejects.toThrow(/unresolved Hunt command/);
  });

  it("fails closed across Player sessions and only clears the exact frozen key", async () => {
    const store = new HuntCommandStore(new MemoryStorage());
    const frozen = await store.begin(PLAYER_A, "retreat", { huntId: "44444444-4444-4444-8444-444444444444" });

    expect(await store.inspect(PLAYER_B)).toEqual({ kind: "different_player" });
    expect(await store.clear(PLAYER_A, "55555555-5555-4555-8555-555555555555")).toBe(false);
    expect(await store.clear(PLAYER_A, frozen.key)).toBe(true);
    expect(await store.inspect(PLAYER_A)).toEqual({ kind: "none" });
  });

  it("converges concurrent identical begin calls on one durable correlation key", async () => {
    const store = new HuntCommandStore(new MemoryStorage());
    const intent = { huntId: "44444444-4444-4444-8444-444444444444", mode: "online" };

    const [first, second] = await Promise.all([
      store.begin(PLAYER_A, "sync", intent),
      store.begin(PLAYER_A, "sync", intent),
    ]);

    expect(second.key).toBe(first.key);
    expect(await store.inspect(PLAYER_A)).toMatchObject({ kind: "resume", family: "sync", key: first.key });
  });

  it("does not create a correlation when begin is already aborted", async () => {
    const storage = new MemoryStorage();
    const store = new HuntCommandStore(storage);
    const controller = new AbortController();
    controller.abort();

    await expect(store.begin(
      PLAYER_A,
      "sync",
      { huntId: "44444444-4444-4444-8444-444444444444", mode: "return" },
      controller.signal,
    )).rejects.toThrow(/aborted/);
    expect(await store.inspect(PLAYER_A)).toEqual({ kind: "none" });
  });
});
