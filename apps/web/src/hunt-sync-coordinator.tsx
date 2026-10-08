import { useEffect, useState } from "react";
import { HuntApi, HuntApiError } from "./hunt-api";
import {
  browserHuntCommandStore,
  browserHuntPolicyCommandStore,
  type FrozenHuntCommand,
  type HuntCommandStoreState,
} from "./hunt-command-store";

const ONLINE_SYNC_INTERVAL_MS = 2_000;
const CONTINUATION_INTERVAL_MS = 25;
const BLOCKED_RECHECK_MS = 500;

type SyncMode = "online" | "return";

export function savedCoordinatorSyncIntent(
  pending: HuntCommandStoreState,
): { readonly huntId: string; readonly mode: SyncMode } | null {
  if (pending.kind !== "resume" || pending.family !== "sync") return null;
  if (pending.intent === null || typeof pending.intent !== "object" || Array.isArray(pending.intent)) return null;
  const row = pending.intent as Record<string, unknown>;
  if (typeof row.huntId !== "string" || (row.mode !== "online" && row.mode !== "return")) return null;
  return { huntId: row.huntId, mode: row.mode };
}

export function backgroundSyncBlockedByPending(
  mainPending: HuntCommandStoreState,
  policyPending: HuntCommandStoreState,
): boolean {
  if (policyPending.kind !== "none") return true;
  if (mainPending.kind === "none") return false;
  return !(mainPending.kind === "resume" && mainPending.family === "sync");
}

type CoordinatorSyncWork =
  | { readonly kind: "idle" }
  | { readonly kind: "invalid" }
  | {
      readonly kind: "resume";
      readonly huntId: string;
      readonly mode: SyncMode;
      readonly queuedReturn: boolean;
    }
  | {
      readonly kind: "begin";
      readonly huntId: string;
      readonly mode: SyncMode;
      readonly queuedReturn: false;
    };

export function coordinatorSyncWork(
  activeHuntId: string | null,
  pending: HuntCommandStoreState,
  returnRequested: boolean,
): CoordinatorSyncWork {
  if (pending.kind === "resume") {
    const saved = savedCoordinatorSyncIntent(pending);
    if (!saved) return { kind: "invalid" };
    return {
      kind: "resume",
      huntId: saved.huntId,
      mode: saved.mode,
      queuedReturn: activeHuntId === saved.huntId && returnRequested && saved.mode === "online",
    };
  }
  if (pending.kind !== "none") return { kind: "invalid" };
  if (activeHuntId === null) return { kind: "idle" };
  return {
    kind: "begin",
    huntId: activeHuntId,
    mode: returnRequested ? "return" : "online",
    queuedReturn: false,
  };
}

function errorText(cause: unknown): string {
  return cause instanceof HuntApiError
    ? `HTTP ${cause.status}: ${cause.code}`
    : cause instanceof Error ? cause.message : "Unknown Hunt synchronization error";
}

