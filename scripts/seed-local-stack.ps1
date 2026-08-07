param(
    [string]$GatewayUrl = "",
    [string]$AuthBaseUrl = "",
    [string]$AccountingBaseUrl = "",
    [switch]$SkipReimport
)

$ErrorActionPreference = "Stop"
$seedScriptRoot = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    Join-Path (Get-Location) 'scripts'
} else {
    $PSScriptRoot
}
. (Resolve-Path -LiteralPath (Join-Path $seedScriptRoot 'lib\local-stack-port.ps1'))

$gatewayPort = Get-LocalStackPort -Service 'api-gateway'
$authPort = Get-LocalStackPort -Service 'auth-service'
$accountingPort = Get-LocalStackPort -Service 'accounting-service'
if ([string]::IsNullOrWhiteSpace($GatewayUrl)) { $GatewayUrl = "http://localhost:$gatewayPort" }
if ([string]::IsNullOrWhiteSpace($AuthBaseUrl)) { $AuthBaseUrl = "$GatewayUrl/api/auth" }
if ([string]::IsNullOrWhiteSpace($AccountingBaseUrl)) { $AccountingBaseUrl = "http://localhost:$accountingPort" }
$authServiceBaseUrl = "http://localhost:$authPort"

# PowerShell 5.1 (cp949) 환경에서 한글 console 출력 보존 — [feedback_powershell_utf8_writes]
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Invoke-Json {
    param(
        [string]$Method,
        [string]$Uri,
        [object]$Body = $null,
        [hashtable]$Headers = @{}
    )
    $args = @{
        Method = $Method
        Uri = $Uri
        Headers = $Headers
        UseBasicParsing = $true
        TimeoutSec = 60
    }
    if ($null -ne $Body) {
        $args.ContentType = "application/json"
        $args.Body = ($Body | ConvertTo-Json -Depth 8)
    }
    Invoke-RestMethod @args
}

function Get-JwtClaims {
    param([Parameter(Mandatory = $true)][string]$Token)
    $parts = $Token -split '\.'
    if ($parts.Length -lt 2) { throw "JWT 형식 오류" }
    $payload = $parts[1].Replace('-', '+').Replace('_', '/')
    switch ($payload.Length % 4) {
        2 { $payload += '==' }
        3 { $payload += '=' }
    }
    $bytes = [Convert]::FromBase64String($payload)
    return ([Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json)
}

function Wait-Http {
    param([string]$Name, [string]$Url)
    $deadline = (Get-Date).AddSeconds(180)
    do {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 | Out-Null
            Write-Host "[seed] OK $Name"
            return
        } catch {
            Start-Sleep -Seconds 3
        }
    } while ((Get-Date) -lt $deadline)
    throw "[seed] TIMEOUT $Name $Url"
}

Wait-Http "gateway" "$GatewayUrl/actuator/health"
Wait-Http "auth-service" "$authServiceBaseUrl/actuator/health"
Wait-Http "accounting-service" "$AccountingBaseUrl/actuator/health"

# 자격은 환경변수로 주입 (평문 커밋 금지 — GitGuardian). 미설정 시 V5 시드 DEV 값.
$seedLoginId = if ($env:SEED_LOGIN_ID) { $env:SEED_LOGIN_ID } else { "dev_master" }
$seedLoginPw = if ($env:SEED_LOGIN_PW) { $env:SEED_LOGIN_PW } else { "" }
$masterLogin = Invoke-Json -Method "POST" -Uri "$AuthBaseUrl/login" -Body @{
    loginId = $seedLoginId
    password = $seedLoginPw
}
$token = $masterLogin.data.token
$claims = Get-JwtClaims -Token $token
$masterUserId = $claims.sub
$headers = @{
    Authorization = "Bearer $token"
    "X-User-Id" = $masterUserId
    "X-User-Groups" = [string]$claims.groups
    "X-Is-System-Master" = [string]($claims.isSystemMaster -eq $true)
}
if (-not [string]::IsNullOrWhiteSpace([string]$claims.departmentName)) {
    $headers["X-User-Department"] = [Uri]::EscapeDataString([string]$claims.departmentName)
}

