param(
  [ValidateSet("Doctor", "Reset", "Start", "Status", "Smoke", "Stop")]
  [string]$Action = "Doctor",
  [ValidateRange(1, 2)]
  [int]$Players = 2,
  [int]$PostgresPort = 55432,
  [int]$ApiPort = 8787,
  [int]$GameDataPort = 8788,
  [int]$WebPortA = 5173,
  [int]$WebPortB = 5174
)

$ErrorActionPreference = "Stop"
$WorktreeRoot = Split-Path -Parent $PSScriptRoot
$ProjectRoot = (Resolve-Path (Join-Path $WorktreeRoot "..\..")).Path
$Maintenance = Join-Path $ProjectRoot ".maintenance\prealpha-local"
$StateFile = Join-Path $Maintenance "state.json"
$Container = "pokenexus-prealpha-local"
$Volume = "pokenexus-prealpha-local-pgdata"
$ScopeLabel = "prealpha-local"
$DatabaseUrl = "postgresql://pokenexus:pokenexus_local@127.0.0.1:$PostgresPort/pokenexus_local_prealpha"
$PublishedDirectory = "version-38ed5230053095b7ef69290f55f40278e681f20eb530788040be5639cdde3c19"
$AccountA = "019a7f50-0000-7000-8000-000000000001"
$AccountB = "019a7f50-0000-7000-8000-000000000002"

function Invoke-Checked {
  param([string]$FilePath, [string[]]$Arguments)
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$FilePath failed with exit code $LASTEXITCODE" }
}

function Assert-Tool([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "Required tool not found: $Name" }
}

function Get-OwnedContainer {
  $names = @(docker ps -a --filter "name=^/$Container$" --format "{{.Names}}")
  if ($LASTEXITCODE -ne 0) { throw "docker ps failed" }
  if ($names -notcontains $Container) { return $false }
  $inspect = @(docker inspect $Container | ConvertFrom-Json)
  if ($LASTEXITCODE -ne 0 -or $inspect.Count -ne 1) { throw "docker inspect failed for $Container" }
  $label = $inspect[0].Config.Labels.'pokenexus.scope'
  if ($label -ne $ScopeLabel) { throw "Refusing unmanaged container named $Container" }
  return $true
}

function Get-OwnedVolume {
  $names = @(docker volume ls --filter "name=^$Volume$" --format "{{.Name}}")
  if ($LASTEXITCODE -ne 0) { throw "docker volume ls failed" }
  if ($names -notcontains $Volume) { return $false }
  $inspect = @(docker volume inspect $Volume | ConvertFrom-Json)
  if ($LASTEXITCODE -ne 0 -or $inspect.Count -ne 1) { throw "docker volume inspect failed for $Volume" }
  $label = $inspect[0].Labels.'pokenexus.scope'
  if ($label -ne $ScopeLabel) { throw "Refusing unmanaged Docker volume named $Volume" }
  return $true
}

function Wait-Postgres {
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    docker exec $Container pg_isready -U pokenexus -d pokenexus_local_prealpha *> $null
    if ($LASTEXITCODE -eq 0) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "Local PostgreSQL did not become ready"
}

function Ensure-Database {
  if (-not (Get-OwnedVolume)) {
    Invoke-Checked "docker" @("volume", "create", "--label", "pokenexus.scope=$ScopeLabel", $Volume) | Out-Null
  }
  if (-not (Get-OwnedContainer)) {
    Invoke-Checked "docker" @(
      "run", "-d", "--name", $Container,
      "--label", "pokenexus.scope=$ScopeLabel",
      "-e", "POSTGRES_USER=pokenexus",
      "-e", "POSTGRES_PASSWORD=pokenexus_local",
      "-e", "POSTGRES_DB=pokenexus_local_prealpha",
      "-p", "127.0.0.1:$($PostgresPort):5432",
      "-v", "$($Volume):/var/lib/postgresql/data",
      "postgres:17-alpine"
    ) | Out-Null
  } else {
    $running = (docker inspect --format "{{.State.Running}}" $Container).Trim()
    if ($running -ne "true") { Invoke-Checked "docker" @("start", $Container) | Out-Null }
  }
  Wait-Postgres
}

