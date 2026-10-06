import { useCallback, useEffect, useRef, useState } from "react";
import { PREALPHA_ITEM_IDS } from "@pokenexus/game-data/runtime";
import { EmptyState, ErrorState, LoadingState } from "./common-states";
import { HuntApi, HuntApiError, type InventoryPage as InventoryApiPage } from "./hunt-api";
import "./inventory-page.css";

const MAX_INVENTORY_PAGES = 10;

type InventoryEntry = InventoryApiPage["entries"][number];

export interface InventorySnapshot {
  readonly rowVersion: string;
  readonly entries: readonly InventoryEntry[];
  readonly nextCursor: string | null;
  readonly pagesLoaded: number;
}

export type InventoryPageState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "ready";
      readonly snapshot: InventorySnapshot;
      readonly refreshPending: boolean;
      readonly refreshError: string | null;
      readonly morePending: boolean;
      readonly moreError: string | null;
      readonly notice: string | null;
    };

class InventoryPaginationRestartError extends Error {
  constructor() {
    super("Inventory root version changed during pagination");
    this.name = "InventoryPaginationRestartError";
  }
}

export function inventoryFailureKind(error: unknown): "restart_pagination" | "session_lost" | "failure" {
  if (error instanceof HuntApiError && error.status === 409 && error.code === "pagination_stale") {
    return "restart_pagination";
  }
  if (error instanceof InventoryPaginationRestartError) return "restart_pagination";
  if (error instanceof HuntApiError && error.status === 401) return "session_lost";
  return "failure";
}

export function inventoryErrorText(error: unknown): string {
  if (error instanceof HuntApiError) {
    if (error.status === 404) return "No authoritative Inventory is available for this Player.";
    if (error.status === 503 && error.code === "authority_unavailable") {
      return "Inventory authority is temporarily unavailable. Retry the authoritative read.";
    }
    return `Inventory read failed with HTTP ${error.status} (${error.code}).`;
  }
  return error instanceof Error ? error.message : "Unknown Inventory read failure.";
}

export function inventoryPresentation(itemId: string): {
  readonly name: string | null;
  readonly category: string;
} {
  if (itemId === PREALPHA_ITEM_IDS.standardPokeBall) {
    return { name: "Poké Ball", category: "Capture supply" };
  }
  if (itemId === PREALPHA_ITEM_IDS.basicPotion) {
    return { name: "Basic Potion", category: "Recovery supply" };
  }
  if (itemId === PREALPHA_ITEM_IDS.revive25) {
    return { name: "Revive", category: "Recovery supply" };
  }
  return { name: null, category: "Canonical item" };
}

export function snapshotFromInventoryPage(page: InventoryApiPage): InventorySnapshot {
  return {
    rowVersion: page.rowVersion,
    entries: page.entries,
    nextCursor: page.nextCursor,
    pagesLoaded: 1,
  };
}

export function appendInventoryPage(
  current: InventorySnapshot,
  next: InventoryApiPage,
  requestedCursor: string,
): InventorySnapshot {
  if (next.rowVersion !== current.rowVersion) throw new InventoryPaginationRestartError();
  if (next.nextCursor === requestedCursor) throw new Error("Inventory server repeated the pagination cursor");

  const itemIds = new Set(current.entries.map(({ itemId }) => itemId));
  for (const entry of next.entries) {
    if (itemIds.has(entry.itemId)) throw new Error("Inventory server repeated an item across pages");
    itemIds.add(entry.itemId);
  }
  return {
    rowVersion: current.rowVersion,
    entries: [...current.entries, ...next.entries],
    nextCursor: next.nextCursor,
    pagesLoaded: current.pagesLoaded + 1,
  };
}

export function markInventoryRefresh(
  state: InventoryPageState,
  notice: string | null,
): InventoryPageState {
  if (state.status !== "ready") return { status: "loading" };
  return {
    ...state,
    refreshPending: true,
    refreshError: null,
    morePending: false,
    moreError: null,
    notice,
  };
}

