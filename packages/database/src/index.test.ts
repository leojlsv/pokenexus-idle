import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index";

describe("database entrypoint", () => {
  it("exposes the package identity marker", () => {
    expect(PACKAGE_NAME).toBe("@pokenexus/database");
  });
});