function Migrate-And-Seed {
  $previousDatabaseUrl = $env:POKENEXUS_DIRECT_DATABASE_URL
  $previousSeedUrl = $env:POKENEXUS_LOCAL_DATABASE_URL
  try {
    $env:POKENEXUS_DIRECT_DATABASE_URL = $DatabaseUrl
    Invoke-Checked "corepack" @("pnpm", "--filter", "@pokenexus/database", "migrate")
    $env:POKENEXUS_LOCAL_DATABASE_URL = $DatabaseUrl
    Invoke-Checked "corepack" @("pnpm", "--filter", "@pokenexus/database", "exec", "node", "scripts/local-prealpha-seed.mjs")
  } finally {
    $env:POKENEXUS_DIRECT_DATABASE_URL = $previousDatabaseUrl
    $env:POKENEXUS_LOCAL_DATABASE_URL = $previousSeedUrl
  }
}

function Write-LocalState($State) {
  $State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StateFile -Encoding UTF8
}

function Get-LiveProcessIdentity([int]$ProcessId) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if (-not $process) { return $null }
  return [pscustomobject]@{
    pid = [int]$process.ProcessId
    creationUtc = $process.CreationDate.ToUniversalTime().ToString("o")
    executablePath = [string]$process.ExecutablePath
    commandLine = [string]$process.CommandLine
  }
}

function Assert-OwnedProcessIdentity($Record, $Live) {
  if (-not $Live) { return }
  if ($Record.pid -ne $Live.pid -or
      $Record.creationUtc -ne $Live.creationUtc -or
      $Record.executablePath -ne $Live.executablePath -or
      $Record.commandLine -ne $Live.commandLine) {
    throw "Refusing to terminate PID $($Record.pid): persisted process identity no longer matches the live process"
  }
  $expectedNode = (Get-Command node.exe).Source
  if ($Live.executablePath -ne $expectedNode) {
    throw "Refusing to terminate PID $($Record.pid): executable is not the expected Node runtime"
  }
  if (-not $Live.commandLine.Contains($WorktreeRoot)) {
    throw "Refusing to terminate PID $($Record.pid): command line is not owned by the TASK-122 worktree"
  }
  $allowedMarker = switch ($Record.role) {
    "game-data" { "local-game-data-server.mjs" }
    "api" { "task122.local.toml" }
    "web-a" { "vite.local.config.ts" }
    "web-b" { "vite.local.config.ts" }
    default { $null }
  }
  if (-not $allowedMarker -or -not $Live.commandLine.Contains($allowedMarker)) {
    throw "Refusing to terminate PID $($Record.pid): command line does not match the persisted TASK-122 role"
  }
}

function Add-OwnedProcessRecord($State, [string]$Role, $Process) {
  $identity = Get-LiveProcessIdentity $Process.Id
  if (-not $identity) { throw "Started $Role process exited before its identity could be recorded" }
  $record = [pscustomobject]@{
    role = $Role
    pid = $identity.pid
    creationUtc = $identity.creationUtc
    executablePath = $identity.executablePath
    commandLine = $identity.commandLine
  }
  $State.processes += $record
  Write-LocalState $State
}

function Assert-NoTrackedListeners($State) {
  foreach ($port in @($State.ports.api, $State.ports.gameData, $State.ports.webA, $State.ports.webB)) {
    if (-not $port) { continue }
    $listener = Get-NetTCPConnection -State Listen -LocalPort ([int]$port) -ErrorAction SilentlyContinue
    if ($listener) {
      throw "Local Pre-alpha listener still exists on port $port after process reconciliation; state is preserved"
    }
  }
}

function Assert-StackReady($State) {
  foreach ($record in @($State.processes)) {
    $live = Get-LiveProcessIdentity ([int]$record.pid)
    if (-not $live) {
      throw "TASK-122 $($record.role) process PID $($record.pid) exited during startup"
    }
    Assert-OwnedProcessIdentity $record $live
  }
  foreach ($port in @($State.ports.api, $State.ports.gameData, $State.ports.webA, $State.ports.webB)) {
    if (-not $port) { continue }
    if (-not (Get-NetTCPConnection -State Listen -LocalPort ([int]$port) -ErrorAction SilentlyContinue)) {
      throw "TASK-122 expected listener on port $port did not become ready"
    }
  }
}

