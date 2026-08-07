[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "FAIL: $Message" }
}

function Read-Utf16Script {
    param([string]$RelativePath)
    $path = Join-Path $root $RelativePath
    return [System.IO.File]::ReadAllText((Resolve-Path $path), [System.Text.Encoding]::Unicode)
}

$helperPath = Join-Path $root 'tools\operational-validation\smoke-test-helpers.ps1'
. (Resolve-Path $helperPath)
$portHelper = Join-Path $root 'scripts\lib\local-stack-port.ps1'
. (Resolve-Path $portHelper)

# RED-A①: pipeline 결과는 0/1/다건을 배열화하고, helper의 Count는 실제 건수를 낸다.
foreach ($case in @(
    @{ Results = @(); Expected = 0 },
    @{ Results = @([pscustomobject]@{ Verdict = 'FAIL' }); Expected = 1 },
    @{ Results = @(
        [pscustomobject]@{ Verdict = 'FAIL' },
        [pscustomobject]@{ Verdict = 'PATH_404' },
        [pscustomobject]@{ Verdict = 'OK' }
    ); Expected = 2 }
)) {
    $actual = Get-SmokeFailureCount -Results $case.Results
    Assert-True ($actual -eq $case.Expected) "failure count expected $($case.Expected), got $actual"
}

# RED-A①: execute Measure-Object itself for 0/1/many inputs; source assertions alone
# cannot catch the PowerShell scalar-array Count trap.
foreach ($case in @(
    @{ Values = @(); Expected = 0 },
    @{ Values = @('one'); Expected = 1 },
    @{ Values = @('one', 'two', 'three'); Expected = 3 }
)) {
    $measurement = $case.Values | Measure-Object
    Assert-True ($measurement.Count -eq $case.Expected) "Measure-Object expected $($case.Expected), got $($measurement.Count)"
}

$oldSlipPort = [Environment]::GetEnvironmentVariable('SAMHAN_SLIP_PORT')
try {
    [Environment]::SetEnvironmentVariable('SAMHAN_SLIP_PORT', $null, 'Process')
    Assert-True ((Get-LocalStackPort -Service 'slip-service') -eq 8086) 'slip default port must be 8086'
} finally {
    [Environment]::SetEnvironmentVariable('SAMHAN_SLIP_PORT', $oldSlipPort, 'Process')
}
$oldAuthPort = [Environment]::GetEnvironmentVariable('SAMHAN_AUTH_PORT')
try {
    [Environment]::SetEnvironmentVariable('SAMHAN_AUTH_PORT', '18081', 'Process')
    Assert-True ((Get-LocalStackPort -Service 'auth-service') -eq 18081) 'auth override was not resolved'
} finally {
    [Environment]::SetEnvironmentVariable('SAMHAN_AUTH_PORT', $oldAuthPort, 'Process')
}
$unknownThrew = $false
try { Get-LocalStackPort -Service 'not-a-service' | Out-Null } catch { $unknownThrew = $true }
Assert-True $unknownThrew 'unknown service must throw'

$import = Get-Content (Join-Path $root 'tools\operational-validation\import-notion-csv.ps1') -Raw -Encoding UTF8
$smoke = Get-Content (Join-Path $root 'tools\operational-validation\run-smoke-tests.ps1') -Raw -Encoding UTF8
$seed = Get-Content (Join-Path $root 'scripts\seed-local-stack.ps1') -Raw -Encoding UTF8
$start = Get-Content (Join-Path $root 'infrastructure\scripts\start-local-full.ps1') -Raw -Encoding UTF8
$validation = Read-Utf16Script 'infrastructure\scripts\operational-validation.ps1'

Assert-True ($import -match '\$okCount\s*=\s*@\(\$results\s*\|\s*Where-Object') 'import success pipeline is not array-wrapped'
Assert-True ($import -match '\$failCount\s*=\s*Get-SmokeFailureCount\s+-Results\s*@\(\$results\)') 'import failure pipeline is not normalized'
Assert-True ($smoke -match '\$downCount\s*=\s*@\(\$healthResults\s*\|\s*Where-Object') 'smoke health pipeline is not array-wrapped'
Assert-True ($seed -match 'Wait-Http\s+"auth-service"\s+"\$authServiceBaseUrl/actuator/health"') 'seed auth health does not use resolved auth port'
Assert-True ($start.Contains('$eurekaPort') -and $start.Contains('Eureka')) 'start guide does not use resolved Eureka port'
Assert-True ($start.Contains('$gatewayPort') -and $start.Contains('API Gateway')) 'start guide does not use resolved Gateway port'
Assert-True ($validation -match "Get-LocalStackPort\s+-Service\s+'eureka-server'") 'operational validation has no resolved Eureka port'
Assert-True ($validation -match "Get-LocalStackPort\s+-Service\s+'api-gateway'") 'operational validation has no resolved Gateway port'
Assert-True ($validation -match '\(\$pretendardFiles\s*\|\s*Measure-Object\)\.Count') 'Pretendard Measure-Object count missing'
Assert-True ($validation -match '\(\$s3YmlFiles\s*\|\s*Measure-Object\)\.Count') 'S3 Measure-Object count missing'
Assert-True ($validation -notmatch '@\(\$pretendardFiles\s*\|\s*Measure-Object') 'Pretendard Measure-Object was incorrectly array-wrapped'
Assert-True ($validation -notmatch '@\(\$s3YmlFiles\s*\|\s*Measure-Object') 'S3 Measure-Object was incorrectly array-wrapped'

$guard = Join-Path $root 'scripts\check-local-stack-port-literals.ps1'
Assert-True (Test-Path $guard) 'port literal guard is missing'
$guardOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $guard -Root $root 2>&1
Assert-True ($LASTEXITCODE -eq 0) "port literal guard failed: $guardOutput"

# RED-A③ mutation: a newly tracked script containing a port literal must make the
# discovery-based guard red. The temporary repository mirrors git ls-files behavior.
$mutationRoot = Join-Path ([IO.Path]::GetTempPath()) ('samhan-port-guard-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $mutationRoot -Force | Out-Null
try {
    git -C $mutationRoot init --quiet
    $mutationPort = '808' + '0'
    Set-Content -LiteralPath (Join-Path $mutationRoot 'bad.ps1') -Value ('$url = "http://localhost:' + $mutationPort + '"') -Encoding UTF8
    git -C $mutationRoot add bad.ps1
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $guard -Root $mutationRoot *> $null
    $ErrorActionPreference = $previousErrorActionPreference
    Assert-True ($LASTEXITCODE -ne 0) 'port literal guard did not fail on mutation'
} finally {
    Remove-Item -LiteralPath $mutationRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host 'S7 axis regression tests passed.' -ForegroundColor Green
