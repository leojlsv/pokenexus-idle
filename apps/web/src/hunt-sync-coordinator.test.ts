import { describe, expect, it } from "vitest";
import {
  backgroundSyncBlockedByPending,
  coordinatorSyncWork,
  savedCoordinatorSyncIntent,
} from "./hunt-sync-coordinator";

describe("background Hunt synchronization intent", () => {
  const key = "11111111-1111-4111-8111-111111111111";
  const huntId = "22222222-2222-4222-8222-222222222222";

  it("replays only an exact saved sync intent and preserves its frozen mode", () => {
    expect(savedCoordinatorSyncIntent({
      kind: "resume",
      family: "sync",
      key,
      intent: { huntId, mode: "online" },
    })).toEqual({ huntId, mode: "online" });
    expect(savedCoordinatorSyncIntent({
      kind: "resume",
      family: "sync",
      key,
      intent: { huntId, mode: "return" },
    })).toEqual({ huntId, mode: "return" });
  });

  it("rejects non-sync and malformed stored intents", () => {
    expect(savedCoordinatorSyncIntent({ kind: "none" })).toBeNull();
    expect(savedCoordinatorSyncIntent({
      kind: "resume",
      family: "retreat",
      key,
      intent: { huntId },
    })).toBeNull();
    expect(savedCoordinatorSyncIntent({
      kind: "resume",
      family: "sync",
      key,
      intent: { huntId, mode: "other" },
    })).toBeNull();
  });

  it("allows only an empty or exact-sync main lane when the policy lane is empty", () => {
    const sync = {
      kind: "resume" as const,
      family: "sync" as const,
      key,
      intent: { huntId, mode: "online" },
    };
    expect(backgroundSyncBlockedByPending({ kind: "none" }, { kind: "none" })).toBe(false);
    expect(backgroundSyncBlockedByPending(sync, { kind: "none" })).toBe(false);
    expect(backgroundSyncBlockedByPending({ ...sync, family: "retreat" }, { kind: "none" })).toBe(true);
    expect(backgroundSyncBlockedByPending({ kind: "different_player" }, { kind: "none" })).toBe(true);
    expect(backgroundSyncBlockedByPending({ kind: "none" }, {
      kind: "resume",
      family: "potion_policy",
      key,
      intent: {},
    })).toBe(true);
  });

  it("replays an exact saved sync even after the Hunt is no longer active", () => {
    const sync = {
      kind: "resume" as const,
      family: "sync" as const,
      key,
      intent: { huntId, mode: "online" },
    };
    expect(coordinatorSyncWork(null, sync, false)).toEqual({
      kind: "resume",
      huntId,
      mode: "online",
      queuedReturn: false,
    });
  });

  it("finishes an older saved sync before returning a different current Hunt", () => {
    const nextHuntId = "33333333-3333-4333-8333-333333333333";
    const sync = {
      kind: "resume" as const,
      family: "sync" as const,
      key,
      intent: { huntId, mode: "online" },
    };
    expect(coordinatorSyncWork(nextHuntId, sync, true)).toEqual({
      kind: "resume",
      huntId,
      mode: "online",
      queuedReturn: false,
    });
  });

  it("does not create a new sync when there is no active Hunt", () => {
    expect(coordinatorSyncWork(null, { kind: "none" }, true)).toEqual({ kind: "idle" });
  });
});
