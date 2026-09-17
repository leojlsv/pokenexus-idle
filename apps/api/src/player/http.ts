import type { AuthSessionPrincipal } from "../auth/application";
import type { ApiApp, ApiContext } from "../auth/http";
import type { PlayerHttpApplication } from "./application";

export interface PlayerRouteSecurity {
  requireSession(c: ApiContext): Promise<AuthSessionPrincipal | Response>;
  requireSessionMutation(c: ApiContext): Promise<AuthSessionPrincipal | Response>;
}

export interface RegisterPlayerRoutesOptions {
  readonly playerFor: (c: ApiContext) => PlayerHttpApplication;
  readonly security: PlayerRouteSecurity;
}

export function registerPlayerRoutes(app: ApiApp, options: RegisterPlayerRoutesOptions): void {
  app.get("/player/profile", async (c) => {
    const principal = await options.security.requireSession(c);
    if (principal instanceof Response) return principal;

    const profile = await options.playerFor(c).loadProfile(principal.accountId);
    return profile ? c.json(profile) : c.json({ error: "not_found" }, 404);
  });

  app.put("/player/profile", async (c) => {
    const principal = await options.security.requireSessionMutation(c);
    if (principal instanceof Response) return principal;

    return c.json(await options.playerFor(c).createOrLoadProfile(principal.accountId));
  });
}
