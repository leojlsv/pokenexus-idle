import { resolve } from "node:path";
import { loadIngestionProfile, runMaintenanceIngestion } from "./maintenance-ingestion.js";

async function main(): Promise<void> {
  const [profilePath, outputDirectory, cacheDirectory, mode = "smoke"] = process.argv.slice(2);
  if (!profilePath || !outputDirectory || !cacheDirectory) {
    throw new Error(
      "usage: maintenance-cli <profile.json> <output-directory> <cache-directory> [smoke|review-core]",
    );
  }
  if (mode !== "smoke" && mode !== "review-core") {
    throw new Error("maintenance-cli mode must be smoke or review-core");
  }
  const profile = await loadIngestionProfile(resolve(profilePath));
  const result = await runMaintenanceIngestion({
    profile,
    outputDirectory: resolve(outputDirectory),
    cacheDirectory: resolve(cacheDirectory),
    intent: mode === "review-core" ? "full-candidate" : "smoke",
  });
  process.stdout.write(
    JSON.stringify(
      {
        outputDirectory: result.outputDirectory,
        candidateValid: result.validationReport.candidateValid,
        publicationReady: result.validationReport.publicationReady,
        findingCount: result.validationReport.findings.length,
        ...(result.reviewStage
          ? { reviewHash: result.reviewStage.manifest.reviewHash }
          : {}),
      },
      null,
      2,
    ) + "\n",
  );
}

await main();
