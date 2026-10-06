import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "./common-states";
import {
  HuntApi,
  HuntApiError,
  type HuntActivityPage,
  type HuntActivityRecord,
  type HuntState,
  type OwnedPokemonPreview,
  type SavedTeamDetail,
  type SavedTeamsPage,
} from "./hunt-api";
import { browserHuntCommandStore, type HuntCommandStoreState } from "./hunt-command-store";
import { formatHuntDuration, formatHuntTimestamp } from "./hunt-display";
import {
  consumeActiveForegroundHandoff,
  rememberActiveForegroundHandoff,
} from "./hunt-foreground-handoff";
import type { PublishedHuntChoices } from "./hunt-published-choices";
import "./hunt-pages.css";

const LAST_HUNT_KEY = "pokenexus:hunt:last-visible-id:v1";

type Navigate = (href: string) => void;

function rememberLastHuntId(huntId: string): void {
  try {
    sessionStorage.setItem(LAST_HUNT_KEY, huntId);
  } catch {
    // Navigation history is a convenience hint only; server ownership stays authoritative.
  }
}

function readLastHuntId(): string | null {
  try {
    return sessionStorage.getItem(LAST_HUNT_KEY);
  } catch {
    return null;
  }
}

function readableError(error: unknown): string {
  if (error instanceof HuntApiError) return `HTTP ${error.status}: ${error.code}`;
  return error instanceof Error ? error.message : "Unexpected Hunt client error";
}

function catalogError(error: unknown): string {
  if (error instanceof HuntApiError && error.status === 404) {
    return "Published Hunt catalog transport is not enabled on this backend. Start remains fail-closed; no local Hunt IDs are inferred.";
  }
  if (error instanceof HuntApiError && error.status === 503) {
    return "Published Hunt content authority is temporarily unavailable. Start remains fail-closed.";
  }
  return "Published Hunt content could not be verified. Start remains fail-closed.";
}

function captureText(disposition: Readonly<Record<string, unknown>>): string {
  switch (disposition.kind) {
    case "attempt":
      return `${disposition.success === true ? "Captured" : "Capture failed"} with ${String(disposition.itemId ?? "Ball")}${disposition.shiny === true ? " · Shiny" : ""}`;
    case "no_eligible_ball": return "No eligible automatic Ball";
    case "disabled": return "Automatic Capture disabled";
    case "not_applicable": return "Capture not applicable";
    default: return "Capture disposition unavailable";
  }
}

function ActivityList({ page }: { readonly page: HuntActivityPage | null }) {
  if (!page || page.records.length === 0) return <EmptyState title="No resolved Encounters yet" message="Resolved Encounter facts will appear here without reconstructing Combat events." />;
  return (
    <ol className="activity-list">
      {page.records.map((record) => <ActivityCard key={record.encounterOrdinal} record={record} />)}
    </ol>
  );
}

function mergeActivityPage(
  current: HuntActivityPage | null,
  incoming: HuntActivityPage,
): HuntActivityPage {
  if (current === null) return incoming;
  if (current.huntId !== incoming.huntId) throw new Error("Hunt activity page identity changed during merge");
  const byOrdinal = new Map<number, HuntActivityRecord>();
  for (const record of [...current.records, ...incoming.records]) byOrdinal.set(record.encounterOrdinal, record);
  return {
    huntId: current.huntId,
    records: [...byOrdinal.values()].sort((left, right) => left.encounterOrdinal - right.encounterOrdinal),
    nextCursor: incoming.nextCursor,
  };
}

function ActivityCard({ record }: { readonly record: HuntActivityRecord }) {
  const resources = [
    ...record.itemDrops.map(({ itemId, quantity }) => `+${quantity} ${itemId}`),
    ...record.consumedItems.map(({ itemId, quantity }) => `-${quantity} ${itemId}`),
  ];
  return (
    <li className="activity-card">
      <div className="activity-card__heading">
        <strong>Encounter {record.encounterOrdinal}</strong>
        <span>{record.outcome === "win" ? "Win" : "Draw"} · {record.encounterDisposition}</span>
      </div>
      <p>{captureText(record.captureDisposition)}</p>
      <p>Player XP +{record.playerXp} · resolved at {formatHuntDuration(record.resolvedAtHuntTimeMs)}</p>
      {record.pokemonXp.length ? <p>Pokémon XP: {record.pokemonXp.map(({ pokemonInstanceId, amount }) => `${pokemonInstanceId} +${amount}`).join(" · ")}</p> : null}
      {resources.length ? <p>Resources: {resources.join(" · ")}</p> : null}
      {record.reviveSummary.length ? (
        <p>Revive: {record.reviveSummary.map(({ phase, itemId, resultingHp }) => `${phase} · ${itemId} → ${resultingHp} HP`).join(" · ")}</p>
      ) : null}
      <p>KO: {record.koSummary.map(({ side, count }) => `${side} ${count}`).join(" · ")}</p>
    </li>
  );
}

