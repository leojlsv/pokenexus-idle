import {
  SCHEMA_VERSION,
  loadRuntimeGameDataArtifact,
  loadRuntimeGameDataVersion,
} from "@pokenexus/game-data";

export default {
  async fetch(): Promise<Response> {
    void loadRuntimeGameDataVersion;
    void loadRuntimeGameDataArtifact;
    return new Response(SCHEMA_VERSION);
  },
};
