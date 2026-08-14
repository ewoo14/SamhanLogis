[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib/local-stack-port.ps1')
. (Join-Path $PSScriptRoot 'lib/qa-credentials.ps1')

$dashboard = "http://localhost:$(Get-LocalStackPort -Service 'dashboard-service')"
$gateway = "http://localhost:$(Get-LocalStackPort -Service 'api-gateway')"
$attestation = $null
$envPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'infrastructure/.env.local'
if (Test-Path -LiteralPath $envPath) {
    foreach ($line in Get-Content -LiteralPath $envPath -Encoding UTF8) {
        if ($line -match '^\s*SAMHAN_GATEWAY_ATTESTATION\s*=\s*(.*?)\s*$') {
            $attestation = $matches[1].Trim().Trim('"').Trim("'")
        }
    }
}
function Invoke-Observed {
    param(
        [Parameter(Mandatory = $true)][string] $Name,
        [Parameter(Mandatory = $true)][string] $Uri,
        [hashtable] $Headers = @{}
    )
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -Headers $Headers -TimeoutSec 20
        [pscustomobject]@{ Name = $Name; Status = [int]$response.StatusCode; Body = [string]$response.Content }
    } catch {
        $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 'NO_RESPONSE' }
        $body = ''
        if ($_.Exception.Response) {
            try {
                $reader = [IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
                $body = $reader.ReadToEnd()
                $reader.Dispose()
            } catch { }
        }
        [pscustomobject]@{ Name = $Name; Status = $status; Body = $body }
    }
}

$spoof = @{
    'X-User-Id' = '00000000-0000-0000-0000-000000000001'
    'X-User-Groups' = '00000000-0000-0000-0000-000000000100'
    'X-Is-System-Master' = 'true'
}
$wrongAttestation = @{} + $spoof
$wrongAttestation['X-Samhan-Gateway-Attestation'] = 'wrong-attestation'
$validAttestation = @{} + $spoof
$validAttestation['X-Samhan-Gateway-Attestation'] = $attestation

$results = @(
    (Invoke-Observed 'direct-forged-identity' "$dashboard/app/releases?clientType=DESKTOP" $spoof),
    (Invoke-Observed 'direct-missing-attestation' "$dashboard/app/releases?clientType=DESKTOP" $spoof),
    (Invoke-Observed 'direct-mismatched-attestation' "$dashboard/app/releases?clientType=DESKTOP" $wrongAttestation),
    (Invoke-Observed 'direct-public-version-forged-header' "$dashboard/app/version?clientType=DESKTOP&currentVersion=0.1.0-dev" $spoof)
)

$results | ForEach-Object { '{0}: HTTP {1} {2}' -f $_.Name, $_.Status, $_.Body }

$failures = @($results | Where-Object {
    ($_.Name -in @('direct-forged-identity', 'direct-missing-attestation', 'direct-mismatched-attestation') -and $_.Status -ne 401) -or
    ($_.Name -eq 'direct-public-version-forged-header' -and $_.Status -ne 200)
})
if ($failures.Count -gt 0) {
    throw ('#1209 dashboard RED/GREEN expectations failed: ' + (($failures | ForEach-Object Name) -join ', '))
}