function wasAborted(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

interface MutableRef<T> {
  current: T;
}

export function abortInventoryContinuation(
  controller: MutableRef<AbortController | null>,
  busy: MutableRef<boolean>,
): void {
  controller.current?.abort();
  controller.current = null;
  busy.current = false;
}

export function bindInventoryRefreshEvents(input: {
  readonly onlineTarget: EventTarget;
  readonly visibilityTarget: EventTarget;
  readonly visibilityState: () => string;
  readonly refresh: (notice: string) => void;
}): () => void {
  const handleOnline = () => input.refresh("Connection restored. Refreshing authoritative Inventory.");
  const handleVisibility = () => {
    if (input.visibilityState() === "visible") {
      input.refresh("Inventory became visible again. Refreshing authoritative quantities.");
    }
  };
  input.onlineTarget.addEventListener("online", handleOnline);
  input.visibilityTarget.addEventListener("visibilitychange", handleVisibility);
  return () => {
    input.onlineTarget.removeEventListener("online", handleOnline);
    input.visibilityTarget.removeEventListener("visibilitychange", handleVisibility);
  };
}

function InventoryPageControls({ state, onLoadMore }: {
  readonly state: Extract<InventoryPageState, { status: "ready" }>;
  readonly onLoadMore: () => void;
}) {
  const hasMore = state.snapshot.nextCursor !== null;
  const atLimit = state.snapshot.pagesLoaded >= MAX_INVENTORY_PAGES && hasMore;
  const [wasVisible, setWasVisible] = useState(hasMore || state.moreError !== null);

  useEffect(() => {
    if (hasMore || state.moreError !== null) setWasVisible(true);
  }, [hasMore, state.moreError]);

  if (!wasVisible && !hasMore && state.moreError === null) return null;
  const blocked = state.morePending || !hasMore || atLimit || state.refreshPending;
  return (
    <div className="inventory-controls">
      {state.moreError ? <p className="inventory-error" role="alert">{state.moreError}</p> : null}
      {atLimit ? (
        <p className="inventory-note" role="status">
          Client pagination safety limit reached after {MAX_INVENTORY_PAGES} pages. Refresh to reconcile current quantities.
        </p>
      ) : null}
      <button
        className="button button--secondary"
        type="button"
        aria-disabled={blocked}
        onClick={() => { if (!blocked) onLoadMore(); }}
      >
        {state.morePending ? "Loading more…" : atLimit ? "Display limit reached" : !hasMore ? "All items loaded" : state.moreError ? "Retry this page" : "Load more"}
      </button>
    </div>
  );
}

export function InventoryView({ state, onRefresh, onLoadMore, onNavigate }: {
  readonly state: InventoryPageState;
  readonly onRefresh: () => void;
  readonly onLoadMore: () => void;
  readonly onNavigate: (href: string) => void;
}) {
  if (state.status === "loading") return <LoadingState label="Loading Inventory" />;
  if (state.status === "error") {
    return <ErrorState title="Inventory unavailable" message={state.message} onRetry={onRefresh} />;
  }

  return (
    <section className="inventory-surface" aria-labelledby="inventory-list-title">
      <div className="inventory-toolbar">
        <div>
          <h2 id="inventory-list-title">Owned items</h2>
          <p>Quantities come from the current authoritative Inventory snapshot.</p>
        </div>
        <button
          className="button button--secondary"
          type="button"
          aria-disabled={state.refreshPending}
          onClick={() => { if (!state.refreshPending) onRefresh(); }}
        >
          {state.refreshPending ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {state.notice ? <p className="inventory-notice" role="status">{state.notice}</p> : null}
      {state.refreshPending ? (
        <p className="inventory-note" role="status">Refreshing Inventory; previously read quantities remain visible until the authoritative response arrives.</p>
      ) : null}
      {state.refreshError ? (
        <p className="inventory-error" role="alert">Refresh failed; displayed quantities may be stale. {state.refreshError}</p>
      ) : null}

      {state.snapshot.entries.length === 0 ? (
        <EmptyState title="Inventory empty" message="No owned item quantities are currently recorded." />
      ) : (
        <ul className="inventory-grid" aria-label="Owned items">
          {state.snapshot.entries.map((entry) => {
            const presentation = inventoryPresentation(entry.itemId);
            return (
              <li className="inventory-card" key={entry.itemId}>
                <div className="inventory-card__heading">
                  <div>
                    <strong>{presentation.name ?? entry.itemId}</strong>
                    <span>{presentation.category}</span>
                  </div>
                  <data className="inventory-quantity" value={entry.quantity} aria-label={`Quantity ${entry.quantity}`}>×{entry.quantity}</data>
                </div>
                {presentation.name ? <code className="inventory-item-id">{entry.itemId}</code> : null}
              </li>
            );
          })}
        </ul>
      )}

      <InventoryPageControls state={state} onLoadMore={onLoadMore} />

      <div className="inventory-boundary panel">
        <h2>Management boundary</h2>
        <p>This page can only read Inventory. It cannot consume, grant or use items. Capture, Potion and Revive automatic-use permissions are managed separately in Hunt settings.</p>
        <button className="button button--secondary" type="button" onClick={() => onNavigate("/settings/hunt")}>Open Hunt settings</button>
      </div>
    </section>
  );
}

export function InventoryPage({ api, onSessionLost, onNavigate }: {
  readonly api: HuntApi;
  readonly onSessionLost: () => void;
  readonly onNavigate: (href: string) => void;
}) {
  const [state, setState] = useState<InventoryPageState>({ status: "loading" });
  const [revision, setRevision] = useState(0);
  const refreshNotice = useRef<string | null>(null);
  const sessionHandler = useRef(onSessionLost);
  const moreController = useRef<AbortController | null>(null);
  const moreBusy = useRef(false);
  sessionHandler.current = onSessionLost;

  const refresh = useCallback((notice: string | null = null) => {
    abortInventoryContinuation(moreController, moreBusy);
    refreshNotice.current = notice;
    setState((current) => markInventoryRefresh(current, notice));
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => markInventoryRefresh(current, refreshNotice.current));
    void api.inventoryPage(undefined, controller.signal).then((page) => {
      if (controller.signal.aborted) return;
      const notice = refreshNotice.current;
      refreshNotice.current = null;
      setState({
        status: "ready",
        snapshot: snapshotFromInventoryPage(page),
        refreshPending: false,
        refreshError: null,
        morePending: false,
        moreError: null,
        notice,
      });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || wasAborted(error)) return;
      if (inventoryFailureKind(error) === "session_lost") {
        sessionHandler.current();
        return;
      }
      const message = inventoryErrorText(error);
      setState((current) => current.status === "ready"
        ? { ...current, refreshPending: false, refreshError: message }
        : { status: "error", message });
    });
    return () => controller.abort();
  }, [api, revision]);

  useEffect(() => {
    return bindInventoryRefreshEvents({
      onlineTarget: window,
      visibilityTarget: document,
      visibilityState: () => document.visibilityState,
      refresh,
    });
  }, [refresh]);

  useEffect(() => () => moreController.current?.abort(), []);

  const loadMore = useCallback(async () => {
    if (state.status !== "ready" || state.refreshPending || state.morePending || moreBusy.current) return;
    if (state.snapshot.nextCursor === null || state.snapshot.pagesLoaded >= MAX_INVENTORY_PAGES) return;

    const requestedCursor = state.snapshot.nextCursor;
    const controller = new AbortController();
    moreController.current?.abort();
    moreController.current = controller;
    moreBusy.current = true;
    setState((current) => current.status === "ready"
      ? { ...current, morePending: true, moreError: null }
      : current);

    try {
      const page = await api.inventoryPage(requestedCursor, controller.signal);
      if (controller.signal.aborted) return;
      const merged = appendInventoryPage(state.snapshot, page, requestedCursor);
      setState((current) => current.status === "ready" && current.snapshot.rowVersion === state.snapshot.rowVersion
        ? { ...current, snapshot: merged, morePending: false, moreError: null }
        : current);
    } catch (error: unknown) {
      if (controller.signal.aborted || wasAborted(error)) return;
      const kind = inventoryFailureKind(error);
      if (kind === "session_lost") {
        sessionHandler.current();
      } else if (kind === "restart_pagination") {
        refresh("Inventory changed while paging. Restarting from the authoritative first page without mixing snapshots.");
      } else {
        setState((current) => current.status === "ready"
          ? { ...current, morePending: false, moreError: inventoryErrorText(error) }
          : current);
      }
    } finally {
      if (moreController.current === controller) moreController.current = null;
      moreBusy.current = false;
    }
  }, [api, refresh, state]);

  return <InventoryView state={state} onRefresh={() => refresh(null)} onLoadMore={() => void loadMore()} onNavigate={onNavigate} />;
}
