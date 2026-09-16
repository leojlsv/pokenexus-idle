import { withPgClient } from "../src/index";

export default {
  fetch(): Response {
    return new Response(withPgClient.name);
  },
};
