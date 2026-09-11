import { describe, expect, it } from "vitest";
import worker, { Room } from "./index";

describe("realtime entrypoint", () => {
  it("exposes a placeholder worker fetch handler", async () => {
    const response = await worker.fetch(new Request("https://example.com"), {
      ROOM: {} as DurableObjectNamespace,
    });
    expect(response.status).toBe(200);
  });

  it("exposes the placeholder Room Durable Object class", () => {
    expect(typeof Room).toBe("function");
  });
});
