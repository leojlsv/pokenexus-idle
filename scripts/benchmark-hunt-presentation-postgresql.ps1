# TASK-103 local evidence only: disposable PostgreSQL, no shared/persistent DB.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$env:POKENEXUS_RUN_PRESENTATION_BENCHMARK = '1'
$exitCode = 1
try {
  Push-Location -LiteralPath $root
  try {
    & powershell -NoProfile -File scripts/test-postgresql-docker.ps1 -TestFile integration/hunt-presentation-benchmark-postgresql.test.ts
    $exitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
} finally {
  Remove-Item Env:POKENEXUS_RUN_PRESENTATION_BENCHMARK -ErrorAction SilentlyContinue
}

exit $exitCode