function TeamCards({ members }: { readonly members: HuntState["activeHunt"] extends infer T ? T extends { team: infer M } ? M : never : never }) {
  return (
    <div className="hunt-team-grid">
      {members.map((member) => (
        <article className="hunt-member-card" key={member.pokemonInstanceId}>
          <strong>{member.speciesId}</strong>
          <span>Lv. {member.level}</span>
          <span>HP {member.currentHp} / {member.maxHp}</span>
          <progress value={member.currentHp} max={member.maxHp} aria-label={`${member.speciesId} HP`} />
        </article>
      ))}
    </div>
  );
}

function PendingCommand({ pending, onReconcile, onContinue, continueLabel = "Continue exact saved command" }: {
  readonly pending: HuntCommandStoreState;
  readonly onReconcile: () => void;
  readonly onContinue?: () => void;
  readonly continueLabel?: string;
}) {
  if (pending.kind === "none") return null;
  const message = pending.kind === "resume"
    ? pending.family === "sync"
      ? `Automatic Hunt synchronization is still correlated to key ${pending.key}. Return to the active Hunt so the exact saved synchronization can finish.`
      : `A ${pending.family.replaceAll("_", " ")} command is still correlated to key ${pending.key}. New Hunt mutations are blocked until it is continued or explicitly reconciled.`
    : pending.kind === "different_player"
      ? "A stored Hunt command belongs to another Player session. New Hunt mutations are blocked."
      : "Hunt command correlation storage is unreadable. New mutations are blocked to avoid duplicate effects.";
  return (
    <div className="state-card state-card--error" role="status">
      <strong>Pending Hunt command</strong>
      <span>{message}</span>
      {pending.kind === "resume" && onContinue
        ? <button className="button" type="button" onClick={onContinue}>{continueLabel}</button>
        : null}
      {((pending.kind === "resume" && pending.family !== "sync") || pending.kind === "different_player")
        ? <button className="button button--secondary" type="button" onClick={onReconcile}>Reconcile against current server state</button>
        : null}
    </div>
  );
}

interface TeamPreviewState {
  readonly detail: SavedTeamDetail;
  readonly members: readonly OwnedPokemonPreview[];
}

interface OverviewReady {
  readonly hunt: HuntState;
  readonly playerId: string;
  readonly teams: SavedTeamsPage;
  readonly catalog: PublishedHuntChoices | null;
  readonly catalogMessage: string | null;
  readonly pending: HuntCommandStoreState;
}