function Stop-Processes {
  if (-not (Test-Path -LiteralPath $StateFile)) { return }
  $state = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
  if ($state.version -ne "pokenexus.local-prealpha-state.v2" -or
      $state.PSObject.Properties.Name -notcontains "processes") {
    throw "Refusing unsafe cleanup of legacy or malformed local Pre-alpha state; reconcile the state file manually"
  }
  if ($state.worktreeRoot -ne $WorktreeRoot) {
    throw "Refusing cleanup from a different local Pre-alpha worktree identity"
  }
  foreach ($record in @($state.processes)) {
    $live = Get-LiveProcessIdentity ([int]$record.pid)
    if ($live) {
      Assert-OwnedProcessIdentity $record $live
      & taskkill.exe /PID $record.pid /T /F *> $null
      if ($LASTEXITCODE -ne 0) {
        throw "Failed to terminate owned TASK-122 process PID $($record.pid); state is preserved"
      }
      for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if (-not (Get-LiveProcessIdentity ([int]$record.pid))) { break }
        Start-Sleep -Milliseconds 100
      }
      if (Get-LiveProcessIdentity ([int]$record.pid)) {
        throw "Owned TASK-122 process PID $($record.pid) is still running after termination; state is preserved"
      }
    }
  }
  Assert-NoTrackedListeners $state
  Remove-Item -LiteralPath $StateFile -Force
}

