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
$publishableServices = @((Get-LocalStackPortDefinitions).Keys | Where-Object { $_ -ne 'logging-service' })
Assert-True ($publishableServices.Count -eq 16) "expected 16 publishable services, got $($publishableServices.Count)"
$compose = Get-Content (Join-Path $root 'infrastructure\docker-compose.local-all.yml') -Raw -Encoding UTF8
foreach ($serviceName in $publishableServices) {
    $definition = (Get-LocalStackPortDefinitions)[$serviceName]
    $composePortDeclaration = '127.0.0.1:' + $definition.Default + ':' + $definition.ContainerPort
    Assert-True ($compose.Contains($composePortDeclaration)) "$serviceName default $($definition.Default) does not match compose declaration $composePortDeclaration"
}

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

$s7Source = Get-Content $PSCommandPath -Raw -Encoding UTF8
Assert-True ($s7Source -notmatch '(?m)^\s*\$published\w*\s*=\s*docker\s+port\b') 'S7 must not invoke docker port directly'

$oldDockerHost = [Environment]::GetEnvironmentVariable('DOCKER_HOST', 'Process')
$oldPortOverrides = @{}
foreach ($serviceName in $publishableServices) {
    $environmentName = (Get-LocalStackPortDefinitions)[$serviceName].Environment
    $oldPortOverrides[$environmentName] = [Environment]::GetEnvironmentVariable($environmentName, 'Process')
}
try {
    # RED-A: explicit override wins even when Docker publishes a different port.
    [Environment]::SetEnvironmentVariable('DOCKER_HOST', $null, 'Process')
    [Environment]::SetEnvironmentVariable('SAMHAN_AUTH_PORT', '18081', 'Process')
    $resolvedAuthPort = Get-LocalStackPort -Service 'auth-service'
    Assert-True ($resolvedAuthPort -eq 18081) 'explicit auth override must win over Docker publish port'

    # RED-B: Docker is unreachable, but every publishable service still resolves
    # to its compose default and emits an observable fallback warning.
    [Environment]::SetEnvironmentVariable('DOCKER_HOST', 'npipe:////./pipe/samhan-nonexistent-docker-engine', 'Process')
    foreach ($serviceName in $publishableServices) {
        $definition = (Get-LocalStackPortDefinitions)[$serviceName]
        [Environment]::SetEnvironmentVariable($definition.Environment, $null, 'Process')
        $warnings = @()
        $resolvedPort = Get-LocalStackPort -Service $serviceName -WarningVariable warnings
        Assert-True ($resolvedPort -eq $definition.Default) "$serviceName Dockerless fallback expected $($definition.Default), got $resolvedPort"
        Assert-True ($warnings.Count -gt 0) "$serviceName Dockerless fallback was not observable"
    }

    # RED-A: when Docker is reachable, compare all 16 resolver values with the
    # actual publish ports obtained through the resolver's safe Docker probe.
    [Environment]::SetEnvironmentVariable('DOCKER_HOST', $null, 'Process')
    $liveSlipPort = Get-RunningContainerPort -Service 'slip-service' -ContainerPort ((Get-LocalStackPortDefinitions)['slip-service'].ContainerPort)
    if ($null -ne $liveSlipPort) {
        Write-Host 'Docker available: checking 16 resolver values against publish ports.'
        foreach ($serviceName in $publishableServices) {
            $definition = (Get-LocalStackPortDefinitions)[$serviceName]
            $resolvedPort = Get-LocalStackPort -Service $serviceName
            $publishedPort = Get-RunningContainerPort -Service $serviceName -ContainerPort $definition.ContainerPort
            Assert-True ($null -ne $publishedPort) "$serviceName Docker publish port disappeared during full comparison"
            Assert-True ($resolvedPort -eq $publishedPort) "$serviceName resolver $resolvedPort does not match Docker publish $publishedPort"
        }
    } else {
        Write-Host 'Docker unavailable: live 16-service publish comparison was not run; Dockerless default/override and literal-guard checks still ran.'
    }
} finally {
    [Environment]::SetEnvironmentVariable('DOCKER_HOST', $oldDockerHost, 'Process')
    foreach ($environmentName in $oldPortOverrides.Keys) {
        [Environment]::SetEnvironmentVariable($environmentName, $oldPortOverrides[$environmentName], 'Process')
    }
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

# RED-A③: a decoy repository passed through -Root must not replace the current
# checkout under test. The guard must remain green while this checkout is clean.
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
    $mutationExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference
    Assert-True ($mutationExitCode -eq 0) 'decoy -Root changed the guard result'
    $global:LASTEXITCODE = 0
} finally {
    Remove-Item -LiteralPath $mutationRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host 'S7 axis regression tests passed.' -ForegroundColor Green
