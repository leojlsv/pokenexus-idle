import { useCallback, useEffect, useMemo, useState } from "react";
import { PREALPHA_ITEM_IDS } from "@pokenexus/game-data/runtime";
import { ErrorState, LoadingState } from "./common-states";
import {
  HuntApi,
  HuntApiError,
  type AutoCapturePolicy,
  type AutoPotionPolicy,
  type AutoRevivePolicy,
  type CaptureBallCatalog,
  type CapturePolicyRule,
  type OrderedAutomationItem,
} from "./hunt-api";
import { browserHuntCommandStore, type HuntCommandFamily } from "./hunt-command-store";
import type { HuntCommandStoreState } from "./hunt-command-store";

const POTION_THRESHOLDS = [90, 80, 70, 60, 50, 40, 30, 20, 10] as const;

export function prealphaAutomationItemCandidates(
  family: "potion" | "revive",
  inventoryEntries: readonly { readonly itemId: string; readonly quantity: string }[],
): readonly string[] {
  const acceptedItemId = family === "potion"
    ? PREALPHA_ITEM_IDS.basicPotion
    : PREALPHA_ITEM_IDS.revive25;
  return inventoryEntries
    .filter(({ itemId, quantity }) => itemId === acceptedItemId && BigInt(quantity) > 0n)
    .map(({ itemId }) => itemId);
}

export function normalizeAutomationItemsForOwnedInventory(
  items: readonly OrderedAutomationItem[],
  inventoryEntries: readonly { readonly itemId: string; readonly quantity: string }[],
): readonly OrderedAutomationItem[] {
  const quantities = new Map(inventoryEntries.map(({ itemId, quantity }) => [itemId, BigInt(quantity)] as const));
  return items.map((entry) => {
    if (!/^\d+$/u.test(entry.minimumReserve)) {
      throw new Error("Minimum reserve must be a non-negative integer");
    }
    const minimumReserve = BigInt(entry.minimumReserve);
    const ownedQuantity = quantities.get(entry.itemId) ?? 0n;
    if (minimumReserve > ownedQuantity) {
      throw new Error(`Minimum reserve for ${entry.itemId} cannot exceed owned quantity ${ownedQuantity}`);
    }
    return { ...entry, minimumReserve: minimumReserve.toString() };
  });
}

export function createAutoPotionPolicyIntent(
  expectedRowVersion: string,
  enabled: boolean,
  thresholdPercent: NonNullable<AutoPotionPolicy["thresholdPercent"]>,
  orderedItems: readonly OrderedAutomationItem[],
) {
  if (enabled && !orderedItems.some(({ autoUseEnabled }) => autoUseEnabled)) {
    throw new Error("Enabled Auto-Potion requires at least one allowed item");
  }
  return { expectedRowVersion, enabled, thresholdPercent, orderedItems };
}

interface SettingsSnapshot {
  readonly playerId: string;
  readonly capture: AutoCapturePolicy;
  readonly potion: AutoPotionPolicy;
  readonly revive: AutoRevivePolicy;
  readonly balls: CaptureBallCatalog;
  readonly inventoryEntries: readonly { readonly itemId: string; readonly quantity: string }[];
  readonly pending: HuntCommandStoreState;
}

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly snapshot: SettingsSnapshot };

type RuleDraft = {
  readonly id: string;
  readonly selectedItemId: string;
  readonly shiny: "any" | "true" | "false";
  readonly speciesIds: string;
  readonly zoneIds: string;
  readonly huntDefinitionIds: string;
  readonly catchRateMin: string;
  readonly catchRateMax: string;
};

function readableError(error: unknown): string {
  return error instanceof HuntApiError
    ? `HTTP ${error.status}: ${error.code}`
    : error instanceof Error ? error.message : "Unknown Hunt settings error";
}

export function isDefinitivePolicyRejection(error: unknown): error is HuntApiError {
  return error instanceof HuntApiError
    && error.status === 422
    && (error.code === "automation_policy_invalid" || error.code === "auto_capture_policy_invalid");
}

