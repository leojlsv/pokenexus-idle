import { useEffect, useRef, useState } from "react";
import { ClientSessionProvider, useClientSession } from "./client-session";
import { EmptyState, ErrorState, LoadingState } from "./common-states";
import { primaryNavigation, routeDocumentTitle, useBrowserRoute } from "./routing";
import type { AppRoute } from "./routing";
import { readRendererPreference, writeRendererPreference } from "./renderer-preference";
import type { RendererPreference } from "./renderer-preference";
import "./app.css";

type Navigate = (href: string) => void;

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
    case "hunt": return "Choose a Zone and Hunt from authoritative game data.";
    case "hunt-active": return "Your active Hunt is reconstructed from authoritative Hunt state.";
    case "hunt-result": return "Completed Hunt results appear here when a result is available.";
    case "pokemon": return "Browse your owned Pokémon when the management surface is available.";
    case "pokemon-detail": return "Pokémon detail and configuration are opened by stable instance identity.";
    case "teams": return "Saved Team management is available from this destination.";
    case "team-detail": return "A saved Team is addressed by its stable Team identity.";
    case "inventory": return "Review authoritative owned item quantities.";
    case "settings": return "Presentation preferences on this page are stored only on this device.";
    case "hunt-settings": return "Hunt automation settings use authoritative server state when implemented.";
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

function RouteView({ route, preference, onPreferenceChange, onNavigate }: {
  route: AppRoute;
  preference: RendererPreference;
  onPreferenceChange: (preference: RendererPreference) => void;
  onNavigate: Navigate;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = routeDocumentTitle(route);
    headingRef.current?.focus({ preventScroll: true });
  }, [route.key]);

  return (
    <section className="page" aria-labelledby="page-title">
      <div className="page__header">
        <p className="page__eyebrow">PokeNexus</p>
        <h1 id="page-title" ref={headingRef} tabIndex={-1}>{routeTitle(route)}</h1>
        <p>{pageDescription(route)}</p>
      </div>

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
      ) : (
        <EmptyState title="Area unavailable" message="This destination has no content in the current client version." />
      )}
    </section>
  );
}

export function AppShell({ route, preference, onPreferenceChange, onNavigate = navigate }: {
  route: AppRoute;
  preference: RendererPreference;
  onPreferenceChange: (preference: RendererPreference) => void;
  onNavigate?: Navigate;
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
        <RouteView route={route} preference={preference} onPreferenceChange={onPreferenceChange} onNavigate={onNavigate} />
      </main>
    </div>
  );
}

function AuthenticatedApp() {
  const route = useBrowserRoute();
  const [preference, setPreference] = useState<RendererPreference>(() => readRendererPreference());

  const updatePreference = (next: RendererPreference) => {
    setPreference(next);
    writeRendererPreference(next);
  };

  return <AppShell route={route} preference={preference} onPreferenceChange={updatePreference} />;
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
  return <AuthenticatedApp />;
}

export function App() {
  return (
    <ClientSessionProvider>
      <SessionBoundary />
    </ClientSessionProvider>
  );
}
