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
Assert-True ($validation -match '\$eurekaPort\s*=\s*Resolve-') 'operational validation has no resolved Eureka port'
Assert-True ($validation -match '\$gatewayPort\s*=\s*Resolve-') 'operational validation has no resolved Gateway port'
Assert-True ($validation -match '\(\$pretendardFiles\s*\|\s*Measure-Object\)\.Count') 'Pretendard Measure-Object count missing'
Assert-True ($validation -match '\(\$s3YmlFiles\s*\|\s*Measure-Object\)\.Count') 'S3 Measure-Object count missing'
Assert-True ($validation -notmatch '@\(\$pretendardFiles\s*\|\s*Measure-Object') 'Pretendard Measure-Object was incorrectly array-wrapped'
Assert-True ($validation -notmatch '@\(\$s3YmlFiles\s*\|\s*Measure-Object') 'S3 Measure-Object was incorrectly array-wrapped'

Write-Host 'S7 axis regression tests passed.' -ForegroundColor Green
