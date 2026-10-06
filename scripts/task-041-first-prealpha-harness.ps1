# TASK-041 local/disposable first-Pre-alpha evidence harness.
# Cards-only; no public route enablement, shared database, migration or deploy.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$results = [ordered]@{}

function Invoke-HarnessStep {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )
  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    & $Action
    if ($LASTEXITCODE -ne 0) {
      throw "TASK-041 harness step '$Name' failed with exit code $LASTEXITCODE."
    }
  } finally {
    $watch.Stop()
    $results[$Name] = [math]::Round($watch.Elapsed.TotalMilliseconds, 2)
  }
}

$postgresCases = @(
  'reconciles an active Hunt to one frozen cutoff before applying a Potion policy prospectively',
  'keeps a concurrent Potion policy edit prospective against an already-frozen Hunt advancement',
  'freezes one exact 8h forward return target across retry and a different advance key without early anchor rebase',
  'uses full sub-8h elapsed time for a forward return target',
  'selects automatic capture from the locked Inventory at decision time, not an earlier boundary rowVersion',
  'lets Retreat win an exact KO-intervention automation tie with durable abandonment and zero Revive spend',
  'commits D-F16 post-Battle Revive atomically and exactly once across rollback, response loss, and restart',
  'counts a successful in-Battle Auto-Revive KO in the sealed Hunt activity',
  'pages immutable Hunt activity without duplicates across reconnect and enforces the 64-record bound'
)
$postgresPattern = ($postgresCases | ForEach-Object { [regex]::Escape($_) }) -join '|'

Push-Location -LiteralPath $root
try {
  Invoke-HarnessStep 'web_cards_flow_ms' {
    & corepack pnpm --filter '@pokenexus/web' exec vitest run `
      src/hunt-foreground-handoff.test.ts `
      src/hunt-command-store.test.ts `
      src/hunt-api.test.ts `
      src/combat-card.test.tsx `
      src/App.test.tsx
  }

  Invoke-HarnessStep 'web_build_ms' {
    & corepack pnpm --filter '@pokenexus/web' build
  }

  Invoke-HarnessStep 'api_prebuild_ms' {
    & corepack pnpm --filter '@pokenexus/api' pretypecheck
  }

  Invoke-HarnessStep 'api_offline_runtime_units_ms' {
    & corepack pnpm --filter '@pokenexus/api' exec vitest run --config vitest.config.ts `
      src/hunts/offline-reconciliation.test.ts `
      src/hunts/runtime.test.ts `
      src/hunts/http.test.ts `
      src/hunts/capture-product-policy.test.ts
  }

  Invoke-HarnessStep 'postgres_first_prealpha_ms' {
    & powershell -NoProfile -File scripts/test-postgresql-docker.ps1 `
      -TestFile integration/hunt-application-postgresql.test.ts `
      -TestName $postgresPattern `
      -SkipDependencyBuild
  }

  Invoke-HarnessStep 'roadmap_check_ms' {
    & corepack pnpm roadmap:check
  }

  $report = [ordered]@{
    schema = 'pokenexus.task-041-local-harness.v1'
    scope = 'first-prealpha-cards-only-local-disposable'
    timingsMs = $results
    covered = @(
      'Cards-only Hunt transport/correlation/rendering',
      'one-shot foreground handoff and reconnect',
      '8h capped and sub-8h return reconciliation',
      'forward-only active-Hunt Potion policy edit ordering',
      'automatic capture locked-Inventory decision',
      'Retreat versus Revive tie',
      'D-F16 post-Battle Revive replay/rollback',
      'in-Battle Auto-Revive activity',
      'paged Hunt Activity reconnect/deduplication'
    )
    externalGatesNotSimulated = @(
      'TASK-119 authoritative Encounter preview',
      'TASK-103 public CombatPresentation GET enablement',
      'TASK-120 durable terminal/offline summary',
      'TASK-121 historical manual-capture compatibility',
      'Human first-Prealpha live acceptance'
    )
    note = 'Local timings are diagnostics only and are not a production SLA.'
  }
  Write-Output ('TASK041_FIRST_PREALPHA_HARNESS=' + ($report | ConvertTo-Json -Compress -Depth 6))
} finally {
  Pop-Location
}
