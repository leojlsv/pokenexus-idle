param(
  [ValidateSet("Bootstrap", "Doctor", "Reset", "Start", "Status", "Smoke", "Stop")]
  [string]$Action = "Doctor",
  [ValidateRange(1, 2)]
  [int]$Players = 2,
  [ValidateRange(1, 65535)][int]$PostgresPort = 55432,
  [ValidateRange(1, 65535)][int]$ApiPort = 8787,
  [ValidateRange(1, 65535)][int]$GameDataPort = 8788,
  [ValidateRange(1, 65535)][int]$WebPortA = 5173,
  [ValidateRange(1, 65535)][int]$WebPortB = 5174,
  [string]$GeneticProfilesPath,
  [string]$StarterA,
  [string]$StarterB
)

$ErrorActionPreference = "Stop"
function Get-LocalPrealphaProjectRoot([string]$Root) {
  $common = @(& git -C $Root rev-parse --path-format=absolute --git-common-dir)
  if ($LASTEXITCODE -ne 0 -or $common.Count -ne 1) { throw "Cannot resolve the owning Git directory" }
  $resolved = (Resolve-Path -LiteralPath $common[0]).Path
  if ((Split-Path -Leaf $resolved) -ne ".git") { throw "Local Pre-alpha requires a non-bare Git checkout" }
  return Split-Path -Parent $resolved
}
$WorktreeRoot = Split-Path -Parent $PSScriptRoot
$ProjectRoot = Get-LocalPrealphaProjectRoot $WorktreeRoot
$Maintenance = Join-Path $ProjectRoot ".maintenance\prealpha-local"
$StateFile = Join-Path $Maintenance "state.json"
$IndividualizationAuthorityFile = Join-Path $Maintenance "individualization-authority.json"
$ApprovedGeneticProfilesFile = Join-Path $WorktreeRoot "docs\qa\PREALPHA_GENETIC_PROFILE_RELEASES.json"
$ApprovedGeneticProfilesTextSha256 = "sha256:0d5e94600dc98335d85ea586586b9b73eb5ea7576f5fea26eb2e5bed23996b61"
$WranglerConfigFile = Join-Path $WorktreeRoot "apps\api\.wrangler\task122.local.toml"
$Container = "pokenexus-prealpha-local"
$Volume = "pokenexus-prealpha-local-pgdata"
$ScopeLabel = "prealpha-local"
$DatabaseUrl = "postgresql://pokenexus:pokenexus_local@127.0.0.1:$PostgresPort/pokenexus_local_prealpha"
$PublishedDirectory = "version-38ed5230053095b7ef69290f55f40278e681f20eb530788040be5639cdde3c19"
$AccountA = "019a7f50-0000-7000-8000-000000000001"
$AccountB = "019a7f50-0000-7000-8000-000000000002"
$PlayerA = "019a7f50-0000-7000-8000-000000000101"
$PlayerB = "019a7f50-0000-7000-8000-000000000102"

function Invoke-Checked {
  param([string]$FilePath, [string[]]$Arguments)
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$FilePath failed with exit code $LASTEXITCODE" }
}

function Assert-Tool([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "Required tool not found: $Name" }
}

function Protect-LocalPrealphaMaintenance {
  $tracked = @(& git -C $ProjectRoot ls-files -- .maintenance/prealpha-local)
  if ($LASTEXITCODE -ne 0 -or $tracked.Count -ne 0) {
    throw "Local Pre-alpha runtime state must not be Git-tracked"
  }
  $exclude = Join-Path $ProjectRoot ".git\info\exclude"
  $rule = "/.maintenance/prealpha-local/"
  $existing = if (Test-Path -LiteralPath $exclude) { [IO.File]::ReadAllText($exclude) } else { "" }
  if (($existing -split "\r?\n") -notcontains $rule) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $exclude) -Force | Out-Null
    [IO.File]::AppendAllText($exclude, "`n$rule`n", (New-Object Text.UTF8Encoding($false)))
  }
}

