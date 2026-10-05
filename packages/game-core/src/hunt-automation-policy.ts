export const AUTO_POTION_TRIGGER_PERCENTAGES = [90, 80, 70, 60, 50, 40, 30, 20, 10] as const;

const DECIMAL_RE = /^(0|[1-9][0-9]*)$/u;
const TRIGGER_SET = new Set<number>(AUTO_POTION_TRIGGER_PERCENTAGES);

export interface HuntAutomationPolicyIdentity {
  readonly policyVersion: string | null;
  readonly rowVersion: string;
  readonly enabled: boolean;
}

export interface HuntOrderedAutomationItem {
  readonly itemId: string;
  readonly autoUseEnabled: boolean;
  readonly minimumReserve: string;
}

export interface HuntAutoPotionPolicyAuthority extends HuntAutomationPolicyIdentity {
  readonly thresholdPercent: (typeof AUTO_POTION_TRIGGER_PERCENTAGES)[number] | null;
  readonly orderedItems: readonly HuntOrderedAutomationItem[];
}

export interface HuntAutoRevivePolicyAuthority extends HuntAutomationPolicyIdentity {
  readonly orderedItems: readonly HuntOrderedAutomationItem[];
}

export interface HuntAutomationPolicyAuthoritySnapshot {
  readonly capture: HuntAutomationPolicyIdentity;
  readonly potion: HuntAutoPotionPolicyAuthority;
  readonly revive: HuntAutoRevivePolicyAuthority;
}

export const NO_SAVED_AUTO_POTION_POLICY: HuntAutoPotionPolicyAuthority = Object.freeze({
  policyVersion: null,
  rowVersion: "0",
  enabled: false,
  thresholdPercent: null,
  orderedItems: Object.freeze([]),
});

export const NO_SAVED_AUTO_REVIVE_POLICY: HuntAutoRevivePolicyAuthority = Object.freeze({
  policyVersion: null,
  rowVersion: "0",
  enabled: false,
  orderedItems: Object.freeze([]),
});

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const accepted = new Set(keys);
  const unknown = Object.keys(value).find((key) => !accepted.has(key));
  if (unknown !== undefined) throw new Error(`${label} has unknown field ${unknown}`);
  const missing = keys.find((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (missing !== undefined) throw new Error(`${label} is missing ${missing}`);
}

function rowVersion(value: unknown, label: string): string {
  if (typeof value !== "string" || !DECIMAL_RE.test(value)) {
    throw new Error(`${label} rowVersion must be canonical non-negative decimal text`);
  }
  return value;
}

function policyVersion(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new Error(`${label} policyVersion must be null or a bounded non-empty string`);
  }
  return value.normalize("NFC");
}

function identity(value: unknown, label: string): HuntAutomationPolicyIdentity {
  const source = record(value, label);
  exactKeys(source, ["policyVersion", "rowVersion", "enabled"], label);
  const version = policyVersion(source.policyVersion, label);
  const row = rowVersion(source.rowVersion, label);
  if (typeof source.enabled !== "boolean") throw new Error(`${label} enabled must be boolean`);
  if (version === null) {
    if (row !== "0" || source.enabled !== false) {
      throw new Error(`no-saved ${label} requires policyVersion=null, rowVersion=0 and enabled=false`);
    }
  } else if (row === "0") {
    throw new Error(`${label} saved policy rowVersion must be greater than zero`);
  }
  return { policyVersion: version, rowVersion: row, enabled: source.enabled };
}

function orderedItems(value: unknown, label: string): readonly HuntOrderedAutomationItem[] {
  if (!Array.isArray(value) || value.length > 64) {
    throw new Error(`${label} must be an array with at most 64 entries`);
  }
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const source = record(entry, `${label}[${index}]`);
    exactKeys(source, ["itemId", "autoUseEnabled", "minimumReserve"], `${label}[${index}]`);
    if (typeof source.itemId !== "string" || source.itemId.length === 0 || source.itemId.length > 512) {
      throw new Error(`${label}[${index}].itemId must be a bounded non-empty string`);
    }
    const itemId = source.itemId.normalize("NFC");
    if (seen.has(itemId)) throw new Error(`${label} contains duplicate item ${itemId}`);
    seen.add(itemId);
    if (typeof source.autoUseEnabled !== "boolean") {
      throw new Error(`${label}[${index}].autoUseEnabled must be boolean`);
    }
    const minimumReserve = rowVersion(source.minimumReserve, `${label}[${index}] minimumReserve`);
    return { itemId, autoUseEnabled: source.autoUseEnabled, minimumReserve };
  });
}

