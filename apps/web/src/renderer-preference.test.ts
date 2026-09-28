import { describe, expect, it } from "vitest";
import { parseRendererPreference } from "./renderer-preference";

describe("renderer preference", () => {
  it("fails closed to Card for missing or unknown device-local values", () => {
    expect(parseRendererPreference(null)).toBe("card");
    expect(parseRendererPreference("card")).toBe("card");
    expect(parseRendererPreference("unknown")).toBe("card");
    expect(parseRendererPreference("visual")).toBe("visual");
  });
});