function Enter-LocalPrealphaOperation {
  New-Item -ItemType Directory -Path $Maintenance -Force | Out-Null
  try {
    return [IO.File]::Open((Join-Path $Maintenance "operation.lock"), [IO.FileMode]::OpenOrCreate,
      [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  } catch {
    throw "Another local Pre-alpha operation is running, or its lock is unavailable"
  }
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

function Get-OwnedLocalDatabasePort {
  if (-not (Get-OwnedContainer) -or -not (Get-OwnedVolume)) { throw "Owned local database is unavailable" }
  $inspect = @(& docker inspect $Container | ConvertFrom-Json)
  if ($LASTEXITCODE -ne 0 -or $inspect.Count -ne 1) { throw "Cannot inspect the local database target" }
  $bindings = @($inspect[0].HostConfig.PortBindings.'5432/tcp')
  $mounts = @($inspect[0].Mounts | Where-Object { $_.Destination -eq "/var/lib/postgresql/data" })
  if ($bindings.Count -ne 1 -or $bindings[0].HostIp -ne "127.0.0.1" -or
      [string]$bindings[0].HostPort -notmatch '^[1-9][0-9]{0,4}$' -or [int]$bindings[0].HostPort -gt 65535 -or
      $mounts.Count -ne 1 -or $mounts[0].Type -ne "volume" -or $mounts[0].Name -ne $Volume) {
    throw "Local database target does not match the owned volume and exclusive loopback port"
  }
  return [int]$bindings[0].HostPort
}

function Assert-LocalDatabaseTarget([int]$ExpectedPort) {
  if ((Get-OwnedLocalDatabasePort) -ne $ExpectedPort) {
    throw "Local database target does not match the owned volume and exclusive loopback port"
  }
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
    Assert-LocalDatabaseTarget $PostgresPort
    $running = (docker inspect --format "{{.State.Running}}" $Container).Trim()
    if ($running -ne "true") { Invoke-Checked "docker" @("start", $Container) | Out-Null }
  }
  Assert-LocalDatabaseTarget $PostgresPort
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
  $temporary = "$StateFile.$([guid]::NewGuid().ToString('N')).tmp"
  try {
    [IO.File]::WriteAllText($temporary, (ConvertTo-Json -InputObject $State -Depth 6), (New-Object Text.UTF8Encoding($false)))
    if (Test-Path -LiteralPath $StateFile) {
      [IO.File]::Replace($temporary, $StateFile, [NullString]::Value)
    } else {
      [IO.File]::Move($temporary, $StateFile)
    }
  } finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
  }
}

function Read-OwnedLocalState([switch]$RequireDatabasePort) {
  if (-not (Test-Path -LiteralPath $StateFile -PathType Leaf)) { throw "Local stack is not started" }
  $state = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
  if ($state.version -ne "pokenexus.local-prealpha-state.v2" -or $state.worktreeRoot -ne $WorktreeRoot -or
      $state.PSObject.Properties.Name -notcontains "processes" -or $state.players -notin @(1, 2) -or -not $state.ports) {
    throw "Local Pre-alpha state is malformed or not owned by this worktree"
  }
  if ($RequireDatabasePort -and $state.ports.PSObject.Properties.Name -notcontains "postgres") {
    # A missing optional port is resolved from owned Docker metadata, never from a default.
    $state.ports | Add-Member -NotePropertyName postgres -NotePropertyValue (Get-OwnedLocalDatabasePort)
  }
  $names = @("api", "gameData", "webA")
  if ($state.players -eq 2) { $names += "webB" }
  if ($RequireDatabasePort) { $names += "postgres" }
  foreach ($name in $names) {
    $port = $state.ports.$name
    if ($null -eq $port -or [string]$port -notmatch '^[1-9][0-9]{0,4}$' -or [int]$port -gt 65535) {
      throw "Local Pre-alpha state has an invalid $name port; use guarded Stop/Start to refresh state"
    }
  }
  if ($state.apiUrl -cne "http://127.0.0.1:$($state.ports.api)" -or
      $state.gameDataUrl -cne "http://127.0.0.1:$($state.ports.gameData)" -or
      $state.playerAUrl -cne "http://localhost:$($state.ports.webA)" -or
      ($state.players -eq 2 -and $state.playerBUrl -cne "http://localhost:$($state.ports.webB)")) {
    throw "Local Pre-alpha state URLs do not match their owned loopback ports"
  }
  return $state
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

function ConvertTo-Base64Url([byte[]]$Bytes) {
  return [Convert]::ToBase64String($Bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function ConvertFrom-Base64Url([string]$Value) {
  if (-not $Value -or $Value -notmatch '^[A-Za-z0-9_-]+$') {
    throw "Local individualization secret must be canonical unpadded base64url"
  }
  $base64 = $Value.Replace("-", "+").Replace("_", "/")
  $padding = (4 - ($base64.Length % 4)) % 4
  try {
    $decoded = [Convert]::FromBase64String($base64 + ("=" * $padding))
    if ((ConvertTo-Base64Url $decoded) -cne $Value) { throw "Noncanonical base64url" }
    return $decoded
  } catch {
    throw "Local individualization secret is invalid base64url"
  }
}

function Get-IndividualizationKeyId([byte[]]$Secret) {
  if ($Secret.Length -lt 32) { throw "Local individualization secret must contain at least 32 bytes" }
  $hmac = New-Object Security.Cryptography.HMACSHA256
  $hmac.Key = $Secret
  try {
    $domain = [Text.Encoding]::UTF8.GetBytes("pokenexus-individualization-authority-key-id-v1")
    $hash = $hmac.ComputeHash($domain)
  } finally {
    $hmac.Dispose()
  }
  $hex = ([BitConverter]::ToString($hash)).Replace("-", "").ToLowerInvariant()
  return "key-v1:$hex"
}

function Get-OrCreate-LocalIndividualizationAuthority {
  New-Item -ItemType Directory -Force -Path $Maintenance | Out-Null
  if (Test-Path -LiteralPath $IndividualizationAuthorityFile) {
    $authority = Get-Content -LiteralPath $IndividualizationAuthorityFile -Raw | ConvertFrom-Json
    if ($authority.version -ne "pokenexus.local-prealpha-individualization-authority.v1" -or
        $authority.authorityVersion -ne "local-prealpha-individualization-v1" -or
        -not $authority.keyId -or -not $authority.secretKeyBase64url) {
      throw "Local individualization authority file is malformed"
    }
    $secret = ConvertFrom-Base64Url ([string]$authority.secretKeyBase64url)
    $derivedKeyId = Get-IndividualizationKeyId $secret
    if ($authority.keyId -ne $derivedKeyId) {
      throw "Local individualization authority keyId does not match its persisted secret"
    }
    return $authority
  }

  if ((Get-OwnedVolume) -or (Get-OwnedContainer)) {
    throw "Persisted individualization authority is missing while the database is preserved; restore the original key instead of regenerating it"
  }
  $secret = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($secret)
  } finally {
    $rng.Dispose()
  }
  $authority = [ordered]@{
    version = "pokenexus.local-prealpha-individualization-authority.v1"
    authorityVersion = "local-prealpha-individualization-v1"
    keyId = Get-IndividualizationKeyId $secret
    secretKeyBase64url = ConvertTo-Base64Url $secret
  }
  $temporary = "$IndividualizationAuthorityFile.$([guid]::NewGuid().ToString('N')).tmp"
  try {
    [IO.File]::WriteAllText($temporary, (ConvertTo-Json -InputObject $authority -Depth 4), (New-Object Text.UTF8Encoding($false)))
    [IO.File]::Move($temporary, $IndividualizationAuthorityFile)
  } finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
  }
  return [pscustomobject]$authority
}

function Assert-PreservedIndividualizationAuthority($Authority, [string]$ConnectionString) {
  $values = @{
    POKENEXUS_LOCAL_DATABASE_URL = $ConnectionString
    POKENEXUS_LOCAL_AUTHORITY_VERSION = [string]$Authority.authorityVersion
    POKENEXUS_LOCAL_AUTHORITY_KEY_ID = [string]$Authority.keyId
  }
  $previous = @{}
  foreach ($name in $values.Keys) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    [Environment]::SetEnvironmentVariable($name, $values[$name], "Process")
  }
  try {
    Invoke-Checked "corepack" @("pnpm", "--filter", "@pokenexus/database", "build")
    Invoke-Checked "corepack" @("pnpm", "--filter", "@pokenexus/database", "exec", "node", "scripts/local-prealpha-authority-check.mjs")
  } finally {
    foreach ($name in $values.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], "Process") }
  }
}

