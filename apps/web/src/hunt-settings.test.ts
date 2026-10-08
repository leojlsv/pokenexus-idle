import { describe, expect, it } from "vitest";
import { PREALPHA_ITEM_IDS } from "@pokenexus/game-data/runtime";
import {
  captureRuleForSettings,
  continuePolicyUntilSettled,
  createAutoPotionPolicyIntent,
  installPolicyLifecycleAbortGeneration,
  isDefinitivePolicyRejection,
  isPolicyAutoContinuable,
  isPolicySaveBlocked,
  normalizeAutomationItemsForOwnedInventory,
  prealphaAutomationItemCandidates,
} from "./hunt-settings";
import { HuntCommandStore } from "./hunt-command-store";
import { HuntApiError } from "./hunt-api";

const thresholds = [90, 80, 70, 60, 50, 40, 30, 20, 10] as const;
const items = Object.freeze([
  Object.freeze({ itemId: "pokenexus:item:basic-potion:v1", autoUseEnabled: true, minimumReserve: "18" }),
]);

describe("Pre-alpha automation item candidates", () => {
  const inventory = [
    { itemId: PREALPHA_ITEM_IDS.standardPokeBall, quantity: "50" },
    { itemId: PREALPHA_ITEM_IDS.basicPotion, quantity: "20" },
    { itemId: PREALPHA_ITEM_IDS.revive25, quantity: "5" },
  ];

  it("shows only Basic Potion for Auto-Potion", () => {
    expect(prealphaAutomationItemCandidates("potion", inventory)).toEqual([
      PREALPHA_ITEM_IDS.basicPotion,
    ]);
  });

  it("shows only Revive-25 for Auto-Revive", () => {
    expect(prealphaAutomationItemCandidates("revive", inventory)).toEqual([
      PREALPHA_ITEM_IDS.revive25,
    ]);
  });
});

describe("Minimum reserve ownership bound", () => {
  const inventory = [
    { itemId: PREALPHA_ITEM_IDS.standardPokeBall, quantity: "50" },
    { itemId: PREALPHA_ITEM_IDS.basicPotion, quantity: "20" },
    { itemId: PREALPHA_ITEM_IDS.revive25, quantity: "5" },
  ];

  it("accepts reserve equal to owned quantity", () => {
    expect(normalizeAutomationItemsForOwnedInventory([
      { itemId: PREALPHA_ITEM_IDS.revive25, autoUseEnabled: true, minimumReserve: "5" },
    ], inventory)).toEqual([
      { itemId: PREALPHA_ITEM_IDS.revive25, autoUseEnabled: true, minimumReserve: "5" },
    ]);
  });

  it("rejects reserve greater than owned quantity", () => {
    expect(() => normalizeAutomationItemsForOwnedInventory([
      { itemId: PREALPHA_ITEM_IDS.revive25, autoUseEnabled: true, minimumReserve: "6" },
    ], inventory)).toThrow("cannot exceed owned quantity 5");
  });

  it("treats an unowned item as quantity zero", () => {
    expect(() => normalizeAutomationItemsForOwnedInventory([
      { itemId: "item:unowned", autoUseEnabled: true, minimumReserve: "1" },
    ], inventory)).toThrow("cannot exceed owned quantity 0");
    expect(normalizeAutomationItemsForOwnedInventory([
      { itemId: "item:unowned", autoUseEnabled: true, minimumReserve: "0" },
    ], inventory)).toEqual([
      { itemId: "item:unowned", autoUseEnabled: true, minimumReserve: "0" },
    ]);
  });

  it("classifies only authoritative 422 policy validation failures as definitive", () => {
    expect(isDefinitivePolicyRejection(new HuntApiError(422, "automation_policy_invalid"))).toBe(true);
    expect(isDefinitivePolicyRejection(new HuntApiError(422, "auto_capture_policy_invalid"))).toBe(true);
    expect(isDefinitivePolicyRejection(new HuntApiError(503, "authority_unavailable"))).toBe(false);
    expect(isDefinitivePolicyRejection(new HuntApiError(409, "stale"))).toBe(false);
  });
});

