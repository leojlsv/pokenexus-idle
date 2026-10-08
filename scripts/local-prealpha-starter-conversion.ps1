param(
  [Parameter(Mandatory = $true)][ValidateSet("Plan", "Apply", "Check")][string]$Action,
  [string]$PlanSha256,
  [switch]$ApplyApprovedPlan
)

# SPEC-027 local operation: Plan is read-only; Apply requires a frozen digest and explicit confirmation.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$common = @(& git -C $root rev-parse --path-format=absolute --git-common-dir)
if ($LASTEXITCODE -ne 0 -or $common.Count -ne 1) { throw "Cannot resolve the project Git directory" }
$gitDirectory = (Resolve-Path -LiteralPath $common[0]).Path
if ((Split-Path -Leaf $gitDirectory) -ne ".git") { throw "Expected a non-bare local project" }
$project = Split-Path -Parent $gitDirectory
if ($root -cne (Join-Path $project ".worktrees\TASK-122-local-prealpha-environment-runbook")) {
  throw "Conversion must run from the authorized TASK-122 worktree"
}
$maintenance = Join-Path $project ".maintenance\prealpha-local"
if (-not (Test-Path -LiteralPath $maintenance -PathType Container)) { throw "Local environment has not been initialized" }
if ($Action -ne "Plan" -and $PlanSha256 -cnotmatch '^[a-f0-9]{64}$') { throw "Apply/Check requires the exact reviewed PlanSha256" }
if ($Action -eq "Plan" -and $PlanSha256) { throw "Plan does not accept a previous digest" }
if (($Action -eq "Apply") -ne [bool]$ApplyApprovedPlan) { throw "Only Apply requires the explicit ApplyApprovedPlan confirmation" }

$operation = $null
$previous = @{}
try {
  $operation = [IO.File]::Open((Join-Path $maintenance "operation.lock"), [IO.FileMode]::OpenOrCreate,
    [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  if (Test-Path -LiteralPath (Join-Path $maintenance "state.json")) { throw "Stop the local application stack before conversion" }
  foreach ($port in @(8787, 8788, 5173, 5174)) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
      throw "A local application service is still listening on port $port"
    }
  }
  $inspect = @(& docker inspect pokenexus-prealpha-local | ConvertFrom-Json)
  if ($LASTEXITCODE -ne 0 -or $inspect.Count -ne 1) { throw "Owned local database container is unavailable" }
  $container = $inspect[0]
  $ports = @($container.HostConfig.PortBindings.'5432/tcp')
  $mounts = @($container.Mounts | Where-Object { $_.Destination -eq "/var/lib/postgresql/data" })
  $volume = @(& docker volume inspect pokenexus-prealpha-local-pgdata | ConvertFrom-Json)
  if ($LASTEXITCODE -ne 0 -or $volume.Count -ne 1 -or
      $volume[0].Labels.'pokenexus.scope' -cne "prealpha-local" -or
      $container.Config.Labels.'pokenexus.scope' -cne "prealpha-local" -or -not $container.State.Running -or
      $ports.Count -ne 1 -or $ports[0].HostIp -cne "127.0.0.1" -or $ports[0].HostPort -cne "55432" -or
      $mounts.Count -ne 1 -or $mounts[0].Type -cne "volume" -or $mounts[0].Name -cne "pokenexus-prealpha-local-pgdata") {
    throw "Database must be the running, owned local volume on exclusive loopback55432"
  }
  $planPath = Join-Path $maintenance "starter-level-five-conversion.plan.json"
  $ignored = @(& git -C $project check-ignore -- $planPath)
  if ($LASTEXITCODE -ne 0 -or $ignored.Count -ne 1) { throw "Private conversion plan must be Git-ignored" }
  $values = @{
    POKENEXUS_LOCAL_STARTER_CONVERSION = "1"
    POKENEXUS_CONVERSION_ACTION = $Action
    POKENEXUS_CONVERSION_PLAN = $planPath
    POKENEXUS_CONVERSION_PLAN_SHA256 = $PlanSha256
    POKENEXUS_CONVERSION_APPLY_AUTHORIZATION = if ($ApplyApprovedPlan) { "SPEC-027:2026-10-07T16:05:58Z" } else { $null }
    POKENEXUS_LOCAL_DATABASE_URL = "postgresql://pokenexus:pokenexus_local@127.0.0.1:55432/pokenexus_local_prealpha"
  }
  foreach ($name in $values.Keys) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    [Environment]::SetEnvironmentVariable($name, $values[$name], "Process")
  }
  Push-Location -LiteralPath (Join-Path $root "apps\api")
  try {
    & corepack pnpm exec vitest run --config vitest.integration.config.ts integration/local-prealpha-starter-conversion-operator.test.ts
    if ($LASTEXITCODE -ne 0) { throw "Conversion stage failed; retain the plan and reconcile the same operation, never Reset" }
  } finally { Pop-Location }
} finally {
  foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], "Process") }
  if ($operation) { $operation.Dispose() }
}
