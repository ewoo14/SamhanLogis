<##
.SYNOPSIS
  #1209 실 HTTP 인증 경계 검증기.

.DESCRIPTION
  mock 요청 없이 실행 중인 gateway/arologis-service에 실제 HTTP 요청을 보낸다.
  RED 단계에서는 기존 결함을 그대로 관측하고, 수정 후에는 동일 명령으로 GREEN을 확인한다.
  자격 값 자체는 출력하지 않는다.
#>
[CmdletBinding()]
param(
    [string] $GatewayBaseUrl = '',
    [string] $ArologisBaseUrl = '',
    [switch] $RequireConfiguredAttestation
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/local-stack-port.ps1')
if ([string]::IsNullOrWhiteSpace($GatewayBaseUrl)) {
    $GatewayBaseUrl = "http://localhost:$(Get-LocalStackPort -Service 'api-gateway')"
}
if ([string]::IsNullOrWhiteSpace($ArologisBaseUrl)) {
    $ArologisBaseUrl = "http://localhost:$(Get-LocalStackPort -Service 'arologis-service')"
}
$localEnvPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'infrastructure/.env.local'
if (Test-Path $localEnvPath) {
    foreach ($line in Get-Content -LiteralPath $localEnvPath -Encoding UTF8) {
        if ($line -match '^\s*(SAMHAN_GATEWAY_ATTESTATION)\s*=\s*(.*)\s*$') {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2].Trim(), 'Process')
        }
    }
}
$spoofHeaders = @{
    'X-User-Id' = '00000000-0000-0000-0000-000000000001'
    'X-User-Groups' = '00000000-0000-0000-0000-000000000100'
    'X-Is-System-Master' = 'true'
}

function Invoke-ObservedRequest {
    param(
        [Parameter(Mandatory)] [string] $Name,
        [Parameter(Mandatory)] [string] $Uri,
        [hashtable] $Headers = @{},
        [ValidateSet('Get', 'Post')] [string] $Method = 'Get',
        [string] $Body
    )
    try {
        $requestArgs = @{
            UseBasicParsing = $true
            Uri = $Uri
            Headers = $Headers
            Method = $Method
            TimeoutSec = 20
        }
        if (-not [string]::IsNullOrEmpty($Body)) {
            $requestArgs.Body = $Body
            $requestArgs.ContentType = 'application/json'
        }
        $response = Invoke-WebRequest @requestArgs
        $content = if ($response.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($response.Content) } else { [string]$response.Content }
        [pscustomobject]@{ Name = $Name; Status = [int]$response.StatusCode; Body = $content }
    } catch {
        $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 'NO_RESPONSE' }
        $content = ''
        if ($_.Exception.Response) {
            try {
                $reader = [IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
                $content = $reader.ReadToEnd()
                $reader.Dispose()
            } catch { }
        }
        [pscustomobject]@{ Name = $Name; Status = $status; Body = $content; Error = $_.Exception.Message }
    }
}

$results = @()
$results += Invoke-ObservedRequest -Name 'direct-forged-identity' -Uri "$ArologisBaseUrl/admin/arologis/permissions/my" -Headers $spoofHeaders
$mismatchedHeaders = @{} + $spoofHeaders
$mismatchedHeaders['X-Samhan-Gateway-Attestation'] = 'wrong-attestation'
$results += Invoke-ObservedRequest -Name 'direct-forged-identity-mismatched-attestation' -Uri "$ArologisBaseUrl/admin/arologis/permissions/my" -Headers $mismatchedHeaders
$results += Invoke-ObservedRequest -Name 'gateway-forged-identity-without-jwt' -Uri "$GatewayBaseUrl/admin/arologis/permissions/my" -Headers $spoofHeaders
$validAttestation = [Environment]::GetEnvironmentVariable('SAMHAN_GATEWAY_ATTESTATION')
$validHeaders = @{} + $spoofHeaders
$validHeaders['X-Samhan-Gateway-Attestation'] = $validAttestation
$results += Invoke-ObservedRequest -Name 'direct-valid-attestation-without-permission' -Uri "$ArologisBaseUrl/admin/arologis/permissions" -Headers $validHeaders
$results += Invoke-ObservedRequest -Name 'direct-public-admin-login-shape' -Uri "$ArologisBaseUrl/auth/admin/login" -Method Post -Body '{"loginId":"__invalid_for_1209__","password":"__invalid_for_1209__"}'
$results | ForEach-Object { '{0}: {1} {2} {3}' -f $_.Name, $_.Status, $_.Body, $_.Error }

$failures = @($results | Where-Object {
    ($_.Name -eq 'direct-forged-identity' -and $_.Status -ne 401) -or
    ($_.Name -eq 'direct-forged-identity-mismatched-attestation' -and $_.Status -ne 401) -or
    ($_.Name -eq 'gateway-forged-identity-without-jwt' -and $_.Status -ne 401) -or
    ($_.Name -eq 'direct-valid-attestation-without-permission' -and $_.Status -ne 403) -or
    ($_.Name -eq 'direct-public-admin-login-shape' -and $_.Status -notin @(400, 401))
})
if ($RequireConfiguredAttestation) {
    $attestation = [Environment]::GetEnvironmentVariable('SAMHAN_GATEWAY_ATTESTATION')
    if ([string]::IsNullOrWhiteSpace($attestation)) {
        throw 'SAMHAN_GATEWAY_ATTESTATION is not configured in the process environment.'
    }
}
if ($failures.Count -gt 0) {
    Write-Error ('#1209 expected statuses failed: ' + (($failures | ForEach-Object Name) -join ', '))
    exit 1
}
Write-Output '#1209 expected unauthenticated/public status checks passed.'
