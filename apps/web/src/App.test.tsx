import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell } from "./App";
import { routeForPath } from "./routing";

describe("App shell", () => {
  it("renders the four primary destinations and marks the active destination", () => {
    const html = renderToStaticMarkup(
      <AppShell
        route={routeForPath("/teams/example-team")}
        preference="card"
        onPreferenceChange={() => undefined}
        onNavigate={() => undefined}
      />,
    );

    expect(html).toContain("Primary navigation");
    expect(html).toContain('href="/hunt"');
    expect(html).toContain('href="/pokemon"');
    expect(html).toContain('href="/teams"');
    expect(html).toContain('href="/inventory"');
    expect(html).toContain('href="/teams" aria-current="page"');
    expect(html).toContain("Skip to content");
  });

  it("renders the renderer preference only on local Settings", () => {
    const html = renderToStaticMarkup(
      <AppShell
        route={routeForPath("/settings")}
        preference="visual"
        onPreferenceChange={() => undefined}
        onNavigate={() => undefined}
      />,
    );

    expect(html).toContain("Preferred renderer");
    expect(html).toMatch(/checked="" value="visual"|value="visual" checked=""/);
    expect(html).toContain("Hunt settings");
  });

  it("keeps Hunt settings under Settings without a second current navigation item", () => {
    const html = renderToStaticMarkup(
      <AppShell
        route={routeForPath("/settings/hunt")}
        preference="card"
        onPreferenceChange={() => undefined}
        onNavigate={() => undefined}
      />,
    );

    expect(html).toContain('href="#main-content"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('href="/settings" aria-current="page"');
    expect(html).not.toContain('href="/hunt" aria-current="page"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("routes Inventory to its authoritative loading surface instead of the unavailable placeholder", () => {
    const html = renderToStaticMarkup(
      <AppShell
        route={routeForPath("/inventory")}
        preference="card"
        onPreferenceChange={() => undefined}
        onNavigate={() => undefined}
      />,
    );

    expect(html).toContain("Loading Inventory");
    expect(html).not.toContain("Area unavailable");
  });
});