type OverviewState = { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | ({ readonly status: "ready" } & OverviewReady);

export function HuntOverviewPage({ api, csrfToken, onSessionLost, onNavigate }: {
  readonly api: HuntApi;
  readonly csrfToken: string;
  readonly onSessionLost: () => void;
  readonly onNavigate: Navigate;
}) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<OverviewState>({ status: "loading" });
  const [selectedHunt, setSelectedHunt] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [teamPreview, setTeamPreview] = useState<TeamPreviewState | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);

  const refresh = () => setRevision((value) => value + 1);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    const loadCatalog = api.publishedHuntChoices(controller.signal)
      .then((catalog) => ({ catalog, catalogMessage: null as string | null }))
      .catch((cause: unknown) => {
        if (cause instanceof HuntApiError && cause.status === 401) throw cause;
        return { catalog: null, catalogMessage: catalogError(cause) };
      });
    void Promise.all([
      api.state(controller.signal),
      api.playerIdentity(controller.signal),
      api.teamsPage(undefined, controller.signal),
      loadCatalog,
    ]).then(async ([hunt, playerId, teams, published]) => {
      const pending = await browserHuntCommandStore().inspect(playerId);
      if (!controller.signal.aborted) {
        if (hunt.activeHunt) rememberLastHuntId(hunt.activeHunt.huntId);
        setState({ status: "ready", hunt, playerId, teams, ...published, pending });
      }
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      if (cause instanceof HuntApiError && cause.status === 401) onSessionLost();
      else setState({ status: "error", message: readableError(cause) });
    });
    return () => controller.abort();
  }, [api, onSessionLost, revision]);

  useEffect(() => {
    const controller = new AbortController();
    setTeamPreview(null);
    setTeamError(null);
    if (!selectedTeam) return () => controller.abort();
    void api.teamDetail(selectedTeam, controller.signal).then(async (detail) => {
      const members = await Promise.all(detail.pokemonInstanceIds.map((id) => api.pokemon(id, controller.signal)));
      if (!controller.signal.aborted) setTeamPreview({ detail, members });
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setTeamError(readableError(cause));
    });
    return () => controller.abort();
  }, [api, selectedTeam]);

  if (state.status === "loading") return <LoadingState label="Loading authoritative Hunt state" />;
  if (state.status === "error") return <ErrorState title="Hunt unavailable" message={state.message} onRetry={refresh} />;

  const choice = state.catalog?.hunts.find(({ huntDefinitionId }) => huntDefinitionId === selectedHunt) ?? null;
  const mutationBlocked = busy || state.pending.kind !== "none";

  const reconcile = async () => {
    try {
      await api.state();
      if (!window.confirm("Current Hunt state was read successfully. Discard the stored command correlation? This does not undo any server-side effect and can make exact replay impossible.")) return;
      if (!(await browserHuntCommandStore().discardAfterReconciliation(state.playerId))) throw new Error("Stored command could not be cleared");
      refresh();
    } catch (cause) { setCommandError(readableError(cause)); }
  };

  const run = async (
    family: "start" | "pokecenter",
    intent: unknown,
    action: (key: string) => ReturnType<HuntApi["start"]>,
  ) => {
    if (mutationBlocked) return;
    setBusy(true); setCommandError(null); setNotice(null);
    try {
      const store = browserHuntCommandStore();
      const frozen = await store.begin(state.playerId, family, intent);
      const result = await action(frozen.key);
      if (result.kind === "in_progress") {
        setNotice(`Command accepted through ${result.logicalTimeMs} / ${result.targetLogicalTimeMs}. The exact same key remains stored for deliberate continuation.`);
        refresh();
        return;
      }
      if (!(await store.clear(state.playerId, frozen.key))) throw new Error("Completed command correlation could not be cleared");
      setNotice("Command committed; refreshing authoritative Hunt state.");
      refresh();
    } catch (cause) {
      if (cause instanceof HuntApiError && cause.status === 401) onSessionLost();
      else {
        setCommandError(readableError(cause));
        refresh();
      }
    } finally { setBusy(false); }
  };

  const continuePending = async () => {
    if (state.pending.kind !== "resume" || busy) return;
    const intent = state.pending.intent;
    if (intent === null || typeof intent !== "object" || Array.isArray(intent)) {
      setCommandError("Stored command intent is invalid; reconcile it against current server state before continuing.");
      return;
    }
    const row = intent as Record<string, unknown>;
    setBusy(true); setCommandError(null); setNotice(null);
    try {
      let result;
      if (state.pending.family === "start") {
        if (typeof row.huntDefinitionId !== "string" || typeof row.teamId !== "string") throw new Error("Stored Start intent is invalid");
        result = await api.start(csrfToken, state.pending.key, { huntDefinitionId: row.huntDefinitionId, teamId: row.teamId });
      } else if (state.pending.family === "pokecenter") {
        if (
          typeof row.teamId !== "string"
          || !Array.isArray(row.pokemonInstanceIds)
          || row.pokemonInstanceIds.some((entry) => typeof entry !== "string")
        ) throw new Error("Stored PokéCenter intent is invalid");
        result = await api.healAtPokeCenter(
          csrfToken,
          state.pending.key,
          row.teamId,
          row.pokemonInstanceIds as string[],
        );
      } else if (state.pending.family === "sync") {
        if (typeof row.huntId !== "string" || (row.mode !== "online" && row.mode !== "return")) {
          throw new Error("Stored automatic Hunt synchronization intent is invalid");
        }
        result = await api.reconcileHunt(csrfToken, state.pending.key, row.huntId, row.mode);
        if (result.kind === "complete") {
          const freshHunt = await api.state();
          await api.activity(row.huntId);
          if (!(await browserHuntCommandStore().clear(state.playerId, state.pending.key))) {
            throw new Error("Completed automatic synchronization correlation could not be cleared after authoritative reread");
          }
          rememberLastHuntId(row.huntId);
          setNotice("Automatic Hunt synchronization completed and authoritative state was reloaded.");
          if (freshHunt.activeHunt === null) {
            onNavigate("/hunt/result");
            return;
          }
          refresh();
          return;
        }
      } else {
        throw new Error("This saved command must be continued from its matching Hunt surface");
      }
      if (result.kind === "complete") {
        if (!(await browserHuntCommandStore().clear(state.playerId, state.pending.key))) throw new Error("Completed command correlation could not be cleared");
        setNotice("Saved command completed; refreshing authoritative state.");
      } else {
        setNotice(`Saved command continued through ${result.logicalTimeMs} / ${result.targetLogicalTimeMs}.`);
      }
      refresh();
    } catch (cause) {
      if (cause instanceof HuntApiError && cause.status === 401) onSessionLost();
      else setCommandError(readableError(cause));
    } finally { setBusy(false); }
  };

  if (state.hunt.activeHunt) {
    return (
      <div className="hunt-surface">
        <section className="panel hunt-section">
          <h2>Hunt in progress</h2>
          <p>{state.hunt.activeHunt.huntDefinitionId} · {formatHuntDuration(state.hunt.activeHunt.logicalTimeMs)}</p>
          <TeamCards members={state.hunt.activeHunt.team} />
          <button className="button" type="button" onClick={() => {
            rememberActiveForegroundHandoff(state.hunt.activeHunt!.huntId);
            onNavigate("/hunt/active");
          }}>Open active Hunt</button>
        </section>
        <PendingCommand pending={state.pending} onReconcile={() => void reconcile()}
          onContinue={state.pending.kind === "resume" && (state.pending.family === "start" || state.pending.family === "pokecenter" || state.pending.family === "sync") ? () => void continuePending() : undefined}
          continueLabel={state.pending.kind === "resume" && state.pending.family === "sync" ? "Finish automatic synchronization" : undefined} />
      </div>
    );
  }

  return (
    <div className="hunt-surface">
      {state.hunt.recoveryReadyAt ? (
        <p className="hunt-note" role="status">Recovery anchor: {formatHuntTimestamp(state.hunt.recoveryReadyAt)}. Server authority decides whether a new Start is currently admissible.</p>
      ) : null}
      {notice ? <p className="hunt-notice" role="status">{notice}</p> : null}
      {commandError ? <p className="hunt-error" role="alert">{commandError}</p> : null}
      <PendingCommand pending={state.pending} onReconcile={() => void reconcile()}
        onContinue={state.pending.kind === "resume" && (state.pending.family === "start" || state.pending.family === "pokecenter" || state.pending.family === "sync") ? () => void continuePending() : undefined}
        continueLabel={state.pending.kind === "resume" && state.pending.family === "sync" ? "Finish automatic synchronization" : undefined} />

      <section className="panel hunt-section" aria-labelledby="hunt-start-title">
        <h2 id="hunt-start-title">Start a Solo Hunt</h2>
        {state.catalogMessage ? (
          <div className="state-card state-card--error" role="status">
            <strong>Published Hunt catalog unavailable</strong>
            <span>{state.catalogMessage}</span>
            <button className="button button--secondary" type="button" onClick={refresh}>Retry Hunt catalog</button>
          </div>
        ) : null}
        <label>
          Zone / Hunt
          <select value={selectedHunt} disabled={!state.catalog || mutationBlocked} onChange={(event) => setSelectedHunt(event.target.value)}>
            <option value="">Select authoritative Hunt</option>
            {state.catalog?.hunts.map((hunt) => <option key={hunt.huntDefinitionId} value={hunt.huntDefinitionId}>{hunt.zoneLabel} · {hunt.huntLabel}</option>)}
          </select>
        </label>
        <label>
          Saved Team
          <select value={selectedTeam} disabled={mutationBlocked} onChange={(event) => setSelectedTeam(event.target.value)}>
            <option value="">Select Team</option>
            {state.teams.teams.map(({ teamId }) => <option key={teamId} value={teamId}>{teamId}</option>)}
          </select>
        </label>
        {teamError ? <p className="hunt-error" role="alert">{teamError}</p> : null}
        {teamPreview ? (
          <div className="prestart-preview">
            <h3>Selected Team</h3>
            <ol>{teamPreview.members.map((member) => <li key={member.pokemonInstanceId}><strong>{member.speciesId}</strong> · Lv. {member.level} · {member.moveIds.length ? member.moveIds.join(", ") : "no selected Moves"}</li>)}</ol>
          </div>
        ) : selectedTeam ? <LoadingState label="Loading current saved Team" /> : null}
        {choice ? (
          <div className="prestart-preview">
            <h3>Published Encounter preview</h3>
            <p>Possible Species: {choice.preview.possibleSpeciesIds.join(", ")}</p>
            <p>Player XP: {choice.preview.playerXp ? `${choice.preview.playerXp.min}–${choice.preview.playerXp.max}` : "none"} · Pokémon XP pool: {choice.preview.pokemonXpPool.min}–{choice.preview.pokemonXpPool.max}</p>
            <p>Drops: {choice.preview.itemDrops.length ? choice.preview.itemDrops.map((drop) => `${drop.itemId} ×${drop.quantity.min}${drop.quantity.max !== drop.quantity.min ? `–${drop.quantity.max}` : ""} @ ${(drop.chanceBasisPoints.min / 100).toFixed(0)}${drop.chanceBasisPoints.max !== drop.chanceBasisPoints.min ? `–${(drop.chanceBasisPoints.max / 100).toFixed(0)}` : ""}%`).join(" · ") : "none"}</p>
          </div>
        ) : null}
        <div className="hunt-actions">
          <button className="button" type="button" disabled={!choice || !teamPreview || !teamPreview.members.length || mutationBlocked}
            onClick={() => {
              if (!choice || !teamPreview) return;
              const intent = { huntDefinitionId: choice.huntDefinitionId, teamId: teamPreview.detail.teamId };
              if (!window.confirm(`Start ${choice.huntLabel} with Team ${teamPreview.detail.teamId}? Server authority revalidates current Team vitality, content and policies.`)) return;
              void run("start", intent, (key) => api.start(csrfToken, key, intent));
            }}>{busy ? "Submitting…" : "Start Hunt"}</button>
          <button className="button button--secondary" type="button" disabled={!teamPreview || mutationBlocked}
            onClick={() => {
              if (!teamPreview) return;
              const intent = {
                teamId: teamPreview.detail.teamId,
                pokemonInstanceIds: [...teamPreview.detail.pokemonInstanceIds],
              };
              if (!window.confirm(`Heal saved Team ${teamPreview.detail.teamId} at the HUB PokéCenter?`)) return;
              void run("pokecenter", intent, (key) => api.healAtPokeCenter(
                csrfToken,
                key,
                intent.teamId,
                intent.pokemonInstanceIds,
              ));
            }}>Heal Team at PokéCenter</button>
        </div>
        <p className="hunt-note">Start has no manual healing or per-Encounter capture flow. Progression and return reconciliation are automatic; current server authority freezes the admitted Team and management policies.</p>
      </section>
    </div>
  );
}