function splitIds(value: string): readonly string[] | undefined {
  const ids = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (ids.length > 64) throw new Error("A Capture rule can contain at most 64 IDs per condition");
  return ids.length ? [...new Set(ids)] : undefined;
}

function ruleDraft(rule: CapturePolicyRule): RuleDraft {
  return {
    id: crypto.randomUUID(),
    selectedItemId: rule.selectedItemId,
    shiny: rule.when.shiny === undefined ? "any" : rule.when.shiny ? "true" : "false",
    speciesIds: rule.when.speciesIds?.join(", ") ?? "",
    zoneIds: rule.when.zoneIds?.join(", ") ?? "",
    huntDefinitionIds: rule.when.huntDefinitionIds?.join(", ") ?? "",
    catchRateMin: rule.when.catchRateMin === undefined ? "" : String(rule.when.catchRateMin),
    catchRateMax: rule.when.catchRateMax === undefined ? "" : String(rule.when.catchRateMax),
  };
}

function ruleIntent(rule: RuleDraft): CapturePolicyRule {
  const when: {
    shiny?: boolean;
    speciesIds?: readonly string[];
    zoneIds?: readonly string[];
    huntDefinitionIds?: readonly string[];
    catchRateMin?: number;
    catchRateMax?: number;
  } = {};
  if (rule.shiny !== "any") when.shiny = rule.shiny === "true";
  const speciesIds = splitIds(rule.speciesIds);
  const zoneIds = splitIds(rule.zoneIds);
  const huntDefinitionIds = splitIds(rule.huntDefinitionIds);
  if (speciesIds) when.speciesIds = speciesIds;
  if (zoneIds) when.zoneIds = zoneIds;
  if (huntDefinitionIds) when.huntDefinitionIds = huntDefinitionIds;
  const parseRate = (raw: string, label: string): number | undefined => {
    if (!raw) return undefined;
    if (!/^\d+$/u.test(raw)) throw new Error(`${label} must be an integer from 3 to 255`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 3 || value > 255) throw new Error(`${label} must be from 3 to 255`);
    return value;
  };
  when.catchRateMin = parseRate(rule.catchRateMin, "Minimum catch rate");
  when.catchRateMax = parseRate(rule.catchRateMax, "Maximum catch rate");
  if (when.catchRateMin !== undefined && when.catchRateMax !== undefined && when.catchRateMin > when.catchRateMax) {
    throw new Error("Minimum catch rate cannot exceed maximum catch rate");
  }
  return { when, selectedItemId: rule.selectedItemId };
}

function move<T>(values: readonly T[], index: number, delta: -1 | 1): readonly T[] {
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= values.length) return values;
  const next = [...values];
  [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
  return next;
}

function itemDraft(base: readonly OrderedAutomationItem[], candidates: readonly string[]): readonly OrderedAutomationItem[] {
  const existing = new Set(base.map(({ itemId }) => itemId));
  return [
    ...base.map((entry) => ({ ...entry })),
    ...candidates.filter((itemId) => !existing.has(itemId)).map((itemId) => ({
      itemId,
      autoUseEnabled: false,
      minimumReserve: "0",
    })),
  ].slice(0, 64);
}

