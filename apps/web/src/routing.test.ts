import { describe, expect, it } from "vitest";
import { primaryNavigation, routeDocumentTitle, routeForPath } from "./routing";

describe("routeForPath", () => {
  it("resolves every SPEC-016 shell route", () => {
    expect(routeForPath("/").id).toBe("hunt");
    expect(routeForPath("/hunt/active").id).toBe("hunt-active");
    expect(routeForPath("/hunt/result/").id).toBe("hunt-result");
    expect(routeForPath("/pokemon").id).toBe("pokemon");
    expect(routeForPath("/teams").id).toBe("teams");
    expect(routeForPath("/inventory").id).toBe("inventory");
    expect(routeForPath("/settings").id).toBe("settings");
    expect(routeForPath("/settings/hunt").id).toBe("hunt-settings");
  });

  it("keeps resource route parameters as selectors without deriving authority", () => {
    expect(routeForPath("/pokemon/poke%3Ainstance")).toEqual({
      id: "pokemon-detail",
      key: "pokemon:poke:instance",
      pokemonInstanceId: "poke:instance",
    });
    expect(routeForPath("/teams/team-id")).toEqual({ id: "team-detail", key: "team:team-id", teamId: "team-id" });
    expect(routeForPath("/pokemon/a/b").id).toBe("not-found");
    expect(routeForPath("/pokemon/a%2Fb").id).toBe("not-found");
    expect(routeForPath("/teams/a%2Fb").id).toBe("not-found");
  });

  it("provides deterministic document titles for route changes", () => {
    expect(routeDocumentTitle(routeForPath("/hunt/active"))).toBe("Active Hunt · PokeNexus");
    expect(routeDocumentTitle(routeForPath("/unknown"))).toBe("Page not found · PokeNexus");
  });

  it("keeps the primary destination set stable", () => {
    expect(primaryNavigation.map((item) => item.id)).toEqual(["hunt", "pokemon", "teams", "inventory"]);
  });
});
