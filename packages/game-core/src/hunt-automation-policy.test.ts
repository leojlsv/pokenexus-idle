import { describe, expect, it } from "vitest";
import {
  NO_SAVED_AUTO_POTION_POLICY,
  NO_SAVED_AUTO_REVIVE_POLICY,
  assertHuntAutomationPolicyAuthoritySnapshot,
  isAutoPotionEligible,
  selectEligibleAutomationItem,
  type HuntAutomationPolicyAuthoritySnapshot,
} from "./hunt-automation-policy";

describe("TASK-110 Hunt automation policy authority", () => {
  it("exposes the exact immutable no-saved Potion and Revive sentinels", () => {
    expect(NO_SAVED_AUTO_POTION_POLICY).toEqual({
      policyVersion: null,
      rowVersion: "0",
      enabled: false,
      thresholdPercent: null,
      orderedItems: [],
    });
    expect(NO_SAVED_AUTO_REVIVE_POLICY).toEqual({
      policyVersion: null,
      rowVersion: "0",
      enabled: false,
      orderedItems: [],
    });
  });

  it("evaluates Potion eligibility with integer HP <= threshold semantics only for a living damaged target", () => {
    expect(isAutoPotionEligible({ currentHp: 45, maxHp: 100, thresholdPercent: 50 })).toBe(true);
    expect(isAutoPotionEligible({ currentHp: 50, maxHp: 100, thresholdPercent: 50 })).toBe(true);
    expect(isAutoPotionEligible({ currentHp: 51, maxHp: 100, thresholdPercent: 50 })).toBe(false);
    expect(isAutoPotionEligible({ currentHp: 0, maxHp: 100, thresholdPercent: 50 })).toBe(false);
    expect(isAutoPotionEligible({ currentHp: 100, maxHp: 100, thresholdPercent: 90 })).toBe(false);
    expect(isAutoPotionEligible({ currentHp: 1, maxHp: 3, thresholdPercent: 40 })).toBe(true);
  });

  it("selects the first enabled item whose post-debit quantity preserves minimum reserve", () => {
    const orderedItems = [
      { itemId: "item:max-potion", autoUseEnabled: false, minimumReserve: "0" },
      { itemId: "item:super-potion", autoUseEnabled: true, minimumReserve: "2" },
      { itemId: "item:potion", autoUseEnabled: true, minimumReserve: "1" },
    ] as const;
    expect(selectEligibleAutomationItem(orderedItems, new Map([
      ["item:max-potion", 99n],
      ["item:super-potion", 2n],
      ["item:potion", 2n],
    ]))).toBe("item:potion");
    expect(selectEligibleAutomationItem(orderedItems, new Map([
      ["item:super-potion", 3n],
      ["item:potion", 2n],
    ]))).toBe("item:super-potion");
    expect(selectEligibleAutomationItem(orderedItems, new Map())).toBeNull();
  });

  it("fails closed on malformed saved/sentinel policy authority", () => {
    const valid: HuntAutomationPolicyAuthoritySnapshot = {
      capture: { policyVersion: null, rowVersion: "0", enabled: false },
      potion: NO_SAVED_AUTO_POTION_POLICY,
      revive: NO_SAVED_AUTO_REVIVE_POLICY,
    };
    expect(assertHuntAutomationPolicyAuthoritySnapshot(valid)).toEqual(valid);

    expect(() => assertHuntAutomationPolicyAuthoritySnapshot({
      ...valid,
      potion: { ...NO_SAVED_AUTO_POTION_POLICY, thresholdPercent: 50 },
    })).toThrow(/no-saved Auto-Potion/i);
    expect(() => assertHuntAutomationPolicyAuthoritySnapshot({
      ...valid,
      revive: { ...NO_SAVED_AUTO_REVIVE_POLICY, rowVersion: "1" },
    })).toThrow(/no-saved Auto-Revive/i);
    expect(() => assertHuntAutomationPolicyAuthoritySnapshot({
      ...valid,
      capture: { policyVersion: "policy:capture", rowVersion: "0", enabled: true },
    })).toThrow(/capture.*rowVersion/i);
  });
});
