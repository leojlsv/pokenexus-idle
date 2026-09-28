export type RendererPreference = "card" | "visual";

const STORAGE_KEY = "pokenexus:renderer-preference:v1";

export function parseRendererPreference(value: string | null): RendererPreference {
  return value === "visual" ? "visual" : "card";
}

export function readRendererPreference(): RendererPreference {
  try {
    return parseRendererPreference(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return "card";
  }
}

export function writeRendererPreference(preference: RendererPreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage is optional presentation persistence; the in-memory preference remains valid.
  }
}
