import { describe, expect, it } from "vitest";
import app from "./index";

describe("api entrypoint", () => {
  it("responds on the root route", async () => {
    const response = await app.request("/");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("PokeNexus API");
  });
});
