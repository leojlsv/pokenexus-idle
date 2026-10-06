import { useCallback, useEffect, useRef, useState } from "react";
import { PlayerApiError } from "./player-api";

interface ReadyResource<T> {
  readonly status: "ready";
  readonly value: T;
  readonly refreshPending: boolean;
  readonly refreshError: unknown | null;
}

export type RemoteState<T> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: unknown }
  | ReadyResource<T>;

export function markResourceRefresh<T>(previous: RemoteState<T>): RemoteState<T> {
  return previous.status === "ready"
    ? { ...previous, refreshPending: true, refreshError: null }
    : { status: "loading" };
}

export function resourceRefreshSucceeded<T>(value: T): RemoteState<T> {
  return { status: "ready", value, refreshPending: false, refreshError: null };
}

export function resourceRefreshFailed<T>(previous: RemoteState<T>, error: unknown): RemoteState<T> {
  return previous.status === "ready"
    ? { ...previous, refreshPending: false, refreshError: error }
    : { status: "error", error };
}

function wasAborted(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function reportSessionLost(error: unknown, onSessionLost: () => void): void {
  if (error instanceof PlayerApiError && error.directive.kind === "session_lost") onSessionLost();
}

export function usePlayerResource<T>(
  identity: string,
  load: (signal: AbortSignal) => Promise<T>,
  onSessionLost: () => void,
) {
  const [state, setState] = useState<RemoteState<T>>({ status: "loading" });
  const [revision, setRevision] = useState(0);
  const loader = useRef(load);
  loader.current = load;
  const sessionHandler = useRef(onSessionLost);
  sessionHandler.current = onSessionLost;
  const currentIdentity = useRef(identity);

  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const sameIdentity = currentIdentity.current === identity;
    currentIdentity.current = identity;
    setState((previous) => sameIdentity ? markResourceRefresh(previous) : { status: "loading" });
    void loader.current(controller.signal).then((value) => {
      if (live) setState(resourceRefreshSucceeded(value));
    }).catch((error: unknown) => {
      if (!live || wasAborted(error)) return;
      reportSessionLost(error, sessionHandler.current);
      setState((previous) => resourceRefreshFailed(previous, error));
    });
    return () => {
      live = false;
      controller.abort();
    };
  }, [identity, revision]);

  return {
    state,
    reload: () => {
      setState(markResourceRefresh);
      setRevision((count) => count + 1);
    },
  };
}

interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly teamLimit?: number;
}

interface ReadyPage<T> extends CursorPage<T> {
  readonly status: "ready";
  readonly morePending: boolean;
  readonly moreError: unknown | null;
  readonly refreshPending: boolean;
  readonly refreshError: unknown | null;
}

export type PagedState<T> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: unknown }
  | ReadyPage<T>;

export function appendPage<T>(
  previous: CursorPage<T>,
  next: CursorPage<T>,
  identity: (item: T) => string,
): CursorPage<T> {
  const items = [...previous.items];
  const positions = new Map(previous.items.map((item, index) => [identity(item), index]));
  for (const item of next.items) {
    const existing = positions.get(identity(item));
    if (existing === undefined) {
      positions.set(identity(item), items.length);
      items.push(item);
    } else {
      items[existing] = item;
    }
  }
  return { ...previous, ...next, items, nextCursor: next.nextCursor };
}

export function recordPageContinuation(
  seenRequestedCursors: ReadonlySet<string>,
  requestedCursor: string,
  nextCursor: string | null,
): ReadonlySet<string> {
  if (
    nextCursor === requestedCursor ||
    (nextCursor !== null && seenRequestedCursors.has(nextCursor))
  ) {
    throw new Error("Server returned a repeated cursor cycle");
  }
  return new Set([...seenRequestedCursors, requestedCursor]);
}

export function usePlayerPages<T>(
  identity: string,
  load: (cursor: string | null, signal: AbortSignal) => Promise<CursorPage<T>>,
  itemKey: (item: T) => string,
  onSessionLost: () => void,
) {
  const [state, setState] = useState<PagedState<T>>({ status: "loading" });
  const [revision, setRevision] = useState(0);
  const loader = useRef(load);
  loader.current = load;
  const sessionHandler = useRef(onSessionLost);
  sessionHandler.current = onSessionLost;
  const key = useRef(itemKey);
  key.current = itemKey;
  const pageController = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const seenRequestedCursors = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    pageController.current?.abort();
    pageController.current = controller;
    busy.current = false;
    let live = true;
    setState((previous) => previous.status === "ready"
      ? { ...previous, refreshPending: true, refreshError: null, morePending: false, moreError: null }
      : { status: "loading" });
    void loader.current(null, controller.signal).then((page) => {
      if (live) {
        seenRequestedCursors.current = new Set();
        setState({ ...page, status: "ready", morePending: false, moreError: null,
          refreshPending: false, refreshError: null });
      }
    }).catch((error: unknown) => {
      if (!live || wasAborted(error)) return;
      reportSessionLost(error, sessionHandler.current);
      setState((previous) => previous.status === "ready"
        ? { ...previous, refreshPending: false, refreshError: error }
        : { status: "error", error });
    });
    return () => {
      live = false;
      controller.abort();
      pageController.current?.abort();
    };
  }, [identity, revision]);

  const loadMore = useCallback(async () => {
    if (state.status !== "ready" || state.refreshPending || state.nextCursor === null || busy.current) return;
    busy.current = true;
    const cursor = state.nextCursor;
    const controller = new AbortController();
    pageController.current = controller;
    setState((previous) => previous.status === "ready"
      ? { ...previous, morePending: true, moreError: null } : previous);
    try {
      const page = await loader.current(cursor, controller.signal);
      if (controller.signal.aborted) return;
      seenRequestedCursors.current = recordPageContinuation(
        seenRequestedCursors.current,
        cursor,
        page.nextCursor,
      );
      setState((previous) => previous.status === "ready" ? {
        ...previous, ...appendPage(previous, page, key.current), status: "ready",
        morePending: false, moreError: null,
      } : previous);
    } catch (error) {
      if (controller.signal.aborted || wasAborted(error)) return;
      reportSessionLost(error, sessionHandler.current);
      setState((previous) => previous.status === "ready"
        ? { ...previous, morePending: false, moreError: error } : previous);
    } finally {
      if (pageController.current === controller) busy.current = false;
    }
  }, [state]);

  return {
    state,
    loadMore,
    reload: () => {
      pageController.current?.abort();
      setState((previous) => previous.status === "ready"
        ? { ...previous, refreshPending: true, refreshError: null } : previous);
      setRevision((count) => count + 1);
    },
  };
}

export function addRosterMember(ids: readonly string[], pokemonInstanceId: string): readonly string[] {
  if (!pokemonInstanceId || ids.includes(pokemonInstanceId) || ids.length >= 6) return ids;
  return [...ids, pokemonInstanceId];
}

export function reorderRosterMember(ids: readonly string[], index: number, step: -1 | 1): readonly string[] {
  const target = index + step;
  if (index < 0 || target < 0 || index >= ids.length || target >= ids.length) return ids;
  const copy = [...ids];
  [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  return copy;
}

export function removeRosterMember(ids: readonly string[], index: number): readonly string[] {
  return index < 0 || index >= ids.length ? ids : ids.filter((_, candidate) => candidate !== index);
}

export function sameOrderedRoster(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => right[index] === id);
}