function Read-GeneticProfilesInput([string]$Path) {
  if (-not $Path) { return $null }
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Genetic Profile authority file does not exist: $Path"
  }
  if (-not (Test-Path -LiteralPath $ApprovedGeneticProfilesFile -PathType Leaf)) {
    throw "Human-approved Pre-alpha Genetic Profile authority artifact is missing"
  }
  $approvedRaw = (Get-Content -LiteralPath $ApprovedGeneticProfilesFile -Raw).Trim()
  if ((Get-TextSha256 $approvedRaw) -ne $ApprovedGeneticProfilesTextSha256) {
    throw "Human-approved Pre-alpha Genetic Profile authority artifact does not match its frozen digest"
  }
  $raw = Get-Content -LiteralPath $Path -Raw
  try {
    $null = $raw | ConvertFrom-Json
  } catch {
    throw "Genetic Profile authority file is not valid JSON"
  }
  $trimmed = $raw.Trim()
  if ((Get-TextSha256 $trimmed) -ne $ApprovedGeneticProfilesTextSha256) {
    throw "Genetic Profile authority differs from the Human-approved frozen Pre-alpha authority"
  }
  return $trimmed
}

function Get-TextSha256([string]$Value) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    $hash = $sha.ComputeHash($bytes)
  } finally {
    $sha.Dispose()
  }
  return "sha256:" + ([BitConverter]::ToString($hash)).Replace("-", "").ToLowerInvariant()
}

