$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$source = Join-Path $PSScriptRoot 'local-prealpha.ps1'
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Local Pre-alpha launcher does not parse' }
# Load only functions: tests must never run the launcher dispatch or touch the live stack.
foreach ($definition in $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
  . ([scriptblock]::Create($definition.Extent.Text))
}
function docker { throw 'Unit tests must not invoke Docker' }
function Get-NetTCPConnection { return $null }
function Get-OwnedVolume { return $false }
function Get-OwnedContainer { return $false }
$Container = 'pokenexus-prealpha-local'
$Volume = 'pokenexus-prealpha-local-pgdata'
$PlayerA = '019a7f50-0000-7000-8000-000000000101'
$PlayerB = '019a7f50-0000-7000-8000-000000000102'
$WorktreeRoot = $repo
$ApprovedGeneticProfilesFile = Join-Path $repo 'docs\qa\PREALPHA_GENETIC_PROFILE_RELEASES.json'
foreach ($assignment in $ast.FindAll({ param($node) $node -is [Management.Automation.Language.AssignmentStatementAst] }, $false)) {
  if ($assignment.Left.Extent.Text -eq '$ApprovedGeneticProfilesTextSha256') {
    . ([scriptblock]::Create($assignment.Extent.Text))
  }
}
$scratchParent = Join-Path $repo '.tmp'
$scratch = Join-Path $scratchParent ('task122-integrity-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch -Force | Out-Null
$passed = 0
$failed = 0
function Assert-True([bool]$Value, [string]$Message) {
  if (-not $Value) { throw $Message }
}
function Assert-Rejected([scriptblock]$Body, [string]$Pattern) {
  $rejection = $null
  try { $null = & $Body } catch { $rejection = $_.Exception.Message }
  if (-not $rejection -or $rejection -notmatch $Pattern) {
    throw "Expected fail-closed rejection matching: $Pattern"
  }
}
function Invoke-Test([string]$Name, [scriptblock]$Body) {
  $Maintenance = Join-Path $scratch ([guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $Maintenance | Out-Null
  $IndividualizationAuthorityFile = Join-Path $Maintenance 'individualization-authority.json'
  $StateFile = Join-Path $Maintenance 'state.json'
  $WranglerConfigFile = Join-Path $Maintenance 'task122.local.toml'
  try {
    & $Body
    $script:passed++
    Write-Output "PASS $Name"
  } catch {
    $script:failed++
    Write-Output "FAIL $Name -- $($_.Exception.Message)"
  }
}
function New-TestState($Authority) {
  return [ordered]@{
    version = 'pokenexus.local-prealpha-state.v2'
    worktreeRoot = $WorktreeRoot
    players = 1
    processes = @()
    ports = [ordered]@{ postgres = 65432; api = 18787; gameData = 18788; webA = 15173; webB = $null }
    apiUrl = 'http://127.0.0.1:18787'
    gameDataUrl = 'http://127.0.0.1:18788'
    playerAUrl = 'http://localhost:15173'
    playerBUrl = $null
    gameplayBootstrap = 'ready_for_trusted_bootstrap'
    geneticProfilesHash = $ApprovedGeneticProfilesTextSha256
    individualizationAuthorityVersion = $Authority.authorityVersion
    individualizationAuthorityKeyId = $Authority.keyId
  }
}
function New-TestDiagnostics($State) {
  return [pscustomobject]@{
    geneticProfiles = [pscustomobject]@{ status = 'ready'; authorityHash = $State.geneticProfilesHash }
    individualization = [pscustomobject]@{ status = 'ready'; keyId = $State.individualizationAuthorityKeyId }
    wildsPreview = [pscustomobject]@{ status = 'ready'; possibleSpeciesIds = @(1, 2, 3, 4, 5, 6) }
  }
}
try {
  Invoke-Test 'approved Genetic authority is transported without rewriting' {
    $text = Read-GeneticProfilesInput $ApprovedGeneticProfilesFile
    Assert-True ((Get-TextSha256 $text) -eq $ApprovedGeneticProfilesTextSha256) 'Approved digest changed'
    $release = $text | ConvertFrom-Json
    Assert-True (@($release).Count -eq 1 -and @($release[0].species).Count -eq 12) 'Approved release coverage changed'
  }
  Invoke-Test 'another valid Genetic pair and an extra release are rejected' {
    $raw = (Get-Content -LiteralPath $ApprovedGeneticProfilesFile -Raw).Trim()
    $path = Join-Path $Maintenance 'alternate.json'
    $raw.Replace('["Resilience", "Harmony"]', '["Might", "Harmony"]') | Set-Content -LiteralPath $path -Encoding UTF8
    Assert-Rejected { Read-GeneticProfilesInput $path } 'differs from the Human-approved'
    ('[' + $raw.Substring(1, $raw.Length - 2) + ',{}]') | Set-Content -LiteralPath $path -Encoding UTF8
    Assert-Rejected { Read-GeneticProfilesInput $path } 'differs from the Human-approved'
  }
  Invoke-Test 'persisted individualization key reloads without mutation' {
    $first = Get-OrCreate-LocalIndividualizationAuthority
    $before = (Get-FileHash -LiteralPath $IndividualizationAuthorityFile).Hash
    $second = Get-OrCreate-LocalIndividualizationAuthority
    Assert-True ($first.keyId -eq $second.keyId) 'Persisted key changed'
    Assert-True ($before -eq (Get-FileHash -LiteralPath $IndividualizationAuthorityFile).Hash) 'Key file was rewritten'
  }
  Invoke-Test 'missing key with preserved database volume cannot regenerate authority' {
    function Get-OwnedVolume { return $true }
    Assert-Rejected { Get-OrCreate-LocalIndividualizationAuthority } 'preserved|restore|missing'
    Assert-True (-not (Test-Path -LiteralPath $IndividualizationAuthorityFile)) 'A replacement key was written'
  }
  Invoke-Test 'corrupt individualization authority is rejected without replacement' {
    '{"version":"broken"}' | Set-Content -LiteralPath $IndividualizationAuthorityFile -Encoding UTF8
    $before = (Get-FileHash -LiteralPath $IndividualizationAuthorityFile).Hash
    Assert-Rejected { Get-OrCreate-LocalIndividualizationAuthority } 'malformed'
    Assert-True ($before -eq (Get-FileHash -LiteralPath $IndividualizationAuthorityFile).Hash) 'Corrupt evidence was overwritten'
  }
  Invoke-Test 'invalid Genetic input is rejected before database mutations' {
    $script:databaseCalls = 0
    function Ensure-Database { $script:databaseCalls++ }
    function Migrate-And-Seed { $script:databaseCalls++ }
    $GeneticProfilesPath = Join-Path $Maintenance 'missing.json'
    $ApiPort = 18787; $GameDataPort = 18788; $WebPortA = 15173; $WebPortB = 15174; $Players = 2
    Assert-Rejected { Start-Stack } 'does not exist'
    Assert-True ($script:databaseCalls -eq 0) 'Database was touched before rejecting invalid authority'
  }
  Invoke-Test 'main checkout and linked worktree share the Git-owned maintenance root' {
    $common = (& git -C $repo rev-parse --path-format=absolute --git-common-dir).Trim()
    $expected = Split-Path -Parent $common
    if (Get-Command Get-LocalPrealphaProjectRoot -ErrorAction SilentlyContinue) {
      $linked = Get-LocalPrealphaProjectRoot $repo
      $main = Get-LocalPrealphaProjectRoot $expected
    } else {
      $linked = (Resolve-Path -LiteralPath (Join-Path $repo '..\..')).Path
      $main = (Resolve-Path -LiteralPath (Join-Path $expected '..\..')).Path
    }
    Assert-True ($linked -eq $expected) 'Linked worktree root mismatch'
    Assert-True ($main -eq $expected) 'Main checkout root mismatch'
  }
  Invoke-Test 'operation lock rejects overlapping lifecycle commands' {
    $first = Enter-LocalPrealphaOperation
    try { Assert-Rejected { Enter-LocalPrealphaOperation } 'operation|lock' } finally { $first.Dispose() }
    $next = Enter-LocalPrealphaOperation
    $next.Dispose()
  }
  Invoke-Test 'state publication replaces a complete snapshot without temporary debris' {
    $state = New-TestState ([pscustomobject]@{ authorityVersion = 'test'; keyId = 'test' })
    Write-LocalState $state
    $state.gameplayBootstrap = 'blocked_missing_accepted_genetic_profile_pairs'
    Write-LocalState $state
    $loaded = Read-OwnedLocalState -RequireDatabasePort
    Assert-True ($loaded.gameplayBootstrap -eq $state.gameplayBootstrap) 'State replacement did not persist'
    Assert-True (@(Get-ChildItem -LiteralPath $Maintenance -Filter '*.tmp').Count -eq 0) 'Temporary state files remain'
  }
  Invoke-Test 'foreign state and URL substitution fail before any network request' {
    $state = New-TestState ([pscustomobject]@{ authorityVersion = 'test'; keyId = 'test' })
    $state.worktreeRoot = 'G:\unrelated-worktree'
    Write-LocalState $state
    Assert-Rejected { Read-OwnedLocalState } 'not owned'
    $state.worktreeRoot = $WorktreeRoot
    $state.apiUrl = 'https://outside.example.invalid'
    Write-LocalState $state
    Assert-Rejected { Read-OwnedLocalState } 'loopback'
  }
  Invoke-Test 'duplicate service ports fail before database mutations' {
    $script:databaseCalls = 0
    function Ensure-Database { $script:databaseCalls++ }
    function Migrate-And-Seed { $script:databaseCalls++ }
    $GeneticProfilesPath = $ApprovedGeneticProfilesFile
    $PostgresPort = 55432; $ApiPort = 18787; $GameDataPort = 18787; $WebPortA = 15173; $WebPortB = 15174; $Players = 2
    Assert-Rejected { Start-Stack } 'distinct'
    Assert-True ($script:databaseCalls -eq 0) 'Database was touched for invalid port configuration'
  }
  Invoke-Test 'owned database must match its exclusive loopback port and named volume' {
    function Get-OwnedContainer { return $true }
    function Get-OwnedVolume { return $true }
    $record = [ordered]@{
      HostConfig = @{ PortBindings = @{ '5432/tcp' = @(@{ HostIp = '127.0.0.1'; HostPort = '65432' }) } }
      Mounts = @(@{ Destination = '/var/lib/postgresql/data'; Type = 'volume'; Name = $Volume })
    }
    function docker { $global:LASTEXITCODE = 0; return ConvertTo-Json -InputObject @($record) -Depth 8 }
    Assert-LocalDatabaseTarget 65432
    Assert-Rejected { Assert-LocalDatabaseTarget 55432 } 'loopback port'
    $record.HostConfig.PortBindings.'5432/tcp'[0].HostIp = '0.0.0.0'
    Assert-Rejected { Assert-LocalDatabaseTarget 65432 } 'loopback port'
    $record.HostConfig.PortBindings.'5432/tcp'[0].HostIp = '127.0.0.1'
    $record.Mounts[0].Name = 'unrelated-data'
    Assert-Rejected { Assert-LocalDatabaseTarget 65432 } 'owned volume'
  }
  Invoke-Test 'Bootstrap uses the running database port and restores transport environment' {
    $authority = Get-OrCreate-LocalIndividualizationAuthority
    $state = New-TestState $authority
    Write-LocalState $state
    $GeneticProfilesPath = $ApprovedGeneticProfilesFile
    $StarterA = 'candidate:species:pokedex-bulbasaur-1:91b07648a3'; $StarterB = $null
    $DatabaseUrl = 'postgresql://pokenexus:pokenexus_local@127.0.0.1:55432/pokenexus_local_prealpha'
    $before = $env:POKENEXUS_LOCAL_DATABASE_URL
    function Assert-StackReady { }
    function Invoke-RestMethod([string]$Uri) {
      if ($Uri.EndsWith('/player/profile')) { return [pscustomobject]@{ playerId = $PlayerA } }
      return New-TestDiagnostics $state
    }
    function Assert-LocalDatabaseTarget([int]$ExpectedPort) { Assert-True ($ExpectedPort -eq 65432) 'Wrong database validated' }
    function Assert-PreservedIndividualizationAuthority($Authority, [string]$ConnectionString) {
      Assert-True ($ConnectionString.Contains(':65432/')) 'Wrong authority database validated'
    }
    function Invoke-Checked { $script:bootstrapTarget = $env:POKENEXUS_LOCAL_DATABASE_URL }
    $null = Invoke-Bootstrap
    Assert-True ($script:bootstrapTarget -eq 'postgresql://pokenexus:pokenexus_local@127.0.0.1:65432/pokenexus_local_prealpha') 'Bootstrap used a default/foreign database port'
    Assert-True ($env:POKENEXUS_LOCAL_DATABASE_URL -eq $before) 'Bootstrap leaked process environment'
  }
  Invoke-Test 'Bootstrap rejects live Genetic or individualization drift before mutation' {
    $authority = Get-OrCreate-LocalIndividualizationAuthority
    $state = New-TestState $authority
    Write-LocalState $state
    $GeneticProfilesPath = $ApprovedGeneticProfilesFile
    $StarterA = 'candidate:species:pokedex-bulbasaur-1:91b07648a3'; $StarterB = $null
    $script:bootstrapCalls = 0
    function Assert-StackReady { }
    function Invoke-Checked { $script:bootstrapCalls++ }
    $diagnostics = New-TestDiagnostics $state
    function Invoke-RestMethod([string]$Uri) {
      if ($Uri.EndsWith('/player/profile')) { return [pscustomobject]@{ playerId = $PlayerA } }
      return $diagnostics
    }
    $diagnostics.geneticProfiles.authorityHash = 'sha256:wrong'
    Assert-Rejected { Invoke-Bootstrap } 'not ready'
    $diagnostics.geneticProfiles.authorityHash = $state.geneticProfilesHash
    $diagnostics.individualization.keyId = 'key-v1:wrong'
    Assert-Rejected { Invoke-Bootstrap } 'not ready'
    Assert-True ($script:bootstrapCalls -eq 0) 'Bootstrap mutated after authority drift'
  }
  Invoke-Test 'local secret exclusion is effective and idempotent in the owning repository' {
    $ProjectRoot = Join-Path $Maintenance 'checkout'
    & git init --quiet $ProjectRoot
    if ($LASTEXITCODE -ne 0) { throw 'Isolated test repository creation failed' }
    Protect-LocalPrealphaMaintenance
    $exclude = Join-Path $ProjectRoot '.git\info\exclude'
    $first = [IO.File]::ReadAllText($exclude)
    Protect-LocalPrealphaMaintenance
    Assert-True ($first -ceq [IO.File]::ReadAllText($exclude)) 'Exclusion duplicated or rewrote existing rules'
    & git -C $ProjectRoot check-ignore -q -- .maintenance/prealpha-local/individualization-authority.json
    Assert-True ($LASTEXITCODE -eq 0) 'Private authority can enter the Git candidate'
  }
  Invoke-Test 'Bootstrap rejects a fixture account resolving to another Player' {
    $state = New-TestState ([pscustomobject]@{ authorityVersion = 'test'; keyId = 'test' })
    Write-LocalState $state
    $GeneticProfilesPath = $ApprovedGeneticProfilesFile
    $StarterA = 'candidate:species:pokedex-bulbasaur-1:91b07648a3'; $StarterB = $null
    $script:bootstrapCalls = 0
    function Assert-StackReady { }
    function Invoke-RestMethod { return [pscustomobject]@{ playerId = $PlayerB } }
    function Invoke-Checked { $script:bootstrapCalls++ }
    Assert-Rejected { Invoke-Bootstrap } 'expected local fixture'
    Assert-True ($script:bootstrapCalls -eq 0) 'Bootstrap mutated an unrelated Player'
  }
  Invoke-Test 'legacy v2 derives its missing database port only from verified container ownership' {
    $state = New-TestState ([pscustomobject]@{ authorityVersion = 'test'; keyId = 'test' })
    $null = $state.ports.Remove('postgres')
    Write-LocalState $state
    $before = (Get-FileHash -LiteralPath $StateFile).Hash
    function Get-OwnedLocalDatabasePort { return 65432 }
    $loaded = Read-OwnedLocalState -RequireDatabasePort
    Assert-True ($loaded.ports.postgres -eq 65432) 'Legacy state used an assumed default database port'
    Assert-True ($before -eq (Get-FileHash -LiteralPath $StateFile).Hash) 'Reading legacy state rewrote persisted evidence'
    function Get-OwnedLocalDatabasePort { throw 'Unverified database ownership' }
    Assert-Rejected { Read-OwnedLocalState -RequireDatabasePort } 'Unverified database ownership'
  }
  Invoke-Test 'a valid but foreign preserved authority is rejected before migration or seed' {
    $null = Get-OrCreate-LocalIndividualizationAuthority
    $before = (Get-FileHash -LiteralPath $IndividualizationAuthorityFile).Hash
    $script:seedCalls = 0
    function Ensure-Database { }
    function Migrate-And-Seed { $script:seedCalls++ }
    function Assert-PreservedIndividualizationAuthority { throw 'Preserved local authority differs' }
    $GeneticProfilesPath = $ApprovedGeneticProfilesFile
    $PostgresPort = 55432; $ApiPort = 18787; $GameDataPort = 18788; $WebPortA = 15173; $WebPortB = 15174; $Players = 2
    Assert-Rejected { Start-Stack } 'Preserved local authority differs'
    Assert-True ($script:seedCalls -eq 0) 'Preserved authority mismatch reached migration or seed'
    Assert-True ($before -eq (Get-FileHash -LiteralPath $IndividualizationAuthorityFile).Hash) 'Existing key was replaced'
  }
} finally {
  $resolved = [IO.Path]::GetFullPath($scratch)
  $prefix = [IO.Path]::GetFullPath($scratchParent) + [IO.Path]::DirectorySeparatorChar
  if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe test cleanup target' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
Write-Output "LOCAL_PREALPHA_INTEGRITY_TESTS: $passed passed, $failed failed"
if ($failed) { exit 1 }
