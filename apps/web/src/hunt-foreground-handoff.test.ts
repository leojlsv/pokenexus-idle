import { describe, expect, it } from "vitest";
import {
  consumeActiveForegroundHandoff,
  rememberActiveForegroundHandoff,
} from "./hunt-foreground-handoff";

describe("TASK-039 foreground Hunt handoff", () => {
  it("is consumed by exactly one Active Hunt mount", () => {
    rememberActiveForegroundHandoff("hunt:first");
    expect(consumeActiveForegroundHandoff()).toBe("hunt:first");
    expect(consumeActiveForegroundHandoff()).toBeNull();
  });

  it("keeps only the newest unconsumed explicit SPA handoff", () => {
    rememberActiveForegroundHandoff("hunt:old");
    rememberActiveForegroundHandoff("hunt:new");
    expect(consumeActiveForegroundHandoff()).toBe("hunt:new");
    expect(consumeActiveForegroundHandoff()).toBeNull();
  });
});