function Get-IndividualizationReleasesJson($IndividualizationAuthority) {
  return ConvertTo-Json -InputObject @([ordered]@{
    rulesVersion = "encounter-individualization-v1"
    authorityVersion = [string]$IndividualizationAuthority.authorityVersion
    keyId = [string]$IndividualizationAuthority.keyId
    secretKeyBase64url = [string]$IndividualizationAuthority.secretKeyBase64url
    newOperationsAllowed = $true
  }) -Depth 6 -Compress
}

function ConvertTo-TomlBasicString([string]$Value) {
  return $Value.Replace("\", "\\").Replace('"', '\"').
    Replace([string][char]13, "\r").Replace([string][char]10, "\n").Replace([string][char]9, "\t")
}

function Write-WranglerConfig(
  [string]$SessionA,
  [string]$SessionB,
  [string]$CursorKey,
  $IndividualizationAuthority,
  [string]$GeneticProfilesJson
) {
  $wranglerDir = Join-Path $WorktreeRoot "apps\api\.wrangler"
  New-Item -ItemType Directory -Force -Path $wranglerDir | Out-Null
  $individualizationReleases = Get-IndividualizationReleasesJson $IndividualizationAuthority
  $escapedIndividualizationReleases = ConvertTo-TomlBasicString $individualizationReleases
  $geneticLine = if ($GeneticProfilesJson) {
    'HUNT_GENETIC_PROFILE_RELEASES = "' + (ConvertTo-TomlBasicString $GeneticProfilesJson) + '"'
  } else {
    ""
  }
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
HUNT_INDIVIDUALIZATION_AUTHORITY_VERSION = "$($IndividualizationAuthority.authorityVersion)"
HUNT_INDIVIDUALIZATION_AUTHORITY_RELEASES = "$escapedIndividualizationReleases"
$geneticLine

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "00000000-0000-0000-0000-000000000000"
localConnectionString = "$DatabaseUrl"
"@
  Set-Content -LiteralPath $WranglerConfigFile -Value $config -Encoding UTF8
}

function Remove-GeneratedWranglerConfig {
  if (Test-Path -LiteralPath $WranglerConfigFile) {
    Remove-Item -LiteralPath $WranglerConfigFile -Force
  }
}

function Start-Hidden {
  param([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory)
  return Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru
}

function Start-Stack {
  if (Test-Path -LiteralPath $StateFile) { throw "Local stack already has state. Run Status or Stop first." }
  $geneticProfilesJson = Read-GeneticProfilesInput $GeneticProfilesPath
  $node = (Get-Command node.exe).Source
  $wranglerCli = Join-Path $WorktreeRoot "apps\api\node_modules\wrangler\bin\wrangler.js"
  $viteCli = Join-Path $WorktreeRoot "apps\web\node_modules\vite\bin\vite.js"
  if (-not (Test-Path -LiteralPath $wranglerCli)) { throw "Wrangler CLI is unavailable in the workspace" }
  if (-not (Test-Path -LiteralPath $viteCli)) { throw "Vite CLI is unavailable in the workspace" }
  $requestedPorts = @($PostgresPort, $ApiPort, $GameDataPort, $WebPortA)
  if ($Players -eq 2) { $requestedPorts += $WebPortB }
  if (@($requestedPorts | Select-Object -Unique).Count -ne $requestedPorts.Count) {
    throw "Local Pre-alpha service ports must be distinct"
  }
  foreach ($port in @($ApiPort, $GameDataPort, $WebPortA, $(if ($Players -eq 2) { $WebPortB } else { $null }))) {
    if (-not $port) { continue }
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
      throw "Local Pre-alpha application port $port is already in use"
    }
  }
  $individualizationAuthority = Get-OrCreate-LocalIndividualizationAuthority
  Ensure-Database
  Assert-PreservedIndividualizationAuthority $individualizationAuthority $DatabaseUrl
  Migrate-And-Seed
  New-Item -ItemType Directory -Force -Path $Maintenance | Out-Null
  $sessionA = New-Secret
  $sessionB = New-Secret
  $cursorKey = New-Secret 48
  $state = [ordered]@{
    version = "pokenexus.local-prealpha-state.v2"
    worktreeRoot = $WorktreeRoot
    players = $Players
    processes = @()
    ports = [ordered]@{
      postgres = $PostgresPort
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
    geneticProfilesInput = if ($geneticProfilesJson) { "provided" } else { "missing" }
    geneticProfilesHash = if ($geneticProfilesJson) { Get-TextSha256 $geneticProfilesJson } else { $null }
    individualizationAuthorityVersion = [string]$individualizationAuthority.authorityVersion
    individualizationAuthorityKeyId = [string]$individualizationAuthority.keyId
  }
  try {
    Write-LocalState $state
    Write-WranglerConfig $sessionA $sessionB $cursorKey $individualizationAuthority $geneticProfilesJson
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
    $diagnostics = Invoke-RestMethod "http://127.0.0.1:$ApiPort/__local-prealpha/diagnostics"
    if ($diagnostics.mode -ne "local-prealpha" -or
        $diagnostics.individualization.status -ne "ready" -or
        $diagnostics.individualization.keyId -cne $state.individualizationAuthorityKeyId -or
        $diagnostics.geneticProfiles.authorityHash -cne $state.geneticProfilesHash -or
        $diagnostics.wildsPreview.status -ne "ready" -or
        $diagnostics.wildsPreview.possibleSpeciesIds.Count -ne 6 -or
        $diagnostics.geneticProfiles.requiredDecisions.Count -ne 12) {
      throw "Local Pre-alpha authority diagnostics did not reach the expected fail-closed readiness surface"
    }
    $state.gameplayBootstrap = if ($diagnostics.geneticProfiles.status -eq "ready") {
      "ready_for_trusted_bootstrap"
    } else {
      "blocked_missing_accepted_genetic_profile_pairs"
    }
    Write-LocalState $state
  } catch {
    try {
      Stop-Processes
      Remove-GeneratedWranglerConfig
    } catch {
      throw "Local Pre-alpha Start failed and owned-process cleanup also failed: $($_.Exception.Message)"
    }
    throw
  }

  Write-Output "Local Pre-alpha infrastructure started. Authority preflight: $($state.gameplayBootstrap)."
  Write-Output "Player A: $($state.playerAUrl)"
  if ($Players -eq 2) { Write-Output "Player B: $($state.playerBUrl)" }
}

function Invoke-Smoke {
  $state = Read-OwnedLocalState
  Assert-StackReady $state
  $manifest = Invoke-RestMethod "$($state.gameDataUrl)/$PublishedDirectory/manifest.json"
  if ($manifest.gameDataVersion -ne "game-data-core-kanto-johto-v5") { throw "Unexpected local game-data release" }
  $sessionA = Invoke-RestMethod "$($state.playerAUrl)/auth/session"
  if (-not $sessionA.authenticated) { throw "Player A local session failed" }
  $profileA = Invoke-RestMethod "$($state.playerAUrl)/player/profile"
  if ($profileA.playerId -cne $PlayerA) { throw "Player A session does not match the expected local fixture" }
  $catalogA = Invoke-RestMethod "$($state.playerAUrl)/player/hunts/catalog-release"
  if ($catalogA.gameDataVersion -ne "game-data-core-kanto-johto-v5") { throw "Player A catalog release mismatch" }
  $diagnostics = Invoke-RestMethod "$($state.apiUrl)/__local-prealpha/diagnostics"
  if ($diagnostics.individualization.status -ne "ready" -or
      $diagnostics.individualization.keyId -cne $state.individualizationAuthorityKeyId -or
      $diagnostics.geneticProfiles.authorityHash -cne $state.geneticProfilesHash -or
      $diagnostics.wildsPreview.status -ne "ready" -or
      $diagnostics.wildsPreview.possibleSpeciesIds.Count -ne 6 -or
      $diagnostics.geneticProfiles.requiredDecisions.Count -ne 12) {
    throw "Local authority diagnostics are not structurally ready"
  }
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
    if ($concurrentProfileB.playerId -cne $PlayerB) { throw "Player B session does not match the expected local fixture" }
    if ($concurrentProfileA.playerId -eq $concurrentProfileB.playerId) { throw "ALT concurrent isolation failed: Player IDs match" }
  }
  if ($state.players -eq 2) {
    Write-Output "Infrastructure smoke PASS: immutable v5, local sessions, concurrent ALT self-scope isolation and catalog transport."
  } else {
    Write-Output "Infrastructure smoke PASS: immutable v5, local session, Player self-scope and catalog transport."
  }
  if ($diagnostics.geneticProfiles.status -eq "ready") {
    Write-Output "Genetic Profile authority preflight READY: trusted TASK-109 bootstrap may execute."
  } else {
    Write-Output "Gameplay smoke intentionally BLOCKED: $($diagnostics.geneticProfiles.missingSpeciesIds.Count) of 12 Species still lack approved Genetic Profile pairs."
  }
}

function Invoke-Bootstrap {
  if (-not (Test-Path -LiteralPath $StateFile)) {
    throw "Local stack is not started; Start with the approved Genetic Profile authority before Bootstrap"
  }
  $state = Read-OwnedLocalState -RequireDatabasePort
  Assert-StackReady $state
  if ($state.gameplayBootstrap -ne "ready_for_trusted_bootstrap") {
    throw "Trusted bootstrap is blocked until all 12 approved Genetic Profile pairs pass Start preflight"
  }
  if (-not $GeneticProfilesPath) {
    throw "Bootstrap requires -GeneticProfilesPath with the same approved authority used by Start"
  }
  if (-not $StarterA) {
    throw "Bootstrap requires -StarterA using one of the six accepted starter Species IDs"
  }
  if ($state.players -eq 2 -and -not $StarterB) {
    throw "Two-Player local bootstrap requires -StarterB"
  }
  if ($state.players -eq 1 -and $StarterB) {
    throw "StarterB cannot be supplied when the running local stack has one Player"
  }

  $profileA = Invoke-RestMethod "$($state.playerAUrl)/player/profile" -TimeoutSec 10
  if ($profileA.playerId -cne $PlayerA) { throw "Player A session does not match the expected local fixture" }
  if ($state.players -eq 2) {
    $profileB = Invoke-RestMethod "$($state.playerBUrl)/player/profile" -TimeoutSec 10
    if ($profileB.playerId -cne $PlayerB) { throw "Player B session does not match the expected local fixture" }
  }

  $geneticProfilesJson = Read-GeneticProfilesInput $GeneticProfilesPath
  if ((Get-TextSha256 $geneticProfilesJson) -ne $state.geneticProfilesHash) {
    throw "Bootstrap Genetic Profile authority differs from the authority preflighted by the running Start"
  }
  if (-not (Test-Path -LiteralPath $IndividualizationAuthorityFile -PathType Leaf)) {
    throw "Persisted local individualization authority is unavailable"
  }
  $individualizationAuthority = Get-OrCreate-LocalIndividualizationAuthority
  if ($individualizationAuthority.keyId -ne $state.individualizationAuthorityKeyId) {
    throw "Persisted individualization authority differs from the running local stack"
  }
  $diagnostics = Invoke-RestMethod "$($state.apiUrl)/__local-prealpha/diagnostics"
  if ($diagnostics.geneticProfiles.status -ne "ready" -or
      $diagnostics.geneticProfiles.authorityHash -cne $state.geneticProfilesHash -or
      $diagnostics.individualization.status -ne "ready" -or
      $diagnostics.individualization.keyId -cne $state.individualizationAuthorityKeyId -or
      $diagnostics.wildsPreview.status -ne "ready" -or
      $diagnostics.wildsPreview.possibleSpeciesIds.Count -ne 6) {
    throw "Local authority diagnostics are not ready for trusted bootstrap"
  }

  Assert-LocalDatabaseTarget ([int]$state.ports.postgres)
  Assert-PreservedIndividualizationAuthority $individualizationAuthority "postgresql://pokenexus:pokenexus_local@127.0.0.1:$($state.ports.postgres)/pokenexus_local_prealpha"
  $individualizationReleases = Get-IndividualizationReleasesJson $individualizationAuthority
  $values = [ordered]@{
    POKENEXUS_LOCAL_BOOTSTRAP = "1"
    POKENEXUS_LOCAL_BOOTSTRAP_CURSOR_KEY = New-Secret 48
    POKENEXUS_LOCAL_DATABASE_URL = "postgresql://pokenexus:pokenexus_local@127.0.0.1:$($state.ports.postgres)/pokenexus_local_prealpha"
    POKENEXUS_LOCAL_GAME_DATA_BASE_URL = "$($state.gameDataUrl)/"
    POKENEXUS_LOCAL_GENETIC_PROFILE_RELEASES = $geneticProfilesJson
    POKENEXUS_LOCAL_INDIVIDUALIZATION_AUTHORITY_VERSION = [string]$individualizationAuthority.authorityVersion
    POKENEXUS_LOCAL_INDIVIDUALIZATION_AUTHORITY_RELEASES = $individualizationReleases
    POKENEXUS_LOCAL_PLAYER_A = $PlayerA
    POKENEXUS_LOCAL_STARTER_A = $StarterA
    POKENEXUS_LOCAL_PLAYER_B = if ($state.players -eq 2) { $PlayerB } else { $null }
    POKENEXUS_LOCAL_STARTER_B = if ($state.players -eq 2) { $StarterB } else { $null }
  }
  $previous = @{}
  foreach ($name in $values.Keys) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    [Environment]::SetEnvironmentVariable($name, $values[$name], "Process")
  }
  try {
    Invoke-Checked "corepack" @(
      "pnpm", "--filter", "@pokenexus/api", "exec", "vitest", "run",
      "integration/local-prealpha-bootstrap-operator.test.ts",
      "--config", "vitest.integration.config.ts"
    )
  } finally {
    foreach ($name in $values.Keys) {
      [Environment]::SetEnvironmentVariable($name, $previous[$name], "Process")
    }
  }
  Write-Output "Trusted TASK-109 bootstrap PASS for the requested local Player fixture(s)."
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
  $geneticProfilesJson = Read-GeneticProfilesInput $GeneticProfilesPath
  Write-Output "Doctor PASS: Node/corepack/Docker, required ports and immutable v5 publication are available."
  if ($geneticProfilesJson) {
    Write-Output "Genetic Profile input: JSON syntax PASS; exact runtime schema/12-Species coverage will be checked fail-closed at Start."
  } else {
    Write-Output "Authority BLOCKER: exact Species -> Genetic Profile pairs are not accepted/integrated; genuine bootstrap/Hunt cannot start."
  }
}