describe("Policy save availability during Hunt synchronization", () => {
  const sync = {
    kind: "resume" as const,
    family: "sync" as const,
    key: "11111111-1111-4111-8111-111111111111",
    intent: { huntId: "22222222-2222-4222-8222-222222222222", mode: "online" },
  };
  const policy = {
    kind: "resume" as const,
    family: "capture_policy" as const,
    key: "33333333-3333-4333-8333-333333333333",
    intent: { expectedRowVersion: "1", enabled: false, balls: [], rules: [] },
  };

  it("does not let a pending automatic sync hard-lock policy saves", () => {
    expect(isPolicySaveBlocked(sync, { kind: "none" })).toBe(false);
  });

  it("auto-continues only an exact saved policy command", () => {
    expect(isPolicyAutoContinuable(policy)).toBe(true);
    expect(isPolicyAutoContinuable(sync)).toBe(false);
    expect(isPolicyAutoContinuable({ kind: "none" })).toBe(false);
    expect(isPolicyAutoContinuable({ kind: "different_player" })).toBe(false);
    expect(isPolicyAutoContinuable({ kind: "unavailable" })).toBe(false);
  });

  it("continues one saved policy action through repeated 202 results until complete", async () => {
    const results = [
      { kind: "in_progress" as const, logicalTimeMs: "0", targetLogicalTimeMs: "4000" },
      { kind: "in_progress" as const, logicalTimeMs: "2000", targetLogicalTimeMs: "4000" },
      { kind: "complete" as const },
    ];
    const observed: string[] = [];
    let calls = 0;
    await continuePolicyUntilSettled(
      async () => {
        const result = results[calls++];
        if (!result) throw new Error("unexpected extra continuation");
        observed.push(result.kind);
        return result;
      },
      async () => undefined,
    );
    expect(calls).toBe(3);
    expect(observed).toEqual(["in_progress", "in_progress", "complete"]);
  });

  it("stops before another continuation request after the owning lifecycle is aborted", async () => {
    const controller = new AbortController();
    let calls = 0;
    await expect(continuePolicyUntilSettled(
      async () => {
        calls += 1;
        return { kind: "in_progress", logicalTimeMs: "0", targetLogicalTimeMs: "4000" };
      },
      async () => { controller.abort(); },
      controller.signal,
    )).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toBe(1);
  });

  it("honors an abort that lands immediately after the final policy response", async () => {
    const controller = new AbortController();
    let calls = 0;
    await expect(continuePolicyUntilSettled(
      async () => {
        calls += 1;
        controller.abort();
        return { kind: "complete" };
      },
      async () => undefined,
      controller.signal,
    )).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toBe(1);
  });

  it("still serializes policy saves behind an unresolved policy correlation", () => {
    expect(isPolicySaveBlocked(sync, policy)).toBe(true);
    expect(isPolicySaveBlocked({ kind: "none" }, policy)).toBe(true);
  });

  it("keeps ambiguous non-sync Hunt mutations fail-closed", () => {
    expect(isPolicySaveBlocked({ ...sync, family: "retreat" }, { kind: "none" })).toBe(true);
    expect(isPolicySaveBlocked({ kind: "different_player" }, { kind: "none" })).toBe(true);
    expect(isPolicySaveBlocked({ kind: "unavailable" }, { kind: "none" })).toBe(true);
  });

  it("replaces the aborted StrictMode effect generation with a fresh lifecycle signal", () => {
    const ref: { current: AbortController | null } = { current: null };
    const first = installPolicyLifecycleAbortGeneration(ref);
    expect(first.signal.aborted).toBe(false);

    first.cleanup();
    expect(first.signal.aborted).toBe(true);
    expect(ref.current).toBeNull();

    const second = installPolicyLifecycleAbortGeneration(ref);
    expect(second.signal.aborted).toBe(false);
    expect(ref.current?.signal).toBe(second.signal);
    second.cleanup();
  });
});

describe("Capture rule player-visible criteria", () => {
  it("drops historical catch-rate bounds because they are not a player-visible policy input", () => {
    expect(captureRuleForSettings({
      selectedItemId: PREALPHA_ITEM_IDS.standardPokeBall,
      when: {
        shiny: true,
        speciesIds: ["species:test"],
        catchRateMin: 20,
        catchRateMax: 120,
      },
    })).toEqual({
      selectedItemId: PREALPHA_ITEM_IDS.standardPokeBall,
      when: { shiny: true, speciesIds: ["species:test"] },
    });
  });
});

describe("Auto-Potion policy save intent", () => {
  it.each(thresholds)("retains trigger %i and configured items when saving disabled", (threshold) => {
    const intent = createAutoPotionPolicyIntent("0", false, threshold, items);
    expect(JSON.parse(JSON.stringify(intent))).toEqual({
      expectedRowVersion: "0", enabled: false, thresholdPercent: threshold, orderedItems: items,
    });
    expect(intent.orderedItems).toBe(items);
  });

  it("allows an explicit disabled policy with no selected items", () => {
    expect(createAutoPotionPolicyIntent("0", false, 50, [])).toEqual({
      expectedRowVersion: "0", enabled: false, thresholdPercent: 50, orderedItems: [],
    });
  });

  it("preserves the chosen trigger, item permissions and exact OCC token when disabling an existing policy", () => {
    const configured = [...items, { itemId: "item:other-potion", autoUseEnabled: false, minimumReserve: "7" }];
    const enabled = createAutoPotionPolicyIntent("9007199254740993", true, 30, configured);
    const disabled = createAutoPotionPolicyIntent(enabled.expectedRowVersion, false, 30, enabled.orderedItems);
    expect(disabled).toEqual({ ...enabled, enabled: false });
  });

  it("still requires an allowed item only when enabled", () => {
    expect(() => createAutoPotionPolicyIntent("0", true, 50, [])).toThrow("at least one allowed item");
    expect(() => createAutoPotionPolicyIntent("0", true, 50, [{ ...items[0]!, autoUseEnabled: false }]))
      .toThrow("at least one allowed item");
    expect(createAutoPotionPolicyIntent("0", true, 50, items)).toEqual({
      expectedRowVersion: "0", enabled: true, thresholdPercent: 50, orderedItems: items,
    });
  });

  it("does not rewrite an already-frozen null-threshold request or reuse its key with the corrected intent", async () => {
    const values = new Map<string, string>();
    const store = new HuntCommandStore({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    });
    const playerId = "019a7f50-0000-7000-8000-000000000102";
    const oldIntent = { expectedRowVersion: "0", enabled: false, thresholdPercent: null, orderedItems: items };
    const pending = await store.begin(playerId, "potion_policy", oldIntent);
    const corrected = createAutoPotionPolicyIntent("0", false, 50, items);
    await expect(store.begin(playerId, "potion_policy", corrected)).rejects.toThrow("must be reconciled");
    expect(await store.inspect(playerId)).toEqual({ kind: "resume", ...pending });
    expect(await store.discardAfterReconciliation(playerId)).toBe(true);
    const fresh = await store.begin(playerId, "potion_policy", corrected);
    expect(fresh.key).not.toBe(pending.key);
    expect(fresh.intent).toEqual(corrected);
  });
});
