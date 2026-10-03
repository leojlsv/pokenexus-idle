// SPEC-022 separates external ACQUIRE from normal local INGEST. This historical entrypoint remains
// fail-closed so direct invocation cannot silently re-enable provider crawling. A future ACQUIRE task
// may replace it only behind the exact Human authorization gate defined by SPEC-022.
process.stderr.write(
  "external provider acquisition is disabled in maintenance-cli; use local `pnpm ingest` or an explicitly authorized ACQUIRE task\n",
);
process.exitCode = 1;