function New-Secret([int]$Bytes = 32) {
  $data = New-Object byte[] $Bytes
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($data)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($data).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Write-WranglerConfig([string]$SessionA, [string]$SessionB, [string]$CursorKey) {
  $wranglerDir = Join-Path $WorktreeRoot "apps\api\.wrangler"
  New-Item -ItemType Directory -Force -Path $wranglerDir | Out-Null
  $config = @"
name = "pokenexus-api-local-prealpha"
main = "../src/local-prealpha.ts"
compatibility_date = "2026-09-21"
compatibility_flags = ["nodejs_compat"]

[vars]
LOCAL_PREALPHA_ENABLED = "1"
LOCAL_PREALPHA_ALLOWED_ORIGINS = "http://localhost:$WebPortA,http://localhost:$WebPortB"
LOCAL_PREALPHA_SESSION_A = "$SessionA"
LOCAL_PREALPHA_ACCOUNT_A = "$AccountA"
LOCAL_PREALPHA_SESSION_B = "$SessionB"
LOCAL_PREALPHA_ACCOUNT_B = "$AccountB"
LOCAL_PREALPHA_GAME_DATA_BASE_URL = "http://127.0.0.1:$GameDataPort/"
LOCAL_PREALPHA_CURSOR_HMAC_KEY = "$CursorKey"

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "00000000-0000-0000-0000-000000000000"
localConnectionString = "$DatabaseUrl"
"@
  Set-Content -LiteralPath (Join-Path $wranglerDir "task122.local.toml") -Value $config -Encoding UTF8
}

function Start-Hidden {
  param([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory)
  return Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru
}

function Start-Stack {
  if (Test-Path -LiteralPath $StateFile) { throw "Local stack already has state. Run Status or Stop first." }
  foreach ($port in @($ApiPort, $GameDataPort, $WebPortA, $(if ($Players -eq 2) { $WebPortB } else { $null }))) {
    if (-not $port) { continue }
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
      throw "Local Pre-alpha application port $port is already in use"
    }
  }
  Ensure-Database
  Migrate-And-Seed
  New-Item -ItemType Directory -Force -Path $Maintenance | Out-Null
  $sessionA = New-Secret
  $sessionB = New-Secret
  $cursorKey = New-Secret 48
  Write-WranglerConfig $sessionA $sessionB $cursorKey

  $node = (Get-Command node.exe).Source
  $wranglerCli = Join-Path $WorktreeRoot "apps\api\node_modules\wrangler\bin\wrangler.js"
  $viteCli = Join-Path $WorktreeRoot "apps\web\node_modules\vite\bin\vite.js"
  if (-not (Test-Path -LiteralPath $wranglerCli)) { throw "Wrangler CLI is unavailable in the workspace" }
  if (-not (Test-Path -LiteralPath $viteCli)) { throw "Vite CLI is unavailable in the workspace" }
  $state = [ordered]@{
    version = "pokenexus.local-prealpha-state.v2"
    worktreeRoot = $WorktreeRoot
    players = $Players
    processes = @()
    ports = [ordered]@{
      api = $ApiPort
      gameData = $GameDataPort
      webA = $WebPortA
      webB = if ($Players -eq 2) { $WebPortB } else { $null }
    }
    apiUrl = "http://127.0.0.1:$ApiPort"
    gameDataUrl = "http://127.0.0.1:$GameDataPort"
    playerAUrl = "http://localhost:$WebPortA"
    playerBUrl = if ($Players -eq 2) { "http://localhost:$WebPortB" } else { $null }
    gameplayBootstrap = "blocked_missing_accepted_genetic_profile_pairs"
  }
  Write-LocalState $state

  try {
    $gameDataProcess = Start-Hidden $node @(
      (Join-Path $WorktreeRoot "scripts\local-game-data-server.mjs"),
      "--root", "packages/game-data/published",
      "--port", "$GameDataPort"
    ) $WorktreeRoot
    Add-OwnedProcessRecord $state "game-data" $gameDataProcess

    $apiProcess = Start-Hidden $node @(
      $wranglerCli, "dev",
      "--config", ".wrangler/task122.local.toml",
      "--ip", "127.0.0.1", "--port", "$ApiPort",
      "--show-interactive-dev-session=false"
    ) (Join-Path $WorktreeRoot "apps\api")
    Add-OwnedProcessRecord $state "api" $apiProcess

    $savedTarget = $env:POKENEXUS_LOCAL_API_TARGET
    $savedBearer = $env:POKENEXUS_LOCAL_SESSION_BEARER
    $savedPort = $env:POKENEXUS_LOCAL_WEB_PORT
    try {
      $env:POKENEXUS_LOCAL_API_TARGET = "http://127.0.0.1:$ApiPort"
      $env:POKENEXUS_LOCAL_SESSION_BEARER = $sessionA
      $env:POKENEXUS_LOCAL_WEB_PORT = "$WebPortA"
      $webAProcess = Start-Hidden $node @($viteCli, "--config", "vite.local.config.ts") (Join-Path $WorktreeRoot "apps\web")
      Add-OwnedProcessRecord $state "web-a" $webAProcess
      if ($Players -eq 2) {
        $env:POKENEXUS_LOCAL_SESSION_BEARER = $sessionB
        $env:POKENEXUS_LOCAL_WEB_PORT = "$WebPortB"
        $webBProcess = Start-Hidden $node @($viteCli, "--config", "vite.local.config.ts") (Join-Path $WorktreeRoot "apps\web")
        Add-OwnedProcessRecord $state "web-b" $webBProcess
      }
    } finally {
      $env:POKENEXUS_LOCAL_API_TARGET = $savedTarget
      $env:POKENEXUS_LOCAL_SESSION_BEARER = $savedBearer
      $env:POKENEXUS_LOCAL_WEB_PORT = $savedPort
    }
    Start-Sleep -Seconds 3
    Assert-StackReady $state
  } catch {
    try {
      Stop-Processes
    } catch {
      throw "Local Pre-alpha Start failed and owned-process cleanup also failed: $($_.Exception.Message)"
    }
    throw
  }

  Write-Output "Local Pre-alpha infrastructure started. Gameplay bootstrap remains fail-closed: accepted Genetic Profile pairs are missing."
  Write-Output "Player A: $($state.playerAUrl)"
  if ($Players -eq 2) { Write-Output "Player B: $($state.playerBUrl)" }
}

function Invoke-Smoke {
  if (-not (Test-Path -LiteralPath $StateFile)) { throw "Local stack is not started" }
  $state = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
  $manifest = Invoke-RestMethod "$($state.gameDataUrl)/$PublishedDirectory/manifest.json"
  if ($manifest.gameDataVersion -ne "game-data-core-kanto-johto-v5") { throw "Unexpected local game-data release" }
  $sessionA = Invoke-RestMethod "$($state.playerAUrl)/auth/session"
  if (-not $sessionA.authenticated) { throw "Player A local session failed" }
  $profileA = Invoke-RestMethod "$($state.playerAUrl)/player/profile"
  $catalogA = Invoke-RestMethod "$($state.playerAUrl)/player/hunts/catalog-release"
  if ($catalogA.gameDataVersion -ne "game-data-core-kanto-johto-v5") { throw "Player A catalog release mismatch" }
  if ($state.players -eq 2) {
    $sessionB = Invoke-RestMethod "$($state.playerBUrl)/auth/session"
    if (-not $sessionB.authenticated) { throw "Player B local session failed" }
    $jobA = Start-Job -ScriptBlock { param($Url) Invoke-RestMethod -Uri $Url } -ArgumentList "$($state.playerAUrl)/player/profile"
    $jobB = Start-Job -ScriptBlock { param($Url) Invoke-RestMethod -Uri $Url } -ArgumentList "$($state.playerBUrl)/player/profile"
    try {
      Wait-Job -Job @($jobA, $jobB) | Out-Null
      $concurrentProfileA = Receive-Job -Job $jobA -ErrorAction Stop
      $concurrentProfileB = Receive-Job -Job $jobB -ErrorAction Stop
    } finally {
      Remove-Job -Job @($jobA, $jobB) -Force -ErrorAction SilentlyContinue
    }
    if ($concurrentProfileA.playerId -ne $profileA.playerId) { throw "ALT A concurrent self-scope changed Player identity" }
    if ($concurrentProfileA.playerId -eq $concurrentProfileB.playerId) { throw "ALT concurrent isolation failed: Player IDs match" }
  }
  if ($state.players -eq 2) {
    Write-Output "Infrastructure smoke PASS: immutable v5, local sessions, concurrent ALT self-scope isolation and catalog transport."
  } else {
    Write-Output "Infrastructure smoke PASS: immutable v5, local session, Player self-scope and catalog transport."
  }
  Write-Output "Gameplay smoke intentionally BLOCKED: no accepted Species -> Genetic Profile pair authority exists."
}

function Invoke-Doctor {
  Assert-Tool "node"
  Assert-Tool "corepack"
  Assert-Tool "docker"
  Invoke-Checked "docker" @("info", "--format", "{{.ServerVersion}}") | Out-Null
  foreach ($port in @($PostgresPort, $ApiPort, $GameDataPort, $WebPortA, $WebPortB)) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($listener) {
      throw "Required local Pre-alpha port $port is already in use; stop the existing local stack/process first"
    }
  }
  $manifest = Join-Path $WorktreeRoot "packages\game-data\published\$PublishedDirectory\manifest.json"
  if (-not (Test-Path -LiteralPath $manifest)) { throw "Accepted v5 publication is missing" }
  Write-Output "Doctor PASS: Node/corepack/Docker, required ports and immutable v5 publication are available."
  Write-Output "Authority BLOCKER: exact Species -> Genetic Profile pairs are not accepted/integrated; genuine bootstrap/Hunt cannot start."
}

