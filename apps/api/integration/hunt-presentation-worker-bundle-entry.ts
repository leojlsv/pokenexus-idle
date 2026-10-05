import {
  loadHuntPresentationPublicEvents,
  loadHuntPresentationPublicHeaders,
  loadHuntPresentationPublicPositionAt,
} from "@pokenexus/database";
import { createPresentationCursorCodec } from "../src/hunts/presentation-cursor";
import {
  parseHuntPresentationQuery,
  readHuntPresentationWithConsistentSnapshot,
} from "../src/hunts/presentation-read";
import { publishCommittedHuntPresentation } from "../src/hunts/presentation-source";

/** Compile the otherwise HTTP-disabled presentation paths for the target Worker runtime. */
export default {
  fetch(): Response {
    return new Response([
      loadHuntPresentationPublicEvents.name,
      loadHuntPresentationPublicHeaders.name,
      loadHuntPresentationPublicPositionAt.name,
      createPresentationCursorCodec.name,
      parseHuntPresentationQuery.name,
      readHuntPresentationWithConsistentSnapshot.name,
      publishCommittedHuntPresentation.name,
    ].join(":"));
  },
};
