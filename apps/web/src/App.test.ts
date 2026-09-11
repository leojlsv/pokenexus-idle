import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App shell", () => {
  it("is a valid React component function", () => {
    expect(typeof App).toBe("function");
  });
});