function potionPolicy(value: unknown): HuntAutoPotionPolicyAuthority {
  const source = record(value, "Auto-Potion authority");
  exactKeys(
    source,
    ["policyVersion", "rowVersion", "enabled", "thresholdPercent", "orderedItems"],
    "Auto-Potion authority",
  );
  const base = identity(
    { policyVersion: source.policyVersion, rowVersion: source.rowVersion, enabled: source.enabled },
    "Auto-Potion authority",
  );
  const items = orderedItems(source.orderedItems, "Auto-Potion orderedItems");
  if (base.policyVersion === null) {
    if (source.thresholdPercent !== null || items.length !== 0) {
      throw new Error("no-saved Auto-Potion authority requires thresholdPercent=null and orderedItems=[]");
    }
    return NO_SAVED_AUTO_POTION_POLICY;
  }
  if (typeof source.thresholdPercent !== "number" || !TRIGGER_SET.has(source.thresholdPercent)) {
    throw new Error("saved Auto-Potion thresholdPercent must be one of 90..10 by tens");
  }
  return {
    ...base,
    thresholdPercent: source.thresholdPercent as HuntAutoPotionPolicyAuthority["thresholdPercent"],
    orderedItems: items,
  };
}

function revivePolicy(value: unknown): HuntAutoRevivePolicyAuthority {
  const source = record(value, "Auto-Revive authority");
  exactKeys(source, ["policyVersion", "rowVersion", "enabled", "orderedItems"], "Auto-Revive authority");
  const base = identity(
    { policyVersion: source.policyVersion, rowVersion: source.rowVersion, enabled: source.enabled },
    "Auto-Revive authority",
  );
  const items = orderedItems(source.orderedItems, "Auto-Revive orderedItems");
  if (base.policyVersion === null) {
    if (items.length !== 0) throw new Error("no-saved Auto-Revive authority requires orderedItems=[]");
    return NO_SAVED_AUTO_REVIVE_POLICY;
  }
  return { ...base, orderedItems: items };
}

export function assertHuntAutomationPolicyAuthoritySnapshot(
  value: unknown,
): HuntAutomationPolicyAuthoritySnapshot {
  const source = record(value, "Hunt automation policy authority");
  exactKeys(source, ["capture", "potion", "revive"], "Hunt automation policy authority");
  return {
    capture: identity(source.capture, "Capture authority"),
    potion: potionPolicy(source.potion),
    revive: revivePolicy(source.revive),
  };
}

export function selectEligibleAutomationItem(
  items: readonly HuntOrderedAutomationItem[],
  inventoryQuantityByItemId: ReadonlyMap<string, bigint>,
): string | null {
  const normalized = orderedItems(items, "automation orderedItems");
  for (const item of normalized) {
    if (!item.autoUseEnabled) continue;
    const quantity = inventoryQuantityByItemId.get(item.itemId) ?? 0n;
    if (quantity < 0n) throw new Error(`Inventory quantity is negative for ${item.itemId}`);
    if (quantity > BigInt(item.minimumReserve)) return item.itemId;
  }
  return null;
}

export function isAutoPotionEligible(input: {
  readonly currentHp: number;
  readonly maxHp: number;
  readonly thresholdPercent: (typeof AUTO_POTION_TRIGGER_PERCENTAGES)[number];
}): boolean {
  if (!Number.isSafeInteger(input.maxHp) || input.maxHp <= 0) throw new Error("maxHp must be a positive safe integer");
  if (!Number.isSafeInteger(input.currentHp) || input.currentHp < 0 || input.currentHp > input.maxHp) {
    throw new Error("currentHp must be a safe integer within 0..maxHp");
  }
  if (!TRIGGER_SET.has(input.thresholdPercent)) throw new Error("thresholdPercent is not an accepted Auto-Potion trigger");
  if (input.currentHp === 0 || input.currentHp === input.maxHp) return false;
  return input.currentHp * 100 <= input.maxHp * input.thresholdPercent;
}
