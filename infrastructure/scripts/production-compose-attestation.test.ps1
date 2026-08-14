$ErrorActionPreference = 'Stop'

$composePath = Join-Path $PSScriptRoot '..\docker-compose.prod.yml'
$text = [System.IO.File]::ReadAllText((Resolve-Path $composePath), [System.Text.Encoding]::UTF8)

if ($text -notmatch '(?m)^\s*SAMHAN_GATEWAY_ATTESTATION:\s*\$\{SAMHAN_GATEWAY_ATTESTATION:-\}\s*$') {
    throw 'production compose must pass SAMHAN_GATEWAY_ATTESTATION by reference with an empty fallback'
}

if ($text -match '(?m)^\s*SAMHAN_GATEWAY_ATTESTATION:\s*(?!\$\{SAMHAN_GATEWAY_ATTESTATION)\S') {
    throw 'production compose must not contain a plaintext attestation value'
}

foreach ($serviceName in @('api-gateway', 'logging-service')) {
    $section = [regex]::Match($text, "(?ms)^  ${serviceName}:\s.*?(?=^  \S|\z)").Value
    if ($section -notmatch '(?m)^\s*SAMHAN_GATEWAY_ATTESTATION:\s*\$\{SAMHAN_GATEWAY_ATTESTATION:-\}\s*$') {
        throw "$serviceName must receive SAMHAN_GATEWAY_ATTESTATION explicitly"
    }
}

Write-Output 'PASS: production compose attestation propagation contract'
