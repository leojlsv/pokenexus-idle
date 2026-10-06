import { useEffect, useMemo, useRef, useState } from "react";
import { ClientSessionProvider, useClientSession } from "./client-session";
import { EmptyState, ErrorState, LoadingState } from "./common-states";
import { HuntApi } from "./hunt-api";
import { ActiveHuntPage, HuntOverviewPage, HuntResultPage } from "./hunt-pages";
import { HuntSettingsPage } from "./hunt-settings";
import { InventoryPage } from "./inventory-page";
import { PlayerApi } from "./player-api";
import { CollectionPage, PokemonPage, TeamDetailPage, TeamsPage } from "./player-pages";
import { primaryNavigation, routeDocumentTitle, useBrowserRoute } from "./routing";
import type { AppRoute } from "./routing";
import { readRendererPreference, writeRendererPreference } from "./renderer-preference";
import type { RendererPreference } from "./renderer-preference";
import "./app.css";

type Navigate = (href: string) => void;
const defaultHuntApi = new HuntApi();
const defaultPlayerApi = new PlayerApi();
const ignoreSessionLoss = () => undefined;

function navigate(href: string): void {
  if (window.location.pathname === href) return;
  window.history.pushState(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function AppLink({ href, children, className, current }: {
  href: string;
  children: React.ReactNode;
  className?: string;
  current?: boolean;
}) {
  return (
    <a
      href={href}
      className={className}
      aria-current={current ? "page" : undefined}
      onClick={(event) => {
        if (
          event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
          event.defaultPrevented
        ) return;
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

function pageDescription(route: AppRoute): string {
  switch (route.id) {
    case "hunt": return "Choose a published Hunt and saved Team, or use HUB PokéCenter management.";
    case "hunt-active": return "Follow committed Hunt state and resolved activity without client-side combat simulation.";
    case "hunt-result": return "Review authoritative resolved Encounter activity after returning to HUB.";
    case "pokemon": return "Browse your owned Pokémon, then open their individual records.";
    case "pokemon-detail": return "Read server-owned Pokémon progression and current ordered Move configuration.";
    case "teams": return "Create and manage up to six saved Team presets.";
    case "team-detail": return "Edit the ordered roster of a saved Team using authoritative version checks.";
    case "inventory": return "Review authoritative owned item quantities.";
    case "settings": return "Presentation preferences on this page are stored only on this device.";
    case "hunt-settings": return "Manage server-authoritative Capture, Potion and Revive automation policies.";
    case "not-found": return "This application route does not exist.";
  }
}

function routeTitle(route: AppRoute): string {
  switch (route.id) {
    case "hunt": return "Hunt";
    case "hunt-active": return "Active Hunt";
    case "hunt-result": return "Hunt Result";
    case "pokemon": return "Pokémon";
    case "pokemon-detail": return "Pokémon Detail";
    case "teams": return "Teams";
    case "team-detail": return "Team Detail";
    case "inventory": return "Inventory";
    case "settings": return "Settings";
    case "hunt-settings": return "Hunt Settings";
    case "not-found": return "Page not found";
  }
}

function RouteView({
  route,
  preference,
  onPreferenceChange,
  onNavigate,
  api = defaultHuntApi,
  playerApi = defaultPlayerApi,
  csrfToken = "",
  onSessionLost = ignoreSessionLoss,
}: {
  route: AppRoute;
  preference: RendererPreference;
  onPreferenceChange: (preference: RendererPreference) => void;
  onNavigate: Navigate;
  api?: HuntApi;
  playerApi?: PlayerApi;
  csrfToken?: string;
  onSessionLost?: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = routeDocumentTitle(route);
    headingRef.current?.focus({ preventScroll: true });
  }, [route.key]);

  let routeContent: React.ReactNode = null;
  if (route.id === "hunt") {
    routeContent = <HuntOverviewPage api={api} csrfToken={csrfToken} onSessionLost={onSessionLost} onNavigate={onNavigate} />;
  } else if (route.id === "hunt-active") {
    routeContent = <ActiveHuntPage api={api} csrfToken={csrfToken} onSessionLost={onSessionLost} onNavigate={onNavigate} />;
  } else if (route.id === "hunt-result") {
    routeContent = <HuntResultPage api={api} onSessionLost={onSessionLost} onNavigate={onNavigate} />;
  } else if (route.id === "hunt-settings") {
    routeContent = <HuntSettingsPage api={api} csrfToken={csrfToken} onSessionLost={onSessionLost} />;
  } else if (route.id === "inventory") {
    routeContent = <InventoryPage api={api} onSessionLost={onSessionLost} onNavigate={onNavigate} />;
  } else if (route.id === "pokemon") {
    routeContent = <CollectionPage api={playerApi} csrfToken={csrfToken}
      onSessionLost={onSessionLost} onNavigate={onNavigate} />;
  } else if (route.id === "pokemon-detail") {
    routeContent = <PokemonPage key={route.key} api={playerApi} csrfToken={csrfToken}
      pokemonInstanceId={route.pokemonInstanceId} onSessionLost={onSessionLost} onNavigate={onNavigate} />;
  } else if (route.id === "teams") {
    routeContent = <TeamsPage api={playerApi} csrfToken={csrfToken}
      onSessionLost={onSessionLost} onNavigate={onNavigate} />;
  } else if (route.id === "team-detail") {
    routeContent = <TeamDetailPage key={route.key} api={playerApi} csrfToken={csrfToken}
      teamId={route.teamId} onSessionLost={onSessionLost} onNavigate={onNavigate} />;
  }

  return (
    <section className="page" aria-labelledby="page-title">
      <div className="page__header">
        <p className="page__eyebrow">PokeNexus</p>
        <h1 id="page-title" ref={headingRef} tabIndex={-1}>{routeTitle(route)}</h1>
        <p>{pageDescription(route)}</p>
      </div>

      {routeContent}

      {route.id === "settings" ? (
        <div className="panel" aria-labelledby="renderer-preference-title">
          <h2 id="renderer-preference-title">Combat presentation</h2>
          <p>Choose the preferred presentation for renderer-capable surfaces. This setting stays on this device.</p>
          <fieldset className="segmented-control">
            <legend>Preferred renderer</legend>
            {(["card", "visual"] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="renderer-preference"
                  value={value}
                  checked={preference === value}
                  onChange={() => onPreferenceChange(value)}
                />
                <span>{value === "card" ? "Card" : "Visual"}</span>
              </label>
            ))}
          </fieldset>
          <button className="button button--secondary" type="button" onClick={() => onNavigate("/settings/hunt")}>Hunt settings</button>
        </div>
      ) : null}

      {route.id === "not-found" ? (
        <button className="button" type="button" onClick={() => onNavigate("/hunt")}>Go to Hunt</button>
      ) : routeContent || route.id === "settings" ? null : (
        <EmptyState title="Area unavailable" message="This destination has no content in the current client version." />
      )}
    </section>
  );
}

export function AppShell({
  route,
  preference,
  onPreferenceChange,
  onNavigate = navigate,
  api,
  playerApi,
  csrfToken,
  onSessionLost,
}: {
  route: AppRoute;
  preference: RendererPreference;
  onPreferenceChange: (preference: RendererPreference) => void;
  onNavigate?: Navigate;
  api?: HuntApi;
  playerApi?: PlayerApi;
  csrfToken?: string;
  onSessionLost?: () => void;
}) {
  const primaryId = route.id === "hunt-settings" ? null : route.id.startsWith("hunt") ? "hunt" : route.id.startsWith("pokemon")
    ? "pokemon" : route.id.startsWith("team") ? "teams" : route.id;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="topbar">
        <AppLink href="/hunt" className="brand">PokeNexus</AppLink>
        <div className="topbar__meta" aria-label="Application status">
          <span>Session active</span>
          <AppLink href="/settings" current={route.id === "settings" || route.id === "hunt-settings"}>Settings</AppLink>
        </div>
      </header>

      <nav className="primary-nav" aria-label="Primary navigation">
        {primaryNavigation.map((item) => (
          <AppLink key={item.id} href={item.href} current={primaryId === item.id}>
            {item.label}
          </AppLink>
        ))}
      </nav>

      <main id="main-content" className="main-content" tabIndex={-1}>
        <RouteView route={route} preference={preference} onPreferenceChange={onPreferenceChange} onNavigate={onNavigate}
          api={api} playerApi={playerApi} csrfToken={csrfToken} onSessionLost={onSessionLost} />
      </main>
    </div>
  );
}

function AuthenticatedApp({ csrfToken, onSessionLost }: { readonly csrfToken: string; readonly onSessionLost: () => void }) {
  const route = useBrowserRoute();
  const api = useMemo(() => new HuntApi(), []);
  const playerApi = useMemo(() => new PlayerApi(), []);
  const [preference, setPreference] = useState<RendererPreference>(() => readRendererPreference());

  const updatePreference = (next: RendererPreference) => {
    setPreference(next);
    writeRendererPreference(next);
  };

  return <AppShell route={route} preference={preference} onPreferenceChange={updatePreference}
    api={api} playerApi={playerApi} csrfToken={csrfToken} onSessionLost={onSessionLost} />;
}

function SessionBoundary() {
  const session = useClientSession();

  if (session.status === "loading") {
    return <main className="standalone-state"><LoadingState label="Checking session" /></main>;
  }
  if (session.status === "error") {
    return (
      <main className="standalone-state">
        <ErrorState title="Unable to check your session" message="Retry the session check." onRetry={session.retry} />
      </main>
    );
  }
  if (session.status === "unauthenticated") {
    return (
      <main className="standalone-state">
        <ErrorState title="Sign in required" message="Your session is no longer active." />
      </main>
    );
  }
  return <AuthenticatedApp csrfToken={session.csrfToken} onSessionLost={session.retry} />;
}

export function App() {
  return (
    <ClientSessionProvider>
      <SessionBoundary />
    </ClientSessionProvider>
  );
}
