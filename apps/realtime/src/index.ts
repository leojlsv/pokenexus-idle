export interface Env {
  ROOM: DurableObjectNamespace;
}

/**
 * Placeholder Durable Object structure sufficient to typecheck/build.
 * No HUB/duo hunt coordination or WebSocket protocol is implemented here.
 */
export class Room implements DurableObject {
  constructor(_state: DurableObjectState, _env: Env) {}

  async fetch(_request: Request): Promise<Response> {
    return new Response("not implemented", { status: 501 });
  }
}

export default {
  async fetch(_request: Request, _env: Env): Promise<Response> {
    return new Response("PokeNexus realtime placeholder", { status: 200 });
  },
};
