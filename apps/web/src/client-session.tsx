import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { applyResponsePolicy } from "./client-policy";

type SessionState =
  | { status: "loading" }
  | { status: "authenticated"; csrfToken: string }
  | { status: "unauthenticated" }
  | { status: "error" };

type ClientSession = SessionState & { retry: () => void };

const SessionContext = createContext<ClientSession | null>(null);

async function loadSession(signal: AbortSignal): Promise<SessionState> {
  const response = await fetch("/auth/session", {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });
  if (applyResponsePolicy(response.status, response.status === 401 ? "unauthorized" : null).kind === "session_lost") {
    return { status: "unauthenticated" };
  }
  if (!response.ok) return { status: "error" };
  const body = await response.json() as { authenticated?: unknown; csrfToken?: unknown };
  if (body.authenticated !== true || typeof body.csrfToken !== "string") return { status: "error" };
  return { status: "authenticated", csrfToken: body.csrfToken };
}

export function clearPrivateSessionState(): void {
  applyResponsePolicy(401, "unauthorized");
}

export function ClientSessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadSession(controller.signal).then(setState).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ status: "error" });
    });
    return () => controller.abort();
  }, [attempt]);

  const value = useMemo<ClientSession>(() => ({ ...state, retry }), [state, retry]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useClientSession(): ClientSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useClientSession must be used within ClientSessionProvider");
  return session;
}
