import { canonicalJson } from "./canonical-json.js";
import { stagePromotionV5Candidate } from "./promotion-staging-v5.js";

function usage(): never {
  throw new Error(
    "usage: promotion-stage-cli <base-published-directory> <pokeapi-snapshot-root> <legacy-cache-directory> <stable-legacy-evidence-directory> <output-directory>",
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  if (args.length !== 5) usage();
  const [
    basePublishedDirectory,
    pokeApiSnapshotRoot,
    legacyCacheDirectory,
    stableLegacyEvidenceDirectory,
    outputDirectory,
  ] = args as [string, string, string, string, string];

  const result = await stagePromotionV5Candidate({
    basePublishedDirectory,
    pokeApiSnapshotRoot,
    legacyCacheDirectory,
    stableLegacyEvidenceDirectory,
    outputDirectory,
  });

  process.stdout.write(`${canonicalJson({
    candidateGameDataVersion: result.manifest.candidateGameDataVersion,
    schemaVersion: result.manifest.schemaVersion,
    candidateBundleHash: result.manifest.candidateBundleHash,
    provenanceHash: result.manifest.provenanceHash,
    reviewHash: result.reviewHash,
    prePromotionParity: result.review.prePromotionParity,
    postPromotionParity: result.review.postPromotionParity,
    factualDelta: result.review.factualDelta,
    directory: result.directory,
  })}\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