type ActiveState = { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "ready";
      readonly hunt: HuntState;
      readonly playerId: string;
      readonly pending: HuntCommandStoreState;
      readonly activity: HuntActivityPage | null;
    };

export function ActiveHuntPage({ api, csrfToken, onSessionLost, onNavigate }: {
  readonly api: HuntApi;
  readonly csrfToken: string;
  readonly onSessionLost: () => void;
  readonly onNavigate: Navigate;
}) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ActiveState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncPaused, setSyncPaused] = useState(false);
  const [syncBlocking, setSyncBlocking] = useState(false);
  const [syncPulse, setSyncPulse] = useState(0);
  const [nextSyncAt, setNextSyncAt] = useState(0);
  const [foregroundHandoffHuntId, setForegroundHandoffHuntId] = useState<string | null>(
    consumeActiveForegroundHandoff,
  );
  const [syncMode, setSyncMode] = useState<"return" | "online">(() => foregroundHandoffHuntId ? "online" : "return");
  const [returnSyncRequested, setReturnSyncRequested] = useState(() => foregroundHandoffHuntId === null);
  const [activityBusy, setActivityBusy] = useState(false);

  const refresh = () => setRevision((value) => value + 1);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void Promise.all([api.state(controller.signal), api.playerIdentity(controller.signal)]).then(async ([hunt, playerId]) => {
      const pending = await browserHuntCommandStore().inspect(playerId);
      const activity = hunt.activeHunt ? await api.activity(hunt.activeHunt.huntId, undefined, controller.signal) : null;
      if (!controller.signal.aborted) {
        if (hunt.activeHunt) rememberLastHuntId(hunt.activeHunt.huntId);
        setState({ status: "ready", hunt, playerId, pending, activity });
      }
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      if (cause instanceof HuntApiError && cause.status === 401) onSessionLost();
      else setState({ status: "error", message: readableError(cause) });
    });
    return () => controller.abort();
  }, [api, onSessionLost, revision]);

  useEffect(() => {
    const requestReturnSync = () => {
      setReturnSyncRequested(true);
      setNextSyncAt(0);
      setSyncPulse((value) => value + 1);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") requestReturnSync();
    };
    window.addEventListener("online", requestReturnSync);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", requestReturnSync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (
      state.status !== "ready"
      || !state.hunt.activeHunt
      || state.hunt.legacyPendingManualCapture
      || syncPaused
      || busy
      || state.pending.kind === "different_player"
      || state.pending.kind === "unavailable"
      || (state.pending.kind === "resume" && state.pending.family !== "sync")
    ) return;

    const active = state.hunt.activeHunt;
    let cancelled = false;
    const controller = new AbortController();
    const delay = Math.max(0, nextSyncAt - Date.now());
    const timer = window.setTimeout(() => {
      void (async () => {
        const store = browserHuntCommandStore();
        let frozenKey: string | null = null;
        try {
          setSyncBlocking(true);
          const inspected = await store.inspect(state.playerId);
          if (cancelled || controller.signal.aborted) return;
          if (inspected.kind === "different_player" || inspected.kind === "unavailable") {
            throw new Error("Automatic Hunt synchronization storage is unavailable or belongs to another Player");
          }
          const foregroundHandoffMatches = foregroundHandoffHuntId === active.huntId;
          if (foregroundHandoffHuntId !== null && !foregroundHandoffMatches && inspected.kind === "none") {
            setForegroundHandoffHuntId(null);
            setReturnSyncRequested(true);
            return;
          }
          const effectiveReturnRequested = returnSyncRequested || (foregroundHandoffHuntId !== null && !foregroundHandoffMatches);
          let mode: "return" | "online" = effectiveReturnRequested ? "return" : syncMode;
          let queuedReturnAfterExisting = false;
          let frozen;
          if (inspected.kind === "resume") {
            if (inspected.family !== "sync") {
              throw new Error("Another unresolved Hunt command blocks automatic synchronization");
            }
            const saved = inspected.intent;
            if (
              saved === null
              || typeof saved !== "object"
              || Array.isArray(saved)
              || (saved as Record<string, unknown>).huntId !== active.huntId
              || ((saved as Record<string, unknown>).mode !== "return" && (saved as Record<string, unknown>).mode !== "online")
            ) {
              throw new Error("Stored automatic Hunt synchronization does not match the current Hunt");
            }
            mode = (saved as Record<string, unknown>).mode as "return" | "online";
            queuedReturnAfterExisting = effectiveReturnRequested && mode === "online";
            frozen = inspected;
          } else {
            frozen = await store.begin(
              state.playerId,
              "sync",
              { huntId: active.huntId, mode },
              controller.signal,
            );
          }
          if (cancelled || controller.signal.aborted) return;
          frozenKey = frozen.key;

          const result = await api.reconcileHunt(csrfToken, frozen.key, active.huntId, mode, controller.signal);
          if (cancelled) return;
          if (result.kind === "in_progress") {
            setSyncMessage(`Synchronizing automatic Hunt progression: ${result.logicalTimeMs} / ${result.targetLogicalTimeMs}.`);
            setNextSyncAt(Date.now() + 100);
            setSyncPulse((value) => value + 1);
            return;
          }
          const freshHunt = await api.state(controller.signal);
          const highWater = state.activity?.records.at(-1)?.encounterOrdinal;
          const activityDelta = await api.activity(
            active.huntId,
            highWater === undefined ? undefined : String(highWater),
            controller.signal,
          );
          const freshActivity = mergeActivityPage(state.activity, activityDelta);
          if (!(await store.clear(state.playerId, frozen.key))) {
            throw new Error("Completed automatic Hunt synchronization could not clear its correlation key");
          }
          if (cancelled) return;
          setSyncMessage("Hunt progression synchronized.");
          setSyncBlocking(false);
          if (mode === "online" && foregroundHandoffMatches) {
            setForegroundHandoffHuntId(null);
          }
          setReturnSyncRequested(queuedReturnAfterExisting);
          setSyncMode("online");
          setNextSyncAt(queuedReturnAfterExisting ? 0 : Date.now() + 5_000);
          setState({
            status: "ready",
            hunt: freshHunt,
            playerId: state.playerId,
            pending: { kind: "none" },
            activity: freshActivity,
          });
          if (freshHunt.activeHunt === null) onNavigate("/hunt/result");
        } catch (cause) {
          if (cancelled) return;
          if (cause instanceof HuntApiError && cause.status === 401) onSessionLost();
          else if (
            frozenKey
            && cause instanceof HuntApiError
            && (
              cause.status === 404
              || cause.status === 410
              || (cause.status === 409 && (cause.code === "command_superseded" || cause.code === "hunt_not_active"))
            )
          ) {
            try {
              const freshHunt = await api.state(controller.signal);
              const highWater = state.activity?.records.at(-1)?.encounterOrdinal;
              const activityDelta = await api.activity(
                active.huntId,
                highWater === undefined ? undefined : String(highWater),
                controller.signal,
              );
              const freshActivity = mergeActivityPage(state.activity, activityDelta);
              if (!(await store.clear(state.playerId, frozenKey))) {
                throw new Error("Terminal synchronization correlation could not be cleared after authoritative reread", { cause });
              }
              if (cancelled) return;
              setSyncBlocking(false);
              setSyncMessage("Hunt synchronization was superseded or expired; authoritative state and activity were reloaded.");
              setReturnSyncRequested(freshHunt.activeHunt !== null);
              setSyncMode(freshHunt.activeHunt ? "return" : "online");
              setNextSyncAt(freshHunt.activeHunt ? 0 : Date.now() + 5_000);
              setState({ status: "ready", hunt: freshHunt, playerId: state.playerId, pending: { kind: "none" }, activity: freshActivity });
              if (freshHunt.activeHunt === null) onNavigate("/hunt/result");
              return;
            } catch (reconcileCause) {
              setSyncMessage(`Automatic Hunt synchronization paused: ${readableError(reconcileCause)}`);
            }
          }
          setSyncBlocking(true);
          setSyncPaused(true);
          setSyncMessage((current) => current ?? `Automatic Hunt synchronization paused: ${readableError(cause)}`);
        }
      })();
    }, delay);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [api, busy, csrfToken, foregroundHandoffHuntId, nextSyncAt, onNavigate, onSessionLost, returnSyncRequested, state, syncMode, syncPaused, syncPulse]);

  if (state.status === "loading") return <LoadingState label="Loading active Hunt" />;
  if (state.status === "error") return <ErrorState title="Active Hunt unavailable" message={state.message} onRetry={refresh} />;
  if (!state.hunt.activeHunt) {
    return <EmptyState title="No active Hunt" message="The authoritative Hunt is no longer active. Open the result summary or return to Hunt." />;
  }

  const active = state.hunt.activeHunt;
  const displayPending = state.pending.kind === "resume" && state.pending.family === "sync"
    ? ({ kind: "none" } as const)
    : state.pending;
  const reconcile = async () => {
    try {
      await api.state();
      if (!window.confirm("Discard the stored Hunt command correlation after this fresh state read? This does not roll back the server.")) return;
      if (!(await browserHuntCommandStore().discardAfterReconciliation(state.playerId))) throw new Error("Stored command could not be cleared");
      refresh();
    } catch (cause) { setError(readableError(cause)); }
  };

  const loadMoreActivity = async () => {
    if (!state.activity?.nextCursor || activityBusy) return;
    setActivityBusy(true);
    setError(null);
    try {
      const next = await api.activity(active.huntId, state.activity.nextCursor);
      setState((current) => {
        if (current.status !== "ready" || current.hunt.activeHunt?.huntId !== active.huntId || current.activity === null) return current;
        const seen = new Set(current.activity.records.map(({ encounterOrdinal }) => encounterOrdinal));
        return {
          ...current,
          activity: {
            huntId: next.huntId,
            records: [...current.activity.records, ...next.records.filter(({ encounterOrdinal }) => !seen.has(encounterOrdinal))],
            nextCursor: next.nextCursor,
          },
        };
      });
    } catch (cause) {
      if (cause instanceof HuntApiError && cause.status === 401) onSessionLost();
      else {
        setError(readableError(cause));
        refresh();
      }
    } finally {
      setActivityBusy(false);
    }
  };

  const retreat = async () => {
    if (busy || state.pending.kind !== "none") return;
    if (!window.confirm("Retreat from this Hunt and return to HUB? Recovery is server-authoritative.")) return;
    setBusy(true); setError(null); setMessage(null);
    const intent = { huntId: active.huntId };
    try {
      const store = browserHuntCommandStore();
      const frozen = await store.begin(state.playerId, "retreat", intent);
      const result = await api.retreat(csrfToken, frozen.key, active.huntId);
      if (result.kind === "in_progress") {
        setMessage(`Retreat reconciliation reached ${result.logicalTimeMs} / ${result.targetLogicalTimeMs}. Continue only with the saved key.`);
        refresh();
        return;
      }
      if (!(await store.clear(state.playerId, frozen.key))) throw new Error("Completed Retreat correlation could not be cleared");
      setMessage("Retreat committed.");
      onNavigate("/hunt/result");
    } catch (cause) {
      if (cause instanceof HuntApiError && cause.status === 401) onSessionLost();
      else setError(readableError(cause));
    } finally { setBusy(false); }
  };

  const continueRetreat = async () => {
    if (state.pending.kind !== "resume" || state.pending.family !== "retreat" || busy) return;
    const intent = state.pending.intent;
    if (intent === null || typeof intent !== "object" || Array.isArray(intent)
      || (intent as Record<string, unknown>).huntId !== active.huntId) {
      setError("Stored Retreat intent does not match the current authoritative Hunt; reconcile before continuing.");
      return;
    }
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await api.retreat(csrfToken, state.pending.key, active.huntId);
      if (result.kind === "complete") {
        if (!(await browserHuntCommandStore().clear(state.playerId, state.pending.key))) throw new Error("Completed Retreat correlation could not be cleared");
        onNavigate("/hunt/result");
        return;
      }
      setMessage(`Saved Retreat continued through ${result.logicalTimeMs} / ${result.targetLogicalTimeMs}.`);
      refresh();
    } catch (cause) {
      if (cause instanceof HuntApiError && cause.status === 401) onSessionLost();
      else setError(readableError(cause));
    } finally { setBusy(false); }
  };

  return (
    <div className="hunt-surface">
      {message ? <p className="hunt-notice" role="status">{message}</p> : null}
      {error ? <p className="hunt-error" role="alert">{error}</p> : null}
      {syncMessage ? (
        <div className={syncPaused ? "state-card state-card--error" : "hunt-notice"} role="status">
          <span>{syncMessage}</span>
          {syncPaused ? (
            <button className="button button--secondary" type="button" onClick={() => {
              setSyncPaused(false);
              setSyncBlocking(true);
              setNextSyncAt(0);
              setSyncPulse((value) => value + 1);
            }}>Retry synchronization</button>
          ) : null}
        </div>
      ) : null}
      <PendingCommand pending={displayPending} onReconcile={() => void reconcile()}
        onContinue={state.pending.kind === "resume" && state.pending.family === "retreat" ? () => void continueRetreat() : undefined}
        continueLabel="Continue exact saved Retreat" />
      {state.hunt.legacyPendingManualCapture ? (
        <p className="hunt-error" role="alert">A legacy manual-capture boundary exists for this Hunt. Forward Card Mode intentionally exposes no Ball/skip controls; migration/compatibility authority is required before productive continuation.</p>
      ) : null}
      <section className="panel hunt-section">
        <div className="hunt-section__heading"><div><h2>{active.huntDefinitionId}</h2><p>{active.zoneId} · {formatHuntDuration(active.logicalTimeMs)}</p></div>
          <div className="hunt-actions"><button className="button button--secondary" type="button" disabled={syncBlocking} onClick={() => onNavigate("/settings/hunt")}>Automation policies</button>
            <button className="button" type="button" disabled={busy || syncBlocking || state.pending.kind !== "none"} onClick={() => void retreat()}>{busy ? "Retreating…" : "Retreat"}</button></div></div>
        <TeamCards members={active.team} />
        {active.currentEncounter ? (
          <article className="encounter-card"><strong>{active.currentEncounter.speciesId}{active.currentEncounter.shiny ? " · Shiny" : ""}</strong><span>Lv. {active.currentEncounter.level} · catch rate {active.currentEncounter.catchRate}</span></article>
        ) : <p className="hunt-note">No current Encounter is exposed at this committed boundary.</p>}
      </section>

      <section className="panel hunt-section" aria-labelledby="combat-presentation-title">
        <h2 id="combat-presentation-title">Combat Card</h2>
        <p className="hunt-note">The authenticated CombatPresentation HTTP feed is not enabled yet. Card Mode does not synthesize Battle events from Team HP, Encounter state or Hunt activity. The renderer is already compatible with immutable v1 and forward v2/CombatantRevived, but remains unmounted until genuine feed authority is exposed.</p>
      </section>

      <section className="panel hunt-section" aria-labelledby="activity-title">
        <div className="hunt-section__heading"><h2 id="activity-title">Hunt activity</h2><button className="button button--secondary" type="button" onClick={refresh}>Refresh</button></div>
        <ActivityList page={state.activity} />
        {state.activity?.nextCursor ? <button className="button button--secondary" type="button" disabled={activityBusy} onClick={() => void loadMoreActivity()}>{activityBusy ? "Loading…" : "Load more activity"}</button> : null}
      </section>
    </div>
  );
}

