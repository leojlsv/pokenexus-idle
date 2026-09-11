import { Hono } from "hono";

/**
 * Minimal application entrypoint. No auth, gameplay endpoints or
 * persistence integration is implemented here.
 */
const app = new Hono();

app.get("/", (c) => c.text("PokeNexus API"));

export default app;