function Invoke-Reset {
  Stop-Processes
  Remove-GeneratedWranglerConfig
  if (Get-OwnedContainer) { Invoke-Checked "docker" @("rm", "-f", $Container) | Out-Null }
  if (Get-OwnedVolume) { Invoke-Checked "docker" @("volume", "rm", $Volume) | Out-Null }
  if (Test-Path -LiteralPath $IndividualizationAuthorityFile) {
    Remove-Item -LiteralPath $IndividualizationAuthorityFile -Force
  }
  $null = Get-OrCreate-LocalIndividualizationAuthority
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
  Remove-GeneratedWranglerConfig
  if (Get-OwnedContainer) {
    $running = (docker inspect --format "{{.State.Running}}" $Container).Trim()
    if ($running -eq "true") { Invoke-Checked "docker" @("stop", $Container) | Out-Null }
  }
  Write-Output "Local Pre-alpha app stack stopped. Owned database volume preserved; use Reset for a fresh database."
}

Set-Location $WorktreeRoot
$operation = $null
try {
  if ($Action -in @("Bootstrap", "Reset", "Start", "Stop")) {
    $operation = Enter-LocalPrealphaOperation
    Protect-LocalPrealphaMaintenance
  }
  switch ($Action) {
    "Bootstrap" { Invoke-Bootstrap }
    "Doctor" { Invoke-Doctor }
    "Reset" { Invoke-Reset }
    "Start" { Start-Stack }
    "Status" { Invoke-Status }
    "Smoke" { Invoke-Smoke }
    "Stop" { Invoke-Stop }
  }
} finally {
  if ($operation) { $operation.Dispose() }
}
