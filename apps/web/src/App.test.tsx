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
});
