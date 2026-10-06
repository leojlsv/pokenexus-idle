import { useEffect, useRef, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "./common-states";
import { browserTeamCreateIntentStore, type TeamCreateIntentState } from "./team-create-intent";
import {
  PlayerApi,
  PlayerApiError,
  playerErrorText,
  type CollectionPokemon,
  type SavedTeam,
} from "./player-api";
import {
  isPlayerSessionLost,
  readTeamReconciliation,
  requiresMutationReconciliation,
  runTeamCreateAttempt,
  teamStaleReconciliationCopy,
  teamFocusTarget,
} from "./player-orchestration";
import {
  addRosterMember,
  removeRosterMember,
  reorderRosterMember,
  usePlayerPages,
  usePlayerResource,
} from "./player-state";
import "./player-pages.css";

export interface PlayerPageProps {
  readonly api: PlayerApi;
  readonly csrfToken: string;
  readonly onSessionLost: () => void;
  readonly onNavigate: (href: string) => void;
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function Failure({ error, onRetry, onSessionLost }: {
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly onSessionLost: () => void;
}) {
  if (isPlayerSessionLost(error)) {
    return <ErrorState title="Session expired" message="Your account session must be renewed." onRetry={onSessionLost} />;
  }
  return <ErrorState title="Unable to load player data" message={playerErrorText(error)} onRetry={onRetry} />;
}

function ProfileSetup({ api, csrfToken, onSessionLost, onCreated }: {
  readonly api: PlayerApi;
  readonly csrfToken: string;
  readonly onSessionLost: () => void;
  readonly onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.createProfile(csrfToken);
      onCreated();
    } catch (failure) {
      if (isPlayerSessionLost(failure)) onSessionLost();
      setError(playerErrorText(failure));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return <section className="panel" aria-labelledby="profile-setup-title">
    <h2 id="profile-setup-title">Set up your Player profile</h2>
    <p>This account does not yet have an initialized Player profile. Create it to view your Collection and Teams.</p>
    {error ? <p role="alert" className="player-error">{error}</p> : null}
    <button className="button" type="button" disabled={busy || !csrfToken} onClick={() => void create()}>
      {busy ? "Creating profile…" : "Create Player profile"}
    </button>
  </section>;
}

function PageControls({ loading, more, onMore, error }: {
  readonly loading: boolean;
  readonly more: boolean;
  readonly onMore: () => void;
  readonly error: unknown | null;
}) {
  const [wasVisible, setWasVisible] = useState(more || error !== null);
  useEffect(() => {
    if (more || error !== null) setWasVisible(true);
  }, [more, error]);
  if (!wasVisible && !more && !error) return null;
  return <div className="player-page-controls">
    {error ? <p className="player-error" role="alert">{playerErrorText(error)}</p> : null}
    <button className="button button--secondary" type="button" aria-disabled={!more || loading}
      onClick={() => { if (!loading && more) onMore(); }}>
      {loading ? "Loading more…" : !more ? "All items loaded" : error ? "Retry this page" : "Load more"}
    </button>
  </div>;
}

export function CollectionPage({ api, csrfToken, onSessionLost, onNavigate }: PlayerPageProps) {
  const { state, reload, loadMore } = usePlayerPages(
    "collection", (cursor, signal) => api.collection(cursor, signal),
    (pokemon) => pokemon.pokemonInstanceId, onSessionLost,
  );
  if (state.status === "loading") return <LoadingState label="Loading Collection" />;
  if (state.status === "error") {
    return state.error instanceof PlayerApiError && state.error.code === "not_found"
      ? <ProfileSetup api={api} csrfToken={csrfToken} onSessionLost={onSessionLost} onCreated={reload} />
      : <Failure error={state.error} onRetry={reload} onSessionLost={onSessionLost} />;
  }
  return <section className="player-surface" aria-labelledby="collection-list-title">
    <div className="player-toolbar">
      <h2 id="collection-list-title">Owned Pokémon</h2>
      <button className="button button--secondary" type="button" aria-disabled={state.refreshPending}
        onClick={() => { if (!state.refreshPending) reload(); }}>
        {state.refreshPending ? "Refreshing…" : "Refresh"}
      </button>
    </div>
    {state.refreshPending ? <p role="status" className="player-note">Refreshing Collection; previous data remains visible.</p> : null}
    {state.refreshError ? <p role="alert" className="player-error">Refresh failed; previous data may be stale. {playerErrorText(state.refreshError)}</p> : null}
    {state.items.length === 0
      ? <EmptyState title="Collection empty" message="No owned Pokémon have been recorded yet." />
      : <ul className="player-card-grid" aria-label="Owned Pokémon">
        {state.items.map((pokemon) => <li className="player-tile" key={pokemon.pokemonInstanceId}>
          <strong>{pokemon.speciesId}</strong>
          <span>Level {pokemon.level}</span>
          <small title={pokemon.pokemonInstanceId}>Instance {shortId(pokemon.pokemonInstanceId)}</small>
          <button className="button button--secondary" type="button"
            aria-label={`View Pokémon ${pokemon.speciesId}, instance ${pokemon.pokemonInstanceId}`}
            onClick={() => onNavigate(`/pokemon/${encodeURIComponent(pokemon.pokemonInstanceId)}`)}>
            View Pokémon
          </button>
        </li>)}
      </ul>}
    <PageControls loading={state.morePending} more={state.nextCursor !== null} error={state.moreError}
      onMore={() => void loadMore()} />
    <p className="player-note">Collection order is a paging detail, not Team priority or combat order.</p>
  </section>;
}

const IV_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

export function PokemonPage({ api, pokemonInstanceId, onSessionLost, onNavigate }: PlayerPageProps & {
  readonly pokemonInstanceId: string;
}) {
  const detail = usePlayerResource(`pokemon:${pokemonInstanceId}`,
    (signal) => api.pokemon(pokemonInstanceId, signal), onSessionLost);
  const progression = usePlayerResource(`pokemon:progression:${pokemonInstanceId}`,
    (signal) => api.progression(pokemonInstanceId, signal), onSessionLost);

  if (detail.state.status === "loading") return <LoadingState label="Loading Pokémon" />;
  if (detail.state.status === "error") return <Failure error={detail.state.error}
    onRetry={detail.reload} onSessionLost={onSessionLost} />;
  const pokemon = detail.state.value;
  const progressionCurrent = progression.state.status === "ready" &&
    progression.state.value.pokemonInstanceId === pokemon.pokemonInstanceId &&
    progression.state.value.rowVersion === pokemon.rowVersion &&
    progression.state.value.level === pokemon.level;
  const refreshPending = detail.state.refreshPending ||
    (progression.state.status === "ready" && progression.state.refreshPending);
  return <section className="player-surface" aria-labelledby="pokemon-aggregate-title">
    <button className="button button--secondary" type="button" onClick={() => onNavigate("/pokemon")}>Back to Collection</button>
    <article className="panel player-detail">
      <div className="player-toolbar">
        <h2 id="pokemon-aggregate-title">{pokemon.speciesId}</h2>
        <button className="button button--secondary" type="button" aria-disabled={refreshPending}
          onClick={() => {
            if (refreshPending) return;
            detail.reload();
            progression.reload();
          }}>{refreshPending ? "Refreshing…" : "Refresh"}</button>
      </div>
      {refreshPending ? <p role="status" className="player-note">Refreshing Pokémon details; previous authoritative data remains visible.</p> : null}
      {detail.state.refreshError ? <p role="alert" className="player-error">Pokémon detail refresh failed; previous data may be stale. {playerErrorText(detail.state.refreshError)}</p> : null}
      {progression.state.status === "ready" && progression.state.refreshError ? <p role="alert" className="player-error">Progression refresh failed; previous experience data may be stale. {playerErrorText(progression.state.refreshError)}</p> : null}
      <p>Level {pokemon.level} · Instance {pokemon.pokemonInstanceId}</p>
      <dl className="player-facts">
        <div><dt>Selected Ability</dt><dd>{pokemon.selectedAbilityId ?? "None selected"}</dd></div>
        <div><dt>Configuration version</dt><dd>{pokemon.rowVersion}</dd></div>
        <div><dt>Total experience</dt><dd>{progression.state.status === "loading" ? "Loading…"
          : progression.state.status === "ready" && progressionCurrent ? progression.state.value.totalExperience
          : progression.state.status === "error" ? "Unavailable" : "Updated on server"}</dd></div>
      </dl>
      {progression.state.status === "ready" && !refreshPending && !progressionCurrent ? <p role="status" className="player-error">
        Pokémon progression changed between the two reads. Refresh the detail and progression to compare one version.
      </p> : null}
      {progression.state.status === "error" ? <Failure error={progression.state.error}
        onRetry={progression.reload} onSessionLost={onSessionLost} /> : null}
      <section className="player-section" aria-labelledby="iv-title">
        <h3 id="iv-title">Individual values</h3>
        <dl className="player-ivs">{IV_KEYS.map((key) => <div key={key}>
          <dt>{key.toUpperCase()}</dt><dd>{pokemon.ivs[key]}</dd>
        </div>)}</dl>
      </section>
      <section className="player-section" aria-labelledby="loadout-title">
        <h3 id="loadout-title">Saved Move order</h3>
        {pokemon.moveLoadout.state === "selected" && pokemon.moveLoadout.moveIds.length > 0
          ? <ol className="player-moves">{pokemon.moveLoadout.moveIds.map((moveId) => <li key={moveId}>{moveId}</li>)}</ol>
          : <p>No initialized Move loadout.</p>}
        <p className="player-note" role="status">Move editing awaits the server's public eligible-Move read. Current
          eligibility is not inferred from level or from your saved Moves; the selected order remains read-only.</p>
      </section>
    </article>
  </section>;
}

export function TeamsPage({ api, csrfToken, onSessionLost, onNavigate }: PlayerPageProps) {
  const { state, reload, loadMore } = usePlayerPages(
    "teams", async (cursor, signal) => {
      const page = await api.teams(cursor, signal);
      return { ...page, items: page.teams };
    },
    (team) => team.teamId, onSessionLost,
  );
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<TeamCreateIntentState | { kind: "loading" }>({ kind: "loading" });
  const inFlight = useRef(false);
  const currentSessionToken = useRef(csrfToken);
  currentSessionToken.current = csrfToken;
  const mounted = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    let live = true;
    setIntent({ kind: "loading" });
    if (csrfToken) {
      void (async () => {
        try {
          const result = await browserTeamCreateIntentStore().inspect(csrfToken);
          if (live) setIntent(result);
        } catch {
          if (live) setIntent({ kind: "unavailable" });
        }
      })();
    }
    return () => {
      live = false;
      mounted.current = false;
    };
  }, [csrfToken]);

  const create = async () => {
    if (inFlight.current || !csrfToken || (intent.kind !== "none" && intent.kind !== "resume")) return;
    inFlight.current = true;
    const submittedSessionToken = csrfToken;
    setError(null);
    setBusy(true);
    try {
      const attempt = await runTeamCreateAttempt(
        api,
        browserTeamCreateIntentStore(),
        csrfToken,
        (key) => {
          if (mounted.current && currentSessionToken.current === submittedSessionToken) {
            setIntent({ kind: "resume", key });
          }
        },
      );
      if (!mounted.current || currentSessionToken.current !== submittedSessionToken) return;
      if (attempt.cleared) setIntent({ kind: "none" });
      if (attempt.kind === "accepted") {
        onNavigate(`/teams/${encodeURIComponent(attempt.result.teamId)}`);
      } else {
        if (isPlayerSessionLost(attempt.failure)) onSessionLost();
        setError(playerErrorText(attempt.failure));
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (state.status === "loading") return <LoadingState label="Loading Teams" />;
  if (state.status === "error") {
    return state.error instanceof PlayerApiError && state.error.code === "not_found"
      ? <ProfileSetup api={api} csrfToken={csrfToken} onSessionLost={onSessionLost} onCreated={reload} />
      : <Failure error={state.error} onRetry={reload} onSessionLost={onSessionLost} />;
  }
  return <section className="player-surface" aria-labelledby="teams-title">
    <div className="player-toolbar">
      <div>
        <h2 id="teams-title">Saved Teams</h2>
        <p>{state.items.length} loaded · maximum {state.teamLimit ?? 6} live saved presets</p>
      </div>
      <button className="button button--secondary" type="button" aria-disabled={state.refreshPending}
        onClick={() => { if (!state.refreshPending) reload(); }}>
        {state.refreshPending ? "Refreshing…" : "Refresh"}
      </button>
    </div>
    {state.refreshPending ? <p role="status" className="player-note">Refreshing Teams; previous data remains visible.</p> : null}
    {state.refreshError ? <p role="alert" className="player-error">Refresh failed; previous data may be stale. {playerErrorText(state.refreshError)}</p> : null}
    <div className="player-actions">
      <button className="button" type="button" disabled={busy || !csrfToken || intent.kind === "loading" ||
        intent.kind === "unavailable" || intent.kind === "different_session" ||
        (intent.kind === "none" && state.items.length >= (state.teamLimit ?? 6))}
        onClick={() => void create()}>
        {busy ? "Submitting…" : intent.kind === "loading" ? "Checking Team creation…" :
          intent.kind === "resume" ? "Retry same Team creation" : "Create Team"}
      </button>
      {intent.kind === "resume" ? <p className="player-note">An earlier Team-create response was uncertain. Retrying
        uses the same command identity; inspect your Teams before starting a new creation.</p> : null}
      {intent.kind === "unavailable" ? <p className="player-error" role="alert">
        Your browser cannot safely recover pending Team creation. Check session storage and reload; no new Team command will be sent.
      </p> : null}
      {intent.kind === "different_session" ? <div className="player-conflict">
        <p role="alert">A pending Team creation belongs to a different session. Review saved Teams in this account before starting a new creation.</p>
        <button type="button" className="button button--secondary" onClick={() => {
          if (!window.confirm("Have you reviewed your saved Teams and understood that a prior session's Team creation may have succeeded?")) return;
          void browserTeamCreateIntentStore().discardDifferentSession().then((cleared) => {
            if (cleared) setIntent({ kind: "none" });
            else setIntent({ kind: "unavailable" });
          });
        }}>Discard prior-session command identity</button>
      </div> : null}
      {error ? <p role="alert" className="player-error">{error}</p> : null}
    </div>
    {state.items.length === 0
      ? <EmptyState title="No saved Teams" message="Create a saved roster to organize up to six owned Pokémon." />
      : <ul className="player-card-grid" aria-label="Saved Teams">
        {state.items.map((team) => <li className="player-tile" key={team.teamId}>
          <strong>Team {shortId(team.teamId)}</strong>
          <small title={team.teamId}>Version {team.rowVersion}</small>
          <button className="button button--secondary" type="button"
            aria-label={`Edit saved Team ${team.teamId} roster`}
            onClick={() => onNavigate(`/teams/${encodeURIComponent(team.teamId)}`)}>
            Edit roster
          </button>
        </li>)}
      </ul>}
    <PageControls loading={state.morePending} more={state.nextCursor !== null} error={state.moreError}
      onMore={() => void loadMore()} />
    <p className="player-note">Saved Teams are presets, not a running Hunt's pinned Team snapshot.
      Team list order has no gameplay priority.</p>
  </section>;
}

export function TeamDetailPage({ api, teamId, csrfToken, onSessionLost, onNavigate }: PlayerPageProps & {
  readonly teamId: string;
}) {
  const detail = usePlayerResource(`team:${teamId}`,
    (signal) => api.team(teamId, signal), onSessionLost);
  const collection = usePlayerPages(`team-roster:collection:${teamId}`,
    (cursor, signal) => api.collection(cursor, signal),
    (pokemon) => pokemon.pokemonInstanceId, onSessionLost);
  const [authoritative, setAuthoritative] = useState<SavedTeam | null>(null);
  const [draft, setDraft] = useState<readonly string[]>([]);
  const [candidate, setCandidate] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const currentSessionToken = useRef(csrfToken);
  currentSessionToken.current = csrfToken;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState<SavedTeam | null>(null);
  const [needsReconcile, setNeedsReconcile] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const conflictFocus = useRef<HTMLDivElement>(null);
  const errorFocus = useRef<HTMLParagraphElement>(null);
  const unavailableFocus = useRef<HTMLButtonElement>(null);
  const serverCheckFocus = useRef<HTMLButtonElement>(null);
  const saveFocus = useRef<HTMLButtonElement>(null);
  const focusAfterChoice = useRef<"save" | "check" | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const target = teamFocusTarget({
      unavailable,
      hasConflict: conflict !== null,
      needsReconcile,
      hasError: error !== null,
      afterChoice: focusAfterChoice.current,
    });
    if (target === "unavailable") unavailableFocus.current?.focus();
    else if (target === "conflict") conflictFocus.current?.focus({ preventScroll: false });
    else if (target === "error") errorFocus.current?.focus({ preventScroll: false });
    else if (target === "save") saveFocus.current?.focus();
    else if (target === "check") serverCheckFocus.current?.focus();
    if (target === "save" || target === "check") focusAfterChoice.current = null;
  }, [conflict, needsReconcile, error, unavailable]);

  useEffect(() => {
    if (detail.state.status !== "ready") return;
    setAuthoritative(detail.state.value);
    setDraft(detail.state.value.pokemonInstanceIds);
    setConflict(null);
    setNeedsReconcile(false);
    setUnavailable(false);
    setError(null);
  }, [detail.state]);

  const refreshOnConflict = async (action: "save" | "delete") => {
    setNeedsReconcile(true);
    const sessionToken = csrfToken;
    try {
      const reconciliation = await readTeamReconciliation(api, teamId, draft);
      if (!mounted.current || currentSessionToken.current !== sessionToken) return;
      const latest = reconciliation.latest;
      if (reconciliation.kind === "matched") {
        setAuthoritative(latest);
        setDraft(latest.pokemonInstanceIds);
        setConflict(null);
        setNeedsReconcile(false);
        setError(null);
        setNotice(teamStaleReconciliationCopy(action, "matched"));
        return;
      }
      setConflict(latest);
      setError(teamStaleReconciliationCopy(action, "conflict"));
    } catch (failure) {
      if (!mounted.current || currentSessionToken.current !== sessionToken) return;
      if (isPlayerSessionLost(failure)) onSessionLost();
      if (failure instanceof PlayerApiError && failure.code === "not_found") {
        setUnavailable(true);
        setError("This saved Team is no longer accessible. Return to the Teams list to see the current state.");
        return;
      }
      setError(playerErrorText(failure));
    }
  };

  const save = async () => {
    if (!authoritative || inFlight.current || needsReconcile || unavailable || conflict || !csrfToken) return;
    inFlight.current = true;
    const sessionToken = csrfToken;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await api.replaceRoster(teamId, csrfToken, authoritative.rowVersion, draft);
      if (!mounted.current || currentSessionToken.current !== sessionToken) return;
      setAuthoritative(saved);
      setDraft(saved.pokemonInstanceIds);
      setNotice("Saved roster confirmed by the server.");
    } catch (failure) {
      if (!mounted.current || currentSessionToken.current !== sessionToken) return;
      if (isPlayerSessionLost(failure)) onSessionLost();
      if (failure instanceof PlayerApiError && failure.code === "stale") {
        await refreshOnConflict("save");
      } else if (failure instanceof PlayerApiError && failure.code === "not_found") {
        setUnavailable(true);
        setError("This Team is no longer accessible. Open the Teams list to reconcile.");
      } else if (requiresMutationReconciliation(failure)) {
        setNeedsReconcile(true);
        setError("The save result is uncertain. Check the server roster before another mutation.");
      } else {
        setError(playerErrorText(failure));
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const remove = (index: number) => { setDraft((previous) => removeRosterMember(previous, index)); setNotice(null); };
  const move = (index: number, step: -1 | 1) => { setDraft((previous) => reorderRosterMember(previous, index, step)); setNotice(null); };

  const removeTeam = async () => {
    if (!authoritative || inFlight.current || needsReconcile || unavailable || conflict || !csrfToken ||
      !window.confirm("Delete this saved Team? Owned Pokémon will remain in your Collection.")) return;
    inFlight.current = true;
    const sessionToken = csrfToken;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.deleteTeam(teamId, csrfToken, authoritative.rowVersion);
      if (!mounted.current || currentSessionToken.current !== sessionToken) return;
      onNavigate("/teams");
    } catch (failure) {
      if (!mounted.current || currentSessionToken.current !== sessionToken) return;
      if (isPlayerSessionLost(failure)) onSessionLost();
      if (failure instanceof PlayerApiError && failure.code === "stale") await refreshOnConflict("delete");
      else if (failure instanceof PlayerApiError && failure.code === "not_found") {
        setUnavailable(true);
        setError("The Team is no longer accessible. Return to the Teams list to reconcile.");
      } else if (requiresMutationReconciliation(failure)) {
        setNeedsReconcile(true);
        setError("Deletion may have reached the server. Check the Team's current state before further actions.");
      }
      else setError(playerErrorText(failure));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const reconcile = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const sessionToken = csrfToken;
    setBusy(true);
    try {
      const reconciliation = await readTeamReconciliation(api, teamId, draft);
      if (!mounted.current || currentSessionToken.current !== sessionToken) return;
      const latest = reconciliation.latest;
      if (reconciliation.kind === "matched") {
        setAuthoritative(latest);
        setDraft(latest.pokemonInstanceIds);
        setConflict(null);
        setNeedsReconcile(false);
        setError(null);
        setNotice("The server already contains this roster.");
      } else {
        setNeedsReconcile(true);
        setConflict(latest);
        setError("Server and local roster differ. Choose a reconciliation option before a new save or delete.");
      }
    } catch (failure) {
      if (!mounted.current || currentSessionToken.current !== sessionToken) return;
      if (isPlayerSessionLost(failure)) onSessionLost();
      if (failure instanceof PlayerApiError && failure.code === "not_found") {
        setUnavailable(true);
        setNeedsReconcile(true);
        setError("This Team is no longer accessible. The roster cannot be edited; return to the Teams list.");
        return;
      }
      setNeedsReconcile(true);
      setError(playerErrorText(failure));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (detail.state.status === "loading" || (detail.state.status === "ready" && authoritative === null)) {
    return <LoadingState label="Loading saved Team" />;
  }
  if (detail.state.status === "error") return <Failure error={detail.state.error} onRetry={detail.reload} onSessionLost={onSessionLost} />;
  if (!authoritative) return <LoadingState label="Loading saved Team" />;
  if (unavailable) return <section className="player-surface">
    <button ref={unavailableFocus} className="button button--secondary" type="button"
      onClick={() => onNavigate("/teams")}>Return to saved Teams</button>
    <ErrorState title="Team unavailable" message="This Team no longer exists or is no longer accessible from this account. No further changes will be submitted." />
  </section>;

  const knownMembers = collection.state.status === "ready"
    ? new Map(collection.state.items.map((pokemon) => [pokemon.pokemonInstanceId, pokemon] as const))
    : new Map<string, CollectionPokemon>();
  const changed = draft.length !== authoritative.pokemonInstanceIds.length ||
    draft.some((id, index) => id !== authoritative.pokemonInstanceIds[index]);
  const eligibleToAdd = collection.state.status === "ready"
    ? collection.state.items.filter((pokemon) => !draft.includes(pokemon.pokemonInstanceId)) : [];
  const labeledRoster = (ids: readonly string[]) => ids.length > 0
    ? <ol className="player-compare-list">{ids.map((id, index) => <li key={id} title={id}>
      <strong>{index + 1}. {knownMembers.get(id)?.speciesId ?? `Pokémon ${shortId(id)}`}</strong>
      <small>Instance {shortId(id)}</small>
    </li>)}</ol>
    : <p>Empty roster</p>;

  return <section className="player-surface" aria-labelledby="team-roster-title">
    <button className="button button--secondary" type="button" onClick={() => onNavigate("/teams")}>Back to Teams</button>
    <section className="panel player-detail">
      <div className="player-toolbar">
        <div><h2 id="team-roster-title">Saved Team</h2><p title={teamId}>ID {shortId(teamId)} · Version {authoritative.rowVersion}</p></div>
        <button ref={serverCheckFocus} className="button button--secondary" type="button" disabled={busy}
          onClick={() => void reconcile()}>Check server roster</button>
      </div>
      <p className="player-note">Roster order is saved as preference. Changing this Team does not alter any ongoing Hunt's pinned snapshot.</p>
      {error ? <p ref={errorFocus} tabIndex={-1} role="alert" className="player-error">{error}</p> : null}
      {notice ? <p role="status" className="player-notice">{notice}</p> : null}
      {conflict ? <div ref={conflictFocus} tabIndex={-1} className="player-conflict" role="group" aria-label="Team version conflict">
        <strong>Current server version: {conflict.rowVersion}</strong>
        <div className="player-compare-columns">
          <section aria-label="Current server roster"><h3>Server roster</h3>{labeledRoster(conflict.pokemonInstanceIds)}</section>
          <section aria-label="Your unsaved draft"><h3>Your draft</h3>{labeledRoster(draft)}</section>
        </div>
        <div className="player-actions">
          <button className="button button--secondary" type="button" onClick={() => {
            setAuthoritative(conflict);
            setDraft(conflict.pokemonInstanceIds);
            setConflict(null);
            setNeedsReconcile(false);
            setError(null);
            focusAfterChoice.current = "check";
            setNotice("Discarded the local draft; server roster loaded.");
          }}>Use server roster</button>
          <button className="button" type="button" onClick={() => {
            setAuthoritative(conflict);
            setConflict(null);
            setNeedsReconcile(false);
            setError(null);
            focusAfterChoice.current = "save";
            setNotice("Your draft is preserved against the current version. Review and explicitly save again.");
          }}>Keep draft for review</button>
        </div>
      </div> : null}
      <div className="player-section">
        <div className="player-toolbar"><h3>Roster ({draft.length}/6)</h3><span>{changed ? "Unsaved changes" : "Matches loaded version"}</span></div>
        {draft.length === 0 ? <EmptyState title="Roster empty" message="Choose a Pokémon from your Collection below." /> :
          <ol className="roster-list">{draft.map((id, index) => <li className="roster-row" key={id}>
            <div className="roster-identity">
              <strong>{knownMembers.get(id)?.speciesId ?? `Pokémon ${shortId(id)}`}</strong>
              <small title={id}>Slot {index + 1} · {knownMembers.get(id)?.level === undefined
                ? "Detail available in Collection" : `Level ${knownMembers.get(id)?.level}`}</small>
            </div>
            <div className="roster-buttons">
              <button className="button button--secondary" type="button" disabled={busy || index === 0 || conflict !== null || needsReconcile}
                aria-label={`Move slot ${index + 1} up`} onClick={() => move(index, -1)}>↑</button>
              <button className="button button--secondary" type="button" disabled={busy || index === draft.length - 1 || conflict !== null || needsReconcile}
                aria-label={`Move slot ${index + 1} down`} onClick={() => move(index, 1)}>↓</button>
              <button className="button button--secondary" type="button" disabled={busy || conflict !== null || needsReconcile}
                aria-label={`Remove slot ${index + 1}`} onClick={() => remove(index)}>Remove</button>
            </div>
          </li>)}</ol>}
      </div>
      <div className="player-section" aria-labelledby="team-add-title">
        <h3 id="team-add-title">Add a Collection member</h3>
        {collection.state.status === "loading" ? <LoadingState label="Loading owned Pokémon" /> : null}
        {collection.state.status === "error" ? <Failure error={collection.state.error}
          onRetry={collection.reload} onSessionLost={onSessionLost} /> : null}
        {collection.state.status === "ready" ? <>
          <div className="player-picker">
            <label htmlFor="roster-new-member">Owned Pokémon</label>
            <select id="roster-new-member" value={candidate} disabled={busy || conflict !== null || needsReconcile || draft.length >= 6}
              onChange={(event) => setCandidate(event.target.value)}>
              <option value="">Choose a Pokémon</option>
              {eligibleToAdd.map((pokemon) => <option value={pokemon.pokemonInstanceId} key={pokemon.pokemonInstanceId}>
                {pokemon.speciesId} · Lv {pokemon.level} · {shortId(pokemon.pokemonInstanceId)}
              </option>)}
            </select>
            <button className="button button--secondary" type="button"
              aria-disabled={!candidate || busy || conflict !== null || needsReconcile || draft.length >= 6 || !eligibleToAdd.some((pokemon) => pokemon.pokemonInstanceId === candidate)}
              onClick={() => {
                if (!candidate || busy || conflict !== null || needsReconcile || draft.length >= 6 ||
                  !eligibleToAdd.some((pokemon) => pokemon.pokemonInstanceId === candidate)) return;
                setDraft((previous) => addRosterMember(previous, candidate));
                setCandidate("");
                setNotice(null);
              }}>
              Add member
            </button>
          </div>
          <PageControls loading={collection.state.morePending} more={collection.state.nextCursor !== null}
            error={collection.state.moreError} onMore={() => void collection.loadMore()} />
        </> : null}
      </div>
      <div className="player-actions">
        <button ref={saveFocus} className="button" type="button"
          aria-disabled={busy || conflict !== null || needsReconcile || !changed || !csrfToken}
          onClick={() => {
            if (busy || conflict !== null || needsReconcile || !changed || !csrfToken) return;
            void save();
          }}>{busy ? "Working…" : "Save roster"}</button>
        <button className="button button--secondary" type="button" disabled={busy || conflict !== null || needsReconcile}
          onClick={() => { setDraft(authoritative.pokemonInstanceIds); setNotice(null); setError(null); }}>Discard draft</button>
        <button className="button button--danger" type="button" disabled={busy || conflict !== null || needsReconcile || !csrfToken}
          onClick={() => void removeTeam()}>Delete Team</button>
      </div>
    </section>
  </section>;
}