$users = @(
    @{ loginId = "master@samhan.test"; password = 'Pa$$w0rd!'; displayName = "로컬 마스터"; role = "MASTER" },
    @{ loginId = "manager@samhan.test"; password = 'Pa$$w0rd!'; displayName = "로컬 관리자"; role = "MANAGER" },
    @{ loginId = "accountant@samhan.test"; password = 'Pa$$w0rd!'; displayName = "로컬 회계"; role = "ACCOUNTANT" },
    @{ loginId = "staff@samhan.test"; password = 'Pa$$w0rd!'; displayName = "로컬 현장직"; role = "STAFF" },
    @{ loginId = "driver@samhan.test"; password = 'Pa$$w0rd!'; displayName = "로컬 기사"; role = "DRIVER" }
)

foreach ($user in $users) {
    try {
        $body = @{
            loginId = $user.loginId
            password = $user.password
            displayName = $user.displayName
            role = $user.role
        }
        Invoke-Json -Method "POST" -Uri "$authServiceBaseUrl/auth/register" -Headers $headers -Body $body | Out-Null
        Write-Host "[seed] created $($user.loginId) ROLE_$($user.role)"
    } catch {
        $message = $_.Exception.Message
        if ($message -match "409|CONFLICT|이미") {
            Write-Host "[seed] exists  $($user.loginId)"
        } else {
            throw
        }
    }
}

$serviceHealth = @(
    @{ Name = 'auth-service' }, @{ Name = 'user-service' }, @{ Name = 'product-service' },
    @{ Name = 'inventory-service' }, @{ Name = 'slip-service' }, @{ Name = 'accounting-service' },
    @{ Name = 'partner-order-service' }, @{ Name = 'partner-auth-service' }, @{ Name = 'dc-config-service' },
    @{ Name = 'groupware-service' }, @{ Name = 'notification-service' }, @{ Name = 'dashboard-service' },
    @{ Name = 'partner-service' }, @{ Name = 'arologis-service' }
)
foreach ($service in $serviceHealth) {
    $port = Get-LocalStackPort -Service $service.Name
    $url = "http://localhost:$port/actuator/health"
    Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10 | Out-Null
}
Write-Host "[seed] 14 service actuator health OK — Flyway startup completed"

$loginVerifyFailures = @()
foreach ($user in $users) {
    try {
        $verifyLogin = Invoke-Json -Method "POST" -Uri "$AuthBaseUrl/login" -Body @{
            loginId = $user.loginId
            password = $user.password
        }
        if ($verifyLogin.data.token) {
            Write-Host "[seed] verified login OK: $($user.loginId) (role=$($user.role))"
        } else {
            throw "응답 token 누락"
        }
    } catch {
        $loginVerifyFailures += "$($user.loginId): $($_.Exception.Message)"
        Write-Warning "[seed] login verify FAILED for $($user.loginId) — $($_.Exception.Message)"
    }
}

# MIG-23 사이클 1e fix (Codex Correctness/Maintainability/Test MAJOR) — hard fail
# 로그인 검증 실패 1건이라도 있으면 seed 전체 비-0 exit. soft-fail (Write-Warning 만 후 complete) 차단.
if ($loginVerifyFailures.Count -gt 0) {
    Write-Error "[seed] login verify FAILED ($($loginVerifyFailures.Count)건): $($loginVerifyFailures -join '; ')"
    exit 1
}

if (-not $SkipReimport) {
    foreach ($slice in 1..11) {
        $name = "mig-$slice"
        try {
            $result = Invoke-Json -Method "POST" -Uri "$AccountingBaseUrl/admin/ecount/reimport/$name" -Headers $headers
            Write-Host "[seed] $name reimport processed=$($result.filesProcessed) skipped=$($result.filesSkipped) rejected=$($result.totalRejected)"
        } catch {
            Write-Warning "[seed] $name reimport failed: $($_.Exception.Message)"
        }
    }
}

Write-Host ""
Write-Host "Local credential seed complete"
Write-Host "  master@samhan.test     / Pa`$`$w0rd! / ROLE_MASTER"
Write-Host "  manager@samhan.test    / Pa`$`$w0rd! / ROLE_MANAGER"
Write-Host "  accountant@samhan.test / Pa`$`$w0rd! / ROLE_ACCOUNTANT"
Write-Host "  staff@samhan.test      / Pa`$`$w0rd! / ROLE_STAFF"
Write-Host "  driver@samhan.test     / Pa`$`$w0rd! / ROLE_DRIVER"