export function HuntResultPage({ api, onSessionLost, onNavigate }: {
  readonly api: HuntApi;
  readonly onSessionLost: () => void;
  readonly onNavigate: Navigate;
}) {
  const lastHuntId = useMemo(readLastHuntId, []);
  const [state, setState] = useState<{ status: "loading" } | { status: "ready"; hunt: HuntState; activity: HuntActivityPage | null } | { status: "error"; message: string }>({ status: "loading" });
  const [activityBusy, setActivityBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      api.state(controller.signal),
      lastHuntId ? api.activity(lastHuntId, undefined, controller.signal) : Promise.resolve(null),
    ]).then(([hunt, activity]) => {
      if (!controller.signal.aborted) setState({ status: "ready", hunt, activity });
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      if (cause instanceof HuntApiError && cause.status === 401) onSessionLost();
      else setState({ status: "error", message: readableError(cause) });
    });
    return () => controller.abort();
  }, [api, lastHuntId, onSessionLost]);

  if (state.status === "loading") return <LoadingState label="Loading Hunt return summary" />;
  if (state.status === "error") return <ErrorState title="Hunt result unavailable" message={state.message} />;
  if (state.hunt.activeHunt) return <EmptyState title="Hunt is still active" message="The server still reports an active Hunt; no terminal result is inferred." />;
  const loadMoreActivity = async () => {
    if (!lastHuntId || !state.activity?.nextCursor || activityBusy) return;
    setActivityBusy(true);
    try {
      const next = await api.activity(lastHuntId, state.activity.nextCursor);
      setState((current) => {
        if (current.status !== "ready" || current.activity === null) return current;
        const seen = new Set(current.activity.records.map(({ encounterOrdinal }) => encounterOrdinal));
        return {
          ...current,
          activity: {
            huntId: next.huntId,
            records: [...current.activity.records, ...next.records.filter(({ encounterOrdinal }) => !seen.has(encounterOrdinal))],
            nextCursor: next.nextCursor,
          },
        };
      });
    } catch (cause) {
      if (cause instanceof HuntApiError && cause.status === 401) onSessionLost();
      else setState({ status: "error", message: readableError(cause) });
    } finally {
      setActivityBusy(false);
    }
  };
  return (
    <div className="hunt-surface">
      <section className="panel hunt-section">
        <h2>Returned to HUB</h2>
        <p>Recovery anchor: {state.hunt.recoveryReadyAt ? formatHuntTimestamp(state.hunt.recoveryReadyAt) : "none"}</p>
        <p className="hunt-note">The current public read contracts do not expose a durable terminal reason. This page therefore reports only authoritative resolved Encounter activity and recovery; it does not guess whether exit was Retreat, defeat, or another terminal cause.</p>
        <button className="button" type="button" onClick={() => onNavigate("/hunt")}>Back to Hunt / PokéCenter</button>
      </section>
      <section className="panel hunt-section">
        <h2>Resolved activity</h2>
        <ActivityList page={state.activity} />
        {state.activity?.nextCursor ? <button className="button button--secondary" type="button" disabled={activityBusy} onClick={() => void loadMoreActivity()}>{activityBusy ? "Loading…" : "Load more activity"}</button> : null}
      </section>
    </div>
  );
}