function Invoke-Reset {
  Stop-Processes
  if (Get-OwnedContainer) { Invoke-Checked "docker" @("rm", "-f", $Container) | Out-Null }
  if (Get-OwnedVolume) { Invoke-Checked "docker" @("volume", "rm", $Volume) | Out-Null }
  Ensure-Database
  Migrate-And-Seed
  Write-Output "Local Pre-alpha DB reset/migrate/identity seed PASS. Starter/gameplay bootstrap remains blocked by missing Genetic Profile authority."
}

function Invoke-Status {
  if (Get-OwnedContainer) {
    docker ps -a --filter "name=^/$Container$" --format "DB {{.Status}}"
  } else {
    Write-Output "DB absent"
  }
  if (Test-Path -LiteralPath $StateFile) {
    $state = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
    $state | ConvertTo-Json -Depth 4
    foreach ($record in @($state.processes)) {
      $process = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
      Write-Output ("{0} PID {1}: {2}" -f $record.role, $record.pid, $(if ($process) { "alive ($($process.ProcessName))" } else { "not running" }))
    }
  } else { Write-Output "Local app stack stopped" }
}

function Invoke-Stop {
  Stop-Processes
  if (Get-OwnedContainer) {
    $running = (docker inspect --format "{{.State.Running}}" $Container).Trim()
    if ($running -eq "true") { Invoke-Checked "docker" @("stop", $Container) | Out-Null }
  }
  Write-Output "Local Pre-alpha app stack stopped. Owned database volume preserved; use Reset for a fresh database."
}

Set-Location $WorktreeRoot
switch ($Action) {
  "Doctor" { Invoke-Doctor }
  "Reset" { Invoke-Reset }
  "Start" { Start-Stack }
  "Status" { Invoke-Status }
  "Smoke" { Invoke-Smoke }
  "Stop" { Invoke-Stop }
}
