import { describe, expect, it } from "vitest";
import app from "./index";

describe("api entrypoint", () => {
  it("responds on the root route", async () => {
    const response = await app.request("/");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("PokeNexus API");
  });

  it("does not expose the TASK-103 presentation feed through the deployed router", () => {
    expect(app.routes.some((route) =>
      route.method === "GET" && route.path === "/player/hunts/:huntId/presentation",
    )).toBe(false);
  });

  it("registers the authenticated SPEC-018 Hunt catalog reads", () => {
    expect(app.routes.some((route) =>
      route.method === "GET" && route.path === "/player/hunts/catalog-release",
    )).toBe(true);
    expect(app.routes.some((route) =>
      route.method === "GET" && route.path === "/player/hunts/catalog-artifacts/*",
    )).toBe(true);
  });

  it("registers the authenticated SPEC-024 prestart preview read", () => {
    expect(app.routes.some((route) =>
      route.method === "GET" && route.path === "/player/hunts/prestart-preview/:huntDefinitionId",
    )).toBe(true);
  });
});
