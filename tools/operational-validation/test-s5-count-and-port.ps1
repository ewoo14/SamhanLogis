$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $PSScriptRoot 'smoke-test-helpers.ps1')
. (Join-Path $root 'scripts\lib\local-stack-port.ps1')

function Assert-Equal {
    param([object]$Actual, [object]$Expected, [string]$Message)
    if ($Actual -ne $Expected) {
        throw "$Message — expected $Expected, got $Actual"
    }
}

Assert-Equal (Get-SmokeFailureCount -Results @()) 0 '0건 pipeline 집계'
Assert-Equal (Get-SmokeFailureCount -Results @([pscustomobject]@{ Verdict = 'FAIL' })) 1 '1건 pipeline 집계'
Assert-Equal (Get-SmokeFailureCount -Results @(
        [pscustomobject]@{ Verdict = 'FAIL' }
        [pscustomobject]@{ Verdict = 'OK' }
        [pscustomobject]@{ Verdict = 'NON_200' }
    )) 2 '다건 pipeline 집계'

Assert-Equal (Resolve-LocalStackPort -EnvironmentValue '8181' -DefaultPort 8081) 8181 'auth port override'
Assert-Equal (Resolve-LocalStackPort -EnvironmentValue '' -DefaultPort 8081) 8081 'auth port default'

$importer = Get-Content (Join-Path $PSScriptRoot 'import-notion-csv.ps1') -Raw -Encoding UTF8
$seed = Get-Content (Join-Path $root 'scripts\seed-local-stack.ps1') -Raw -Encoding UTF8
if ($importer -notmatch 'Get-SmokeFailureCount') {
    throw 'Notion importer가 공통 실패 집계 helper를 사용하지 않습니다.'
}
if ($seed -match 'Wait-Http "auth-service" "http://localhost:8081/') {
    throw 'seed auth health가 SAMHAN_AUTH_PORT override를 우회합니다.'
}

Write-Output 'S5 count/port regression checks passed'