function OrderedItemsEditor({ items, onChange, candidateLabel, inventoryEntries }: {
  readonly items: readonly OrderedAutomationItem[];
  readonly onChange: (items: readonly OrderedAutomationItem[]) => void;
  readonly candidateLabel: string;
  readonly inventoryEntries: readonly { readonly itemId: string; readonly quantity: string }[];
}) {
  const quantities = new Map(inventoryEntries.map(({ itemId, quantity }) => [itemId, quantity] as const));
  return (
    <div className="policy-items">
      <p className="hunt-note">{candidateLabel}</p>
      {items.length === 0 ? <p>No candidate items are currently visible.</p> : (
        <ol className="policy-items__list">
          {items.map((item, index) => {
            const ownedQuantity = quantities.get(item.itemId) ?? "0";
            const reserveExceedsOwned = /^\d+$/u.test(item.minimumReserve)
              && BigInt(item.minimumReserve) > BigInt(ownedQuantity);
            return <li key={item.itemId} className="policy-item">
              <strong>{item.itemId}</strong>
              <label>
                <input
                  type="checkbox"
                  checked={item.autoUseEnabled}
                  onChange={(event) => onChange(items.map((entry, position) => position === index
                    ? { ...entry, autoUseEnabled: event.target.checked }
                    : entry))}
                />
                Allow automatic use
              </label>
              <label>
                Minimum reserve
                <input
                  type="number"
                  min="0"
                  max={ownedQuantity}
                  step="1"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  aria-invalid={reserveExceedsOwned || undefined}
                  value={item.minimumReserve}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (/^\d*$/u.test(value) && (value === "" || BigInt(value) <= BigInt(ownedQuantity))) {
                      onChange(items.map((entry, position) => position === index
                        ? { ...entry, minimumReserve: value }
                        : entry));
                    }
                  }}
                />
                <small>Owned: {ownedQuantity}. Maximum reserve: {ownedQuantity}.</small>
                {reserveExceedsOwned
                  ? <small className="hunt-error">Saved reserve exceeds current ownership; lower it before saving.</small>
                  : null}
              </label>
              <div className="policy-item__order" aria-label={`Priority for ${item.itemId}`}>
                <button className="button button--secondary" type="button" disabled={index === 0}
                  onClick={() => onChange(move(items, index, -1))}>Up</button>
                <button className="button button--secondary" type="button" disabled={index === items.length - 1}
                  onClick={() => onChange(move(items, index, 1))}>Down</button>
              </div>
            </li>
          })}
        </ol>
      )}
    </div>
  );
}

async function loadAllInventory(
  api: HuntApi,
  signal: AbortSignal,
): Promise<readonly { readonly itemId: string; readonly quantity: string }[]> {
  const entries = new Map<string, string>();
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const result = await api.inventoryPage(cursor, signal);
    for (const entry of result.entries) {
      if (entries.has(entry.itemId)) throw new Error("Inventory pagination returned a duplicate item identity");
      entries.set(entry.itemId, entry.quantity);
    }
    if (result.nextCursor === null) {
      return [...entries].map(([itemId, quantity]) => ({ itemId, quantity }));
    }
    cursor = result.nextCursor;
  }
  throw new Error("Inventory pagination exceeded the client safety bound");
}

export function HuntSettingsPage({ api, csrfToken, onSessionLost }: {
  readonly api: HuntApi;
  readonly csrfToken: string;
  readonly onSessionLost: () => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void Promise.all([
      api.playerIdentity(controller.signal),
      api.autoCapturePolicy(controller.signal),
      api.autoPotionPolicy(controller.signal),
      api.autoRevivePolicy(controller.signal),
      api.captureBalls(controller.signal),
      loadAllInventory(api, controller.signal),
    ]).then(async ([playerId, capture, potion, revive, balls, inventoryEntries]) => {
      const pending = await browserHuntCommandStore().inspect(playerId);
      if (!controller.signal.aborted) setState({ status: "ready", snapshot: { playerId, capture, potion, revive, balls, inventoryEntries, pending } });
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      if (cause instanceof HuntApiError && cause.status === 401) onSessionLost();
      else setState({ status: "error", message: readableError(cause) });
    });
    return () => controller.abort();
  }, [api, onSessionLost, revision]);

  if (state.status === "loading") return <LoadingState label="Loading Hunt automation policies" />;
  if (state.status === "error") return <ErrorState title="Hunt settings unavailable" message={state.message} onRetry={load} />;

  const pendingKey = state.snapshot.pending.kind === "resume"
    ? `${state.snapshot.pending.family}:${state.snapshot.pending.key}`
    : state.snapshot.pending.kind;
  return <HuntPolicyEditors key={`${state.snapshot.capture.rowVersion}:${state.snapshot.potion.rowVersion}:${state.snapshot.revive.rowVersion}:${pendingKey}`}
    snapshot={state.snapshot} api={api} csrfToken={csrfToken}
    busy={busy} setBusy={setBusy} notice={notice} setNotice={setNotice} error={error} setError={setError}
    onSessionLost={onSessionLost} onCommitted={load} />;
}

