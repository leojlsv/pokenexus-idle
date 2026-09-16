import { describe, expect, it } from "vitest";
import { generateUuidV7 } from "./uuid-v7";

const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("generateUuidV7", () => {
  it("returns RFC 9562 version-7 UUID text with the RFC variant", () => {
    expect(generateUuidV7()).toMatch(UUID_V7_PATTERN);
  });

  it("does not repeat IDs across a focused generation sample", () => {
    const generated = Array.from({ length: 1000 }, () => generateUuidV7());
    expect(new Set(generated).size).toBe(generated.length);
  });
});
