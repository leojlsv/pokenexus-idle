import { useSyncExternalStore } from "react";

export type AppRoute =
  | { id: "hunt"; key: "hunt" }
  | { id: "hunt-active"; key: "hunt-active" }
  | { id: "hunt-result"; key: "hunt-result" }
  | { id: "pokemon"; key: "pokemon" }
  | { id: "pokemon-detail"; key: string; pokemonInstanceId: string }
  | { id: "teams"; key: "teams" }
  | { id: "team-detail"; key: string; teamId: string }
  | { id: "inventory"; key: "inventory" }
  | { id: "settings"; key: "settings" }
  | { id: "hunt-settings"; key: "hunt-settings" }
  | { id: "not-found"; key: string };

export const primaryNavigation = [
  { id: "hunt", href: "/hunt", label: "Hunt" },
  { id: "pokemon", href: "/pokemon", label: "Pokémon" },
  { id: "teams", href: "/teams", label: "Teams" },
  { id: "inventory", href: "/inventory", label: "Inventory" },
] as const;

function selector(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const value = pathname.slice(prefix.length);
  if (!value || value.includes("/")) return null;
  try {
    const decoded = decodeURIComponent(value);
    return decoded.includes("/") ? null : decoded;
  } catch {
    return null;
  }
}

export function routeDocumentTitle(route: AppRoute): string {
  switch (route.id) {
    case "hunt": return "Hunt · PokeNexus";
    case "hunt-active": return "Active Hunt · PokeNexus";
    case "hunt-result": return "Hunt Result · PokeNexus";
    case "pokemon": return "Pokémon · PokeNexus";
    case "pokemon-detail": return "Pokémon Detail · PokeNexus";
    case "teams": return "Teams · PokeNexus";
    case "team-detail": return "Team Detail · PokeNexus";
    case "inventory": return "Inventory · PokeNexus";
    case "settings": return "Settings · PokeNexus";
    case "hunt-settings": return "Hunt Settings · PokeNexus";
    case "not-found": return "Page not found · PokeNexus";
  }
}

export function routeForPath(pathname: string): AppRoute {
  const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  switch (normalized) {
    case "/":
    case "/hunt": return { id: "hunt", key: "hunt" };
    case "/hunt/active": return { id: "hunt-active", key: "hunt-active" };
    case "/hunt/result": return { id: "hunt-result", key: "hunt-result" };
    case "/pokemon": return { id: "pokemon", key: "pokemon" };
    case "/teams": return { id: "teams", key: "teams" };
    case "/inventory": return { id: "inventory", key: "inventory" };
    case "/settings": return { id: "settings", key: "settings" };
    case "/settings/hunt": return { id: "hunt-settings", key: "hunt-settings" };
  }

  const pokemonInstanceId = selector(normalized, "/pokemon/");
  if (pokemonInstanceId) return { id: "pokemon-detail", key: `pokemon:${pokemonInstanceId}`, pokemonInstanceId };
  const teamId = selector(normalized, "/teams/");
  if (teamId) return { id: "team-detail", key: `team:${teamId}`, teamId };
  return { id: "not-found", key: `not-found:${normalized}` };
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

function snapshot(): string {
  return window.location.pathname;
}

export function useBrowserRoute(): AppRoute {
  const pathname = useSyncExternalStore(subscribe, snapshot, () => "/hunt");
  return routeForPath(pathname);
}
