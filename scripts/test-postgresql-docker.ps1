# Disposable PostgreSQL 17 for API integration; no shared database or volume.
# Usage:
#   powershell -NoProfile -File scripts/test-postgresql-docker.ps1
#   powershell -NoProfile -File scripts/test-postgresql-docker.ps1 -TestFile integration/hunt-application-postgresql.test.ts -TestName 'TASK-103 enabled v3 source'
# Rebuild dependency dist by default: Vitest imports workspace package exports,
# so source-only changes would otherwise execute stale database/core code.
# -SkipDependencyBuild is for a caller that already built the exact current source.
[CmdletBinding()]
param(
  [ValidateSet('@pokenexus/api', '@pokenexus/database')]
  [string]$TestPackage = '@pokenexus/api',
  [string]$TestFile,
  [string]$TestName,
  [switch]$SkipDependencyBuild
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$token = [guid]::NewGuid().ToString('N').Substring(0, 12)
$containerName = "pokenexus-integration-pg-$token"
$databaseName = "pokenexus_test_task103_$token"
$databaseUser = 'pokenexus_test'
$password = [guid]::NewGuid().ToString('N')
$containerId = $null
$testExit = 1

$dockerType = & docker info --format '{{.OSType}}'
if ($LASTEXITCODE -ne 0 -or $dockerType -ne 'linux') {
  throw 'Docker Linux engine unavailable; start Docker Desktop before running the isolated tests.'
}

if (-not $SkipDependencyBuild) {
  Push-Location -LiteralPath $root
  try {
    & corepack pnpm --filter @pokenexus/api pretypecheck
    if ($LASTEXITCODE -ne 0) {
      throw 'Dependency prebuild failed; refusing PostgreSQL tests against stale dist.'
    }
  } finally {
    Pop-Location
  }
}

try {
  $containerId = & docker run -d --rm --name $containerName --label 'pokenexus.scope=task103-ephemeral' --tmpfs '/var/lib/postgresql/data:rw,size=536870912' -e "POSTGRES_USER=$databaseUser" -e "POSTGRES_PASSWORD=$password" -e "POSTGRES_DB=$databaseName" -p '127.0.0.1::5432' postgres:17-alpine
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerId)) {
    throw 'Could not start the disposable PostgreSQL container.'
  }
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    & docker exec $containerName pg_isready -q -U $databaseUser -d $databaseName 2>$null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'PostgreSQL did not become ready within bounded startup checks.' }

  $portBinding = & docker port $containerName '5432/tcp'
  if ($LASTEXITCODE -ne 0 -or $portBinding -notmatch '^127\.0\.0\.1:(\d+)$') {
    throw 'PostgreSQL is not exclusively bound to an ephemeral loopback port.'
  }
  $port = $Matches[1]
  $env:POKENEXUS_TEST_DATABASE_URL = ('postgresql://{0}:{1}@127.0.0.1:{2}/{3}' -f $databaseUser, $password, $port, $databaseName)

  Write-Output "Running API PostgreSQL integration against disposable postgres:17-alpine (loopback port $port)."
  $arguments = @('pnpm', '--filter', $TestPackage, 'exec', 'vitest', 'run', '--config', 'vitest.integration.config.ts')
  if ($TestFile) { $arguments += $TestFile }
  if ($TestName) { $arguments += @('-t', $TestName) }
  Push-Location -LiteralPath $root
  try {
    & corepack @arguments
    $testExit = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  Write-Output "POSTGRESQL_INTEGRATION_EXIT=$testExit"
} finally {
  Remove-Item Env:POKENEXUS_TEST_DATABASE_URL -ErrorAction SilentlyContinue
  if ($containerId) {
    $actualId = & docker inspect --format '{{.Id}}' $containerName 2>$null
    $labels = (& docker inspect --format '{{json .Config.Labels}}' $containerName 2>$null | ConvertFrom-Json)
    if ($actualId -like "$($containerId.Substring(0, 12))*" -and $labels.'pokenexus.scope' -eq 'task103-ephemeral') {
      & docker rm -f $containerName | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Could not remove the owned ephemeral PostgreSQL container.' }
      Write-Output 'Owned ephemeral PostgreSQL container removed.'
    } else {
      throw 'PostgreSQL container ownership check failed; will not remove an unidentified resource.'
    }
  }
}

if ($testExit -ne 0) { exit $testExit }
