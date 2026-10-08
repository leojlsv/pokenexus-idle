import { describe, expect, it } from "vitest";
import { PREALPHA_ITEM_IDS } from "@pokenexus/game-data/runtime";
import {
  createAutoPotionPolicyIntent,
  isDefinitivePolicyRejection,
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