export function HuntSyncCoordinator({
  enabled,
  api,
  csrfToken,
  onSessionLost,
}: {
  readonly enabled: boolean;
  readonly api: HuntApi;
  readonly csrfToken: string;
  readonly onSessionLost: () => void;
}) {
  const [nextSyncAt, setNextSyncAt] = useState(0);
  // Cold-load on a management route requires Return semantics. If the app
  // starts on Active Hunt, that page owns the initial Return and a later
  // foreground route handoff should continue with online checkpoints.
  const [returnRequested, setReturnRequested] = useState(enabled);
  const [paused, setPaused] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const requestReturn = () => {
      setReturnRequested(true);
      setPaused(null);
      setNextSyncAt(Date.now());
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") requestReturn();
    };
    window.addEventListener("online", requestReturn);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", requestReturn);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || paused !== null || document.visibilityState !== "visible") return;
    const controller = new AbortController();
    let cancelled = false;
    const delay = Math.max(0, nextSyncAt - Date.now());
    const timer = window.setTimeout(() => {
      void (async () => {
        const mainStore = browserHuntCommandStore();
        const policyStore = browserHuntPolicyCommandStore();
        let frozenKey: string | null = null;
        let frozenHuntId: string | null = null;
        try {
          const [hunt, playerId] = await Promise.all([
            api.state(controller.signal),
            api.playerIdentity(controller.signal),
          ]);
          if (cancelled || controller.signal.aborted) return;

          const policyPending = await policyStore.inspect(playerId);
          if (cancelled || controller.signal.aborted) return;
          if (policyPending.kind === "different_player" || policyPending.kind === "unavailable") {
            throw new Error("Policy correlation storage is unavailable or belongs to another Player");
          }

          const pending = await mainStore.inspect(playerId);
          if (cancelled || controller.signal.aborted) return;
          if (pending.kind === "different_player" || pending.kind === "unavailable") {
            throw new Error("Hunt synchronization storage is unavailable or belongs to another Player");
          }
          if (backgroundSyncBlockedByPending(pending, policyPending)) {
            setNextSyncAt(Date.now() + BLOCKED_RECHECK_MS);
            return;
          }

          const activeHuntId = hunt.activeHunt?.huntId ?? null;
          const work = coordinatorSyncWork(activeHuntId, pending, returnRequested);
          if (work.kind === "invalid") {
            throw new Error("Stored automatic Hunt synchronization is malformed");
          }
          if (work.kind === "idle") {
            setReturnRequested(false);
            setNextSyncAt(Date.now() + ONLINE_SYNC_INTERVAL_MS);
            return;
          }

          const mode = work.mode;
          const queuedReturn = work.queuedReturn;
          let frozen: FrozenHuntCommand;
          if (work.kind === "resume") {
            if (pending.kind !== "resume") {
              throw new Error("Stored automatic Hunt synchronization disappeared before replay");
            }
            frozen = pending;
          } else {
            // Re-check the policy lane immediately before freezing a new sync key.
            const policyRecheck = await policyStore.inspect(playerId);
            if (policyRecheck.kind === "different_player" || policyRecheck.kind === "unavailable") {
              throw new Error("Policy correlation storage is unavailable or belongs to another Player");
            }
            if (policyRecheck.kind !== "none") {
              setNextSyncAt(Date.now() + BLOCKED_RECHECK_MS);
              return;
            }
            frozen = await mainStore.begin(
              playerId,
              "sync",
              { huntId: work.huntId, mode },
              controller.signal,
            );
          }
          if (cancelled || controller.signal.aborted) return;
          frozenKey = frozen.key;
          frozenHuntId = work.huntId;

          // A policy Save may have frozen after the first inspection. Re-check
          // immediately before transmission for both new and resumed sync keys.
          // The server also serializes both command families on the Player Hunt
          // root and joins pending advancement targets, so this is a client
          // priority guard rather than the sole correctness fence.
          const policyBeforeSend = await policyStore.inspect(playerId);
          if (cancelled || controller.signal.aborted) return;
          if (policyBeforeSend.kind === "different_player" || policyBeforeSend.kind === "unavailable") {
            throw new Error("Policy correlation storage is unavailable or belongs to another Player");
          }
          if (policyBeforeSend.kind !== "none") {
            setNextSyncAt(Date.now() + BLOCKED_RECHECK_MS);
            return;
          }

          const result = await api.reconcileHunt(
            csrfToken,
            frozen.key,
            work.huntId,
            mode,
            controller.signal,
          );
          if (cancelled || controller.signal.aborted) return;
          if (result.kind === "in_progress") {
            setNextSyncAt(Date.now() + CONTINUATION_INTERVAL_MS);
            return;
          }

          const freshHunt = await api.state(controller.signal);
          await api.activity(work.huntId, undefined, controller.signal);
          if (cancelled || controller.signal.aborted) return;
          if (!(await mainStore.clear(playerId, frozen.key, controller.signal))) {
            throw new Error("Completed automatic Hunt synchronization could not clear its exact correlation");
          }
          if (cancelled || controller.signal.aborted) return;
          const freshActiveHuntId = freshHunt.activeHunt?.huntId ?? null;
          const mustReturn = freshActiveHuntId !== null
            && (freshActiveHuntId !== work.huntId || queuedReturn);
          setReturnRequested(mustReturn);
          setNextSyncAt(mustReturn ? Date.now() : Date.now() + ONLINE_SYNC_INTERVAL_MS);
        } catch (cause) {
          if (cancelled || controller.signal.aborted) return;
          if (cause instanceof HuntApiError && cause.status === 401) {
            onSessionLost();
            return;
          }
          if (
            frozenKey
            && frozenHuntId
            && cause instanceof HuntApiError
            && (
              cause.status === 404
              || cause.status === 410
              || (cause.status === 409 && (cause.code === "command_superseded" || cause.code === "hunt_not_active"))
            )
          ) {
            try {
              const [freshHunt] = await Promise.all([
                api.state(controller.signal),
                api.activity(frozenHuntId, undefined, controller.signal),
              ]);
              if (cancelled || controller.signal.aborted) return;
              const playerId = await api.playerIdentity(controller.signal);
              if (!(await mainStore.clear(playerId, frozenKey, controller.signal))) {
                throw new Error("Superseded Hunt synchronization could not clear its exact correlation", { cause });
              }
              if (cancelled || controller.signal.aborted) return;
              setReturnRequested(freshHunt.activeHunt !== null);
              setNextSyncAt(freshHunt.activeHunt ? Date.now() : Date.now() + ONLINE_SYNC_INTERVAL_MS);
              return;
            } catch (reconcileCause) {
              if (cancelled || controller.signal.aborted) return;
              setPaused(errorText(reconcileCause));
              return;
            }
          }
          // Preserve any exact frozen key and pause; Retry reuses it through the store.
          setPaused(errorText(cause));
        }
      })();
    }, delay);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [api, csrfToken, enabled, nextSyncAt, onSessionLost, paused, returnRequested]);

  if (!enabled || paused === null) return null;
  return (
    <div className="hunt-error" role="alert">
      Automatic Hunt synchronization paused: {paused}
      <button className="button button--secondary" type="button" onClick={() => {
        setPaused(null);
        setReturnRequested(true);
        setNextSyncAt(Date.now());
      }}>Retry synchronization</button>
    </div>
  );
}