function HuntPolicyEditors({ snapshot, api, csrfToken, busy, setBusy, notice, setNotice, error, setError, onSessionLost, onCommitted }: {
  readonly snapshot: SettingsSnapshot;
  readonly api: HuntApi;
  readonly csrfToken: string;
  readonly busy: boolean;
  readonly setBusy: (value: boolean) => void;
  readonly notice: string | null;
  readonly setNotice: (value: string | null) => void;
  readonly error: string | null;
  readonly setError: (value: string | null) => void;
  readonly onSessionLost: () => void;
  readonly onCommitted: () => void;
}) {
  const [captureEnabled, setCaptureEnabled] = useState(snapshot.capture.enabled);
  const [captureBalls, setCaptureBalls] = useState<readonly OrderedAutomationItem[]>(() => itemDraft(
    snapshot.capture.balls,
    snapshot.balls.balls.map(({ itemId }) => itemId),
  ));
  const [captureRules, setCaptureRules] = useState<readonly RuleDraft[]>(() => snapshot.capture.rules.map(ruleDraft));
  const [potionEnabled, setPotionEnabled] = useState(snapshot.potion.enabled);
  const [potionThreshold, setPotionThreshold] = useState<NonNullable<AutoPotionPolicy["thresholdPercent"]>>(snapshot.potion.thresholdPercent ?? 50);
  const [potionItems, setPotionItems] = useState<readonly OrderedAutomationItem[]>(() => itemDraft(
    snapshot.potion.orderedItems,
    prealphaAutomationItemCandidates("potion", snapshot.inventoryEntries),
  ));
  const [reviveEnabled, setReviveEnabled] = useState(snapshot.revive.enabled);
  const [reviveItems, setReviveItems] = useState<readonly OrderedAutomationItem[]>(() => itemDraft(
    snapshot.revive.orderedItems,
    prealphaAutomationItemCandidates("revive", snapshot.inventoryEntries),
  ));

  const potionInventoryHint = useMemo(() =>
    "Only the currently owned Basic Potion is offered as an Auto-Potion candidate in this Pre-alpha. The server remains authoritative on save.", []);
  const reviveInventoryHint = useMemo(() =>
    "Only the currently owned Revive-25 is offered as an Auto-Revive candidate in this Pre-alpha. The server remains authoritative on save.", []);

  const pendingPolicyFamily = snapshot.pending.kind === "resume"
    && (snapshot.pending.family === "capture_policy" || snapshot.pending.family === "potion_policy" || snapshot.pending.family === "revive_policy")
    ? snapshot.pending.family
    : null;

  const continueSavedPolicy = async () => {
    if (snapshot.pending.kind !== "resume" || !pendingPolicyFamily || busy) return;
    setBusy(true); setNotice(null); setError(null);
    try {
      const result = pendingPolicyFamily === "capture_policy"
        ? await api.replaceCapturePolicy(csrfToken, snapshot.pending.key, snapshot.pending.intent)
        : pendingPolicyFamily === "potion_policy"
          ? await api.replacePotionPolicy(csrfToken, snapshot.pending.key, snapshot.pending.intent)
          : await api.replaceRevivePolicy(csrfToken, snapshot.pending.key, snapshot.pending.intent);
      if (result.kind === "complete") {
        if (!(await browserHuntCommandStore().clear(snapshot.playerId, snapshot.pending.key))) {
          throw new Error("Completed policy command correlation could not be cleared");
        }
        setNotice("Saved policy command completed; reloading authoritative policy state.");
        onCommitted();
      } else {
        setNotice(`Saved policy command continued through ${result.logicalTimeMs} / ${result.targetLogicalTimeMs}.`);
      }
    } catch (cause) {
      if (cause instanceof HuntApiError && cause.status === 401) onSessionLost();
      else {
        if (isDefinitivePolicyRejection(cause)) {
          if (!(await browserHuntCommandStore().clear(snapshot.playerId, snapshot.pending.key))) {
            setError(`${readableError(cause)}. The terminal policy correlation could not be cleared locally.`);
            return;
          }
          onCommitted();
        }
        setError(readableError(cause));
      }
    } finally { setBusy(false); }
  };

  const reconcilePending = async () => {
    if (snapshot.pending.kind !== "resume" && snapshot.pending.kind !== "different_player") return;
    try {
      if (snapshot.pending.kind === "resume" && snapshot.pending.family === "capture_policy") await api.autoCapturePolicy();
      else if (snapshot.pending.kind === "resume" && snapshot.pending.family === "potion_policy") await api.autoPotionPolicy();
      else if (snapshot.pending.kind === "resume" && snapshot.pending.family === "revive_policy") await api.autoRevivePolicy();
      else await api.state();
      if (!window.confirm("Fresh authoritative state was read successfully. Discard the stored command correlation? This does not undo server-side work and can make exact replay impossible.")) return;
      if (!(await browserHuntCommandStore().discardAfterReconciliation(snapshot.playerId))) throw new Error("Stored command could not be cleared");
      setNotice("Stored command correlation discarded after explicit reconciliation.");
      onCommitted();
    } catch (cause) {
      if (cause instanceof HuntApiError && cause.status === 401) onSessionLost();
      else setError(readableError(cause));
    }
  };

  const run = async (family: HuntCommandFamily, intent: unknown, action: (key: string) => ReturnType<HuntApi["replaceCapturePolicy"]>) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    let frozenKey: string | null = null;
    try {
      const store = browserHuntCommandStore();
      const frozen = await store.begin(snapshot.playerId, family, intent);
      frozenKey = frozen.key;
      const result = await action(frozen.key);
      if (result.kind === "in_progress") {
        setNotice(`Server accepted the command through ${result.logicalTimeMs} / ${result.targetLogicalTimeMs}. The same saved command must be continued; no new intent was created.`);
        onCommitted();
        return;
      }
      if (!(await store.clear(snapshot.playerId, frozen.key))) {
        throw new Error("The server completed the command, but its local correlation key could not be cleared");
      }
      setNotice("Policy committed. Reloading authoritative policy state.");
      onCommitted();
    } catch (cause) {
      if (cause instanceof HuntApiError && cause.status === 401) onSessionLost();
      else {
        if (frozenKey && isDefinitivePolicyRejection(cause)) {
          if (!(await browserHuntCommandStore().clear(snapshot.playerId, frozenKey))) {
            setError(`${readableError(cause)}. The terminal policy correlation could not be cleared locally.`);
            onCommitted();
            return;
          }
        }
        setError(readableError(cause));
        onCommitted();
      }
    } finally {
      setBusy(false);
    }
  };

  const preserveKnownOrEnabled = (
    items: readonly OrderedAutomationItem[],
    known: readonly OrderedAutomationItem[],
  ): readonly OrderedAutomationItem[] => {
    const knownIds = new Set(known.map(({ itemId }) => itemId));
    return normalizeAutomationItemsForOwnedInventory(
      items.filter(({ itemId, autoUseEnabled }) => knownIds.has(itemId) || autoUseEnabled),
      snapshot.inventoryEntries,
    );
  };

  return (
    <div className="hunt-surface">
      {notice ? <p className="hunt-notice" role="status">{notice}</p> : null}
      {error ? <p className="hunt-error" role="alert">{error}</p> : null}
      {snapshot.pending.kind !== "none" ? (
        <div className="state-card state-card--error" role="status">
          <strong>Pending Hunt command</strong>
          <span>{snapshot.pending.kind === "resume"
            ? `${snapshot.pending.family.replaceAll("_", " ")} is still bound to ${snapshot.pending.key}.`
            : snapshot.pending.kind === "different_player"
              ? "The saved Hunt command belongs to another Player session."
              : "Hunt command correlation storage is unreadable."}</span>
          {pendingPolicyFamily ? <button className="button" type="button" disabled={busy} onClick={() => void continueSavedPolicy()}>Continue exact saved policy command</button> : null}
          {snapshot.pending.kind === "resume" && snapshot.pending.family === "sync"
            ? <span>Return to the active Hunt to finish automatic synchronization before editing policies.</span>
            : null}
          {((snapshot.pending.kind === "resume" && snapshot.pending.family !== "sync") || snapshot.pending.kind === "different_player")
            ? <button className="button button--secondary" type="button" disabled={busy} onClick={() => void reconcilePending()}>Reconcile and discard local correlation</button>
            : null}
        </div>
      ) : null}

      <section className="panel hunt-section" aria-labelledby="capture-policy-title">
        <h2 id="capture-policy-title">Automatic Capture</h2>
        <p>Current row version: {snapshot.capture.rowVersion}. Capture is management-only; there is no per-Encounter Ball prompt.</p>
        <label className="policy-toggle"><input type="checkbox" checked={captureEnabled} onChange={(event) => setCaptureEnabled(event.target.checked)} /> Enable automatic Capture</label>
        <OrderedItemsEditor items={captureBalls} onChange={setCaptureBalls}
          candidateLabel="Only server-authorized capture Balls are listed here. Reserve cannot exceed current ownership."
          inventoryEntries={snapshot.inventoryEntries} />
        <div className="policy-rules">
          <div className="policy-rules__heading">
            <h3>Rule order</h3>
            <button className="button button--secondary" type="button" disabled={captureRules.length >= 64} onClick={() => setCaptureRules((rules) => [...rules, {
              id: crypto.randomUUID(), selectedItemId: snapshot.balls.balls[0]?.itemId ?? "", shiny: "any",
              speciesIds: "", zoneIds: "", huntDefinitionIds: "", catchRateMin: "", catchRateMax: "",
            }])}>Add catch rule</button>
          </div>
          {captureRules.map((rule, index) => (
            <fieldset key={rule.id} className="policy-rule">
              <legend>Rule {index + 1}</legend>
              <label>Ball<select value={rule.selectedItemId} onChange={(event) => setCaptureRules((rules) => rules.map((entry) => entry.id === rule.id ? { ...entry, selectedItemId: event.target.value } : entry))}>
                <option value="">Select Ball</option>
                {snapshot.balls.balls.map(({ itemId }) => <option key={itemId} value={itemId}>{itemId}</option>)}
              </select></label>
              <label>Shiny<select value={rule.shiny} onChange={(event) => setCaptureRules((rules) => rules.map((entry) => entry.id === rule.id ? { ...entry, shiny: event.target.value as RuleDraft["shiny"] } : entry))}>
                <option value="any">Any</option><option value="true">Shiny only</option><option value="false">Not Shiny</option>
              </select></label>
              <label>Species IDs<input value={rule.speciesIds} placeholder="comma separated" onChange={(event) => setCaptureRules((rules) => rules.map((entry) => entry.id === rule.id ? { ...entry, speciesIds: event.target.value } : entry))} /></label>
              <label>Zone IDs<input value={rule.zoneIds} placeholder="comma separated" onChange={(event) => setCaptureRules((rules) => rules.map((entry) => entry.id === rule.id ? { ...entry, zoneIds: event.target.value } : entry))} /></label>
              <label>Hunt IDs<input value={rule.huntDefinitionIds} placeholder="comma separated" onChange={(event) => setCaptureRules((rules) => rules.map((entry) => entry.id === rule.id ? { ...entry, huntDefinitionIds: event.target.value } : entry))} /></label>
              <label>Catch rate min<input inputMode="numeric" value={rule.catchRateMin} onChange={(event) => setCaptureRules((rules) => rules.map((entry) => entry.id === rule.id ? { ...entry, catchRateMin: event.target.value } : entry))} /></label>
              <label>Catch rate max<input inputMode="numeric" value={rule.catchRateMax} onChange={(event) => setCaptureRules((rules) => rules.map((entry) => entry.id === rule.id ? { ...entry, catchRateMax: event.target.value } : entry))} /></label>
              <div className="policy-item__order">
                <button className="button button--secondary" type="button" disabled={index === 0} onClick={() => setCaptureRules(move(captureRules, index, -1))}>Up</button>
                <button className="button button--secondary" type="button" disabled={index === captureRules.length - 1} onClick={() => setCaptureRules(move(captureRules, index, 1))}>Down</button>
                <button className="button button--secondary" type="button" onClick={() => setCaptureRules((rules) => rules.filter(({ id }) => id !== rule.id))}>Remove</button>
              </div>
            </fieldset>
          ))}
        </div>
        <button className="button" type="button" disabled={busy || snapshot.pending.kind !== "none"} onClick={() => {
          try {
            const balls = normalizeAutomationItemsForOwnedInventory(captureBalls, snapshot.inventoryEntries);
            const rules = captureRules.map(ruleIntent);
            if (captureEnabled && (!balls.some(({ autoUseEnabled }) => autoUseEnabled) || rules.length === 0 || rules.some(({ selectedItemId }) => !selectedItemId))) {
              throw new Error("Enabled Capture requires an allowed Ball and at least one complete rule");
            }
            const intent = {
              expectedRowVersion: snapshot.capture.rowVersion,
              enabled: captureEnabled,
              ...(captureEnabled ? { lossWarningAcknowledgement: "auto_capture_irreversible_loss_v1" } : {}),
              balls,
              rules,
            };
            void run("capture_policy", intent, (key) => api.replaceCapturePolicy(csrfToken, key, intent));
          } catch (cause) { setError(readableError(cause)); }
        }}>{busy ? "Saving…" : "Save Capture policy"}</button>
      </section>

      <section className="panel hunt-section" aria-labelledby="potion-policy-title">
        <h2 id="potion-policy-title">Auto-Potion</h2>
        <p>Current row version: {snapshot.potion.rowVersion}. Trigger is evaluated against current HP percentage; Potion never revives.</p>
        <label className="policy-toggle"><input type="checkbox" checked={potionEnabled} onChange={(event) => setPotionEnabled(event.target.checked)} /> Enable Auto-Potion</label>
        <label>HP trigger<select value={potionThreshold} onChange={(event) => setPotionThreshold(Number(event.target.value) as NonNullable<AutoPotionPolicy["thresholdPercent"]>)}>
          {POTION_THRESHOLDS.map((threshold) => <option key={threshold} value={threshold}>{threshold}% or lower</option>)}
        </select></label>
        <OrderedItemsEditor items={potionItems} onChange={setPotionItems} candidateLabel={potionInventoryHint}
          inventoryEntries={snapshot.inventoryEntries} />
        <button className="button" type="button" disabled={busy || snapshot.pending.kind !== "none"} onClick={() => {
          try {
            const orderedItems = preserveKnownOrEnabled(potionItems, snapshot.potion.orderedItems);
            const intent = createAutoPotionPolicyIntent(snapshot.potion.rowVersion, potionEnabled, potionThreshold, orderedItems);
            void run("potion_policy", intent, (key) => api.replacePotionPolicy(csrfToken, key, intent));
          } catch (cause) { setError(readableError(cause)); }
        }}>{busy ? "Saving…" : "Save Potion policy"}</button>
      </section>

      <section className="panel hunt-section" aria-labelledby="revive-policy-title">
        <h2 id="revive-policy-title">Auto-Revive</h2>
        <p>Current row version: {snapshot.revive.rowVersion}. Revive applies only under the authoritative Hunt policy and cannot rewrite an already sealed Battle result.</p>
        <label className="policy-toggle"><input type="checkbox" checked={reviveEnabled} onChange={(event) => setReviveEnabled(event.target.checked)} /> Enable Auto-Revive</label>
        <OrderedItemsEditor items={reviveItems} onChange={setReviveItems} candidateLabel={reviveInventoryHint}
          inventoryEntries={snapshot.inventoryEntries} />
        <button className="button" type="button" disabled={busy || snapshot.pending.kind !== "none"} onClick={() => {
          try {
            const orderedItems = preserveKnownOrEnabled(reviveItems, snapshot.revive.orderedItems);
            if (reviveEnabled && !orderedItems.some(({ autoUseEnabled }) => autoUseEnabled)) throw new Error("Enabled Auto-Revive requires at least one allowed item");
            const intent = { expectedRowVersion: snapshot.revive.rowVersion, enabled: reviveEnabled, orderedItems };
            void run("revive_policy", intent, (key) => api.replaceRevivePolicy(csrfToken, key, intent));
          } catch (cause) { setError(readableError(cause)); }
        }}>{busy ? "Saving…" : "Save Revive policy"}</button>
      </section>
    </div>
  );
}
