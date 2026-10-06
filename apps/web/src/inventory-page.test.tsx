import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PREALPHA_ITEM_IDS } from "@pokenexus/game-data/runtime";
import { HuntApiError } from "./hunt-api";
import {
  InventoryView,
  abortInventoryContinuation,
  appendInventoryPage,
  bindInventoryRefreshEvents,
  inventoryErrorText,
  inventoryFailureKind,
  inventoryPresentation,
  markInventoryRefresh,
  snapshotFromInventoryPage,
  type InventoryPageState,
} from "./inventory-page";

function readyState(overrides: Partial<Extract<InventoryPageState, { status: "ready" }>> = {}): Extract<InventoryPageState, { status: "ready" }> {
  return {
    status: "ready",
    snapshot: {
      rowVersion: "7",
      entries: [{ itemId: PREALPHA_ITEM_IDS.standardPokeBall, quantity: "50" }],
      nextCursor: null,
      pagesLoaded: 1,
    },
    refreshPending: false,
    refreshError: null,
    morePending: false,
    moreError: null,
    notice: null,
    ...overrides,
  };
}

describe("Inventory management page", () => {
  it("appends only pages from the same authoritative root version", () => {
    const first = snapshotFromInventoryPage({
      rowVersion: "5",
      entries: [{ itemId: "item:a", quantity: "1" }],
      nextCursor: "cursor-a",
    });
    expect(appendInventoryPage(first, {
      rowVersion: "5",
      entries: [{ itemId: "item:b", quantity: "2" }],
      nextCursor: null,
    }, "cursor-a")).toEqual({
      rowVersion: "5",
      entries: [
        { itemId: "item:a", quantity: "1" },
        { itemId: "item:b", quantity: "2" },
      ],
      nextCursor: null,
      pagesLoaded: 2,
    });

    expect(() => appendInventoryPage(first, {
      rowVersion: "6",
      entries: [{ itemId: "item:b", quantity: "2" }],
      nextCursor: null,
    }, "cursor-a")).toThrow(/root version changed/);
  });

  it("fails closed on duplicate items or a repeated continuation cursor", () => {
    const first = snapshotFromInventoryPage({
      rowVersion: "5",
      entries: [{ itemId: "item:a", quantity: "1" }],
      nextCursor: "cursor-a",
    });
    expect(() => appendInventoryPage(first, {
      rowVersion: "5",
      entries: [{ itemId: "item:a", quantity: "9" }],
      nextCursor: null,
    }, "cursor-a")).toThrow(/repeated an item/);
    expect(() => appendInventoryPage(first, {
      rowVersion: "5",
      entries: [{ itemId: "item:b", quantity: "2" }],
      nextCursor: "cursor-a",
    }, "cursor-a")).toThrow(/repeated the pagination cursor/);
  });

  it("classifies stale paging and session loss without inventing mutation recovery", () => {
    expect(inventoryFailureKind(new HuntApiError(409, "pagination_stale"))).toBe("restart_pagination");
    expect(inventoryFailureKind(new HuntApiError(401, "unauthorized"))).toBe("session_lost");
    expect(inventoryFailureKind(new HuntApiError(500, "server_error"))).toBe("failure");
  });

  it("keeps the previous authoritative snapshot visible while a refresh is pending", () => {
    const previous = readyState({ morePending: true, moreError: "old page failure" });
    expect(markInventoryRefresh(previous, "Refreshing after reconnect.")).toEqual({
      ...previous,
      refreshPending: true,
      refreshError: null,
      morePending: false,
      moreError: null,
      notice: "Refreshing after reconnect.",
    });
    expect(markInventoryRefresh({ status: "error", message: "old" }, null)).toEqual({ status: "loading" });
  });

  it("routes reconnect/visibility refresh through the same continuation-abort boundary", () => {
    const onlineTarget = new EventTarget();
    const visibilityTarget = new EventTarget();
    let visibility = "hidden";
    const controllerRef = { current: new AbortController() as AbortController | null };
    const busyRef = { current: true };
    const firstController = controllerRef.current!;
    const notices: string[] = [];
    const refresh = (notice: string) => {
      abortInventoryContinuation(controllerRef, busyRef);
      notices.push(notice);
    };
    const unbind = bindInventoryRefreshEvents({
      onlineTarget,
      visibilityTarget,
      visibilityState: () => visibility,
      refresh,
    });

    onlineTarget.dispatchEvent(new Event("online"));
    expect(firstController.signal.aborted).toBe(true);
    expect(controllerRef.current).toBeNull();
    expect(busyRef.current).toBe(false);
    expect(notices).toEqual(["Connection restored. Refreshing authoritative Inventory."]);

    const hiddenController = new AbortController();
    controllerRef.current = hiddenController;
    busyRef.current = true;
    visibilityTarget.dispatchEvent(new Event("visibilitychange"));
    expect(hiddenController.signal.aborted).toBe(false);
    expect(notices).toHaveLength(1);

    visibility = "visible";
    visibilityTarget.dispatchEvent(new Event("visibilitychange"));
    expect(hiddenController.signal.aborted).toBe(true);
    expect(notices.at(-1)).toBe("Inventory became visible again. Refreshing authoritative quantities.");

    unbind();
    const afterUnbind = new AbortController();
    controllerRef.current = afterUnbind;
    busyRef.current = true;
    onlineTarget.dispatchEvent(new Event("online"));
    expect(afterUnbind.signal.aborted).toBe(false);
  });

  it("uses only accepted local labels for authored pre-alpha items and falls back to canonical identity", () => {
    expect(inventoryPresentation(PREALPHA_ITEM_IDS.standardPokeBall)).toEqual({ name: "Poké Ball", category: "Capture supply" });
    expect(inventoryPresentation(PREALPHA_ITEM_IDS.basicPotion)).toEqual({ name: "Basic Potion", category: "Recovery supply" });
    expect(inventoryPresentation("candidate:item:unknown:abc")).toEqual({ name: null, category: "Canonical item" });
  });

  it("renders explicit loading, error, empty, refresh-stale and read-only management states", () => {
    const render = (state: InventoryPageState) => renderToStaticMarkup(
      <InventoryView state={state} onRefresh={() => undefined} onLoadMore={() => undefined} onNavigate={() => undefined} />,
    );
    expect(render({ status: "loading" })).toContain("Loading Inventory");
    expect(render({ status: "error", message: "offline" })).toContain("Inventory unavailable");

    const empty = render(readyState({ snapshot: { rowVersion: "8", entries: [], nextCursor: null, pagesLoaded: 1 } }));
    expect(empty).toContain("Inventory empty");

    const stale = render(readyState({ refreshPending: true, refreshError: "network lost" }));
    expect(stale).toContain("previously read quantities remain visible");
    expect(stale).toContain("displayed quantities may be stale");
    expect(stale).toContain("×50");
    expect(stale).toContain("This page can only read Inventory");
    expect(stale).toContain("Open Hunt settings");
    expect(stale).not.toContain(">Use item<");
    expect(stale).not.toContain(">Consume<");
    expect(stale).not.toContain(">Grant<");
  });

  it("keeps bounded errors specific to the authoritative read", () => {
    expect(inventoryErrorText(new HuntApiError(404, "not_found"))).toMatch(/No authoritative Inventory/);
    expect(inventoryErrorText(new HuntApiError(503, "authority_unavailable"))).toMatch(/temporarily unavailable/);
  });
});
